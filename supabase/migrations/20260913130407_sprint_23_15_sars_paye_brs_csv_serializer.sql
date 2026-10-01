-- ============================================================
-- JINLAB NEXUS
-- Sprint 23.15
-- SARS PAYE BRS CSV Serializer + Import-File Validator
-- BRS baseline: v25.3.0
-- TEST files only in this sprint
-- ============================================================


-- ============================================================
-- 1. SARS EXPORT / EMPLOYER HEADER SETTINGS
-- ============================================================

create table if not exists public.payroll_sars_export_settings (
  company_id uuid primary key
    references public.company(id)
    on delete cascade,

  contact_first_name text,
  contact_surname text,
  contact_position text,

  contact_business_tel text,
  contact_cell text,
  contact_email text,

  sic7_code text,

  diplomatic_indemnity boolean
    not null default false,

  employer_physical_address jsonb
    not null default '{}'::jsonb,

  software_provider text
    not null default 'JINLAB',

  software_package text
    not null default 'JINLAB Nexus',

  created_by uuid
    references auth.users(id)
    on delete set null,

  updated_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now()
);
alter table public.payroll_sars_export_settings
enable row level security;
revoke all
on table public.payroll_sars_export_settings
from anon;
revoke all
on table public.payroll_sars_export_settings
from authenticated;
-- ============================================================
-- 2. GENERATED SARS IMPORT FILE REGISTRY
-- ============================================================

create table if not exists public.payroll_sars_import_file (
  id uuid primary key
    default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  tax_year integer not null,

  period_type text not null
    check (
      period_type in (
        'interim',
        'annual'
      )
    ),

  reconciliation_period text not null,

  mode text not null
    check (
      mode in (
        'TEST',
        'LIVE'
      )
    ),

  brs_version text not null
    default '25.3.0',

  certificate_count integer not null
    check (
      certificate_count >= 0
    ),

  record_count integer not null
    check (
      record_count >= 2
    ),

  header_record text not null,

  trailer_record text not null,

  csv_payload text not null,

  content_sha256 text not null,

  validation_snapshot jsonb
    not null default '{}'::jsonb,

  status text not null
    default 'validated_test'
    check (
      status in (
        'generated_test',
        'validated_test',
        'cancelled'
      )
    ),

  created_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz
    not null default now(),

  unique (
    company_id,
    tax_year,
    period_type,
    mode,
    content_sha256
  )
);
create index if not exists
payroll_sars_import_file_company_period_idx
on public.payroll_sars_import_file (
  company_id,
  tax_year,
  period_type,
  created_at desc
);
alter table public.payroll_sars_import_file
enable row level security;
revoke all
on table public.payroll_sars_import_file
from anon;
revoke all
on table public.payroll_sars_import_file
from authenticated;
-- ============================================================
-- 3. PAYE / SDL / UIF EMPLOYER REFERENCE MODULUS-10
--
-- SARS BRS:
-- Replace first character with 4,
-- then apply modulus-10.
-- ============================================================

create or replace function public.validate_sars_employer_reference_mod10(
  p_reference text
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_ref text;

  v_digits text;

  v_sum integer := 0;

  v_digit integer;

  v_calc integer;

  v_expected_check integer;

  v_actual_check integer;

  i integer;
begin

  v_ref :=
    upper(
      regexp_replace(
        coalesce(
          p_reference,
          ''
        ),
        '\s',
        '',
        'g'
      )
    );


  if length(v_ref) <> 10 then
    return false;
  end if;


  if substring(
    v_ref,
    1,
    1
  ) !~ '^[0-9LU]$' then
    return false;
  end if;


  if substring(
    v_ref,
    2,
    9
  ) !~ '^[0-9]{9}$' then
    return false;
  end if;


  v_digits :=
    '4'
    ||
    substring(
      v_ref,
      2,
      9
    );


  for i in 1..9 loop

    v_digit :=
      substring(
        v_digits,
        i,
        1
      )::integer;


    if mod(i, 2) = 1 then

      v_calc :=
        v_digit * 2;


      if v_calc > 9 then

        v_calc :=
          (v_calc / 10)
          +
          mod(
            v_calc,
            10
          );

      end if;


      v_sum :=
        v_sum
        +
        v_calc;

    else

      v_sum :=
        v_sum
        +
        v_digit;

    end if;

  end loop;


  v_expected_check :=
    case
      when mod(v_sum, 10) = 0
        then 0
      else
        10 - mod(v_sum, 10)
    end;


  v_actual_check :=
    substring(
      v_digits,
      10,
      1
    )::integer;


  return
    v_expected_check =
    v_actual_check;

end;
$$;
-- ============================================================
-- 4. SARS CSV TEXT SAFETY
-- ============================================================

create or replace function public.payroll_sars_csv_text_safe(
  p_value text
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
begin

  if p_value is null then
    return true;
  end if;


  if p_value like '%,%'
     or p_value like '%|%'
     or p_value like '%"%'
     or p_value like '%' || chr(10) || '%'
     or p_value like '%' || chr(13) || '%'
  then
    return false;
  end if;


  begin

    perform convert_to(
      p_value,
      'LATIN1'
    );

  exception
    when others then
      return false;
  end;


  return true;

end;
$$;
create or replace function public.payroll_sars_csv_quote(
  p_value text
)
returns text
language plpgsql
immutable
set search_path = public
as $$
begin

  if not public.payroll_sars_csv_text_safe(
    p_value
  ) then

    raise exception
      'SARS CSV text contains an unsupported comma, pipe, quote, line break or non-Latin-1 character.';

  end if;


  return
    '"'
    ||
    coalesce(
      p_value,
      ''
    )
    ||
    '"';

end;
$$;
-- ============================================================
-- 5. SERIALIZE ONE SARS CODE / VALUE PAIR
-- ============================================================

create or replace function public.payroll_sars_csv_render_pair(
  p_code text,
  p_value jsonb
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_code text;

  v_value text;

  v_numeric numeric;

  v_code_number integer;
begin

  v_code :=
    btrim(
      coalesce(
        p_code,
        ''
      )
    );


  if v_code !~ '^[0-9]{4}$' then
    raise exception
      'Invalid SARS source code: %',
      v_code;
  end if;


  if p_value is null
     or p_value = 'null'::jsonb
  then

    raise exception
      'SARS code % has no value.',
      v_code;

  end if;


  v_value :=
    p_value #>> '{}';


  -- ----------------------------------------------------------
  -- Alpha / alphanumeric / free-text fields
  -- ----------------------------------------------------------

  if v_code in (
    -- Employer header
    '2010',
    '2015',
    '2022',
    '2024',
    '2025',
    '2036',
    '2038',
    '2026',
    '2039',
    '2040',
    '2027',
    '2028',
    '2029',
    '2082',
    '2037',
    '2061',
    '2062',
    '2063',
    '2064',
    '2065',
    '2066',
    '2080',
    '2081',

    -- Certificate demographic
    '3010',
    '3015',
    '3020',
    '3030',
    '3040',
    '3050',
    '3070',
    '3075',
    '3160',
    '3211',
    '3212',
    '3213',
    '3214',
    '3215',
    '3216',
    '3217',
    '3285'
  ) then

    return
      v_code
      ||
      ','
      ||
      public.payroll_sars_csv_quote(
        v_value
      );

  end if;


  -- ----------------------------------------------------------
  -- IT3(a) reason 4150.
  -- Preserve leading zero.
  -- ----------------------------------------------------------

  if v_code = '4150' then

    if v_value !~ '^(0[1-9]|10)$' then
      raise exception
        'Invalid IT3(a) reason code 4150 value.';
    end if;


    return
      v_code
      ||
      ','
      ||
      v_value;

  end if;


  -- ----------------------------------------------------------
  -- Fixed 4-decimal pay-period fields
  -- ----------------------------------------------------------

  if v_code in (
    '3200',
    '3210'
  ) then

    v_numeric :=
      v_value::numeric;


    return
      v_code
      ||
      ','
      ||
      to_char(
        v_numeric,
        'FM999999999990.0000'
      );

  end if;


  -- ----------------------------------------------------------
  -- SARS codes where cents MUST be retained
  -- ----------------------------------------------------------

  if v_code in (
    '4101',
    '4102',
    '4115',
    '4116',
    '4118',
    '4120',
    '4141',
    '4142',
    '4149',
    '6030',
    '7002',
    '7003',
    '7004',
    '7008'
  ) then

    v_numeric :=
      v_value::numeric;


    if v_numeric < 0 then
      raise exception
        'Negative SARS amounts are not allowed.';
    end if;


    return
      v_code
      ||
      ','
      ||
      to_char(
        v_numeric,
        'FM999999999990.00'
      );

  end if;


  -- ----------------------------------------------------------
  -- Financial source amounts where cents are dropped.
  -- ----------------------------------------------------------

  v_code_number :=
    v_code::integer;


  if (
    v_code_number between 3601 and 4497
  )
  or (
    v_code_number between 4582 and 4590
  )
  or (
    v_code_number between 7002 and 7009
  )
  then

    v_numeric :=
      v_value::numeric;


    if v_numeric < 0 then
      raise exception
        'Negative SARS amounts are not allowed.';
    end if;


    return
      v_code
      ||
      ','
      ||
      trunc(
        v_numeric
      )::text;

  end if;


  -- ----------------------------------------------------------
  -- Numeric / date / reference fields.
  -- Preserve leading zeroes.
  -- ----------------------------------------------------------

  if v_code in (
    '2020',
    '2030',
    '2031',
    '3025',
    '3060',
    '3080',
    '3100',
    '3170',
    '3180',
    '6010'
  ) then

    if v_value !~ '^[0-9]+$' then
      raise exception
        'SARS numeric code % contains a non-numeric value.',
        v_code;
    end if;


    return
      v_code
      ||
      ','
      ||
      v_value;

  end if;


  raise exception
    'SARS code % is not yet supported by the Nexus CSV serializer.',
    v_code;

end;
$$;
-- ============================================================
-- 6. SAVE EMPLOYER EXPORT SETTINGS
-- ============================================================

create or replace function public.save_payroll_sars_export_settings(
  p_contact_first_name text,
  p_contact_surname text,
  p_contact_position text,

  p_contact_business_tel text,
  p_contact_cell text,
  p_contact_email text,

  p_sic7_code text,

  p_diplomatic_indemnity boolean,

  p_employer_physical_address jsonb,

  p_software_provider text default 'JINLAB',
  p_software_package text default 'JINLAB Nexus'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_business_tel text;

  v_cell text;

  v_sic7 text;
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


  v_business_tel :=
    nullif(
      regexp_replace(
        coalesce(
          p_contact_business_tel,
          ''
        ),
        '[^0-9]',
        '',
        'g'
      ),
      ''
    );


  v_cell :=
    nullif(
      regexp_replace(
        coalesce(
          p_contact_cell,
          ''
        ),
        '[^0-9]',
        '',
        'g'
      ),
      ''
    );


  v_sic7 :=
    nullif(
      btrim(
        coalesce(
          p_sic7_code,
          ''
        )
      ),
      ''
    );


  if v_sic7 is not null
     and v_sic7 !~ '^[0-9]{5}$'
  then

    raise exception
      'SARS SIC7 code must contain exactly five digits.';

  end if;


  insert into public.payroll_sars_export_settings (
    company_id,

    contact_first_name,
    contact_surname,
    contact_position,

    contact_business_tel,
    contact_cell,
    contact_email,

    sic7_code,

    diplomatic_indemnity,

    employer_physical_address,

    software_provider,
    software_package,

    created_by,
    updated_by
  )
  values (
    v_company_id,

    nullif(
      btrim(
        coalesce(
          p_contact_first_name,
          ''
        )
      ),
      ''
    ),

    nullif(
      btrim(
        coalesce(
          p_contact_surname,
          ''
        )
      ),
      ''
    ),

    nullif(
      btrim(
        coalesce(
          p_contact_position,
          ''
        )
      ),
      ''
    ),

    v_business_tel,
    v_cell,

    nullif(
      btrim(
        coalesce(
          p_contact_email,
          ''
        )
      ),
      ''
    ),

    v_sic7,

    coalesce(
      p_diplomatic_indemnity,
      false
    ),

    coalesce(
      p_employer_physical_address,
      '{}'::jsonb
    ),

    coalesce(
      nullif(
        btrim(
          p_software_provider
        ),
        ''
      ),
      'JINLAB'
    ),

    coalesce(
      nullif(
        btrim(
          p_software_package
        ),
        ''
      ),
      'JINLAB Nexus'
    ),

    auth.uid(),
    auth.uid()
  )

  on conflict (
    company_id
  )
  do update
  set
    contact_first_name =
      excluded.contact_first_name,

    contact_surname =
      excluded.contact_surname,

    contact_position =
      excluded.contact_position,

    contact_business_tel =
      excluded.contact_business_tel,

    contact_cell =
      excluded.contact_cell,

    contact_email =
      excluded.contact_email,

    sic7_code =
      excluded.sic7_code,

    diplomatic_indemnity =
      excluded.diplomatic_indemnity,

    employer_physical_address =
      excluded.employer_physical_address,

    software_provider =
      excluded.software_provider,

    software_package =
      excluded.software_package,

    updated_by =
      auth.uid(),

    updated_at =
      now();


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

    'payroll_sars_export_settings_saved',

    'payroll',

    v_company_id,

    'SARS PAYE import-file employer settings updated.',

    jsonb_build_object(
      'sic7_code',
        v_sic7,

      'software_provider',
        coalesce(
          p_software_provider,
          'JINLAB'
        ),

      'software_package',
        coalesce(
          p_software_package,
          'JINLAB Nexus'
        )
    )
  );


  return jsonb_build_object(
    'ok',
      true,

    'company_id',
      v_company_id,

    'sic7_code',
      v_sic7
  );

end;
$$;
-- ============================================================
-- 7. CSV EXPORT PREVIEW / VALIDATION
-- ============================================================

create or replace function public.get_payroll_sars_csv_export_preview(
  p_tax_year integer,
  p_period_type text default 'interim',
  p_mode text default 'TEST'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_company public.company%rowtype;

  v_settings public.payroll_employer_settings%rowtype;

  v_export public.payroll_sars_export_settings%rowtype;

  v_mode text;

  v_period_type text;

  v_period text;

  v_employer_reference text;

  v_trading_name text;

  v_address jsonb;

  v_country text;

  v_postal_code text;

  v_blockers jsonb :=
    '[]'::jsonb;

  v_warnings jsonb :=
    '[]'::jsonb;

  v_core_validation jsonb;

  v_certificate_count integer := 0;

  v_has_irp5 boolean := false;

  v_header_fields jsonb :=
    '[]'::jsonb;

  v_header text := '';

  v_certificate_lines jsonb :=
    '[]'::jsonb;

  v_certificate record;

  v_field jsonb;

  v_line text;

  v_trailer text;

  v_payload text;

  v_record_count integer;

  v_first boolean;
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


  v_mode :=
    upper(
      btrim(
        coalesce(
          p_mode,
          'TEST'
        )
      )
    );


  if v_mode not in (
    'TEST',
    'LIVE'
  ) then

    raise exception
      'SARS import-file mode must be TEST or LIVE.';

  end if;


  if v_mode = 'LIVE' then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'Sprint 23.15 generates TEST SARS import files only. LIVE export remains locked until TEST import acceptance is confirmed.'
      );

  end if;


  if v_period_type =
     'interim'
  then

    v_period :=
      (p_tax_year - 1)::text
      ||
      '08';

  else

    v_period :=
      p_tax_year::text
      ||
      '02';

  end if;


  select *
  into v_company

  from public.company

  where id =
    v_company_id;


  select *
  into v_settings

  from public.payroll_employer_settings

  where company_id =
    v_company_id;


  select *
  into v_export

  from public.payroll_sars_export_settings

  where company_id =
    v_company_id;


  if v_company.id is null then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'Company record is missing.'
      );

  end if;


  if v_settings.company_id is null then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'Payroll employer settings are missing.'
      );

  end if;


  if v_export.company_id is null then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'SARS export employer/contact settings are missing.'
      );

  end if;


  v_trading_name :=
    coalesce(
      nullif(
        btrim(
          v_company.trading_name
        ),
        ''
      ),

      nullif(
        btrim(
          v_company.company_name
        ),
        ''
      )
    );


  if v_trading_name is null then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'Employer trading/company name is missing.'
      );

  elsif not public.payroll_sars_csv_text_safe(
    v_trading_name
  ) then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'Employer trading name contains characters that are unsafe for the SARS import format.'
      );

  end if;


  -- ----------------------------------------------------------
  -- Employer reference 2020
  -- ----------------------------------------------------------

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


  if length(
    v_employer_reference
  ) <> 10 then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'Employer PAYE/Income Tax reference must contain exactly 10 digits.'
      );

  else

    if left(
      v_employer_reference,
      1
    ) = '7' then

      if not public.validate_sars_employer_reference_mod10(
        v_employer_reference
      ) then

        v_blockers :=
          v_blockers ||
          jsonb_build_array(
            'Employer PAYE reference fails the SARS modulus-10 validation.'
          );

      end if;

    elsif left(
      v_employer_reference,
      1
    ) in (
      '0',
      '1',
      '2',
      '3',
      '9'
    ) then

      if not public.validate_sars_tax_reference_mod10(
        v_employer_reference
      ) then

        v_blockers :=
          v_blockers ||
          jsonb_build_array(
            'Employer Income Tax reference fails the SARS modulus-10 validation.'
          );

      end if;

    else

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'Employer reference must start with 7 for PAYE or 0/1/2/3/9 for an Income Tax reference.'
        );

    end if;

  end if;


  -- ----------------------------------------------------------
  -- UIF
  -- ----------------------------------------------------------

  if coalesce(
    v_settings.uif_enabled,
    false
  ) then

    if coalesce(
      v_settings.uif_reference,
      ''
    ) !~ '^U[0-9]{9}$' then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'Employer UIF reference must start with U followed by nine digits.'
        );

    elsif not public.validate_sars_employer_reference_mod10(
      v_settings.uif_reference
    ) then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'Employer UIF reference fails the SARS modulus-10 validation.'
        );

    end if;


    if left(
      v_employer_reference,
      1
    ) = '7'

    and length(
      v_employer_reference
    ) = 10

    and substring(
      v_settings.uif_reference,
      2,
      9
    )
    <>
    substring(
      v_employer_reference,
      2,
      9
    )
    then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'UIF reference does not share the PAYE reference last nine digits.'
        );

    end if;

  end if;


  -- ----------------------------------------------------------
  -- SDL
  -- ----------------------------------------------------------

  if coalesce(
    v_settings.sdl_enabled,
    false
  ) then

    if coalesce(
      v_settings.sdl_reference,
      ''
    ) !~ '^L[0-9]{9}$' then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'Employer SDL reference must start with L followed by nine digits.'
        );

    elsif not public.validate_sars_employer_reference_mod10(
      v_settings.sdl_reference
    ) then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'Employer SDL reference fails the SARS modulus-10 validation.'
        );

    end if;


    if left(
      v_employer_reference,
      1
    ) = '7'

    and length(
      v_employer_reference
    ) = 10

    and substring(
      v_settings.sdl_reference,
      2,
      9
    )
    <>
    substring(
      v_employer_reference,
      2,
      9
    )
    then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'SDL reference does not share the PAYE reference last nine digits.'
        );

    end if;

  end if;


  -- ----------------------------------------------------------
  -- Employer contact/header details
  -- ----------------------------------------------------------

  if nullif(
    btrim(
      coalesce(
        v_export.contact_first_name,
        ''
      )
    ),
    ''
  ) is null then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'Employer reconciliation contact first name is missing.'
      );

  end if;


  if nullif(
    btrim(
      coalesce(
        v_export.contact_surname,
        ''
      )
    ),
    ''
  ) is null then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'Employer reconciliation contact surname is missing.'
      );

  end if;


  if nullif(
    btrim(
      coalesce(
        v_export.contact_business_tel,
        ''
      )
    ),
    ''
  ) is null

  and nullif(
    btrim(
      coalesce(
        v_export.contact_cell,
        ''
      )
    ),
    ''
  ) is null
  then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'Either employer contact business telephone or cell number is required.'
      );

  end if;


  if v_export.contact_business_tel is not null
     and (
       v_export.contact_business_tel !~ '^(0[0-9]{9,14}|00[0-9]{8,13})$'
     )
  then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'Employer business telephone number is invalid for SARS export.'
      );

  end if;


  if v_export.contact_cell is not null
     and (
       v_export.contact_cell !~ '^(0[0-9]{9,14}|00[0-9]{8,13})$'
     )
  then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'Employer contact cell number is invalid for SARS export.'
      );

  end if;


  if nullif(
    btrim(
      coalesce(
        v_export.software_provider,
        ''
      )
    ),
    ''
  ) is null

  or nullif(
    btrim(
      coalesce(
        v_export.software_package,
        ''
      )
    ),
    ''
  ) is null
  then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'Payroll software provider and package are required.'
      );

  end if;


  if coalesce(
    v_export.sic7_code,
    ''
  ) !~ '^[0-9]{5}$' then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'Employer SARS SIC7 code must contain exactly five digits.'
      );

  end if;


  v_address :=
    coalesce(
      v_export.employer_physical_address,
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
        'Employer physical-address street/name of farm is missing.'
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
        'Employer suburb/district or city/town is required.'
      );

  end if;


  if length(
    v_country
  ) <> 2 then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'Employer physical-address country code must contain two characters.'
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
        'South African employer postal code must contain four digits and may not be 0000.'
      );

  end if;


  -- ----------------------------------------------------------
  -- Sprint 23.14 certificate validation
  -- ----------------------------------------------------------

  v_core_validation :=
    public.get_payroll_irp5_export_validation(
      p_tax_year,
      v_period_type
    );


  if not coalesce(
    (
      v_core_validation
      #>>
      '{certificate_validation,core_certificate_records_valid}'
    )::boolean,
    false
  ) then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'Assembled IRP5/IT3(a) certificate records fail core validation.'
      );

  end if;


  select
    count(*),

    coalesce(
      bool_or(
        certificate_type = 'IRP5'
      ),
      false
    )

  into
    v_certificate_count,
    v_has_irp5

  from public.payroll_tax_certificate

  where
    company_id =
      v_company_id

    and tax_year =
      p_tax_year

    and period_type =
      v_period_type

    and status <> 'cancelled';


  if v_certificate_count = 0 then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'No assembled employee tax certificates exist for this period.'
      );

  end if;


  if v_has_irp5
     and left(
       v_employer_reference,
       1
     ) <> '7'
  then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'An IRP5 certificate cannot be exported unless employer code 2020 is a PAYE reference beginning with 7.'
      );

  end if;


  v_warnings :=
    v_warnings ||
    jsonb_build_array(
      'SIC7 syntax is validated by Nexus. Final SARS/e@syFile import remains the authority for the complete SARS SIC7 catalogue validation.'
    );


  -- ----------------------------------------------------------
  -- Stop before serialization if any blocker exists.
  -- ----------------------------------------------------------

  if jsonb_array_length(
    v_blockers
  ) > 0 then

    return jsonb_build_object(

      'ok',
        true,

      'tax_year',
        p_tax_year,

      'period_type',
        v_period_type,

      'mode',
        v_mode,

      'reconciliation_period',
        v_period,

      'certificate_count',
        v_certificate_count,

      'serialization_ready',
        false,

      'blockers',
        v_blockers,

      'warnings',
        v_warnings,

      'csv_payload',
        null
    );

  end if;


  -- ==========================================================
  -- HEADER RECORD
  -- ==========================================================

  v_header_fields :=
    jsonb_build_array(

      jsonb_build_object(
        'code',
          '2010',
        'value',
          v_trading_name
      ),

      jsonb_build_object(
        'code',
          '2015',
        'value',
          v_mode
      ),

      jsonb_build_object(
        'code',
          '2020',
        'value',
          v_employer_reference
      )
    );


  if coalesce(
    v_settings.sdl_enabled,
    false
  ) then

    v_header_fields :=
      v_header_fields ||
      jsonb_build_array(
        jsonb_build_object(
          'code',
            '2022',
          'value',
            v_settings.sdl_reference
        )
      );

  end if;


  if coalesce(
    v_settings.uif_enabled,
    false
  ) then

    v_header_fields :=
      v_header_fields ||
      jsonb_build_array(
        jsonb_build_object(
          'code',
            '2024',
          'value',
            v_settings.uif_reference
        )
      );

  end if;


  v_header_fields :=
    v_header_fields ||
    jsonb_build_array(

      jsonb_build_object(
        'code',
          '2025',
        'value',
          v_export.contact_first_name
      ),

      jsonb_build_object(
        'code',
          '2036',
        'value',
          v_export.contact_surname
      )
    );


  if v_export.contact_position is not null then

    v_header_fields :=
      v_header_fields ||
      jsonb_build_array(
        jsonb_build_object(
          'code',
            '2038',
          'value',
            v_export.contact_position
        )
      );

  end if;


  if v_export.contact_business_tel is not null then

    v_header_fields :=
      v_header_fields ||
      jsonb_build_array(
        jsonb_build_object(
          'code',
            '2026',
          'value',
            v_export.contact_business_tel
        )
      );

  end if;


  if v_export.contact_cell is not null then

    v_header_fields :=
      v_header_fields ||
      jsonb_build_array(
        jsonb_build_object(
          'code',
            '2040',
          'value',
            v_export.contact_cell
        )
      );

  end if;


  if v_export.contact_email is not null then

    v_header_fields :=
      v_header_fields ||
      jsonb_build_array(
        jsonb_build_object(
          'code',
            '2027',
          'value',
            v_export.contact_email
        )
      );

  end if;


  v_header_fields :=
    v_header_fields ||
    jsonb_build_array(

      jsonb_build_object(
        'code',
          '2028',
        'value',
          v_export.software_provider
      ),

      jsonb_build_object(
        'code',
          '2029',
        'value',
          v_export.software_package
      ),

      jsonb_build_object(
        'code',
          '2030',
        'value',
          p_tax_year
      ),

      jsonb_build_object(
        'code',
          '2031',
        'value',
          v_period
      ),

      jsonb_build_object(
        'code',
          '2082',
        'value',
          v_export.sic7_code
      ),

      jsonb_build_object(
        'code',
          '2037',
        'value',
          case
            when v_export.diplomatic_indemnity
              then 'Y'
            else 'N'
          end
      )
    );


  if nullif(
    btrim(
      v_address
      ->>
      'unit_number'
    ),
    ''
  ) is not null then

    v_header_fields :=
      v_header_fields ||
      jsonb_build_array(
        jsonb_build_object(
          'code',
            '2061',
          'value',
            v_address ->> 'unit_number'
        )
      );

  end if;


  if nullif(
    btrim(
      v_address
      ->>
      'complex'
    ),
    ''
  ) is not null then

    v_header_fields :=
      v_header_fields ||
      jsonb_build_array(
        jsonb_build_object(
          'code',
            '2062',
          'value',
            v_address ->> 'complex'
        )
      );

  end if;


  if nullif(
    btrim(
      v_address
      ->>
      'street_number'
    ),
    ''
  ) is not null then

    v_header_fields :=
      v_header_fields ||
      jsonb_build_array(
        jsonb_build_object(
          'code',
            '2063',
          'value',
            v_address ->> 'street_number'
        )
      );

  end if;


  v_header_fields :=
    v_header_fields ||
    jsonb_build_array(
      jsonb_build_object(
        'code',
          '2064',
        'value',
          v_address ->> 'street_name'
      )
    );


  if nullif(
    btrim(
      v_address
      ->>
      'suburb'
    ),
    ''
  ) is not null then

    v_header_fields :=
      v_header_fields ||
      jsonb_build_array(
        jsonb_build_object(
          'code',
            '2065',
          'value',
            v_address ->> 'suburb'
        )
      );

  end if;


  if nullif(
    btrim(
      v_address
      ->>
      'city'
    ),
    ''
  ) is not null then

    v_header_fields :=
      v_header_fields ||
      jsonb_build_array(
        jsonb_build_object(
          'code',
            '2066',
          'value',
            v_address ->> 'city'
        )
      );

  end if;


  v_header_fields :=
    v_header_fields ||
    jsonb_build_array(

      jsonb_build_object(
        'code',
          '2080',
        'value',
          v_postal_code
      ),

      jsonb_build_object(
        'code',
          '2081',
        'value',
          v_country
      )
    );


  -- Render header.

  v_header :=
    '';

  v_first :=
    true;


  for v_field in

    select value

    from jsonb_array_elements(
      v_header_fields
    )

  loop

    if not v_first then
      v_header :=
        v_header || ',';
    end if;


    v_header :=
      v_header
      ||
      public.payroll_sars_csv_render_pair(
        v_field ->> 'code',
        v_field -> 'value'
      );


    v_first :=
      false;

  end loop;


  v_header :=
    v_header
    ||
    ',9999';


  -- ==========================================================
  -- CERTIFICATE RECORDS
  -- ==========================================================

  for v_certificate in

    select
      c.*

    from public.payroll_tax_certificate c

    where
      c.company_id =
        v_company_id

      and c.tax_year =
        p_tax_year

      and c.period_type =
        v_period_type

      and c.status <>
        'cancelled'

    order by
      c.certificate_number

  loop

    v_line :=
      '';

    v_first :=
      true;


    for v_field in

      select value

      from jsonb_array_elements(
        v_certificate.ordered_export_fields
      )

    loop

      if not v_first then
        v_line :=
          v_line || ',';
      end if;


      v_line :=
        v_line
        ||
        public.payroll_sars_csv_render_pair(
          v_field ->> 'code',
          v_field -> 'value'
        );


      v_first :=
        false;

    end loop;


    v_line :=
      v_line
      ||
      ',9999';


    v_certificate_lines :=
      v_certificate_lines ||
      jsonb_build_array(
        v_line
      );

  end loop;


  -- ==========================================================
  -- TRAILER
  --
  -- 6010 counts header + certificate records.
  -- Trailer itself is excluded.
  --
  -- 6020 and 6030 are optional under BRS v25.3.0 and are
  -- deliberately omitted in Sprint 23.15.
  -- ==========================================================

  v_trailer :=
    public.payroll_sars_csv_render_pair(
      '6010',
      to_jsonb(
        1
        +
        v_certificate_count
      )
    )
    ||
    ',9999';


  v_record_count :=
    v_certificate_count
    +
    2;


  v_payload :=
    v_header;


  for v_field in

    select value

    from jsonb_array_elements(
      v_certificate_lines
    )

  loop

    v_payload :=
      v_payload
      ||
      E'\r\n'
      ||
      (v_field #>> '{}');

  end loop;


  v_payload :=
    v_payload
    ||
    E'\r\n'
    ||
    v_trailer;


  return jsonb_build_object(

    'ok',
      true,

    'tax_year',
      p_tax_year,

    'period_type',
      v_period_type,

    'mode',
      v_mode,

    'brs_version',
      '25.3.0',

    'reconciliation_period',
      v_period,

    'certificate_count',
      v_certificate_count,

    'record_count',
      v_record_count,

    'header_record',
      v_header,

    'certificate_records',
      v_certificate_lines,

    'trailer_record',
      v_trailer,

    'serialization_ready',
      true,

    'blockers',
      v_blockers,

    'warnings',
      v_warnings,

    'csv_payload',
      v_payload,

    'content_sha256',
      encode(
        digest(
          convert_to(
            v_payload,
            'LATIN1'
          ),
          'sha256'
        ),
        'hex'
      ),

    'submitted_to_sars',
      false
  );

end;
$$;
-- ============================================================
-- 8. STRUCTURAL VALIDATOR
-- ============================================================

create or replace function public.validate_payroll_sars_csv_payload(
  p_payload text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lines text[];

  v_line text;

  v_tokens text[];

  v_line_count integer;

  v_expected_6010 integer;

  v_actual_6010 integer;

  v_invalid_records integer := 0;

  v_invalid_code_pairs integer := 0;

  v_employee_records integer := 0;

  i integer;

  j integer;
begin

  if p_payload is null
     or p_payload = ''
  then

    return jsonb_build_object(
      'ok',
        false,

      'valid',
        false,

      'errors',
        jsonb_build_array(
          'CSV payload is empty.'
        )
    );

  end if;


  if p_payload like '%|%' then

    return jsonb_build_object(
      'ok',
        false,

      'valid',
        false,

      'errors',
        jsonb_build_array(
          'CSV payload contains a prohibited pipe character.'
        )
    );

  end if;


  v_lines :=
    string_to_array(
      p_payload,
      E'\r\n'
    );


  v_line_count :=
    coalesce(
      array_length(
        v_lines,
        1
      ),
      0
    );


  if v_line_count < 3 then

    return jsonb_build_object(
      'ok',
        false,

      'valid',
        false,

      'errors',
        jsonb_build_array(
          'SARS import file requires header, certificate and trailer records.'
        )
    );

  end if;


  if v_lines[1] not like '2010,%' then
    v_invalid_records :=
      v_invalid_records + 1;
  end if;


  if v_lines[v_line_count]
     not like '6010,%'
  then

    v_invalid_records :=
      v_invalid_records + 1;

  end if;


  for i in 1..v_line_count loop

    v_line :=
      v_lines[i];


    if v_line is null
       or v_line = ''
       or v_line not like '%,9999'
    then

      v_invalid_records :=
        v_invalid_records + 1;

      continue;

    end if;


    v_tokens :=
      string_to_array(
        v_line,
        ','
      );


    if mod(
      array_length(
        v_tokens,
        1
      ),
      2
    ) <> 1 then

      v_invalid_code_pairs :=
        v_invalid_code_pairs + 1;

      continue;

    end if;


    if v_tokens[
      array_length(
        v_tokens,
        1
      )
    ] <> '9999' then

      v_invalid_code_pairs :=
        v_invalid_code_pairs + 1;

    end if;


    j := 1;


    while j <
      array_length(
        v_tokens,
        1
      )
    loop

      if v_tokens[j]
         !~
         '^[0-9]{4}$'
      then

        v_invalid_code_pairs :=
          v_invalid_code_pairs + 1;

      end if;


      j :=
        j + 2;

    end loop;


    if i > 1
       and i < v_line_count
    then

      if v_line not like '3010,%' then

        v_invalid_records :=
          v_invalid_records + 1;

      else

        v_employee_records :=
          v_employee_records + 1;

      end if;

    end if;

  end loop;


  v_tokens :=
    string_to_array(
      v_lines[v_line_count],
      ','
    );


  if array_length(
    v_tokens,
    1
  ) = 3

  and v_tokens[1] = '6010'

  and v_tokens[2] ~ '^[0-9]+$'

  and v_tokens[3] = '9999'
  then

    v_actual_6010 :=
      v_tokens[2]::integer;

  else

    v_actual_6010 :=
      -1;

  end if;


  v_expected_6010 :=
    v_line_count - 1;


  return jsonb_build_object(

    'ok',
      true,

    'valid',
      v_invalid_records = 0
      and v_invalid_code_pairs = 0
      and v_actual_6010 = v_expected_6010,

    'record_count',
      v_line_count,

    'certificate_records',
      v_employee_records,

    'header_starts_2010',
      v_lines[1] like '2010,%',

    'trailer_starts_6010',
      v_lines[v_line_count]
      like '6010,%',

    'all_records_end_9999',
      v_invalid_records = 0,

    'code_value_pair_errors',
      v_invalid_code_pairs,

    'trailer_6010_expected',
      v_expected_6010,

    'trailer_6010_actual',
      v_actual_6010,

    'trailer_count_matches',
      v_actual_6010 =
      v_expected_6010
  );

end;
$$;
-- ============================================================
-- 9. GENERATE TEST IMPORT FILE
-- ============================================================

create or replace function public.generate_payroll_sars_test_import_file(
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

  v_validation jsonb;

  v_payload text;

  v_hash text;

  v_file_id uuid;

  v_existing public.payroll_sars_import_file%rowtype;
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
    public.get_payroll_sars_csv_export_preview(
      p_tax_year,
      p_period_type,
      'TEST'
    );


  if not coalesce(
    (
      v_preview
      ->>
      'serialization_ready'
    )::boolean,
    false
  ) then

    raise exception
      'SARS TEST import-file generation is blocked: %',
      coalesce(
        v_preview
        -> 'blockers',
        '[]'::jsonb
      )::text;

  end if;


  v_payload :=
    v_preview
    ->>
    'csv_payload';


  v_validation :=
    public.validate_payroll_sars_csv_payload(
      v_payload
    );


  if not coalesce(
    (
      v_validation
      ->>
      'valid'
    )::boolean,
    false
  ) then

    raise exception
      'Generated SARS TEST import file failed Nexus structural validation: %',
      v_validation::text;

  end if;


  v_hash :=
    encode(
      digest(
        convert_to(
          v_payload,
          'LATIN1'
        ),
        'sha256'
      ),
      'hex'
    );


  select *
  into v_existing

  from public.payroll_sars_import_file

  where
    company_id =
      v_company_id

    and tax_year =
      p_tax_year

    and period_type =
      lower(
        p_period_type
      )

    and mode =
      'TEST'

    and content_sha256 =
      v_hash

  limit 1;


  if v_existing.id is not null then

    return jsonb_build_object(

      'ok',
        true,

      'already_generated',
        true,

      'file_id',
        v_existing.id,

      'mode',
        v_existing.mode,

      'content_sha256',
        v_existing.content_sha256,

      'certificate_count',
        v_existing.certificate_count,

      'record_count',
        v_existing.record_count,

      'structurally_valid',
        true,

      'submitted_to_sars',
        false
    );

  end if;


  insert into public.payroll_sars_import_file (
    company_id,

    tax_year,
    period_type,

    reconciliation_period,

    mode,
    brs_version,

    certificate_count,
    record_count,

    header_record,
    trailer_record,

    csv_payload,

    content_sha256,

    validation_snapshot,

    status,

    created_by
  )
  values (
    v_company_id,

    p_tax_year,
    lower(
      p_period_type
    ),

    v_preview
    ->>
    'reconciliation_period',

    'TEST',
    '25.3.0',

    (
      v_preview
      ->>
      'certificate_count'
    )::integer,

    (
      v_preview
      ->>
      'record_count'
    )::integer,

    v_preview
    ->>
    'header_record',

    v_preview
    ->>
    'trailer_record',

    v_payload,

    v_hash,

    jsonb_build_object(

      'serializer_preview',
        jsonb_build_object(
          'serialization_ready',
            true,

          'warnings',
            v_preview
            -> 'warnings'
        ),

      'structural_validation',
        v_validation,

      'brs_version',
        '25.3.0',

      'test_file',
        true,

      'live_export_authorised',
        false,

      'submitted_to_sars',
        false
    ),

    'validated_test',

    auth.uid()
  )
  returning id
  into v_file_id;


  update public.payroll_tax_certificate
  set
    status =
      'validated',

    validated_at =
      coalesce(
        validated_at,
        now()
      ),

    updated_at =
      now()

  where
    company_id =
      v_company_id

    and tax_year =
      p_tax_year

    and period_type =
      lower(
        p_period_type
      )

    and status =
      'assembled';


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

    'payroll_sars_test_import_file_generated',

    'payroll',

    v_file_id,

    'SARS PAYE BRS TEST import file generated and structurally validated.',

    jsonb_build_object(

      'tax_year',
        p_tax_year,

      'period_type',
        lower(
          p_period_type
        ),

      'mode',
        'TEST',

      'brs_version',
        '25.3.0',

      'certificate_count',
        v_preview
        ->>
        'certificate_count',

      'content_sha256',
        v_hash,

      'submitted_to_sars',
        false
    )
  );


  return jsonb_build_object(

    'ok',
      true,

    'already_generated',
      false,

    'file_id',
      v_file_id,

    'mode',
      'TEST',

    'brs_version',
      '25.3.0',

    'content_sha256',
      v_hash,

    'certificate_count',
      (
        v_preview
        ->>
        'certificate_count'
      )::integer,

    'record_count',
      (
        v_preview
        ->>
        'record_count'
      )::integer,

    'structural_validation',
      v_validation,

    'structurally_valid',
      true,

    'live_export_ready',
      false,

    'submitted_to_sars',
      false
  );

end;
$$;
-- ============================================================
-- 10. RETRIEVE GENERATED TEST PAYLOAD
-- ============================================================

create or replace function public.get_payroll_sars_test_import_file(
  p_file_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_file public.payroll_sars_import_file%rowtype;
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


  select *
  into v_file

  from public.payroll_sars_import_file

  where
    id =
      p_file_id

    and company_id =
      v_company_id

    and mode =
      'TEST';


  if v_file.id is null then

    raise exception
      'SARS TEST import file could not be found.';

  end if;


  return jsonb_build_object(

    'ok',
      true,

    'file_id',
      v_file.id,

    'tax_year',
      v_file.tax_year,

    'period_type',
      v_file.period_type,

    'reconciliation_period',
      v_file.reconciliation_period,

    'mode',
      v_file.mode,

    'brs_version',
      v_file.brs_version,

    'certificate_count',
      v_file.certificate_count,

    'record_count',
      v_file.record_count,

    'content_sha256',
      v_file.content_sha256,

    'status',
      v_file.status,

    'validation',
      v_file.validation_snapshot,

    'csv_payload',
      v_file.csv_payload,

    'submitted_to_sars',
      false
  );

end;
$$;
-- ============================================================
-- 11. SECURITY
-- ============================================================

revoke all
on function public.validate_sars_employer_reference_mod10(text)
from public;
revoke all
on function public.validate_sars_employer_reference_mod10(text)
from anon;
revoke all
on function public.payroll_sars_csv_text_safe(text)
from public;
revoke all
on function public.payroll_sars_csv_text_safe(text)
from anon;
revoke all
on function public.payroll_sars_csv_quote(text)
from public;
revoke all
on function public.payroll_sars_csv_quote(text)
from anon;
revoke all
on function public.payroll_sars_csv_render_pair(
  text,
  jsonb
)
from public;
revoke all
on function public.payroll_sars_csv_render_pair(
  text,
  jsonb
)
from anon;
revoke all
on function public.save_payroll_sars_export_settings(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  jsonb,
  text,
  text
)
from public;
revoke all
on function public.save_payroll_sars_export_settings(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  jsonb,
  text,
  text
)
from anon;
grant execute
on function public.save_payroll_sars_export_settings(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  jsonb,
  text,
  text
)
to authenticated;
revoke all
on function public.get_payroll_sars_csv_export_preview(
  integer,
  text,
  text
)
from public;
revoke all
on function public.get_payroll_sars_csv_export_preview(
  integer,
  text,
  text
)
from anon;
grant execute
on function public.get_payroll_sars_csv_export_preview(
  integer,
  text,
  text
)
to authenticated;
revoke all
on function public.validate_payroll_sars_csv_payload(text)
from public;
revoke all
on function public.validate_payroll_sars_csv_payload(text)
from anon;
revoke all
on function public.generate_payroll_sars_test_import_file(
  integer,
  text
)
from public;
revoke all
on function public.generate_payroll_sars_test_import_file(
  integer,
  text
)
from anon;
grant execute
on function public.generate_payroll_sars_test_import_file(
  integer,
  text
)
to authenticated;
revoke all
on function public.get_payroll_sars_test_import_file(uuid)
from public;
revoke all
on function public.get_payroll_sars_test_import_file(uuid)
from anon;
grant execute
on function public.get_payroll_sars_test_import_file(uuid)
to authenticated;
comment on table public.payroll_sars_export_settings
is
'Employer demographic, reconciliation contact, SIC7 and structured physical-address settings used to construct the SARS PAYE BRS employer header record.';
comment on table public.payroll_sars_import_file
is
'Versioned Nexus registry of generated SARS PAYE import-file payloads. Sprint 23.15 permits validated TEST files only; generation does not constitute SARS submission.';
comment on function public.get_payroll_sars_csv_export_preview(
  integer,
  text,
  text
)
is
'Builds and validates the SARS PAYE BRS v25.3.0 employer header, IRP5/IT3(a) records and trailer. Sprint 23.15 blocks LIVE serialization and generates TEST-format payloads only.';
comment on function public.generate_payroll_sars_test_import_file(
  integer,
  text
)
is
'Generates an idempotent TEST SARS PAYE BRS import-file payload, validates record structure, stores a SHA-256 integrity hash and explicitly records that no SARS submission occurred.';
comment on function public.validate_payroll_sars_csv_payload(text)
is
'Performs structural validation of a Nexus-generated SARS PAYE import file: 2010 header, 3010 certificate records, 6010 trailer, code/value pairing, 9999 terminators and trailer record count.';
