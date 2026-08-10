-- ============================================================
-- JINLAB Nexus
-- Sprint 14.1 - Role Based Access Control Foundation
-- ============================================================

-- ------------------------------------------------------------
-- 1. Create the role_permissions linking table
-- ------------------------------------------------------------

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),

  role_id uuid not null
    references public.roles(id)
    on delete cascade,

  permission_id uuid not null
    references public.permissions(id)
    on delete cascade,

  created_at timestamptz not null default now(),

  unique (role_id, permission_id)
);

-- ------------------------------------------------------------
-- 2. Create indexes
-- ------------------------------------------------------------

create index if not exists role_permissions_role_id_idx
  on public.role_permissions(role_id);

create index if not exists role_permissions_permission_id_idx
  on public.role_permissions(permission_id);

-- ------------------------------------------------------------
-- 3. Seed JINLAB Nexus roles
-- ------------------------------------------------------------

insert into public.roles (role_name)
values
  ('owner'),
  ('admin'),
  ('manager'),
  ('technician'),
  ('cashier'),
  ('employee'),
  ('viewer')
on conflict (role_name) do nothing;

-- ------------------------------------------------------------
-- 4. Seed platform permissions
-- ------------------------------------------------------------

insert into public.permissions (permission_name)
values
  ('dashboard.view'),

  ('company.view'),
  ('company.create'),
  ('company.update'),
  ('company.delete'),

  ('branch.view'),
  ('branch.create'),
  ('branch.update'),
  ('branch.delete'),

  ('user.view'),
  ('user.invite'),
  ('user.update'),

  ('audit.view'),

  ('reports.view'),
  ('reports.export'),

  ('settings.view'),
  ('settings.manage')
on conflict (permission_name) do nothing;

-- ------------------------------------------------------------
-- 5. OWNER
-- Owner receives every current permission.
-- ------------------------------------------------------------

insert into public.role_permissions (
  role_id,
  permission_id
)
select
  r.id,
  p.id
from public.roles r
cross join public.permissions p
where r.role_name = 'owner'
on conflict (role_id, permission_id) do nothing;

-- ------------------------------------------------------------
-- 6. ADMIN
-- Operational administrator, but cannot delete companies.
-- ------------------------------------------------------------

insert into public.role_permissions (
  role_id,
  permission_id
)
select
  r.id,
  p.id
from public.roles r
join public.permissions p
  on p.permission_name in (
    'dashboard.view',

    'company.view',
    'company.update',

    'branch.view',
    'branch.create',
    'branch.update',
    'branch.delete',

    'user.view',
    'user.invite',
    'user.update',

    'audit.view',

    'reports.view',
    'reports.export',

    'settings.view',
    'settings.manage'
  )
where r.role_name = 'admin'
on conflict (role_id, permission_id) do nothing;

-- ------------------------------------------------------------
-- 7. MANAGER
-- Manages day-to-day business operations.
-- ------------------------------------------------------------

insert into public.role_permissions (
  role_id,
  permission_id
)
select
  r.id,
  p.id
from public.roles r
join public.permissions p
  on p.permission_name in (
    'dashboard.view',

    'company.view',

    'branch.view',
    'branch.create',
    'branch.update',

    'user.view',

    'audit.view',

    'reports.view'
  )
where r.role_name = 'manager'
on conflict (role_id, permission_id) do nothing;

-- ------------------------------------------------------------
-- 8. TECHNICIAN
-- Basic operational access.
-- Future repair permissions will be added later.
-- ------------------------------------------------------------

insert into public.role_permissions (
  role_id,
  permission_id
)
select
  r.id,
  p.id
from public.roles r
join public.permissions p
  on p.permission_name in (
    'dashboard.view',
    'company.view',
    'branch.view'
  )
where r.role_name = 'technician'
on conflict (role_id, permission_id) do nothing;

-- ------------------------------------------------------------
-- 9. CASHIER
-- Basic operational access.
-- Future POS permissions will be added later.
-- ------------------------------------------------------------

insert into public.role_permissions (
  role_id,
  permission_id
)
select
  r.id,
  p.id
from public.roles r
join public.permissions p
  on p.permission_name in (
    'dashboard.view',
    'company.view',
    'branch.view'
  )
where r.role_name = 'cashier'
on conflict (role_id, permission_id) do nothing;

-- ------------------------------------------------------------
-- 10. EMPLOYEE
-- Standard internal access.
-- ------------------------------------------------------------

insert into public.role_permissions (
  role_id,
  permission_id
)
select
  r.id,
  p.id
from public.roles r
join public.permissions p
  on p.permission_name in (
    'dashboard.view',
    'company.view',
    'branch.view'
  )
where r.role_name = 'employee'
on conflict (role_id, permission_id) do nothing;

-- ------------------------------------------------------------
-- 11. VIEWER
-- Read-only access.
-- ------------------------------------------------------------

insert into public.role_permissions (
  role_id,
  permission_id
)
select
  r.id,
  p.id
from public.roles r
join public.permissions p
  on p.permission_name in (
    'dashboard.view',
    'company.view',
    'branch.view',
    'reports.view'
  )
where r.role_name = 'viewer'
on conflict (role_id, permission_id) do nothing;

-- ------------------------------------------------------------
-- 12. Enable Row Level Security
-- ------------------------------------------------------------

alter table public.roles
  enable row level security;

alter table public.permissions
  enable row level security;

alter table public.role_permissions
  enable row level security;

-- ------------------------------------------------------------
-- 13. Authenticated users may read RBAC definitions.
-- Writes remain unavailable from normal browser clients.
-- ------------------------------------------------------------

drop policy if exists
  "Authenticated users can view roles"
on public.roles;

create policy
  "Authenticated users can view roles"
on public.roles
for select
to authenticated
using (true);


drop policy if exists
  "Authenticated users can view permissions"
on public.permissions;

create policy
  "Authenticated users can view permissions"
on public.permissions
for select
to authenticated
using (true);


drop policy if exists
  "Authenticated users can view role permissions"
on public.role_permissions;

create policy
  "Authenticated users can view role permissions"
on public.role_permissions
for select
to authenticated
using (true);

-- ------------------------------------------------------------
-- 14. Permission-checking function
--
-- Example:
-- select public.has_permission('user.invite');
-- ------------------------------------------------------------

create or replace function public.has_permission(
  requested_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1

    from public.user_profile up

    join public.roles r
      on r.role_name = up.role

    join public.role_permissions rp
      on rp.role_id = r.id

    join public.permissions p
      on p.id = rp.permission_id

    where up.user_id = auth.uid()
      and p.permission_name = requested_permission
  );
$$;

-- ------------------------------------------------------------
-- 15. Allow authenticated users to execute the checker.
-- ------------------------------------------------------------

revoke all
on function public.has_permission(text)
from public;

grant execute
on function public.has_permission(text)
to authenticated;

-- ============================================================
-- End RBAC Foundation
-- ============================================================
