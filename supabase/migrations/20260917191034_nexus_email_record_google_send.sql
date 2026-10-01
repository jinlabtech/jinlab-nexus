create or replace function public.record_google_email_send(
  p_account_id uuid,
  p_subject text,
  p_body_text text,
  p_body_html text default null,
  p_to text[] default array[]::text[],
  p_cc text[] default array[]::text[],
  p_bcc text[] default array[]::text[],
  p_provider_message_id text default null
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

  if nullif(btrim(coalesce(p_provider_message_id, '')), '') is null then
    raise exception 'Google provider message ID is required';
  end if;

  select ea.email_address
    into v_mailbox_email
  from public.email_account ea
  where ea.id = p_account_id
    and ea.company_id = v_company_id
    and ea.is_active = true
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
    last_message_at,
    last_outbound_at
  )
  values (
    v_company_id,
    p_account_id,
    p_subject,
    'open',
    'normal',
    0,
    v_now,
    v_now
  )
  returning id into v_thread_id;

  insert into public.email_message (
    company_id,
    account_id,
    thread_id,
    direction,
    message_state,
    provider_message_id,
    subject,
    from_address,
    body_text,
    body_html,
    preview_text,
    sent_at,
    created_by
  )
  values (
    v_company_id,
    p_account_id,
    v_thread_id,
    'outbound',
    'sent',
    p_provider_message_id,
    p_subject,
    lower(btrim(v_mailbox_email)),
    coalesce(p_body_text, ''),
    p_body_html,
    left(regexp_replace(coalesce(p_body_text, ''), E'[\\n\\r\\t]+', ' ', 'g'), 240),
    v_now,
    v_user_id
  )
  returning id into v_message_id;

  foreach v_recipient in array coalesce(p_to, array[]::text[])
  loop
    v_recipient := lower(btrim(v_recipient));

    if v_recipient <> '' then
      insert into public.email_recipient (
        company_id,
        message_id,
        recipient_type,
        email_address
      )
      values (
        v_company_id,
        v_message_id,
        'to',
        v_recipient
      );
    end if;
  end loop;

  foreach v_recipient in array coalesce(p_cc, array[]::text[])
  loop
    v_recipient := lower(btrim(v_recipient));

    if v_recipient <> '' then
      insert into public.email_recipient (
        company_id,
        message_id,
        recipient_type,
        email_address
      )
      values (
        v_company_id,
        v_message_id,
        'cc',
        v_recipient
      );
    end if;
  end loop;

  foreach v_recipient in array coalesce(p_bcc, array[]::text[])
  loop
    v_recipient := lower(btrim(v_recipient));

    if v_recipient <> '' then
      insert into public.email_recipient (
        company_id,
        message_id,
        recipient_type,
        email_address
      )
      values (
        v_company_id,
        v_message_id,
        'bcc',
        v_recipient
      );
    end if;
  end loop;

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
    v_user_id,
    'send',
    'email',
    v_message_id,
    'Email sent through connected Google mailbox',
    jsonb_build_object(
      'account_id', p_account_id,
      'thread_id', v_thread_id,
      'provider', 'google',
      'provider_message_id', p_provider_message_id,
      'to_count', coalesce(cardinality(p_to), 0),
      'cc_count', coalesce(cardinality(p_cc), 0),
      'bcc_count', coalesce(cardinality(p_bcc), 0)
    )
  );

  return jsonb_build_object(
    'thread_id', v_thread_id,
    'message_id', v_message_id,
    'provider_message_id', p_provider_message_id,
    'message_state', 'sent'
  );
end;
$$;
revoke all on function public.record_google_email_send(
  uuid,
  text,
  text,
  text,
  text[],
  text[],
  text[],
  text
) from public;
revoke all on function public.record_google_email_send(
  uuid,
  text,
  text,
  text,
  text[],
  text[],
  text[],
  text
) from anon;
grant execute on function public.record_google_email_send(
  uuid,
  text,
  text,
  text,
  text[],
  text[],
  text[],
  text
) to authenticated;
