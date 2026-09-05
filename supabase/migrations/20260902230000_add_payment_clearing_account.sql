-- ============================================================
-- JINLAB Nexus
-- Accounting Sprint 19.3G
-- Payment Clearing Account
-- PART 1
-- ============================================================


-- ============================================================
-- 1. PAYMENT CLEARING ACCOUNT
-- ============================================================

do $$
declare
  v_company record;
begin

  for v_company in
    select id
    from public.company
  loop

    if exists (
      select 1
      from public.accounting_account
      where company_id =
        v_company.id
        and system_key =
          'payment_clearing'
    ) then

      continue;

    end if;


    if exists (
      select 1
      from public.accounting_account
      where company_id =
        v_company.id
        and code =
          '1020'
    ) then

      raise exception
        'Account code 1020 is already in use for company %. Payment Clearing could not be created safely.',
        v_company.id;

    end if;


    insert into public.accounting_account (
      company_id,
      code,
      name,
      description,
      account_type,
      account_subtype,
      normal_balance,
      system_key,
      is_system,
      allow_manual_posting,
      is_active
    )
    values (
      v_company.id,
      '1020',
      'Payment Clearing',
      'Card, gateway and unidentified receipts awaiting settlement or bank reconciliation.',
      'asset',
      'clearing',
      'debit',
      'payment_clearing',
      true,
      false,
      true
    );

  end loop;

end;
$$;


-- ============================================================
-- 2. POSTING PROFILE COLUMN
-- ============================================================

alter table
public.accounting_posting_profile

add column if not exists
payment_clearing_account_id uuid
references public.accounting_account(id)
on delete restrict;


update public.accounting_posting_profile p
set
  payment_clearing_account_id =
    (
      select aa.id

      from public.accounting_account aa

      where aa.company_id =
        p.company_id

        and aa.system_key =
          'payment_clearing'

      limit 1
    )

where
  p.payment_clearing_account_id
    is null;


-- ============================================================
-- 3. ENSURE CLEARING ACCOUNT
-- ============================================================

create or replace function
public.ensure_payment_clearing_account(
  p_company_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
begin

  select id
  into v_account_id

  from public.accounting_account

  where company_id =
    p_company_id

    and system_key =
      'payment_clearing'

  limit 1;


  if v_account_id is not null then

    if not exists (
      select 1

      from public.accounting_account

      where id =
        v_account_id

        and company_id =
          p_company_id

        and account_type =
          'asset'

        and is_active =
          true
    ) then

      raise exception
        'Payment Clearing account is inactive or invalid.';

    end if;


    return
      v_account_id;

  end if;


  if exists (
    select 1

    from public.accounting_account

    where company_id =
      p_company_id

      and code =
        '1020'
  ) then

    raise exception
      'Account code 1020 is already being used by another account.';

  end if;


  insert into public.accounting_account (
    company_id,
    code,
    name,
    description,
    account_type,
    account_subtype,
    normal_balance,
    system_key,
    is_system,
    allow_manual_posting,
    is_active
  )
  values (
    p_company_id,
    '1020',
    'Payment Clearing',
    'Card, gateway and unidentified receipts awaiting settlement or bank reconciliation.',
    'asset',
    'clearing',
    'debit',
    'payment_clearing',
    true,
    false,
    true
  )
  returning id
  into v_account_id;


  return
    v_account_id;

end;
$$;


revoke all
on function
public.ensure_payment_clearing_account(uuid)
from public, authenticated;


-- ============================================================
-- 4. PROFILE VALIDATION
-- ============================================================

create or replace function
public.validate_accounting_posting_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
begin

  foreach v_account_id in array array[
    new.accounts_receivable_account_id,
    new.accounts_payable_account_id,

    new.sales_revenue_account_id,
    new.service_revenue_account_id,

    new.vat_output_account_id,
    new.vat_input_account_id,

    new.bank_account_id,
    new.cash_account_id,
    new.payment_clearing_account_id,

    new.inventory_account_id,
    new.cost_of_sales_account_id,

    new.customer_deposits_account_id,
    new.rounding_account_id
  ]
  loop

    if v_account_id is not null then

      if not exists (
        select 1

        from public.accounting_account aa

        where aa.id =
          v_account_id

          and aa.company_id =
            new.company_id

          and aa.is_active =
            true
      ) then

        raise exception
          'Posting profile account is invalid, inactive, or belongs to another company.';

      end if;

    end if;

  end loop;


  if new.accounts_receivable_account_id
     is not null
     and not exists (
       select 1
       from public.accounting_account
       where id =
         new.accounts_receivable_account_id
         and account_type =
           'asset'
     ) then

    raise exception
      'Accounts Receivable must be an asset account.';

  end if;


  if new.accounts_payable_account_id
     is not null
     and not exists (
       select 1
       from public.accounting_account
       where id =
         new.accounts_payable_account_id
         and account_type =
           'liability'
     ) then

    raise exception
      'Accounts Payable must be a liability account.';

  end if;


  if new.sales_revenue_account_id
     is not null
     and not exists (
       select 1
       from public.accounting_account
       where id =
         new.sales_revenue_account_id
         and account_type =
           'revenue'
     ) then

    raise exception
      'Sales Revenue must be a revenue account.';

  end if;


  if new.service_revenue_account_id
     is not null
     and not exists (
       select 1
       from public.accounting_account
       where id =
         new.service_revenue_account_id
         and account_type =
           'revenue'
     ) then

    raise exception
      'Service Revenue must be a revenue account.';

  end if;


  if new.vat_output_account_id
     is not null
     and not exists (
       select 1
       from public.accounting_account
       where id =
         new.vat_output_account_id
         and account_type =
           'liability'
     ) then

    raise exception
      'VAT Output must be a liability account.';

  end if;


  if new.vat_input_account_id
     is not null
     and not exists (
       select 1
       from public.accounting_account
       where id =
         new.vat_input_account_id
         and account_type =
           'asset'
     ) then

    raise exception
      'VAT Input must be an asset account.';

  end if;


  if new.bank_account_id
     is not null
     and not exists (
       select 1
       from public.accounting_account
       where id =
         new.bank_account_id
         and account_type =
           'asset'
     ) then

    raise exception
      'Bank must be an asset account.';

  end if;


  if new.cash_account_id
     is not null
     and not exists (
       select 1
       from public.accounting_account
       where id =
         new.cash_account_id
         and account_type =
           'asset'
     ) then

    raise exception
      'Cash must be an asset account.';

  end if;


  if new.payment_clearing_account_id
     is not null
     and not exists (
       select 1
       from public.accounting_account
       where id =
         new.payment_clearing_account_id
         and account_type =
           'asset'
     ) then

    raise exception
      'Payment Clearing must be an asset account.';

  end if;


  if new.inventory_account_id
     is not null
     and not exists (
       select 1
       from public.accounting_account
       where id =
         new.inventory_account_id
         and account_type =
           'asset'
     ) then

    raise exception
      'Inventory must be an asset account.';

  end if;


  if new.cost_of_sales_account_id
     is not null
     and not exists (
       select 1
       from public.accounting_account
       where id =
         new.cost_of_sales_account_id
         and account_type =
           'expense'
     ) then

    raise exception
      'Cost of Sales must be an expense account.';

  end if;


  return new;

end;
$$;


-- ============================================================
-- 5. ENSURE POSTING PROFILE NOW INCLUDES CLEARING
-- ============================================================

create or replace function
public.ensure_accounting_posting_profile(
  p_company_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clearing_account_id uuid;
begin

  perform
    public.ensure_default_chart_of_accounts(
      p_company_id
    );


  v_clearing_account_id :=
    public.ensure_payment_clearing_account(
      p_company_id
    );


  if exists (
    select 1

    from public.accounting_posting_profile

    where company_id =
      p_company_id
  ) then

    update public.accounting_posting_profile

    set
      payment_clearing_account_id =
        coalesce(
          payment_clearing_account_id,
          v_clearing_account_id
        )

    where company_id =
      p_company_id;


    return;

  end if;


  insert into
  public.accounting_posting_profile (
    company_id,

    accounts_receivable_account_id,
    accounts_payable_account_id,

    sales_revenue_account_id,
    service_revenue_account_id,

    vat_output_account_id,
    vat_input_account_id,

    bank_account_id,
    cash_account_id,
    payment_clearing_account_id,

    inventory_account_id,
    cost_of_sales_account_id,

    customer_deposits_account_id,
    rounding_account_id
  )

  select
    p_company_id,

    (
      select id
      from public.accounting_account
      where company_id = p_company_id
        and system_key = 'accounts_receivable'
      limit 1
    ),

    (
      select id
      from public.accounting_account
      where company_id = p_company_id
        and system_key = 'accounts_payable'
      limit 1
    ),

    (
      select id
      from public.accounting_account
      where company_id = p_company_id
        and system_key = 'sales_revenue'
      limit 1
    ),

    (
      select id
      from public.accounting_account
      where company_id = p_company_id
        and system_key = 'service_revenue'
      limit 1
    ),

    (
      select id
      from public.accounting_account
      where company_id = p_company_id
        and system_key = 'vat_output'
      limit 1
    ),

    (
      select id
      from public.accounting_account
      where company_id = p_company_id
        and system_key = 'vat_input'
      limit 1
    ),

    (
      select id
      from public.accounting_account
      where company_id = p_company_id
        and system_key = 'bank'
      limit 1
    ),

    (
      select id
      from public.accounting_account
      where company_id = p_company_id
        and system_key = 'cash_on_hand'
      limit 1
    ),

    v_clearing_account_id,

    (
      select id
      from public.accounting_account
      where company_id = p_company_id
        and system_key = 'inventory'
      limit 1
    ),

    (
      select id
      from public.accounting_account
      where company_id = p_company_id
        and system_key = 'cost_of_sales'
      limit 1
    ),

    (
      select id
      from public.accounting_account
      where company_id = p_company_id
        and system_key = 'customer_deposits'
      limit 1
    ),

    (
      select id
      from public.accounting_account
      where company_id = p_company_id
        and code = '6800'
      limit 1
    );

end;
$$;


revoke all
on function
public.ensure_accounting_posting_profile(uuid)
from public, authenticated;


-- ============================================================
-- END PART 1
-- ============================================================


-- ============================================================
-- PART 2
-- CUSTOMER PAYMENT POSTING
-- ============================================================

create or replace function
public.post_invoice_payment_to_ledger(
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

  v_profile public.accounting_posting_profile%rowtype;

  v_accounting_enabled boolean := false;
  v_automatic_journals boolean := false;
  v_automatic_payment_posting boolean := false;

  v_accounting_basis text := 'accrual';

  v_currency text := 'ZAR';

  v_receipt_account_id uuid;
  v_receipt_role text;

  v_issue_journal_id uuid;
  v_journal_id uuid;

  v_lines jsonb :=
    '[]'::jsonb;
begin

  -- ----------------------------------------------------------
  -- PAYMENT
  -- ----------------------------------------------------------

  select *
  into v_payment

  from public.invoice_payment

  where id =
    p_payment_id;


  if not found then
    raise exception
      'Invoice payment could not be found.';
  end if;


  -- ----------------------------------------------------------
  -- INVOICE
  -- ----------------------------------------------------------

  select *
  into v_invoice

  from public.invoice

  where id =
    v_payment.invoice_id

    and company_id =
      v_payment.company_id;


  if not found then
    raise exception
      'Payment invoice could not be found.';
  end if;


  -- ----------------------------------------------------------
  -- IDEMPOTENCY
  -- ----------------------------------------------------------

  select id
  into v_journal_id

  from public.journal_entry

  where company_id =
    v_payment.company_id

    and source_type =
      'invoice_payment'

    and source_id =
      v_payment.id

    and source_event =
      'received'

  limit 1;


  if found then
    return
      v_journal_id;
  end if;


  -- ----------------------------------------------------------
  -- SETTINGS
  -- ----------------------------------------------------------

  select
    accounting_enabled,
    automatic_journals,
    automatic_payment_posting

  into
    v_accounting_enabled,
    v_automatic_journals,
    v_automatic_payment_posting

  from public.company_accounting_settings

  where company_id =
    v_payment.company_id;


  if not coalesce(
       v_accounting_enabled,
       false
     )

     or not coalesce(
       v_automatic_journals,
       false
     )

     or not coalesce(
       v_automatic_payment_posting,
       false
     ) then

    return null;

  end if;


  select
    coalesce(
      accounting_basis,
      'accrual'
    ),

    coalesce(
      base_currency,
      'ZAR'
    )

  into
    v_accounting_basis,
    v_currency

  from public.company_finance_settings

  where company_id =
    v_payment.company_id;


  if v_accounting_basis <>
     'accrual' then

    perform
      public.record_accounting_posting_exception(
        v_payment.company_id,
        v_payment.branch_id,
        'invoice_payment',
        v_payment.id,
        'received',
        v_payment.payment_date,
        'cash_basis_pending_engine',
        'Payment was received but automatic ledger posting requires the dedicated cash-basis and VAT recognition engine.'
      );


    return null;

  end if;


  -- ----------------------------------------------------------
  -- INVOICE MUST ALREADY BE IN TRADE DEBTORS
  -- ----------------------------------------------------------

  select id
  into v_issue_journal_id

  from public.journal_entry

  where company_id =
    v_payment.company_id

    and source_type =
      'invoice'

    and source_id =
      v_invoice.id

    and source_event =
      'issued'

    and status =
      'posted'

  limit 1;


  if v_issue_journal_id is null then

    raise exception
      'Invoice has not yet been posted to the accounting ledger.';

  end if;


  -- ----------------------------------------------------------
  -- POSTING PROFILE
  -- ----------------------------------------------------------

  perform
    public.ensure_accounting_posting_profile(
      v_payment.company_id
    );


  select *
  into v_profile

  from public.accounting_posting_profile

  where company_id =
    v_payment.company_id;


  if v_profile.accounts_receivable_account_id
     is null then

    raise exception
      'Trade Debtors account is not configured.';

  end if;


  -- ==========================================================
  -- ACTUAL RECEIPT METHOD
  --
  -- CASH
  --   Money is physically held by company.
  --
  -- EFT
  --   Directly identifiable bank receipt.
  --
  -- CARD / OTHER
  --   Receipt exists, but bank settlement has not yet been
  --   proven through bank reconciliation.
  -- ==========================================================

  case v_payment.payment_method

    when 'cash' then

      v_receipt_account_id :=
        v_profile.cash_account_id;

      v_receipt_role :=
        'cash_on_hand';


    when 'eft' then

      v_receipt_account_id :=
        v_profile.bank_account_id;

      v_receipt_role :=
        'bank';


    when 'card' then

      v_receipt_account_id :=
        v_profile.payment_clearing_account_id;

      v_receipt_role :=
        'payment_clearing';


    when 'other' then

      v_receipt_account_id :=
        v_profile.payment_clearing_account_id;

      v_receipt_role :=
        'payment_clearing';


    else

      raise exception
        'Unsupported payment method: %.',
        v_payment.payment_method;

  end case;


  if v_receipt_account_id
     is null then

    raise exception
      'Receipt account is not configured for payment method %.',

      v_payment.payment_method;

  end if;


  -- ----------------------------------------------------------
  -- DR RECEIPT ACCOUNT
  -- ----------------------------------------------------------

  v_lines :=
    v_lines ||
    jsonb_build_array(
      jsonb_build_object(
        'account_id',
          v_receipt_account_id,

        'description',
          'Customer payment · ' ||
          v_invoice.invoice_number,

        'debit',
          v_payment.amount,

        'credit',
          0,

        'customer_id',
          v_payment.customer_id,

        'metadata',
          jsonb_build_object(
            'invoice_number',
              v_invoice.invoice_number,

            'payment_id',
              v_payment.id,

            'payment_method',
              v_payment.payment_method,

            'payment_reference',
              v_payment.reference,

            'receipt_account_role',
              v_receipt_role,

            'role',
              'receipt'
          )
      )
    );


  -- ----------------------------------------------------------
  -- CR TRADE DEBTORS
  -- ----------------------------------------------------------

  v_lines :=
    v_lines ||
    jsonb_build_array(
      jsonb_build_object(
        'account_id',
          v_profile.accounts_receivable_account_id,

        'description',
          'Settle debtor · ' ||
          v_invoice.invoice_number,

        'debit',
          0,

        'credit',
          v_payment.amount,

        'customer_id',
          v_payment.customer_id,

        'metadata',
          jsonb_build_object(
            'invoice_number',
              v_invoice.invoice_number,

            'payment_id',
              v_payment.id,

            'payment_method',
              v_payment.payment_method,

            'role',
              'accounts_receivable'
          )
      )
    );


  -- ----------------------------------------------------------
  -- CREATE + POST
  -- ----------------------------------------------------------

  v_journal_id :=
    public.create_automatic_accounting_journal(
      v_payment.company_id,
      v_payment.branch_id,
      v_payment.payment_date,

      'Payment received · ' ||
      v_invoice.invoice_number,

      coalesce(
        v_payment.reference,
        v_invoice.invoice_number
      ),

      'invoice_payment',
      v_payment.id,
      'received',

      v_currency,

      coalesce(
        v_payment.received_by,
        auth.uid()
      ),

      v_lines,

      null
    );


  return
    v_journal_id;

end;
$$;


revoke all
on function
public.post_invoice_payment_to_ledger(uuid)
from public, authenticated;


-- ============================================================
-- END
-- ============================================================
