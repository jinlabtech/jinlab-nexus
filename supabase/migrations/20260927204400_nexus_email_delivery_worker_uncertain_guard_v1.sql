
create or replace function public.email_worker_mark_uncertain(
  p_job_id uuid,
  p_claim_token uuid,
  p_attempt_id uuid,
  p_error text default null,
  p_response_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.communication_send_job%rowtype;
  v_now timestamptz := now();
begin
  if p_response_metadata is null or jsonb_typeof(p_response_metadata) <> 'object' then
    raise exception 'response metadata must be an object';
  end if;

  select *
  into v_job
  from public.communication_send_job j
  where j.id = p_job_id
    and j.claim_token = p_claim_token
    and j.status = 'sending'
  for update;

  if not found then
    raise exception 'Worker claim is no longer valid';
  end if;

  update public.communication_delivery_attempt
  set provider = 'google',
      status = 'uncertain',
      error_message = left(coalesce(p_error, 'Provider result is uncertain'), 2000),
      response_metadata = p_response_metadata,
      completed_at = v_now
  where id = p_attempt_id
    and company_id = v_job.company_id
    and send_job_id = v_job.id
    and status = 'started';

  if not found then
    raise exception 'Active delivery attempt not found';
  end if;

  update public.communication_send_job
  set status = 'reconciliation_required',
      last_error = left(coalesce(p_error, 'Provider result is uncertain'), 2000),
      claim_token = null,
      claimed_at = null,
      lease_expires_at = null,
      updated_at = v_now
  where id = v_job.id
    and company_id = v_job.company_id;

  if v_job.source_type = 'email_campaign' then
    update public.email_campaign_recipient
    set send_status = 'reconciliation_required',
        last_error = left(coalesce(p_error, 'Provider result is uncertain'), 2000),
        updated_at = v_now
    where company_id = v_job.company_id
      and campaign_id = v_job.source_id
      and send_attempt_id = p_attempt_id;
  elsif v_job.source_type = 'email_bulk_batch' then
    update public.email_bulk_recipient
    set status = 'failed',
        skip_reason = 'Delivery state is uncertain and requires reconciliation',
        updated_at = v_now
    where company_id = v_job.company_id
      and batch_id = v_job.source_id
      and send_job_id = v_job.id;
  end if;

  insert into public.audit_log (
    company_id, user_id, action, module,
    record_id, description, metadata
  )
  values (
    v_job.company_id,
    null,
    'worker_uncertain',
    'email',
    v_job.id,
    'Queued email delivery requires provider reconciliation',
    jsonb_build_object(
      'send_job_id', v_job.id,
      'attempt_id', p_attempt_id,
      'source_type', v_job.source_type,
      'source_id', v_job.source_id,
      'error', left(coalesce(p_error, 'Provider result is uncertain'), 1000)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'job_id', v_job.id,
    'status', 'reconciliation_required'
  );
end;
$$;

revoke all on function public.email_worker_mark_uncertain(uuid, uuid, uuid, text, jsonb)
from public, anon, authenticated;

grant execute on function public.email_worker_mark_uncertain(uuid, uuid, uuid, text, jsonb)
to service_role;
;
