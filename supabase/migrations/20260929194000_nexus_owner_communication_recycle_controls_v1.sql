-- =========================================================
-- JINLAB Nexus
-- Owner communication recycle controls
-- Campaigns / Recurring Schedules / Bulk Email
-- =========================================================


-- =========================================================
-- MARKETING CAMPAIGN: TRASH
-- =========================================================

create or replace function public.marketing_owner_trash_campaign(
  p_campaign_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_campaign public.email_campaign%rowtype;
  v_cancelled_jobs integer := 0;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_is_owner() then
    raise exception 'Owner access required';
  end if;

  select *
  into v_campaign
  from public.email_campaign c
  where c.id = p_campaign_id
    and c.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Campaign not found';
  end if;

  if v_campaign.deleted_at is not null then
    return jsonb_build_object(
      'ok', true,
      'status', 'already_trashed'
    );
  end if;

  if exists (
    select 1
    from public.communication_send_job j
    where j.company_id = v_company_id
      and j.source_type = 'email_campaign'
      and j.source_id = p_campaign_id
      and j.status in ('processing', 'sending')
  ) then
    raise exception
      'Campaign is actively sending. Wait for active sends to finish before moving it to the Recycle Bin';
  end if;

  update public.communication_send_job
  set status = 'cancelled',
      claim_token = null,
      claimed_at = null,
      lease_expires_at = null,
      updated_at = now()
  where company_id = v_company_id
    and source_type = 'email_campaign'
    and source_id = p_campaign_id
    and status = 'queued';

  get diagnostics v_cancelled_jobs = row_count;

  update public.email_campaign
  set settings =
        coalesce(settings, '{}'::jsonb)
        ||
        jsonb_build_object(
          '_owner_trash',
          jsonb_build_object(
            'status', v_campaign.status,
            'trashed_at', now()
          )
        ),
      status =
        case
          when v_campaign.status in ('scheduled', 'processing')
            then 'cancelled'
          else v_campaign.status
        end,
      deleted_at = now(),
      deleted_by = v_user_id,
      updated_at = now()
  where id = p_campaign_id
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
    'trash',
    'email_marketing',
    p_campaign_id,
    'Marketing campaign moved to Recycle Bin',
    jsonb_build_object(
      'campaign_name', v_campaign.name,
      'previous_status', v_campaign.status,
      'cancelled_queued_jobs', v_cancelled_jobs
    )
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'trashed',
    'cancelled_queued_jobs', v_cancelled_jobs
  );
end;
$$;


-- =========================================================
-- MARKETING CAMPAIGN: RESTORE
-- =========================================================

create or replace function public.marketing_owner_restore_campaign(
  p_campaign_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_campaign public.email_campaign%rowtype;
  v_original_status text;
  v_restore_status text;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_is_owner() then
    raise exception 'Owner access required';
  end if;

  select *
  into v_campaign
  from public.email_campaign c
  where c.id = p_campaign_id
    and c.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Campaign not found';
  end if;

  if v_campaign.deleted_at is null then
    return jsonb_build_object(
      'ok', true,
      'status', 'already_restored'
    );
  end if;

  v_original_status :=
    coalesce(
      v_campaign.settings #>> '{_owner_trash,status}',
      v_campaign.status
    );

  v_restore_status :=
    case
      when v_original_status in (
        'draft',
        'ready',
        'paused',
        'completed',
        'failed',
        'cancelled'
      )
        then v_original_status

      -- Scheduled / processing jobs were cancelled while trashed.
      -- Do not silently restart them.
      else 'cancelled'
    end;

  update public.email_campaign
  set status = v_restore_status,
      settings =
        coalesce(settings, '{}'::jsonb)
        - '_owner_trash',
      deleted_at = null,
      deleted_by = null,
      updated_at = now()
  where id = p_campaign_id
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
    'email_marketing',
    p_campaign_id,
    'Marketing campaign restored from Recycle Bin',
    jsonb_build_object(
      'campaign_name', v_campaign.name,
      'restored_status', v_restore_status
    )
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'restored',
    'campaign_status', v_restore_status
  );
end;
$$;


-- =========================================================
-- MARKETING CAMPAIGN: PERMANENT DELETE
-- =========================================================

create or replace function public.marketing_owner_delete_campaign(
  p_campaign_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_campaign public.email_campaign%rowtype;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_is_owner() then
    raise exception 'Owner access required';
  end if;

  select *
  into v_campaign
  from public.email_campaign c
  where c.id = p_campaign_id
    and c.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Campaign not found';
  end if;

  if v_campaign.deleted_at is null then
    raise exception
      'Campaign must be in the Recycle Bin before permanent deletion';
  end if;

  if exists (
    select 1
    from public.communication_send_job j
    where j.company_id = v_company_id
      and j.source_type = 'email_campaign'
      and j.source_id = p_campaign_id
  ) then
    raise exception
      'Campaign cannot be permanently deleted because send history exists';
  end if;

  if exists (
    select 1
    from public.marketing_campaign_series_run r
    where r.company_id = v_company_id
      and r.campaign_id = p_campaign_id
  ) then
    raise exception
      'Campaign cannot be permanently deleted because recurring campaign history depends on it';
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
    'email_marketing',
    p_campaign_id,
    'Unused marketing campaign permanently deleted',
    jsonb_build_object(
      'campaign_name', v_campaign.name
    )
  );

  delete from public.email_campaign
  where id = p_campaign_id
    and company_id = v_company_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'deleted'
  );
end;
$$;


-- =========================================================
-- RECURRING SCHEDULE: TRASH
-- =========================================================

create or replace function public.marketing_owner_trash_recurring_series(
  p_series_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_series public.marketing_campaign_series%rowtype;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_is_owner() then
    raise exception 'Owner access required';
  end if;

  select *
  into v_series
  from public.marketing_campaign_series s
  where s.id = p_series_id
    and s.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Recurring schedule not found';
  end if;

  if v_series.deleted_at is not null then
    return jsonb_build_object(
      'ok', true,
      'status', 'already_trashed'
    );
  end if;

  update public.marketing_campaign_series
  set settings =
        coalesce(settings, '{}'::jsonb)
        ||
        jsonb_build_object(
          '_owner_trash',
          jsonb_build_object(
            'status', v_series.status,
            'enabled', v_series.enabled,
            'trashed_at', now()
          )
        ),
      enabled = false,
      status =
        case
          when v_series.status = 'active'
            then 'paused'
          else v_series.status
        end,
      deleted_at = now(),
      deleted_by = v_user_id,
      updated_by = v_user_id,
      updated_at = now()
  where id = p_series_id
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
    'trash',
    'email_schedules',
    p_series_id,
    'Recurring email schedule moved to Recycle Bin',
    jsonb_build_object(
      'schedule_name', v_series.name,
      'previous_status', v_series.status,
      'previous_enabled', v_series.enabled
    )
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'trashed'
  );
end;
$$;


-- =========================================================
-- RECURRING SCHEDULE: RESTORE
-- =========================================================

create or replace function public.marketing_owner_restore_recurring_series(
  p_series_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_series public.marketing_campaign_series%rowtype;
  v_original_status text;
  v_restore_status text;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_is_owner() then
    raise exception 'Owner access required';
  end if;

  select *
  into v_series
  from public.marketing_campaign_series s
  where s.id = p_series_id
    and s.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Recurring schedule not found';
  end if;

  if v_series.deleted_at is null then
    return jsonb_build_object(
      'ok', true,
      'status', 'already_restored'
    );
  end if;

  v_original_status :=
    coalesce(
      v_series.settings #>> '{_owner_trash,status}',
      v_series.status
    );

  v_restore_status :=
    case
      -- Active schedules return paused so restoring never
      -- silently resumes automatic email sending.
      when v_original_status = 'active'
        then 'paused'

      when v_original_status in (
        'paused',
        'completed',
        'cancelled',
        'failed'
      )
        then v_original_status

      else 'paused'
    end;

  update public.marketing_campaign_series
  set enabled = false,
      status = v_restore_status,
      settings =
        coalesce(settings, '{}'::jsonb)
        - '_owner_trash',
      deleted_at = null,
      deleted_by = null,
      updated_by = v_user_id,
      updated_at = now()
  where id = p_series_id
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
    'email_schedules',
    p_series_id,
    'Recurring email schedule restored from Recycle Bin',
    jsonb_build_object(
      'schedule_name', v_series.name,
      'restored_status', v_restore_status,
      'enabled', false
    )
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'restored',
    'schedule_status', v_restore_status,
    'enabled', false
  );
end;
$$;


-- =========================================================
-- RECURRING SCHEDULE: PERMANENT DELETE
-- =========================================================

create or replace function public.marketing_owner_delete_recurring_series(
  p_series_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_series public.marketing_campaign_series%rowtype;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_is_owner() then
    raise exception 'Owner access required';
  end if;

  select *
  into v_series
  from public.marketing_campaign_series s
  where s.id = p_series_id
    and s.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Recurring schedule not found';
  end if;

  if v_series.deleted_at is null then
    raise exception
      'Recurring schedule must be in the Recycle Bin before permanent deletion';
  end if;

  if exists (
    select 1
    from public.marketing_campaign_series_run r
    where r.company_id = v_company_id
      and r.series_id = p_series_id
  ) then
    raise exception
      'Recurring schedule cannot be permanently deleted because run history exists';
  end if;

  if exists (
    select 1
    from public.email_campaign c
    where c.company_id = v_company_id
      and c.settings ->> 'recurring_series_id'
          = p_series_id::text
  ) then
    raise exception
      'Recurring schedule cannot be permanently deleted because campaign history depends on it';
  end if;

  if exists (
    select 1
    from public.communication_send_job j
    where j.company_id = v_company_id
      and j.variables ->> 'recurring_series_id'
          = p_series_id::text
  ) then
    raise exception
      'Recurring schedule cannot be permanently deleted because send history exists';
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
    'email_schedules',
    p_series_id,
    'Unused recurring email schedule permanently deleted',
    jsonb_build_object(
      'schedule_name', v_series.name
    )
  );

  delete from public.marketing_campaign_series
  where id = p_series_id
    and company_id = v_company_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'deleted'
  );
end;
$$;


-- =========================================================
-- BULK EMAIL: TRASH
-- =========================================================

create or replace function public.email_owner_trash_bulk_batch(
  p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_batch public.email_bulk_batch%rowtype;
  v_cancelled_jobs integer := 0;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_is_owner() then
    raise exception 'Owner access required';
  end if;

  select *
  into v_batch
  from public.email_bulk_batch b
  where b.id = p_batch_id
    and b.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Bulk email batch not found';
  end if;

  if v_batch.deleted_at is not null then
    return jsonb_build_object(
      'ok', true,
      'status', 'already_trashed'
    );
  end if;

  if exists (
    select 1
    from public.communication_send_job j
    where j.company_id = v_company_id
      and j.source_type = 'email_bulk_batch'
      and j.source_id = p_batch_id
      and j.status in ('processing', 'sending')
  ) then
    raise exception
      'Bulk email is actively sending. Wait for active sends to finish before moving it to the Recycle Bin';
  end if;

  update public.communication_send_job
  set status = 'cancelled',
      claim_token = null,
      claimed_at = null,
      lease_expires_at = null,
      updated_at = now()
  where company_id = v_company_id
    and source_type = 'email_bulk_batch'
    and source_id = p_batch_id
    and status = 'queued';

  get diagnostics v_cancelled_jobs = row_count;

  update public.email_bulk_batch
  set settings =
        coalesce(settings, '{}'::jsonb)
        ||
        jsonb_build_object(
          '_owner_trash',
          jsonb_build_object(
            'status', v_batch.status,
            'trashed_at', now()
          )
        ),
      status =
        case
          when v_batch.status in ('queued', 'processing')
            then 'cancelled'
          else v_batch.status
        end,
      deleted_at = now(),
      deleted_by = v_user_id,
      updated_at = now()
  where id = p_batch_id
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
    'trash',
    'bulk_email',
    p_batch_id,
    'Bulk email moved to Recycle Bin',
    jsonb_build_object(
      'batch_name', v_batch.name,
      'previous_status', v_batch.status,
      'cancelled_queued_jobs', v_cancelled_jobs
    )
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'trashed',
    'cancelled_queued_jobs', v_cancelled_jobs
  );
end;
$$;


-- =========================================================
-- BULK EMAIL: RESTORE
-- =========================================================

create or replace function public.email_owner_restore_bulk_batch(
  p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_batch public.email_bulk_batch%rowtype;
  v_original_status text;
  v_restore_status text;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_is_owner() then
    raise exception 'Owner access required';
  end if;

  select *
  into v_batch
  from public.email_bulk_batch b
  where b.id = p_batch_id
    and b.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Bulk email batch not found';
  end if;

  if v_batch.deleted_at is null then
    return jsonb_build_object(
      'ok', true,
      'status', 'already_restored'
    );
  end if;

  v_original_status :=
    coalesce(
      v_batch.settings #>> '{_owner_trash,status}',
      v_batch.status
    );

  v_restore_status :=
    case
      when v_original_status in (
        'draft',
        'completed',
        'cancelled',
        'failed'
      )
        then v_original_status

      -- Queued / processing sends were cancelled while trashed.
      else 'cancelled'
    end;

  update public.email_bulk_batch
  set status = v_restore_status,
      settings =
        coalesce(settings, '{}'::jsonb)
        - '_owner_trash',
      deleted_at = null,
      deleted_by = null,
      updated_at = now()
  where id = p_batch_id
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
    'bulk_email',
    p_batch_id,
    'Bulk email restored from Recycle Bin',
    jsonb_build_object(
      'batch_name', v_batch.name,
      'restored_status', v_restore_status
    )
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'restored',
    'batch_status', v_restore_status
  );
end;
$$;


-- =========================================================
-- BULK EMAIL: PERMANENT DELETE
-- =========================================================

create or replace function public.email_owner_delete_bulk_batch(
  p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_batch public.email_bulk_batch%rowtype;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_is_owner() then
    raise exception 'Owner access required';
  end if;

  select *
  into v_batch
  from public.email_bulk_batch b
  where b.id = p_batch_id
    and b.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Bulk email batch not found';
  end if;

  if v_batch.deleted_at is null then
    raise exception
      'Bulk email must be in the Recycle Bin before permanent deletion';
  end if;

  if exists (
    select 1
    from public.communication_send_job j
    where j.company_id = v_company_id
      and j.source_type = 'email_bulk_batch'
      and j.source_id = p_batch_id
  ) then
    raise exception
      'Bulk email cannot be permanently deleted because send history exists';
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
    'bulk_email',
    p_batch_id,
    'Unused bulk email permanently deleted',
    jsonb_build_object(
      'batch_name', v_batch.name
    )
  );

  delete from public.email_bulk_batch
  where id = p_batch_id
    and company_id = v_company_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'deleted'
  );
end;
$$;


-- =========================================================
-- GENERIC RECYCLE BIN RESTORE
-- =========================================================

create or replace function public.owner_recycle_bin_restore(
  p_item_type text,
  p_record_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.current_user_is_owner() then
    raise exception 'Owner access required';
  end if;

  case p_item_type

    when 'email_template' then
      return public.communication_owner_restore_template(
        p_record_id
      );

    when 'marketing_campaign' then
      return public.marketing_owner_restore_campaign(
        p_record_id
      );

    when 'recurring_campaign' then
      return public.marketing_owner_restore_recurring_series(
        p_record_id
      );

    when 'bulk_email' then
      return public.email_owner_restore_bulk_batch(
        p_record_id
      );

    else
      raise exception
        'Unsupported Recycle Bin item type: %',
        p_item_type;

  end case;
end;
$$;


-- =========================================================
-- GENERIC RECYCLE BIN PERMANENT DELETE
-- =========================================================

create or replace function public.owner_recycle_bin_permanent_delete(
  p_item_type text,
  p_record_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.current_user_is_owner() then
    raise exception 'Owner access required';
  end if;

  case p_item_type

    when 'email_template' then
      return public.communication_owner_delete_template(
        p_record_id
      );

    when 'marketing_campaign' then
      return public.marketing_owner_delete_campaign(
        p_record_id
      );

    when 'recurring_campaign' then
      return public.marketing_owner_delete_recurring_series(
        p_record_id
      );

    when 'bulk_email' then
      return public.email_owner_delete_bulk_batch(
        p_record_id
      );

    else
      raise exception
        'Unsupported Recycle Bin item type: %',
        p_item_type;

  end case;
end;
$$;


-- =========================================================
-- PRIVILEGES
-- =========================================================

revoke all on function
  public.marketing_owner_trash_campaign(uuid)
from public, anon, authenticated;

revoke all on function
  public.marketing_owner_restore_campaign(uuid)
from public, anon, authenticated;

revoke all on function
  public.marketing_owner_delete_campaign(uuid)
from public, anon, authenticated;

revoke all on function
  public.marketing_owner_trash_recurring_series(uuid)
from public, anon, authenticated;

revoke all on function
  public.marketing_owner_restore_recurring_series(uuid)
from public, anon, authenticated;

revoke all on function
  public.marketing_owner_delete_recurring_series(uuid)
from public, anon, authenticated;

revoke all on function
  public.email_owner_trash_bulk_batch(uuid)
from public, anon, authenticated;

revoke all on function
  public.email_owner_restore_bulk_batch(uuid)
from public, anon, authenticated;

revoke all on function
  public.email_owner_delete_bulk_batch(uuid)
from public, anon, authenticated;

revoke all on function
  public.owner_recycle_bin_restore(text, uuid)
from public, anon, authenticated;

revoke all on function
  public.owner_recycle_bin_permanent_delete(text, uuid)
from public, anon, authenticated;


grant execute on function
  public.marketing_owner_trash_campaign(uuid)
to authenticated;

grant execute on function
  public.marketing_owner_restore_campaign(uuid)
to authenticated;

grant execute on function
  public.marketing_owner_delete_campaign(uuid)
to authenticated;

grant execute on function
  public.marketing_owner_trash_recurring_series(uuid)
to authenticated;

grant execute on function
  public.marketing_owner_restore_recurring_series(uuid)
to authenticated;

grant execute on function
  public.marketing_owner_delete_recurring_series(uuid)
to authenticated;

grant execute on function
  public.email_owner_trash_bulk_batch(uuid)
to authenticated;

grant execute on function
  public.email_owner_restore_bulk_batch(uuid)
to authenticated;

grant execute on function
  public.email_owner_delete_bulk_batch(uuid)
to authenticated;

grant execute on function
  public.owner_recycle_bin_restore(text, uuid)
to authenticated;

grant execute on function
  public.owner_recycle_bin_permanent_delete(text, uuid)
to authenticated;
