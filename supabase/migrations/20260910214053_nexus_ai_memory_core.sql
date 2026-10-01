create table if not exists public.nexus_ai_conversation (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null default 'dashboard' check (channel in ('dashboard','whatsapp','mobile','api')),
  external_thread_id text,
  title text,
  metadata jsonb not null default '{}'::jsonb,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists nexus_ai_conversation_external_thread_uidx
  on public.nexus_ai_conversation(company_id, user_id, channel, external_thread_id)
  where external_thread_id is not null;

create index if not exists nexus_ai_conversation_user_idx
  on public.nexus_ai_conversation(company_id, user_id, last_active_at desc);

alter table public.nexus_ai_conversation enable row level security;

create policy nexus_ai_conversation_select_own
  on public.nexus_ai_conversation for select
  to authenticated
  using (user_id = auth.uid() and company_id = public.current_company_id());

create policy nexus_ai_conversation_insert_own
  on public.nexus_ai_conversation for insert
  to authenticated
  with check (user_id = auth.uid() and company_id = public.current_company_id());

create policy nexus_ai_conversation_update_own
  on public.nexus_ai_conversation for update
  to authenticated
  using (user_id = auth.uid() and company_id = public.current_company_id())
  with check (user_id = auth.uid() and company_id = public.current_company_id());

create policy nexus_ai_conversation_delete_own
  on public.nexus_ai_conversation for delete
  to authenticated
  using (user_id = auth.uid() and company_id = public.current_company_id());

create table if not exists public.nexus_ai_message (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.nexus_ai_conversation(id) on delete cascade,
  company_id uuid not null references public.company(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  role text not null check (role in ('user','assistant','tool','system')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists nexus_ai_message_conversation_idx
  on public.nexus_ai_message(conversation_id, created_at asc);

alter table public.nexus_ai_message enable row level security;

create policy nexus_ai_message_select_own
  on public.nexus_ai_message for select
  to authenticated
  using (
    exists (
      select 1
      from public.nexus_ai_conversation c
      where c.id = conversation_id
        and c.user_id = auth.uid()
        and c.company_id = public.current_company_id()
    )
  );

create policy nexus_ai_message_insert_own
  on public.nexus_ai_message for insert
  to authenticated
  with check (
    company_id = public.current_company_id()
    and exists (
      select 1
      from public.nexus_ai_conversation c
      where c.id = conversation_id
        and c.user_id = auth.uid()
        and c.company_id = company_id
    )
  );

create table if not exists public.nexus_ai_tool_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  conversation_id uuid references public.nexus_ai_conversation(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_name text not null,
  arguments jsonb not null default '{}'::jsonb,
  result_preview jsonb,
  success boolean not null,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists nexus_ai_tool_audit_user_idx
  on public.nexus_ai_tool_audit(company_id, user_id, created_at desc);

alter table public.nexus_ai_tool_audit enable row level security;

create policy nexus_ai_tool_audit_select_own
  on public.nexus_ai_tool_audit for select
  to authenticated
  using (user_id = auth.uid() and company_id = public.current_company_id());

create policy nexus_ai_tool_audit_insert_own
  on public.nexus_ai_tool_audit for insert
  to authenticated
  with check (user_id = auth.uid() and company_id = public.current_company_id());

create or replace function public.get_or_create_nexus_ai_conversation(
  p_channel text default 'dashboard',
  p_external_thread_id text default null,
  p_title text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  v_company_id := public.current_company_id();

  if p_channel not in ('dashboard','whatsapp','mobile','api') then
    raise exception 'Unsupported Nexus AI channel.';
  end if;

  if p_external_thread_id is not null then
    select c.id into v_id
    from public.nexus_ai_conversation c
    where c.company_id = v_company_id
      and c.user_id = auth.uid()
      and c.channel = p_channel
      and c.external_thread_id = p_external_thread_id
    limit 1;
  end if;

  if v_id is null then
    insert into public.nexus_ai_conversation(company_id,user_id,channel,external_thread_id,title)
    values (v_company_id, auth.uid(), p_channel, p_external_thread_id, nullif(trim(p_title),''))
    returning id into v_id;
  else
    update public.nexus_ai_conversation
    set last_active_at = now(), updated_at = now()
    where id = v_id;
  end if;

  return jsonb_build_object('id',v_id,'company_id',v_company_id,'channel',p_channel);
end;
$$;

create or replace function public.append_nexus_ai_message(
  p_conversation_id uuid,
  p_role text,
  p_content text,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_message_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if p_role not in ('user','assistant','tool','system') then raise exception 'Invalid AI message role.'; end if;
  if nullif(trim(p_content),'') is null then raise exception 'Message content required.'; end if;

  v_company_id := public.current_company_id();

  if not exists (
    select 1 from public.nexus_ai_conversation c
    where c.id = p_conversation_id
      and c.company_id = v_company_id
      and c.user_id = auth.uid()
  ) then
    raise exception 'Conversation access denied.';
  end if;

  insert into public.nexus_ai_message(conversation_id,company_id,actor_user_id,role,content,metadata)
  values (p_conversation_id,v_company_id,auth.uid(),p_role,p_content,coalesce(p_metadata,'{}'::jsonb))
  returning id into v_message_id;

  update public.nexus_ai_conversation
  set last_active_at=now(), updated_at=now()
  where id=p_conversation_id;

  return jsonb_build_object('id',v_message_id,'conversation_id',p_conversation_id);
end;
$$;

create or replace function public.get_nexus_ai_history(
  p_conversation_id uuid,
  p_limit integer default 12
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit,12),1),50);
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  v_company_id := public.current_company_id();

  if not exists (
    select 1 from public.nexus_ai_conversation c
    where c.id=p_conversation_id
      and c.company_id=v_company_id
      and c.user_id=auth.uid()
  ) then
    raise exception 'Conversation access denied.';
  end if;

  select coalesce(jsonb_agg(x.obj order by x.created_at),'[]'::jsonb)
  into v_result
  from (
    select m.created_at,
      jsonb_build_object('role',m.role,'content',m.content,'created_at',m.created_at) as obj
    from public.nexus_ai_message m
    where m.conversation_id=p_conversation_id
    order by m.created_at desc
    limit v_limit
  ) x;

  return v_result;
end;
$$;

create or replace function public.record_nexus_ai_tool_audit(
  p_conversation_id uuid,
  p_tool_name text,
  p_arguments jsonb,
  p_result_preview jsonb,
  p_success boolean,
  p_duration_ms integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  v_company_id := public.current_company_id();

  if p_conversation_id is not null and not exists (
    select 1 from public.nexus_ai_conversation c
    where c.id=p_conversation_id
      and c.company_id=v_company_id
      and c.user_id=auth.uid()
  ) then
    raise exception 'Conversation access denied.';
  end if;

  insert into public.nexus_ai_tool_audit(company_id,conversation_id,user_id,tool_name,arguments,result_preview,success,duration_ms)
  values (v_company_id,p_conversation_id,auth.uid(),p_tool_name,coalesce(p_arguments,'{}'::jsonb),p_result_preview,p_success,p_duration_ms)
  returning id into v_id;

  return jsonb_build_object('id',v_id);
end;
$$;

revoke all on function public.get_or_create_nexus_ai_conversation(text,text,text) from public, anon;
revoke all on function public.append_nexus_ai_message(uuid,text,text,jsonb) from public, anon;
revoke all on function public.get_nexus_ai_history(uuid,integer) from public, anon;
revoke all on function public.record_nexus_ai_tool_audit(uuid,text,jsonb,jsonb,boolean,integer) from public, anon;

grant execute on function public.get_or_create_nexus_ai_conversation(text,text,text) to authenticated;
grant execute on function public.append_nexus_ai_message(uuid,text,text,jsonb) to authenticated;
grant execute on function public.get_nexus_ai_history(uuid,integer) to authenticated;
grant execute on function public.record_nexus_ai_tool_audit(uuid,text,jsonb,jsonb,boolean,integer) to authenticated;;
