-- WhatsApp Business inbox. Credentials remain in server environment variables.
-- This migration grants staff read access only; controlled RPCs perform mutations.

insert into public.permissions (permission_name)
values ('whatsapp.view'), ('whatsapp.send')
on conflict (permission_name) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.role_name in ('owner', 'admin')
  and p.permission_name in ('whatsapp.view', 'whatsapp.send')
on conflict (role_id, permission_id) do nothing;

-- Composite references prevent even privileged persistence from joining tenants.
create unique index if not exists whatsapp_customer_company_id_uidx
  on public.customer (company_id, id);

create table public.whatsapp_account (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.company(id) on delete cascade,
  phone_number_id text not null unique check (phone_number_id ~ '^[0-9]{1,30}$'),
  business_account_id text not null check (business_account_id ~ '^[0-9]{1,30}$'),
  display_phone_number text,
  verified_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

create table public.whatsapp_conversation (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  account_id uuid not null,
  wa_id text not null check (wa_id ~ '^[1-9][0-9]{6,14}$'),
  customer_id uuid,
  contact_name text,
  status text not null default 'open' check (status in ('open', 'closed')),
  opted_out boolean not null default false,
  unread_count integer not null default 0 check (unread_count >= 0),
  last_read_at timestamptz,
  last_inbound_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, wa_id),
  unique (company_id, account_id, id),
  foreign key (company_id, account_id)
    references public.whatsapp_account(company_id, id) on delete cascade,
  foreign key (company_id, customer_id)
    references public.customer(company_id, id) on delete set null (customer_id)
);

create index whatsapp_conversation_company_recent_idx
  on public.whatsapp_conversation(company_id, last_message_at desc, id);
create index whatsapp_conversation_customer_idx
  on public.whatsapp_conversation(company_id, customer_id)
  where customer_id is not null;

create table public.whatsapp_message (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  account_id uuid not null,
  conversation_id uuid not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text not null check (message_type in (
    'text', 'template', 'image', 'document', 'audio', 'video', 'sticker',
    'location', 'contacts', 'interactive', 'unsupported'
  )),
  body text not null default '' check (length(body) <= 20000),
  provider_message_id text check (length(provider_message_id) between 1 and 512),
  client_request_id uuid,
  payload_fingerprint text,
  status text not null check (status in (
    'received', 'sending', 'sent', 'delivered', 'read', 'failed', 'unknown'
  )),
  error_code text,
  media_id text,
  media_mime_type text,
  media_filename text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  provider_timestamp timestamptz,
  status_timestamp timestamptz,
  unique (account_id, provider_message_id),
  unique (company_id, client_request_id),
  foreign key (company_id, account_id)
    references public.whatsapp_account(company_id, id) on delete cascade,
  foreign key (company_id, account_id, conversation_id)
    references public.whatsapp_conversation(company_id, account_id, id) on delete cascade,
  check (
    (direction = 'inbound' and status = 'received' and provider_message_id is not null)
    or
    (direction = 'outbound' and message_type = 'text' and status <> 'received'
      and client_request_id is not null and payload_fingerprint is not null)
  )
);

create index whatsapp_message_conversation_recent_idx
  on public.whatsapp_message(company_id, conversation_id, created_at desc, id);
create index whatsapp_message_account_conversation_idx
  on public.whatsapp_message(company_id, account_id, conversation_id);
create index whatsapp_message_creator_idx
  on public.whatsapp_message(created_by) where created_by is not null;

alter table public.whatsapp_account enable row level security;
alter table public.whatsapp_conversation enable row level security;
alter table public.whatsapp_message enable row level security;

revoke all on public.whatsapp_account, public.whatsapp_conversation,
  public.whatsapp_message from public, anon, authenticated;
grant select on public.whatsapp_account, public.whatsapp_conversation,
  public.whatsapp_message to authenticated;
grant select, insert, update, delete on public.whatsapp_account,
  public.whatsapp_conversation, public.whatsapp_message to service_role;

create policy whatsapp_account_read on public.whatsapp_account
  for select to authenticated
  using (
    company_id = (select public.current_company_id())
    and (
      (select public.current_user_has_permission('whatsapp.view'))
      or (select public.current_user_has_permission('settings.integrations.manage'))
    )
  );
create policy whatsapp_conversation_read on public.whatsapp_conversation
  for select to authenticated
  using (
    company_id = (select public.current_company_id())
    and (select public.current_user_has_permission('whatsapp.view'))
  );
create policy whatsapp_message_read on public.whatsapp_message
  for select to authenticated
  using (
    company_id = (select public.current_company_id())
    and (select public.current_user_has_permission('whatsapp.view'))
  );

create function public.whatsapp_set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.whatsapp_set_updated_at() from public, anon, authenticated;

create trigger whatsapp_account_updated_at
before update on public.whatsapp_account
for each row execute function public.whatsapp_set_updated_at();
create trigger whatsapp_conversation_updated_at
before update on public.whatsapp_conversation
for each row execute function public.whatsapp_set_updated_at();

-- Keep newly sent conversations in the inbox's recent ordering as well.
create function public.whatsapp_message_activity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  update public.whatsapp_conversation
  set last_message_at = greatest(last_message_at, new.created_at)
  where id = new.conversation_id and company_id = new.company_id;
  return new;
end;
$$;
revoke all on function public.whatsapp_message_activity() from public, anon, authenticated;
create trigger whatsapp_message_activity_insert
  after insert on public.whatsapp_message
  for each row execute function public.whatsapp_message_activity();

-- The webhook authenticates Meta before invoking this service-only function.
-- A transaction advisory lock prevents duplicate events from creating extra threads.
create function public.whatsapp_ingest_message(
  p_phone_number_id text,
  p_business_account_id text,
  p_wa_id text,
  p_contact_name text,
  p_provider_message_id text,
  p_type text,
  p_body text,
  p_timestamp timestamptz,
  p_media_id text default null,
  p_media_mime_type text default null,
  p_media_filename text default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_account public.whatsapp_account%rowtype;
  v_conversation public.whatsapp_conversation%rowtype;
  v_existing public.whatsapp_message%rowtype;
  v_message_id uuid;
  v_timestamp timestamptz;
begin
  if p_wa_id is null or p_wa_id !~ '^[1-9][0-9]{6,14}$'
     or p_provider_message_id is null
     or length(p_provider_message_id) not between 1 and 512
     or p_timestamp is null then
    raise exception 'Invalid WhatsApp message identity or timestamp.' using errcode = '22023';
  end if;
  if p_type is null or p_type not in (
    'text', 'template', 'image', 'document', 'audio', 'video', 'sticker',
    'location', 'contacts', 'interactive', 'unsupported'
  ) or length(coalesce(p_body, '')) > 20000 then
    raise exception 'Invalid WhatsApp message type or content.' using errcode = '22023';
  end if;

  select * into v_account from public.whatsapp_account
  where phone_number_id = p_phone_number_id
    and business_account_id = p_business_account_id and active
  for share;
  if not found then
    return jsonb_build_object('ignored', true, 'reason', 'unbound_account');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_account.id::text || ':' || p_provider_message_id, 0)
  );
  select * into v_existing from public.whatsapp_message
  where account_id = v_account.id and provider_message_id = p_provider_message_id;
  if found then
    return jsonb_build_object('duplicate', true, 'conversation_id', v_existing.conversation_id);
  end if;

  -- Future timestamps must never extend the free service reply window.
  v_timestamp := least(p_timestamp, clock_timestamp());
  insert into public.whatsapp_conversation (
    company_id, account_id, wa_id, contact_name, last_message_at
  ) values (
    v_account.company_id, v_account.id, p_wa_id,
    nullif(left(btrim(p_contact_name), 200), ''), v_timestamp
  ) on conflict (account_id, wa_id) do nothing;

  select * into strict v_conversation from public.whatsapp_conversation
  where account_id = v_account.id and wa_id = p_wa_id for update;

  insert into public.whatsapp_message (
    company_id, account_id, conversation_id, direction, message_type, body,
    provider_message_id, status, media_id, media_mime_type, media_filename,
    provider_timestamp, status_timestamp
  ) values (
    v_account.company_id, v_account.id, v_conversation.id, 'inbound', p_type,
    coalesce(p_body, ''), p_provider_message_id, 'received',
    left(p_media_id, 512), left(p_media_mime_type, 200), left(p_media_filename, 255),
    v_timestamp, v_timestamp
  ) returning id into v_message_id;

  update public.whatsapp_conversation
  set unread_count = unread_count + 1,
      last_inbound_at = greatest(last_inbound_at, v_timestamp),
      last_message_at = greatest(last_message_at, v_timestamp),
      contact_name = coalesce(nullif(left(btrim(p_contact_name), 200), ''), contact_name),
      status = 'open',
      opted_out = opted_out or (
        p_type = 'text' and upper(btrim(coalesce(p_body, ''))) in
          ('STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT')
      )
  where id = v_conversation.id and company_id = v_account.company_id;

  return jsonb_build_object('duplicate', false, 'conversation_id', v_conversation.id,
    'message_id', v_message_id);
end;
$$;

-- An outbound row is reserved before calling Meta. opaque_callback_data carries
-- its client_request_id, so a webhook can arrive before the HTTP send response.
create function public.whatsapp_apply_status(
  p_phone_number_id text,
  p_business_account_id text,
  p_provider_message_id text,
  p_status text,
  p_timestamp timestamptz,
  p_error_code text default null,
  p_client_request_id uuid default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_account public.whatsapp_account%rowtype;
  v_message public.whatsapp_message%rowtype;
  v_current_rank integer;
  v_next_rank integer;
  v_timestamp timestamptz;
begin
  if p_status is null or p_status not in ('sent', 'delivered', 'read', 'failed', 'unknown')
     or p_timestamp is null or p_provider_message_id is null
     or length(p_provider_message_id) not between 1 and 512 then
    raise exception 'Invalid WhatsApp delivery status.' using errcode = '22023';
  end if;
  select * into v_account from public.whatsapp_account
  where phone_number_id = p_phone_number_id
    and business_account_id = p_business_account_id and active for share;
  if not found then
    return jsonb_build_object('ignored', true, 'reason', 'unbound_account');
  end if;

  select * into v_message from public.whatsapp_message
  where account_id = v_account.id and direction = 'outbound'
    and provider_message_id = p_provider_message_id for update;
  if not found and p_client_request_id is not null then
    select * into v_message from public.whatsapp_message
    where account_id = v_account.id and direction = 'outbound'
      and client_request_id = p_client_request_id for update;
  end if;
  if v_message.id is null then
    return jsonb_build_object('ignored', true, 'reason', 'unknown_message');
  end if;
  if (v_message.provider_message_id is not null
      and v_message.provider_message_id <> p_provider_message_id)
     or (p_client_request_id is not null
      and v_message.client_request_id <> p_client_request_id) then
    return jsonb_build_object('ignored', true, 'reason', 'message_identity_mismatch');
  end if;

  v_current_rank := case v_message.status
    when 'sending' then 0 when 'unknown' then 0 when 'sent' then 1
    when 'failed' then 2 when 'delivered' then 3 when 'read' then 4 else -1 end;
  v_next_rank := case p_status
    when 'unknown' then 0 when 'sent' then 1 when 'failed' then 2
    when 'delivered' then 3 when 'read' then 4 end;
  v_timestamp := least(p_timestamp, clock_timestamp());

  -- Attach the provider ID even if this callback cannot advance the status.
  update public.whatsapp_message
  set provider_message_id = p_provider_message_id,
      status = case when v_next_rank > v_current_rank
        or (v_next_rank = v_current_rank and
          v_timestamp >= coalesce(status_timestamp, '-infinity'::timestamptz))
        then p_status else status end,
      error_code = case
        when v_next_rank > v_current_rank then
          case when p_status = 'failed' then left(p_error_code, 200) else null end
        when p_status = 'failed' and v_next_rank = v_current_rank
          and v_timestamp >= coalesce(status_timestamp, '-infinity'::timestamptz)
          then left(p_error_code, 200)
        else error_code end,
      status_timestamp = case when v_next_rank >= v_current_rank
        then greatest(status_timestamp, v_timestamp) else status_timestamp end,
      provider_timestamp = coalesce(provider_timestamp, v_timestamp)
  where id = v_message.id and company_id = v_account.company_id
  returning * into v_message;

  return jsonb_build_object('ignored', false, 'message', to_jsonb(v_message));
end;
$$;

-- Staff have no direct UPDATE grant; this is the only authenticated mutation.
create function public.whatsapp_update_conversation(
  p_conversation_id uuid,
  p_customer_id uuid default null,
  p_status text default null,
  p_mark_read boolean default false,
  p_opted_out boolean default null,
  p_read_through timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid;
  v_profile_count integer;
  v_conversation public.whatsapp_conversation%rowtype;
  v_read_through timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  select count(*) into v_profile_count from public.user_profile where user_id = auth.uid();
  v_company_id := public.current_company_id();
  if v_profile_count <> 1 or v_company_id is null
     or not public.current_user_has_permission('whatsapp.view') then
    raise exception 'WhatsApp access denied.' using errcode = '42501';
  end if;
  if (p_customer_id is not null or p_status is not null or p_opted_out is not null)
     and not public.current_user_has_permission('whatsapp.send') then
    raise exception 'WhatsApp send permission required.' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('open', 'closed') then
    raise exception 'Invalid conversation status.' using errcode = '22023';
  end if;
  if p_customer_id is not null
     and not public.current_user_has_permission('customer.view') then
    raise exception 'Customer view permission required.' using errcode = '42501';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customer where id = p_customer_id and company_id = v_company_id
  ) then
    raise exception 'Customer is not in your company.' using errcode = '42501';
  end if;

  select * into v_conversation from public.whatsapp_conversation
  where id = p_conversation_id and company_id = v_company_id for update;
  if not found then
    raise exception 'Conversation unavailable.' using errcode = '42501';
  end if;
  v_read_through := greatest(v_conversation.last_read_at,
    least(coalesce(p_read_through, statement_timestamp()), statement_timestamp()));

  update public.whatsapp_conversation
  set customer_id = coalesce(p_customer_id, customer_id),
      status = coalesce(p_status, status),
      opted_out = coalesce(p_opted_out, opted_out),
      last_read_at = case when p_mark_read then v_read_through else last_read_at end,
      unread_count = case when p_mark_read then (
        select count(*)::integer from public.whatsapp_message m
        where m.company_id = v_company_id and m.conversation_id = p_conversation_id
          and m.direction = 'inbound' and m.created_at > v_read_through
      ) else unread_count end
  where id = p_conversation_id and company_id = v_company_id
  returning * into v_conversation;
  return to_jsonb(v_conversation);
end;
$$;

revoke all on function public.whatsapp_ingest_message(text,text,text,text,text,text,text,timestamptz,text,text,text)
  from public, anon, authenticated;
revoke all on function public.whatsapp_apply_status(text,text,text,text,timestamptz,text,uuid)
  from public, anon, authenticated;
revoke all on function public.whatsapp_update_conversation(uuid,uuid,text,boolean,boolean,timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.whatsapp_ingest_message(text,text,text,text,text,text,text,timestamptz,text,text,text)
  to service_role;
grant execute on function public.whatsapp_apply_status(text,text,text,text,timestamptz,text,uuid)
  to service_role;
grant execute on function public.whatsapp_update_conversation(uuid,uuid,text,boolean,boolean,timestamptz)
  to authenticated;

comment on table public.whatsapp_account is
  'Server-verified tenant binding to a Meta business phone. Never store access tokens here.';
comment on table public.whatsapp_message is
  'Durable inbound history and outbound reservations. Only free service-window text replies are supported.';
comment on function public.whatsapp_update_conversation(uuid,uuid,text,boolean,boolean,timestamptz) is
  'Company- and permission-checked staff update; read-through timestamp preserves concurrently arriving messages.';
;
