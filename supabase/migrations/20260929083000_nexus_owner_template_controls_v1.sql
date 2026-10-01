-- ============================================================
-- JINLAB Nexus
-- Owner Template Controls v1
-- Trash / Restore / Safe Permanent Delete
-- ============================================================

create or replace function public.communication_owner_trash_template(
  p_template_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_template public.communication_template;
  v_paused_series integer := 0;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_is_owner() then
    raise exception 'Owner access required';
  end if;

  select *
  into v_template
  from public.communication_template t
  where t.id = p_template_id
    and t.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Template not found';
  end if;

  if v_template.deleted_at is not null then
    return jsonb_build_object(
      'ok', true,
      'status', 'already_trashed',
      'template_id', p_template_id
    );
  end if;

  update public.communication_template
  set status = 'archived',
      deleted_at = now(),
      deleted_by = v_user_id,
      updated_at = now()
  where id = p_template_id
    and company_id = v_company_id;

  -- Safety:
  -- A trashed template must not keep generating recurring emails.
  update public.marketing_campaign_series
  set enabled = false,
      status = 'paused',
      updated_by = v_user_id,
      updated_at = now()
  where company_id = v_company_id
    and template_id = p_template_id
    and deleted_at is null
    and status = 'active';

  get diagnostics v_paused_series = row_count;

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
    v_user_id,
    'trash',
    'email_templates',
    p_template_id,
    'Owner moved email template to Trash',
    jsonb_build_object(
      'template_id', p_template_id,
      'template_name', v_template.name,
      'paused_recurring_series', v_paused_series
    )
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'trashed',
    'template_id', p_template_id,
    'paused_recurring_series', v_paused_series
  );
end;
$$;


create or replace function public.communication_owner_restore_template(
  p_template_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_template public.communication_template;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_is_owner() then
    raise exception 'Owner access required';
  end if;

  select *
  into v_template
  from public.communication_template t
  where t.id = p_template_id
    and t.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Template not found';
  end if;

  if v_template.deleted_at is null then
    return jsonb_build_object(
      'ok', true,
      'status', 'already_restored',
      'template_id', p_template_id
    );
  end if;

  update public.communication_template
  set deleted_at = null,
      deleted_by = null,
      status = 'archived',
      updated_at = now()
  where id = p_template_id
    and company_id = v_company_id;

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
    v_user_id,
    'restore',
    'email_templates',
    p_template_id,
    'Owner restored email template from Trash',
    jsonb_build_object(
      'template_id', p_template_id,
      'template_name', v_template.name
    )
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'restored',
    'template_id', p_template_id
  );
end;
$$;


create or replace function public.communication_owner_delete_template(
  p_template_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_template public.communication_template;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_is_owner() then
    raise exception 'Owner access required';
  end if;

  select *
  into v_template
  from public.communication_template t
  where t.id = p_template_id
    and t.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Template not found';
  end if;

  if v_template.deleted_at is null then
    raise exception 'Move the template to Trash before permanent deletion';
  end if;

  if exists (
    select 1
    from public.email_campaign c
    where c.company_id = v_company_id
      and c.template_id = p_template_id
  ) then
    raise exception
      'This template is linked to email campaigns and cannot be permanently deleted';
  end if;

  if exists (
    select 1
    from public.marketing_campaign_series s
    where s.company_id = v_company_id
      and s.template_id = p_template_id
  ) then
    raise exception
      'This template is linked to recurring campaigns and cannot be permanently deleted';
  end if;

  if exists (
    select 1
    from public.communication_rule r
    where r.company_id = v_company_id
      and r.template_id = p_template_id
  ) then
    raise exception
      'This template is linked to automation rules and cannot be permanently deleted';
  end if;

  if exists (
    select 1
    from public.communication_template_version tv
    join public.email_bulk_batch b
      on b.company_id = tv.company_id
     and b.template_version_id = tv.id
    where tv.company_id = v_company_id
      and tv.template_id = p_template_id
  ) then
    raise exception
      'This template is linked to bulk email history and cannot be permanently deleted';
  end if;

  if exists (
    select 1
    from public.communication_template_version tv
    join public.communication_send_job j
      on j.company_id = tv.company_id
     and j.template_version_id = tv.id
    where tv.company_id = v_company_id
      and tv.template_id = p_template_id
  ) then
    raise exception
      'This template is linked to delivery history and cannot be permanently deleted';
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
    v_user_id,
    'permanent_delete',
    'email_templates',
    p_template_id,
    'Owner permanently deleted unused email template',
    jsonb_build_object(
      'template_id', p_template_id,
      'template_name', v_template.name
    )
  );

  delete from public.communication_template
  where id = p_template_id
    and company_id = v_company_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'deleted',
    'template_id', p_template_id
  );
end;
$$;


revoke all
on function public.communication_owner_trash_template(uuid)
from public, anon;

revoke all
on function public.communication_owner_restore_template(uuid)
from public, anon;

revoke all
on function public.communication_owner_delete_template(uuid)
from public, anon;

grant execute
on function public.communication_owner_trash_template(uuid)
to authenticated;

grant execute
on function public.communication_owner_restore_template(uuid)
to authenticated;

grant execute
on function public.communication_owner_delete_template(uuid)
to authenticated;
