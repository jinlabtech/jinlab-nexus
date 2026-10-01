-- ============================================================
-- JINLAB NEXUS
-- Sprint 23.14
-- IRP5 / IT3(a) Certificate Assembly + Export Validator
-- SARS BRS baseline: v25.3.0
-- ============================================================


-- ============================================================
-- 1. SARS NUMBER VALIDATION HELPERS
-- ============================================================

create or replace function public.validate_sars_tax_reference_mod10(
  p_number text
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v text;
  v_sum integer := 0;
  v_digit integer;
  v_calc integer;
  v_check integer;
  i integer;
begin

  v := regexp_replace(
    coalesce(p_number, ''),
    '[^0-9]',
    '',
    'g'
  );

  if length(v) <> 10 then
    return false;
  end if;

  for i in 1..9 loop

    v_digit :=
      substr(v, i, 1)::integer;

    if mod(i, 2) = 1 then

      v_calc :=
        v_digit * 2;

      v_sum :=
        v_sum
        + (v_calc / 10)
        + mod(v_calc, 10);

    else

      v_sum :=
        v_sum + v_digit;

    end if;

  end loop;


  v_check :=
    mod(
      10 - mod(v_sum, 10),
      10
    );


  return
    v_check =
    substr(v, 10, 1)::integer;

end;
$$;
create or replace function public.validate_sa_identity_mod13(
  p_number text
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v text;

  v_odd_sum integer := 0;

  v_even_text text := '';

  v_even_double bigint;

  v_even_sum integer := 0;

  v_total integer;

  v_check integer;

  i integer;

  c text;
begin

  v :=
    regexp_replace(
      coalesce(p_number, ''),
      '[^0-9]',
      '',
      'g'
    );


  if length(v) <> 13 then
    return false;
  end if;


  for i in 1..11 by 2 loop

    v_odd_sum :=
      v_odd_sum
      +
      substr(
        v,
        i,
        1
      )::integer;

  end loop;


  for i in 2..12 by 2 loop

    v_even_text :=
      v_even_text ||
      substr(
        v,
        i,
        1
      );

  end loop;


  v_even_double :=
    v_even_text::bigint * 2;


  foreach c in array
    regexp_split_to_array(
      v_even_double::text,
      ''
    )
  loop

    if c <> '' then

      v_even_sum :=
        v_even_sum
        +
        c::integer;

    end if;

  end loop;


  v_total :=
    v_odd_sum
    +
    v_even_sum;


  v_check :=
    mod(
      10 - mod(v_total, 10),
      10
    );


  return
    v_check =
    substr(
      v,
      13,
      1
    )::integer;

end;
$$;
-- ============================================================
-- 2. ASSEMBLED TAX CERTIFICATE REGISTRY
-- ============================================================

create table if not exists public.payroll_tax_certificate (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  employee_id uuid not null
    references public.hr_employee(id)
    on delete restrict,

  tax_year integer not null,

  period_type text not null
    check (
      period_type in (
        'interim',
        'annual'
      )
    ),

  reconciliation_period_code text not null
    check (
      reconciliation_period_code in (
        '08',
        '02'
      )
    ),

  certificate_number text not null
    check (
      certificate_number ~ '^[A-Z0-9]{30}$'
    ),

  certificate_type text not null
    check (
      certificate_type in (
        'IRP5',
        'IT3(a)'
      )
    ),

  brs_version text not null
    default '25.3.0',

  certificate_tax_period_start date not null,

  certificate_tax_period_end date not null,

  pay_periods_in_year numeric not null,

  periods_worked numeric not null,

  employee_snapshot jsonb not null
    default '{}'::jsonb,

  financial_source_snapshot jsonb not null
    default '[]'::jsonb,

  ordered_export_fields jsonb not null
    default '[]'::jsonb,

  validation_snapshot jsonb not null
    default '{}'::jsonb,

  status text not null
    default 'assembled'
    check (
      status in (
        'assembled',
        'validated',
        'cancelled'
      )
    ),

  assembled_by uuid
    references auth.users(id)
    on delete set null,

  assembled_at timestamptz not null
    default now(),

  validated_at timestamptz,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  unique (
    company_id,
    certificate_number
  ),

  unique (
    company_id,
    employee_id,
    tax_year,
    period_type,
    reconciliation_period_code
  ),

  check (
    certificate_tax_period_end
    >=
    certificate_tax_period_start
  )
);
create index if not exists
payroll_tax_certificate_company_period_idx
on public.payroll_tax_certificate (
  company_id,
  tax_year,
  period_type,
  reconciliation_period_code
);
alter table public.payroll_tax_certificate
enable row level security;
revoke all
on table public.payroll_tax_certificate
from anon;
revoke all
on table public.payroll_tax_certificate
from authenticated;
-- ============================================================
-- 3. CERTIFICATE ASSEMBLY PREVIEW
-- ============================================================

create or replace function public.get_payroll_irp5_certificate_assembly_preview(
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

  v_tax_start date;
  v_period_end date;

  v_default_period_code text;

  v_settings public.payroll_employer_settings%rowtype;

  v_employer_reference text;

  v_source jsonb;

  v_source_employee jsonb;

  v_employee public.hr_employee%rowtype;

  v_profile public.payroll_employee_profile%rowtype;

  v_tax_profile public.payroll_tax_certificate_profile%rowtype;

  v_certificate_type text;

  v_certificate_period_code text;

  v_cert_start date;
  v_cert_end date;

  v_pay_periods numeric := 0;

  v_periods_worked numeric := 0;

  v_initials text;

  v_blockers jsonb;

  v_address jsonb;

  v_country text;

  v_postal_code text;

  v_source_ready boolean;

  v_records jsonb :=
    '[]'::jsonb;

  v_ready integer := 0;

  v_blocked integer := 0;
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


  v_tax_start :=
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

    v_default_period_code :=
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

    v_default_period_code :=
      '02';

  end if;


  select *
  into v_settings

  from public.payroll_employer_settings

  where company_id =
    v_company_id;


  v_employer_reference :=
    regexp_replace(
      coalesce(
        nullif(
          btrim(
            v_settings.paye_reference
          ),
          ''
        ),
        nullif(
          btrim(
            v_settings.income_tax_reference
          ),
          ''
        ),
        ''
      ),
      '[^0-9]',
      '',
      'g'
    );


  v_source :=
    public.get_payroll_irp5_source_code_preview(
      v_tax_year,
      v_period_type
    );


  for v_source_employee in

    select value

    from jsonb_array_elements(
      coalesce(
        v_source -> 'employees',
        '[]'::jsonb
      )
    )

  loop

    v_blockers :=
      '[]'::jsonb;


    v_source_ready :=
      coalesce(
        (
          v_source_employee
          ->>
          'source_code_ready'
        )::boolean,
        false
      );


    select *
    into v_employee

    from public.hr_employee

    where
      id =
        (
          v_source_employee
          ->>
          'employee_id'
        )::uuid

      and company_id =
        v_company_id;


    select *
    into v_profile

    from public.payroll_employee_profile

    where
      company_id =
        v_company_id

      and employee_id =
        v_employee.id;


    select *
    into v_tax_profile

    from public.payroll_tax_certificate_profile

    where
      company_id =
        v_company_id

      and employee_id =
        v_employee.id;


    v_certificate_type :=
      v_source_employee
      ->>
      'certificate_type';


    -- Final certificate during interim uses 02.

    if v_period_type = 'interim'
       and v_employee.end_date is not null
       and v_employee.end_date <= v_period_end
    then

      v_certificate_period_code :=
        '02';

    else

      v_certificate_period_code :=
        v_default_period_code;

    end if;


    v_cert_start :=
      greatest(
        v_tax_start,
        v_employee.hire_date
      );


    v_cert_end :=
      least(
        v_period_end,
        coalesce(
          v_employee.end_date,
          v_period_end
        )
      );


    v_pay_periods :=
      case
        when v_profile.pay_frequency = 'weekly'
          then 52
        when v_profile.pay_frequency = 'fortnightly'
          then 26
        else 12
      end;


    select count(
      distinct pr.id
    )
    into v_periods_worked

    from public.payroll_pay_run pr

    join public.payroll_pay_run_employee pre
      on pre.pay_run_id =
         pr.id

     and pre.company_id =
         pr.company_id

    where
      pr.company_id =
        v_company_id

      and pre.employee_id =
        v_employee.id

      and pr.tax_year =
        v_tax_year

      and pr.payment_date between
        v_tax_start
        and v_period_end

      and pr.status in (
        'posted',
        'paid'
      );


    select
      coalesce(
        string_agg(
          left(
            upper(x),
            1
          ),
          ''
        ),
        ''
      )
    into v_initials

    from regexp_split_to_table(
      btrim(
        coalesce(
          v_employee.first_name,
          ''
        )
      ),
      '\s+'
    ) x;


    v_initials :=
      left(
        v_initials,
        5
      );


    -- --------------------------------------------------------
    -- Employer certificate number prefix
    -- --------------------------------------------------------

    if length(
      v_employer_reference
    ) <> 10 then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'Employer PAYE/Income Tax reference must contain exactly 10 digits before certificate numbers can be generated.'
        );

    end if;


    -- --------------------------------------------------------
    -- Source-code engine
    -- --------------------------------------------------------

    if not v_source_ready then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'Employee SARS financial source-code mapping is not ready.'
        );

    end if;


    -- --------------------------------------------------------
    -- Employee payroll profile
    -- --------------------------------------------------------

    if v_profile.id is null then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'Payroll employee profile is missing.'
        );

    end if;


    if nullif(
      btrim(
        coalesce(
          v_profile.tax_number,
          ''
        )
      ),
      ''
    ) is null then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'Employee Income Tax reference number is missing.'
        );

    elsif not public.validate_sars_tax_reference_mod10(
      v_profile.tax_number
    ) then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'Employee Income Tax reference number fails the Nexus SARS modulus-10 validation.'
        );

    end if;


    if v_profile.birth_date is null then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'Employee date of birth is missing.'
        );

    end if;


    -- --------------------------------------------------------
    -- Basic personal information
    -- --------------------------------------------------------

    if nullif(
      btrim(
        coalesce(
          v_employee.last_name,
          ''
        )
      ),
      ''
    ) is null then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'Employee surname is missing.'
        );

    end if;


    if nullif(
      btrim(
        coalesce(
          v_employee.first_name,
          ''
        )
      ),
      ''
    ) is null then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'Employee first name is missing.'
        );

    end if;


    if nullif(
      btrim(
        coalesce(
          v_initials,
          ''
        )
      ),
      ''
    ) is null then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'Employee initials could not be derived.'
        );

    end if;


    -- --------------------------------------------------------
    -- Tax certificate identity profile
    -- --------------------------------------------------------

    if v_tax_profile.id is null then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'Tax-certificate identity profile is missing.'
        );

    else

      if nullif(
        btrim(
          coalesce(
            v_tax_profile.nature_of_person,
            ''
          )
        ),
        ''
      ) is null then

        v_blockers :=
          v_blockers ||
          jsonb_build_array(
            'Nature of person is missing.'
          );

      elsif upper(
        v_tax_profile.nature_of_person
      ) not in (
        'A',
        'B',
        'C',
        'M',
        'N',
        'R'
      ) then

        v_blockers :=
          v_blockers ||
          jsonb_build_array(
            'Sprint 23.14 certificate assembly currently supports natural-person SARS nature codes A/B/C/M/N/R only.'
          );

      end if;


      if v_tax_profile.identity_type =
         'south_african_id'
      then

        if not public.validate_sa_identity_mod13(
          v_tax_profile.identity_number
        ) then

          v_blockers :=
            v_blockers ||
            jsonb_build_array(
              'South African identity number fails the SARS modulus-13 validation.'
            );

        end if;


        if v_profile.birth_date is not null
           and left(
             regexp_replace(
               coalesce(
                 v_tax_profile.identity_number,
                 ''
               ),
               '[^0-9]',
               '',
               'g'
             ),
             6
           )
           <>
           to_char(
             v_profile.birth_date,
             'YYMMDD'
           )
        then

          v_blockers :=
            v_blockers ||
            jsonb_build_array(
              'South African identity number does not correlate with employee date of birth.'
            );

        end if;


      elsif v_tax_profile.identity_type =
            'passport'
      then

        if length(
          btrim(
            coalesce(
              v_tax_profile.identity_number,
              ''
            )
          )
        ) < 6 then

          v_blockers :=
            v_blockers ||
            jsonb_build_array(
              'Passport number must contain at least six characters.'
            );

        end if;


        if length(
          btrim(
            coalesce(
              v_tax_profile.passport_country_code,
              ''
            )
          )
        ) <> 3 then

          v_blockers :=
            v_blockers ||
            jsonb_build_array(
              'Passport country of issue must be a three-character SARS country code.'
            );

        end if;


      else

        v_blockers :=
          v_blockers ||
          jsonb_build_array(
            'Alternate identification export is not yet supported by the certificate assembler.'
          );

      end if;

    end if;


    -- --------------------------------------------------------
    -- Residential address
    --
    -- Nexus JSON structure:
    -- unit_number
    -- complex
    -- street_number
    -- street_name
    -- suburb
    -- city
    -- postal_code
    -- country_code
    -- --------------------------------------------------------

    v_address :=
      coalesce(
        v_tax_profile.residential_address,
        '{}'::jsonb
      );


    v_country :=
      upper(
        coalesce(
          nullif(
            btrim(
              v_address
              ->>
              'country_code'
            ),
            ''
          ),
          'ZA'
        )
      );


    v_postal_code :=
      nullif(
        btrim(
          v_address
          ->>
          'postal_code'
        ),
        ''
      );


    if nullif(
      btrim(
        v_address
        ->>
        'street_name'
      ),
      ''
    ) is null then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'Residential street/name of farm is missing.'
        );

    end if;


    if nullif(
      btrim(
        coalesce(
          v_address ->> 'suburb',
          v_address ->> 'city'
        )
      ),
      ''
    ) is null then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'Residential suburb/district or city/town is required.'
        );

    end if;


    if length(
      v_country
    ) <> 2 then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'Residential country code must contain two characters.'
        );

    end if;


    if v_country = 'ZA'
       and (
         v_postal_code is null
         or v_postal_code !~ '^[0-9]{4}$'
         or v_postal_code = '0000'
       )
    then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'South African residential postal code must contain four digits and may not be 0000.'
        );

    end if;


    -- --------------------------------------------------------
    -- Certificate period
    -- --------------------------------------------------------

    if v_cert_end <
       v_cert_start then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'Certificate tax period is invalid.'
        );

    end if;


    if v_periods_worked <= 0 then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'No posted payroll periods were found for this employee.'
        );

    end if;


    if jsonb_array_length(
      v_blockers
    ) = 0 then

      v_ready :=
        v_ready + 1;

    else

      v_blocked :=
        v_blocked + 1;

    end if;


    v_records :=
      v_records ||
      jsonb_build_array(
        jsonb_build_object(

          'employee_id',
            v_employee.id,

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

          'certificate_period_code',
            v_certificate_period_code,

          'certificate_number_prefix',
            case
              when length(
                v_employer_reference
              ) = 10
              then
                v_employer_reference
                ||
                v_tax_year::text
                ||
                v_certificate_period_code
              else null
            end,

          'certificate_period',
            jsonb_build_object(

              'start',
                v_cert_start,

              'end',
                v_cert_end,

              'pay_periods_in_year',
                v_pay_periods,

              'periods_worked',
                v_periods_worked
            ),

          'employee_fields',
            jsonb_build_object(

              '3015_certificate_type',
                v_certificate_type,

              '3020_nature_of_person',
                upper(
                  v_tax_profile.nature_of_person
                ),

              '3025_year_of_assessment',
                v_tax_year,

              '3030_surname',
                v_employee.last_name,

              '3040_first_names',
                v_employee.first_name,

              '3050_initials',
                v_initials,

              '3060_identity_number',
                case
                  when v_tax_profile.identity_type =
                       'south_african_id'
                    then regexp_replace(
                      coalesce(
                        v_tax_profile.identity_number,
                        ''
                      ),
                      '[^0-9]',
                      '',
                      'g'
                    )
                  else null
                end,

              '3070_passport_number',
                case
                  when v_tax_profile.identity_type =
                       'passport'
                    then v_tax_profile.identity_number
                  else null
                end,

              '3075_passport_country',
                case
                  when v_tax_profile.identity_type =
                       'passport'
                    then upper(
                      v_tax_profile.passport_country_code
                    )
                  else null
                end,

              '3080_date_of_birth',
                case
                  when v_profile.birth_date
                       is not null
                    then to_char(
                      v_profile.birth_date,
                      'YYYYMMDD'
                    )
                  else null
                end,

              '3100_income_tax_reference',
                regexp_replace(
                  coalesce(
                    v_profile.tax_number,
                    ''
                  ),
                  '[^0-9]',
                  '',
                  'g'
                ),

              '3160_employee_number',
                v_employee.employee_number,

              '3170_certificate_start',
                to_char(
                  v_cert_start,
                  'YYYYMMDD'
                ),

              '3180_certificate_end',
                to_char(
                  v_cert_end,
                  'YYYYMMDD'
                ),

              '3200_pay_periods_in_year',
                v_pay_periods,

              '3210_periods_worked',
                v_periods_worked,

              '3211_residential_unit',
                v_address ->> 'unit_number',

              '3212_residential_complex',
                v_address ->> 'complex',

              '3213_residential_street_number',
                v_address ->> 'street_number',

              '3214_residential_street',
                v_address ->> 'street_name',

              '3215_residential_suburb',
                v_address ->> 'suburb',

              '3216_residential_city',
                v_address ->> 'city',

              '3217_residential_postal_code',
                v_postal_code,

              '3285_residential_country',
                v_country
            ),

          'financial_source_codes',
            v_source_employee
            -> 'source_codes',

          'assembly_ready',
            jsonb_array_length(
              v_blockers
            ) = 0,

          'blockers',
            v_blockers

        )
      );

  end loop;


  return jsonb_build_object(

    'ok',
      true,

    'engine',
      jsonb_build_object(

        'name',
          'Nexus IRP5/IT3(a) Certificate Assembler',

        'brs_version',
          '25.3.0',

        'tax_year',
          v_tax_year,

        'period_type',
          v_period_type,

        'period_start',
          v_tax_start,

        'period_end',
          v_period_end
      ),

    'employer_reference',
      case
        when length(
          v_employer_reference
        ) = 10
          then v_employer_reference
        else null
      end,

    'certificate_number_format',
      '10 digit employer reference + 4 digit transaction year + 2 digit reconciliation period + 14 unique uppercase alphanumeric characters',

    'employees_total',
      v_ready + v_blocked,

    'assembly_ready',
      v_ready,

    'assembly_blocked',
      v_blocked,

    'all_records_ready',
      v_ready > 0
      and v_blocked = 0,

    'certificates',
      v_records

  );

end;
$$;
-- ============================================================
-- 4. ASSEMBLE AND RESERVE CERTIFICATE NUMBERS
-- ============================================================

create or replace function public.assemble_payroll_irp5_certificates(
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

  v_preview jsonb;

  v_record jsonb;

  v_employee_id uuid;

  v_period_code text;

  v_certificate_type text;

  v_prefix text;

  v_certificate_number text;

  v_certificate_id uuid;

  v_existing public.payroll_tax_certificate%rowtype;

  v_export_fields jsonb;

  v_financial_fields jsonb;

  v_results jsonb :=
    '[]'::jsonb;

  v_created integer := 0;

  v_existing_count integer := 0;
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


  v_preview :=
    public.get_payroll_irp5_certificate_assembly_preview(
      p_tax_year,
      p_period_type
    );


  if not coalesce(
    (
      v_preview
      ->>
      'all_records_ready'
    )::boolean,
    false
  ) then

    raise exception
      'Certificate assembly is blocked. Resolve employee/employer validation errors before reserving SARS certificate numbers.';

  end if;


  for v_record in

    select value

    from jsonb_array_elements(
      v_preview
      -> 'certificates'
    )

  loop

    v_employee_id :=
      (
        v_record
        ->>
        'employee_id'
      )::uuid;


    v_period_code :=
      v_record
      ->>
      'certificate_period_code';


    v_certificate_type :=
      v_record
      ->>
      'certificate_type';


    v_prefix :=
      v_record
      ->>
      'certificate_number_prefix';


    select *
    into v_existing

    from public.payroll_tax_certificate

    where
      company_id =
        v_company_id

      and employee_id =
        v_employee_id

      and tax_year =
        p_tax_year

      and period_type =
        lower(
          p_period_type
        )

      and reconciliation_period_code =
        v_period_code

    limit 1;


    if v_existing.id is not null then

      v_existing_count :=
        v_existing_count + 1;


      v_results :=
        v_results ||
        jsonb_build_array(
          jsonb_build_object(

            'employee_id',
              v_employee_id,

            'certificate_id',
              v_existing.id,

            'certificate_number',
              v_existing.certificate_number,

            'already_assembled',
              true
          )
        );


      continue;

    end if;


    -- 16-character prefix + 14-character unique suffix = 30

    loop

      v_certificate_number :=
        upper(
          v_prefix
          ||
          substring(
            md5(
              gen_random_uuid()::text
              ||
              clock_timestamp()::text
              ||
              v_employee_id::text
            ),
            1,
            14
          )
        );


      exit when not exists (

        select 1

        from public.payroll_tax_certificate

        where
          company_id =
            v_company_id

          and certificate_number =
            v_certificate_number
      );

    end loop;


    -- --------------------------------------------------------
    -- Ordered field structure.
    --
    -- Actual comma-delimited serialization remains Sprint 23.15.
    -- 3010 MUST be first.
    -- --------------------------------------------------------

    v_export_fields :=
      jsonb_build_array(

        jsonb_build_object(
          'code',
            '3010',
          'value',
            v_certificate_number
        ),

        jsonb_build_object(
          'code',
            '3015',
          'value',
            v_certificate_type
        ),

        jsonb_build_object(
          'code',
            '3020',
          'value',
            v_record
            #>>
            '{employee_fields,3020_nature_of_person}'
        ),

        jsonb_build_object(
          'code',
            '3025',
          'value',
            p_tax_year
        ),

        jsonb_build_object(
          'code',
            '3030',
          'value',
            v_record
            #>>
            '{employee_fields,3030_surname}'
        ),

        jsonb_build_object(
          'code',
            '3040',
          'value',
            v_record
            #>>
            '{employee_fields,3040_first_names}'
        ),

        jsonb_build_object(
          'code',
            '3050',
          'value',
            v_record
            #>>
            '{employee_fields,3050_initials}'
        )
      );


    if nullif(
      v_record
      #>>
      '{employee_fields,3060_identity_number}',
      ''
    ) is not null then

      v_export_fields :=
        v_export_fields ||
        jsonb_build_array(
          jsonb_build_object(
            'code',
              '3060',
            'value',
              v_record
              #>>
              '{employee_fields,3060_identity_number}'
          )
        );

    end if;


    if nullif(
      v_record
      #>>
      '{employee_fields,3070_passport_number}',
      ''
    ) is not null then

      v_export_fields :=
        v_export_fields ||
        jsonb_build_array(

          jsonb_build_object(
            'code',
              '3070',
            'value',
              v_record
              #>>
              '{employee_fields,3070_passport_number}'
          ),

          jsonb_build_object(
            'code',
              '3075',
            'value',
              v_record
              #>>
              '{employee_fields,3075_passport_country}'
          )
        );

    end if;


    v_export_fields :=
      v_export_fields ||
      jsonb_build_array(

        jsonb_build_object(
          'code',
            '3080',
          'value',
            v_record
            #>>
            '{employee_fields,3080_date_of_birth}'
        ),

        jsonb_build_object(
          'code',
            '3100',
          'value',
            v_record
            #>>
            '{employee_fields,3100_income_tax_reference}'
        ),

        jsonb_build_object(
          'code',
            '3160',
          'value',
            v_record
            #>>
            '{employee_fields,3160_employee_number}'
        ),

        jsonb_build_object(
          'code',
            '3170',
          'value',
            v_record
            #>>
            '{employee_fields,3170_certificate_start}'
        ),

        jsonb_build_object(
          'code',
            '3180',
          'value',
            v_record
            #>>
            '{employee_fields,3180_certificate_end}'
        ),

        jsonb_build_object(
          'code',
            '3200',
          'value',
            (
              v_record
              #>>
              '{employee_fields,3200_pay_periods_in_year}'
            )::numeric
        ),

        jsonb_build_object(
          'code',
            '3210',
          'value',
            (
              v_record
              #>>
              '{employee_fields,3210_periods_worked}'
            )::numeric
        )
      );


    -- Residential address optional fields.

    if nullif(
      v_record
      #>>
      '{employee_fields,3211_residential_unit}',
      ''
    ) is not null then

      v_export_fields :=
        v_export_fields ||
        jsonb_build_array(
          jsonb_build_object(
            'code',
              '3211',
            'value',
              v_record
              #>>
              '{employee_fields,3211_residential_unit}'
          )
        );

    end if;


    if nullif(
      v_record
      #>>
      '{employee_fields,3212_residential_complex}',
      ''
    ) is not null then

      v_export_fields :=
        v_export_fields ||
        jsonb_build_array(
          jsonb_build_object(
            'code',
              '3212',
            'value',
              v_record
              #>>
              '{employee_fields,3212_residential_complex}'
          )
        );

    end if;


    if nullif(
      v_record
      #>>
      '{employee_fields,3213_residential_street_number}',
      ''
    ) is not null then

      v_export_fields :=
        v_export_fields ||
        jsonb_build_array(
          jsonb_build_object(
            'code',
              '3213',
            'value',
              v_record
              #>>
              '{employee_fields,3213_residential_street_number}'
          )
        );

    end if;


    v_export_fields :=
      v_export_fields ||
      jsonb_build_array(

        jsonb_build_object(
          'code',
            '3214',
          'value',
            v_record
            #>>
            '{employee_fields,3214_residential_street}'
        )
      );


    if nullif(
      v_record
      #>>
      '{employee_fields,3215_residential_suburb}',
      ''
    ) is not null then

      v_export_fields :=
        v_export_fields ||
        jsonb_build_array(
          jsonb_build_object(
            'code',
              '3215',
            'value',
              v_record
              #>>
              '{employee_fields,3215_residential_suburb}'
          )
        );

    end if;


    if nullif(
      v_record
      #>>
      '{employee_fields,3216_residential_city}',
      ''
    ) is not null then

      v_export_fields :=
        v_export_fields ||
        jsonb_build_array(
          jsonb_build_object(
            'code',
              '3216',
            'value',
              v_record
              #>>
              '{employee_fields,3216_residential_city}'
          )
        );

    end if;


    if nullif(
      v_record
      #>>
      '{employee_fields,3217_residential_postal_code}',
      ''
    ) is not null then

      v_export_fields :=
        v_export_fields ||
        jsonb_build_array(
          jsonb_build_object(
            'code',
              '3217',
            'value',
              v_record
              #>>
              '{employee_fields,3217_residential_postal_code}'
          )
        );

    end if;


    v_export_fields :=
      v_export_fields ||
      jsonb_build_array(
        jsonb_build_object(
          'code',
            '3285',
          'value',
            v_record
            #>>
            '{employee_fields,3285_residential_country}'
        )
      );


    -- Financial SARS source codes sorted numerically.

    select coalesce(
      jsonb_agg(
        x
        order by
          (
            x
            ->>
            'source_code'
          )::integer
      ),
      '[]'::jsonb
    )
    into v_financial_fields

    from jsonb_array_elements(
      coalesce(
        v_record
        -> 'financial_source_codes',
        '[]'::jsonb
      )
    ) x;


    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'code',
            x ->> 'source_code',

          'value',
            coalesce(
              x -> 'amount',
              x -> 'value'
            )
        )
        order by
          (
            x
            ->>
            'source_code'
          )::integer
      ),
      '[]'::jsonb
    )
    into v_financial_fields

    from jsonb_array_elements(
      v_financial_fields
    ) x;


    v_export_fields :=
      v_export_fields ||
      v_financial_fields;


    insert into public.payroll_tax_certificate (
      company_id,
      employee_id,

      tax_year,
      period_type,

      reconciliation_period_code,

      certificate_number,
      certificate_type,

      brs_version,

      certificate_tax_period_start,
      certificate_tax_period_end,

      pay_periods_in_year,
      periods_worked,

      employee_snapshot,

      financial_source_snapshot,

      ordered_export_fields,

      validation_snapshot,

      status,

      assembled_by
    )
    values (
      v_company_id,
      v_employee_id,

      p_tax_year,
      lower(
        p_period_type
      ),

      v_period_code,

      v_certificate_number,
      v_certificate_type,

      '25.3.0',

      (
        v_record
        #>>
        '{certificate_period,start}'
      )::date,

      (
        v_record
        #>>
        '{certificate_period,end}'
      )::date,

      (
        v_record
        #>>
        '{certificate_period,pay_periods_in_year}'
      )::numeric,

      (
        v_record
        #>>
        '{certificate_period,periods_worked}'
      )::numeric,

      v_record
      -> 'employee_fields',

      v_record
      -> 'financial_source_codes',

      v_export_fields,

      jsonb_build_object(
        'assembly_ready',
          true,

        'brs_version',
          '25.3.0',

        'certificate_number_length',
          length(
            v_certificate_number
          ),

        'certificate_number_pattern_valid',
          v_certificate_number
          ~
          '^[A-Z0-9]{30}$',

        'csv_serialized',
          false,

        'submitted_to_sars',
          false
      ),

      'assembled',

      auth.uid()
    )
    returning id
    into v_certificate_id;


    v_created :=
      v_created + 1;


    v_results :=
      v_results ||
      jsonb_build_array(
        jsonb_build_object(

          'employee_id',
            v_employee_id,

          'certificate_id',
            v_certificate_id,

          'certificate_number',
            v_certificate_number,

          'already_assembled',
            false
        )
      );


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

      'payroll_tax_certificate_assembled',

      'payroll',

      v_certificate_id,

      'IRP5/IT3(a) certificate record assembled and SARS certificate number reserved.',

      jsonb_build_object(
        'employee_id',
          v_employee_id,

        'tax_year',
          p_tax_year,

        'period_type',
          lower(
            p_period_type
          ),

        'certificate_number',
          v_certificate_number,

        'certificate_type',
          v_certificate_type,

        'brs_version',
          '25.3.0'
      )
    );

  end loop;


  return jsonb_build_object(

    'ok',
      true,

    'tax_year',
      p_tax_year,

    'period_type',
      lower(
        p_period_type
      ),

    'created',
      v_created,

    'already_assembled',
      v_existing_count,

    'certificates',
      v_results

  );

end;
$$;
-- ============================================================
-- 5. EXPORT VALIDATOR
-- ============================================================

create or replace function public.get_payroll_irp5_export_validation(
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

  v_preview jsonb;

  v_expected integer := 0;

  v_certificates integer := 0;

  v_invalid_numbers integer := 0;

  v_invalid_first_field integer := 0;

  v_invalid_source_order integer := 0;

  v_blockers jsonb :=
    '[]'::jsonb;
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


  v_preview :=
    public.get_payroll_irp5_certificate_assembly_preview(
      p_tax_year,
      p_period_type
    );


  v_expected :=
    coalesce(
      (
        v_preview
        ->>
        'employees_total'
      )::integer,
      0
    );


  select count(*)
  into v_certificates

  from public.payroll_tax_certificate

  where
    company_id =
      v_company_id

    and tax_year =
      p_tax_year

    and period_type =
      lower(
        p_period_type
      )

    and status <> 'cancelled';


  select count(*)
  into v_invalid_numbers

  from public.payroll_tax_certificate c

  where
    c.company_id =
      v_company_id

    and c.tax_year =
      p_tax_year

    and c.period_type =
      lower(
        p_period_type
      )

    and c.status <> 'cancelled'

    and (
      length(
        c.certificate_number
      ) <> 30

      or c.certificate_number
         !~
         '^[A-Z0-9]{30}$'

      or substring(
        c.certificate_number,
        11,
        4
      ) <> p_tax_year::text

      or substring(
        c.certificate_number,
        15,
        2
      ) <> c.reconciliation_period_code
    );


  select count(*)
  into v_invalid_first_field

  from public.payroll_tax_certificate c

  where
    c.company_id =
      v_company_id

    and c.tax_year =
      p_tax_year

    and c.period_type =
      lower(
        p_period_type
      )

    and c.status <> 'cancelled'

    and (
      c.ordered_export_fields
      -> 0
      ->>
      'code'
    ) <> '3010';


  with source_sequences as (

    select
      c.id,

      array_agg(
        (
          x ->> 'code'
        )::integer

        order by ord
      )
      filter (
        where
          (
            x ->> 'code'
          ) ~
          '^[3-9][0-9]{3}$'

          and (
            x ->> 'code'
          )::integer >= 3600
      ) as actual_codes

    from public.payroll_tax_certificate c

    cross join lateral
      jsonb_array_elements(
        c.ordered_export_fields
      )
      with ordinality
      as t(
        x,
        ord
      )

    where
      c.company_id =
        v_company_id

      and c.tax_year =
        p_tax_year

      and c.period_type =
        lower(
          p_period_type
        )

      and c.status <> 'cancelled'

    group by
      c.id

  )

  select count(*)
  into v_invalid_source_order

  from source_sequences s

  where
    s.actual_codes is not null

    and s.actual_codes
        <>
        (
          select array_agg(
            z
            order by z
          )
          from unnest(
            s.actual_codes
          ) z
        );


  if v_expected = 0 then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'No employee tax certificates are expected for this period.'
      );

  end if;


  if not coalesce(
    (
      v_preview
      ->>
      'all_records_ready'
    )::boolean,
    false
  ) then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'One or more employee certificates fail assembly validation.'
      );

  end if;


  if v_certificates <>
     v_expected then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'Not all expected employee tax certificates have been assembled.'
      );

  end if;


  if v_invalid_numbers > 0 then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'One or more SARS certificate numbers fail the 30-character format validation.'
      );

  end if;


  if v_invalid_first_field > 0 then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'One or more assembled certificate records do not begin with source code 3010.'
      );

  end if;


  if v_invalid_source_order > 0 then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'One or more certificate financial source-code sequences are not in numeric order.'
      );

  end if;


  -- Actual CSV serialization remains deliberately separate.

  v_blockers :=
    v_blockers ||
    jsonb_build_array(
      'SARS comma-delimited file serialization, employer header/control records and final e@syFile import-file generation are not implemented in Sprint 23.14.'
    );


  return jsonb_build_object(

    'ok',
      true,

    'tax_year',
      p_tax_year,

    'period_type',
      lower(
        p_period_type
      ),

    'brs_version',
      '25.3.0',

    'expected_certificates',
      v_expected,

    'assembled_certificates',
      v_certificates,

    'certificate_validation',
      jsonb_build_object(

        'invalid_certificate_numbers',
          v_invalid_numbers,

        'invalid_first_fields',
          v_invalid_first_field,

        'invalid_source_code_order',
          v_invalid_source_order,

        'core_certificate_records_valid',
          v_expected > 0
          and v_certificates = v_expected
          and v_invalid_numbers = 0
          and v_invalid_first_field = 0
          and v_invalid_source_order = 0
      ),

    'readiness',
      jsonb_build_object(

        'certificate_assembly_ready',
          coalesce(
            (
              v_preview
              ->>
              'all_records_ready'
            )::boolean,
            false
          ),

        'core_certificate_records_ready',
          v_expected > 0
          and v_certificates = v_expected
          and v_invalid_numbers = 0
          and v_invalid_first_field = 0
          and v_invalid_source_order = 0,

        'csv_export_ready',
          false,

        'sars_submission_performed',
          false,

        'blockers',
          v_blockers
      ),

    'next_engine',
      jsonb_build_object(

        'name',
          'SARS PAYE BRS CSV serializer and import-file validator',

        'certificate_numbering_complete',
          true,

        'certificate_assembly_complete',
          true,

        'csv_generation_required',
          true,

        'easyfile_submission_performed_by_nexus',
          false
      )

  );

end;
$$;
-- ============================================================
-- 6. SECURITY
-- ============================================================

revoke all
on function public.validate_sars_tax_reference_mod10(text)
from public;
revoke all
on function public.validate_sars_tax_reference_mod10(text)
from anon;
revoke all
on function public.validate_sa_identity_mod13(text)
from public;
revoke all
on function public.validate_sa_identity_mod13(text)
from anon;
revoke all
on function public.get_payroll_irp5_certificate_assembly_preview(
  integer,
  text
)
from public;
revoke all
on function public.get_payroll_irp5_certificate_assembly_preview(
  integer,
  text
)
from anon;
grant execute
on function public.get_payroll_irp5_certificate_assembly_preview(
  integer,
  text
)
to authenticated;
revoke all
on function public.assemble_payroll_irp5_certificates(
  integer,
  text
)
from public;
revoke all
on function public.assemble_payroll_irp5_certificates(
  integer,
  text
)
from anon;
grant execute
on function public.assemble_payroll_irp5_certificates(
  integer,
  text
)
to authenticated;
revoke all
on function public.get_payroll_irp5_export_validation(
  integer,
  text
)
from public;
revoke all
on function public.get_payroll_irp5_export_validation(
  integer,
  text
)
from anon;
grant execute
on function public.get_payroll_irp5_export_validation(
  integer,
  text
)
to authenticated;
comment on table public.payroll_tax_certificate
is
'Immutable-style Nexus registry of assembled IRP5/IT3(a) certificate records and reserved SARS certificate numbers. Actual SARS CSV serialization/submission is handled separately.';
comment on function public.get_payroll_irp5_certificate_assembly_preview(
  integer,
  text
)
is
'Validates employer reference, employee tax/identity information, certificate period, residential address and Sprint 23.13 source-code mappings before a SARS certificate number may be reserved.';
comment on function public.assemble_payroll_irp5_certificates(
  integer,
  text
)
is
'Assembles validated IRP5/IT3(a) certificate records and reserves unique 30-character SARS certificate numbers. Does not submit certificates to SARS.';
comment on function public.get_payroll_irp5_export_validation(
  integer,
  text
)
is
'Validates assembled certificate count, SARS certificate-number format, first-field 3010 requirement and source-code ordering. Actual PAYE BRS CSV serialization remains a separate controlled step.';
