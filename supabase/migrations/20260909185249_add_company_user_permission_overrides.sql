create table if not exists public.company_user_permission_override (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  user_id uuid not null,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  allowed boolean not null,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id, permission_id)
);

create index if not exists company_user_permission_override_user_idx
  on public.company_user_permission_override(company_id, user_id);

alter table public.company_user_permission_override enable row level security;

create or replace function public.user_has_effective_permission(
  p_user_id uuid,
  p_company_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with override_value as (
    select o.allowed
    from public.company_user_permission_override o
    join public.permissions p on p.id = o.permission_id
    where o.company_id = p_company_id
      and o.user_id = p_user_id
      and p.permission_name = p_permission
    limit 1
  ), role_value as (
    select exists (
      select 1
      from public.user_profile up
      join public.roles r on r.role_name = up.role
      join public.role_permissions rp on rp.role_id = r.id
      join public.permissions p on p.id = rp.permission_id
      where up.user_id = p_user_id
        and up.company_id = p_company_id
        and p.permission_name = p_permission
    ) as allowed
  )
  select coalesce((select allowed from override_value), (select allowed from role_value), false);
$$;

create or replace function public.current_user_has_permission(requested_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_has_effective_permission(
    auth.uid(),
    public.current_company_id(),
    requested_permission
  );
$$;

create or replace function public.has_permission(requested_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_has_effective_permission(
    auth.uid(),
    public.current_company_id(),
    requested_permission
  );
$$;

create or replace function public.get_current_user_permissions()
returns table(permission_name text)
language sql
stable
security definer
set search_path = public
as $$
  with all_permissions as (
    select p.permission_name
    from public.permissions p
  )
  select ap.permission_name
  from all_permissions ap
  where public.user_has_effective_permission(
    auth.uid(),
    public.current_company_id(),
    ap.permission_name
  )
  order by ap.permission_name;
$$;

revoke all on function public.user_has_effective_permission(uuid,uuid,text) from public;
revoke all on function public.current_user_has_permission(text) from public;
revoke all on function public.has_permission(text) from public;
revoke all on function public.get_current_user_permissions() from public;

grant execute on function public.current_user_has_permission(text) to authenticated;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.get_current_user_permissions() to authenticated;;
