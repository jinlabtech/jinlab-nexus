-- ============================================================
-- JINLAB NEXUS
-- Sprint 23.8
-- EMP201 Compliance + Payroll Reconciliation
-- ============================================================


-- ============================================================
-- 1. MONTHLY EMP201 WORKSPACE
-- ============================================================

create or replace function public.get_payroll_emp201_workspace(
  p_month date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_month_start date;
  v_month_end date;

  v_nominal_due_date date;
  v_weekend_due_date date;

  v_settings public.payroll_employer_settings%rowtype;
  v_mapping public.payroll_accounting_mapping%rowtype;
  v_rule public.payroll_statutory_rule_set%rowtype;

  v_total_runs integer := 0;
  v_employee_count integer := 0;

  v_draft_runs integer := 0;
  v_calculated_runs integer := 0;
  v_approved_runs integer := 0;
  v_posted_runs integer := 0;
  v_paid_runs integer := 0;

  v_gross numeric := 0;
  v_taxable numeric := 0;

  v_paye numeric := 0;

  v_uif_employee numeric := 0;
  v_uif_employer numeric := 0;
  v_uif_total numeric := 0;

  v_sdl numeric := 0;

  v_emp201_total numeric := 0;

  v_accounting_paye numeric := 0;
  v_accounting_uif numeric := 0;
  v_accounting_sdl numeric := 0;

  v_diff_paye numeric := 0;
  v_diff_uif numeric := 0;
  v_diff_sdl numeric := 0;

  v_original_journal_count integer := 0;
  v_reversal_journal_count integer := 0;

  v_paye_ref_valid boolean := true;
  v_uif_ref_valid boolean := true;
  v_sdl_ref_valid boolean := true;

  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;

  v_ready boolean := false;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;


  if not public.current_user_has_permission(
    'payroll.view'
  ) then
    raise exception
      'Permission denied: payroll.view';
  end if;


  v_company_id :=
    public.current_company_id();


  -- ----------------------------------------------------------
  -- Period
  -- ----------------------------------------------------------

  v_month_start :=
    date_trunc(
      'month',
      coalesce(
        p_month,
        current_date
      )
    )::date;


  v_month_end :=
    (
      v_month_start
      + interval '1 month'
      - interval '1 day'
    )::date;


  -- EMP201 nominal due date:
  -- 7th day after month-end

  v_nominal_due_date :=
    (
      v_month_start
      + interval '1 month'
      + interval '6 days'
    )::date;


  -- Weekend adjustment only.
  -- Public-holiday confirmation remains an explicit compliance check.

  v_weekend_due_date :=
    case

      when extract(
        dow from v_nominal_due_date
      ) = 6
        then v_nominal_due_date - 1

      when extract(
        dow from v_nominal_due_date
      ) = 0
        then v_nominal_due_date - 2

      else v_nominal_due_date

    end;


  -- ----------------------------------------------------------
  -- Employer payroll configuration
  -- ----------------------------------------------------------

  select *
  into v_settings
  from public.payroll_employer_settings
  where company_id =
    v_company_id;


  if v_settings.company_id is null then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'Payroll employer settings are not configured.'
      );

  end if;


  select *
  into v_mapping
  from public.payroll_accounting_mapping
  where company_id =
    v_company_id;


  if v_mapping.company_id is null then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'Payroll accounting mappings are not configured.'
      );

  end if;


  -- ----------------------------------------------------------
  -- Statutory rule source for this month
  -- ----------------------------------------------------------

  select *
  into v_rule
  from public.payroll_statutory_rule_set
  where
    jurisdiction = 'ZA'

    and v_month_end between
      effective_from
      and effective_to

  order by effective_from desc
  limit 1;


  if v_rule.id is null then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'No South African payroll statutory rule set covers this EMP201 period.'
      );

  end if;


  -- ----------------------------------------------------------
  -- Reference-number checks
  -- SARS:
  -- PAYE reference begins with 7
  -- UIF reference begins with U
  -- SDL reference begins with L
  -- ----------------------------------------------------------

  if coalesce(
    v_settings.paye_enabled,
    false
  ) then

    v_paye_ref_valid :=
      nullif(
        btrim(
          coalesce(
            v_settings.paye_reference,
            ''
          )
        ),
        ''
      ) is not null

      and left(
        btrim(
          v_settings.paye_reference
        ),
        1
      ) = '7';


    if not v_paye_ref_valid then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'PAYE is enabled but the PAYE reference is missing or invalid.'
        );

    end if;

  end if;


  if coalesce(
    v_settings.uif_enabled,
    false
  ) then

    v_uif_ref_valid :=
      nullif(
        btrim(
          coalesce(
            v_settings.uif_reference,
            ''
          )
        ),
        ''
      ) is not null

      and upper(
        left(
          btrim(
            v_settings.uif_reference
          ),
          1
        )
      ) = 'U';


    if not v_uif_ref_valid then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'UIF is enabled but the UIF reference is missing or invalid.'
        );

    end if;

  end if;


  if coalesce(
    v_settings.sdl_enabled,
    false
  ) then

    v_sdl_ref_valid :=
      nullif(
        btrim(
          coalesce(
            v_settings.sdl_reference,
            ''
          )
        ),
        ''
      ) is not null

      and upper(
        left(
          btrim(
            v_settings.sdl_reference
          ),
          1
        )
      ) = 'L';


    if not v_sdl_ref_valid then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'SDL is enabled but the SDL reference is missing or invalid.'
        );

    end if;

  end if;


  -- ----------------------------------------------------------
  -- Pay-run status control
  -- ----------------------------------------------------------

  select

    count(*),

    count(*) filter (
      where status = 'draft'
    ),

    count(*) filter (
      where status = 'calculated'
    ),

    count(*) filter (
      where status = 'approved'
    ),

    count(*) filter (
      where status = 'posted'
    ),

    count(*) filter (
      where status = 'paid'
    )

  into
    v_total_runs,
    v_draft_runs,
    v_calculated_runs,
    v_approved_runs,
    v_posted_runs,
    v_paid_runs

  from public.payroll_pay_run r

  where
    r.company_id =
      v_company_id

    and r.payment_date between
      v_month_start
      and v_month_end

    and r.status <> 'void';


  if (
    v_draft_runs
    + v_calculated_runs
    + v_approved_runs
  ) > 0 then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'One or more payroll runs for this month are not yet posted.'
      );

  end if;


  -- ----------------------------------------------------------
  -- Payroll statutory totals
  --
  -- Only POSTED / PAID payroll is included in EMP201 values.
  -- ----------------------------------------------------------

  select

    count(
      distinct pre.employee_id
    ),

    coalesce(
      sum(
        pre.gross_remuneration
      ),
      0
    ),

    coalesce(
      sum(
        pre.taxable_remuneration
      ),
      0
    ),

    coalesce(
      sum(
        pre.paye_amount
      ),
      0
    ),

    coalesce(
      sum(
        pre.uif_employee
      ),
      0
    ),

    coalesce(
      sum(
        pre.uif_employer
      ),
      0
    ),

    coalesce(
      sum(
        pre.sdl_employer
      ),
      0
    )

  into
    v_employee_count,
    v_gross,
    v_taxable,
    v_paye,
    v_uif_employee,
    v_uif_employer,
    v_sdl

  from public.payroll_pay_run_employee pre

  join public.payroll_pay_run r
    on r.id =
       pre.pay_run_id

   and r.company_id =
       pre.company_id

  where
    pre.company_id =
      v_company_id

    and r.payment_date between
      v_month_start
      and v_month_end

    and r.status in (
      'posted',
      'paid'
    );


  v_uif_total :=
    round(
      v_uif_employee
      +
      v_uif_employer,
      2
    );


  v_emp201_total :=
    round(
      v_paye
      +
      v_uif_total
      +
      v_sdl,
      2
    );


  -- ----------------------------------------------------------
  -- Configuration consistency
  -- ----------------------------------------------------------

  if not coalesce(
    v_settings.paye_enabled,
    false
  )
  and abs(v_paye) > 0.005 then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'PAYE amounts exist although PAYE is disabled in employer settings.'
      );

  end if;


  if not coalesce(
    v_settings.uif_enabled,
    false
  )
  and abs(v_uif_total) > 0.005 then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'UIF amounts exist although UIF is disabled in employer settings.'
      );

  end if;


  if not coalesce(
    v_settings.sdl_enabled,
    false
  )
  and abs(v_sdl) > 0.005 then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'SDL amounts exist although SDL is disabled in employer settings.'
      );

  end if;


  -- ----------------------------------------------------------
  -- Accounting reconciliation
  --
  -- Original payroll journals +
  -- any posted reversals of those journals.
  --
  -- Liability movement:
  -- CREDIT - DEBIT
  -- ----------------------------------------------------------

  with original_journals as (

    select
      je.id

    from public.journal_entry je

    join public.payroll_pay_run pr
      on pr.id =
         je.source_id

     and pr.company_id =
         je.company_id

    where
      je.company_id =
        v_company_id

      and je.status =
        'posted'

      and je.source_type =
        'payroll'

      and je.source_event =
        'payroll_posting'

      and pr.payment_date between
        v_month_start
        and v_month_end

      and pr.status in (
        'posted',
        'paid'
      )

  ),

  relevant_journals as (

    select
      oj.id
    from original_journals oj

    union all

    select
      rev.id

    from public.journal_entry rev

    join original_journals oj
      on oj.id =
         rev.reversal_of_entry_id

    where
      rev.company_id =
        v_company_id

      and rev.status =
        'posted'

  )

  select

    coalesce(
      sum(
        jl.credit
        -
        jl.debit
      ) filter (
        where aa.system_key =
          'paye_payable'
      ),
      0
    ),

    coalesce(
      sum(
        jl.credit
        -
        jl.debit
      ) filter (
        where aa.system_key =
          'uif_payable'
      ),
      0
    ),

    coalesce(
      sum(
        jl.credit
        -
        jl.debit
      ) filter (
        where aa.system_key =
          'sdl_payable'
      ),
      0
    )

  into
    v_accounting_paye,
    v_accounting_uif,
    v_accounting_sdl

  from relevant_journals rj

  join public.journal_line jl
    on jl.journal_entry_id =
       rj.id

  join public.accounting_account aa
    on aa.id =
       jl.account_id

   and aa.company_id =
       v_company_id;


  select count(*)
  into v_original_journal_count
  from public.journal_entry je

  join public.payroll_pay_run pr
    on pr.id =
       je.source_id

   and pr.company_id =
       je.company_id

  where
    je.company_id =
      v_company_id

    and je.status =
      'posted'

    and je.source_type =
      'payroll'

    and je.source_event =
      'payroll_posting'

    and pr.payment_date between
      v_month_start
      and v_month_end

    and pr.status in (
      'posted',
      'paid'
    );


  select count(*)
  into v_reversal_journal_count

  from public.journal_entry rev

  where
    rev.company_id =
      v_company_id

    and rev.status =
      'posted'

    and exists (

      select 1

      from public.journal_entry original

      join public.payroll_pay_run pr
        on pr.id =
           original.source_id

       and pr.company_id =
           original.company_id

      where
        original.id =
          rev.reversal_of_entry_id

        and original.company_id =
          v_company_id

        and original.source_type =
          'payroll'

        and original.source_event =
          'payroll_posting'

        and pr.payment_date between
          v_month_start
          and v_month_end
    );


  v_diff_paye :=
    round(
      v_paye
      -
      v_accounting_paye,
      2
    );


  v_diff_uif :=
    round(
      v_uif_total
      -
      v_accounting_uif,
      2
    );


  v_diff_sdl :=
    round(
      v_sdl
      -
      v_accounting_sdl,
      2
    );


  if abs(v_diff_paye) > 0.005 then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'PAYE payroll totals do not reconcile to the accounting ledger.'
      );

  end if;


  if abs(v_diff_uif) > 0.005 then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'UIF payroll totals do not reconcile to the accounting ledger.'
      );

  end if;


  if abs(v_diff_sdl) > 0.005 then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'SDL payroll totals do not reconcile to the accounting ledger.'
      );

  end if;


  -- ----------------------------------------------------------
  -- Compliance warnings
  -- ----------------------------------------------------------

  v_warnings :=
    v_warnings ||
    jsonb_build_array(
      'Nexus does not submit EMP201 to SARS in this sprint; this workspace prepares and reconciles the declaration data.'
    );


  v_warnings :=
    v_warnings ||
    jsonb_build_array(
      'ETI is not automatically calculated in Sprint 23.8. Confirm whether ETI applies before filing EMP201.'
    );


  v_warnings :=
    v_warnings ||
    jsonb_build_array(
      'Confirm the final EMP201 due date against South African public holidays. Nexus currently performs the statutory weekend adjustment only.'
    );


  v_warnings :=
    v_warnings ||
    jsonb_build_array(
      'The SARS Payment Reference Number (PRN) comes from the SARS EMP201 process and is not generated by Nexus.'
    );


  v_ready :=
    jsonb_array_length(
      v_blockers
    ) = 0;


  -- ----------------------------------------------------------
  -- Final workspace
  -- ----------------------------------------------------------

  return jsonb_build_object(

    'ok',
      true,


    'period',
      jsonb_build_object(

        'month',
          to_char(
            v_month_start,
            'YYYY-MM'
          ),

        'period_start',
          v_month_start,

        'period_end',
          v_month_end,

        'tax_year',
          v_rule.tax_year,

        'nominal_due_date',
          v_nominal_due_date,

        'weekend_adjusted_due_date',
          v_weekend_due_date,

        'public_holiday_check_required',
          true
      ),


    'employer_registration',
      jsonb_build_object(

        'paye',
          jsonb_build_object(
            'enabled',
              coalesce(
                v_settings.paye_enabled,
                false
              ),

            'reference',
              v_settings.paye_reference,

            'reference_valid',
              v_paye_ref_valid
          ),

        'uif',
          jsonb_build_object(
            'enabled',
              coalesce(
                v_settings.uif_enabled,
                false
              ),

            'reference',
              v_settings.uif_reference,

            'reference_valid',
              v_uif_ref_valid
          ),

        'sdl',
          jsonb_build_object(
            'enabled',
              coalesce(
                v_settings.sdl_enabled,
                false
              ),

            'reference',
              v_settings.sdl_reference,

            'reference_valid',
              v_sdl_ref_valid
          )
      ),


    'payroll_control',
      jsonb_build_object(

        'total_runs',
          v_total_runs,

        'draft',
          v_draft_runs,

        'calculated',
          v_calculated_runs,

        'approved',
          v_approved_runs,

        'posted',
          v_posted_runs,

        'paid',
          v_paid_runs,

        'employees',
          v_employee_count
      ),


    'remuneration',
      jsonb_build_object(

        'gross',
          round(
            v_gross,
            2
          ),

        'taxable',
          round(
            v_taxable,
            2
          )
      ),


    'emp201',
      jsonb_build_object(

        'paye',
          round(
            v_paye,
            2
          ),

        'uif_employee',
          round(
            v_uif_employee,
            2
          ),

        'uif_employer',
          round(
            v_uif_employer,
            2
          ),

        'uif_total',
          round(
            v_uif_total,
            2
          ),

        'sdl',
          round(
            v_sdl,
            2
          ),

        'eti',
          0,

        'eti_automated',
          false,

        'total_before_eti',
          round(
            v_emp201_total,
            2
          ),

        'sars_prn',
          null
      ),


    'accounting_reconciliation',
      jsonb_build_object(

        'payroll_posting_journals',
          v_original_journal_count,

        'reversal_journals',
          v_reversal_journal_count,

        'paye',
          jsonb_build_object(
            'payroll',
              round(
                v_paye,
                2
              ),

            'ledger',
              round(
                v_accounting_paye,
                2
              ),

            'difference',
              v_diff_paye
          ),

        'uif',
          jsonb_build_object(
            'payroll',
              round(
                v_uif_total,
                2
              ),

            'ledger',
              round(
                v_accounting_uif,
                2
              ),

            'difference',
              v_diff_uif
          ),

        'sdl',
          jsonb_build_object(
            'payroll',
              round(
                v_sdl,
                2
              ),

            'ledger',
              round(
                v_accounting_sdl,
                2
              ),

            'difference',
              v_diff_sdl
          ),

        'balanced',
          abs(v_diff_paye) <= 0.005
          and abs(v_diff_uif) <= 0.005
          and abs(v_diff_sdl) <= 0.005
      ),


    'readiness',
      jsonb_build_object(

        'financial_data_ready',
          v_ready,

        'requires_sars_submission',
          true,

        'submitted_by_nexus',
          false,

        'blockers',
          v_blockers,

        'warnings',
          v_warnings
      ),


    'official_guidance',
      jsonb_build_object(

        'statutory_rule_source_title',
          v_rule.source_title,

        'statutory_rule_source_url',
          v_rule.source_url,

        'emp201_source_title',
          'SARS - Completing the Monthly Employer Declaration (EMP201)',

        'emp201_source_url',
          'https://www.sars.gov.za/types-of-tax/pay-as-you-earn/completing-the-monthly-employer-declaration-emp201/',

        'due_rule',
          'EMP201 and payment are generally due within seven days after month-end. If the seventh day falls on a weekend or public holiday, the deadline is the last business day before it.'
      )

  );

end;
$$;
-- ============================================================
-- 2. EMP201 PERIOD HISTORY
-- ============================================================

create or replace function public.get_payroll_emp201_history(
  p_months integer default 12
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_months integer;

  v_result jsonb := '[]'::jsonb;

  v_i integer;

  v_period date;
  v_workspace jsonb;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;


  if not public.current_user_has_permission(
    'payroll.view'
  ) then
    raise exception
      'Permission denied: payroll.view';
  end if;


  v_months :=
    greatest(
      1,
      least(
        coalesce(
          p_months,
          12
        ),
        36
      )
    );


  for v_i in 0..v_months - 1
  loop

    v_period :=
      (
        date_trunc(
          'month',
          current_date
        )
        -
        make_interval(
          months => v_i
        )
      )::date;


    v_workspace :=
      public.get_payroll_emp201_workspace(
        v_period
      );


    v_result :=
      v_result ||
      jsonb_build_array(
        jsonb_build_object(

          'period',
            v_workspace -> 'period',

          'payroll_control',
            v_workspace -> 'payroll_control',

          'emp201',
            v_workspace -> 'emp201',

          'accounting_reconciliation',
            v_workspace
            -> 'accounting_reconciliation',

          'readiness',
            v_workspace -> 'readiness'
        )
      );

  end loop;


  return jsonb_build_object(

    'ok',
      true,

    'months',
      v_months,

    'periods',
      v_result

  );

end;
$$;
-- ============================================================
-- 3. SECURITY
-- ============================================================

revoke all
on function public.get_payroll_emp201_workspace(date)
from public;
revoke all
on function public.get_payroll_emp201_workspace(date)
from anon;
grant execute
on function public.get_payroll_emp201_workspace(date)
to authenticated;
revoke all
on function public.get_payroll_emp201_history(integer)
from public;
revoke all
on function public.get_payroll_emp201_history(integer)
from anon;
grant execute
on function public.get_payroll_emp201_history(integer)
to authenticated;
comment on function public.get_payroll_emp201_workspace(date)
is
'Builds a South African monthly EMP201 compliance workspace from posted payroll, reconciles PAYE/UIF/SDL against posted accounting journals, validates employer registration configuration, and clearly separates Nexus preparation from SARS submission.';
comment on function public.get_payroll_emp201_history(integer)
is
'Returns monthly EMP201 preparation and reconciliation summaries for payroll compliance review.';
