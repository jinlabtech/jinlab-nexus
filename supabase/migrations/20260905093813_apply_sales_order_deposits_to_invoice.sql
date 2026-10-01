-- ============================================================
-- JINLAB Nexus
-- Sprint 19.3L4
-- Apply Sales Order customer deposits to issued invoices
-- without recording a second cash/bank receipt.
-- ============================================================

alter table public.invoice_payment
add column if not exists source_sales_order_payment_id uuid;

alter table public.invoice_payment
drop constraint if exists invoice_payment_source_sales_order_payment_id_fkey;

alter table public.invoice_payment
add constraint invoice_payment_source_sales_order_payment_id_fkey
foreign key (source_sales_order_payment_id)
references public.sales_order_payment(id)
on delete restrict;

alter table public.invoice_payment
drop constraint if exists invoice_payment_source_sales_order_payment_id_key;

alter table public.invoice_payment
add constraint invoice_payment_source_sales_order_payment_id_key
unique (source_sales_order_payment_id);

alter table public.invoice_payment
drop constraint if exists invoice_payment_payment_source_check;

alter table public.invoice_payment
add constraint invoice_payment_payment_source_check
check (
  payment_source in (
    'manual',
    'payment_link',
    'gateway',
    'pos',
    'sales_order_deposit'
  )
);

alter table public.invoice_payment
drop constraint if exists invoice_payment_sales_order_deposit_source_check;

alter table public.invoice_payment
add constraint invoice_payment_sales_order_deposit_source_check
check (
  (
    payment_source = 'sales_order_deposit'
    and source_sales_order_payment_id is not null
  )
  or
  (
    payment_source <> 'sales_order_deposit'
    and source_sales_order_payment_id is null
  )
);

comment on column public.invoice_payment.source_sales_order_payment_id is
  'Links an invoice settlement to the original pre-invoice Sales Order payment. The original receipt remains the cash/bank evidence; this row applies Customer Deposits to Trade Debtors.';


-- ============================================================
-- Validate Sales Order deposit applications at the database.
-- ============================================================

create or replace function public.validate_invoice_payment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_invoice public.invoice%rowtype;
  source_payment public.sales_order_payment%rowtype;
  existing_paid numeric(14,2);
begin
  select *
  into target_invoice
  from public.invoice
  where id = new.invoice_id
    and company_id = new.company_id
  for update;

  if not found then
    raise exception
      'Invoice could not be found.';
  end if;

  if target_invoice.status not in (
    'issued',
    'partially_paid',
    'overdue'
  ) then
    raise exception
      'Only issued invoices can receive payments.';
  end if;

  if target_invoice.customer_id <> new.customer_id then
    raise exception
      'Payment customer does not match invoice customer.';
  end if;

  if target_invoice.branch_id <> new.branch_id then
    raise exception
      'Payment branch does not match invoice branch.';
  end if;

  if new.payment_source = 'sales_order_deposit' then
    if new.source_sales_order_payment_id is null then
      raise exception
        'Sales Order deposit source is required.';
    end if;

    if target_invoice.sales_order_id is null then
      raise exception
        'A Sales Order deposit can only be applied to an invoice created from a Sales Order.';
    end if;

    select *
    into source_payment
    from public.sales_order_payment
    where id = new.source_sales_order_payment_id
      and company_id = new.company_id;

    if not found then
      raise exception
        'Source Sales Order payment could not be found.';
    end if;

    if source_payment.sales_order_id <> target_invoice.sales_order_id then
      raise exception
        'Sales Order deposit belongs to a different Sales Order.';
    end if;

    if source_payment.customer_id <> new.customer_id then
      raise exception
        'Sales Order deposit customer does not match invoice customer.';
    end if;

    if source_payment.branch_id <> new.branch_id then
      raise exception
        'Sales Order deposit branch does not match invoice branch.';
    end if;

    if round(source_payment.amount, 2) <> round(new.amount, 2) then
      raise exception
        'Applied Sales Order deposit amount must equal the original receipt amount.';
    end if;

    if source_payment.payment_date <> new.payment_date then
      raise exception
        'Applied Sales Order deposit must retain the original payment date.';
    end if;

    if source_payment.payment_method <> new.payment_method then
      raise exception
        'Applied Sales Order deposit must retain the original payment method.';
    end if;

  elsif new.source_sales_order_payment_id is not null then
    raise exception
      'Only Sales Order deposit payments may reference a Sales Order payment.';
  end if;

  select coalesce(sum(amount), 0)
  into existing_paid
  from public.invoice_payment
  where invoice_id = new.invoice_id
    and id is distinct from new.id;

  if existing_paid + new.amount > target_invoice.total_amount then
    raise exception
      'Payment amount exceeds the remaining invoice balance.';
  end if;

  return new;
end;
$$;


-- ============================================================
-- Make the source classification immutable too.
-- ============================================================

create or replace function public.protect_invoice_payment_financial_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.company_id is distinct from old.company_id
     or new.branch_id is distinct from old.branch_id
     or new.invoice_id is distinct from old.invoice_id
     or new.customer_id is distinct from old.customer_id
     or new.payment_date is distinct from old.payment_date
     or new.payment_method is distinct from old.payment_method
     or new.amount is distinct from old.amount
     or new.payment_source is distinct from old.payment_source
     or new.source_sales_order_payment_id is distinct from old.source_sales_order_payment_id then

    raise exception
      'Posted payment financial details are immutable. Use a reversal/refund workflow instead.';
  end if;

  return new;
end;
$$;


-- ============================================================
-- Invoice payment posting now distinguishes:
-- 1. New receipt against an invoice -> receipt account / AR
-- 2. Earlier Sales Order deposit -> Customer Deposits / AR
--
-- Both retain source_event = received for compatibility with the
-- established repair/retry/diagnostic infrastructure. The
-- payment_source and journal line metadata identify the deposit
-- application explicitly and prevent double cash recognition.
-- ============================================================

create or replace function public.post_invoice_payment_to_ledger(
  p_payment_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.invoice_payment%rowtype;
  v_invoice public.invoice%rowtype;
  v_source_payment public.sales_order_payment%rowtype;

  v_profile public.accounting_posting_profile%rowtype;

  v_accounting_enabled boolean := false;
  v_automatic_journals boolean := false;
  v_automatic_payment_posting boolean := false;

  v_accounting_basis text := 'accrual';
  v_currency text := 'ZAR';

  v_receipt_account_id uuid;
  v_receipt_role text;

  v_issue_journal_id uuid;
  v_source_receipt_journal_id uuid;
  v_journal_id uuid;

  v_entry_date date;
  v_description text;

  v_lines jsonb := '[]'::jsonb;
begin
  select *
  into v_payment
  from public.invoice_payment
  where id = p_payment_id;

  if not found then
    raise exception
      'Invoice payment could not be found.';
  end if;

  select *
  into v_invoice
  from public.invoice
  where id = v_payment.invoice_id
    and company_id = v_payment.company_id;

  if not found then
    raise exception
      'Payment invoice could not be found.';
  end if;

  select id
  into v_journal_id
  from public.journal_entry
  where company_id = v_payment.company_id
    and source_type = 'invoice_payment'
    and source_id = v_payment.id
    and source_event = 'received'
  limit 1;

  if found then
    return v_journal_id;
  end if;

  select
    accounting_enabled,
    automatic_journals,
    automatic_payment_posting
  into
    v_accounting_enabled,
    v_automatic_journals,
    v_automatic_payment_posting
  from public.company_accounting_settings
  where company_id = v_payment.company_id;

  if not coalesce(v_accounting_enabled, false)
     or not coalesce(v_automatic_journals, false)
     or not coalesce(v_automatic_payment_posting, false) then
    return null;
  end if;

  select
    coalesce(accounting_basis, 'accrual'),
    coalesce(base_currency, 'ZAR')
  into
    v_accounting_basis,
    v_currency
  from public.company_finance_settings
  where company_id = v_payment.company_id;

  if v_accounting_basis <> 'accrual' then
    perform public.record_accounting_posting_exception(
      v_payment.company_id,
      v_payment.branch_id,
      'invoice_payment',
      v_payment.id,
      'received',
      v_payment.payment_date,
      'cash_basis_pending_engine',
      'Payment was applied to the invoice but automatic ledger posting requires the dedicated cash-basis and VAT recognition engine.'
    );

    return null;
  end if;

  select id
  into v_issue_journal_id
  from public.journal_entry
  where company_id = v_payment.company_id
    and source_type = 'invoice'
    and source_id = v_invoice.id
    and source_event = 'issued'
    and status = 'posted'
  limit 1;

  if v_issue_journal_id is null then
    raise exception
      'Invoice has not yet been posted to the accounting ledger.';
  end if;

  perform public.ensure_accounting_posting_profile(
    v_payment.company_id
  );

  select *
  into v_profile
  from public.accounting_posting_profile
  where company_id = v_payment.company_id;

  if v_profile.accounts_receivable_account_id is null then
    raise exception
      'Trade Debtors account is not configured.';
  end if;

  -- ----------------------------------------------------------
  -- PRE-INVOICE SALES ORDER DEPOSIT APPLICATION
  -- ----------------------------------------------------------
  if v_payment.payment_source = 'sales_order_deposit' then
    if v_profile.customer_deposits_account_id is null then
      raise exception
        'Customer Deposits account is not configured.';
    end if;

    select *
    into v_source_payment
    from public.sales_order_payment
    where id = v_payment.source_sales_order_payment_id
      and company_id = v_payment.company_id;

    if not found then
      raise exception
        'Source Sales Order payment could not be found.';
    end if;

    if v_invoice.sales_order_id is null
       or v_source_payment.sales_order_id <> v_invoice.sales_order_id
       or v_source_payment.customer_id <> v_payment.customer_id
       or v_source_payment.branch_id <> v_payment.branch_id
       or round(v_source_payment.amount, 2) <> round(v_payment.amount, 2) then
      raise exception
        'Sales Order deposit source does not match the invoice settlement.';
    end if;

    select id
    into v_source_receipt_journal_id
    from public.journal_entry
    where company_id = v_source_payment.company_id
      and source_type = 'sales_order_payment'
      and source_id = v_source_payment.id
      and source_event = 'received'
      and status = 'posted'
    limit 1;

    if v_source_receipt_journal_id is null then
      v_source_receipt_journal_id :=
        public.post_sales_order_payment_to_ledger(
          v_source_payment.id
        );
    end if;

    if v_source_receipt_journal_id is null then
      raise exception
        'The original Sales Order deposit receipt has not been posted to the accounting ledger.';
    end if;

    v_entry_date := greatest(
      v_invoice.invoice_date,
      v_payment.payment_date
    );

    v_description :=
      'Apply customer deposit · ' ||
      v_invoice.invoice_number;

    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_id', v_profile.customer_deposits_account_id,
        'description', 'Apply customer deposit · ' || v_invoice.invoice_number,
        'debit', v_payment.amount,
        'credit', 0,
        'customer_id', v_payment.customer_id,
        'metadata', jsonb_build_object(
          'invoice_number', v_invoice.invoice_number,
          'payment_id', v_payment.id,
          'payment_source', 'sales_order_deposit',
          'sales_order_id', v_invoice.sales_order_id,
          'sales_order_payment_id', v_source_payment.id,
          'original_payment_date', v_source_payment.payment_date,
          'payment_method', v_source_payment.payment_method,
          'role', 'customer_deposit_application'
        )
      ),
      jsonb_build_object(
        'account_id', v_profile.accounts_receivable_account_id,
        'description', 'Settle debtor from deposit · ' || v_invoice.invoice_number,
        'debit', 0,
        'credit', v_payment.amount,
        'customer_id', v_payment.customer_id,
        'metadata', jsonb_build_object(
          'invoice_number', v_invoice.invoice_number,
          'payment_id', v_payment.id,
          'payment_source', 'sales_order_deposit',
          'sales_order_id', v_invoice.sales_order_id,
          'sales_order_payment_id', v_source_payment.id,
          'role', 'accounts_receivable'
        )
      )
    );

    v_journal_id := public.create_automatic_accounting_journal(
      v_payment.company_id,
      v_payment.branch_id,
      v_entry_date,
      v_description,
      coalesce(v_payment.reference, v_invoice.invoice_number),
      'invoice_payment',
      v_payment.id,
      'received',
      v_currency,
      coalesce(v_payment.received_by, auth.uid()),
      v_lines,
      null
    );

    return v_journal_id;
  end if;

  -- ----------------------------------------------------------
  -- NORMAL INVOICE RECEIPT
  -- ----------------------------------------------------------
  case v_payment.payment_method
    when 'cash' then
      v_receipt_account_id := v_profile.cash_account_id;
      v_receipt_role := 'cash_on_hand';

    when 'eft' then
      v_receipt_account_id := v_profile.bank_account_id;
      v_receipt_role := 'bank';

    when 'card' then
      v_receipt_account_id := v_profile.payment_clearing_account_id;
      v_receipt_role := 'payment_clearing';

    when 'other' then
      v_receipt_account_id := v_profile.payment_clearing_account_id;
      v_receipt_role := 'payment_clearing';

    else
      raise exception
        'Unsupported payment method: %.',
        v_payment.payment_method;
  end case;

  if v_receipt_account_id is null then
    raise exception
      'Receipt account is not configured for payment method %.',
      v_payment.payment_method;
  end if;

  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object(
      'account_id', v_receipt_account_id,
      'description', 'Customer payment · ' || v_invoice.invoice_number,
      'debit', v_payment.amount,
      'credit', 0,
      'customer_id', v_payment.customer_id,
      'metadata', jsonb_build_object(
        'invoice_number', v_invoice.invoice_number,
        'payment_id', v_payment.id,
        'payment_method', v_payment.payment_method,
        'payment_reference', v_payment.reference,
        'receipt_account_role', v_receipt_role,
        'role', 'receipt'
      )
    )
  );

  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object(
      'account_id', v_profile.accounts_receivable_account_id,
      'description', 'Settle debtor · ' || v_invoice.invoice_number,
      'debit', 0,
      'credit', v_payment.amount,
      'customer_id', v_payment.customer_id,
      'metadata', jsonb_build_object(
        'invoice_number', v_invoice.invoice_number,
        'payment_id', v_payment.id,
        'payment_method', v_payment.payment_method,
        'role', 'accounts_receivable'
      )
    )
  );

  v_journal_id := public.create_automatic_accounting_journal(
    v_payment.company_id,
    v_payment.branch_id,
    v_payment.payment_date,
    'Payment received · ' || v_invoice.invoice_number,
    coalesce(v_payment.reference, v_invoice.invoice_number),
    'invoice_payment',
    v_payment.id,
    'received',
    v_currency,
    coalesce(v_payment.received_by, auth.uid()),
    v_lines,
    null
  );

  return v_journal_id;
end;
$$;

revoke all
on function public.post_invoice_payment_to_ledger(uuid)
from public, authenticated;


-- ============================================================
-- Apply every actual Sales Order receipt to the invoice once.
-- The invoice_payment row is settlement evidence, not a second
-- bank/cash receipt. It intentionally retains the original
-- payment date, method and reference for the customer history.
-- ============================================================

create or replace function public.apply_sales_order_deposits_to_invoice(
  p_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoice%rowtype;
  v_order public.sales_order%rowtype;
  v_source_payment public.sales_order_payment%rowtype;

  v_existing_paid numeric(14,2) := 0;
  v_applied_amount numeric(14,2) := 0;
  v_applied_count integer := 0;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      'jinlab-apply-sales-order-deposits-' || p_invoice_id::text,
      0
    )
  );

  select *
  into v_invoice
  from public.invoice
  where id = p_invoice_id
  for update;

  if not found then
    raise exception
      'Invoice could not be found.';
  end if;

  if v_invoice.sales_order_id is null then
    return jsonb_build_object(
      'ok', true,
      'invoice_id', v_invoice.id,
      'applied_count', 0,
      'applied_amount', 0
    );
  end if;

  if v_invoice.status in ('draft', 'cancelled') then
    raise exception
      'Sales Order deposits can only be applied to an active issued invoice.';
  end if;

  select *
  into v_order
  from public.sales_order
  where id = v_invoice.sales_order_id
    and company_id = v_invoice.company_id;

  if not found then
    raise exception
      'Source Sales Order could not be found.';
  end if;

  if v_order.customer_id <> v_invoice.customer_id
     or v_order.branch_id <> v_invoice.branch_id then
    raise exception
      'Source Sales Order does not match the invoice customer or branch.';
  end if;

  select round(coalesce(sum(amount), 0), 2)
  into v_existing_paid
  from public.invoice_payment
  where company_id = v_invoice.company_id
    and invoice_id = v_invoice.id;

  for v_source_payment in
    select sop.*
    from public.sales_order_payment sop
    where sop.company_id = v_invoice.company_id
      and sop.sales_order_id = v_invoice.sales_order_id
      and not exists (
        select 1
        from public.invoice_payment ip
        where ip.source_sales_order_payment_id = sop.id
      )
    order by sop.payment_date, sop.created_at, sop.id
  loop
    if round(v_existing_paid + v_source_payment.amount, 2)
       > round(v_invoice.total_amount, 2) then
      raise exception
        'Applying Sales Order deposit % would exceed invoice total.',
        v_source_payment.id;
    end if;

    insert into public.invoice_payment (
      company_id,
      branch_id,
      invoice_id,
      customer_id,
      payment_date,
      payment_method,
      reference,
      amount,
      notes,
      received_by,
      payment_source,
      source_sales_order_payment_id
    )
    values (
      v_invoice.company_id,
      v_invoice.branch_id,
      v_invoice.id,
      v_invoice.customer_id,
      v_source_payment.payment_date,
      v_source_payment.payment_method,
      v_source_payment.reference,
      v_source_payment.amount,
      case
        when v_source_payment.notes is null then
          'Applied from Sales Order ' || v_order.sales_order_number || ' pre-invoice payment.'
        else
          'Applied from Sales Order ' || v_order.sales_order_number || ' pre-invoice payment. ' || v_source_payment.notes
      end,
      v_source_payment.received_by,
      'sales_order_deposit',
      v_source_payment.id
    );

    v_existing_paid := round(
      v_existing_paid + v_source_payment.amount,
      2
    );

    v_applied_amount := round(
      v_applied_amount + v_source_payment.amount,
      2
    );

    v_applied_count := v_applied_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'invoice_id', v_invoice.id,
    'sales_order_id', v_invoice.sales_order_id,
    'applied_count', v_applied_count,
    'applied_amount', v_applied_amount,
    'invoice_total', round(v_invoice.total_amount, 2),
    'settled_total', v_existing_paid,
    'balance_due', round(
      greatest(v_invoice.total_amount - v_existing_paid, 0),
      2
    )
  );
end;
$$;

revoke all
on function public.apply_sales_order_deposits_to_invoice(uuid)
from public, authenticated;


-- ============================================================
-- Issue invoice, then apply any pre-invoice Sales Order money.
-- Accounting posting errors remain recoverable via exceptions;
-- data-integrity errors in deposit application abort issuance.
-- ============================================================

create or replace function public.invoice_accounting_event_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'issued'
     and old.status is distinct from new.status then

    begin
      perform public.post_invoice_issue_to_ledger(new.id);
    exception
      when others then
        perform public.record_accounting_posting_exception(
          new.company_id,
          new.branch_id,
          'invoice',
          new.id,
          'issued',
          new.invoice_date,
          sqlstate,
          sqlerrm
        );
    end;

    if new.sales_order_id is not null then
      perform public.apply_sales_order_deposits_to_invoice(
        new.id
      );
    end if;
  end if;

  if new.status = 'cancelled'
     and old.status is distinct from new.status then
    perform public.post_invoice_cancellation_to_ledger(
      new.id
    );
  end if;

  return new;
end;
$$;


-- ============================================================
-- Exception retry now also understands Sales Order receipts.
-- Invoice deposit applications continue through the established
-- invoice_payment/received path and automatically use the new
-- posting rule above.
-- ============================================================

create or replace function public.retry_accounting_posting_exception(
  p_exception_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_exception public.accounting_posting_exception%rowtype;
  v_journal_id uuid;
begin
  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;

  if not public.current_user_has_permission(
    'accounting.journal.post'
  ) then
    raise exception
      'Permission denied: accounting.journal.post';
  end if;

  v_company_id := public.current_settings_company_id();

  select *
  into v_exception
  from public.accounting_posting_exception
  where id = p_exception_id
    and company_id = v_company_id
  for update;

  if not found then
    raise exception
      'Accounting exception could not be found.';
  end if;

  if v_exception.status = 'resolved' then
    return jsonb_build_object(
      'ok', true,
      'already_resolved', true
    );
  end if;

  if v_exception.source_type = 'invoice'
     and v_exception.source_event = 'issued' then

    v_journal_id := public.post_invoice_issue_to_ledger(
      v_exception.source_id
    );

  elsif v_exception.source_type = 'invoice_payment'
        and v_exception.source_event = 'received' then

    v_journal_id := public.post_invoice_payment_to_ledger(
      v_exception.source_id
    );

  elsif v_exception.source_type = 'sales_order_payment'
        and v_exception.source_event = 'received' then

    v_journal_id := public.post_sales_order_payment_to_ledger(
      v_exception.source_id
    );

  else
    raise exception
      'This accounting exception does not yet support automatic retry.';
  end if;

  if v_journal_id is null then
    raise exception
      'The transaction still cannot be posted. Review the company accounting settings and posting rules.';
  end if;

  update public.accounting_posting_exception
  set
    status = 'resolved',
    resolved_at = now(),
    resolved_by = auth.uid()
  where id = v_exception.id;

  return jsonb_build_object(
    'ok', true,
    'journal_id', v_journal_id,
    'exception_id', v_exception.id
  );
end;
$$;

revoke all
on function public.retry_accounting_posting_exception(uuid)
from public, authenticated;

-- ============================================================
-- END Sprint 19.3L4
-- ============================================================
;
