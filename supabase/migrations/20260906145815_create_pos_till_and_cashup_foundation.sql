create table if not exists public.pos_till_session (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid not null references public.branch(id) on delete restrict,
  session_number text not null,
  cashier_user_id uuid not null references auth.users(id) on delete restrict,
  opened_by uuid references auth.users(id) on delete set null,
  closed_by uuid references auth.users(id) on delete set null,
  status text not null default 'open' check (status in ('open','closed')),
  opening_float numeric(14,2) not null default 0 check (opening_float >= 0),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  expected_cash numeric(14,2),
  counted_cash numeric(14,2),
  cash_difference numeric(14,2),
  cash_sales numeric(14,2) not null default 0,
  card_sales numeric(14,2) not null default 0,
  eft_sales numeric(14,2) not null default 0,
  other_sales numeric(14,2) not null default 0,
  gross_sales numeric(14,2) not null default 0,
  transaction_count integer not null default 0,
  opening_notes text,
  closing_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, session_number)
);

create unique index if not exists pos_till_session_one_open_per_cashier
  on public.pos_till_session(company_id,cashier_user_id)
  where status='open';

create index if not exists pos_till_session_company_branch_status_idx
  on public.pos_till_session(company_id,branch_id,status,opened_at desc);

alter table public.pos_sale
  add column if not exists till_session_id uuid references public.pos_till_session(id) on delete restrict;

create index if not exists pos_sale_till_session_idx
  on public.pos_sale(company_id,till_session_id,created_at);

alter table public.pos_till_session enable row level security;

drop policy if exists pos_till_session_select_policy on public.pos_till_session;
create policy pos_till_session_select_policy
on public.pos_till_session
for select
to authenticated
using (
  company_id=public.current_company_id()
  and public.current_user_has_permission('pos.view')
);

insert into public.permissions(permission_name)
values
  ('pos.session.open'),
  ('pos.session.close'),
  ('pos.cashup.view'),
  ('pos.cashup.manage')
on conflict(permission_name) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.permission_name in ('pos.session.open','pos.session.close','pos.cashup.view','pos.cashup.manage')
where r.role_name in ('owner','admin')
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id=r.id and rp.permission_id=p.id
  );

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.permission_name in ('pos.session.open','pos.session.close','pos.cashup.view')
where r.role_name='manager'
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id=r.id and rp.permission_id=p.id
  );

create or replace function public.generate_pos_till_session_number(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_prefix text := 'TILL-'||to_char(current_date,'YYYYMM')||'-';
  v_next integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_company_id::text||':pos_till:'||to_char(current_date,'YYYYMM')));

  select coalesce(max(nullif(regexp_replace(session_number,'^.*-','','g'),'')::integer),0)+1
  into v_next
  from public.pos_till_session
  where company_id=p_company_id
    and session_number like v_prefix||'%';

  return v_prefix||lpad(v_next::text,5,'0');
end;
$$;

create or replace function public.get_pos_till_session_totals(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company_id uuid;
  v_session public.pos_till_session%rowtype;
  v_cash numeric(14,2):=0;
  v_card numeric(14,2):=0;
  v_eft numeric(14,2):=0;
  v_other numeric(14,2):=0;
  v_total numeric(14,2):=0;
  v_count integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.view') then raise exception 'Permission denied: pos.view'; end if;
  v_company_id:=public.current_company_id();

  select * into v_session
  from public.pos_till_session
  where id=p_session_id and company_id=v_company_id;

  if not found then raise exception 'Till session could not be found.'; end if;

  select
    coalesce(sum(total_amount) filter(where payment_method='cash'),0),
    coalesce(sum(total_amount) filter(where payment_method='card'),0),
    coalesce(sum(total_amount) filter(where payment_method='eft'),0),
    coalesce(sum(total_amount) filter(where payment_method='other'),0),
    coalesce(sum(total_amount),0),
    count(*)
  into v_cash,v_card,v_eft,v_other,v_total,v_count
  from public.pos_sale
  where company_id=v_company_id
    and till_session_id=p_session_id
    and status='completed';

  return jsonb_build_object(
    'session_id',v_session.id,
    'opening_float',v_session.opening_float,
    'cash_sales',round(v_cash,2),
    'card_sales',round(v_card,2),
    'eft_sales',round(v_eft,2),
    'other_sales',round(v_other,2),
    'gross_sales',round(v_total,2),
    'transaction_count',v_count,
    'expected_cash',round(v_session.opening_float+v_cash,2)
  );
end;
$$;

create or replace function public.open_pos_till_session(
  p_branch_id uuid,
  p_opening_float numeric default 0,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company_id uuid;
  v_session_id uuid;
  v_session_number text;
  v_branch_name text;
  v_existing public.pos_till_session%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.session.open') then raise exception 'Permission denied: pos.session.open'; end if;
  if coalesce(p_opening_float,0)<0 then raise exception 'Opening float cannot be negative.'; end if;

  v_company_id:=public.current_company_id();

  select branch_name into v_branch_name
  from public.branch
  where id=p_branch_id and company_id=v_company_id;
  if v_branch_name is null then raise exception 'Branch could not be found.'; end if;

  select * into v_existing
  from public.pos_till_session
  where company_id=v_company_id and cashier_user_id=auth.uid() and status='open'
  limit 1;

  if found then
    raise exception 'You already have an open till session % at another or the same branch. Close it before opening a new session.',v_existing.session_number;
  end if;

  v_session_number:=public.generate_pos_till_session_number(v_company_id);

  insert into public.pos_till_session(
    company_id,branch_id,session_number,cashier_user_id,opened_by,status,opening_float,opening_notes
  ) values (
    v_company_id,p_branch_id,v_session_number,auth.uid(),auth.uid(),'open',round(coalesce(p_opening_float,0),2),nullif(trim(coalesce(p_notes,'')),'')
  ) returning id into v_session_id;

  return jsonb_build_object(
    'ok',true,
    'session_id',v_session_id,
    'session_number',v_session_number,
    'branch_id',p_branch_id,
    'branch_name',v_branch_name,
    'opening_float',round(coalesce(p_opening_float,0),2),
    'message','Till session opened.'
  );
end;
$$;

create or replace function public.close_pos_till_session(
  p_session_id uuid,
  p_counted_cash numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company_id uuid;
  v_session public.pos_till_session%rowtype;
  v_totals jsonb;
  v_expected numeric(14,2);
  v_counted numeric(14,2);
  v_difference numeric(14,2);
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.session.close') then raise exception 'Permission denied: pos.session.close'; end if;
  if p_counted_cash is null or p_counted_cash<0 then raise exception 'Counted cash cannot be negative.'; end if;

  v_company_id:=public.current_company_id();

  select * into v_session
  from public.pos_till_session
  where id=p_session_id and company_id=v_company_id
  for update;

  if not found then raise exception 'Till session could not be found.'; end if;
  if v_session.status<>'open' then raise exception 'Till session is already closed.'; end if;

  if v_session.cashier_user_id<>auth.uid()
     and not public.current_user_has_permission('pos.cashup.manage') then
    raise exception 'You cannot close another cashier''s till session.';
  end if;

  v_totals:=public.get_pos_till_session_totals(v_session.id);
  v_expected:=round(coalesce((v_totals->>'expected_cash')::numeric,0),2);
  v_counted:=round(p_counted_cash,2);
  v_difference:=round(v_counted-v_expected,2);

  update public.pos_till_session
  set status='closed',
      closed_at=now(),
      closed_by=auth.uid(),
      expected_cash=v_expected,
      counted_cash=v_counted,
      cash_difference=v_difference,
      cash_sales=coalesce((v_totals->>'cash_sales')::numeric,0),
      card_sales=coalesce((v_totals->>'card_sales')::numeric,0),
      eft_sales=coalesce((v_totals->>'eft_sales')::numeric,0),
      other_sales=coalesce((v_totals->>'other_sales')::numeric,0),
      gross_sales=coalesce((v_totals->>'gross_sales')::numeric,0),
      transaction_count=coalesce((v_totals->>'transaction_count')::integer,0),
      closing_notes=nullif(trim(coalesce(p_notes,'')),''),
      updated_at=now()
  where id=v_session.id;

  return jsonb_build_object(
    'ok',true,
    'session_id',v_session.id,
    'session_number',v_session.session_number,
    'opening_float',v_session.opening_float,
    'cash_sales',coalesce((v_totals->>'cash_sales')::numeric,0),
    'card_sales',coalesce((v_totals->>'card_sales')::numeric,0),
    'eft_sales',coalesce((v_totals->>'eft_sales')::numeric,0),
    'other_sales',coalesce((v_totals->>'other_sales')::numeric,0),
    'gross_sales',coalesce((v_totals->>'gross_sales')::numeric,0),
    'transaction_count',coalesce((v_totals->>'transaction_count')::integer,0),
    'expected_cash',v_expected,
    'counted_cash',v_counted,
    'cash_difference',v_difference,
    'message',case when abs(v_difference)<=0.009 then 'Till closed and cash balanced.' when v_difference<0 then 'Till closed with a cash shortage.' else 'Till closed with a cash overage.' end
  );
end;
$$;

create or replace function public.get_pos_till_workspace(p_branch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company_id uuid;
  v_open_session public.pos_till_session%rowtype;
  v_totals jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.view') then raise exception 'Permission denied: pos.view'; end if;
  v_company_id:=public.current_company_id();

  select * into v_open_session
  from public.pos_till_session
  where company_id=v_company_id
    and cashier_user_id=auth.uid()
    and status='open'
  order by opened_at desc
  limit 1;

  if found then
    v_totals:=public.get_pos_till_session_totals(v_open_session.id);
  end if;

  return jsonb_build_object(
    'ok',true,
    'selected_branch_id',p_branch_id,
    'require_cashier_session',coalesce((select require_cashier_session from public.company_pos_settings where company_id=v_company_id),false),
    'can_open',public.current_user_has_permission('pos.session.open'),
    'can_close',public.current_user_has_permission('pos.session.close'),
    'can_manage_cashup',public.current_user_has_permission('pos.cashup.manage'),
    'open_session',case when v_open_session.id is null then null else jsonb_build_object(
      'id',v_open_session.id,
      'session_number',v_open_session.session_number,
      'branch_id',v_open_session.branch_id,
      'branch_name',(select branch_name from public.branch where id=v_open_session.branch_id),
      'cashier_user_id',v_open_session.cashier_user_id,
      'cashier_name',coalesce((select full_name from public.user_profile where user_id=v_open_session.cashier_user_id and company_id=v_company_id limit 1),'Cashier'),
      'opened_at',v_open_session.opened_at,
      'opening_float',v_open_session.opening_float,
      'totals',v_totals
    ) end,
    'recent_sessions',coalesce((
      select jsonb_agg(x.obj order by x.closed_at desc)
      from (
        select jsonb_build_object(
          'id',s.id,
          'session_number',s.session_number,
          'branch_name',b.branch_name,
          'cashier_name',coalesce(up.full_name,'Cashier'),
          'opened_at',s.opened_at,
          'closed_at',s.closed_at,
          'opening_float',s.opening_float,
          'gross_sales',s.gross_sales,
          'transaction_count',s.transaction_count,
          'expected_cash',s.expected_cash,
          'counted_cash',s.counted_cash,
          'cash_difference',s.cash_difference
        ) as obj,
        s.closed_at
        from public.pos_till_session s
        join public.branch b on b.id=s.branch_id
        left join public.user_profile up on up.user_id=s.cashier_user_id and up.company_id=s.company_id
        where s.company_id=v_company_id and s.status='closed'
        order by s.closed_at desc
        limit 20
      ) x
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.attach_pos_till_session()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_require boolean:=false;
  v_session public.pos_till_session%rowtype;
begin
  if new.cashier_user_id is null then new.cashier_user_id:=auth.uid(); end if;

  select coalesce(require_cashier_session,false)
  into v_require
  from public.company_pos_settings
  where company_id=new.company_id;

  select * into v_session
  from public.pos_till_session
  where company_id=new.company_id
    and cashier_user_id=new.cashier_user_id
    and status='open'
  limit 1;

  if found then
    if v_session.branch_id<>new.branch_id then
      raise exception 'Your open till session belongs to another branch. Close it before selling from this branch.';
    end if;
    new.till_session_id:=v_session.id;
  elsif v_require then
    raise exception 'Open a till session before completing POS sales.';
  end if;

  return new;
end;
$$;

drop trigger if exists attach_pos_till_session_trigger on public.pos_sale;
create trigger attach_pos_till_session_trigger
before insert on public.pos_sale
for each row execute function public.attach_pos_till_session();

grant execute on function public.open_pos_till_session(uuid,numeric,text) to authenticated;
grant execute on function public.close_pos_till_session(uuid,numeric,text) to authenticated;
grant execute on function public.get_pos_till_session_totals(uuid) to authenticated;
grant execute on function public.get_pos_till_workspace(uuid) to authenticated;;
