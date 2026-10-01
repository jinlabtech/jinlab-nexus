-- ============================================================
-- JINLAB NEXUS
-- Sprint 23.12
-- EMP501 Reconciliation + IRP5/IT3(a) Readiness
-- ============================================================


-- ============================================================
-- 1. EMPLOYER TAX-CERTIFICATE IDENTIFIER
-- ============================================================

alter table public.payroll_employer_settings
add column if not exists income_tax_reference text;
comment on column public.payroll_employer_settings.income_tax_reference
is
'Employer Income Tax reference used for reconciliation/tax-certificate readiness where applicable. This does not replace PAYE/UIF/SDL registration references.';
-- ============================================================
-- 2. EMPLOYEE TAX-CERTIFICATE PROFILE
--
-- Keeps SARS certificate identity information separate from
-- ordinary HR records and ordinary payroll calculations.
-- ============================================================

create table if not exists public.payroll_tax_certificate_profile (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  employee_id uuid not null
    references public.hr_employee(id)
    on delete cascade,

  nature_of_person text,

  identity_type text
    check (
      identity_type is null
      or identity_type in (
        'south_african_id',
        'passport',
        'other'
      )
    ),

  identity_number text,

  passport_country_code text,

  nationality_country_code text,

  residential_address jsonb not null
    default '{}'::jsonb,

  postal_address jsonb not null
    default '{}'::jsonb,

  voluntary_over_deduction boolean not null
    default false,

  fixed_rate_taxation boolean not null
    default false,

  metadata jsonb not null
    default '{}'::jsonb,

  created_by uuid
    references auth.users(id)
    on delete set null,

  updated_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  unique (
    company_id,
    employee_id
  )
);
create index if not exists
payroll_tax_certificate_profile_company_employee_idx
on public.payroll_tax_certificate_profile (
  company_id,
  employee_id
);
alter table public.payroll_tax_certificate_profile
enable row level security;
revoke all
on table public.payroll_tax_certificate_profile
from anon;
revoke all
on table public.payroll_tax_certificate_profile
from authenticated;
-- ============================================================
-- 3. SAVE TAX-CERTIFICATE PROFILE
-- ============================================================

create or replace function public.save_payroll_tax_certificate_profile(
  p_employee_id uuid,

  p_nature_of_person text,

  p_identity_type text,

  p_identity_number text,

  p_passport_country_code text default null,

  p_nationality_country_code text default null,

  p_residential_address jsonb default '{}'::jsonb,

  p_postal_address jsonb default '{}'::jsonb,

  p_voluntary_over_deduction boolean default false,

  p_fixed_rate_taxation boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_employee public.hr_employee%rowtype;

  v_profile_id uuid;

  v_identity_type text;

  v_identity_number text;

  v_nature text;
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


  if p_employee_id is null then
    raise exception
      'Employee is required.';
  end if;


  v_company_id :=
    public.current_company_id();


  select *
  into v_employee

  from public.hr_employee

  where
    id =
      p_employee_id

    and company_id =
      v_company_id;


  if v_employee.id is null then
    raise exception
      'Employee could not be found.';
  end if;


  v_nature :=
    nullif(
      upper(
        btrim(
          coalesce(
            p_nature_of_person,
            ''
          )
        )
      ),
      ''
    );


  v_identity_type :=
    nullif(
      lower(
        btrim(
          coalesce(
            p_identity_type,
            ''
          )
        )
      ),
      ''
    );


  if v_identity_type is not null
     and v_identity_type not in (
       'south_african_id',
       'passport',
       'other'
     )
  then
    raise exception
      'Unsupported tax-certificate identity type.';
  end if;


  v_identity_number :=
    nullif(
      btrim(
        coalesce(
          p_identity_number,
          ''
        )
      ),
      ''
    );


  if v_identity_type in (
    'south_african_id',
    'passport'
  )
  and v_identity_number is null
  then

    raise exception
      'Identity number is required for the selected identity type.';

  end if;


  if v_identity_type = 'passport'
     and nullif(
       btrim(
         coalesce(
           p_passport_country_code,
           ''
         )
       ),
       ''
     ) is null
  then

    raise exception
      'Passport country code is required for passport identification.';

  end if;


  insert into public.payroll_tax_certificate_profile (
    company_id,
    employee_id,

    nature_of_person,

    identity_type,
    identity_number,

    passport_country_code,
    nationality_country_code,

    residential_address,
    postal_address,

    voluntary_over_deduction,
    fixed_rate_taxation,

    created_by,
    updated_by
  )
  values (
    v_company_id,
    v_employee.id,

    v_nature,

    v_identity_type,
    v_identity_number,

    nullif(
      upper(
        btrim(
          coalesce(
            p_passport_country_code,
            ''
          )
        )
      ),
      ''
    ),

    nullif(
      upper(
        btrim(
          coalesce(
            p_nationality_country_code,
            ''
          )
        )
      ),
      ''
    ),

    coalesce(
      p_residential_address,
      '{}'::jsonb
    ),

    coalesce(
      p_postal_address,
      '{}'::jsonb
    ),

    coalesce(
      p_voluntary_over_deduction,
      false
    ),

    coalesce(
      p_fixed_rate_taxation,
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
    nature_of_person =
      excluded.nature_of_person,

    identity_type =
      excluded.identity_type,

    identity_number =
      excluded.identity_number,

    passport_country_code =
      excluded.passport_country_code,

    nationality_country_code =
      excluded.nationality_country_code,

    residential_address =
      excluded.residential_address,

    postal_address =
      excluded.postal_address,

    voluntary_over_deduction =
      excluded.voluntary_over_deduction,

    fixed_rate_taxation =
      excluded.fixed_rate_taxation,

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

    'payroll_tax_certificate_profile_saved',

    'payroll',

    v_profile_id,

    'Payroll tax-certificate identity profile saved.',

    jsonb_build_object(
      'employee_id',
        v_employee.id,

      'identity_type',
        v_identity_type,

      'nature_of_person',
        v_nature
    )
  );


  return jsonb_build_object(
    'ok',
      true,

    'profile_id',
      v_profile_id,

    'employee_id',
      v_employee.id
  );

end;
$$;
-- ============================================================
-- 4. EMPLOYEE IRP5 / IT3(a) READINESS
--
-- This does NOT generate a SARS certificate yet.
-- It identifies whether payroll + employee identity data is
-- complete enough for the certificate engine planned next.
-- ============================================================

create or replace function public.get_payroll_irp5_readiness(
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

  v_period_code text;

  v_employee record;

  v_employee_blockers jsonb;

  v_employees jsonb :=
    '[]'::jsonb;

  v_employee_count integer := 0;

  v_ready_count integer := 0;

  v_blocked_count integer := 0;

  v_gross numeric := 0;
  v_taxable numeric := 0;
  v_paye numeric := 0;
  v_uif_employee numeric := 0;
  v_uif_employer numeric := 0;
  v_sdl numeric := 0;
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
      extract(year from current_date)::integer
    );


  if v_tax_year < 2000
     or v_tax_year > 2100
  then

    raise exception
      'Invalid South African tax year.';

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
      'EMP501 period type must be interim or annual.';

  end if;


  v_period_start :=
    make_date(
      v_tax_year - 1,
      3,
      1
    );


  if v_period_type = 'interim' then

    v_period_end :=
      make_date(
        v_tax_year - 1,
        8,
        31
      );

    v_period_code :=
      '08';

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

    v_period_code :=
      '02';

  end if;


  for v_employee in

    select
      e.id as employee_id,

      e.employee_number,

      e.first_name,
      e.last_name,

      e.email,
      e.phone,

      e.hire_date,
      e.end_date,

      pp.id as payroll_profile_id,

      pp.tax_number,

      pp.birth_date,

      tcp.id as certificate_profile_id,

      tcp.nature_of_person,

      tcp.identity_type,

      tcp.identity_number,

      tcp.passport_country_code,

      tcp.nationality_country_code,

      tcp.residential_address,

      tcp.postal_address,

      tcp.voluntary_over_deduction,

      tcp.fixed_rate_taxation,

      count(
        distinct pr.id
      ) as pay_runs,

      min(pr.period_start) as first_payroll_period,

      max(pr.period_end) as last_payroll_period,

      coalesce(
        sum(pre.gross_remuneration),
        0
      ) as gross,

      coalesce(
        sum(pre.taxable_remuneration),
        0
      ) as taxable,

      coalesce(
        sum(pre.paye_amount),
        0
      ) as paye,

      coalesce(
        sum(pre.uif_employee),
        0
      ) as uif_employee,

      coalesce(
        sum(pre.uif_employer),
        0
      ) as uif_employer,

      coalesce(
        sum(pre.sdl_employer),
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
      on pp.employee_id =
         e.id

     and pp.company_id =
         e.company_id

    left join public.payroll_tax_certificate_profile tcp
      on tcp.employee_id =
         e.id

     and tcp.company_id =
         e.company_id

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
      e.email,
      e.phone,
      e.hire_date,
      e.end_date,

      pp.id,
      pp.tax_number,
      pp.birth_date,

      tcp.id,
      tcp.nature_of_person,
      tcp.identity_type,
      tcp.identity_number,
      tcp.passport_country_code,
      tcp.nationality_country_code,
      tcp.residential_address,
      tcp.postal_address,
      tcp.voluntary_over_deduction,
      tcp.fixed_rate_taxation

    order by
      e.last_name,
      e.first_name

  loop

    v_employee_count :=
      v_employee_count + 1;


    v_employee_blockers :=
      '[]'::jsonb;


    if v_employee.payroll_profile_id is null then

      v_employee_blockers :=
        v_employee_blockers ||
        jsonb_build_array(
          'Payroll employee profile is missing.'
        );

    end if;


    if nullif(
      btrim(
        coalesce(
          v_employee.tax_number,
          ''
        )
      ),
      ''
    ) is null then

      v_employee_blockers :=
        v_employee_blockers ||
        jsonb_build_array(
          'Employee Income Tax reference number is missing.'
        );

    end if;


    if v_employee.birth_date is null then

      v_employee_blockers :=
        v_employee_blockers ||
        jsonb_build_array(
          'Employee date of birth is missing.'
        );

    end if;


    if nullif(
      btrim(
        coalesce(
          v_employee.email,
          ''
        )
      ),
      ''
    ) is null then

      v_employee_blockers :=
        v_employee_blockers ||
        jsonb_build_array(
          'Employee email address is missing.'
        );

    end if;


    if v_employee.certificate_profile_id is null then

      v_employee_blockers :=
        v_employee_blockers ||
        jsonb_build_array(
          'Tax-certificate identity profile is missing.'
        );

    else

      if nullif(
        btrim(
          coalesce(
            v_employee.nature_of_person,
            ''
          )
        ),
        ''
      ) is null then

        v_employee_blockers :=
          v_employee_blockers ||
          jsonb_build_array(
            'Nature of person is missing.'
          );

      end if;


      if v_employee.identity_type is null then

        v_employee_blockers :=
          v_employee_blockers ||
          jsonb_build_array(
            'Identity type is missing.'
          );

      end if;


      if v_employee.identity_type in (
        'south_african_id',
        'passport'
      )
      and nullif(
        btrim(
          coalesce(
            v_employee.identity_number,
            ''
          )
        ),
        ''
      ) is null then

        v_employee_blockers :=
          v_employee_blockers ||
          jsonb_build_array(
            'Identity or passport number is missing.'
          );

      end if;


      if v_employee.identity_type =
         'passport'

         and nullif(
           btrim(
             coalesce(
               v_employee.passport_country_code,
               ''
             )
           ),
           ''
         ) is null
      then

        v_employee_blockers :=
          v_employee_blockers ||
          jsonb_build_array(
            'Passport country code is missing.'
          );

      end if;


      if coalesce(
        v_employee.residential_address,
        '{}'::jsonb
      ) = '{}'::jsonb then

        v_employee_blockers :=
          v_employee_blockers ||
          jsonb_build_array(
            'Residential address information is missing.'
          );

      end if;

    end if;


    if jsonb_array_length(
      v_employee_blockers
    ) = 0 then

      v_ready_count :=
        v_ready_count + 1;

    else

      v_blocked_count :=
        v_blocked_count + 1;

    end if;


    v_gross :=
      v_gross +
      v_employee.gross;


    v_taxable :=
      v_taxable +
      v_employee.taxable;


    v_paye :=
      v_paye +
      v_employee.paye;


    v_uif_employee :=
      v_uif_employee +
      v_employee.uif_employee;


    v_uif_employer :=
      v_uif_employer +
      v_employee.uif_employer;


    v_sdl :=
      v_sdl +
      v_employee.sdl;


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

          'email',
            v_employee.email,

          'tax_number',
            v_employee.tax_number,

          'birth_date',
            v_employee.birth_date,

          'certificate_identity',
            jsonb_build_object(

              'nature_of_person',
                v_employee.nature_of_person,

              'identity_type',
                v_employee.identity_type,

              'identity_number_present',
                nullif(
                  btrim(
                    coalesce(
                      v_employee.identity_number,
                      ''
                    )
                  ),
                  ''
                ) is not null,

              'passport_country_code',
                v_employee.passport_country_code,

              'nationality_country_code',
                v_employee.nationality_country_code
            ),

          'periods',
            jsonb_build_object(

              'pay_runs',
                v_employee.pay_runs,

              'first_period',
                v_employee.first_payroll_period,

              'last_period',
                v_employee.last_payroll_period
            ),

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

          'profile_data_ready',
            jsonb_array_length(
              v_employee_blockers
            ) = 0,

          'blockers',
            v_employee_blockers,

          'certificate_type',
            'to_be_determined_by_sars_source_code_engine',

          'certificate_generated',
            false
        )
      );

  end loop;


  return jsonb_build_object(

    'ok',
      true,

    'tax_year',
      v_tax_year,

    'period_type',
      v_period_type,

    'period_code',
      v_period_code,

    'period_start',
      v_period_start,

    'period_end',
      v_period_end,

    'employees_total',
      v_employee_count,

    'profile_ready',
      v_ready_count,

    'profile_blocked',
      v_blocked_count,

    'financial_totals',
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
          ),

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
            v_uif_employee
            +
            v_uif_employer,
            2
          ),

        'sdl',
          round(
            v_sdl,
            2
          )
      ),

    'source_code_engine',
      jsonb_build_object(

        'implemented',
          false,

        'sars_csv_generated',
          false,

        'certificate_numbers_generated',
          false,

        'message',
          'Employee identity and payroll readiness are checked in Sprint 23.12. SARS source-code mapping and certificate generation are intentionally not yet performed.'
      ),

    'employees',
      v_employees

  );

end;
$$;
-- ============================================================
-- 5. EMP501 RECONCILIATION WORKSPACE
--
-- Reconciles:
--   A. Effective EMP201 liabilities
--   B. Actual statutory payments
--   C. Employee payroll certificate totals
--
-- Accepted amendments replace the original declaration values
-- for reconciliation purposes.
--
-- Submitted-but-not-accepted amendments are surfaced as a
-- blocker and do not silently change effective liabilities.
-- ============================================================

create or replace function public.get_payroll_emp501_reconciliation_workspace(
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

  v_period_code text;

  v_expected_months integer;

  v_settings public.payroll_employer_settings%rowtype;

  v_irp5 jsonb;

  v_months_with_declarations integer := 0;

  v_missing_months jsonb :=
    '[]'::jsonb;

  v_pending_amendments integer := 0;

  v_payroll_runs integer := 0;

  v_payroll_employees integer := 0;

  v_declared_paye numeric := 0;
  v_declared_uif numeric := 0;
  v_declared_sdl numeric := 0;
  v_declared_eti numeric := 0;
  v_declared_total numeric := 0;

  v_paid_paye numeric := 0;
  v_paid_uif numeric := 0;
  v_paid_sdl numeric := 0;
  v_paid_total numeric := 0;

  v_certificate_paye numeric := 0;
  v_certificate_uif numeric := 0;
  v_certificate_sdl numeric := 0;

  v_diff_paye numeric := 0;
  v_diff_uif numeric := 0;
  v_diff_sdl numeric := 0;

  v_due_by_to_you numeric := 0;

  v_profile_blocked integer := 0;

  v_blockers jsonb :=
    '[]'::jsonb;

  v_warnings jsonb :=
    '[]'::jsonb;

  v_financially_reconciled boolean := false;
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
      extract(year from current_date)::integer
    );


  if v_tax_year < 2000
     or v_tax_year > 2100
  then

    raise exception
      'Invalid South African tax year.';

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
      'EMP501 period type must be interim or annual.';

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

    v_period_code :=
      '08';

    v_expected_months :=
      6;

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

    v_period_code :=
      '02';

    v_expected_months :=
      12;

  end if;


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


  -- ----------------------------------------------------------
  -- Employer registration readiness
  -- ----------------------------------------------------------

  if nullif(
    btrim(
      coalesce(
        v_settings.paye_reference,
        ''
      )
    ),
    ''
  ) is null

  and nullif(
    btrim(
      coalesce(
        v_settings.income_tax_reference,
        ''
      )
    ),
    ''
  ) is null then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'Employer PAYE or Income Tax reference required for tax-certificate reconciliation is missing.'
      );

  end if;


  if coalesce(
    v_settings.uif_enabled,
    false
  )

  and nullif(
    btrim(
      coalesce(
        v_settings.uif_reference,
        ''
      )
    ),
    ''
  ) is null then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'UIF is enabled but the employer UIF reference is missing.'
      );

  end if;


  if coalesce(
    v_settings.sdl_enabled,
    false
  )

  and nullif(
    btrim(
      coalesce(
        v_settings.sdl_reference,
        ''
      )
    ),
    ''
  ) is null then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'SDL is enabled but the employer SDL reference is missing.'
      );

  end if;


  -- ----------------------------------------------------------
  -- Monthly declaration coverage
  -- ----------------------------------------------------------

  with months as (

    select
      gs::date as period_month

    from generate_series(
      date_trunc(
        'month',
        v_period_start
      )::date,

      date_trunc(
        'month',
        v_period_end
      )::date,

      interval '1 month'
    ) gs

  ),

  declaration_months as (

    select distinct
      d.period_month

    from public.payroll_emp201_declaration d

    where
      d.company_id =
        v_company_id

      and d.period_month between
        date_trunc(
          'month',
          v_period_start
        )::date

        and

        date_trunc(
          'month',
          v_period_end
        )::date

  )

  select

    count(dm.period_month),

    coalesce(
      jsonb_agg(
        to_char(
          m.period_month,
          'YYYY-MM'
        )
        order by m.period_month
      )
      filter (
        where dm.period_month
              is null
      ),
      '[]'::jsonb
    )

  into
    v_months_with_declarations,
    v_missing_months

  from months m

  left join declaration_months dm
    on dm.period_month =
       m.period_month;


  if v_months_with_declarations <
     v_expected_months then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'One or more EMP201 declaration months are missing from the reconciliation period.'
      );

  end if;


  -- ----------------------------------------------------------
  -- Submitted but not yet SARS-accepted amendments
  -- ----------------------------------------------------------

  select count(*)
  into v_pending_amendments

  from public.payroll_emp201_amendment a

  join public.payroll_emp201_declaration d
    on d.id =
       a.declaration_id

   and d.company_id =
       a.company_id

  where
    a.company_id =
      v_company_id

    and d.period_month between
      date_trunc(
        'month',
        v_period_start
      )::date

      and

      date_trunc(
        'month',
        v_period_end
      )::date

    and a.status =
      'submitted';


  if v_pending_amendments > 0 then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'One or more EMP201 amendments are submitted but not yet recorded as accepted by SARS.'
      );

  end if;


  -- ----------------------------------------------------------
  -- Effective EMP201 liabilities
  --
  -- Latest ACCEPTED amendment wins.
  -- Otherwise original declaration remains effective.
  -- ----------------------------------------------------------

  with declarations as (

    select d.*

    from public.payroll_emp201_declaration d

    where
      d.company_id =
        v_company_id

      and d.period_month between
        date_trunc(
          'month',
          v_period_start
        )::date

        and

        date_trunc(
          'month',
          v_period_end
        )::date

  ),

  effective as (

    select
      d.id as declaration_id,

      d.period_month,

      coalesce(
        a.corrected_paye_liability,
        d.paye_liability
      ) as paye,

      coalesce(
        a.corrected_uif_liability,
        d.uif_liability
      ) as uif,

      coalesce(
        a.corrected_sdl_liability,
        d.sdl_liability
      ) as sdl,

      coalesce(
        a.corrected_eti_utilised,
        d.eti_utilised
      ) as eti,

      coalesce(
        a.corrected_total_payable,
        d.total_payable
      ) as total

    from declarations d

    left join lateral (

      select
        x.*

      from public.payroll_emp201_amendment x

      where
        x.company_id =
          d.company_id

        and x.declaration_id =
          d.id

        and x.status =
          'accepted'

      order by
        x.amendment_number desc

      limit 1

    ) a
      on true

  )

  select
    coalesce(
      sum(paye),
      0
    ),

    coalesce(
      sum(uif),
      0
    ),

    coalesce(
      sum(sdl),
      0
    ),

    coalesce(
      sum(eti),
      0
    ),

    coalesce(
      sum(total),
      0
    )

  into
    v_declared_paye,
    v_declared_uif,
    v_declared_sdl,
    v_declared_eti,
    v_declared_total

  from effective;


  -- ----------------------------------------------------------
  -- Actual statutory payments recorded for those declarations
  -- Reversed payments are excluded.
  -- ----------------------------------------------------------

  select

    coalesce(
      sum(p.paye_amount),
      0
    ),

    coalesce(
      sum(p.uif_amount),
      0
    ),

    coalesce(
      sum(p.sdl_amount),
      0
    )

  into
    v_paid_paye,
    v_paid_uif,
    v_paid_sdl

  from public.payroll_statutory_payment p

  join public.payroll_emp201_declaration d
    on d.id =
       p.declaration_id

   and d.company_id =
       p.company_id

  where
    p.company_id =
      v_company_id

    and p.status =
      'posted'

    and d.period_month between
      date_trunc(
        'month',
        v_period_start
      )::date

      and

      date_trunc(
        'month',
        v_period_end
      )::date;


  v_paid_total :=
    round(
      v_paid_paye
      +
      v_paid_uif
      +
      v_paid_sdl,
      2
    );


  -- ----------------------------------------------------------
  -- Payroll / employee certificate financial totals
  -- ----------------------------------------------------------

  select

    count(
      distinct pr.id
    ),

    count(
      distinct pre.employee_id
    ),

    coalesce(
      sum(pre.paye_amount),
      0
    ),

    coalesce(
      sum(
        pre.uif_employee
        +
        pre.uif_employer
      ),
      0
    ),

    coalesce(
      sum(pre.sdl_employer),
      0
    )

  into
    v_payroll_runs,
    v_payroll_employees,
    v_certificate_paye,
    v_certificate_uif,
    v_certificate_sdl

  from public.payroll_pay_run_employee pre

  join public.payroll_pay_run pr
    on pr.id =
       pre.pay_run_id

   and pr.company_id =
       pre.company_id

  where
    pre.company_id =
      v_company_id

    and pr.tax_year =
      v_tax_year

    and pr.payment_date between
      v_period_start
      and v_period_end

    and pr.status in (
      'posted',
      'paid'
    );


  if v_payroll_runs = 0 then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'No posted payroll runs exist for this reconciliation period.'
      );

  end if;


  -- ----------------------------------------------------------
  -- EMP201 vs payroll certificate reconciliation
  -- ----------------------------------------------------------

  v_diff_paye :=
    round(
      v_declared_paye
      -
      v_certificate_paye,
      2
    );


  v_diff_uif :=
    round(
      v_declared_uif
      -
      v_certificate_uif,
      2
    );


  v_diff_sdl :=
    round(
      v_declared_sdl
      -
      v_certificate_sdl,
      2
    );


  if abs(v_diff_paye) > 0.005 then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'PAYE declared on effective EMP201 records does not reconcile to payroll employee totals.'
      );

  end if;


  if abs(v_diff_uif) > 0.005 then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'UIF declared on effective EMP201 records does not reconcile to payroll employee totals.'
      );

  end if;


  if abs(v_diff_sdl) > 0.005 then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'SDL declared on effective EMP201 records does not reconcile to payroll employee totals.'
      );

  end if;


  -- ----------------------------------------------------------
  -- Employee certificate profile readiness
  -- ----------------------------------------------------------

  v_irp5 :=
    public.get_payroll_irp5_readiness(
      v_tax_year,
      v_period_type
    );


  v_profile_blocked :=
    coalesce(
      nullif(
        v_irp5
        ->>
        'profile_blocked',
        ''
      )::integer,
      0
    );


  if v_profile_blocked > 0 then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'One or more employees have incomplete IRP5/IT3(a) identity or tax-reference data.'
      );

  end if;


  -- ----------------------------------------------------------
  -- Due by / due to employer
  --
  -- Positive = due by employer
  -- Negative = possible amount due to employer / credit
  -- ----------------------------------------------------------

  v_due_by_to_you :=
    round(
      v_declared_total
      -
      v_paid_total,
      2
    );


  v_financially_reconciled :=
    abs(v_diff_paye) <= 0.005

    and abs(v_diff_uif) <= 0.005

    and abs(v_diff_sdl) <= 0.005;


  -- ----------------------------------------------------------
  -- Sprint boundary
  -- ----------------------------------------------------------

  v_warnings :=
    v_warnings ||
    jsonb_build_array(
      'Sprint 23.12 prepares reconciliation and employee certificate readiness only. Nexus has not submitted an EMP501 to SARS.'
    );


  v_warnings :=
    v_warnings ||
    jsonb_build_array(
      'SARS tax-certificate income, deduction and tax source-code mapping is not yet generated in this sprint.'
    );


  v_warnings :=
    v_warnings ||
    jsonb_build_array(
      'IRP5/IT3(a) certificate numbers and SARS CSV/e@syFile export are not generated until the certificate source-code engine is implemented and validated against the applicable SARS BRS.'
    );


  -- Source-code engine is deliberately a final blocker.
  -- This prevents the system claiming submission readiness.

  v_blockers :=
    v_blockers ||
    jsonb_build_array(
      'SARS IRP5/IT3(a) source-code mapping and certificate export engine has not yet been implemented.'
    );


  return jsonb_build_object(

    'ok',
      true,


    'reconciliation',
      jsonb_build_object(

        'tax_year',
          v_tax_year,

        'period_type',
          v_period_type,

        'period_code',
          v_period_code,

        'period_start',
          v_period_start,

        'period_end',
          v_period_end,

        'expected_emp201_months',
          v_expected_months,

        'emp201_months_present',
          v_months_with_declarations,

        'missing_months',
          v_missing_months
      ),


    'employer',
      jsonb_build_object(

        'paye_enabled',
          coalesce(
            v_settings.paye_enabled,
            false
          ),

        'paye_reference',
          v_settings.paye_reference,

        'income_tax_reference',
          v_settings.income_tax_reference,

        'uif_enabled',
          coalesce(
            v_settings.uif_enabled,
            false
          ),

        'uif_reference',
          v_settings.uif_reference,

        'sdl_enabled',
          coalesce(
            v_settings.sdl_enabled,
            false
          ),

        'sdl_reference',
          v_settings.sdl_reference
      ),


    'payroll',
      jsonb_build_object(

        'posted_runs',
          v_payroll_runs,

        'employees',
          v_payroll_employees
      ),


    'emp201_effective_liabilities',
      jsonb_build_object(

        'paye',
          round(
            v_declared_paye,
            2
          ),

        'uif',
          round(
            v_declared_uif,
            2
          ),

        'sdl',
          round(
            v_declared_sdl,
            2
          ),

        'eti',
          round(
            v_declared_eti,
            2
          ),

        'total_payable',
          round(
            v_declared_total,
            2
          )
      ),


    'actual_payments',
      jsonb_build_object(

        'paye',
          round(
            v_paid_paye,
            2
          ),

        'uif',
          round(
            v_paid_uif,
            2
          ),

        'sdl',
          round(
            v_paid_sdl,
            2
          ),

        'total',
          v_paid_total
      ),


    'employee_certificate_totals',
      jsonb_build_object(

        'paye',
          round(
            v_certificate_paye,
            2
          ),

        'uif',
          round(
            v_certificate_uif,
            2
          ),

        'sdl',
          round(
            v_certificate_sdl,
            2
          )
      ),


    'reconciliation_difference',
      jsonb_build_object(

        'paye',
          v_diff_paye,

        'uif',
          v_diff_uif,

        'sdl',
          v_diff_sdl,

        'financially_reconciled',
          v_financially_reconciled
      ),


    'payment_position',
      jsonb_build_object(

        'declared_total',
          round(
            v_declared_total,
            2
          ),

        'payments',
          v_paid_total,

        'due_by_or_to_employer',
          v_due_by_to_you,

        'position',
          case

            when v_due_by_to_you > 0.005
              then 'due_by_employer'

            when v_due_by_to_you < -0.005
              then 'possible_credit_due_to_employer'

            else 'settled'

          end
      ),


    'pending_emp201_amendments',
      v_pending_amendments,


    'irp5_it3a_readiness',
      v_irp5,


    'readiness',
      jsonb_build_object(

        'financially_reconciled',
          v_financially_reconciled,

        'employee_profiles_ready',
          v_profile_blocked = 0,

        'source_code_engine_ready',
          false,

        'sars_export_ready',
          false,

        'submission_ready',
          false,

        'submitted_by_nexus',
          false,

        'blockers',
          v_blockers,

        'warnings',
          v_warnings
      ),


    'next_engine',
      jsonb_build_object(

        'required',
          true,

        'name',
          'SARS IRP5/IT3(a) source-code and certificate engine',

        'must_validate_against_current_brs',
          true
      )

  );

end;
$$;
-- ============================================================
-- 6. SECURITY
-- ============================================================

revoke all
on function public.save_payroll_tax_certificate_profile(
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  boolean,
  boolean
)
from public;
revoke all
on function public.save_payroll_tax_certificate_profile(
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  boolean,
  boolean
)
from anon;
grant execute
on function public.save_payroll_tax_certificate_profile(
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  boolean,
  boolean
)
to authenticated;
revoke all
on function public.get_payroll_irp5_readiness(
  integer,
  text
)
from public;
revoke all
on function public.get_payroll_irp5_readiness(
  integer,
  text
)
from anon;
grant execute
on function public.get_payroll_irp5_readiness(
  integer,
  text
)
to authenticated;
revoke all
on function public.get_payroll_emp501_reconciliation_workspace(
  integer,
  text
)
from public;
revoke all
on function public.get_payroll_emp501_reconciliation_workspace(
  integer,
  text
)
from anon;
grant execute
on function public.get_payroll_emp501_reconciliation_workspace(
  integer,
  text
)
to authenticated;
comment on table public.payroll_tax_certificate_profile
is
'Employee identity and demographic information used for SARS IRP5/IT3(a) certificate readiness. It remains separate from ordinary HR and salary records.';
comment on function public.get_payroll_irp5_readiness(
  integer,
  text
)
is
'Checks employee payroll, tax reference and identity information needed before SARS employee tax certificates can be generated. Does not generate or submit IRP5/IT3(a) certificates.';
comment on function public.get_payroll_emp501_reconciliation_workspace(
  integer,
  text
)
is
'Reconciles effective EMP201 liabilities, actual statutory payments and payroll employee totals for interim or annual EMP501 preparation. Accepted EMP201 amendments are respected; submitted-only amendments are surfaced as blockers. SARS submission and certificate export are not performed.';
