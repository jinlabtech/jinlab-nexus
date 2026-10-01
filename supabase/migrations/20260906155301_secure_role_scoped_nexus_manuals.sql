-- JINLAB Nexus secure role-scoped manuals

-- Permissions
insert into public.permissions (permission_name)
values
  ('help.manual.download'),
  ('help.manual.manage')
on conflict (permission_name) do nothing;

-- Help should be safe for every normal Nexus role because content is role-scoped.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.permission_name = 'help.view'
where r.role_name in ('owner','admin','manager','cashier','employee','technician','viewer')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.permission_name = 'help.manual.download'
where r.role_name in ('owner','admin','manager','cashier','employee','technician','viewer')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.permission_name = 'help.manual.manage'
where r.role_name in ('owner','admin')
on conflict do nothing;

-- Manual catalogue. Files themselves live in a PRIVATE Storage bucket.
create table if not exists public.nexus_manual_release (
  id uuid primary key default gen_random_uuid(),
  manual_key text not null unique,
  audience_role text not null check (
    audience_role in ('owner','admin','manager','cashier','employee','technician','viewer')
  ),
  title text not null,
  summary text not null,
  object_path text not null unique,
  product_version text not null,
  sprint_version text not null,
  updated_on date not null default current_date,
  is_active boolean not null default true,
  security_note text not null default 'Operational guidance only. No secrets, database internals, bypass instructions, or security implementation details.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nexus_manual_release_active_role_idx
  on public.nexus_manual_release (audience_role, is_active);

alter table public.nexus_manual_release enable row level security;

-- Do not expose the manual catalogue directly. Access is through SECURITY DEFINER RPCs.
revoke all on public.nexus_manual_release from anon, authenticated;

create table if not exists public.nexus_manual_download_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.company(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_at_download text not null,
  manual_release_id uuid not null references public.nexus_manual_release(id) on delete restrict,
  manual_key text not null,
  sprint_version text not null,
  downloaded_at timestamptz not null default now()
);

create index if not exists nexus_manual_download_audit_company_idx
  on public.nexus_manual_download_audit (company_id, downloaded_at desc);

create index if not exists nexus_manual_download_audit_user_idx
  on public.nexus_manual_download_audit (user_id, downloaded_at desc);

alter table public.nexus_manual_download_audit enable row level security;
revoke all on public.nexus_manual_download_audit from anon, authenticated;

-- Owner/admin may review download audit through normal SELECT when permitted.
drop policy if exists "Owner and admin can view manual download audit" on public.nexus_manual_download_audit;
create policy "Owner and admin can view manual download audit"
on public.nexus_manual_download_audit
for select
to authenticated
using (
  public.current_user_has_permission('help.manual.manage')
  and company_id = public.current_company_id()
);

grant select on public.nexus_manual_download_audit to authenticated;

-- Private bucket. No object SELECT policy is created for authenticated users.
-- Therefore normal users cannot download objects directly even if they guess the path.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'nexus-manuals',
  'nexus-manuals',
  false,
  20971520,
  array['application/pdf']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Stable per-role manual paths. Future sprints replace the file at the same path
-- and update the metadata below.
insert into public.nexus_manual_release (
  manual_key,
  audience_role,
  title,
  summary,
  object_path,
  product_version,
  sprint_version,
  updated_on,
  is_active
)
values
  ('owner', 'owner', 'JINLAB Nexus Owner Manual',
   'Owner-level operating, financial and governance guidance without secrets or bypass instructions.',
   'owner/JINLAB_Nexus_Owner_Manual.pdf', 'Alpha 0.2', 'Sprint 20.3', current_date, true),
  ('admin', 'admin', 'JINLAB Nexus Admin Manual',
   'Administration, users, branches, configuration and operational controls without backend internals.',
   'admin/JINLAB_Nexus_Admin_Manual.pdf', 'Alpha 0.2', 'Sprint 20.3', current_date, true),
  ('manager', 'manager', 'JINLAB Nexus Manager Manual',
   'Branch supervision, sales, cash-up review and authorised operational workflows.',
   'manager/JINLAB_Nexus_Manager_Manual.pdf', 'Alpha 0.2', 'Sprint 20.3', current_date, true),
  ('cashier', 'cashier', 'JINLAB Nexus Cashier Manual',
   'POS checkout, till handling, payments and customer-facing steps only.',
   'cashier/JINLAB_Nexus_Cashier_Manual.pdf', 'Alpha 0.2', 'Sprint 20.3', current_date, true),
  ('employee', 'employee', 'JINLAB Nexus Employee Manual',
   'Everyday permitted operational tasks and safe system usage.',
   'employee/JINLAB_Nexus_Employee_Manual.pdf', 'Alpha 0.2', 'Sprint 20.3', current_date, true),
  ('technician', 'technician', 'JINLAB Nexus Technician Manual',
   'Inventory-aware technician workflow, customer lookup and authorised stock activity.',
   'technician/JINLAB_Nexus_Technician_Manual.pdf', 'Alpha 0.2', 'Sprint 20.3', current_date, true),
  ('viewer', 'viewer', 'JINLAB Nexus Viewer Manual',
   'Read-only navigation, reports and safe viewing guidance.',
   'viewer/JINLAB_Nexus_Viewer_Manual.pdf', 'Alpha 0.2', 'Sprint 20.3', current_date, true)
on conflict (manual_key) do update
set
  audience_role = excluded.audience_role,
  title = excluded.title,
  summary = excluded.summary,
  object_path = excluded.object_path,
  product_version = excluded.product_version,
  sprint_version = excluded.sprint_version,
  updated_on = excluded.updated_on,
  is_active = excluded.is_active,
  updated_at = now();

create or replace function public.nexus_manual_role_can_access(
  p_requester_role text,
  p_audience_role text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case lower(coalesce(p_requester_role,''))
    when 'owner' then p_audience_role in ('owner','admin','manager','cashier','employee','technician','viewer')
    when 'admin' then p_audience_role in ('admin','manager','cashier','employee','technician','viewer')
    when 'manager' then p_audience_role in ('manager','cashier','employee','technician','viewer')
    when 'cashier' then p_audience_role = 'cashier'
    when 'employee' then p_audience_role = 'employee'
    when 'technician' then p_audience_role = 'technician'
    when 'viewer' then p_audience_role = 'viewer'
    else false
  end;
$$;

create or replace function public.get_available_nexus_manuals()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_company_id uuid;
  v_manuals jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('help.view')
     or not public.current_user_has_permission('help.manual.download') then
    raise exception 'Permission denied: help.manual.download';
  end if;

  v_company_id := public.current_company_id();

  select lower(coalesce(up.role,'employee'))
  into v_role
  from public.user_profile up
  where up.user_id = auth.uid()
    and up.company_id = v_company_id
  limit 1;

  if v_role is null then
    raise exception 'User role could not be resolved.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'manual_key', m.manual_key,
        'audience_role', m.audience_role,
        'title', m.title,
        'summary', m.summary,
        'product_version', m.product_version,
        'sprint_version', m.sprint_version,
        'updated_on', m.updated_on,
        'security_note', m.security_note
      )
      order by
        case m.audience_role
          when v_role then 0
          when 'cashier' then 10
          when 'employee' then 20
          when 'technician' then 30
          when 'viewer' then 40
          when 'manager' then 50
          when 'admin' then 60
          when 'owner' then 70
          else 100
        end,
        m.title
    ),
    '[]'::jsonb
  )
  into v_manuals
  from public.nexus_manual_release m
  where m.is_active = true
    and public.nexus_manual_role_can_access(v_role, m.audience_role);

  return jsonb_build_object(
    'ok', true,
    'current_role', v_role,
    'manuals', v_manuals,
    'security_message', 'Manuals are role-scoped. Higher-privilege operating information is not exposed to lower roles.'
  );
end;
$$;

grant execute on function public.get_available_nexus_manuals() to authenticated;

create or replace function public.authorize_nexus_manual_download(
  p_manual_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_company_id uuid;
  v_manual public.nexus_manual_release%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('help.view')
     or not public.current_user_has_permission('help.manual.download') then
    raise exception 'Permission denied: help.manual.download';
  end if;

  v_company_id := public.current_company_id();

  select lower(coalesce(up.role,'employee'))
  into v_role
  from public.user_profile up
  where up.user_id = auth.uid()
    and up.company_id = v_company_id
  limit 1;

  if v_role is null then
    raise exception 'User role could not be resolved.';
  end if;

  select *
  into v_manual
  from public.nexus_manual_release m
  where m.manual_key = lower(trim(coalesce(p_manual_key,'')))
    and m.is_active = true;

  if not found then
    raise exception 'Manual is not available.';
  end if;

  if not public.nexus_manual_role_can_access(v_role, v_manual.audience_role) then
    raise exception 'This manual is not available for your role.';
  end if;

  insert into public.nexus_manual_download_audit (
    company_id,
    user_id,
    role_at_download,
    manual_release_id,
    manual_key,
    sprint_version
  )
  values (
    v_company_id,
    auth.uid(),
    v_role,
    v_manual.id,
    v_manual.manual_key,
    v_manual.sprint_version
  );

  return jsonb_build_object(
    'ok', true,
    'manual_key', v_manual.manual_key,
    'audience_role', v_manual.audience_role,
    'title', v_manual.title,
    'object_path', v_manual.object_path,
    'product_version', v_manual.product_version,
    'sprint_version', v_manual.sprint_version,
    'updated_on', v_manual.updated_on,
    'download_name', replace(v_manual.title, ' ', '_') || '.pdf'
  );
end;
$$;

grant execute on function public.authorize_nexus_manual_download(text) to authenticated;
;
