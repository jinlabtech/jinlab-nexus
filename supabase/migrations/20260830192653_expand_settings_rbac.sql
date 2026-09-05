-- ============================================================
-- JINLAB Nexus
-- Sprint 18.13A
-- Granular Settings RBAC
-- ============================================================

insert into public.permissions (permission_name)
values
  ('settings.view'),
  ('settings.manage'),
  ('settings.company.manage'),
  ('settings.branding.manage'),
  ('settings.roles.manage'),
  ('settings.branches.manage'),
  ('settings.finance.view'),
  ('settings.finance.manage'),
  ('settings.accounting.manage'),
  ('settings.security.manage'),
  ('settings.notifications.manage'),
  ('settings.integrations.manage'),
  ('settings.audit.view'),
  ('settings.subscription.manage')
on conflict (permission_name) do nothing;


-- ============================================================
-- OWNER
-- Complete company Settings authority.
-- ============================================================

insert into public.role_permissions (
  role_id,
  permission_id
)
select
  r.id,
  p.id
from public.roles r
cross join public.permissions p
where
  r.role_name = 'owner'
  and p.permission_name in (
    'settings.view',
    'settings.manage',
    'settings.company.manage',
    'settings.branding.manage',
    'settings.roles.manage',
    'settings.branches.manage',
    'settings.finance.view',
    'settings.finance.manage',
    'settings.accounting.manage',
    'settings.security.manage',
    'settings.notifications.manage',
    'settings.integrations.manage',
    'settings.audit.view',
    'settings.subscription.manage'
  )
on conflict do nothing;


-- ============================================================
-- ADMIN
-- Strong operational administration.
-- No ownership/security/subscription/accounting-foundation power.
-- ============================================================

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
    'settings.view',
    'settings.company.manage',
    'settings.branding.manage',
    'settings.branches.manage',
    'settings.finance.view',
    'settings.notifications.manage',
    'settings.integrations.manage',
    'settings.audit.view'
  )
where r.role_name = 'admin'
on conflict do nothing;


-- ============================================================
-- MANAGER
-- Limited operational configuration.
-- ============================================================

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
    'settings.view',
    'settings.branches.manage',
    'settings.finance.view'
  )
where r.role_name = 'manager'
on conflict do nothing;
