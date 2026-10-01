-- ============================================================
-- JINLAB NEXUS EMAIL
-- Mailbox Management + Access Control
-- ============================================================

-- ------------------------------------------------------------
-- 1. EMAIL MANAGEMENT WORKSPACE
-- Owner/admin management view of mailboxes and access.
-- ------------------------------------------------------------

create or replace function public.get_email_management_workspace()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('email.manage') then
    raise exception 'Permission denied: email.manage';
  end if;

  v_company_id := public.current_company_id();

  if v_company_id is null then
    raise exception 'Company context could not be resolved.';
  end if;

  return jsonb_build_object(

    'accounts',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ea.id,
          'branch_id', ea.branch_id,
          'provider', ea.provider,
          'email_address', ea.email_address,
          'display_name', ea.display_name,
          'account_type', ea.account_type,
          'department', ea.department,
          'active', ea.active,
          'sync_enabled', ea.sync_enabled,
          'last_synced_at', ea.last_synced_at,
          'created_at', ea.created_at,
          'updated_at', ea.updated_at
        )
        order by ea.email_address
      )
      from public.email_account ea
      where ea.company_id = v_company_id
    ), '[]'::jsonb),

    'access',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', eaa.id,
          'account_id', eaa.account_id,
          'user_id', eaa.user_id,
          'access_level', eaa.access_level,
          'created_at', eaa.created_at
        )
        order by eaa.created_at
      )
      from public.email_account_access eaa
      where eaa.company_id = v_company_id
    ), '[]'::jsonb),

    'users',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', up.user_id,
          'role', up.role
        )
        order by up.role, up.user_id
      )
      from public.user_profile up
      where up.company_id = v_company_id
    ), '[]'::jsonb),

    'branches',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'company_id', b.company_id
        )
        order by b.id
      )
      from public.branch b
      where b.company_id = v_company_id
    ), '[]'::jsonb)

  );
end;
$$;
revoke all
on function public.get_email_management_workspace()
from public, anon;
grant execute
on function public.get_email_management_workspace()
to authenticated;
-- ------------------------------------------------------------
-- 2. CREATE / UPDATE MAILBOX
-- No provider credentials are stored here.
-- ------------------------------------------------------------

create or replace function public.email_manage_account(
  p_account_id uuid default null,
  p_email_address text default null,
  p_display_name text default null,
  p_account_type text default 'shared',
  p_department text default null,
  p_branch_id uuid default null,
  p_provider text default 'custom',
  p_active boolean default true,
  p_sync_enabled boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_account_id uuid;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('email.manage') then
    raise exception 'Permission denied: email.manage';
  end if;

  v_company_id := public.current_company_id();

  if v_company_id is null then
    raise exception 'Company context could not be resolved.';
  end if;

  v_email := lower(btrim(coalesce(p_email_address, '')));

  if v_email = '' then
    raise exception 'Email address is required.';
  end if;

  if position('@' in v_email) <= 1 then
    raise exception 'Invalid email address.';
  end if;

  if p_account_type not in ('shared', 'personal', 'department') then
    raise exception 'Invalid mailbox account type.';
  end if;

  if p_provider not in ('custom', 'google', 'microsoft', 'smtp_imap') then
    raise exception 'Invalid email provider.';
  end if;

  if p_branch_id is not null
     and not exists (
       select 1
       from public.branch b
       where b.id = p_branch_id
         and b.company_id = v_company_id
     ) then
    raise exception 'Branch does not belong to this company.';
  end if;

  if p_account_id is null then

    insert into public.email_account (
      company_id,
      branch_id,
      provider,
      email_address,
      display_name,
      account_type,
      department,
      active,
      sync_enabled,
      created_by
    )
    values (
      v_company_id,
      p_branch_id,
      p_provider,
      v_email,
      nullif(btrim(coalesce(p_display_name, '')), ''),
      p_account_type,
      nullif(btrim(coalesce(p_department, '')), ''),
      p_active,
      p_sync_enabled,
      auth.uid()
    )
    returning id into v_account_id;

  else

    if not exists (
      select 1
      from public.email_account ea
      where ea.id = p_account_id
        and ea.company_id = v_company_id
    ) then
      raise exception 'Email account could not be found.';
    end if;

    update public.email_account
    set
      branch_id = p_branch_id,
      provider = p_provider,
      email_address = v_email,
      display_name = nullif(btrim(coalesce(p_display_name, '')), ''),
      account_type = p_account_type,
      department = nullif(btrim(coalesce(p_department, '')), ''),
      active = p_active,
      sync_enabled = p_sync_enabled,
      updated_at = clock_timestamp()
    where id = p_account_id
      and company_id = v_company_id
    returning id into v_account_id;

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
    case
      when p_account_id is null
        then 'email_account_created'
      else 'email_account_updated'
    end,
    'email',
    v_account_id,
    case
      when p_account_id is null
        then 'Email mailbox created.'
      else 'Email mailbox updated.'
    end,
    jsonb_build_object(
      'email_address', v_email,
      'branch_id', p_branch_id,
      'account_type', p_account_type,
      'provider', p_provider,
      'active', p_active,
      'sync_enabled', p_sync_enabled
    )
  );

  return v_account_id;
end;
$$;
revoke all
on function public.email_manage_account(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  text,
  boolean,
  boolean
)
from public, anon;
grant execute
on function public.email_manage_account(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  text,
  boolean,
  boolean
)
to authenticated;
-- ------------------------------------------------------------
-- 3. ASSIGN / UPDATE MAILBOX ACCESS
-- ------------------------------------------------------------

create or replace function public.email_manage_account_access(
  p_account_id uuid,
  p_user_id uuid,
  p_access_level text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_access_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('email.manage') then
    raise exception 'Permission denied: email.manage';
  end if;

  v_company_id := public.current_company_id();

  if v_company_id is null then
    raise exception 'Company context could not be resolved.';
  end if;

  if p_access_level not in ('read', 'send', 'manage') then
    raise exception 'Invalid mailbox access level.';
  end if;

  if not exists (
    select 1
    from public.email_account ea
    where ea.id = p_account_id
      and ea.company_id = v_company_id
  ) then
    raise exception 'Email account could not be found.';
  end if;

  if not exists (
    select 1
    from public.user_profile up
    where up.user_id = p_user_id
      and up.company_id = v_company_id
  ) then
    raise exception 'User does not belong to this company.';
  end if;

  insert into public.email_account_access (
    company_id,
    account_id,
    user_id,
    access_level,
    created_by
  )
  values (
    v_company_id,
    p_account_id,
    p_user_id,
    p_access_level,
    auth.uid()
  )
  on conflict (company_id, account_id, user_id)
  do update
  set access_level = excluded.access_level
  returning id into v_access_id;

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
    'email_access_updated',
    'email',
    v_access_id,
    'Email mailbox access updated.',
    jsonb_build_object(
      'account_id', p_account_id,
      'target_user_id', p_user_id,
      'access_level', p_access_level
    )
  );

  return v_access_id;
end;
$$;
revoke all
on function public.email_manage_account_access(uuid, uuid, text)
from public, anon;
grant execute
on function public.email_manage_account_access(uuid, uuid, text)
to authenticated;
-- ------------------------------------------------------------
-- 4. REMOVE MAILBOX ACCESS
-- ------------------------------------------------------------

create or replace function public.email_remove_account_access(
  p_account_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_deleted_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('email.manage') then
    raise exception 'Permission denied: email.manage';
  end if;

  v_company_id := public.current_company_id();

  if v_company_id is null then
    raise exception 'Company context could not be resolved.';
  end if;

  delete from public.email_account_access
  where company_id = v_company_id
    and account_id = p_account_id
    and user_id = p_user_id
  returning id into v_deleted_id;

  if v_deleted_id is null then
    return false;
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
    'email_access_removed',
    'email',
    v_deleted_id,
    'Email mailbox access removed.',
    jsonb_build_object(
      'account_id', p_account_id,
      'target_user_id', p_user_id
    )
  );

  return true;
end;
$$;
revoke all
on function public.email_remove_account_access(uuid, uuid)
from public, anon;
grant execute
on function public.email_remove_account_access(uuid, uuid)
to authenticated;
-- ------------------------------------------------------------
-- 5. SECURITY COMMENTS
-- ------------------------------------------------------------

comment on function public.get_email_management_workspace() is
  'Management-only Nexus Email mailbox and access workspace.';
comment on function public.email_manage_account(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  text,
  boolean,
  boolean
) is
  'Creates or updates a company-controlled Nexus mailbox. Provider credentials are not stored by this RPC.';
comment on function public.email_manage_account_access(
  uuid,
  uuid,
  text
) is
  'Assigns read, send or manage access to a Nexus mailbox.';
comment on function public.email_remove_account_access(
  uuid,
  uuid
) is
  'Removes a user from a Nexus mailbox.';
