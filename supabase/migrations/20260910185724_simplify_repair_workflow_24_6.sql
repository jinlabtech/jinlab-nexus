create or replace function public.receive_service_job_simple(
  p_branch_id uuid,
  p_customer_id uuid,
  p_device_type text,
  p_brand text default null,
  p_model text default null,
  p_serial_number text default null,
  p_imei text default null,
  p_device_condition text default null,
  p_accessories_received text default null,
  p_reported_fault text default null,
  p_assigned_employee_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_created jsonb;
  v_job_id uuid;
  v_job_number text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.create') then raise exception 'Permission denied: repair.create'; end if;
  if not public.current_user_has_permission('repair.intake.confirm') then raise exception 'Permission denied: repair.intake.confirm'; end if;

  v_created := public.create_service_job(
    p_branch_id,
    p_customer_id,
    p_device_type,
    p_brand,
    p_model,
    p_serial_number,
    p_imei,
    p_device_condition,
    p_accessories_received,
    p_reported_fault,
    p_assigned_employee_id
  );

  v_job_id := (v_created->>'id')::uuid;
  v_job_number := v_created->>'job_number';

  perform public.confirm_service_job_intake(
    v_job_id,
    'staff_received',
    v_job_number
  );

  return v_created || jsonb_build_object(
    'intake_confirmed', true,
    'workflow_stage', 'received'
  );
end;
$function$;

create or replace function public.approve_service_job_simple(
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_job public.service_job%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.quote.approve') then raise exception 'Permission denied: repair.quote.approve'; end if;

  v_company_id := public.current_company_id();
  select * into v_job
  from public.service_job
  where id = p_job_id and company_id = v_company_id
  for update;

  if not found then raise exception 'Job card could not be found.'; end if;
  if v_job.proposed_amount is null or v_job.proposed_amount < 0 then
    raise exception 'Technician price is required before approval.';
  end if;

  return public.approve_service_job_quote(
    p_job_id,
    v_job.proposed_amount,
    'confirmed_in_nexus',
    v_job.job_number
  );
end;
$function$;

create or replace function public.complete_service_job_simple(
  p_job_id uuid,
  p_work_summary text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_job public.service_job%rowtype;
  v_total numeric := 0;
  v_remaining numeric := 0;
  v_description text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.complete') then raise exception 'Permission denied: repair.complete'; end if;

  v_company_id := public.current_company_id();
  select * into v_job
  from public.service_job
  where id = p_job_id and company_id = v_company_id
  for update;

  if not found then raise exception 'Job card could not be found.'; end if;
  if v_job.status <> 'in_progress' then raise exception 'Repair must be in progress before completion.'; end if;
  if v_job.approved_amount is null then raise exception 'Approved price is required before completion.'; end if;

  select coalesce(sum(line_total),0)
  into v_total
  from public.service_job_line
  where company_id = v_company_id and service_job_id = p_job_id;

  if v_total > v_job.approved_amount + 0.01 then
    raise exception 'Recorded repair lines exceed the approved amount.';
  end if;

  v_remaining := v_job.approved_amount - v_total;

  if v_remaining > 0.01 then
    v_description := coalesce(nullif(btrim(coalesce(p_work_summary,'')),''), 'Repair service');
    perform public.add_service_job_line(
      p_job_id,
      'service',
      v_description,
      1,
      v_remaining,
      null
    );
  end if;

  return public.complete_service_job_technical(p_job_id);
end;
$function$;

create or replace function public.collect_service_job_simple(
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_job public.service_job%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.collection.confirm') then raise exception 'Permission denied: repair.collection.confirm'; end if;

  v_company_id := public.current_company_id();
  select * into v_job
  from public.service_job
  where id = p_job_id and company_id = v_company_id;

  if not found then raise exception 'Job card could not be found.'; end if;

  return public.confirm_service_job_collection(
    p_job_id,
    'counter_handover',
    v_job.job_number
  );
end;
$function$;

revoke all on function public.receive_service_job_simple(uuid,uuid,text,text,text,text,text,text,text,text,uuid) from public, anon;
revoke all on function public.approve_service_job_simple(uuid) from public, anon;
revoke all on function public.complete_service_job_simple(uuid,text) from public, anon;
revoke all on function public.collect_service_job_simple(uuid) from public, anon;

grant execute on function public.receive_service_job_simple(uuid,uuid,text,text,text,text,text,text,text,text,uuid) to authenticated;
grant execute on function public.approve_service_job_simple(uuid) to authenticated;
grant execute on function public.complete_service_job_simple(uuid,text) to authenticated;
grant execute on function public.collect_service_job_simple(uuid) to authenticated;;
