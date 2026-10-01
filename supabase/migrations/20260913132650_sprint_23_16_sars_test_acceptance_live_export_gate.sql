-- ============================================================
-- JINLAB NEXUS
-- Sprint 23.16
-- SARS TEST Acceptance Evidence + LIVE Export Gate
-- BRS baseline: v25.3.0
--
-- Core rule:
-- Nexus may generate a LIVE SARS import file only when:
--   1. A structurally valid TEST file exists.
--   2. External TEST validation/acceptance evidence is recorded.
--   3. The current TEST payload is byte-for-byte equivalent
--      to the accepted TEST payload.
--   4. No payroll/certificate/employer data has changed.
--
-- Nexus still DOES NOT submit anything to SARS.
-- ============================================================


-- ============================================================
-- 1. EXTERNAL TEST ACCEPTANCE EVIDENCE
-- ============================================================

create table if not exists public.payroll_sars_test_acceptance (
  id uuid primary key
    default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  test_file_id uuid not null
    references public.payroll_sars_import_file(id)
    on delete restrict,

  acceptance_channel text not null
    check (
      acceptance_channel in (
        'easyfile_test',
        'sars_trade_test',
        'other'
      )
    ),

  acceptance_reference text not null,

  external_software_version text not null,

  accepted_at timestamptz not null,

  accepted_by uuid
    references auth.users(id)
    on delete set null,

  notes text,

  evidence_snapshot jsonb not null
    default '{}'::jsonb,

  created_at timestamptz not null
    default now(),

  unique (
    company_id,
    test_file_id
  ),

  unique (
    company_id,
    acceptance_reference
  )
);
create index if not exists
payroll_sars_test_acceptance_company_period_idx
on public.payroll_sars_test_acceptance (
  company_id,
  accepted_at desc
);
alter table public.payroll_sars_test_acceptance
enable row level security;
revoke all
on table public.payroll_sars_test_acceptance
from anon;
revoke all
on table public.payroll_sars_test_acceptance
from authenticated;
-- ============================================================
-- 2. LIVE FILE LINEAGE
-- ============================================================

alter table public.payroll_sars_import_file
add column if not exists
source_test_file_id uuid
references public.payroll_sars_import_file(id)
on delete restrict;
alter table public.payroll_sars_import_file
add column if not exists
test_acceptance_id uuid
references public.payroll_sars_test_acceptance(id)
on delete restrict;
-- Expand allowed controlled statuses.

alter table public.payroll_sars_import_file
drop constraint if exists
payroll_sars_import_file_status_check;
alter table public.payroll_sars_import_file
add constraint
payroll_sars_import_file_status_check
check (
  status in (
    'generated_test',
    'validated_test',
    'accepted_test',
    'validated_live',
    'cancelled'
  )
);
-- ============================================================
-- 3. RECORD EXTERNAL TEST ACCEPTANCE
-- ============================================================

create or replace function public.record_payroll_sars_test_acceptance(
  p_test_file_id uuid,

  p_acceptance_reference text,

  p_acceptance_channel text default 'easyfile_test',

  p_external_software_version text default null,

  p_accepted_at timestamptz default now(),

  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company_id uuid;

  v_file public.payroll_sars_import_file%rowtype;

  v_existing public.payroll_sars_test_acceptance%rowtype;

  v_acceptance_id uuid;

  v_channel text;

  v_reference text;

  v_version text;

  v_validation jsonb;

  v_actual_hash text;
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


  if p_test_file_id is null then
    raise exception
      'SARS TEST file is required.';
  end if;


  v_reference :=
    nullif(
      btrim(
        coalesce(
          p_acceptance_reference,
          ''
        )
      ),
      ''
    );


  if v_reference is null then
    raise exception
      'External TEST acceptance reference is required.';
  end if;


  v_channel :=
    lower(
      btrim(
        coalesce(
          p_acceptance_channel,
          'easyfile_test'
        )
      )
    );


  if v_channel not in (
    'easyfile_test',
    'sars_trade_test',
    'other'
  ) then
    raise exception
      'Unsupported SARS TEST acceptance channel.';
  end if;


  v_version :=
    nullif(
      btrim(
        coalesce(
          p_external_software_version,
          ''
        )
      ),
      ''
    );


  if v_version is null then
    raise exception
      'External SARS/e@syFile software version is required.';
  end if;


  if p_accepted_at is null then
    raise exception
      'TEST acceptance date/time is required.';
  end if;


  if p_accepted_at > now() then
    raise exception
      'TEST acceptance date/time cannot be in the future.';
  end if;


  select *
  into v_file

  from public.payroll_sars_import_file

  where
    id =
      p_test_file_id

    and company_id =
      v_company_id

  for update;


  if v_file.id is null then
    raise exception
      'SARS TEST import file could not be found.';
  end if;


  if v_file.mode <> 'TEST' then
    raise exception
      'Only a TEST SARS import file may receive TEST acceptance evidence.';
  end if;


  if v_file.status not in (
    'validated_test',
    'accepted_test'
  ) then
    raise exception
      'The SARS TEST file is not in a validated state.';
  end if;


  if p_accepted_at < v_file.created_at then
    raise exception
      'External TEST acceptance cannot predate generation of the TEST file.';
  end if;


  -- ----------------------------------------------------------
  -- Revalidate payload integrity before accepting evidence.
  -- ----------------------------------------------------------

  v_validation :=
    public.validate_payroll_sars_csv_payload(
      v_file.csv_payload
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
      'The TEST file no longer passes structural validation.';

  end if;


  v_actual_hash :=
    encode(
      digest(
        convert_to(
          v_file.csv_payload,
          'LATIN1'
        ),
        'sha256'
      ),
      'hex'
    );


  if v_actual_hash <>
     v_file.content_sha256
  then

    raise exception
      'TEST file integrity hash mismatch. Acceptance evidence cannot be recorded.';

  end if;


  -- ----------------------------------------------------------
  -- Idempotency
  -- ----------------------------------------------------------

  select *
  into v_existing

  from public.payroll_sars_test_acceptance

  where
    company_id =
      v_company_id

    and test_file_id =
      v_file.id;


  if v_existing.id is not null then

    if v_existing.acceptance_reference =
         v_reference

       and v_existing.acceptance_channel =
         v_channel

       and v_existing.external_software_version =
         v_version
    then

      return jsonb_build_object(

        'ok',
          true,

        'acceptance_id',
          v_existing.id,

        'test_file_id',
          v_existing.test_file_id,

        'acceptance_reference',
          v_existing.acceptance_reference,

        'accepted_at',
          v_existing.accepted_at,

        'already_recorded',
          true,

        'live_export_authorised',
          true,

        'submitted_to_sars',
          false
      );

    end if;


    raise exception
      'This TEST file already has different external acceptance evidence recorded.';

  end if;


  insert into public.payroll_sars_test_acceptance (
    company_id,

    test_file_id,

    acceptance_channel,

    acceptance_reference,

    external_software_version,

    accepted_at,

    accepted_by,

    notes,

    evidence_snapshot
  )
  values (
    v_company_id,

    v_file.id,

    v_channel,

    v_reference,

    v_version,

    p_accepted_at,

    auth.uid(),

    nullif(
      btrim(
        coalesce(
          p_notes,
          ''
        )
      ),
      ''
    ),

    jsonb_build_object(

      'test_file_sha256',
        v_file.content_sha256,

      'test_file_brs_version',
        v_file.brs_version,

      'test_file_certificate_count',
        v_file.certificate_count,

      'test_file_record_count',
        v_file.record_count,

      'structural_validation',
        v_validation,

      'external_validation_recorded',
        true,

      'submitted_to_sars',
        false
    )
  )
  returning id
  into v_acceptance_id;


  update public.payroll_sars_import_file
  set
    status =
      'accepted_test'

  where id =
    v_file.id;


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

    'payroll_sars_test_acceptance_recorded',

    'payroll',

    v_acceptance_id,

    'External SARS TEST file validation/acceptance evidence recorded.',

    jsonb_build_object(

      'test_file_id',
        v_file.id,

      'acceptance_reference',
        v_reference,

      'acceptance_channel',
        v_channel,

      'external_software_version',
        v_version,

      'test_file_sha256',
        v_file.content_sha256,

      'live_export_gate_created',
        true,

      'submitted_to_sars',
        false
    )
  );


  return jsonb_build_object(

    'ok',
      true,

    'acceptance_id',
      v_acceptance_id,

    'test_file_id',
      v_file.id,

    'acceptance_reference',
      v_reference,

    'acceptance_channel',
      v_channel,

    'external_software_version',
      v_version,

    'accepted_at',
      p_accepted_at,

    'already_recorded',
      false,

    'live_export_authorised',
      true,

    'submitted_to_sars',
      false
  );

end;
$$;
-- ============================================================
-- 4. LIVE EXPORT GATE
--
-- Critical control:
-- accepted TEST hash MUST still equal today's TEST preview hash.
--
-- Any change to:
--   payroll
--   employee certificates
--   employer settings
--   SARS export settings
--   references
--   source codes
-- changes the TEST payload and closes the gate.
-- ============================================================

create or replace function public.get_payroll_sars_live_export_gate(
  p_tax_year integer,
  p_period_type text default 'interim'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company_id uuid;

  v_period_type text;

  v_acceptance public.payroll_sars_test_acceptance%rowtype;

  v_test_file public.payroll_sars_import_file%rowtype;

  v_current_preview jsonb;

  v_current_hash text;

  v_stored_hash text;

  v_validation jsonb;

  v_blockers jsonb :=
    '[]'::jsonb;

  v_existing_live_id uuid;

  v_allowed boolean :=
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


  -- ----------------------------------------------------------
  -- Latest externally accepted TEST file for the period.
  -- ----------------------------------------------------------

  select a.*
  into v_acceptance

  from public.payroll_sars_test_acceptance a

  join public.payroll_sars_import_file f
    on f.id =
       a.test_file_id

   and f.company_id =
       a.company_id

  where
    a.company_id =
      v_company_id

    and f.tax_year =
      p_tax_year

    and f.period_type =
      v_period_type

    and f.mode =
      'TEST'

    and f.status =
      'accepted_test'

  order by
    a.accepted_at desc,
    a.created_at desc

  limit 1;


  if v_acceptance.id is null then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'No externally accepted SARS TEST file exists for this tax year and reconciliation period.'
      );


    return jsonb_build_object(

      'ok',
        true,

      'tax_year',
        p_tax_year,

      'period_type',
        v_period_type,

      'live_export_allowed',
        false,

      'accepted_test_file_id',
        null,

      'acceptance_id',
        null,

      'blockers',
        v_blockers,

      'submitted_to_sars',
        false
    );

  end if;


  select *
  into v_test_file

  from public.payroll_sars_import_file

  where
    id =
      v_acceptance.test_file_id

    and company_id =
      v_company_id;


  if v_test_file.id is null then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'Accepted SARS TEST file could not be found.'
      );

  end if;


  -- ----------------------------------------------------------
  -- Confirm accepted file itself has not been altered.
  -- ----------------------------------------------------------

  if v_test_file.id is not null then

    v_stored_hash :=
      encode(
        digest(
          convert_to(
            v_test_file.csv_payload,
            'LATIN1'
          ),
          'sha256'
        ),
        'hex'
      );


    if v_stored_hash <>
       v_test_file.content_sha256
    then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'Accepted TEST file integrity hash no longer matches its stored payload.'
        );

    end if;


    v_validation :=
      public.validate_payroll_sars_csv_payload(
        v_test_file.csv_payload
      );


    if not coalesce(
      (
        v_validation
        ->>
        'valid'
      )::boolean,
      false
    ) then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'Accepted TEST file no longer passes structural validation.'
        );

    end if;

  end if;


  -- ----------------------------------------------------------
  -- Rebuild the TEST payload from CURRENT Nexus data.
  -- ----------------------------------------------------------

  v_current_preview :=
    public.get_payroll_sars_csv_export_preview(
      p_tax_year,
      v_period_type,
      'TEST'
    );


  if not coalesce(
    (
      v_current_preview
      ->>
      'serialization_ready'
    )::boolean,
    false
  ) then

    v_blockers :=
      v_blockers ||
      jsonb_build_array(
        'Current Nexus payroll/certificate data no longer produces a valid SARS TEST payload.'
      );

  else

    v_current_hash :=
      v_current_preview
      ->>
      'content_sha256';


    if v_current_hash <>
       v_test_file.content_sha256
    then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'Current SARS TEST payload differs from the externally accepted TEST file. Generate and externally validate a new TEST file before LIVE export.'
        );

    end if;


    if (
      v_current_preview
      ->>
      'brs_version'
    ) <>
    v_test_file.brs_version
    then

      v_blockers :=
        v_blockers ||
        jsonb_build_array(
          'Current SARS BRS version differs from the externally accepted TEST file.'
        );

    end if;

  end if;


  -- ----------------------------------------------------------
  -- Existing LIVE file for this exact acceptance.
  -- ----------------------------------------------------------

  select id
  into v_existing_live_id

  from public.payroll_sars_import_file

  where
    company_id =
      v_company_id

    and tax_year =
      p_tax_year

    and period_type =
      v_period_type

    and mode =
      'LIVE'

    and test_acceptance_id =
      v_acceptance.id

    and status =
      'validated_live'

  order by
    created_at desc

  limit 1;


  v_allowed :=
    jsonb_array_length(
      v_blockers
    ) = 0;


  return jsonb_build_object(

    'ok',
      true,

    'tax_year',
      p_tax_year,

    'period_type',
      v_period_type,

    'brs_version',
      v_test_file.brs_version,

    'live_export_allowed',
      v_allowed,

    'accepted_test_file_id',
      v_test_file.id,

    'accepted_test_sha256',
      v_test_file.content_sha256,

    'current_test_sha256',
      v_current_hash,

    'test_payload_unchanged',
      v_current_hash is not null
      and
      v_current_hash =
      v_test_file.content_sha256,

    'acceptance_id',
      v_acceptance.id,

    'acceptance_reference',
      v_acceptance.acceptance_reference,

    'acceptance_channel',
      v_acceptance.acceptance_channel,

    'external_software_version',
      v_acceptance.external_software_version,

    'accepted_at',
      v_acceptance.accepted_at,

    'existing_live_file_id',
      v_existing_live_id,

    'blockers',
      v_blockers,

    'submitted_to_sars',
      false
  );

end;
$$;
-- ============================================================
-- 5. GENERATE CONTROLLED LIVE IMPORT FILE
--
-- The LIVE payload is based on the currently reconstructed
-- TEST payload ONLY after its hash matches the externally
-- accepted TEST file.
--
-- The ONLY intended data difference is:
--
--   2015,"TEST"
--        ->
--   2015,"LIVE"
--
-- No SARS submission occurs here.
-- ============================================================

create or replace function public.generate_payroll_sars_live_import_file(
  p_tax_year integer,
  p_period_type text default 'interim'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company_id uuid;

  v_period_type text;

  v_gate jsonb;

  v_acceptance_id uuid;

  v_test_file_id uuid;

  v_test_file public.payroll_sars_import_file%rowtype;

  v_acceptance public.payroll_sars_test_acceptance%rowtype;

  v_preview jsonb;

  v_test_payload text;

  v_live_payload text;

  v_test_header text;

  v_live_header text;

  v_trailer text;

  v_live_hash text;

  v_validation jsonb;

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


  v_period_type :=
    lower(
      btrim(
        coalesce(
          p_period_type,
          'interim'
        )
      )
    );


  v_gate :=
    public.get_payroll_sars_live_export_gate(
      p_tax_year,
      v_period_type
    );


  if not coalesce(
    (
      v_gate
      ->>
      'live_export_allowed'
    )::boolean,
    false
  ) then

    raise exception
      'SARS LIVE export gate is closed: %',
      coalesce(
        v_gate
        -> 'blockers',
        '[]'::jsonb
      )::text;

  end if;


  v_acceptance_id :=
    (
      v_gate
      ->>
      'acceptance_id'
    )::uuid;


  v_test_file_id :=
    (
      v_gate
      ->>
      'accepted_test_file_id'
    )::uuid;


  select *
  into v_acceptance

  from public.payroll_sars_test_acceptance

  where
    id =
      v_acceptance_id

    and company_id =
      v_company_id

  for update;


  select *
  into v_test_file

  from public.payroll_sars_import_file

  where
    id =
      v_test_file_id

    and company_id =
      v_company_id

    and mode =
      'TEST'

  for update;


  if v_acceptance.id is null
     or v_test_file.id is null
  then
    raise exception
      'Accepted TEST lineage could not be locked for LIVE generation.';
  end if;


  -- ----------------------------------------------------------
  -- Rebuild current TEST payload again under this transaction.
  -- ----------------------------------------------------------

  v_preview :=
    public.get_payroll_sars_csv_export_preview(
      p_tax_year,
      v_period_type,
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
      'Current TEST payload is no longer serializable.';

  end if;


  if (
    v_preview
    ->>
    'content_sha256'
  ) <>
  v_test_file.content_sha256
  then

    raise exception
      'Current TEST payload changed after external acceptance. Generate and externally validate a new TEST file.';

  end if;


  v_test_payload :=
    v_preview
    ->>
    'csv_payload';


  v_test_header :=
    v_preview
    ->>
    'header_record';


  v_trailer :=
    v_preview
    ->>
    'trailer_record';


  if position(
    '2015,"TEST"'
    in
    v_test_header
  ) = 0 then

    raise exception
      'Accepted TEST header does not contain the expected SARS TEST indicator.';
  end if;


  -- ----------------------------------------------------------
  -- Change only the TEST/LIVE indicator.
  -- ----------------------------------------------------------

  v_live_header :=
    replace(
      v_test_header,
      '2015,"TEST"',
      '2015,"LIVE"'
    );


  v_live_payload :=
    replace(
      v_test_payload,
      '2015,"TEST"',
      '2015,"LIVE"'
    );


  if v_live_header =
     v_test_header
  then

    raise exception
      'LIVE header conversion failed.';
  end if;


  if position(
    '2015,"LIVE"'
    in
    v_live_header
  ) = 0 then

    raise exception
      'LIVE header does not contain the SARS LIVE indicator.';
  end if;


  if position(
    '2015,"TEST"'
    in
    v_live_header
  ) > 0 then

    raise exception
      'TEST indicator remains in the generated LIVE header.';
  end if;


  -- ----------------------------------------------------------
  -- Structural validation after mode conversion.
  -- ----------------------------------------------------------

  v_validation :=
    public.validate_payroll_sars_csv_payload(
      v_live_payload
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
      'Generated LIVE SARS import file failed structural validation: %',
      v_validation::text;

  end if;


  v_live_hash :=
    encode(
      digest(
        convert_to(
          v_live_payload,
          'LATIN1'
        ),
        'sha256'
      ),
      'hex'
    );


  -- ----------------------------------------------------------
  -- Idempotency
  -- ----------------------------------------------------------

  select *
  into v_existing

  from public.payroll_sars_import_file

  where
    company_id =
      v_company_id

    and tax_year =
      p_tax_year

    and period_type =
      v_period_type

    and mode =
      'LIVE'

    and content_sha256 =
      v_live_hash

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
        'LIVE',

      'source_test_file_id',
        v_existing.source_test_file_id,

      'test_acceptance_id',
        v_existing.test_acceptance_id,

      'content_sha256',
        v_existing.content_sha256,

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

    created_by,

    source_test_file_id,

    test_acceptance_id
  )
  values (
    v_company_id,

    p_tax_year,
    v_period_type,

    v_preview
    ->>
    'reconciliation_period',

    'LIVE',

    v_preview
    ->>
    'brs_version',

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

    v_live_header,

    v_trailer,

    v_live_payload,

    v_live_hash,

    jsonb_build_object(

      'structural_validation',
        v_validation,

      'live_export_gate',
        v_gate,

      'accepted_test_file_id',
        v_test_file.id,

      'accepted_test_sha256',
        v_test_file.content_sha256,

      'acceptance_id',
        v_acceptance.id,

      'acceptance_reference',
        v_acceptance.acceptance_reference,

      'external_software_version',
        v_acceptance.external_software_version,

      'only_test_live_indicator_changed',
        true,

      'submitted_to_sars',
        false
    ),

    'validated_live',

    auth.uid(),

    v_test_file.id,

    v_acceptance.id
  )
  returning id
  into v_file_id;


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

    'payroll_sars_live_import_file_generated',

    'payroll',

    v_file_id,

    'Controlled SARS LIVE import file generated from externally accepted TEST lineage.',

    jsonb_build_object(

      'tax_year',
        p_tax_year,

      'period_type',
        v_period_type,

      'source_test_file_id',
        v_test_file.id,

      'accepted_test_sha256',
        v_test_file.content_sha256,

      'acceptance_id',
        v_acceptance.id,

      'acceptance_reference',
        v_acceptance.acceptance_reference,

      'live_content_sha256',
        v_live_hash,

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
      'LIVE',

    'brs_version',
      v_preview
      ->>
      'brs_version',

    'source_test_file_id',
      v_test_file.id,

    'test_acceptance_id',
      v_acceptance.id,

    'test_acceptance_reference',
      v_acceptance.acceptance_reference,

    'accepted_test_sha256',
      v_test_file.content_sha256,

    'content_sha256',
      v_live_hash,

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

    'structurally_valid',
      true,

    'live_file_generated',
      true,

    'submitted_to_sars',
      false
  );

end;
$$;
-- ============================================================
-- 6. RETRIEVE CONTROLLED LIVE FILE
-- ============================================================

create or replace function public.get_payroll_sars_live_import_file(
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

  v_acceptance public.payroll_sars_test_acceptance%rowtype;
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
      'LIVE'

    and status =
      'validated_live';


  if v_file.id is null then
    raise exception
      'Controlled SARS LIVE import file could not be found.';
  end if;


  if v_file.test_acceptance_id is not null then

    select *
    into v_acceptance

    from public.payroll_sars_test_acceptance

    where
      id =
        v_file.test_acceptance_id

      and company_id =
        v_company_id;

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

    'source_test_file_id',
      v_file.source_test_file_id,

    'test_acceptance_id',
      v_file.test_acceptance_id,

    'test_acceptance_reference',
      v_acceptance.acceptance_reference,

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
-- 7. SECURITY
-- ============================================================

revoke all
on function public.record_payroll_sars_test_acceptance(
  uuid,
  text,
  text,
  text,
  timestamptz,
  text
)
from public;
revoke all
on function public.record_payroll_sars_test_acceptance(
  uuid,
  text,
  text,
  text,
  timestamptz,
  text
)
from anon;
grant execute
on function public.record_payroll_sars_test_acceptance(
  uuid,
  text,
  text,
  text,
  timestamptz,
  text
)
to authenticated;
revoke all
on function public.get_payroll_sars_live_export_gate(
  integer,
  text
)
from public;
revoke all
on function public.get_payroll_sars_live_export_gate(
  integer,
  text
)
from anon;
grant execute
on function public.get_payroll_sars_live_export_gate(
  integer,
  text
)
to authenticated;
revoke all
on function public.generate_payroll_sars_live_import_file(
  integer,
  text
)
from public;
revoke all
on function public.generate_payroll_sars_live_import_file(
  integer,
  text
)
from anon;
grant execute
on function public.generate_payroll_sars_live_import_file(
  integer,
  text
)
to authenticated;
revoke all
on function public.get_payroll_sars_live_import_file(uuid)
from public;
revoke all
on function public.get_payroll_sars_live_import_file(uuid)
from anon;
grant execute
on function public.get_payroll_sars_live_import_file(uuid)
to authenticated;
-- ============================================================
-- 8. COMMENTS
-- ============================================================

comment on table public.payroll_sars_test_acceptance
is
'Immutable-style evidence that a specific Nexus-generated SARS TEST import file passed external validation. This evidence gates LIVE file generation and does not represent an EMP501 submission to SARS.';
comment on column
public.payroll_sars_import_file.source_test_file_id
is
'For LIVE files, identifies the externally accepted TEST file from which the LIVE file was derived.';
comment on column
public.payroll_sars_import_file.test_acceptance_id
is
'For LIVE files, identifies the external TEST acceptance evidence that authorised LIVE generation.';
comment on function public.record_payroll_sars_test_acceptance(
  uuid,
  text,
  text,
  text,
  timestamptz,
  text
)
is
'Records external SARS/e@syFile TEST validation evidence against an exact TEST file and SHA-256 payload. Does not submit anything to SARS.';
comment on function public.get_payroll_sars_live_export_gate(
  integer,
  text
)
is
'Authorises LIVE generation only when the current reconstructed TEST payload exactly matches an externally accepted TEST payload. Any material Nexus payroll/export change closes the gate.';
comment on function public.generate_payroll_sars_live_import_file(
  integer,
  text
)
is
'Generates a controlled LIVE SARS PAYE BRS import file only after external TEST acceptance and exact current TEST payload hash matching. The generated file is not submitted to SARS.';
comment on function public.get_payroll_sars_live_import_file(uuid)
is
'Returns a controlled Nexus-generated LIVE SARS import file and its accepted TEST lineage. No SARS submission is performed.';
