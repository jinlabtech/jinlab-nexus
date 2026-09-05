-- ============================================================
-- JINLAB Nexus
-- Sprint 19.3L2
-- Sales Order Payments -> Customer Deposits
--
-- Money received BEFORE invoice:
--
-- Cash:
--   DR Cash on Hand
--      CR Customer Deposits
--
-- EFT:
--   DR Bank
--      CR Customer Deposits
--
-- Card / Other:
--   DR Payment Clearing
--      CR Customer Deposits
--
-- Revenue is NOT recognised here.
-- ============================================================


-- ============================================================
-- 1. ALLOW SALES ORDER PAYMENTS IN ACCOUNTING EXCEPTIONS
-- ============================================================

do $$
declare
  v_constraint text;
begin

  select c.conname
  into v_constraint
  from pg_constraint c
  where c.conrelid =
    'public.accounting_posting_exception'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid)
      ilike '%source_type%'
  limit 1;


  if v_constraint is not null then
    execute format(
      'alter table public.accounting_posting_exception drop constraint %I',
      v_constraint
    );
  end if;

end;
$$;


alter table
public.accounting_posting_exception
add constraint
accounting_posting_exception_source_type_check
check (
  source_type in (
    'invoice',
    'invoice_payment',
    'sales_order_payment'
  )
);


-- ============================================================
-- 2. POST SALES ORDER PAYMENT
-- ============================================================

create or replace function
public.post_sales_order_payment_to_ledger(
  p_payment_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.sales_order_payment%rowtype;

  v_order public.sales_order%rowtype;

  v_profile
    public.accounting_posting_profile%rowtype;


  v_accounting_enabled boolean :=
    false;

  v_automatic_journals boolean :=
    false;

  v_automatic_payment_posting boolean :=
    false;


  v_accounting_basis text :=
    'accrual';

  v_currency text :=
    'ZAR';


  v_receipt_account_id uuid;

  v_receipt_role text;


  v_journal_id uuid;


  v_lines jsonb :=
    '[]'::jsonb;

begin

  -- ==========================================================
  -- PAYMENT
  -- ==========================================================

  select *
  into v_payment
  from public.sales_order_payment
  where id =
    p_payment_id;


  if not found then
    raise exception
      'Sales order payment could not be found.';
  end if;


  -- ==========================================================
  -- SALES ORDER
  -- ==========================================================

  select *
  into v_order
  from public.sales_order
  where id =
    v_payment.sales_order_id

    and company_id =
      v_payment.company_id;


  if not found then
    raise exception
      'Sales order for this payment could not be found.';
  end if;


  -- ==========================================================
  -- IDEMPOTENCY
  -- ==========================================================

  select id
  into v_journal_id
  from public.journal_entry
  where company_id =
    v_payment.company_id

    and source_type =
      'sales_order_payment'

    and source_id =
      v_payment.id

    and source_event =
      'received'
  limit 1;


  if found then
    return
      v_journal_id;
  end if;


  -- ==========================================================
  -- ACCOUNTING SETTINGS
  -- ==========================================================

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


  -- ==========================================================
  -- FINANCE SETTINGS
  -- ==========================================================

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


  -- Keep behaviour aligned with current automatic engine.
  if v_accounting_basis <>
     'accrual' then

    perform
      public.record_accounting_posting_exception(
        v_payment.company_id,
        v_payment.branch_id,

        'sales_order_payment',
        v_payment.id,
        'received',

        v_payment.payment_date,

        'cash_basis_pending_engine',

        'Sales order payment was received but automatic ledger posting requires the dedicated cash-basis and VAT recognition engine.'
      );


    return null;

  end if;


  -- ==========================================================
  -- POSTING PROFILE
  -- ==========================================================

  perform
    public.ensure_accounting_posting_profile(
      v_payment.company_id
    );


  select *
  into v_profile
  from public.accounting_posting_profile
  where company_id =
    v_payment.company_id;


  if v_profile.customer_deposits_account_id
     is null then

    raise exception
      'Customer Deposits account is not configured.';

  end if;


  -- ==========================================================
  -- RECEIPT ACCOUNT
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
        'Unsupported sales order payment method: %.',
        v_payment.payment_method;

  end case;


  if v_receipt_account_id
     is null then

    raise exception
      'Receipt account is not configured for payment method %.',

      v_payment.payment_method;

  end if;


  -- ==========================================================
  -- DR RECEIPT ACCOUNT
  -- ==========================================================

  v_lines :=
    v_lines ||
    jsonb_build_array(
      jsonb_build_object(

        'account_id',
          v_receipt_account_id,

        'description',
          'Customer pre-invoice payment · ' ||
          v_order.sales_order_number,

        'debit',
          v_payment.amount,

        'credit',
          0,

        'customer_id',
          v_payment.customer_id,

        'metadata',
          jsonb_build_object(

            'sales_order_number',
              v_order.sales_order_number,

            'sales_order_id',
              v_order.id,

            'sales_order_payment_id',
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


  -- ==========================================================
  -- CR CUSTOMER DEPOSITS
  --
  -- Money received before invoice is a liability.
  -- ==========================================================

  v_lines :=
    v_lines ||
    jsonb_build_array(
      jsonb_build_object(

        'account_id',
          v_profile.customer_deposits_account_id,

        'description',
          'Customer deposit · ' ||
          v_order.sales_order_number,

        'debit',
          0,

        'credit',
          v_payment.amount,

        'customer_id',
          v_payment.customer_id,

        'metadata',
          jsonb_build_object(

            'sales_order_number',
              v_order.sales_order_number,

            'sales_order_id',
              v_order.id,

            'sales_order_payment_id',
              v_payment.id,

            'payment_method',
              v_payment.payment_method,

            'role',
              'customer_deposit'
          )
      )
    );


  -- ==========================================================
  -- CREATE + POST JOURNAL
  -- ==========================================================

  v_journal_id :=
    public.create_automatic_accounting_journal(

      v_payment.company_id,

      v_payment.branch_id,

      v_payment.payment_date,


      'Customer deposit received · ' ||
      v_order.sales_order_number,


      coalesce(
        v_payment.reference,
        v_order.sales_order_number
      ),


      'sales_order_payment',

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
public.post_sales_order_payment_to_ledger(uuid)
from public, authenticated;


-- ============================================================
-- 3. AUTOMATIC POSTING HANDLER
--
-- The operational receipt should survive if accounting
-- automation encounters a recoverable configuration problem.
-- Nexus records the problem in Accounting Exceptions.
-- ============================================================

create or replace function
public.handle_sales_order_payment_accounting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  begin

    perform
      public.post_sales_order_payment_to_ledger(
        new.id
      );


  exception
    when others then

      perform
        public.record_accounting_posting_exception(

          new.company_id,

          new.branch_id,

          'sales_order_payment',

          new.id,

          'received',

          new.payment_date,

          'automatic_posting_failed',

          sqlerrm
        );

  end;


  return new;

end;
$$;


revoke all
on function
public.handle_sales_order_payment_accounting()
from public, authenticated;


-- ============================================================
-- 4. TRIGGER
-- ============================================================

drop trigger if exists
sales_order_payment_accounting_trigger
on public.sales_order_payment;


create trigger
sales_order_payment_accounting_trigger

after insert
on public.sales_order_payment

for each row

execute function
public.handle_sales_order_payment_accounting();


-- ============================================================
-- END
-- ============================================================
