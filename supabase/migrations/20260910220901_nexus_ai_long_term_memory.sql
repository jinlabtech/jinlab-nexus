create table if not exists public.nexus_ai_memory (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_key text not null,
  memory_text text not null,
  category text not null default 'general',
  source_conversation_id uuid null references public.nexus_ai_conversation(id) on delete set null,
  confidence numeric not null default 0.8 check (confidence >= 0 and confidence <= 1),
  last_used_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, user_id, memory_key)
);

create index if not exists nexus_ai_memory_user_idx
  on public.nexus_ai_memory(company_id, user_id, updated_at desc);

alter table public.nexus_ai_memory enable row level security;

drop policy if exists nexus_ai_memory_select_own on public.nexus_ai_memory;
create policy nexus_ai_memory_select_own
  on public.nexus_ai_memory for select
  to authenticated
  using (user_id = auth.uid() and company_id = public.current_company_id());

drop policy if exists nexus_ai_memory_insert_own on public.nexus_ai_memory;
create policy nexus_ai_memory_insert_own
  on public.nexus_ai_memory for insert
  to authenticated
  with check (user_id = auth.uid() and company_id = public.current_company_id());

drop policy if exists nexus_ai_memory_update_own on public.nexus_ai_memory;
create policy nexus_ai_memory_update_own
  on public.nexus_ai_memory for update
  to authenticated
  using (user_id = auth.uid() and company_id = public.current_company_id())
  with check (user_id = auth.uid() and company_id = public.current_company_id());

drop policy if exists nexus_ai_memory_delete_own on public.nexus_ai_memory;
create policy nexus_ai_memory_delete_own
  on public.nexus_ai_memory for delete
  to authenticated
  using (user_id = auth.uid() and company_id = public.current_company_id());

create or replace function public.get_nexus_ai_memory(p_limit integer default 40)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_company_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit,40),1),100);
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  v_company_id := public.current_company_id();

  select coalesce(jsonb_agg(x.obj order by x.updated_at desc),'[]'::jsonb)
  into v_result
  from (
    select m.updated_at,
      jsonb_build_object(
        'key',m.memory_key,
        'text',m.memory_text,
        'category',m.category,
        'confidence',m.confidence,
        'updated_at',m.updated_at
      ) as obj
    from public.nexus_ai_memory m
    where m.company_id=v_company_id
      and m.user_id=auth.uid()
    order by m.updated_at desc
    limit v_limit
  ) x;

  return v_result;
end;
$function$;

create or replace function public.upsert_nexus_ai_memory(
  p_memory_key text,
  p_memory_text text,
  p_category text default 'general',
  p_source_conversation_id uuid default null,
  p_confidence numeric default 0.8
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_company_id uuid;
  v_id uuid;
  v_key text := left(trim(coalesce(p_memory_key,'')),120);
  v_text text := left(trim(coalesce(p_memory_text,'')),2000);
  v_category text := lower(trim(coalesce(p_category,'general')));
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if v_key = '' or v_text = '' then raise exception 'Memory key and text are required.'; end if;
  if v_category not in ('general','preference','project','decision','instruction','fact') then
    v_category := 'general';
  end if;

  v_company_id := public.current_company_id();

  if p_source_conversation_id is not null and not exists (
    select 1 from public.nexus_ai_conversation c
    where c.id=p_source_conversation_id
      and c.company_id=v_company_id
      and c.user_id=auth.uid()
  ) then
    raise exception 'Conversation access denied.';
  end if;

  insert into public.nexus_ai_memory(
    company_id,user_id,memory_key,memory_text,category,
    source_conversation_id,confidence,updated_at
  )
  values (
    v_company_id,auth.uid(),v_key,v_text,v_category,
    p_source_conversation_id,least(greatest(coalesce(p_confidence,0.8),0),1),now()
  )
  on conflict (company_id,user_id,memory_key)
  do update set
    memory_text=excluded.memory_text,
    category=excluded.category,
    source_conversation_id=coalesce(excluded.source_conversation_id,public.nexus_ai_memory.source_conversation_id),
    confidence=excluded.confidence,
    updated_at=now()
  returning id into v_id;

  return jsonb_build_object('id',v_id,'key',v_key);
end;
$function$;

create or replace function public.delete_nexus_ai_memory(p_memory_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_company_id uuid;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  v_company_id := public.current_company_id();

  delete from public.nexus_ai_memory
  where company_id=v_company_id
    and user_id=auth.uid()
    and memory_key=trim(p_memory_key);

  get diagnostics v_count = row_count;
  return jsonb_build_object('deleted',v_count);
end;
$function$;

revoke all on function public.get_nexus_ai_memory(integer) from public, anon;
revoke all on function public.upsert_nexus_ai_memory(text,text,text,uuid,numeric) from public, anon;
revoke all on function public.delete_nexus_ai_memory(text) from public, anon;

grant execute on function public.get_nexus_ai_memory(integer) to authenticated;
grant execute on function public.upsert_nexus_ai_memory(text,text,text,uuid,numeric) to authenticated;
grant execute on function public.delete_nexus_ai_memory(text) to authenticated;;
