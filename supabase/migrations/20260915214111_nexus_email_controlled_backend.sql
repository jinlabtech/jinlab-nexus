-- ============================================================
-- JINLAB NEXUS EMAIL
-- Controlled Backend + Mailbox Access
-- ============================================================

-- ------------------------------------------------------------
-- 1. MAILBOX ACCESS
-- ------------------------------------------------------------

create table if not exists public.email_account_access (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  account_id uuid not null,

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  access_level text not null default 'read'
    check (access_level in ('read', 'send', 'manage')),

  created_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default clock_timestamp(),

  unique (company_id, account_id, user_id),

  foreign key (company_id, account_id)
    references public.email_account(company_id, id)
    on delete cascade
);
create index if not exists email_account_access_user_idx
  on public.email_account_access(company_id, user_id);
create index if not exists email_account_access_account_idx
  on public.email_account_access(company_id, account_id);
-- ------------------------------------------------------------
-- 2. RLS + DIRECT TABLE PRIVILEGES
-- ------------------------------------------------------------

alter table public.email_account_access enable row level security;
revoke all on public.email_account_access
from public, anon, authenticated;
grant select on public.email_account_access
to authenticated;
grant all on public.email_account_access
to service_role;
create policy "email users read own mailbox access"
on public.email_account_access
for select
to authenticated
using (
  company_id = public.current_company_id()
  and (
    user_id = auth.uid()
    or public.current_user_has_permission('email.manage')
  )
);
-- ------------------------------------------------------------
-- 3. MAILBOX ACCESS HELPER
-- ------------------------------------------------------------

create or replace function public.email_user_can_access_account(
  p_account_id uuid,
  p_required_level text default 'read'
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_allowed boolean := false;
begin
  if auth.uid() is null then
    return false;
  end if;

  v_company_id := public.current_company_id();

  if v_company_id is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.email_account ea
    where ea.id = p_account_id
      and ea.company_id = v_company_id
      and ea.active = true
  ) then
    return false;
  end if;

  -- Email managers can access all company mailboxes.
  if public.current_user_has_permission('email.manage') then
    return true;
  end if;

  select exists (
    select 1
    from public.email_account_access eaa
    where eaa.company_id = v_company_id
      and eaa.account_id = p_account_id
      and eaa.user_id = auth.uid()
      and (
        p_required_level = 'read'
        or (
          p_required_level = 'send'
          and eaa.access_level in ('send', 'manage')
        )
        or (
          p_required_level = 'manage'
          and eaa.access_level = 'manage'
        )
      )
  )
  into v_allowed;

  return coalesce(v_allowed, false);
end;
$$;
revoke all
on function public.email_user_can_access_account(uuid, text)
from public, anon;
grant execute
on function public.email_user_can_access_account(uuid, text)
to authenticated;
-- ------------------------------------------------------------
-- 4. EMAIL WORKSPACE
-- ------------------------------------------------------------

create or replace function public.get_email_workspace(
  p_account_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_limit integer;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('email.view') then
    raise exception 'Permission denied: email.view';
  end if;

  v_company_id := public.current_company_id();

  if v_company_id is null then
    raise exception 'Company context could not be resolved.';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 50), 1), 200);

  if p_account_id is not null
     and not public.email_user_can_access_account(p_account_id, 'read') then
    raise exception 'Mailbox access denied.';
  end if;

  select jsonb_build_object(

    'accounts',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ea.id,
          'email_address', ea.email_address,
          'display_name', ea.display_name,
          'account_type', ea.account_type,
          'department', ea.department,
          'provider', ea.provider,
          'branch_id', ea.branch_id,
          'active', ea.active,
          'sync_enabled', ea.sync_enabled,
          'last_synced_at', ea.last_synced_at
        )
        order by ea.email_address
      )
      from public.email_account ea
      where ea.company_id = v_company_id
        and ea.active = true
        and public.email_user_can_access_account(ea.id, 'read')
    ), '[]'::jsonb),

    'threads',
    coalesce((
      select jsonb_agg(to_jsonb(x))
      from (
        select
          et.id,
          et.account_id,
          et.customer_id,
          et.subject,
          et.status,
          et.priority,
          et.assigned_to,
          et.unread_count,
          et.last_message_at,
          et.last_inbound_at,
          et.last_outbound_at
        from public.email_thread et
        where et.company_id = v_company_id
          and public.email_user_can_access_account(et.account_id, 'read')
          and (
            p_account_id is null
            or et.account_id = p_account_id
          )
        order by et.last_message_at desc
        limit v_limit
      ) x
    ), '[]'::jsonb)

  )
  into v_result;

  return v_result;
end;
$$;
revoke all
on function public.get_email_workspace(uuid, integer)
from public, anon;
grant execute
on function public.get_email_workspace(uuid, integer)
to authenticated;
-- ------------------------------------------------------------
-- 5. GET ONE THREAD
-- ------------------------------------------------------------

create or replace function public.get_email_thread(
  p_thread_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_thread public.email_thread%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('email.view') then
    raise exception 'Permission denied: email.view';
  end if;

  v_company_id := public.current_company_id();

  select *
  into v_thread
  from public.email_thread
  where id = p_thread_id
    and company_id = v_company_id;

  if not found then
    raise exception 'Email thread could not be found.';
  end if;

  if not public.email_user_can_access_account(
    v_thread.account_id,
    'read'
  ) then
    raise exception 'Mailbox access denied.';
  end if;

  return jsonb_build_object(

    'thread',
    to_jsonb(v_thread),

    'messages',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', em.id,
          'direction', em.direction,
          'message_state', em.message_state,
          'subject', em.subject,
          'from_address', em.from_address,
          'reply_to_address', em.reply_to_address,
          'body_text', em.body_text,
          'body_html', em.body_html,
          'preview_text', em.preview_text,
          'sent_at', em.sent_at,
          'received_at', em.received_at,
          'created_at', em.created_at,

          'recipients',
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'type', er.recipient_type,
                'email_address', er.email_address,
                'display_name', er.display_name
              )
              order by er.created_at
            )
            from public.email_recipient er
            where er.company_id = v_company_id
              and er.message_id = em.id
          ), '[]'::jsonb)

        )
        order by em.created_at
      )
      from public.email_message em
      where em.company_id = v_company_id
        and em.thread_id = p_thread_id
    ), '[]'::jsonb)

  );
end;
$$;
revoke all
on function public.get_email_thread(uuid)
from public, anon;
grant execute
on function public.get_email_thread(uuid)
to authenticated;
-- ------------------------------------------------------------
-- 6. CREATE DRAFT
-- ------------------------------------------------------------

create or replace function public.email_create_draft(
  p_account_id uuid,
  p_thread_id uuid default null,
  p_to text default null,
  p_subject text default '(No subject)',
  p_body_text text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_thread_id uuid;
  v_message_id uuid;
  v_from_address text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('email.send') then
    raise exception 'Permission denied: email.send';
  end if;

  v_company_id := public.current_company_id();

  if not public.email_user_can_access_account(
    p_account_id,
    'send'
  ) then
    raise exception 'Mailbox send access denied.';
  end if;

  select email_address
  into v_from_address
  from public.email_account
  where id = p_account_id
    and company_id = v_company_id
    and active = true;

  if v_from_address is null then
    raise exception 'Email account could not be found.';
  end if;

  if p_thread_id is null then

    insert into public.email_thread (
      company_id,
      account_id,
      subject,
      status,
      priority,
      last_message_at,
      last_outbound_at
    )
    values (
      v_company_id,
      p_account_id,
      coalesce(nullif(btrim(p_subject), ''), '(No subject)'),
      'open',
      'normal',
      clock_timestamp(),
      clock_timestamp()
    )
    returning id into v_thread_id;

  else

    select id
    into v_thread_id
    from public.email_thread
    where id = p_thread_id
      and company_id = v_company_id
      and account_id = p_account_id;

    if v_thread_id is null then
      raise exception 'Email thread could not be found.';
    end if;

  end if;

  insert into public.email_message (
    company_id,
    account_id,
    thread_id,
    direction,
    message_state,
    subject,
    from_address,
    body_text,
    preview_text,
    created_by
  )
  values (
    v_company_id,
    p_account_id,
    v_thread_id,
    'outbound',
    'draft',
    coalesce(nullif(btrim(p_subject), ''), '(No subject)'),
    v_from_address,
    coalesce(p_body_text, ''),
    left(coalesce(p_body_text, ''), 250),
    auth.uid()
  )
  returning id into v_message_id;

  if nullif(btrim(coalesce(p_to, '')), '') is not null then

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
      lower(btrim(p_to))
    );

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
    'email_draft_created',
    'email',
    v_message_id,
    'Email draft created.',
    jsonb_build_object(
      'account_id', p_account_id,
      'thread_id', v_thread_id
    )
  );

  return v_message_id;
end;
$$;
revoke all
on function public.email_create_draft(uuid, uuid, text, text, text)
from public, anon;
grant execute
on function public.email_create_draft(uuid, uuid, text, text, text)
to authenticated;
-- ------------------------------------------------------------
-- 7. UPDATE THREAD
-- ------------------------------------------------------------

create or replace function public.email_update_thread(
  p_thread_id uuid,
  p_status text default null,
  p_priority text default null,
  p_assigned_to uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_thread public.email_thread%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('email.manage') then
    raise exception 'Permission denied: email.manage';
  end if;

  v_company_id := public.current_company_id();

  select *
  into v_thread
  from public.email_thread
  where id = p_thread_id
    and company_id = v_company_id;

  if not found then
    raise exception 'Email thread could not be found.';
  end if;

  if p_status is not null
     and p_status not in ('open', 'closed', 'archived') then
    raise exception 'Invalid email thread status.';
  end if;

  if p_priority is not null
     and p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Invalid email priority.';
  end if;

  if p_assigned_to is not null
     and not exists (
       select 1
       from public.user_profile up
       where up.user_id = p_assigned_to
         and up.company_id = v_company_id
     ) then
    raise exception 'Assigned user must belong to this company.';
  end if;

  update public.email_thread
  set
    status = coalesce(p_status, status),
    priority = coalesce(p_priority, priority),
    assigned_to = coalesce(p_assigned_to, assigned_to),
    updated_at = clock_timestamp()
  where id = p_thread_id
    and company_id = v_company_id
  returning *
  into v_thread;

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
    'email_thread_updated',
    'email',
    p_thread_id,
    'Email thread updated.',
    jsonb_build_object(
      'status', v_thread.status,
      'priority', v_thread.priority,
      'assigned_to', v_thread.assigned_to
    )
  );

  return to_jsonb(v_thread);
end;
$$;
revoke all
on function public.email_update_thread(uuid, text, text, uuid)
from public, anon;
grant execute
on function public.email_update_thread(uuid, text, text, uuid)
to authenticated;
-- ------------------------------------------------------------
-- 8. COMMENTS
-- ------------------------------------------------------------

comment on table public.email_account_access is
  'Controls Nexus user access to company email accounts.';
comment on function public.get_email_workspace(uuid, integer) is
  'Returns only Nexus email accounts and threads accessible to the authenticated user.';
comment on function public.get_email_thread(uuid) is
  'Returns one authorised Nexus email conversation and its messages.';
comment on function public.email_create_draft(uuid, uuid, text, text, text) is
  'Creates an audited outbound email draft. Does not transmit email externally.';
comment on function public.email_update_thread(uuid, text, text, uuid) is
  'Controlled management update for Nexus email thread workflow.';
