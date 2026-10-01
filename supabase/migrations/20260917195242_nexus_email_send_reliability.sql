-- JINLAB Nexus Email
-- Reliable outbound send lifecycle:
-- queued -> sending -> sent / failed

alter table public.email_message
  add column if not exists send_attempt_id uuid;
create unique index if not exists email_message_send_attempt_uidx
  on public.email_message (company_id, send_attempt_id)
  where send_attempt_id is not null;
create unique index if not exists email_message_provider_message_uidx
  on public.email_message (company_id, account_id, provider_message_id)
  where provider_message_id is not null;
create or replace function public.email_prepare_google_send(
  p_account_id uuid,
  p_send_attempt_id uuid,
  p_subject text,
  p_body_text text,
  p_body_html text default null,
  p_to text[] default array[]::text[],
  p_cc text[] default array[]::text[],
  p_bcc text[] default array[]::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_mailbox_email text;
  v_thread_id uuid;
  v_message_id uuid;
  v_recipient text;
  v_existing public.email_message%rowtype;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_has_permission('email.send') then
    raise exception 'Email send permission required';
  end if;

  if not public.email_user_can_access_account(p_account_id, 'send') then
    raise exception 'Mailbox send access required';
  end if;

  v_company_id := public.current_company_id();

  if v_company_id is null then
    raise exception 'Company context required';
  end if;

  if p_send_attempt_id is null then
    raise exception 'Send attempt ID is required';
  end if;

  if nullif(btrim(coalesce(p_subject, '')), '') is null then
    raise exception 'Subject is required';
  end if;

  if length(p_subject) > 998 then
    raise exception 'Subject exceeds Nexus limit';
  end if;

  if length(coalesce(p_body_text, '')) > 1000000 then
    raise exception 'Message body exceeds Nexus limit';
  end if;

  if coalesce(cardinality(p_to), 0) = 0 then
    raise exception 'At least one TO recipient is required';
  end if;

  select *
    into v_existing
  from public.email_message
  where company_id = v_company_id
    and send_attempt_id = p_send_attempt_id;

  if found then
    return jsonb_build_object(
      'thread_id', v_existing.thread_id,
      'message_id', v_existing.id,
      'send_attempt_id', v_existing.send_attempt_id,
      'message_state', v_existing.message_state,
      'existing', true
    );
  end if;

  select ea.email_address
    into v_mailbox_email
  from public.email_account ea
  where ea.id = p_account_id
    and ea.company_id = v_company_id
    and ea.active = true
  for update;

  if v_mailbox_email is null then
    raise exception 'Active mailbox not found';
  end if;

  insert into public.email_thread (
    company_id,
    account_id,
    subject,
    status,
    priority,
    unread_count,
    last_message_at
  )
  values (
    v_company_id,
    p_account_id,
    p_subject,
    'open',
    'normal',
    0,
    v_now
  )
  returning id into v_thread_id;

  insert into public.email_message (
    company_id,
    account_id,
    thread_id,
    direction,
    message_state,
    send_attempt_id,
    subject,
    from_address,
    body_text,
    body_html,
    preview_text,
    created_by
  )
  values (
    v_company_id,
    p_account_id,
    v_thread_id,
    'outbound',
    'queued',
    p_send_attempt_id,
    p_subject,
    lower(btrim(v_mailbox_email)),
    coalesce(p_body_text, ''),
    p_body_html,
    left(regexp_replace(coalesce(p_body_text, ''), E'[\\n\\r\\t]+', ' ', 'g'), 240),
    v_user_id
  )
  returning id into v_message_id;

  foreach v_recipient in array coalesce(p_to, array[]::text[])
  loop
    v_recipient := lower(btrim(v_recipient));
    if v_recipient <> '' then
      insert into public.email_recipient
        (company_id, message_id, recipient_type, email_address)
      values
        (v_company_id, v_message_id, 'to', v_recipient);
    end if;
  end loop;

  foreach v_recipient in array coalesce(p_cc, array[]::text[])
  loop
    v_recipient := lower(btrim(v_recipient));
    if v_recipient <> '' then
      insert into public.email_recipient
        (company_id, message_id, recipient_type, email_address)
      values
        (v_company_id, v_message_id, 'cc', v_recipient);
    end if;
  end loop;

  foreach v_recipient in array coalesce(p_bcc, array[]::text[])
  loop
    v_recipient := lower(btrim(v_recipient));
    if v_recipient <> '' then
      insert into public.email_recipient
        (company_id, message_id, recipient_type, email_address)
      values
        (v_company_id, v_message_id, 'bcc', v_recipient);
    end if;
  end loop;

  insert into public.audit_log (
    company_id, user_id, action, module,
    record_id, description, metadata
  )
  values (
    v_company_id,
    v_user_id,
    'queue',
    'email',
    v_message_id,
    'Outbound Google email queued',
    jsonb_build_object(
      'account_id', p_account_id,
      'thread_id', v_thread_id,
      'send_attempt_id', p_send_attempt_id
    )
  );

  return jsonb_build_object(
    'thread_id', v_thread_id,
    'message_id', v_message_id,
    'send_attempt_id', p_send_attempt_id,
    'message_state', 'queued',
    'existing', false
  );
end;
$$;
create or replace function public.email_mark_google_send_sending(
  p_message_id uuid,
  p_send_attempt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_message public.email_message%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_has_permission('email.send') then
    raise exception 'Email send permission required';
  end if;

  v_company_id := public.current_company_id();

  update public.email_message
  set message_state = 'sending',
      updated_at = now()
  where id = p_message_id
    and company_id = v_company_id
    and send_attempt_id = p_send_attempt_id
    and message_state = 'queued'
  returning * into v_message;

  if not found then
    select *
      into v_message
    from public.email_message
    where id = p_message_id
      and company_id = v_company_id
      and send_attempt_id = p_send_attempt_id;

    if not found then
      raise exception 'Queued email not found';
    end if;
  end if;

  return jsonb_build_object(
    'message_id', v_message.id,
    'message_state', v_message.message_state
  );
end;
$$;
create or replace function public.email_finalize_google_send(
  p_message_id uuid,
  p_send_attempt_id uuid,
  p_provider_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_message public.email_message%rowtype;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_has_permission('email.send') then
    raise exception 'Email send permission required';
  end if;

  v_company_id := public.current_company_id();

  if nullif(btrim(coalesce(p_provider_message_id, '')), '') is null then
    raise exception 'Google provider message ID is required';
  end if;

  update public.email_message
  set message_state = 'sent',
      provider_message_id = p_provider_message_id,
      sent_at = v_now,
      updated_at = v_now
  where id = p_message_id
    and company_id = v_company_id
    and send_attempt_id = p_send_attempt_id
    and message_state in ('queued', 'sending')
  returning * into v_message;

  if not found then
    select *
      into v_message
    from public.email_message
    where id = p_message_id
      and company_id = v_company_id
      and send_attempt_id = p_send_attempt_id
      and provider_message_id = p_provider_message_id
      and message_state = 'sent';

    if not found then
      raise exception 'Email cannot be finalized';
    end if;
  end if;

  update public.email_thread
  set last_message_at = v_now,
      last_outbound_at = v_now,
      updated_at = v_now
  where id = v_message.thread_id
    and company_id = v_company_id;

  insert into public.audit_log (
    company_id, user_id, action, module,
    record_id, description, metadata
  )
  values (
    v_company_id,
    v_user_id,
    'send',
    'email',
    v_message.id,
    'Email sent through connected Google mailbox',
    jsonb_build_object(
      'account_id', v_message.account_id,
      'thread_id', v_message.thread_id,
      'send_attempt_id', p_send_attempt_id,
      'provider', 'google',
      'provider_message_id', p_provider_message_id
    )
  );

  return jsonb_build_object(
    'thread_id', v_message.thread_id,
    'message_id', v_message.id,
    'provider_message_id', p_provider_message_id,
    'message_state', 'sent'
  );
end;
$$;
create or replace function public.email_fail_google_send(
  p_message_id uuid,
  p_send_attempt_id uuid,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_message public.email_message%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_has_permission('email.send') then
    raise exception 'Email send permission required';
  end if;

  v_company_id := public.current_company_id();

  update public.email_message
  set message_state = 'failed',
      updated_at = now()
  where id = p_message_id
    and company_id = v_company_id
    and send_attempt_id = p_send_attempt_id
    and message_state in ('queued', 'sending')
  returning * into v_message;

  if not found then
    raise exception 'Email send attempt not found';
  end if;

  insert into public.audit_log (
    company_id, user_id, action, module,
    record_id, description, metadata
  )
  values (
    v_company_id,
    v_user_id,
    'send_failed',
    'email',
    v_message.id,
    'Google email send failed',
    jsonb_build_object(
      'account_id', v_message.account_id,
      'thread_id', v_message.thread_id,
      'send_attempt_id', p_send_attempt_id,
      'provider', 'google',
      'error', left(coalesce(p_error, 'Unknown provider error'), 1000)
    )
  );

  return jsonb_build_object(
    'thread_id', v_message.thread_id,
    'message_id', v_message.id,
    'message_state', 'failed'
  );
end;
$$;
revoke all on function public.email_prepare_google_send(
  uuid, uuid, text, text, text, text[], text[], text[]
) from public, anon;
revoke all on function public.email_mark_google_send_sending(
  uuid, uuid
) from public, anon;
revoke all on function public.email_finalize_google_send(
  uuid, uuid, text
) from public, anon;
revoke all on function public.email_fail_google_send(
  uuid, uuid, text
) from public, anon;
grant execute on function public.email_prepare_google_send(
  uuid, uuid, text, text, text, text[], text[], text[]
) to authenticated;
grant execute on function public.email_mark_google_send_sending(
  uuid, uuid
) to authenticated;
grant execute on function public.email_finalize_google_send(
  uuid, uuid, text
) to authenticated;
grant execute on function public.email_fail_google_send(
  uuid, uuid, text
) to authenticated;
