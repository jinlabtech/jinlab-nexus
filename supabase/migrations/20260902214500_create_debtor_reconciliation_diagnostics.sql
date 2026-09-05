-- ============================================================
-- JINLAB Nexus
-- Accounting Sprint 19.3C
-- Debtor Reconciliation Diagnostics
-- ============================================================

create or replace function
public.get_debtor_reconciliation_diagnostics(
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_ar_account_id uuid;

  v_operational_total numeric(14,2) := 0;
  v_ledger_total numeric(14,2) := 0;
  v_linked_ledger_total numeric(14,2) := 0;

  v_difference numeric(14,2) := 0;
  v_unlinked_ledger numeric(14,2) := 0;

  v_problem_count bigint := 0;
  v_missing_invoice_count bigint := 0;
  v_missing_payment_count bigint := 0;

  v_rows jsonb := '[]'::jsonb;
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


  if p_as_of_date is null then
    raise exception
      'Reconciliation date is required.';
  end if;


  v_company_id :=
    public.current_settings_company_id();


  if v_company_id is null then
    raise exception
      'Your account is not linked to a company.';
  end if;


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
      'Trade Debtors posting account is not configured.';
  end if;


  -- ==========================================================
  -- TEMP DIAGNOSTIC TABLE
  -- ==========================================================

  create temporary table
  if not exists temp_nexus_debtor_reconciliation (
    invoice_id uuid,
    branch_id uuid,

    customer_id uuid,
    customer_number text,
    customer_name text,

    invoice_number text,
    invoice_date date,
    due_date date,
    invoice_status text,

    invoice_total numeric(14,2),

    payments_to_date numeric(14,2),
    operational_balance numeric(14,2),

    invoice_journal_posted boolean,

    expected_payment_count bigint,
    posted_payment_count bigint,
    missing_payment_count bigint,

    ledger_balance numeric(14,2),

    difference numeric(14,2),

    diagnostic_status text
  )
  on commit drop;


  truncate table
    temp_nexus_debtor_reconciliation;


  -- ==========================================================
  -- BUILD PER-INVOICE RECONCILIATION
  -- ==========================================================

  insert into
  temp_nexus_debtor_reconciliation (
    invoice_id,
    branch_id,

    customer_id,
    customer_number,
    customer_name,

    invoice_number,
    invoice_date,
    due_date,
    invoice_status,

    invoice_total,

    payments_to_date,
    operational_balance,

    invoice_journal_posted,

    expected_payment_count,
    posted_payment_count,
    missing_payment_count,

    ledger_balance,

    difference,

    diagnostic_status
  )

  select
    i.id,
    i.branch_id,

    c.id,
    c.customer_number,
    c.customer_name,

    i.invoice_number,
    i.invoice_date,

    coalesce(
      i.due_date,
      i.invoice_date +
        c.payment_terms_days
    )::date,

    i.status,

    round(
      i.total_amount,
      2
    ),

    round(
      coalesce(
        p.payment_total,
        0
      ),
      2
    ),

    round(
      greatest(
        i.total_amount -
          coalesce(
            p.payment_total,
            0
          ),
        0
      ),
      2
    ),

    coalesce(
      issue_posting.posted,
      false
    ),

    coalesce(
      p.payment_count,
      0
    ),

    coalesce(
      posted_payments.payment_count,
      0
    ),

    greatest(
      coalesce(
        p.payment_count,
        0
      ) -
      coalesce(
        posted_payments.payment_count,
        0
      ),
      0
    ),

    round(
      coalesce(
        invoice_ledger.ar_balance,
        0
      ),
      2
    ),

    round(
      greatest(
        i.total_amount -
          coalesce(
            p.payment_total,
            0
          ),
        0
      ) -
      coalesce(
        invoice_ledger.ar_balance,
        0
      ),
      2
    ),

    case
      when not coalesce(
        issue_posting.posted,
        false
      )
      then
        'invoice_not_posted'

      when greatest(
        coalesce(
          p.payment_count,
          0
        ) -
        coalesce(
          posted_payments.payment_count,
          0
        ),
        0
      ) > 0
      then
        'payments_not_posted'

      when abs(
        round(
          greatest(
            i.total_amount -
              coalesce(
                p.payment_total,
                0
              ),
            0
          ) -
          coalesce(
            invoice_ledger.ar_balance,
            0
          ),
          2
        )
      ) >= 0.01
      then
        'ledger_mismatch'

      else
        'reconciled'
    end

  from public.invoice i

  join public.customer c
    on c.id =
      i.customer_id
    and c.company_id =
      i.company_id


  -- ----------------------------------------------------------
  -- Actual payments recorded up to reconciliation date
  -- ----------------------------------------------------------

  left join lateral (
    select
      count(*) as
        payment_count,

      sum(
        ip.amount
      ) as
        payment_total

    from public.invoice_payment ip

    where ip.company_id =
      i.company_id

      and ip.invoice_id =
        i.id

      and ip.payment_date <=
        p_as_of_date
  ) p
    on true


  -- ----------------------------------------------------------
  -- Does the invoice have its issued journal?
  -- ----------------------------------------------------------

  left join lateral (
    select
      true as posted

    from public.journal_entry je

    where je.company_id =
      i.company_id

      and je.source_type =
        'invoice'

      and je.source_id =
        i.id

      and je.source_event =
        'issued'

      and je.status =
        'posted'

      and je.entry_date <=
        p_as_of_date

    limit 1
  ) issue_posting
    on true


  -- ----------------------------------------------------------
  -- How many individual payments reached the ledger?
  -- ----------------------------------------------------------

  left join lateral (
    select
      count(*) as
        payment_count

    from public.invoice_payment ip

    where ip.company_id =
      i.company_id

      and ip.invoice_id =
        i.id

      and ip.payment_date <=
        p_as_of_date

      and exists (
        select 1

        from public.journal_entry je

        where je.company_id =
          i.company_id

          and je.source_type =
            'invoice_payment'

          and je.source_id =
            ip.id

          and je.source_event =
            'received'

          and je.status =
            'posted'

          and je.entry_date <=
            p_as_of_date
      )
  ) posted_payments
    on true


  -- ----------------------------------------------------------
  -- Actual Trade Debtors ledger effect belonging to invoice
  --
  -- Includes:
  -- Invoice journal
  -- + every payment journal belonging to that invoice.
  -- ----------------------------------------------------------

  left join lateral (
    select
      sum(
        jl.debit -
        jl.credit
      ) as ar_balance

    from public.journal_entry je

    join public.journal_line jl
      on jl.journal_entry_id =
        je.id

    where je.company_id =
      i.company_id

      and jl.company_id =
        i.company_id

      and jl.account_id =
        v_ar_account_id

      and je.status =
        'posted'

      and je.entry_date <=
        p_as_of_date

      and (
        (
          je.source_type =
            'invoice'

          and je.source_id =
            i.id

          and je.source_event =
            'issued'
        )

        or

        (
          je.source_type =
            'invoice_payment'

          and je.source_event =
            'received'

          and exists (
            select 1

            from public.invoice_payment linked_payment

            where linked_payment.id =
              je.source_id

              and linked_payment.company_id =
                i.company_id

              and linked_payment.invoice_id =
                i.id

              and linked_payment.payment_date <=
                p_as_of_date
          )
        )
      )
  ) invoice_ledger
    on true


  where
    i.company_id =
      v_company_id

    and i.invoice_date <=
      p_as_of_date

    and i.status not in (
      'draft',
      'cancelled'
    );


  -- ==========================================================
  -- COMPANY OPERATIONAL TOTAL
  -- ==========================================================

  select
    round(
      coalesce(
        sum(
          operational_balance
        ),
        0
      ),
      2
    )
  into
    v_operational_total

  from temp_nexus_debtor_reconciliation;


  -- ==========================================================
  -- COMPANY LEDGER TOTAL
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
    v_ledger_total

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

    and je.status =
      'posted'

    and je.entry_date <=
      p_as_of_date;


  -- ==========================================================
  -- LEDGER AMOUNT LINKED TO KNOWN INVOICES
  -- ==========================================================

  select
    round(
      coalesce(
        sum(
          ledger_balance
        ),
        0
      ),
      2
    )
  into
    v_linked_ledger_total

  from temp_nexus_debtor_reconciliation;


  v_difference :=
    round(
      v_operational_total -
      v_ledger_total,
      2
    );


  v_unlinked_ledger :=
    round(
      v_ledger_total -
      v_linked_ledger_total,
      2
    );


  -- ==========================================================
  -- PROBLEM COUNTS
  -- ==========================================================

  select
    count(*) filter (
      where diagnostic_status <>
        'reconciled'
    ),

    count(*) filter (
      where diagnostic_status =
        'invoice_not_posted'
    ),

    coalesce(
      sum(
        missing_payment_count
      ),
      0
    )

  into
    v_problem_count,
    v_missing_invoice_count,
    v_missing_payment_count

  from temp_nexus_debtor_reconciliation;


  -- ==========================================================
  -- DIAGNOSTIC ROWS
  -- ==========================================================

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'invoice_id',
            d.invoice_id,

          'branch_id',
            d.branch_id,

          'customer_id',
            d.customer_id,

          'customer_number',
            d.customer_number,

          'customer_name',
            d.customer_name,

          'invoice_number',
            d.invoice_number,

          'invoice_date',
            d.invoice_date,

          'due_date',
            d.due_date,

          'invoice_status',
            d.invoice_status,

          'invoice_total',
            d.invoice_total,

          'payments_to_date',
            d.payments_to_date,

          'operational_balance',
            d.operational_balance,

          'invoice_journal_posted',
            d.invoice_journal_posted,

          'expected_payment_count',
            d.expected_payment_count,

          'posted_payment_count',
            d.posted_payment_count,

          'missing_payment_count',
            d.missing_payment_count,

          'ledger_balance',
            d.ledger_balance,

          'difference',
            d.difference,

          'diagnostic_status',
            d.diagnostic_status
        )

        order by
          case
            when d.diagnostic_status =
              'invoice_not_posted'
            then 1

            when d.diagnostic_status =
              'payments_not_posted'
            then 2

            when d.diagnostic_status =
              'ledger_mismatch'
            then 3

            else 4
          end,

          abs(
            d.difference
          ) desc,

          d.invoice_date asc
      ),
      '[]'::jsonb
    )

  into
    v_rows

  from temp_nexus_debtor_reconciliation d

  where
    d.diagnostic_status <>
      'reconciled'

    or d.operational_balance >
      0

    or abs(
      d.ledger_balance
    ) >= 0.01;


  -- ==========================================================
  -- RESULT
  -- ==========================================================

  return jsonb_build_object(
    'ok',
      true,

    'as_of_date',
      p_as_of_date,

    'summary',
      jsonb_build_object(
        'operational_debtors',
          v_operational_total,

        'ledger_debtors',
          v_ledger_total,

        'difference',
          v_difference,

        'reconciled',
          abs(
            v_difference
          ) < 0.01,

        'problem_invoice_count',
          v_problem_count,

        'missing_invoice_journal_count',
          v_missing_invoice_count,

        'missing_payment_journal_count',
          v_missing_payment_count,

        'invoice_linked_ledger_balance',
          v_linked_ledger_total,

        'unlinked_ledger_adjustment',
          v_unlinked_ledger
      ),

    'invoices',
      v_rows
  );

end;
$$;


revoke all
on function
public.get_debtor_reconciliation_diagnostics(date)
from public;

grant execute
on function
public.get_debtor_reconciliation_diagnostics(date)
to authenticated;


-- ============================================================
-- END
-- ============================================================
