-- ============================================================
-- JINLAB NEXUS
-- Sprint 23.13
-- SARS IRP5 / IT3(a) Source-Code + BRS Mapping Engine
-- BRS baseline: PAYE Employer Reconciliation v25.3.0
-- ============================================================


-- ============================================================
-- 1. SARS SOURCE-CODE CATALOG
-- ============================================================

create table if not exists public.payroll_sars_source_code (
  id uuid primary key default gen_random_uuid(),

  jurisdiction text not null default 'ZA',

  brs_version text not null,

  tax_year_from integer not null,
  tax_year_to integer,

  source_code text not null,

  code_group text not null
    check (
      code_group in (
        'income',
        'gross',
        'deduction',
        'tax',
        'contribution',
        'reason',
        'information'
      )
    ),

  description text not null,

  amount_rule text not null
    check (
      amount_rule in (
        'whole_rand_floor',
        'money_2dp',
        'code_value'
      )
    ),

  is_derived boolean not null default false,

  official_source_url text,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),

  unique (
    jurisdiction,
    brs_version,
    source_code
  )
);
revoke all
on table public.payroll_sars_source_code
from anon;
revoke all
on table public.payroll_sars_source_code
from authenticated;
-- ============================================================
-- 2. VERIFIED SARS CODES USED BY CURRENT NEXUS PAYROLL
-- ============================================================

insert into public.payroll_sars_source_code (
  jurisdiction,
  brs_version,
  tax_year_from,
  tax_year_to,
  source_code,
  code_group,
  description,
  amount_rule,
  is_derived,
  official_source_url
)
values

(
  'ZA',
  '25.3.0',
  2025,
  null,
  '3601',
  'income',
  'Income subject to PAYE - salary/wages and ordinary remuneration',
  'whole_rand_floor',
  false,
  'https://www.sars.gov.za/guide-for-codes-applicable-to-employees-tax-certificates-2026/'
),

(
  'ZA',
  '25.3.0',
  2025,
  null,
  '3605',
  'income',
  'Annual payment subject to PAYE - annual/incentive bonus and similar annual payments',
  'whole_rand_floor',
  false,
  'https://www.sars.gov.za/guide-for-codes-applicable-to-employees-tax-certificates-2026/'
),

(
  'ZA',
  '25.3.0',
  2025,
  null,
  '3606',
  'income',
  'Commission subject to PAYE',
  'whole_rand_floor',
  false,
  'https://www.sars.gov.za/guide-for-codes-applicable-to-employees-tax-certificates-2026/'
),

(
  'ZA',
  '25.3.0',
  2025,
  null,
  '3607',
  'income',
  'Overtime subject to PAYE',
  'whole_rand_floor',
  false,
  'https://www.sars.gov.za/guide-for-codes-applicable-to-employees-tax-certificates-2026/'
),

(
  'ZA',
  '25.3.0',
  2025,
  null,
  '3699',
  'gross',
  'Gross employment income - taxable',
  'whole_rand_floor',
  true,
  'https://www.sars.gov.za/guide-for-codes-applicable-to-employees-tax-certificates-2026/'
),

(
  'ZA',
  '25.3.0',
  2025,
  null,
  '4102',
  'tax',
  'PAYE',
  'money_2dp',
  true,
  'https://www.sars.gov.za/types-of-tax/pay-as-you-earn/reconciliations/'
),

(
  'ZA',
  '25.3.0',
  2025,
  null,
  '4141',
  'contribution',
  'Employee and employer UIF contribution',
  'money_2dp',
  true,
  'https://www.sars.gov.za/types-of-tax/pay-as-you-earn/reconciliations/'
),

(
  'ZA',
  '25.3.0',
  2025,
  null,
  '4142',
  'contribution',
  'Employer SDL contribution',
  'money_2dp',
  true,
  'https://www.sars.gov.za/types-of-tax/pay-as-you-earn/reconciliations/'
),

(
  'ZA',
  '25.3.0',
  2025,
  null,
  '4149',
  'contribution',
  'Total Tax, SDL and UIF',
  'money_2dp',
  true,
  'https://www.sars.gov.za/types-of-tax/pay-as-you-earn/reconciliations/'
),

(
  'ZA',
  '25.3.0',
  2025,
  null,
  '4150',
  'reason',
  'Reason for non-deduction of employees tax - IT3(a)',
  'code_value',
  true,
  'https://www.sars.gov.za/types-of-tax/pay-as-you-earn/reconciliations/'
)

on conflict (
  jurisdiction,
  brs_version,
  source_code
)
do update
set
  description =
    excluded.description,

  amount_rule =
    excluded.amount_rule,

  official_source_url =
    excluded.official_source_url,

  is_active =
    true;
-- ============================================================
-- 3. NEXUS COMPONENT -> SARS SOURCE-CODE MAPPING
-- ============================================================

create table if not exists public.payroll_sars_component_mapping (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  tax_year integer not null,

  brs_version text not null,

  component_code text not null,

  source_code text not null,

  mapping_type text not null default 'direct'
    check (
      mapping_type in (
        'direct',
        'derived',
        'manual_review'
      )
    ),

  verification_status text not null default 'verified'
    check (
      verification_status in (
        'verified',
        'requires_review'
      )
    ),

  notes text,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  unique (
    company_id,
    tax_year,
    component_code
  )
);
alter table public.payroll_sars_component_mapping
enable row level security;
revoke all
on table public.payroll_sars_component_mapping
from anon;
revoke all
on table public.payroll_sars_component_mapping
from authenticated;
-- ============================================================
-- 4. ENSURE VERIFIED DEFAULT MAPPINGS
-- ============================================================

create or replace function public.ensure_payroll_sars_source_defaults(
  p_company_id uuid,
  p_tax_year integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin

  if p_company_id is null then
    raise exception
      'Company is required.';
  end if;


  if p_tax_year < 2025 then
    raise exception
      'This SARS source-code baseline supports tax years from 2025 onward.';
  end if;


  insert into public.payroll_sars_component_mapping (
    company_id,
    tax_year,
    brs_version,
    component_code,
    source_code,
    mapping_type,
    verification_status,
    notes
  )

  select
    d.company_id,
    p_tax_year,
    '25.3.0',
    d.code,
    x.source_code,
    'direct',
    'verified',
    x.notes

  from public.payroll_component_definition d

  join (
    values

      (
        'BASIC',
        '3601',
        'Verified ordinary salary/wage mapping.'
      ),

      (
        'BONUS',
        '3605',
        'Verified annual/incentive bonus mapping.'
      ),

      (
        'COMMISSION',
        '3606',
        'Verified commission mapping.'
      ),

      (
        'OVERTIME',
        '3607',
        'Verified overtime mapping.'
      )

  ) as x(
    component_code,
    source_code,
    notes
  )

    on x.component_code =
       d.code

  where
    d.company_id =
      p_company_id

    and d.is_active =
      true

  on conflict (
    company_id,
    tax_year,
    component_code
  )
  do nothing;


  get diagnostics
    v_inserted =
      row_count;


  return jsonb_build_object(
    'ok',
      true,

    'company_id',
      p_company_id,

    'tax_year',
      p_tax_year,

    'brs_version',
      '25.3.0',

    'mappings_added',
      v_inserted
  );

end;
$$;
-- Configure current companies immediately.

do $$
declare
  r record;
begin

  for r in
    select id
    from public.company
  loop

    perform
      public.ensure_payroll_sars_source_defaults(
        r.id,
        2027
      );

  end loop;

end;
$$;
-- ============================================================
-- 5. IT3(a) / SOURCE-CODE PROFILE CONTROLS
-- ============================================================

alter table public.payroll_tax_certificate_profile
add column if not exists
it3a_reason_code text;
alter table public.payroll_tax_certificate_profile
add column if not exists
foreign_service_income boolean
not null default false;
alter table public.payroll_tax_certificate_profile
drop constraint if exists
payroll_tax_certificate_profile_it3a_reason_check;
alter table public.payroll_tax_certificate_profile
add constraint
payroll_tax_certificate_profile_it3a_reason_check
check (
  it3a_reason_code is null
  or it3a_reason_code ~ '^(0?[1-9]|10)$'
);
comment on column
public.payroll_tax_certificate_profile.it3a_reason_code
is
'SARS source code 4150 value when an IT3(a) certificate requires a reason for non-deduction of employees tax.';
comment on column
public.payroll_tax_certificate_profile.foreign_service_income
is
'Flags foreign service remuneration. Foreign-service source-code pairs are intentionally blocked until that BRS path is separately implemented.';
-- ============================================================
-- 6. SAVE BRS SOURCE-CODE SETTINGS FOR EMPLOYEE
-- ============================================================

create or replace function public.save_payroll_tax_certificate_source_settings(
  p_employee_id uuid,
  p_it3a_reason_code text default null,
  p_foreign_service_income boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_reason text;

  v_profile_id uuid;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;


  if not public.current_user_has_permission(
    'payroll.manage'
  ) then
    raise exception
      'Permission denied: payroll.manage';
  end if;


  v_company_id :=
    public.current_company_id();


  if not exists (
    select 1
    from public.hr_employee
    where
      id =
        p_employee_id

      and company_id =
        v_company_id
  ) then

    raise exception
      'Employee could not be found.';

  end if;


  v_reason :=
    nullif(
      btrim(
        coalesce(
          p_it3a_reason_code,
          ''
        )
      ),
      ''
    );


  if v_reason is not null
     and length(v_reason) = 1
  then

    v_reason :=
      '0' || v_reason;

  end if;


  if v_reason is not null
     and v_reason !~ '^(0[1-9]|10)$'
  then

    raise exception
      'Unsupported IT3(a) reason-code format.';

  end if;


  insert into public.payroll_tax_certificate_profile (
    company_id,
    employee_id,

    it3a_reason_code,
    foreign_service_income,

    created_by,
    updated_by
  )
  values (
    v_company_id,
    p_employee_id,

    v_reason,
    coalesce(
      p_foreign_service_income,
      false
    ),

    auth.uid(),
    auth.uid()
  )

  on conflict (
    company_id,
    employee_id
  )
  do update
  set
    it3a_reason_code =
      excluded.it3a_reason_code,

    foreign_service_income =
      excluded.foreign_service_income,

    updated_by =
      auth.uid(),

    updated_at =
      now()

  returning id
  into v_profile_id;


  insert into public.audit_log (
    company_id,
    user_id,
    action,
    module,
    record_id,
    description,
    metadata
  )
  values (
    v_company_id,
    auth.uid(),

    'payroll_tax_certificate_source_settings_saved',

    'payroll',

    v_profile_id,

    'SARS tax-certificate source-code settings updated.',

    jsonb_build_object(
      'employee_id',
        p_employee_id,

      'it3a_reason_code',
        v_reason,

      'foreign_service_income',
        coalesce(
          p_foreign_service_income,
          false
        )
    )
  );


  return jsonb_build_object(
    'ok',
      true,

    'profile_id',
      v_profile_id,

    'employee_id',
      p_employee_id,

    'it3a_reason_code',
      v_reason,

    'foreign_service_income',
      coalesce(
        p_foreign_service_income,
        false
      )
  );

end;
$$;
-- ============================================================
-- 7. SARS SOURCE-CODE PREVIEW ENGINE
-- ============================================================

create or replace function public.get_payroll_irp5_source_code_preview(
  p_tax_year integer,
  p_period_type text default 'interim'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_tax_year integer;

  v_period_type text;

  v_period_start date;
  v_period_end date;

  v_settings public.payroll_employer_settings%rowtype;

  v_employee record;

  v_certificate_type text;

  v_reason text;

  v_employee_blockers jsonb;

  v_employee_warnings jsonb;

  v_unsupported_components jsonb;

  v_income_lines jsonb;

  v_source_lines jsonb;

  v_mapped_income_raw numeric := 0;

  v_export_income_total numeric := 0;

  v_total_tax_uif_sdl numeric := 0;

  v_employees jsonb :=
    '[]'::jsonb;

  v_employee_count integer := 0;

  v_ready_count integer := 0;

  v_blocked_count integer := 0;
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


  v_tax_year :=
    coalesce(
      p_tax_year,
      extract(
        year from current_date
      )::integer
    );


  if v_tax_year < 2025
     or v_tax_year > 2100
  then

    raise exception
      'Unsupported SARS tax year.';

  end if;


  v_period_type :=
    lower(
      btrim(
        coalesce(
          p_period_type,
          'interim'
        )
      )
    );


  if v_period_type not in (
    'interim',
    'annual'
  ) then

    raise exception
      'Period type must be interim or annual.';

  end if;


  v_period_start :=
    make_date(
      v_tax_year - 1,
      3,
      1
    );


  if v_period_type =
     'interim'
  then

    v_period_end :=
      make_date(
        v_tax_year - 1,
        8,
        31
      );

  else

    v_period_end :=
      (
        make_date(
          v_tax_year,
          3,
          1
        )
        -
        interval '1 day'
      )::date;

  end if;


  select *
  into v_settings

  from public.payroll_employer_settings

  where company_id =
    v_company_id;


  perform
    public.ensure_payroll_sars_source_defaults(
      v_company_id,
      v_tax_year
    );


  -- ----------------------------------------------------------
  -- Build employee certificates from posted payroll only.
  -- ----------------------------------------------------------

  for v_employee in

    select
      e.id as employee_id,

      e.employee_number,

      e.first_name,
      e.last_name,

      pp.tax_number,

      tcp.id as certificate_profile_id,

      tcp.it3a_reason_code,

      coalesce(
        tcp.foreign_service_income,
        false
      ) as foreign_service_income,

      coalesce(
        sum(
          pre.gross_remuneration
        ),
        0
      ) as gross,

      coalesce(
        sum(
          pre.taxable_remuneration
        ),
        0
      ) as taxable,

      coalesce(
        sum(
          pre.paye_amount
        ),
        0
      ) as paye,

      coalesce(
        sum(
          pre.uif_employee
        ),
        0
      ) as uif_employee,

      coalesce(
        sum(
          pre.uif_employer
        ),
        0
      ) as uif_employer,

      coalesce(
        sum(
          pre.sdl_employer
        ),
        0
      ) as sdl

    from public.hr_employee e

    join public.payroll_pay_run_employee pre
      on pre.employee_id =
         e.id

     and pre.company_id =
         e.company_id

    join public.payroll_pay_run pr
      on pr.id =
         pre.pay_run_id

     and pr.company_id =
         pre.company_id

    left join public.payroll_employee_profile pp
      on pp.company_id =
         e.company_id

     and pp.employee_id =
         e.id

    left join public.payroll_tax_certificate_profile tcp
      on tcp.company_id =
         e.company_id

     and tcp.employee_id =
         e.id

    where
      e.company_id =
        v_company_id

      and pr.tax_year =
        v_tax_year

      and pr.payment_date between
        v_period_start
        and v_period_end

      and pr.status in (
        'posted',
        'paid'
      )

    group by
      e.id,
      e.employee_number,
      e.first_name,
      e.last_name,

      pp.tax_number,

      tcp.id,
      tcp.it3a_reason_code,
      tcp.foreign_service_income

    order by
      e.last_name,
      e.first_name

  loop

    v_employee_count :=
      v_employee_count + 1;


    v_employee_blockers :=
      '[]'::jsonb;


    v_employee_warnings :=
      '[]'::jsonb;


    v_income_lines :=
      '[]'::jsonb;


    v_source_lines :=
      '[]'::jsonb;


    v_unsupported_components :=
      '[]'::jsonb;


    v_mapped_income_raw :=
      0;


    v_export_income_total :=
      0;


    -- --------------------------------------------------------
    -- Certificate type
    -- --------------------------------------------------------

    if v_employee.paye > 0.005 then

      v_certificate_type :=
        'IRP5';

      v_reason :=
        null;

    else

      v_certificate_type :=
        'IT3(a)';


      v_reason :=
        nullif(
          btrim(
            coalesce(
              v_employee.it3a_reason_code,
              ''
            )
          ),
          ''
        );


      if v_reason is not null
         and length(v_reason) = 1
      then

        v_reason :=
          '0' || v_reason;

      end if;


      if v_reason is null then

        v_employee_blockers :=
          v_employee_blockers ||
          jsonb_build_array(
            'IT3(a) requires SARS reason code 4150 because no PAYE was deducted.'
          );

      elsif v_reason <> '02' then

        v_employee_blockers :=
          v_employee_blockers ||
          jsonb_build_array(
            'This Sprint validates IT3(a) reason 02 (earnings below tax threshold). Other 4150 reasons require additional contextual BRS validation.'
          );

      end if;

    end if;


    -- --------------------------------------------------------
    -- Foreign-service path
    -- --------------------------------------------------------

    if v_employee.foreign_service_income then

      v_employee_blockers :=
        v_employee_blockers ||
        jsonb_build_array(
          'Foreign-service remuneration requires the SARS foreign-service source-code path and cannot use the domestic mappings in Sprint 23.13.'
        );

    end if;


    -- --------------------------------------------------------
    -- Aggregate verified direct income mappings
    -- --------------------------------------------------------

    select

      coalesce(
        jsonb_agg(
          jsonb_build_object(

            'source_code',
              q.source_code,

            'description',
              q.description,

            'amount',
              q.export_amount,

            'raw_payroll_amount',
              round(
                q.raw_amount,
                2
              ),

            'amount_rule',
              'whole_rand_floor',

            'derived',
              false

          )

          order by
            q.source_code
        ),
        '[]'::jsonb
      ),

      coalesce(
        sum(
          q.raw_amount
        ),
        0
      ),

      coalesce(
        sum(
          q.export_amount
        ),
        0
      )

    into
      v_income_lines,
      v_mapped_income_raw,
      v_export_income_total

    from (

      select
        m.source_code,

        c.description,

        sum(
          i.amount
        ) as raw_amount,

        trunc(
          sum(
            i.amount
          )
        ) as export_amount

      from public.payroll_pay_run_item i

      join public.payroll_pay_run_employee pre2
        on pre2.id =
           i.pay_run_employee_id

       and pre2.company_id =
           i.company_id

      join public.payroll_pay_run pr2
        on pr2.id =
           pre2.pay_run_id

       and pr2.company_id =
           pre2.company_id

      join public.payroll_sars_component_mapping m
        on m.company_id =
           i.company_id

       and m.tax_year =
           v_tax_year

       and m.component_code =
           i.component_code

       and m.mapping_type =
           'direct'

       and m.verification_status =
           'verified'

      join public.payroll_sars_source_code c
        on c.jurisdiction =
           'ZA'

       and c.brs_version =
           m.brs_version

       and c.source_code =
           m.source_code

       and c.is_active =
           true

      where
        i.company_id =
          v_company_id

        and pre2.employee_id =
          v_employee.employee_id

        and pr2.tax_year =
          v_tax_year

        and pr2.payment_date between
          v_period_start
          and v_period_end

        and pr2.status in (
          'posted',
          'paid'
        )

        and abs(
          i.amount
        ) > 0.005

      group by
        m.source_code,
        c.description

    ) q;


    -- --------------------------------------------------------
    -- Find non-zero components which cannot safely map yet.
    --
    -- PAYE/UIF/SDL are derived below from statutory payroll
    -- totals and therefore do not need direct mapping.
    -- --------------------------------------------------------

    select

      coalesce(
        jsonb_agg(
          distinct i.component_code
        ),
        '[]'::jsonb
      )

    into
      v_unsupported_components

    from public.payroll_pay_run_item i

    join public.payroll_pay_run_employee pre2
      on pre2.id =
         i.pay_run_employee_id

     and pre2.company_id =
         i.company_id

    join public.payroll_pay_run pr2
      on pr2.id =
         pre2.pay_run_id

     and pr2.company_id =
         pre2.company_id

    where
      i.company_id =
        v_company_id

      and pre2.employee_id =
        v_employee.employee_id

      and pr2.tax_year =
        v_tax_year

      and pr2.payment_date between
        v_period_start
        and v_period_end

      and pr2.status in (
        'posted',
        'paid'
      )

      and abs(
        i.amount
      ) > 0.005

      and i.component_code not in (
        'PAYE',
        'UIF_EMPLOYEE',
        'UIF_EMPLOYER',
        'SDL_EMPLOYER'
      )

      and not exists (

        select 1

        from public.payroll_sars_component_mapping m

        where
          m.company_id =
            i.company_id

          and m.tax_year =
            v_tax_year

          and m.component_code =
            i.component_code

          and m.mapping_type =
            'direct'

          and m.verification_status =
            'verified'
      );


    if jsonb_array_length(
      v_unsupported_components
    ) > 0 then

      v_employee_blockers :=
        v_employee_blockers ||
        jsonb_build_array(
          'One or more non-zero payroll components require SARS source-code classification before certificate generation.'
        );

    end if;


    -- --------------------------------------------------------
    -- Mapping reconciliation
    -- --------------------------------------------------------

    if abs(
      v_mapped_income_raw
      -
      v_employee.gross
    ) > 0.01 then

      v_employee_blockers :=
        v_employee_blockers ||
        jsonb_build_array(
          'Mapped SARS income components do not reconcile to payroll gross remuneration.'
        );

    end if;


    if v_mapped_income_raw <= 0.005 then

      v_employee_blockers :=
        v_employee_blockers ||
        jsonb_build_array(
          'At least one positive SARS income source code is required.'
        );

    end if;


    -- --------------------------------------------------------
    -- Income lines
    -- --------------------------------------------------------

    v_source_lines :=
      v_income_lines;


    if v_export_income_total > 0 then

      v_source_lines :=
        v_source_lines ||
        jsonb_build_array(
          jsonb_build_object(

            'source_code',
              '3699',

            'description',
              'Gross employment income - taxable',

            'amount',
              v_export_income_total,

            'raw_payroll_amount',
              round(
                v_employee.taxable,
                2
              ),

            'amount_rule',
              'whole_rand_floor',

            'derived',
              true
          )
        );

    end if;


    -- --------------------------------------------------------
    -- PAYE 4102
    -- --------------------------------------------------------

    if v_certificate_type =
       'IRP5'
    then

      v_source_lines :=
        v_source_lines ||
        jsonb_build_array(
          jsonb_build_object(

            'source_code',
              '4102',

            'description',
              'PAYE',

            'amount',
              round(
                v_employee.paye,
                2
              ),

            'amount_rule',
              'money_2dp',

            'derived',
              true
          )
        );

    end if;


    -- --------------------------------------------------------
    -- UIF 4141
    --
    -- SARS requires employee + employer UIF combined.
    -- --------------------------------------------------------

    if coalesce(
      v_settings.uif_enabled,
      false
    ) then

      v_source_lines :=
        v_source_lines ||
        jsonb_build_array(
          jsonb_build_object(

            'source_code',
              '4141',

            'description',
              'Employee and employer UIF contribution',

            'amount',
              round(
                v_employee.uif_employee
                +
                v_employee.uif_employer,
                2
              ),

            'amount_rule',
              'money_2dp',

            'derived',
              true
          )
        );

    end if;


    -- --------------------------------------------------------
    -- SDL 4142
    -- --------------------------------------------------------

    if coalesce(
      v_settings.sdl_enabled,
      false
    ) then

      v_source_lines :=
        v_source_lines ||
        jsonb_build_array(
          jsonb_build_object(

            'source_code',
              '4142',

            'description',
              'Employer SDL contribution',

            'amount',
              round(
                v_employee.sdl,
                2
              ),

            'amount_rule',
              'money_2dp',

            'derived',
              true
          )
        );

    end if;


    -- --------------------------------------------------------
    -- IT3(a) reason 4150
    -- --------------------------------------------------------

    if v_certificate_type =
       'IT3(a)'

       and v_reason is not null
    then

      v_source_lines :=
        v_source_lines ||
        jsonb_build_array(
          jsonb_build_object(

            'source_code',
              '4150',

            'description',
              'Reason for non-deduction of employees tax',

            'value',
              v_reason,

            'derived',
              true
          )
        );

    end if;


    -- --------------------------------------------------------
    -- 4149
    -- --------------------------------------------------------

    v_total_tax_uif_sdl :=
      round(
        case

          when v_certificate_type =
               'IRP5'
            then v_employee.paye

          else 0

        end

        +

        case

          when coalesce(
            v_settings.uif_enabled,
            false
          )
            then
              v_employee.uif_employee
              +
              v_employee.uif_employer

          else 0

        end

        +

        case

          when coalesce(
            v_settings.sdl_enabled,
            false
          )
            then v_employee.sdl

          else 0

        end,
        2
      );


    if v_certificate_type =
       'IRP5'

       or coalesce(
         v_settings.uif_enabled,
         false
       )

       or coalesce(
         v_settings.sdl_enabled,
         false
       )
    then

      v_source_lines :=
        v_source_lines ||
        jsonb_build_array(
          jsonb_build_object(

            'source_code',
              '4149',

            'description',
              'Total Tax, SDL and UIF',

            'amount',
              v_total_tax_uif_sdl,

            'amount_rule',
              'money_2dp',

            'derived',
              true
          )
        );

    end if;


    -- --------------------------------------------------------
    -- Readiness
    -- --------------------------------------------------------

    if jsonb_array_length(
      v_employee_blockers
    ) = 0 then

      v_ready_count :=
        v_ready_count + 1;

    else

      v_blocked_count :=
        v_blocked_count + 1;

    end if;


    v_employees :=
      v_employees ||
      jsonb_build_array(
        jsonb_build_object(

          'employee_id',
            v_employee.employee_id,

          'employee_number',
            v_employee.employee_number,

          'name',
            concat_ws(
              ' ',
              v_employee.first_name,
              v_employee.last_name
            ),

          'certificate_type',
            v_certificate_type,

          'it3a_reason_code',
            v_reason,

          'payroll_totals',
            jsonb_build_object(

              'gross',
                round(
                  v_employee.gross,
                  2
                ),

              'taxable',
                round(
                  v_employee.taxable,
                  2
                ),

              'paye',
                round(
                  v_employee.paye,
                  2
                ),

              'uif_employee',
                round(
                  v_employee.uif_employee,
                  2
                ),

              'uif_employer',
                round(
                  v_employee.uif_employer,
                  2
                ),

              'sdl',
                round(
                  v_employee.sdl,
                  2
                )
            ),

          'mapped_income_raw',
            round(
              v_mapped_income_raw,
              2
            ),

          'unsupported_components',
            v_unsupported_components,

          'source_codes',
            v_source_lines,

          'source_code_ready',
            jsonb_array_length(
              v_employee_blockers
            ) = 0,

          'blockers',
            v_employee_blockers,

          'warnings',
            v_employee_warnings
        )
      );

  end loop;


  return jsonb_build_object(

    'ok',
      true,

    'engine',
      jsonb_build_object(

        'name',
          'Nexus SARS IRP5/IT3(a) Source-Code Engine',

        'jurisdiction',
          'ZA',

        'brs_version',
          '25.3.0',

        'tax_year',
          v_tax_year,

        'period_type',
          v_period_type,

        'period_start',
          v_period_start,

        'period_end',
          v_period_end
      ),

    'employees_total',
      v_employee_count,

    'source_code_ready',
      v_ready_count,

    'source_code_blocked',
      v_blocked_count,

    'engine_ready',
      v_employee_count > 0
      and v_blocked_count = 0,

    'rules',
      jsonb_build_object(

        'income_cents',
          'discarded',

        'paye_uif_sdl_cents',
          'retained',

        'negative_certificate_values_allowed',
          false,

        'foreign_service_mapping_supported',
          false,

        'retirement_component_auto_mapping_supported',
          false,

        'manual_deduction_auto_mapping_supported',
          false
      ),

    'employees',
      v_employees

  );

end;
$$;
-- ============================================================
-- 8. EMP501 + BRS SOURCE-CODE READINESS
--
-- Upgrades Sprint 23.12 without claiming CSV/export readiness.
-- ============================================================

create or replace function public.get_payroll_emp501_brs_source_readiness(
  p_tax_year integer,
  p_period_type text default 'interim'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base jsonb;

  v_source jsonb;

  v_result jsonb;

  v_blockers jsonb :=
    '[]'::jsonb;

  v_warnings jsonb :=
    '[]'::jsonb;

  v_source_ready boolean :=
    false;
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


  v_base :=
    public.get_payroll_emp501_reconciliation_workspace(
      p_tax_year,
      p_period_type
    );


  v_source :=
    public.get_payroll_irp5_source_code_preview(
      p_tax_year,
      p_period_type
    );


  v_source_ready :=
    coalesce(
      (
        v_source
        ->>
        'engine_ready'
      )::boolean,
      false
    );


  -- ----------------------------------------------------------
  -- Remove the Sprint 23.12 hard-coded source-engine blocker.
  -- ----------------------------------------------------------

  select

    coalesce(
      jsonb_agg(
        x
      ),
      '[]'::jsonb
    )

  into
    v_blockers

  from jsonb_array_elements_text(
    coalesce(
      v_base
      #>
      '{readiness,blockers}',
      '[]'::jsonb
    )
  ) as t(x)

  where
    x <>
    'SARS IRP5/IT3(a) source-code mapping and certificate export engine has not yet been implemented.';


  if not v_source_ready then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'One or more employee certificates fail the SARS source-code/BRS mapping engine.'
      );

  end if;


  -- Full certificate layout + CSV validation comes next.

  v_blockers :=
    v_blockers ||
    jsonb_build_array(
      'Full SARS certificate field assembly, certificate numbering and CSV/e@syFile export validation are not yet implemented.'
    );


  -- ----------------------------------------------------------
  -- Replace obsolete source-code warnings.
  -- ----------------------------------------------------------

  select

    coalesce(
      jsonb_agg(
        x
      ),
      '[]'::jsonb
    )

  into
    v_warnings

  from jsonb_array_elements_text(
    coalesce(
      v_base
      #>
      '{readiness,warnings}',
      '[]'::jsonb
    )
  ) as t(x)

  where
    x not in (

      'SARS tax-certificate income, deduction and tax source-code mapping is not yet generated in this sprint.',

      'IRP5/IT3(a) certificate numbers and SARS CSV/e@syFile export are not generated until the certificate source-code engine is implemented and validated against the applicable SARS BRS.'
    );


  v_warnings :=
    v_warnings ||
    jsonb_build_array(
      'Sprint 23.13 generates and validates the supported SARS financial source-code preview but does not yet create a SARS submission file.'
    );


  v_result :=
    v_base;


  v_result :=
    jsonb_set(
      v_result,
      '{source_code_engine}',
      v_source,
      true
    );


  v_result :=
    jsonb_set(
      v_result,
      '{readiness,blockers}',
      v_blockers,
      true
    );


  v_result :=
    jsonb_set(
      v_result,
      '{readiness,warnings}',
      v_warnings,
      true
    );


  v_result :=
    jsonb_set(
      v_result,
      '{readiness,source_code_engine_ready}',
      to_jsonb(
        v_source_ready
      ),
      true
    );


  v_result :=
    jsonb_set(
      v_result,
      '{readiness,sars_export_ready}',
      'false'::jsonb,
      true
    );


  v_result :=
    jsonb_set(
      v_result,
      '{readiness,submission_ready}',
      'false'::jsonb,
      true
    );


  v_result :=
    jsonb_set(
      v_result,
      '{next_engine}',
      jsonb_build_object(

        'required',
          true,

        'name',
          'SARS IRP5/IT3(a) certificate field assembly and export validator',

        'source_code_engine_complete',
          v_source_ready,

        'certificate_numbering_required',
          true,

        'csv_validation_required',
          true,

        'easyfile_submission_performed_by_nexus',
          false
      ),
      true
    );


  return v_result;

end;
$$;
-- ============================================================
-- 9. SECURITY
-- ============================================================

revoke all
on function public.ensure_payroll_sars_source_defaults(
  uuid,
  integer
)
from public;
revoke all
on function public.ensure_payroll_sars_source_defaults(
  uuid,
  integer
)
from anon;
revoke all
on function public.save_payroll_tax_certificate_source_settings(
  uuid,
  text,
  boolean
)
from public;
revoke all
on function public.save_payroll_tax_certificate_source_settings(
  uuid,
  text,
  boolean
)
from anon;
grant execute
on function public.save_payroll_tax_certificate_source_settings(
  uuid,
  text,
  boolean
)
to authenticated;
revoke all
on function public.get_payroll_irp5_source_code_preview(
  integer,
  text
)
from public;
revoke all
on function public.get_payroll_irp5_source_code_preview(
  integer,
  text
)
from anon;
grant execute
on function public.get_payroll_irp5_source_code_preview(
  integer,
  text
)
to authenticated;
revoke all
on function public.get_payroll_emp501_brs_source_readiness(
  integer,
  text
)
from public;
revoke all
on function public.get_payroll_emp501_brs_source_readiness(
  integer,
  text
)
from anon;
grant execute
on function public.get_payroll_emp501_brs_source_readiness(
  integer,
  text
)
to authenticated;
comment on table public.payroll_sars_source_code
is
'Versioned SARS employee tax-certificate source-code catalog used by Nexus. Codes must be tied to a verified SARS BRS/guide baseline.';
comment on table public.payroll_sars_component_mapping
is
'Maps Nexus payroll components to verified SARS employee tax-certificate source codes for a specific tax year. Unsupported or ambiguous components remain blocked rather than guessed.';
comment on function public.get_payroll_irp5_source_code_preview(
  integer,
  text
)
is
'Builds the supported IRP5/IT3(a) financial source-code preview from posted payroll using SARS BRS v25.3.0 rules. Domestic BASIC, BONUS, COMMISSION and OVERTIME mappings are supported; ambiguous retirement/manual deduction and foreign-service mappings remain blocked.';
comment on function public.get_payroll_emp501_brs_source_readiness(
  integer,
  text
)
is
'Combines EMP501 reconciliation with the SARS source-code engine. Source-code readiness may pass while final SARS certificate/CSV export remains intentionally blocked until full field-level BRS validation is implemented.';
