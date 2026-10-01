
alter table public.communication_send_job
  add column if not exists claim_token uuid,
  add column if not exists claimed_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists max_attempts integer not null default 5
    check (max_attempts between 1 and 20);

create index if not exists communication_send_job_worker_due_idx
  on public.communication_send_job(status, scheduled_at, lease_expires_at)
  where channel = 'email';

create or replace function public.email_worker_claim_due_jobs(
  p_limit integer default 5,
  p_lease_seconds integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 5), 1), 20);
  v_lease_seconds integer := least(greatest(coalesce(p_lease_seconds, 180), 30), 600);
  v_job public.communication_send_job%rowtype;
  v_attempt_id uuid;
  v_claim_token uuid;
  v_items jsonb := '[]'::jsonb;
begin
  -- A send that reached "sending" but lost its lease is intentionally NOT
  -- auto-retried. Provider acceptance is uncertain and an automatic retry
  -- could duplicate an email.
  for v_job in
    select j.*
    from public.communication_send_job j
    where j.channel = 'email'
      and j.status = 'sending'
      and j.lease_expires_at is not null
      and j.lease_expires_at < now()
    for update skip locked
  loop
    update public.communication_send_job
    set status = 'reconciliation_required',
        last_error = coalesce(last_error, 'Worker lease expired after provider send started'),
        claim_token = null,
        claimed_at = null,
        lease_expires_at = null,
        updated_at = now()
    where id = v_job.id
      and company_id = v_job.company_id;

    update public.communication_delivery_attempt
    set status = 'uncertain',
        error_message = coalesce(error_message, 'Worker lease expired after provider send started'),
        completed_at = coalesce(completed_at, now())
    where company_id = v_job.company_id
      and send_job_id = v_job.id
      and attempt_no = v_job.attempt_count
      and status = 'started';

    if v_job.source_type = 'email_campaign' then
      update public.email_campaign_recipient
      set send_status = 'reconciliation_required',
          last_error = 'Delivery state is uncertain and requires reconciliation',
          updated_at = now()
      where company_id = v_job.company_id
        and campaign_id = v_job.source_id
        and lower(email_address) = lower(v_job.recipient_address)
        and send_status in ('queued','sending');
    elsif v_job.source_type = 'email_bulk_batch' then
      update public.email_bulk_recipient
      set status = 'failed',
          skip_reason = 'Delivery state is uncertain and requires reconciliation',
          updated_at = now()
      where company_id = v_job.company_id
        and batch_id = v_job.source_id
        and send_job_id = v_job.id
        and status = 'queued';
    end if;
  end loop;

  for v_job in
    select j.*
    from public.communication_send_job j
    join public.email_account ea
      on ea.company_id = j.company_id
     and ea.id = j.email_account_id
     and ea.active = true
    join public.email_provider_connection epc
      on epc.company_id = j.company_id
     and epc.account_id = j.email_account_id
     and epc.provider = 'google'
     and epc.connection_status = 'connected'
    where j.channel = 'email'
      and j.attempt_count < j.max_attempts
      and (
        (
          j.status = 'queued'
          and j.scheduled_at <= now()
        )
        or
        (
          j.status = 'processing'
          and j.lease_expires_at is not null
          and j.lease_expires_at < now()
        )
      )
    order by j.priority asc, j.scheduled_at asc, j.created_at asc
    for update of j skip locked
    limit v_limit
  loop
    v_claim_token := pg_catalog.gen_random_uuid();

    update public.communication_send_job
    set status = 'processing',
        claim_token = v_claim_token,
        claimed_at = now(),
        lease_expires_at = now() + make_interval(secs => v_lease_seconds),
        attempt_count = attempt_count + 1,
        last_error = null,
        updated_at = now()
    where id = v_job.id
      and company_id = v_job.company_id
    returning * into v_job;

    insert into public.communication_delivery_attempt (
      company_id,
      send_job_id,
      attempt_no,
      provider,
      status,
      request_metadata,
      response_metadata,
      started_at
    )
    values (
      v_job.company_id,
      v_job.id,
      v_job.attempt_count,
      'google',
      'started',
      jsonb_build_object(
        'source_type', v_job.source_type,
        'source_id', v_job.source_id,
        'recipient_address', v_job.recipient_address
      ),
      '{}'::jsonb,
      now()
    )
    returning id into v_attempt_id;

    if v_job.source_type = 'email_campaign' then
      update public.email_campaign_recipient
      set send_status = 'sending',
          send_attempt_id = v_attempt_id,
          last_error = null,
          updated_at = now()
      where company_id = v_job.company_id
        and campaign_id = v_job.source_id
        and lower(email_address) = lower(v_job.recipient_address)
        and send_status in ('queued','sending');
    end if;

    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'job_id', v_job.id,
        'company_id', v_job.company_id,
        'claim_token', v_claim_token,
        'attempt_id', v_attempt_id,
        'attempt_no', v_job.attempt_count,
        'email_account_id', v_job.email_account_id,
        'recipient_address', v_job.recipient_address,
        'recipient_display_name', v_job.recipient_display_name,
        'subject', v_job.subject,
        'rendered_html', v_job.rendered_html,
        'rendered_text', v_job.rendered_text,
        'source_type', v_job.source_type,
        'source_id', v_job.source_id,
        'purpose', v_job.purpose,
        'variables', v_job.variables
      )
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'claimed_count', jsonb_array_length(v_items),
    'jobs', v_items
  );
end;
$$;

create or replace function public.email_worker_mark_sending(
  p_job_id uuid,
  p_claim_token uuid,
  p_attempt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.communication_send_job%rowtype;
begin
  update public.communication_send_job
  set status = 'sending',
      provider = 'google',
      lease_expires_at = now() + interval '3 minutes',
      updated_at = now()
  where id = p_job_id
    and claim_token = p_claim_token
    and status = 'processing'
  returning * into v_job;

  if not found then
    raise exception 'Worker claim is no longer valid';
  end if;

  if not exists (
    select 1
    from public.communication_delivery_attempt a
    where a.id = p_attempt_id
      and a.company_id = v_job.company_id
      and a.send_job_id = v_job.id
      and a.status = 'started'
  ) then
    raise exception 'Delivery attempt not found';
  end if;

  return jsonb_build_object(
    'ok', true,
    'job_id', v_job.id,
    'status', 'sending'
  );
end;
$$;

create or replace function public.email_worker_mark_sent(
  p_job_id uuid,
  p_claim_token uuid,
  p_attempt_id uuid,
  p_provider_message_id text,
  p_provider_thread_id text default null,
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
  if nullif(btrim(coalesce(p_provider_message_id, '')), '') is null then
    raise exception 'Provider message ID is required';
  end if;

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
      status = 'accepted',
      provider_message_id = p_provider_message_id,
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
  set status = 'sent',
      provider = 'google',
      provider_message_id = p_provider_message_id,
      provider_thread_id = p_provider_thread_id,
      last_error = null,
      claim_token = null,
      claimed_at = null,
      lease_expires_at = null,
      updated_at = v_now
  where id = v_job.id
    and company_id = v_job.company_id;

  if v_job.source_type = 'email_bulk_batch' then
    update public.email_bulk_recipient
    set status = 'sent',
        sent_at = v_now,
        skip_reason = null,
        updated_at = v_now
    where company_id = v_job.company_id
      and batch_id = v_job.source_id
      and send_job_id = v_job.id;

    if not exists (
      select 1
      from public.email_bulk_recipient r
      where r.company_id = v_job.company_id
        and r.batch_id = v_job.source_id
        and r.status in ('pending','queued')
    ) then
      update public.email_bulk_batch b
      set status = case
          when exists (
            select 1
            from public.email_bulk_recipient r
            where r.company_id = v_job.company_id
              and r.batch_id = v_job.source_id
              and r.status = 'failed'
          ) then 'failed'
          else 'completed'
        end,
        updated_at = v_now
      where b.company_id = v_job.company_id
        and b.id = v_job.source_id;
    end if;

  elsif v_job.source_type = 'email_campaign' then
    update public.email_campaign_recipient
    set send_status = 'sent',
        provider_message_id = p_provider_message_id,
        provider_thread_id = p_provider_thread_id,
        sent_at = v_now,
        last_error = null,
        updated_at = v_now
    where company_id = v_job.company_id
      and campaign_id = v_job.source_id
      and send_attempt_id = p_attempt_id;

    if not exists (
      select 1
      from public.email_campaign_recipient r
      where r.company_id = v_job.company_id
        and r.campaign_id = v_job.source_id
        and r.send_status in ('pending','queued','sending')
    ) then
      update public.email_campaign c
      set status = case
          when exists (
            select 1
            from public.email_campaign_recipient r
            where r.company_id = v_job.company_id
              and r.campaign_id = v_job.source_id
              and r.send_status in ('failed','bounced','reconciliation_required')
          ) then 'failed'
          else 'completed'
        end,
        updated_at = v_now
      where c.company_id = v_job.company_id
        and c.id = v_job.source_id;
    end if;
  end if;

  insert into public.audit_log (
    company_id, user_id, action, module,
    record_id, description, metadata
  )
  values (
    v_job.company_id,
    null,
    'worker_sent',
    'email',
    v_job.id,
    'Queued email accepted by Google provider',
    jsonb_build_object(
      'send_job_id', v_job.id,
      'attempt_id', p_attempt_id,
      'provider_message_id', p_provider_message_id,
      'source_type', v_job.source_type,
      'source_id', v_job.source_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'job_id', v_job.id,
    'status', 'sent',
    'provider_message_id', p_provider_message_id
  );
end;
$$;

create or replace function public.email_worker_mark_failed(
  p_job_id uuid,
  p_claim_token uuid,
  p_attempt_id uuid,
  p_error text,
  p_retryable boolean default true,
  p_error_code text default null,
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
  v_retry boolean;
  v_backoff_seconds integer;
begin
  if p_response_metadata is null or jsonb_typeof(p_response_metadata) <> 'object' then
    raise exception 'response metadata must be an object';
  end if;

  select *
  into v_job
  from public.communication_send_job j
  where j.id = p_job_id
    and j.claim_token = p_claim_token
    and j.status in ('processing','sending')
  for update;

  if not found then
    raise exception 'Worker claim is no longer valid';
  end if;

  v_retry := coalesce(p_retryable, true)
    and v_job.attempt_count < v_job.max_attempts;

  update public.communication_delivery_attempt
  set provider = 'google',
      status = 'failed',
      error_code = left(coalesce(p_error_code, ''), 200),
      error_message = left(coalesce(p_error, 'Unknown delivery error'), 2000),
      response_metadata = p_response_metadata,
      completed_at = v_now
  where id = p_attempt_id
    and company_id = v_job.company_id
    and send_job_id = v_job.id
    and status = 'started';

  if not found then
    raise exception 'Active delivery attempt not found';
  end if;

  if v_retry then
    v_backoff_seconds := least(
      3600,
      60 * (2 ^ greatest(v_job.attempt_count - 1, 0))
    )::integer;

    update public.communication_send_job
    set status = 'queued',
        scheduled_at = v_now + make_interval(secs => v_backoff_seconds),
        last_error = left(coalesce(p_error, 'Unknown delivery error'), 2000),
        claim_token = null,
        claimed_at = null,
        lease_expires_at = null,
        updated_at = v_now
    where id = v_job.id
      and company_id = v_job.company_id;

    if v_job.source_type = 'email_campaign' then
      update public.email_campaign_recipient
      set send_status = 'queued',
          last_error = left(coalesce(p_error, 'Unknown delivery error'), 2000),
          updated_at = v_now
      where company_id = v_job.company_id
        and campaign_id = v_job.source_id
        and send_attempt_id = p_attempt_id;
    end if;

    return jsonb_build_object(
      'ok', true,
      'job_id', v_job.id,
      'status', 'queued',
      'retry_scheduled_at', v_now + make_interval(secs => v_backoff_seconds)
    );
  end if;

  update public.communication_send_job
  set status = 'failed',
      last_error = left(coalesce(p_error, 'Unknown delivery error'), 2000),
      claim_token = null,
      claimed_at = null,
      lease_expires_at = null,
      updated_at = v_now
  where id = v_job.id
    and company_id = v_job.company_id;

  if v_job.source_type = 'email_bulk_batch' then
    update public.email_bulk_recipient
    set status = 'failed',
        skip_reason = left(coalesce(p_error, 'Delivery failed'), 1000),
        updated_at = v_now
    where company_id = v_job.company_id
      and batch_id = v_job.source_id
      and send_job_id = v_job.id;

    update public.email_bulk_batch
    set status = 'failed',
        updated_at = v_now
    where company_id = v_job.company_id
      and id = v_job.source_id;

  elsif v_job.source_type = 'email_campaign' then
    update public.email_campaign_recipient
    set send_status = 'failed',
        last_error = left(coalesce(p_error, 'Delivery failed'), 2000),
        updated_at = v_now
    where company_id = v_job.company_id
      and campaign_id = v_job.source_id
      and send_attempt_id = p_attempt_id;

    update public.email_campaign
    set status = 'failed',
        updated_at = v_now
    where company_id = v_job.company_id
      and id = v_job.source_id;
  end if;

  insert into public.audit_log (
    company_id, user_id, action, module,
    record_id, description, metadata
  )
  values (
    v_job.company_id,
    null,
    'worker_failed',
    'email',
    v_job.id,
    'Queued email delivery failed permanently',
    jsonb_build_object(
      'send_job_id', v_job.id,
      'attempt_id', p_attempt_id,
      'source_type', v_job.source_type,
      'source_id', v_job.source_id,
      'error_code', p_error_code,
      'error', left(coalesce(p_error, 'Unknown delivery error'), 1000)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'job_id', v_job.id,
    'status', 'failed'
  );
end;
$$;

revoke all on function public.email_worker_claim_due_jobs(integer, integer) from public, anon, authenticated;
revoke all on function public.email_worker_mark_sending(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.email_worker_mark_sent(uuid, uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.email_worker_mark_failed(uuid, uuid, uuid, text, boolean, text, jsonb) from public, anon, authenticated;

grant execute on function public.email_worker_claim_due_jobs(integer, integer) to service_role;
grant execute on function public.email_worker_mark_sending(uuid, uuid, uuid) to service_role;
grant execute on function public.email_worker_mark_sent(uuid, uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.email_worker_mark_failed(uuid, uuid, uuid, text, boolean, text, jsonb) to service_role;
;
