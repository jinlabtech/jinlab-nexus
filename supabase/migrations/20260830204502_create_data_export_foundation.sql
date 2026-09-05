-- ============================================================
-- JINLAB NEXUS
-- Sprint 18.15
-- Data Ownership & Portable Export Foundation
-- ============================================================


-- ============================================================
-- 1. EXPORT PERMISSIONS
-- ============================================================

insert into public.permissions (permission_name)
values
  ('data.export'),
  ('data.backup'),
  ('data.export.audit')
on conflict (permission_name) do nothing;


-- Owner receives full data portability authority.
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
and p.permission_name in (
  'data.export',
  'data.backup',
  'data.export.audit'
)
on conflict (role_id, permission_id) do nothing;


-- Admin may perform ordinary exports,
-- but full backup authority remains owner-only.
insert into public.role_permissions (
  role_id,
  permission_id
)
select
  r.id,
  p.id
from public.roles r
cross join public.permissions p
where r.role_name = 'admin'
and p.permission_name in (
  'data.export'
)
on conflict (role_id, permission_id) do nothing;


-- ============================================================
-- 2. EXPORT JOB TABLE
-- ============================================================

create table if not exists public.company_export_job (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  requested_by uuid not null
    references auth.users(id)
    on delete restrict,

  export_type text not null
    check (
      export_type in (
        'business_data',
        'full_backup',
        'migration_package'
      )
    ),

  export_format text not null
    check (
      export_format in (
        'csv',
        'json',
        'zip',
        'postgresql'
      )
    ),

  status text not null default 'requested'
    check (
      status in (
        'requested',
        'processing',
        'completed',
        'failed',
        'expired'
      )
    ),

  include_documents boolean not null default false,

  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,

  file_path text,
  file_size_bytes bigint,

  checksum_sha256 text,

  schema_version text not null default '1.0',

  error_message text,

  metadata jsonb not null default '{}'::jsonb
);


create index if not exists
company_export_job_company_idx
on public.company_export_job (
  company_id,
  requested_at desc
);


create index if not exists
company_export_job_status_idx
on public.company_export_job (
  company_id,
  status
);


-- ============================================================
-- 3. RLS
-- ============================================================

alter table public.company_export_job
enable row level security;


drop policy if exists
"company members can read permitted export jobs"
on public.company_export_job;


create policy
"company members can read permitted export jobs"
on public.company_export_job
for select
to authenticated
using (
  company_id = public.current_settings_company_id()
  and (
    public.current_user_has_permission(
      'data.export'
    )
    or
    public.current_user_has_permission(
      'data.backup'
    )
    or
    public.current_user_has_permission(
      'data.export.audit'
    )
  )
);


-- No direct INSERT / UPDATE / DELETE policy.
-- Export jobs must be created through secure RPCs.


-- ============================================================
-- 4. REQUEST EXPORT RPC
-- ============================================================

create or replace function public.request_company_export(
  p_export_type text,
  p_export_format text,
  p_include_documents boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_job_id uuid;
begin

  v_company_id :=
    public.current_settings_company_id();

  if v_company_id is null then
    raise exception
      'No company is assigned to the current user.';
  end if;


  if p_export_type not in (
    'business_data',
    'full_backup',
    'migration_package'
  ) then
    raise exception
      'Invalid export type.';
  end if;


  if p_export_format not in (
    'csv',
    'json',
    'zip',
    'postgresql'
  ) then
    raise exception
      'Invalid export format.';
  end if;


  -- Ordinary business export
  if p_export_type = 'business_data' then

    if not public.current_user_has_permission(
      'data.export'
    ) then
      raise exception
        'Permission denied: data.export';
    end if;

  else

    -- Full backups and migration packages
    -- are deliberately more sensitive.

    if not public.current_user_has_permission(
      'data.backup'
    ) then
      raise exception
        'Permission denied: data.backup';
    end if;

  end if;


  insert into public.company_export_job (
    company_id,
    requested_by,
    export_type,
    export_format,
    include_documents,
    metadata
  )
  values (
    v_company_id,
    auth.uid(),
    p_export_type,
    p_export_format,
    coalesce(
      p_include_documents,
      false
    ),
    jsonb_build_object(
      'requested_from',
      'nexus_settings',
      'version',
      '1.0'
    )
  )
  returning id
  into v_job_id;


  perform public.log_settings_change(
    v_company_id,
    'data_portability',
    'export_requested',
    jsonb_build_object(
      'export_job_id',
      v_job_id,
      'export_type',
      p_export_type,
      'export_format',
      p_export_format,
      'include_documents',
      coalesce(
        p_include_documents,
        false
      )
    )
  );


  return v_job_id;
end;
$$;


-- ============================================================
-- 5. CANCEL PENDING EXPORT
-- ============================================================

create or replace function public.cancel_company_export(
  p_export_job_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_export_type text;
begin

  v_company_id :=
    public.current_settings_company_id();


  select export_type
  into v_export_type
  from public.company_export_job
  where id = p_export_job_id
    and company_id = v_company_id
    and status = 'requested';


  if v_export_type is null then
    raise exception
      'Pending export job not found.';
  end if;


  if v_export_type = 'business_data' then

    if not public.current_user_has_permission(
      'data.export'
    ) then
      raise exception
        'Permission denied: data.export';
    end if;

  else

    if not public.current_user_has_permission(
      'data.backup'
    ) then
      raise exception
        'Permission denied: data.backup';
    end if;

  end if;


  update public.company_export_job
  set
    status = 'failed',
    error_message =
      'Cancelled by authorised user.'
  where id = p_export_job_id
    and company_id = v_company_id;


  perform public.log_settings_change(
    v_company_id,
    'data_portability',
    'export_cancelled',
    jsonb_build_object(
      'export_job_id',
      p_export_job_id
    )
  );
end;
$$;


-- ============================================================
-- 6. EXECUTE PRIVILEGES
-- ============================================================

revoke all on function
public.request_company_export(
  text,
  text,
  boolean
)
from public;


revoke all on function
public.cancel_company_export(uuid)
from public;


grant execute on function
public.request_company_export(
  text,
  text,
  boolean
)
to authenticated;


grant execute on function
public.cancel_company_export(uuid)
to authenticated;
