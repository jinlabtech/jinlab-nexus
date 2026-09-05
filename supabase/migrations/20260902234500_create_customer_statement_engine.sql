-- ============================================================
-- JINLAB Nexus
-- Accounting Sprint 19.3H
-- Customer Statement & Debtor Drill-down
-- ============================================================


create or replace function
public.get_customer_account_statement(
  p_customer_id uuid,
  p_start_date date default null,
  p_end_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_customer public.customer%rowtype;

  v_start_date date;
  v_end_date date;

  v_currency text := 'ZAR';

  v_ar_account_id uuid;

  v_opening_balance numeric(14,2) := 0;

  v_period_debits numeric(14,2) := 0;
  v_period_credits numeric(14,2) := 0;

  v_closing_balance numeric(14,2) := 0;

  v_operational_balance numeric(14,2) := 0;

  v_difference numeric(14,2) := 0;

  v_transactions jsonb :=
    '[]'::jsonb;

  v_open_invoices jsonb :=
    '[]'::jsonb;

  v_payment_history jsonb :=
    '[]'::jsonb;
begin

  -- ==========================================================
  -- SECURITY
  -- ==========================================================

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;


  if not public.current_user_has_permission(
    'accounting.view'
  ) then
    raise exception
      'Permission denied: accounting.view';
  end if;


  v_company_id :=
    public.current_settings_company_id();


  if v_company_id is null then
    raise exception
      'Your account is not linked to a company.';
  end if;


  -- ==========================================================
  -- DATE RANGE
  -- ==========================================================

  v_end_date :=
    coalesce(
      p_end_date,
      current_date
    );


  v_start_date :=
    coalesce(
      p_start_date,
      (
        v_end_date -
        interval '90 days'
      )::date
    );


  if v_start_date >
     v_end_date then

    raise exception
      'Statement start date cannot be after end date.';

  end if;


  -- ==========================================================
  -- CUSTOMER
  -- ==========================================================

  select *
  into v_customer

  from public.customer

  where id =
    p_customer_id

    and company_id =
      v_company_id;


  if not found then
    raise exception
      'Customer could not be found.';
  end if;


  -- ==========================================================
  -- CURRENCY
  -- ==========================================================

  select
    coalesce(
      base_currency,
      'ZAR'
    )

  into
    v_currency

  from public.company_finance_settings

  where company_id =
    v_company_id;


  -- ==========================================================
  -- TRADE DEBTORS CONTROL ACCOUNT
  -- ==========================================================

  select
    accounts_receivable_account_id

  into
    v_ar_account_id

  from public.accounting_posting_profile

  where company_id =
    v_company_id;


  if v_ar_account_id is null then
    raise exception
      'Trade Debtors account is not configured.';
  end if;


  -- ==========================================================
  -- OPENING BALANCE
  --
  -- Ledger balance immediately before statement start date.
  -- ==========================================================

  select
    round(
      coalesce(
        sum(
          jl.debit -
          jl.credit
        ),
        0
      ),
      2
    )

  into
    v_opening_balance

  from public.journal_line jl

  join public.journal_entry je
    on je.id =
      jl.journal_entry_id

  where
    jl.company_id =
      v_company_id

    and je.company_id =
      v_company_id

    and jl.account_id =
      v_ar_account_id

    and jl.customer_id =
      p_customer_id

    and je.status =
      'posted'

    and je.entry_date <
      v_start_date;


  -- ==========================================================
  -- PERIOD TOTALS
  -- ==========================================================

  select
    round(
      coalesce(
        sum(
          jl.debit
        ),
        0
      ),
      2
    ),

    round(
      coalesce(
        sum(
          jl.credit
        ),
        0
      ),
      2
    )

  into
    v_period_debits,
    v_period_credits

  from public.journal_line jl

  join public.journal_entry je
    on je.id =
      jl.journal_entry_id

  where
    jl.company_id =
      v_company_id

    and je.company_id =
      v_company_id

    and jl.account_id =
      v_ar_account_id

    and jl.customer_id =
      p_customer_id

    and je.status =
      'posted'

    and je.entry_date between
      v_start_date
      and v_end_date;


  v_closing_balance :=
    round(
      v_opening_balance +
      v_period_debits -
      v_period_credits,
      2
    );


  -- ==========================================================
  -- TRANSACTION REGISTER WITH RUNNING BALANCE
  -- ==========================================================

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'journal_id',
            x.journal_id,

          'entry_number',
            x.entry_number,

          'entry_date',
            x.entry_date,

          'source_type',
            x.source_type,

          'source_id',
            x.source_id,

          'source_event',
            x.source_event,

          'reference',
            x.reference,

          'description',
            x.description,

          'invoice_id',
            x.invoice_id,

          'invoice_number',
            x.invoice_number,

          'payment_id',
            x.payment_id,

          'payment_method',
            x.payment_method,

          'payment_reference',
            x.payment_reference,

          'debit',
            x.debit,

          'credit',
            x.credit,

          'running_balance',
            x.running_balance
        )

        order by
          x.entry_date,
          x.entry_number,
          x.line_number
      ),
      '[]'::jsonb
    )

  into
    v_transactions

  from (
    select
      je.id as
        journal_id,

      je.entry_number,
      je.entry_date,

      je.source_type,
      je.source_id,
      je.source_event,

      je.reference,

      coalesce(
        jl.description,
        je.description
      ) as
        description,

      jl.line_number,

      case
        when je.source_type =
          'invoice'
        then
          i.id

        when je.source_type =
          'invoice_payment'
        then
          payment_invoice.id

        else
          null
      end as
        invoice_id,

      case
        when je.source_type =
          'invoice'
        then
          i.invoice_number

        when je.source_type =
          'invoice_payment'
        then
          payment_invoice.invoice_number

        else
          null
      end as
        invoice_number,

      case
        when je.source_type =
          'invoice_payment'
        then
          ip.id

        else
          null
      end as
        payment_id,

      ip.payment_method,

      ip.reference as
        payment_reference,

      round(
        jl.debit,
        2
      ) as
        debit,

      round(
        jl.credit,
        2
      ) as
        credit,

      round(
        v_opening_balance +

        sum(
          jl.debit -
          jl.credit
        ) over (
          order by
            je.entry_date,
            je.entry_number,
            jl.line_number

          rows between
            unbounded preceding
            and current row
        ),
        2
      ) as
        running_balance

    from public.journal_line jl

    join public.journal_entry je
      on je.id =
        jl.journal_entry_id

    left join public.invoice i
      on je.source_type =
        'invoice'

      and i.id =
        je.source_id

      and i.company_id =
        v_company_id

    left join public.invoice_payment ip
      on je.source_type =
        'invoice_payment'

      and ip.id =
        je.source_id

      and ip.company_id =
        v_company_id

    left join public.invoice payment_invoice
      on payment_invoice.id =
        ip.invoice_id

      and payment_invoice.company_id =
        v_company_id

    where
      jl.company_id =
        v_company_id

      and je.company_id =
        v_company_id

      and jl.account_id =
        v_ar_account_id

      and jl.customer_id =
        p_customer_id

      and je.status =
        'posted'

      and je.entry_date between
        v_start_date
        and v_end_date
  ) x;


  -- ==========================================================
  -- OPERATIONAL BALANCE AS OF END DATE
  --
  -- Independent comparison against invoices/payments.
  -- ==========================================================

  select
    round(
      coalesce(
        sum(
          greatest(
            i.total_amount -
            coalesce(
              payments.paid_to_date,
              0
            ),
            0
          )
        ),
        0
      ),
      2
    )

  into
    v_operational_balance

  from public.invoice i

  left join lateral (
    select
      sum(
        ip.amount
      ) as
        paid_to_date

    from public.invoice_payment ip

    where
      ip.company_id =
        i.company_id

      and ip.invoice_id =
        i.id

      and ip.payment_date <=
        v_end_date
  ) payments
    on true

  where
    i.company_id =
      v_company_id

    and i.customer_id =
      p_customer_id

    and i.invoice_date <=
      v_end_date

    and i.status not in (
      'draft',
      'cancelled'
    );


  v_difference :=
    round(
      v_operational_balance -
      v_closing_balance,
      2
    );


  -- ==========================================================
  -- OUTSTANDING INVOICES AS OF END DATE
  -- ==========================================================

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'invoice_id',
            x.invoice_id,

          'invoice_number',
            x.invoice_number,

          'invoice_date',
            x.invoice_date,

          'due_date',
            x.due_date,

          'invoice_total',
            x.invoice_total,

          'paid_to_date',
            x.paid_to_date,

          'outstanding',
            x.outstanding,

          'days_overdue',
            x.days_overdue
        )

        order by
          x.due_date asc,
          x.invoice_date asc
      ),
      '[]'::jsonb
    )

  into
    v_open_invoices

  from (
    select
      i.id as
        invoice_id,

      i.invoice_number,
      i.invoice_date,

      coalesce(
        i.due_date,
        i.invoice_date +
          v_customer.payment_terms_days
      )::date as
        due_date,

      round(
        i.total_amount,
        2
      ) as
        invoice_total,

      round(
        coalesce(
          payments.paid_to_date,
          0
        ),
        2
      ) as
        paid_to_date,

      round(
        greatest(
          i.total_amount -
          coalesce(
            payments.paid_to_date,
            0
          ),
          0
        ),
        2
      ) as
        outstanding,

      greatest(
        v_end_date -
        coalesce(
          i.due_date,
          i.invoice_date +
            v_customer.payment_terms_days
        )::date,
        0
      ) as
        days_overdue

    from public.invoice i

    left join lateral (
      select
        sum(
          ip.amount
        ) as
          paid_to_date

      from public.invoice_payment ip

      where
        ip.company_id =
          i.company_id

        and ip.invoice_id =
          i.id

        and ip.payment_date <=
          v_end_date
    ) payments
      on true

    where
      i.company_id =
        v_company_id

      and i.customer_id =
        p_customer_id

      and i.invoice_date <=
        v_end_date

      and i.status not in (
        'draft',
        'cancelled'
      )

      and greatest(
        i.total_amount -
          coalesce(
            payments.paid_to_date,
            0
          ),
        0
      ) > 0
  ) x;


  -- ==========================================================
  -- ACTUAL PAYMENT HISTORY
  --
  -- This is not the payment schedule.
  -- ==========================================================

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'payment_id',
            ip.id,

          'invoice_id',
            i.id,

          'invoice_number',
            i.invoice_number,

          'payment_date',
            ip.payment_date,

          'payment_method',
            ip.payment_method,

          'reference',
            ip.reference,

          'amount',
            ip.amount
        )

        order by
          ip.payment_date desc,
          ip.created_at desc
      ),
      '[]'::jsonb
    )

  into
    v_payment_history

  from public.invoice_payment ip

  join public.invoice i
    on i.id =
      ip.invoice_id

    and i.company_id =
      ip.company_id

  where
    ip.company_id =
      v_company_id

    and ip.customer_id =
      p_customer_id

    and ip.payment_date <=
      v_end_date;


  -- ==========================================================
  -- RESULT
  -- ==========================================================

  return jsonb_build_object(
    'ok',
      true,

    'customer',
      jsonb_build_object(
        'id',
          v_customer.id,

        'customer_number',
          v_customer.customer_number,

        'customer_name',
          v_customer.customer_name,

        'customer_type',
          v_customer.customer_type,

        'contact_person',
          v_customer.contact_person,

        'email',
          v_customer.email,

        'phone',
          v_customer.phone,

        'address_line_1',
          v_customer.address_line_1,

        'address_line_2',
          v_customer.address_line_2,

        'city',
          v_customer.city,

        'province',
          v_customer.province,

        'postal_code',
          v_customer.postal_code,

        'country',
          v_customer.country,

        'credit_limit',
          v_customer.credit_limit,

        'payment_terms_days',
          v_customer.payment_terms_days
      ),

    'currency',
      v_currency,

    'start_date',
      v_start_date,

    'end_date',
      v_end_date,

    'summary',
      jsonb_build_object(
        'opening_balance',
          v_opening_balance,

        'period_debits',
          v_period_debits,

        'period_credits',
          v_period_credits,

        'closing_balance',
          v_closing_balance,

        'operational_balance',
          v_operational_balance,

        'difference',
          v_difference,

        'reconciled',
          abs(
            v_difference
          ) < 0.01
      ),

    'transactions',
      v_transactions,

    'open_invoices',
      v_open_invoices,

    'payments',
      v_payment_history
  );

end;
$$;


revoke all
on function
public.get_customer_account_statement(
  uuid,
  date,
  date
)
from public;

grant execute
on function
public.get_customer_account_statement(
  uuid,
  date,
  date
)
to authenticated;


-- ============================================================
-- END
-- ============================================================
