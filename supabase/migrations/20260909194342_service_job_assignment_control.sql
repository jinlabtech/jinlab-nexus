create or replace function public.create_service_job(
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
set search_path=public
as $$
declare v_company_id uuid; v_id uuid; v_job_number text; v_current_employee_id uuid; v_assignee uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.create') then raise exception 'Permission denied: repair.create'; end if;
  v_company_id:=public.current_company_id();
  if p_device_type is null or btrim(p_device_type)='' then raise exception 'Device type is required.'; end if;
  if p_reported_fault is null or btrim(p_reported_fault)='' then raise exception 'Reported fault is required.'; end if;
  if not exists(select 1 from public.branch b where b.id=p_branch_id and b.company_id=v_company_id) then raise exception 'Branch could not be found.'; end if;
  if not exists(select 1 from public.customer c where c.id=p_customer_id and c.company_id=v_company_id and c.is_active=true) then raise exception 'Customer could not be found.'; end if;

  select e.id into v_current_employee_id
  from public.hr_employee e
  where e.company_id=v_company_id and e.user_id=auth.uid() and e.status='active'
  limit 1;

  v_assignee:=p_assigned_employee_id;
  if v_assignee is not null then
    if not exists(select 1 from public.hr_employee e where e.id=v_assignee and e.company_id=v_company_id and e.status='active') then
      raise exception 'Assigned employee could not be found.';
    end if;
    if v_assignee is distinct from v_current_employee_id and not public.current_user_has_permission('repair.assign') then
      raise exception 'Permission denied: repair.assign';
    end if;
  elsif v_current_employee_id is not null and public.current_user_has_permission('repair.update') then
    v_assignee:=v_current_employee_id;
  end if;

  v_job_number:=public.generate_service_job_number(v_company_id);
  insert into public.service_job(company_id,branch_id,job_number,customer_id,assigned_employee_id,device_type,brand,model,serial_number,imei,device_condition,accessories_received,reported_fault,created_by)
  values(v_company_id,p_branch_id,v_job_number,p_customer_id,v_assignee,btrim(p_device_type),nullif(btrim(coalesce(p_brand,'')),''),nullif(btrim(coalesce(p_model,'')),''),nullif(btrim(coalesce(p_serial_number,'')),''),nullif(btrim(coalesce(p_imei,'')),''),nullif(btrim(coalesce(p_device_condition,'')),''),nullif(btrim(coalesce(p_accessories_received,'')),''),btrim(p_reported_fault),auth.uid())
  returning id into v_id;

  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,v_id,'created','Job card opened.',jsonb_build_object('job_number',v_job_number,'assigned_employee_id',v_assignee),auth.uid());
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'service_job_created','repairs',v_id,'Repair/service job card opened.',jsonb_build_object('job_number',v_job_number,'customer_id',p_customer_id,'device_type',btrim(p_device_type),'assigned_employee_id',v_assignee));
  return jsonb_build_object('ok',true,'id',v_id,'job_number',v_job_number,'status','received','assigned_employee_id',v_assignee);
end;
$$;

create or replace function public.assign_service_job(p_job_id uuid,p_employee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_company_id uuid; v_job public.service_job%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.assign') then raise exception 'Permission denied: repair.assign'; end if;
  v_company_id:=public.current_company_id();
  select * into v_job from public.service_job where id=p_job_id and company_id=v_company_id for update;
  if not found then raise exception 'Job card could not be found.'; end if;
  if v_job.status in ('closed','cancelled','collected') then raise exception 'This job cannot be reassigned.'; end if;
  if not exists(select 1 from public.hr_employee e where e.id=p_employee_id and e.company_id=v_company_id and e.status='active') then raise exception 'Employee could not be found.'; end if;
  update public.service_job set assigned_employee_id=p_employee_id,updated_at=now() where id=p_job_id;
  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,p_job_id,'assigned','Job assigned/reassigned.',jsonb_build_object('employee_id',p_employee_id),auth.uid());
  return jsonb_build_object('ok',true,'id',p_job_id,'assigned_employee_id',p_employee_id);
end;
$$;

revoke all on function public.assign_service_job(uuid,uuid) from public,anon;
grant execute on function public.assign_service_job(uuid,uuid) to authenticated;;
