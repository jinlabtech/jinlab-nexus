-- ============================================================
-- SPRINT 23.18
-- EMP501 revision and controlled SARS resubmission workflow
-- ============================================================

create table public.payroll_emp501_revision (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  original_filing_id uuid not null references public.payroll_emp501_filing(id) on delete restrict,
  previous_revision_id uuid references public.payroll_emp501_revision(id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  tax_year integer not null,
  period_type text not null check (period_type in ('interim', 'annual')),
  required_submission_channel text not null check (required_submission_channel in ('easyfile', 'efiling')),
  revision_reason text not null check (char_length(btrim(revision_reason)) >= 10),
  change_summary text,
  status text not null default 'pending_approval'
    check (status in (
      'pending_approval', 'approved', 'live_ready', 'submitted',
      'accepted', 'submission_rejected', 'closed', 'rejected', 'cancelled'
    )),
  new_live_file_id uuid references public.payroll_sars_import_file(id) on delete restrict,
  new_submission_evidence_id uuid references public.payroll_sars_submission_evidence(id) on delete restrict,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  decision_by uuid references auth.users(id) on delete set null,
  decision_at timestamptz,
  decision_notes text,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  cancellation_reason text,
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  close_notes text,
  is_current_effective boolean not null default false,
  request_snapshot jsonb not null default '{}'::jsonb,
  closure_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_emp501_revision_filing_number_key
    unique (original_filing_id, revision_number),
  constraint payroll_emp501_revision_effective_closed_check
    check (not is_current_effective or status = 'closed')
);

alter table public.payroll_sars_import_file
  add column emp501_revision_id uuid
  references public.payroll_emp501_revision(id)
  on delete restrict;

create index payroll_emp501_revision_company_period_idx
  on public.payroll_emp501_revision(company_id, tax_year, period_type, revision_number desc);

create unique index payroll_emp501_revision_one_active_idx
  on public.payroll_emp501_revision(original_filing_id)
  where status not in ('closed', 'rejected', 'cancelled');

create unique index payroll_emp501_revision_one_effective_idx
  on public.payroll_emp501_revision(original_filing_id)
  where is_current_effective;

create unique index payroll_emp501_revision_live_file_key
  on public.payroll_emp501_revision(new_live_file_id)
  where new_live_file_id is not null;

create unique index payroll_emp501_revision_evidence_key
  on public.payroll_emp501_revision(new_submission_evidence_id)
  where new_submission_evidence_id is not null;

create index payroll_sars_import_file_emp501_revision_idx
  on public.payroll_sars_import_file(emp501_revision_id)
  where emp501_revision_id is not null;

alter table public.payroll_emp501_revision enable row level security;

revoke all on table public.payroll_emp501_revision from public, anon, authenticated;
grant all on table public.payroll_emp501_revision to service_role;

comment on table public.payroll_emp501_revision is
  'Immutable EMP501 correction/resubmission control history. Original filed records remain preserved.';

comment on column public.payroll_emp501_revision.required_submission_channel is
  'SARS requires subsequent transactions for a reconciliation to use its originally selected channel.';

-- ------------------------------------------------------------
-- Enforce original SARS channel and active revision linkage.
-- ------------------------------------------------------------

create or replace function public.enforce_emp501_revision_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_file public.payroll_sars_import_file%rowtype;
  v_revision public.payroll_emp501_revision%rowtype;
begin
  select * into v_file
  from public.payroll_sars_import_file
  where id = new.live_file_id;

  if v_file.emp501_revision_id is null then
    return new;
  end if;

  select * into v_revision
  from public.payroll_emp501_revision
  where id = v_file.emp501_revision_id;

  if v_revision.id is null then
    raise exception 'EMP501 revision linkage is invalid.';
  end if;

  if v_revision.new_live_file_id is distinct from new.live_file_id then
    raise exception 'Submission evidence must belong to the current LIVE artifact for the EMP501 revision.';
  end if;

  if v_revision.status in ('closed', 'rejected', 'cancelled') then
    raise exception 'This EMP501 revision no longer accepts submission evidence.';
  end if;

  if lower(new.submission_channel) <> v_revision.required_submission_channel then
    raise exception 'SARS resubmission must use the original reconciliation channel: %',
      v_revision.required_submission_channel;
  end if;

  if new.company_id <> v_revision.company_id
     or new.tax_year <> v_revision.tax_year
     or new.period_type <> v_revision.period_type then
    raise exception 'Submission evidence does not match the EMP501 revision company or period.';
  end if;

  return new;
end;
$function$;

create trigger enforce_emp501_revision_submission_trigger
before insert or update on public.payroll_sars_submission_evidence
for each row execute function public.enforce_emp501_revision_submission();

-- Synchronise the revision state from the controlled evidence row.
create or replace function public.sync_emp501_revision_submission_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_revision_id uuid;
begin
  select emp501_revision_id into v_revision_id
  from public.payroll_sars_import_file
  where id = new.live_file_id;

  if v_revision_id is null then
    return new;
  end if;

  update public.payroll_emp501_revision
  set new_submission_evidence_id = new.id,
      status = case lower(new.submission_status)
        when 'accepted' then 'accepted'
        when 'rejected' then 'submission_rejected'
        else 'submitted'
      end,
      updated_at = now()
  where id = v_revision_id
    and new_live_file_id = new.live_file_id
    and status <> 'closed';

  return new;
end;
$function$;

create trigger sync_emp501_revision_submission_state_trigger
after insert or update on public.payroll_sars_submission_evidence
for each row execute function public.sync_emp501_revision_submission_state();

-- ------------------------------------------------------------
-- Request a revision. The original filing is never reopened or
-- overwritten; this creates a controlled correction envelope.
-- ------------------------------------------------------------

create or replace function public.request_payroll_emp501_revision(
  p_filing_id uuid,
  p_revision_reason text,
  p_change_summary text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company_id uuid;
  v_filing public.payroll_emp501_filing%rowtype;
  v_original_evidence public.payroll_sars_submission_evidence%rowtype;
  v_existing public.payroll_emp501_revision%rowtype;
  v_previous_revision_id uuid;
  v_revision_number integer;
  v_revision_id uuid;
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('payroll.manage') then
    raise exception 'Permission denied: payroll.manage';
  end if;

  v_company_id := public.current_company_id();
  v_reason := nullif(btrim(coalesce(p_revision_reason, '')), '');

  if v_reason is null or char_length(v_reason) < 10 then
    raise exception 'A meaningful EMP501 revision reason of at least 10 characters is required.';
  end if;

  select * into v_filing
  from public.payroll_emp501_filing
  where id = p_filing_id
    and company_id = v_company_id
    and status = 'filed'
  for update;

  if v_filing.id is null then
    raise exception 'A closed EMP501 filing could not be found for this company.';
  end if;

  select * into v_original_evidence
  from public.payroll_sars_submission_evidence
  where id = v_filing.submission_evidence_id
    and company_id = v_company_id;

  if v_original_evidence.id is null
     or v_original_evidence.submission_status <> 'accepted' then
    raise exception 'The original accepted SARS evidence could not be verified.';
  end if;

  select * into v_existing
  from public.payroll_emp501_revision
  where original_filing_id = v_filing.id
    and status not in ('closed', 'rejected', 'cancelled')
  limit 1;

  if v_existing.id is not null then
    raise exception 'An active EMP501 revision already exists for this filing: %', v_existing.id;
  end if;

  select id into v_previous_revision_id
  from public.payroll_emp501_revision
  where original_filing_id = v_filing.id
    and status = 'closed'
  order by revision_number desc
  limit 1;

  select coalesce(max(revision_number), 0) + 1 into v_revision_number
  from public.payroll_emp501_revision
  where original_filing_id = v_filing.id;

  insert into public.payroll_emp501_revision (
    company_id, original_filing_id, previous_revision_id,
    revision_number, tax_year, period_type,
    required_submission_channel, revision_reason, change_summary,
    status, requested_by, request_snapshot
  ) values (
    v_company_id, v_filing.id, v_previous_revision_id,
    v_revision_number, v_filing.tax_year, v_filing.period_type,
    v_original_evidence.submission_channel, v_reason,
    nullif(btrim(coalesce(p_change_summary, '')), ''),
    'pending_approval', auth.uid(),
    jsonb_build_object(
      'original_filing_id', v_filing.id,
      'original_live_file_id', v_filing.live_file_id,
      'original_submission_evidence_id', v_filing.submission_evidence_id,
      'original_closure_snapshot', v_filing.closure_snapshot,
      'previous_revision_id', v_previous_revision_id,
      'required_submission_channel', v_original_evidence.submission_channel
    )
  ) returning id into v_revision_id;

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  ) values (
    v_company_id, auth.uid(), 'payroll_emp501_revision_requested',
    'payroll', v_revision_id,
    'Controlled EMP501 revision/resubmission requested.',
    jsonb_build_object(
      'original_filing_id', v_filing.id,
      'revision_number', v_revision_number,
      'reason', v_reason,
      'required_submission_channel', v_original_evidence.submission_channel
    )
  );

  return jsonb_build_object(
    'ok', true,
    'revision_id', v_revision_id,
    'original_filing_id', v_filing.id,
    'revision_number', v_revision_number,
    'status', 'pending_approval',
    'required_submission_channel', v_original_evidence.submission_channel,
    'original_filing_preserved', true
  );
end;
$function$;

-- ------------------------------------------------------------
-- Approve or reject the requested revision.
-- ------------------------------------------------------------

create or replace function public.decide_payroll_emp501_revision(
  p_revision_id uuid,
  p_approve boolean,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company_id uuid;
  v_revision public.payroll_emp501_revision%rowtype;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('payroll.manage') then
    raise exception 'Permission denied: payroll.manage';
  end if;

  if p_approve is null then
    raise exception 'Approval decision is required.';
  end if;

  v_company_id := public.current_company_id();

  select * into v_revision
  from public.payroll_emp501_revision
  where id = p_revision_id and company_id = v_company_id
  for update;

  if v_revision.id is null then
    raise exception 'EMP501 revision could not be found.';
  end if;

  if v_revision.status <> 'pending_approval' then
    raise exception 'Only a pending EMP501 revision can be approved or rejected.';
  end if;

  v_status := case when p_approve then 'approved' else 'rejected' end;

  update public.payroll_emp501_revision
  set status = v_status,
      decision_by = auth.uid(),
      decision_at = now(),
      decision_notes = nullif(btrim(coalesce(p_notes, '')), ''),
      updated_at = now()
  where id = v_revision.id;

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  ) values (
    v_company_id, auth.uid(),
    case when p_approve then 'payroll_emp501_revision_approved'
         else 'payroll_emp501_revision_rejected' end,
    'payroll', v_revision.id,
    case when p_approve then 'EMP501 revision approved for controlled resubmission.'
         else 'EMP501 revision request rejected.' end,
    jsonb_build_object(
      'original_filing_id', v_revision.original_filing_id,
      'revision_number', v_revision.revision_number,
      'four_eyes_applied', auth.uid() is distinct from v_revision.requested_by
    )
  );

  return jsonb_build_object(
    'ok', true,
    'revision_id', v_revision.id,
    'revision_number', v_revision.revision_number,
    'status', v_status,
    'four_eyes_applied', auth.uid() is distinct from v_revision.requested_by
  );
end;
$function$;

-- ------------------------------------------------------------
-- Attach a newly generated LIVE file after new TEST acceptance.
-- This must happen before recording SARS LIVE submission evidence.
-- ------------------------------------------------------------

create or replace function public.attach_payroll_emp501_revision_live_file(
  p_revision_id uuid,
  p_live_file_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company_id uuid;
  v_revision public.payroll_emp501_revision%rowtype;
  v_filing public.payroll_emp501_filing%rowtype;
  v_file public.payroll_sars_import_file%rowtype;
  v_prior_file public.payroll_sars_import_file%rowtype;
  v_acceptance public.payroll_sars_test_acceptance%rowtype;
  v_prior_file_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('payroll.manage') then
    raise exception 'Permission denied: payroll.manage';
  end if;

  v_company_id := public.current_company_id();

  select * into v_revision
  from public.payroll_emp501_revision
  where id = p_revision_id and company_id = v_company_id
  for update;

  if v_revision.id is null then
    raise exception 'EMP501 revision could not be found.';
  end if;

  if v_revision.new_live_file_id = p_live_file_id
     and v_revision.status = 'live_ready' then
    return jsonb_build_object(
      'ok', true, 'revision_id', v_revision.id,
      'live_file_id', p_live_file_id, 'status', v_revision.status,
      'already_attached', true
    );
  end if;

  if v_revision.status not in ('approved', 'live_ready', 'submission_rejected') then
    raise exception 'The revision must be approved, LIVE-ready, or rejected by SARS before attaching a LIVE file.';
  end if;

  select * into v_filing
  from public.payroll_emp501_filing
  where id = v_revision.original_filing_id
    and company_id = v_company_id;

  select * into v_file
  from public.payroll_sars_import_file
  where id = p_live_file_id and company_id = v_company_id
  for update;

  if v_file.id is null or v_file.mode <> 'LIVE' or v_file.status <> 'validated_live' then
    raise exception 'A controlled validated LIVE file is required.';
  end if;

  if v_file.tax_year <> v_revision.tax_year
     or v_file.period_type <> v_revision.period_type then
    raise exception 'The LIVE file does not match the revision tax year or period.';
  end if;

  if v_file.source_test_file_id is null or v_file.test_acceptance_id is null then
    raise exception 'The LIVE file has no accepted TEST lineage.';
  end if;

  if v_file.created_at < v_revision.requested_at then
    raise exception 'The revision LIVE file must be generated after the revision request.';
  end if;

  select * into v_acceptance
  from public.payroll_sars_test_acceptance
  where id = v_file.test_acceptance_id
    and company_id = v_company_id
    and test_file_id = v_file.source_test_file_id;

  if v_acceptance.id is null or v_acceptance.accepted_at < v_revision.requested_at then
    raise exception 'A new external TEST acceptance recorded after the revision request is required.';
  end if;

  if v_file.emp501_revision_id is not null
     and v_file.emp501_revision_id <> v_revision.id then
    raise exception 'This LIVE file already belongs to another EMP501 revision.';
  end if;

  if exists (
    select 1 from public.payroll_sars_submission_evidence
    where company_id = v_company_id and live_file_id = v_file.id
  ) then
    raise exception 'Attach the revision LIVE file before recording SARS submission evidence.';
  end if;

  if v_revision.previous_revision_id is null then
    v_prior_file_id := v_filing.live_file_id;
  else
    select new_live_file_id into v_prior_file_id
    from public.payroll_emp501_revision
    where id = v_revision.previous_revision_id
      and company_id = v_company_id
      and status = 'closed';
  end if;

  select * into v_prior_file
  from public.payroll_sars_import_file
  where id = v_prior_file_id and company_id = v_company_id;

  if v_prior_file.id is null then
    raise exception 'The currently effective prior LIVE artifact could not be verified.';
  end if;

  if v_prior_file.content_sha256 = v_file.content_sha256 then
    raise exception 'The revision LIVE artifact is identical to the currently effective filing.';
  end if;

  update public.payroll_sars_import_file
  set emp501_revision_id = v_revision.id
  where id = v_file.id;

  update public.payroll_emp501_revision
  set new_live_file_id = v_file.id,
      new_submission_evidence_id = null,
      status = 'live_ready',
      updated_at = now()
  where id = v_revision.id;

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  ) values (
    v_company_id, auth.uid(), 'payroll_emp501_revision_live_file_attached',
    'payroll', v_revision.id,
    'New controlled LIVE file attached to an EMP501 revision.',
    jsonb_build_object(
      'revision_number', v_revision.revision_number,
      'live_file_id', v_file.id,
      'live_file_sha256', v_file.content_sha256,
      'source_test_file_id', v_file.source_test_file_id,
      'test_acceptance_id', v_file.test_acceptance_id,
      'prior_effective_live_file_id', v_prior_file.id,
      'prior_effective_sha256', v_prior_file.content_sha256
    )
  );

  return jsonb_build_object(
    'ok', true,
    'revision_id', v_revision.id,
    'revision_number', v_revision.revision_number,
    'live_file_id', v_file.id,
    'content_sha256', v_file.content_sha256,
    'status', 'live_ready',
    'required_submission_channel', v_revision.required_submission_channel,
    'already_attached', false
  );
end;
$function$;

-- ------------------------------------------------------------
-- Cancel an unclosed revision without deleting its audit trail.
-- ------------------------------------------------------------

create or replace function public.cancel_payroll_emp501_revision(
  p_revision_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company_id uuid;
  v_revision public.payroll_emp501_revision%rowtype;
  v_reason text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('payroll.manage') then
    raise exception 'Permission denied: payroll.manage';
  end if;

  v_company_id := public.current_company_id();
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null or char_length(v_reason) < 5 then
    raise exception 'A cancellation reason of at least 5 characters is required.';
  end if;

  select * into v_revision
  from public.payroll_emp501_revision
  where id = p_revision_id and company_id = v_company_id
  for update;

  if v_revision.id is null then raise exception 'EMP501 revision could not be found.'; end if;

  if v_revision.status = 'cancelled' then
    return jsonb_build_object(
      'ok', true, 'revision_id', v_revision.id,
      'status', 'cancelled', 'already_cancelled', true
    );
  end if;

  if v_revision.status not in ('pending_approval', 'approved', 'live_ready', 'submission_rejected') then
    raise exception 'This EMP501 revision can no longer be cancelled.';
  end if;

  update public.payroll_emp501_revision
  set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(),
      cancellation_reason = v_reason, updated_at = now()
  where id = v_revision.id;

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  ) values (
    v_company_id, auth.uid(), 'payroll_emp501_revision_cancelled',
    'payroll', v_revision.id,
    'EMP501 revision cancelled without deleting its history.',
    jsonb_build_object(
      'original_filing_id', v_revision.original_filing_id,
      'revision_number', v_revision.revision_number,
      'reason', v_reason
    )
  );

  return jsonb_build_object(
    'ok', true, 'revision_id', v_revision.id,
    'status', 'cancelled', 'already_cancelled', false,
    'original_filing_preserved', true
  );
end;
$function$;

-- ------------------------------------------------------------
-- Close the accepted revision and make it the effective version.
-- ------------------------------------------------------------

create or replace function public.close_payroll_emp501_revision(
  p_revision_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company_id uuid;
  v_revision public.payroll_emp501_revision%rowtype;
  v_file public.payroll_sars_import_file%rowtype;
  v_evidence public.payroll_sars_submission_evidence%rowtype;
  v_test_file public.payroll_sars_import_file%rowtype;
  v_acceptance public.payroll_sars_test_acceptance%rowtype;
  v_actual_hash text;
  v_validation jsonb;
  v_closed_at timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('payroll.manage') then
    raise exception 'Permission denied: payroll.manage';
  end if;

  v_company_id := public.current_company_id();

  select * into v_revision
  from public.payroll_emp501_revision
  where id = p_revision_id and company_id = v_company_id
  for update;

  if v_revision.id is null then raise exception 'EMP501 revision could not be found.'; end if;

  if v_revision.status = 'closed' then
    return jsonb_build_object(
      'ok', true, 'revision_id', v_revision.id,
      'revision_number', v_revision.revision_number,
      'status', 'closed', 'closed_at', v_revision.closed_at,
      'already_closed', true
    );
  end if;

  if v_revision.status <> 'accepted' then
    raise exception 'The EMP501 revision may close only after accepted SARS evidence is recorded.';
  end if;

  select * into v_file
  from public.payroll_sars_import_file
  where id = v_revision.new_live_file_id
    and company_id = v_company_id
    and emp501_revision_id = v_revision.id
  for update;

  select * into v_evidence
  from public.payroll_sars_submission_evidence
  where id = v_revision.new_submission_evidence_id
    and company_id = v_company_id
    and live_file_id = v_revision.new_live_file_id
  for update;

  if v_file.id is null or v_file.mode <> 'LIVE' or v_file.status <> 'validated_live' then
    raise exception 'The revision LIVE artifact could not be verified.';
  end if;

  if v_evidence.id is null or v_evidence.submission_status <> 'accepted'
     or v_evidence.response_reference is null or v_evidence.response_at is null then
    raise exception 'Complete accepted SARS resubmission evidence is required.';
  end if;

  if v_evidence.submission_channel <> v_revision.required_submission_channel then
    raise exception 'The accepted resubmission evidence used a different SARS channel.';
  end if;

  select * into v_test_file
  from public.payroll_sars_import_file
  where id = v_file.source_test_file_id
    and company_id = v_company_id
    and mode = 'TEST'
    and status = 'accepted_test';

  select * into v_acceptance
  from public.payroll_sars_test_acceptance
  where id = v_file.test_acceptance_id
    and company_id = v_company_id
    and test_file_id = v_file.source_test_file_id;

  if v_test_file.id is null or v_acceptance.id is null then
    raise exception 'The revised TEST-to-LIVE acceptance lineage could not be verified.';
  end if;

  v_actual_hash := encode(
    extensions.digest(convert_to(v_file.csv_payload, 'LATIN1'), 'sha256'),
    'hex'
  );

  if v_actual_hash <> v_file.content_sha256 then
    raise exception 'Revision LIVE file integrity hash mismatch.';
  end if;

  v_validation := public.validate_payroll_sars_csv_payload(v_file.csv_payload);
  if not coalesce((v_validation ->> 'valid')::boolean, false) then
    raise exception 'Revision LIVE file no longer passes structural validation.';
  end if;

  update public.payroll_emp501_revision
  set is_current_effective = false, updated_at = v_closed_at
  where original_filing_id = v_revision.original_filing_id
    and is_current_effective;

  update public.payroll_emp501_revision
  set status = 'closed',
      is_current_effective = true,
      closed_by = auth.uid(),
      closed_at = v_closed_at,
      close_notes = nullif(btrim(coalesce(p_notes, '')), ''),
      closure_snapshot = jsonb_build_object(
        'original_filing_id', v_revision.original_filing_id,
        'previous_revision_id', v_revision.previous_revision_id,
        'revision_number', v_revision.revision_number,
        'revision_reason', v_revision.revision_reason,
        'tax_year', v_revision.tax_year,
        'period_type', v_revision.period_type,
        'live_file_id', v_file.id,
        'live_file_sha256', v_file.content_sha256,
        'brs_version', v_file.brs_version,
        'certificate_count', v_file.certificate_count,
        'record_count', v_file.record_count,
        'source_test_file_id', v_test_file.id,
        'test_acceptance_id', v_acceptance.id,
        'test_acceptance_reference', v_acceptance.acceptance_reference,
        'submission_evidence_id', v_evidence.id,
        'submission_channel', v_evidence.submission_channel,
        'submission_reference', v_evidence.submission_reference,
        'sars_response_reference', v_evidence.response_reference,
        'sars_accepted_at', v_evidence.response_at,
        'structural_validation', v_validation,
        'original_filing_preserved', true,
        'submitted_directly_by_nexus', false
      ),
      updated_at = v_closed_at
  where id = v_revision.id;

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  ) values (
    v_company_id, auth.uid(), 'payroll_emp501_revision_closed',
    'payroll', v_revision.id,
    'Accepted EMP501 revision closed and marked as the effective filing version.',
    jsonb_build_object(
      'original_filing_id', v_revision.original_filing_id,
      'revision_number', v_revision.revision_number,
      'live_file_id', v_file.id,
      'live_file_sha256', v_file.content_sha256,
      'submission_evidence_id', v_evidence.id,
      'submission_reference', v_evidence.submission_reference,
      'sars_response_reference', v_evidence.response_reference,
      'original_filing_preserved', true
    )
  );

  return jsonb_build_object(
    'ok', true,
    'revision_id', v_revision.id,
    'original_filing_id', v_revision.original_filing_id,
    'revision_number', v_revision.revision_number,
    'status', 'closed',
    'closed_at', v_closed_at,
    'live_file_id', v_file.id,
    'submission_evidence_id', v_evidence.id,
    'current_effective_version', true,
    'original_filing_preserved', true,
    'already_closed', false
  );
end;
$function$;

-- ------------------------------------------------------------
-- Revision readiness and full audit timeline readback.
-- ------------------------------------------------------------

create or replace function public.get_payroll_emp501_revision_control(
  p_filing_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company_id uuid;
  v_filing public.payroll_emp501_filing%rowtype;
  v_original_evidence public.payroll_sars_submission_evidence%rowtype;
  v_latest public.payroll_emp501_revision%rowtype;
  v_current public.payroll_emp501_revision%rowtype;
  v_has_active boolean;
  v_blockers jsonb := '[]'::jsonb;
  v_revisions jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('payroll.view') then
    raise exception 'Permission denied: payroll.view';
  end if;

  v_company_id := public.current_company_id();

  select * into v_filing
  from public.payroll_emp501_filing
  where id = p_filing_id and company_id = v_company_id;

  if v_filing.id is null then raise exception 'EMP501 filing could not be found.'; end if;

  select * into v_original_evidence
  from public.payroll_sars_submission_evidence
  where id = v_filing.submission_evidence_id and company_id = v_company_id;

  select * into v_latest
  from public.payroll_emp501_revision
  where original_filing_id = v_filing.id and company_id = v_company_id
  order by revision_number desc
  limit 1;

  select * into v_current
  from public.payroll_emp501_revision
  where original_filing_id = v_filing.id
    and company_id = v_company_id
    and is_current_effective
  limit 1;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'revision_id', r.id,
      'revision_number', r.revision_number,
      'previous_revision_id', r.previous_revision_id,
      'reason', r.revision_reason,
      'change_summary', r.change_summary,
      'status', r.status,
      'required_submission_channel', r.required_submission_channel,
      'new_live_file_id', r.new_live_file_id,
      'new_submission_evidence_id', r.new_submission_evidence_id,
      'requested_by', r.requested_by,
      'requested_at', r.requested_at,
      'decision_by', r.decision_by,
      'decision_at', r.decision_at,
      'closed_by', r.closed_by,
      'closed_at', r.closed_at,
      'is_current_effective', r.is_current_effective
    ) order by r.revision_number
  ), '[]'::jsonb) into v_revisions
  from public.payroll_emp501_revision r
  where r.original_filing_id = v_filing.id
    and r.company_id = v_company_id;

  v_has_active := v_latest.id is not null
    and v_latest.status not in ('closed', 'rejected', 'cancelled');

  if v_latest.status = 'pending_approval' then
    v_blockers := v_blockers || jsonb_build_array('Revision approval is required.');
  elsif v_latest.status = 'approved' then
    v_blockers := v_blockers || jsonb_build_array(
      'Generate a new TEST file, record external TEST acceptance, generate LIVE, then attach the LIVE file.'
    );
  elsif v_latest.status = 'live_ready' then
    v_blockers := v_blockers || jsonb_build_array(
      'Submit through the original SARS channel and record LIVE submission evidence.'
    );
  elsif v_latest.status = 'submitted' then
    v_blockers := v_blockers || jsonb_build_array('Await and record the SARS submission outcome.');
  elsif v_latest.status = 'submission_rejected' then
    v_blockers := v_blockers || jsonb_build_array(
      'SARS rejected the attempt. Correct the data and attach a newly accepted TEST-to-LIVE artifact.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'original_filing_id', v_filing.id,
    'tax_year', v_filing.tax_year,
    'period_type', v_filing.period_type,
    'original_live_file_id', v_filing.live_file_id,
    'original_submission_evidence_id', v_filing.submission_evidence_id,
    'required_submission_channel', v_original_evidence.submission_channel,
    'revision_exists', v_latest.id is not null,
    'latest_revision_id', v_latest.id,
    'latest_revision_number', v_latest.revision_number,
    'latest_revision_status', v_latest.status,
    'active_revision', v_has_active,
    'can_request_revision', not v_has_active,
    'ready_to_close', v_latest.status = 'accepted',
    'current_effective_revision_id', v_current.id,
    'current_effective_live_file_id', coalesce(v_current.new_live_file_id, v_filing.live_file_id),
    'original_is_current_effective', v_current.id is null,
    'original_filing_preserved', true,
    'blockers', v_blockers,
    'revisions', v_revisions,
    'submitted_directly_by_nexus', false
  );
end;
$function$;

-- ------------------------------------------------------------
-- Function privileges
-- ------------------------------------------------------------

revoke all on function public.enforce_emp501_revision_submission() from public, anon, authenticated;
revoke all on function public.sync_emp501_revision_submission_state() from public, anon, authenticated;

revoke all on function public.request_payroll_emp501_revision(uuid, text, text) from public, anon;
grant execute on function public.request_payroll_emp501_revision(uuid, text, text) to authenticated, service_role;

revoke all on function public.decide_payroll_emp501_revision(uuid, boolean, text) from public, anon;
grant execute on function public.decide_payroll_emp501_revision(uuid, boolean, text) to authenticated, service_role;

revoke all on function public.attach_payroll_emp501_revision_live_file(uuid, uuid) from public, anon;
grant execute on function public.attach_payroll_emp501_revision_live_file(uuid, uuid) to authenticated, service_role;

revoke all on function public.cancel_payroll_emp501_revision(uuid, text) from public, anon;
grant execute on function public.cancel_payroll_emp501_revision(uuid, text) to authenticated, service_role;

revoke all on function public.close_payroll_emp501_revision(uuid, text) from public, anon;
grant execute on function public.close_payroll_emp501_revision(uuid, text) to authenticated, service_role;

revoke all on function public.get_payroll_emp501_revision_control(uuid) from public, anon;
grant execute on function public.get_payroll_emp501_revision_control(uuid) to authenticated, service_role;

-- ============================================================
-- END SPRINT 23.18
-- ============================================================
;
