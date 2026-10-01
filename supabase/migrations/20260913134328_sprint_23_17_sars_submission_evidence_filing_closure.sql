-- ============================================================
-- JINLAB NEXUS
-- Sprint 23.17
-- SARS LIVE Submission Evidence & EMP501 Filing Closure
--
-- Boundary:
-- Nexus does NOT claim to transmit directly to SARS.
-- It records externally completed SARS/e@syFile/eFiling evidence,
-- preserves LIVE-file lineage and closes the Nexus EMP501 filing
-- workflow only after an accepted SARS outcome is recorded.
-- ============================================================


-- ============================================================
-- 1. SARS LIVE SUBMISSION EVIDENCE
-- ============================================================

create table public.payroll_sars_submission_evidence (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  live_file_id uuid not null
    references public.payroll_sars_import_file(id)
    on delete restrict,

  tax_year integer not null,

  period_type text not null
    check (
      period_type in (
        'interim',
        'annual'
      )
    ),

  reconciliation_period text not null,

  submission_channel text not null
    check (
      submission_channel in (
        'easyfile',
        'efiling'
      )
    ),

  submission_reference text not null,

  submission_status text not null
    default 'submitted'
    check (
      submission_status in (
        'submitted',
        'accepted',
        'rejected'
      )
    ),

  response_reference text,

  external_software_version text,

  submitted_at timestamptz not null,

  response_at timestamptz,

  recorded_by uuid
    references auth.users(id)
    on delete set null,

  notes text,

  evidence_snapshot jsonb not null
    default '{}'::jsonb,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  unique (
    company_id,
    live_file_id
  ),

  unique (
    company_id,
    submission_reference
  )
);
create index payroll_sars_submission_evidence_company_period_idx
  on public.payroll_sars_submission_evidence (
    company_id,
    tax_year,
    period_type,
    submitted_at desc
  );
alter table public.payroll_sars_submission_evidence
  enable row level security;
revoke all privileges
on table public.payroll_sars_submission_evidence
from anon, authenticated;
grant all privileges
on table public.payroll_sars_submission_evidence
to service_role;
comment on table public.payroll_sars_submission_evidence is
'Controlled evidence of an externally performed SARS/e@syFile/eFiling LIVE employer reconciliation submission.';
-- ============================================================
-- 2. EMP501 FILING CLOSURE
-- ============================================================

create table public.payroll_emp501_filing (
  id uuid primary key default gen_random_uuid(),

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

  period_code text not null
    check (
      period_code in (
        '08',
        '02'
      )
    ),

  live_file_id uuid not null
    references public.payroll_sars_import_file(id)
    on delete restrict,

  submission_evidence_id uuid not null
    references public.payroll_sars_submission_evidence(id)
    on delete restrict,

  status text not null
    default 'filed'
    check (
      status = 'filed'
    ),

  sars_accepted_at timestamptz not null,

  closed_at timestamptz not null
    default now(),

  closed_by uuid
    references auth.users(id)
    on delete set null,

  notes text,

  closure_snapshot jsonb not null
    default '{}'::jsonb,

  created_at timestamptz not null
    default now(),

  unique (
    company_id,
    tax_year,
    period_type
  ),

  unique (
    submission_evidence_id
  )
);
create index payroll_emp501_filing_company_period_idx
  on public.payroll_emp501_filing (
    company_id,
    tax_year,
    period_type,
    closed_at desc
  );
alter table public.payroll_emp501_filing
  enable row level security;
revoke all privileges
on table public.payroll_emp501_filing
from anon, authenticated;
grant all privileges
on table public.payroll_emp501_filing
to service_role;
comment on table public.payroll_emp501_filing is
'Closed Nexus EMP501 filing state backed by accepted external SARS submission evidence.';
-- ============================================================
-- 3. RECORD SARS LIVE SUBMISSION / OUTCOME
-- ============================================================

create or replace function public.record_payroll_sars_live_submission(
  p_live_file_id uuid,
  p_submission_reference text,
  p_submission_channel text default 'easyfile',
  p_submission_status text default 'submitted',
  p_submitted_at timestamptz default now(),
  p_response_reference text default null,
  p_response_at timestamptz default null,
  p_external_software_version text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_company_id uuid;

  v_file public.payroll_sars_import_file%rowtype;

  v_existing
    public.payroll_sars_submission_evidence%rowtype;

  v_evidence_id uuid;

  v_channel text;

  v_status text;

  v_submission_reference text;

  v_response_reference text;

  v_version text;

  v_validation jsonb;

  v_actual_hash text;

  v_action text;
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


  if p_live_file_id is null then
    raise exception
      'SARS LIVE file is required.';
  end if;


  v_submission_reference :=
    nullif(
      btrim(
        coalesce(
          p_submission_reference,
          ''
        )
      ),
      ''
    );


  if v_submission_reference is null then
    raise exception
      'SARS submission reference is required.';
  end if;


  v_channel :=
    lower(
      btrim(
        coalesce(
          p_submission_channel,
          'easyfile'
        )
      )
    );


  if v_channel not in (
    'easyfile',
    'efiling'
  ) then
    raise exception
      'Submission channel must be easyfile or efiling.';
  end if;


  v_status :=
    lower(
      btrim(
        coalesce(
          p_submission_status,
          'submitted'
        )
      )
    );


  if v_status not in (
    'submitted',
    'accepted',
    'rejected'
  ) then
    raise exception
      'Submission status must be submitted, accepted or rejected.';
  end if;


  if p_submitted_at is null then
    raise exception
      'Submission date/time is required.';
  end if;


  if p_submitted_at > now() then
    raise exception
      'Submission date/time cannot be in the future.';
  end if;


  v_response_reference :=
    nullif(
      btrim(
        coalesce(
          p_response_reference,
          ''
        )
      ),
      ''
    );


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


  if v_status in (
    'accepted',
    'rejected'
  ) then

    if v_response_reference is null then
      raise exception
        'A SARS response/acknowledgement reference is required for an accepted or rejected outcome.';
    end if;


    if p_response_at is null then
      raise exception
        'SARS response date/time is required for an accepted or rejected outcome.';
    end if;


    if p_response_at > now() then
      raise exception
        'SARS response date/time cannot be in the future.';
    end if;


    if p_response_at < p_submitted_at then
      raise exception
        'SARS response date/time cannot predate the submission.';
    end if;

  end if;


  select *
  into v_file

  from public.payroll_sars_import_file

  where
    id =
      p_live_file_id

    and company_id =
      v_company_id

  for update;


  if v_file.id is null then
    raise exception
      'SARS LIVE import file could not be found.';
  end if;


  if v_file.mode <> 'LIVE' then
    raise exception
      'Only a controlled LIVE SARS import file may receive submission evidence.';
  end if;


  if v_file.status <> 'validated_live' then
    raise exception
      'The SARS LIVE file is not in a validated LIVE state.';
  end if;


  if p_submitted_at <
     v_file.created_at
  then
    raise exception
      'SARS submission cannot predate generation of the LIVE file.';
  end if;


  -- ----------------------------------------------------------
  -- Revalidate LIVE payload before evidence is attached.
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
      'The LIVE file no longer passes structural validation.';

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
      'LIVE file integrity hash mismatch. Submission evidence cannot be recorded.';
  end if;


  select *
  into v_existing

  from public.payroll_sars_submission_evidence

  where
    company_id =
      v_company_id

    and live_file_id =
      v_file.id

  for update;


  -- ----------------------------------------------------------
  -- Existing evidence:
  -- allow submitted -> accepted/rejected transition.
  -- Final accepted/rejected states are not silently replaced.
  -- ----------------------------------------------------------

  if v_existing.id is not null then

    if v_existing.submission_reference <>
       v_submission_reference
    then
      raise exception
        'This LIVE file already has a different SARS submission reference.';
    end if;


    if v_existing.submission_channel <>
       v_channel
    then
      raise exception
        'The submission channel cannot be changed for this LIVE filing.';
    end if;


    if v_existing.submission_status in (
      'accepted',
      'rejected'
    )
    and v_existing.submission_status <>
        v_status
    then
      raise exception
        'The recorded SARS outcome is already final and cannot be replaced.';
    end if;


    if v_existing.submission_status =
       v_status

       and coalesce(
         v_existing.response_reference,
         ''
       ) =
       coalesce(
         v_response_reference,
         ''
       )
    then

      return jsonb_build_object(

        'ok',
          true,

        'evidence_id',
          v_existing.id,

        'live_file_id',
          v_existing.live_file_id,

        'submission_reference',
          v_existing.submission_reference,

        'submission_channel',
          v_existing.submission_channel,

        'submission_status',
          v_existing.submission_status,

        'response_reference',
          v_existing.response_reference,

        'already_recorded',
          true,

        'filing_ready',
          v_existing.submission_status =
          'accepted'
      );

    end if;


    if v_existing.submission_status <>
       'submitted'
    then
      raise exception
        'Only a submitted SARS evidence record may transition to accepted or rejected.';
    end if;


    update public.payroll_sars_submission_evidence
    set
      submission_status =
        v_status,

      response_reference =
        v_response_reference,

      response_at =
        p_response_at,

      external_software_version =
        coalesce(
          v_version,
          external_software_version
        ),

      notes =
        coalesce(
          nullif(
            btrim(
              coalesce(
                p_notes,
                ''
              )
            ),
            ''
          ),
          notes
        ),

      evidence_snapshot =
        evidence_snapshot
        ||
        jsonb_build_object(

          'latest_status',
            v_status,

          'response_reference',
            v_response_reference,

          'response_at',
            p_response_at,

          'live_file_sha256',
            v_file.content_sha256,

          'brs_version',
            v_file.brs_version,

          'structural_validation',
            v_validation
        ),

      updated_at =
        now()

    where id =
      v_existing.id

    returning id
    into v_evidence_id;


    v_action :=
      'payroll_sars_live_submission_status_updated';

  else

    insert into public.payroll_sars_submission_evidence (
      company_id,

      live_file_id,

      tax_year,

      period_type,

      reconciliation_period,

      submission_channel,

      submission_reference,

      submission_status,

      response_reference,

      external_software_version,

      submitted_at,

      response_at,

      recorded_by,

      notes,

      evidence_snapshot
    )
    values (
      v_company_id,

      v_file.id,

      v_file.tax_year,

      v_file.period_type,

      v_file.reconciliation_period,

      v_channel,

      v_submission_reference,

      v_status,

      v_response_reference,

      v_version,

      p_submitted_at,

      p_response_at,

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

        'live_file_id',
          v_file.id,

        'live_file_sha256',
          v_file.content_sha256,

        'brs_version',
          v_file.brs_version,

        'certificate_count',
          v_file.certificate_count,

        'record_count',
          v_file.record_count,

        'source_test_file_id',
          v_file.source_test_file_id,

        'test_acceptance_id',
          v_file.test_acceptance_id,

        'submission_channel',
          v_channel,

        'submission_reference',
          v_submission_reference,

        'submission_status',
          v_status,

        'response_reference',
          v_response_reference,

        'response_at',
          p_response_at,

        'structural_validation',
          v_validation,

        'submission_performed_externally',
          true
      )
    )

    returning id
    into v_evidence_id;


    v_action :=
      'payroll_sars_live_submission_recorded';

  end if;


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

    v_action,

    'payroll',

    v_evidence_id,

    case

      when v_action =
           'payroll_sars_live_submission_recorded'
        then
          'External SARS LIVE employer reconciliation submission evidence recorded.'

      else
          'External SARS LIVE employer reconciliation submission outcome updated.'

    end,

    jsonb_build_object(

      'live_file_id',
        v_file.id,

      'tax_year',
        v_file.tax_year,

      'period_type',
        v_file.period_type,

      'submission_channel',
        v_channel,

      'submission_reference',
        v_submission_reference,

      'submission_status',
        v_status,

      'response_reference',
        v_response_reference,

      'live_file_sha256',
        v_file.content_sha256,

      'submitted_directly_by_nexus',
        false
    )
  );


  return jsonb_build_object(

    'ok',
      true,

    'evidence_id',
      v_evidence_id,

    'live_file_id',
      v_file.id,

    'tax_year',
      v_file.tax_year,

    'period_type',
      v_file.period_type,

    'submission_channel',
      v_channel,

    'submission_reference',
      v_submission_reference,

    'submission_status',
      v_status,

    'response_reference',
      v_response_reference,

    'submitted_at',
      p_submitted_at,

    'response_at',
      p_response_at,

    'already_recorded',
      false,

    'filing_ready',
      v_status =
      'accepted',

    'submitted_directly_by_nexus',
      false
  );

end;
$function$;
-- ============================================================
-- 4. CLOSE EMP501 FILING
-- ============================================================

create or replace function public.close_payroll_emp501_filing(
  p_submission_evidence_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_company_id uuid;

  v_evidence
    public.payroll_sars_submission_evidence%rowtype;

  v_file
    public.payroll_sars_import_file%rowtype;

  v_existing
    public.payroll_emp501_filing%rowtype;

  v_gate jsonb;

  v_actual_hash text;

  v_filing_id uuid;

  v_period_code text;
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


  if p_submission_evidence_id is null then
    raise exception
      'SARS submission evidence is required.';
  end if;


  select *
  into v_evidence

  from public.payroll_sars_submission_evidence

  where
    id =
      p_submission_evidence_id

    and company_id =
      v_company_id

  for update;


  if v_evidence.id is null then
    raise exception
      'SARS LIVE submission evidence could not be found.';
  end if;


  if v_evidence.submission_status <>
     'accepted'
  then
    raise exception
      'EMP501 filing may only be closed after an accepted SARS outcome is recorded.';
  end if;


  if v_evidence.response_reference is null
     or v_evidence.response_at is null
  then
    raise exception
      'Accepted SARS evidence is incomplete.';
  end if;


  select *
  into v_file

  from public.payroll_sars_import_file

  where
    id =
      v_evidence.live_file_id

    and company_id =
      v_company_id

  for update;


  if v_file.id is null then
    raise exception
      'The LIVE file linked to this SARS evidence could not be found.';
  end if;


  if v_file.mode <> 'LIVE'
     or v_file.status <> 'validated_live'
  then
    raise exception
      'The filing evidence is not linked to a valid controlled LIVE file.';
  end if;


  if v_file.tax_year <>
     v_evidence.tax_year

     or v_file.period_type <>
        v_evidence.period_type
  then
    raise exception
      'SARS evidence does not match the LIVE file filing period.';
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
      'LIVE file integrity hash mismatch. EMP501 closure is blocked.';
  end if;


  -- ----------------------------------------------------------
  -- Re-run the controlled LIVE gate before closure.
  -- This proves the accepted external filing still belongs to
  -- the exact TEST -> LIVE lineage held by Nexus.
  -- ----------------------------------------------------------

  v_gate :=
    public.get_payroll_sars_live_export_gate(
      v_file.tax_year,
      v_file.period_type
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
      'EMP501 closure blocked because the LIVE lineage gate is no longer valid: %',
      coalesce(
        v_gate
        ->
        'blockers',
        '[]'::jsonb
      )::text;

  end if;


  if nullif(
    v_gate
    ->>
    'existing_live_file_id',
    ''
  )::uuid <>
  v_file.id
  then

    raise exception
      'The accepted SARS evidence is not linked to the current controlled LIVE filing artifact.';

  end if;


  -- ----------------------------------------------------------
  -- Existing closure = idempotency.
  -- ----------------------------------------------------------

  select *
  into v_existing

  from public.payroll_emp501_filing

  where
    company_id =
      v_company_id

    and tax_year =
      v_file.tax_year

    and period_type =
      v_file.period_type

  for update;


  if v_existing.id is not null then

    if v_existing.submission_evidence_id =
       v_evidence.id
    then

      return jsonb_build_object(

        'ok',
          true,

        'filing_id',
          v_existing.id,

        'tax_year',
          v_existing.tax_year,

        'period_type',
          v_existing.period_type,

        'status',
          v_existing.status,

        'closed_at',
          v_existing.closed_at,

        'already_closed',
          true
      );

    end if;


    raise exception
      'This EMP501 filing period is already closed using different SARS submission evidence. A controlled revision/resubmission workflow is required.';

  end if;


  -- SARS does not process an interim reconciliation after
  -- a final/annual reconciliation for the same tax year.
  if v_file.period_type =
     'interim'
  then

    if exists (
      select 1

      from public.payroll_emp501_filing f

      where
        f.company_id =
          v_company_id

        and f.tax_year =
          v_file.tax_year

        and f.period_type =
          'annual'

        and f.status =
          'filed'
    ) then

      raise exception
        'An annual EMP501 filing is already closed for this tax year. Interim closure is blocked.';

    end if;

  end if;


  v_period_code :=
    case
      when v_file.period_type =
           'interim'
        then '08'
      else '02'
    end;


  insert into public.payroll_emp501_filing (
    company_id,

    tax_year,

    period_type,

    period_code,

    live_file_id,

    submission_evidence_id,

    status,

    sars_accepted_at,

    closed_at,

    closed_by,

    notes,

    closure_snapshot
  )
  values (
    v_company_id,

    v_file.tax_year,

    v_file.period_type,

    v_period_code,

    v_file.id,

    v_evidence.id,

    'filed',

    v_evidence.response_at,

    now(),

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

      'tax_year',
        v_file.tax_year,

      'period_type',
        v_file.period_type,

      'period_code',
        v_period_code,

      'live_file_id',
        v_file.id,

      'live_file_sha256',
        v_file.content_sha256,

      'brs_version',
        v_file.brs_version,

      'certificate_count',
        v_file.certificate_count,

      'record_count',
        v_file.record_count,

      'source_test_file_id',
        v_file.source_test_file_id,

      'test_acceptance_id',
        v_file.test_acceptance_id,

      'submission_evidence_id',
        v_evidence.id,

      'submission_channel',
        v_evidence.submission_channel,

      'submission_reference',
        v_evidence.submission_reference,

      'sars_response_reference',
        v_evidence.response_reference,

      'sars_accepted_at',
        v_evidence.response_at,

      'live_export_gate',
        v_gate,

      'submission_performed_externally',
        true,

      'nexus_filing_closed',
        true
    )
  )

  returning id
  into v_filing_id;


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

    'payroll_emp501_filing_closed',

    'payroll',

    v_filing_id,

    'EMP501 filing closed in Nexus using accepted external SARS submission evidence.',

    jsonb_build_object(

      'tax_year',
        v_file.tax_year,

      'period_type',
        v_file.period_type,

      'period_code',
        v_period_code,

      'live_file_id',
        v_file.id,

      'submission_evidence_id',
        v_evidence.id,

      'submission_reference',
        v_evidence.submission_reference,

      'sars_response_reference',
        v_evidence.response_reference,

      'live_file_sha256',
        v_file.content_sha256,

      'submitted_directly_by_nexus',
        false
    )
  );


  return jsonb_build_object(

    'ok',
      true,

    'filing_id',
      v_filing_id,

    'tax_year',
      v_file.tax_year,

    'period_type',
      v_file.period_type,

    'period_code',
      v_period_code,

    'live_file_id',
      v_file.id,

    'submission_evidence_id',
      v_evidence.id,

    'submission_reference',
      v_evidence.submission_reference,

    'sars_response_reference',
      v_evidence.response_reference,

    'status',
      'filed',

    'already_closed',
      false,

    'nexus_filing_closed',
      true,

    'submitted_directly_by_nexus',
      false
  );

end;
$function$;
-- ============================================================
-- 5. EMP501 FILING CONTROL / READINESS
-- ============================================================

create or replace function public.get_payroll_emp501_filing_control(
  p_tax_year integer,
  p_period_type text default 'interim'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_company_id uuid;

  v_period_type text;

  v_file
    public.payroll_sars_import_file%rowtype;

  v_evidence
    public.payroll_sars_submission_evidence%rowtype;

  v_filing
    public.payroll_emp501_filing%rowtype;

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


  -- Prefer an already closed filing.

  select *
  into v_filing

  from public.payroll_emp501_filing

  where
    company_id =
      v_company_id

    and tax_year =
      p_tax_year

    and period_type =
      v_period_type

  limit 1;


  if v_filing.id is not null then

    select *
    into v_evidence

    from public.payroll_sars_submission_evidence

    where
      id =
        v_filing.submission_evidence_id

      and company_id =
        v_company_id;


    select *
    into v_file

    from public.payroll_sars_import_file

    where
      id =
        v_filing.live_file_id

      and company_id =
        v_company_id;

  else

    select *
    into v_file

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

      and status =
        'validated_live'

    order by
      created_at desc

    limit 1;


    if v_file.id is not null then

      select *
      into v_evidence

      from public.payroll_sars_submission_evidence

      where
        company_id =
          v_company_id

        and live_file_id =
          v_file.id

      limit 1;

    end if;

  end if;


  if v_file.id is null then

    v_blockers :=
      v_blockers
      ||
      jsonb_build_array(
        'No controlled SARS LIVE import file exists for this EMP501 period.'
      );

  end if;


  if v_file.id is not null
     and v_evidence.id is null
  then

    v_blockers :=
      v_blockers
      ||
      jsonb_build_array(
        'No external SARS submission evidence has been recorded for the LIVE file.'
      );

  end if;


  if v_evidence.id is not null
     and v_evidence.submission_status <>
         'accepted'
  then

    v_blockers :=
      v_blockers
      ||
      jsonb_build_array(
        'SARS submission evidence exists but the filing has not been recorded as accepted.'
      );

  end if;


  return jsonb_build_object(

    'ok',
      true,

    'tax_year',
      p_tax_year,

    'period_type',
      v_period_type,

    'live_file_generated',
      v_file.id is not null,

    'live_file_id',
      v_file.id,

    'live_file_sha256',
      v_file.content_sha256,

    'brs_version',
      v_file.brs_version,

    'submission_recorded',
      v_evidence.id is not null,

    'submission_evidence_id',
      v_evidence.id,

    'submission_channel',
      v_evidence.submission_channel,

    'submission_reference',
      v_evidence.submission_reference,

    'submission_status',
      v_evidence.submission_status,

    'sars_response_reference',
      v_evidence.response_reference,

    'sars_response_at',
      v_evidence.response_at,

    'ready_to_close',
      v_filing.id is null
      and
      v_evidence.id is not null
      and
      v_evidence.submission_status =
      'accepted',

    'filing_closed',
      v_filing.id is not null,

    'filing_id',
      v_filing.id,

    'filing_status',
      v_filing.status,

    'closed_at',
      v_filing.closed_at,

    'blockers',
      v_blockers,

    'submitted_directly_by_nexus',
      false
  );

end;
$function$;
-- ============================================================
-- 6. UPGRADE LIVE FILE READBACK
-- Remove Sprint 23.16 hard-coded submitted_to_sars=false.
-- ============================================================

create or replace function public.get_payroll_sars_live_import_file(
  p_file_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_company_id uuid;

  v_file
    public.payroll_sars_import_file%rowtype;

  v_acceptance
    public.payroll_sars_test_acceptance%rowtype;

  v_submission
    public.payroll_sars_submission_evidence%rowtype;

  v_filing
    public.payroll_emp501_filing%rowtype;
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


  select *
  into v_submission

  from public.payroll_sars_submission_evidence

  where
    company_id =
      v_company_id

    and live_file_id =
      v_file.id

  limit 1;


  select *
  into v_filing

  from public.payroll_emp501_filing

  where
    company_id =
      v_company_id

    and live_file_id =
      v_file.id

  limit 1;


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
      v_submission.id is not null,

    'submission_evidence_id',
      v_submission.id,

    'submission_channel',
      v_submission.submission_channel,

    'submission_reference',
      v_submission.submission_reference,

    'submission_status',
      v_submission.submission_status,

    'sars_response_reference',
      v_submission.response_reference,

    'sars_response_at',
      v_submission.response_at,

    'sars_submission_accepted',
      coalesce(
        v_submission.submission_status =
        'accepted',
        false
      ),

    'emp501_filing_closed',
      v_filing.id is not null,

    'emp501_filing_id',
      v_filing.id,

    'emp501_filing_status',
      v_filing.status,

    'emp501_closed_at',
      v_filing.closed_at,

    'submitted_directly_by_nexus',
      false
  );

end;
$function$;
-- ============================================================
-- 7. FUNCTION SECURITY
-- ============================================================

revoke all
on function public.record_payroll_sars_live_submission(
  uuid,
  text,
  text,
  text,
  timestamptz,
  text,
  timestamptz,
  text,
  text
)
from public;
revoke all
on function public.record_payroll_sars_live_submission(
  uuid,
  text,
  text,
  text,
  timestamptz,
  text,
  timestamptz,
  text,
  text
)
from anon;
grant execute
on function public.record_payroll_sars_live_submission(
  uuid,
  text,
  text,
  text,
  timestamptz,
  text,
  timestamptz,
  text,
  text
)
to authenticated, service_role;
revoke all
on function public.close_payroll_emp501_filing(
  uuid,
  text
)
from public;
revoke all
on function public.close_payroll_emp501_filing(
  uuid,
  text
)
from anon;
grant execute
on function public.close_payroll_emp501_filing(
  uuid,
  text
)
to authenticated, service_role;
revoke all
on function public.get_payroll_emp501_filing_control(
  integer,
  text
)
from public;
revoke all
on function public.get_payroll_emp501_filing_control(
  integer,
  text
)
from anon;
grant execute
on function public.get_payroll_emp501_filing_control(
  integer,
  text
)
to authenticated, service_role;
revoke all
on function public.get_payroll_sars_live_import_file(
  uuid
)
from public;
revoke all
on function public.get_payroll_sars_live_import_file(
  uuid
)
from anon;
grant execute
on function public.get_payroll_sars_live_import_file(
  uuid
)
to authenticated, service_role;
-- ============================================================
-- END SPRINT 23.17
-- ============================================================;
