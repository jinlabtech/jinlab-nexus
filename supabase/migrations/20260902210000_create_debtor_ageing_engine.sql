-- ============================================================
-- JINLAB Nexus
-- Accounting Sprint 19.3A
-- Customer / Debtor Ageing Engine
-- ============================================================


-- ============================================================
-- GET DEBTOR AGEING
--
-- Operational debt is derived from:
--
--   Invoice total
--   less payments recorded up to the ageing date
--
-- This prevents the UI from maintaining its own balances.
--
-- Ageing buckets:
--
-- Current
-- 1 - 30
-- 31 - 60
-- 61 - 90
-- 90+
--
-- Due date:
--
-- Invoice due_date
-- OR
-- invoice_date + customer payment terms
--
-- ============================================================

create or replace function
public.get_debtor_ageing(
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_currency text := 'ZAR';

  v_ar_account_id uuid;

  v_total_outstanding numeric(14,2) := 0;
  v_total_overdue numeric(14,2) := 0;

  v_current numeric(14,2) := 0;
  v_days_1_30 numeric(14,2) := 0;
  v_days_31_60 numeric(14,2) := 0;
  v_days_61_90 numeric(14,2) := 0;
  v_days_90_plus numeric(14,2) := 0;

  v_ledger_debtors numeric(14,2);

  v_customer_count bigint := 0;
  v_open_invoice_count bigint := 0;
  v_overdue_invoice_count bigint := 0;

  v_customers jsonb := '[]'::jsonb;
  v_invoices jsonb := '[]'::jsonb;
begin

  -- ----------------------------------------------------------
  -- Authentication + permission
  -- ----------------------------------------------------------

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


  if p_as_of_date is null then
    raise exception
      'Ageing date is required.';
  end if;


  v_company_id :=
    public.current_settings_company_id();


  if v_company_id is null then
    raise exception
      'Your account is not linked to a company.';
  end if;


  -- ----------------------------------------------------------
  -- Currency
  -- ----------------------------------------------------------

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


  -- ----------------------------------------------------------
  -- AR posting account
  -- ----------------------------------------------------------

  select
    accounts_receivable_account_id
  into
    v_ar_account_id
  from public.accounting_posting_profile
  where company_id =
    v_company_id;


  -- ==========================================================
  -- TEMP AGEING DATA
  -- ==========================================================

  create temporary table
  if not exists temp_nexus_debtor_ageing (
    invoice_id uuid,
    branch_id uuid,

    customer_id uuid,
    customer_number text,
    customer_name text,

    customer_type text,

    credit_limit numeric(14,2),
    payment_terms_days integer,

    invoice_number text,
    invoice_date date,
    effective_due_date date,

    invoice_total numeric(14,2),
    paid_to_date numeric(14,2),
    outstanding numeric(14,2),

    days_overdue integer,

    ageing_bucket text
  )
  on commit drop;


  truncate table
    temp_nexus_debtor_ageing;


  -- ----------------------------------------------------------
  -- Build operational open debtor position
  --
  -- Paid invoices are deliberately included in the source set
  -- because an invoice that is paid today may still have had an
  -- outstanding balance on an earlier ageing date.
  --
  -- Draft and cancelled invoices never become debtors.
  -- ----------------------------------------------------------

  insert into
  temp_nexus_debtor_ageing (
    invoice_id,
    branch_id,

    customer_id,
    customer_number,
    customer_name,
    customer_type,

    credit_limit,
    payment_terms_days,

    invoice_number,
    invoice_date,
    effective_due_date,

    invoice_total,
    paid_to_date,
    outstanding,

    days_overdue,
    ageing_bucket
  )

  select
    i.id,
    i.branch_id,

    c.id,
    c.customer_number,
    c.customer_name,
    c.customer_type,

    c.credit_limit,
    c.payment_terms_days,

    i.invoice_number,
    i.invoice_date,

    coalesce(
      i.due_date,
      i.invoice_date +
        c.payment_terms_days
    )::date,

    round(
      i.total_amount,
      2
    ),

    round(
      coalesce(
        payments.paid_to_date,
        0
      ),
      2
    ),

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
    ),

    greatest(
      p_as_of_date -
      coalesce(
        i.due_date,
        i.invoice_date +
          c.payment_terms_days
      )::date,
      0
    ),

    case

      when
        coalesce(
          i.due_date,
          i.invoice_date +
            c.payment_terms_days
        )::date >=
        p_as_of_date

      then
        'current'


      when
        p_as_of_date -
        coalesce(
          i.due_date,
          i.invoice_date +
            c.payment_terms_days
        )::date
        between 1 and 30

      then
        '1_30'


      when
        p_as_of_date -
        coalesce(
          i.due_date,
          i.invoice_date +
            c.payment_terms_days
        )::date
        between 31 and 60

      then
        '31_60'


      when
        p_as_of_date -
        coalesce(
          i.due_date,
          i.invoice_date +
            c.payment_terms_days
        )::date
        between 61 and 90

      then
        '61_90'


      else
        '90_plus'

    end

  from public.invoice i

  join public.customer c
    on c.id =
      i.customer_id
    and c.company_id =
      i.company_id

  left join lateral (
    select
      sum(
        ip.amount
      ) as paid_to_date

    from public.invoice_payment ip

    where
      ip.invoice_id =
        i.id

      and ip.company_id =
        i.company_id

      and ip.payment_date <=
        p_as_of_date
  ) payments
    on true

  where
    i.company_id =
      v_company_id

    and i.invoice_date <=
      p_as_of_date

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
    ) > 0;


  -- ==========================================================
  -- COMPANY SUMMARY
  -- ==========================================================

  select
    coalesce(
      sum(
        outstanding
      ),
      0
    ),

    coalesce(
      sum(
        outstanding
      ) filter (
        where days_overdue > 0
      ),
      0
    ),

    coalesce(
      sum(
        outstanding
      ) filter (
        where ageing_bucket =
          'current'
      ),
      0
    ),

    coalesce(
      sum(
        outstanding
      ) filter (
        where ageing_bucket =
          '1_30'
      ),
      0
    ),

    coalesce(
      sum(
        outstanding
      ) filter (
        where ageing_bucket =
          '31_60'
      ),
      0
    ),

    coalesce(
      sum(
        outstanding
      ) filter (
        where ageing_bucket =
          '61_90'
      ),
      0
    ),

    coalesce(
      sum(
        outstanding
      ) filter (
        where ageing_bucket =
          '90_plus'
      ),
      0
    ),

    count(
      distinct customer_id
    ),

    count(*),

    count(*) filter (
      where days_overdue > 0
    )

  into
    v_total_outstanding,
    v_total_overdue,

    v_current,
    v_days_1_30,
    v_days_31_60,
    v_days_61_90,
    v_days_90_plus,

    v_customer_count,
    v_open_invoice_count,
    v_overdue_invoice_count

  from temp_nexus_debtor_ageing;


  -- ==========================================================
  -- LEDGER RECONCILIATION
  --
  -- DR - CR balance of configured Trade Debtors account.
  -- ==========================================================

  if v_ar_account_id is not null then

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
      v_ledger_debtors

    from public.journal_line jl

    join public.journal_entry je
      on je.id =
        jl.journal_entry_id

    where
      jl.company_id =
        v_company_id

      and jl.account_id =
        v_ar_account_id

      and je.company_id =
        v_company_id

      and je.status =
        'posted'

      and je.entry_date <=
        p_as_of_date;

  end if;


  -- ==========================================================
  -- CUSTOMER SUMMARY
  -- ==========================================================

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'customer_id',
            x.customer_id,

          'customer_number',
            x.customer_number,

          'customer_name',
            x.customer_name,

          'customer_type',
            x.customer_type,

          'credit_limit',
            x.credit_limit,

          'payment_terms_days',
            x.payment_terms_days,

          'outstanding',
            x.outstanding,

          'overdue',
            x.overdue,

          'current',
            x.current_amount,

          'days_1_30',
            x.days_1_30,

          'days_31_60',
            x.days_31_60,

          'days_61_90',
            x.days_61_90,

          'days_90_plus',
            x.days_90_plus,

          'open_invoice_count',
            x.open_invoice_count,

          'overdue_invoice_count',
            x.overdue_invoice_count,

          'oldest_due_date',
            x.oldest_due_date,

          'credit_available',
            greatest(
              x.credit_limit -
              x.outstanding,
              0
            ),

          'credit_limit_exceeded',
            (
              x.credit_limit > 0
              and
              x.outstanding >
              x.credit_limit
            )
        )

        order by
          x.outstanding desc,
          x.customer_name asc
      ),
      '[]'::jsonb
    )

  into
    v_customers

  from (
    select
      customer_id,
      customer_number,
      customer_name,
      customer_type,

      max(
        credit_limit
      ) as credit_limit,

      max(
        payment_terms_days
      ) as payment_terms_days,

      round(
        sum(
          outstanding
        ),
        2
      ) as outstanding,

      round(
        sum(
          outstanding
        ) filter (
          where days_overdue > 0
        ),
        2
      ) as overdue,

      round(
        coalesce(
          sum(
            outstanding
          ) filter (
            where ageing_bucket =
              'current'
          ),
          0
        ),
        2
      ) as current_amount,

      round(
        coalesce(
          sum(
            outstanding
          ) filter (
            where ageing_bucket =
              '1_30'
          ),
          0
        ),
        2
      ) as days_1_30,

      round(
        coalesce(
          sum(
            outstanding
          ) filter (
            where ageing_bucket =
              '31_60'
          ),
          0
        ),
        2
      ) as days_31_60,

      round(
        coalesce(
          sum(
            outstanding
          ) filter (
            where ageing_bucket =
              '61_90'
          ),
          0
        ),
        2
      ) as days_61_90,

      round(
        coalesce(
          sum(
            outstanding
          ) filter (
            where ageing_bucket =
              '90_plus'
          ),
          0
        ),
        2
      ) as days_90_plus,

      count(*) as
        open_invoice_count,

      count(*) filter (
        where days_overdue > 0
      ) as
        overdue_invoice_count,

      min(
        effective_due_date
      ) as
        oldest_due_date

    from temp_nexus_debtor_ageing

    group by
      customer_id,
      customer_number,
      customer_name,
      customer_type
  ) x;


  -- ==========================================================
  -- OPEN INVOICE DETAIL
  -- ==========================================================

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'invoice_id',
            invoice_id,

          'branch_id',
            branch_id,

          'customer_id',
            customer_id,

          'customer_number',
            customer_number,

          'customer_name',
            customer_name,

          'invoice_number',
            invoice_number,

          'invoice_date',
            invoice_date,

          'due_date',
            effective_due_date,

          'invoice_total',
            invoice_total,

          'paid_to_date',
            paid_to_date,

          'outstanding',
            outstanding,

          'days_overdue',
            days_overdue,

          'ageing_bucket',
            ageing_bucket
        )

        order by
          effective_due_date asc,
          invoice_date asc
      ),
      '[]'::jsonb
    )

  into
    v_invoices

  from temp_nexus_debtor_ageing;


  -- ==========================================================
  -- RESULT
  -- ==========================================================

  return jsonb_build_object(
    'ok',
      true,

    'as_of_date',
      p_as_of_date,

    'currency',
      v_currency,

    'summary',
      jsonb_build_object(
        'total_outstanding',
          round(
            v_total_outstanding,
            2
          ),

        'total_overdue',
          round(
            v_total_overdue,
            2
          ),

        'current',
          round(
            v_current,
            2
          ),

        'days_1_30',
          round(
            v_days_1_30,
            2
          ),

        'days_31_60',
          round(
            v_days_31_60,
            2
          ),

        'days_61_90',
          round(
            v_days_61_90,
            2
          ),

        'days_90_plus',
          round(
            v_days_90_plus,
            2
          ),

        'customer_count',
          v_customer_count,

        'open_invoice_count',
          v_open_invoice_count,

        'overdue_invoice_count',
          v_overdue_invoice_count,

        'ledger_debtors_balance',
          v_ledger_debtors,

        'reconciliation_difference',
          case
            when v_ledger_debtors is null
            then null
            else round(
              v_total_outstanding -
              v_ledger_debtors,
              2
            )
          end,

        'reconciled',
          case
            when v_ledger_debtors is null
            then false
            else
              abs(
                round(
                  v_total_outstanding -
                  v_ledger_debtors,
                  2
                )
              ) < 0.01
          end
      ),

    'customers',
      v_customers,

    'invoices',
      v_invoices
  );

end;
$$;


revoke all
on function
public.get_debtor_ageing(date)
from public;

grant execute
on function
public.get_debtor_ageing(date)
to authenticated;


-- ============================================================
-- END
-- ============================================================
