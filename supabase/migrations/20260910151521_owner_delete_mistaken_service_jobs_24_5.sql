insert into public.permissions (permission_name)
select 'repair.delete'
where not exists (
  select 1 from public.permissions where permission_name = 'repair.delete'
);

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.permission_name = 'repair.delete'
where r.role_name = 'owner'
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id and rp.permission_id = p.id
  );

create or replace function public.delete_mistaken_service_job(
  p_job_id uuid,
  p_reason text default 'Created in error'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_job public.service_job%rowtype;
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  v_company_id := public.current_company_id();

  if not exists (
    select 1
    from public.user_profile up
    where up.user_id = auth.uid()
      and up.company_id = v_company_id
      and up.role = 'owner'
  ) then
    raise exception 'Only the company owner can delete a mistaken job card.';
  end if;

  if not public.current_user_has_permission('repair.delete') then
    raise exception 'Permission denied: repair.delete';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'Deletion reason is required.';
  end if;

  select * into v_job
  from public.service_job
  where id = p_job_id
    and company_id = v_company_id
  for update;

  if not found then
    raise exception 'Job card could not be found.';
  end if;

  if v_job.status <> 'received' then
    raise exception 'Only job cards still in Received status can be deleted. Use cancellation for jobs that have entered the workflow.';
  end if;

  if v_job.invoice_id is not null
     or v_job.repair_started_at is not null
     or v_job.technical_completed_at is not null
     or v_job.collection_confirmed_at is not null
     or v_job.quote_approved_at is not null then
    raise exception 'This job card has workflow or financial history and cannot be deleted. Cancel it instead.';
  end if;

  if exists (
    select 1 from public.service_job_line l where l.service_job_id = v_job.id
  ) then
    raise exception 'This job card already has repair lines and cannot be deleted. Cancel it instead.';
  end if;

  insert into public.audit_log(
    company_id,
    user_id,
    action,
    module,
    record_id,
    description,
    metadata
  ) values (
    v_company_id,
    auth.uid(),
    'service_job_deleted_mistake',
    'repairs',
    v_job.id,
    'Owner deleted a mistaken repair job card.',
    jsonb_build_object(
      'job_number', v_job.job_number,
      'customer_id', v_job.customer_id,
      'device_type', v_job.device_type,
      'brand', v_job.brand,
      'model', v_job.model,
      'reported_fault', v_job.reported_fault,
      'reason', v_reason,
      'previous_status', v_job.status
    )
  );

  delete from public.service_job where id = v_job.id;

  return jsonb_build_object(
    'ok', true,
    'deleted', true,
    'job_number', v_job.job_number,
    'reason', v_reason
  );
end;
$$;

revoke all on function public.delete_mistaken_service_job(uuid,text) from public;
revoke all on function public.delete_mistaken_service_job(uuid,text) from anon;
grant execute on function public.delete_mistaken_service_job(uuid,text) to authenticated;;
