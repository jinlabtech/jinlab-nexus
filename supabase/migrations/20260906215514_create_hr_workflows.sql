-- JINLAB Nexus HR workflow RPCs

create or replace function public.generate_hr_employee_number(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare v_next bigint;
begin
  insert into public.hr_employee_sequence(company_id,last_value,updated_at)
  values(p_company_id,1,now())
  on conflict(company_id) do update
    set last_value=public.hr_employee_sequence.last_value+1,
        updated_at=now()
  returning last_value into v_next;
  return 'EMP-'||lpad(v_next::text,6,'0');
end;
$$;

revoke execute on function public.generate_hr_employee_number(uuid) from public, anon, authenticated;

create or replace function public.ensure_hr_default_leave_types(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.hr_leave_type(company_id,code,name,is_paid,requires_attachment,is_active)
  values
    (p_company_id,'annual','Annual Leave',true,false,true),
    (p_company_id,'sick','Sick Leave',true,false,true),
    (p_company_id,'family_responsibility','Family Responsibility Leave',true,false,true),
    (p_company_id,'maternity','Maternity Leave',true,false,true),
    (p_company_id,'parental','Parental Leave',true,false,true),
    (p_company_id,'unpaid','Unpaid Leave',false,false,true)
  on conflict do nothing;
end;
$$;

revoke execute on function public.ensure_hr_default_leave_types(uuid) from public, anon, authenticated;

create or replace function public.save_hr_department(
  p_id uuid,
  p_name text,
  p_code text,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_company_id uuid; v_id uuid; v_name text; v_code text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.employee.manage') then raise exception 'Permission denied: hr.employee.manage'; end if;
  v_company_id:=public.current_company_id();
  v_name:=btrim(coalesce(p_name,'')); v_code:=upper(btrim(coalesce(p_code,'')));
  if v_name='' or v_code='' then raise exception 'Department name and code are required.'; end if;
  if p_id is null then
    insert into public.hr_department(company_id,name,code,is_active,created_by)
    values(v_company_id,v_name,v_code,coalesce(p_is_active,true),auth.uid()) returning id into v_id;
  else
    update public.hr_department set name=v_name,code=v_code,is_active=coalesce(p_is_active,true)
    where id=p_id and company_id=v_company_id returning id into v_id;
    if v_id is null then raise exception 'Department could not be found.'; end if;
  end if;
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_department_saved','hr',v_id,'HR department saved.',jsonb_build_object('name',v_name,'code',v_code));
  return jsonb_build_object('ok',true,'id',v_id,'name',v_name,'code',v_code);
end;
$$;

create or replace function public.save_hr_position(
  p_id uuid,
  p_title text,
  p_code text,
  p_department_id uuid default null,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_company_id uuid; v_id uuid; v_title text; v_code text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.employee.manage') then raise exception 'Permission denied: hr.employee.manage'; end if;
  v_company_id:=public.current_company_id();
  v_title:=btrim(coalesce(p_title,'')); v_code:=upper(btrim(coalesce(p_code,'')));
  if v_title='' or v_code='' then raise exception 'Position title and code are required.'; end if;
  if p_department_id is not null and not exists(select 1 from public.hr_department d where d.id=p_department_id and d.company_id=v_company_id) then raise exception 'Department could not be found.'; end if;
  if p_id is null then
    insert into public.hr_position(company_id,department_id,title,code,is_active,created_by)
    values(v_company_id,p_department_id,v_title,v_code,coalesce(p_is_active,true),auth.uid()) returning id into v_id;
  else
    update public.hr_position set department_id=p_department_id,title=v_title,code=v_code,is_active=coalesce(p_is_active,true)
    where id=p_id and company_id=v_company_id returning id into v_id;
    if v_id is null then raise exception 'Position could not be found.'; end if;
  end if;
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_position_saved','hr',v_id,'HR position saved.',jsonb_build_object('title',v_title,'code',v_code,'department_id',p_department_id));
  return jsonb_build_object('ok',true,'id',v_id,'title',v_title,'code',v_code);
end;
$$;

create or replace function public.create_hr_employee(
  p_first_name text,
  p_last_name text,
  p_user_id uuid default null,
  p_email text default null,
  p_phone text default null,
  p_branch_id uuid default null,
  p_department_id uuid default null,
  p_position_id uuid default null,
  p_manager_employee_id uuid default null,
  p_employment_type text default 'permanent',
  p_hire_date date default current_date,
  p_standard_hours_per_week numeric default 45
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_company_id uuid; v_id uuid; v_number text; v_first text; v_last text; v_type text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.employee.manage') then raise exception 'Permission denied: hr.employee.manage'; end if;
  v_company_id:=public.current_company_id();
  v_first:=btrim(coalesce(p_first_name,'')); v_last:=btrim(coalesce(p_last_name,'')); v_type:=lower(btrim(coalesce(p_employment_type,'permanent')));
  if v_first='' or v_last='' then raise exception 'First name and last name are required.'; end if;
  if v_type not in ('permanent','fixed_term','part_time','casual','contractor','intern') then raise exception 'Unsupported employment type.'; end if;
  if p_branch_id is not null and not exists(select 1 from public.branch b where b.id=p_branch_id and b.company_id=v_company_id) then raise exception 'Branch could not be found.'; end if;
  if p_department_id is not null and not exists(select 1 from public.hr_department d where d.id=p_department_id and d.company_id=v_company_id) then raise exception 'Department could not be found.'; end if;
  if p_position_id is not null and not exists(select 1 from public.hr_position p where p.id=p_position_id and p.company_id=v_company_id) then raise exception 'Position could not be found.'; end if;
  if p_manager_employee_id is not null and not exists(select 1 from public.hr_employee e where e.id=p_manager_employee_id and e.company_id=v_company_id) then raise exception 'Manager employee could not be found.'; end if;
  if p_user_id is not null and not exists(select 1 from public.user_profile up where up.user_id=p_user_id and up.company_id=v_company_id) then raise exception 'Linked Nexus user must belong to the same company.'; end if;
  if coalesce(p_standard_hours_per_week,45)<0 or coalesce(p_standard_hours_per_week,45)>168 then raise exception 'Standard weekly hours must be between 0 and 168.'; end if;
  v_number:=public.generate_hr_employee_number(v_company_id);
  insert into public.hr_employee(company_id,user_id,employee_number,first_name,last_name,email,phone,primary_branch_id,department_id,position_id,manager_employee_id,employment_type,status,hire_date,standard_hours_per_week,created_by,updated_by)
  values(v_company_id,p_user_id,v_number,v_first,v_last,nullif(btrim(coalesce(p_email,'')),''),nullif(btrim(coalesce(p_phone,'')),''),p_branch_id,p_department_id,p_position_id,p_manager_employee_id,v_type,'active',coalesce(p_hire_date,current_date),coalesce(p_standard_hours_per_week,45),auth.uid(),auth.uid())
  returning id into v_id;
  perform public.ensure_hr_default_leave_types(v_company_id);
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_employee_created','hr',v_id,'HR employee created.',jsonb_build_object('employee_number',v_number,'name',v_first||' '||v_last,'linked_user_id',p_user_id,'branch_id',p_branch_id));
  return jsonb_build_object('ok',true,'id',v_id,'employee_number',v_number,'full_name',v_first||' '||v_last,'status','active');
end;
$$;

create or replace function public.update_hr_employee(
  p_employee_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_company_id uuid; v_emp public.hr_employee%rowtype; v_key text; v_uuid uuid; v_num numeric; v_text text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.employee.manage') then raise exception 'Permission denied: hr.employee.manage'; end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'Employee patch must be an object.'; end if;
  v_company_id:=public.current_company_id();
  select * into v_emp from public.hr_employee where id=p_employee_id and company_id=v_company_id for update;
  if not found then raise exception 'Employee could not be found.'; end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('first_name','last_name','preferred_name','email','phone','primary_branch_id','department_id','position_id','manager_employee_id','employment_type','status','hire_date','end_date','standard_hours_per_week','internal_notes','user_id') then
      raise exception 'Unsupported employee field: %',v_key;
    end if;
  end loop;
  if p_patch ? 'primary_branch_id' then
    v_uuid:=nullif(p_patch->>'primary_branch_id','')::uuid;
    if v_uuid is not null and not exists(select 1 from public.branch b where b.id=v_uuid and b.company_id=v_company_id) then raise exception 'Branch could not be found.'; end if;
  end if;
  if p_patch ? 'department_id' then
    v_uuid:=nullif(p_patch->>'department_id','')::uuid;
    if v_uuid is not null and not exists(select 1 from public.hr_department d where d.id=v_uuid and d.company_id=v_company_id) then raise exception 'Department could not be found.'; end if;
  end if;
  if p_patch ? 'position_id' then
    v_uuid:=nullif(p_patch->>'position_id','')::uuid;
    if v_uuid is not null and not exists(select 1 from public.hr_position p where p.id=v_uuid and p.company_id=v_company_id) then raise exception 'Position could not be found.'; end if;
  end if;
  if p_patch ? 'manager_employee_id' then
    v_uuid:=nullif(p_patch->>'manager_employee_id','')::uuid;
    if v_uuid=p_employee_id then raise exception 'An employee cannot manage themselves.'; end if;
    if v_uuid is not null and not exists(select 1 from public.hr_employee e where e.id=v_uuid and e.company_id=v_company_id) then raise exception 'Manager employee could not be found.'; end if;
  end if;
  if p_patch ? 'user_id' then
    v_uuid:=nullif(p_patch->>'user_id','')::uuid;
    if v_uuid is not null and not exists(select 1 from public.user_profile up where up.user_id=v_uuid and up.company_id=v_company_id) then raise exception 'Linked Nexus user must belong to the same company.'; end if;
  end if;
  if p_patch ? 'employment_type' then
    v_text:=lower(btrim(coalesce(p_patch->>'employment_type','')));
    if v_text not in ('permanent','fixed_term','part_time','casual','contractor','intern') then raise exception 'Unsupported employment type.'; end if;
  end if;
  if p_patch ? 'status' then
    v_text:=lower(btrim(coalesce(p_patch->>'status','')));
    if v_text not in ('active','on_leave','suspended','terminated') then raise exception 'Unsupported employee status.'; end if;
  end if;
  if p_patch ? 'standard_hours_per_week' then
    v_num:=nullif(p_patch->>'standard_hours_per_week','')::numeric;
    if v_num is null or v_num<0 or v_num>168 then raise exception 'Standard weekly hours must be between 0 and 168.'; end if;
  end if;

  update public.hr_employee set
    first_name=case when p_patch ? 'first_name' then btrim(coalesce(p_patch->>'first_name','')) else first_name end,
    last_name=case when p_patch ? 'last_name' then btrim(coalesce(p_patch->>'last_name','')) else last_name end,
    preferred_name=case when p_patch ? 'preferred_name' then nullif(btrim(coalesce(p_patch->>'preferred_name','')),'') else preferred_name end,
    email=case when p_patch ? 'email' then nullif(btrim(coalesce(p_patch->>'email','')),'') else email end,
    phone=case when p_patch ? 'phone' then nullif(btrim(coalesce(p_patch->>'phone','')),'') else phone end,
    primary_branch_id=case when p_patch ? 'primary_branch_id' then nullif(p_patch->>'primary_branch_id','')::uuid else primary_branch_id end,
    department_id=case when p_patch ? 'department_id' then nullif(p_patch->>'department_id','')::uuid else department_id end,
    position_id=case when p_patch ? 'position_id' then nullif(p_patch->>'position_id','')::uuid else position_id end,
    manager_employee_id=case when p_patch ? 'manager_employee_id' then nullif(p_patch->>'manager_employee_id','')::uuid else manager_employee_id end,
    employment_type=case when p_patch ? 'employment_type' then lower(btrim(p_patch->>'employment_type')) else employment_type end,
    status=case when p_patch ? 'status' then lower(btrim(p_patch->>'status')) else status end,
    hire_date=case when p_patch ? 'hire_date' then nullif(p_patch->>'hire_date','')::date else hire_date end,
    end_date=case when p_patch ? 'end_date' then nullif(p_patch->>'end_date','')::date else end_date end,
    standard_hours_per_week=case when p_patch ? 'standard_hours_per_week' then (p_patch->>'standard_hours_per_week')::numeric else standard_hours_per_week end,
    internal_notes=case when p_patch ? 'internal_notes' then nullif(btrim(coalesce(p_patch->>'internal_notes','')),'') else internal_notes end,
    user_id=case when p_patch ? 'user_id' then nullif(p_patch->>'user_id','')::uuid else user_id end,
    updated_by=auth.uid()
  where id=p_employee_id and company_id=v_company_id;

  select * into v_emp from public.hr_employee where id=p_employee_id;
  if btrim(v_emp.first_name)='' or btrim(v_emp.last_name)='' then raise exception 'First name and last name cannot be empty.'; end if;
  if v_emp.end_date is not null and v_emp.end_date<v_emp.hire_date then raise exception 'End date cannot be before hire date.'; end if;
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_employee_updated','hr',p_employee_id,'HR employee updated.',jsonb_build_object('changed_fields',(select jsonb_agg(k) from jsonb_object_keys(p_patch) k)));
  return jsonb_build_object('ok',true,'id',v_emp.id,'employee_number',v_emp.employee_number,'full_name',v_emp.first_name||' '||v_emp.last_name,'status',v_emp.status);
end;
$$;

create or replace function public.clock_hr_employee(
  p_action text,
  p_employee_id uuid default null,
  p_branch_id uuid default null,
  p_source text default 'web',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company_id uuid; v_employee public.hr_employee%rowtype; v_entry public.hr_time_entry%rowtype;
  v_action text; v_source text; v_branch_id uuid; v_tz text; v_work_date date; v_now timestamptz:=now(); v_duration integer;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  v_company_id:=public.current_company_id();
  if p_employee_id is null then
    select * into v_employee from public.hr_employee where company_id=v_company_id and user_id=auth.uid() limit 1;
  else
    select * into v_employee from public.hr_employee where company_id=v_company_id and id=p_employee_id limit 1;
  end if;
  if not found then raise exception 'Employee profile could not be found.'; end if;
  if v_employee.user_id=auth.uid() then
    if not public.current_user_has_permission('hr.self') and not public.current_user_has_permission('hr.attendance.manage') then raise exception 'Permission denied: hr.self'; end if;
  else
    if not public.current_user_has_permission('hr.attendance.manage') then raise exception 'Permission denied: hr.attendance.manage'; end if;
  end if;
  v_action:=lower(btrim(coalesce(p_action,'')));
  if v_action not in ('clock_in','clock_out') then raise exception 'Action must be clock_in or clock_out.'; end if;
  v_source:=lower(btrim(coalesce(p_source,'web')));
  if v_source not in ('web','mobile','kiosk','biometric','import','manual') then raise exception 'Unsupported attendance source.'; end if;
  v_branch_id:=coalesce(p_branch_id,v_employee.primary_branch_id);
  if v_branch_id is not null and not exists(select 1 from public.branch b where b.id=v_branch_id and b.company_id=v_company_id) then raise exception 'Branch could not be found.'; end if;
  select coalesce(timezone,'UTC') into v_tz from public.company_profile_settings where company_id=v_company_id;
  if v_tz is null then v_tz:='UTC'; end if;
  v_work_date:=timezone(v_tz,v_now)::date;

  if v_action='clock_in' then
    if v_employee.status<>'active' then raise exception 'Only active employees may clock in.'; end if;
    if exists(select 1 from public.hr_time_entry where company_id=v_company_id and employee_id=v_employee.id and status='open') then raise exception 'Employee is already clocked in.'; end if;
    insert into public.hr_time_entry(company_id,employee_id,branch_id,work_date,clock_in_at,status,source,notes,created_by)
    values(v_company_id,v_employee.id,v_branch_id,v_work_date,v_now,'open',v_source,nullif(btrim(coalesce(p_notes,'')),''),auth.uid()) returning * into v_entry;
    insert into public.hr_attendance_event(company_id,employee_id,time_entry_id,branch_id,event_type,occurred_at,source,notes,recorded_by)
    values(v_company_id,v_employee.id,v_entry.id,v_branch_id,'clock_in',v_now,v_source,nullif(btrim(coalesce(p_notes,'')),''),auth.uid());
    insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
    values(v_company_id,auth.uid(),'hr_clock_in','hr',v_entry.id,'Employee clocked in.',jsonb_build_object('employee_id',v_employee.id,'branch_id',v_branch_id,'source',v_source));
    return jsonb_build_object('ok',true,'action','clock_in','time_entry_id',v_entry.id,'employee_id',v_employee.id,'employee_number',v_employee.employee_number,'clock_in_at',v_now,'work_date',v_work_date);
  end if;

  select * into v_entry from public.hr_time_entry where company_id=v_company_id and employee_id=v_employee.id and status='open' order by clock_in_at desc limit 1 for update;
  if not found then raise exception 'Employee is not currently clocked in.'; end if;
  update public.hr_time_entry set clock_out_at=v_now,status='completed' where id=v_entry.id returning * into v_entry;
  insert into public.hr_attendance_event(company_id,employee_id,time_entry_id,branch_id,event_type,occurred_at,source,notes,recorded_by)
  values(v_company_id,v_employee.id,v_entry.id,coalesce(v_branch_id,v_entry.branch_id),'clock_out',v_now,v_source,nullif(btrim(coalesce(p_notes,'')),''),auth.uid());
  v_duration:=greatest(0,floor(extract(epoch from (v_now-v_entry.clock_in_at))/60)::integer-v_entry.break_minutes);
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_clock_out','hr',v_entry.id,'Employee clocked out.',jsonb_build_object('employee_id',v_employee.id,'duration_minutes',v_duration,'source',v_source));
  return jsonb_build_object('ok',true,'action','clock_out','time_entry_id',v_entry.id,'employee_id',v_employee.id,'employee_number',v_employee.employee_number,'clock_in_at',v_entry.clock_in_at,'clock_out_at',v_now,'duration_minutes',v_duration);
end;
$$;

create or replace function public.submit_hr_leave_request(
  p_leave_type_id uuid,
  p_start_date date,
  p_end_date date,
  p_reason text default null,
  p_employee_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_company_id uuid; v_employee public.hr_employee%rowtype; v_days integer; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  v_company_id:=public.current_company_id();
  perform public.ensure_hr_default_leave_types(v_company_id);
  if p_employee_id is null then select * into v_employee from public.hr_employee where company_id=v_company_id and user_id=auth.uid() limit 1;
  else select * into v_employee from public.hr_employee where company_id=v_company_id and id=p_employee_id limit 1; end if;
  if not found then raise exception 'Employee profile could not be found.'; end if;
  if v_employee.user_id=auth.uid() then
    if not public.current_user_has_permission('hr.self') and not public.current_user_has_permission('hr.employee.manage') then raise exception 'Permission denied: hr.self'; end if;
  elsif not public.current_user_has_permission('hr.employee.manage') and not public.current_user_has_permission('hr.leave.approve') then
    raise exception 'Permission denied for another employee leave request.';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then raise exception 'Leave dates are invalid.'; end if;
  if not exists(select 1 from public.hr_leave_type lt where lt.id=p_leave_type_id and lt.company_id=v_company_id and lt.is_active=true) then raise exception 'Leave type could not be found.'; end if;
  if exists(select 1 from public.hr_leave_request lr where lr.company_id=v_company_id and lr.employee_id=v_employee.id and lr.status in ('pending','approved') and not (lr.end_date<p_start_date or lr.start_date>p_end_date)) then raise exception 'Leave dates overlap an existing pending or approved request.'; end if;
  v_days:=(p_end_date-p_start_date)+1;
  insert into public.hr_leave_request(company_id,employee_id,leave_type_id,start_date,end_date,calendar_days,reason,status,requested_by)
  values(v_company_id,v_employee.id,p_leave_type_id,p_start_date,p_end_date,v_days,nullif(btrim(coalesce(p_reason,'')),''),'pending',auth.uid()) returning id into v_id;
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_leave_requested','hr',v_id,'Leave request submitted.',jsonb_build_object('employee_id',v_employee.id,'start_date',p_start_date,'end_date',p_end_date,'calendar_days',v_days));
  return jsonb_build_object('ok',true,'id',v_id,'status','pending','calendar_days',v_days,'message','Leave request submitted for approval.');
end;
$$;

create or replace function public.review_hr_leave_request(
  p_request_id uuid,
  p_decision text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_company_id uuid; v_request public.hr_leave_request%rowtype; v_employee public.hr_employee%rowtype; v_decision text; v_role text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.leave.approve') then raise exception 'Permission denied: hr.leave.approve'; end if;
  v_company_id:=public.current_company_id(); v_decision:=lower(btrim(coalesce(p_decision,'')));
  if v_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected.'; end if;
  select * into v_request from public.hr_leave_request where id=p_request_id and company_id=v_company_id for update;
  if not found then raise exception 'Leave request could not be found.'; end if;
  if v_request.status<>'pending' then raise exception 'Only pending leave requests may be reviewed.'; end if;
  select * into v_employee from public.hr_employee where id=v_request.employee_id and company_id=v_company_id;
  select role into v_role from public.user_profile where user_id=auth.uid() and company_id=v_company_id limit 1;
  if v_employee.user_id=auth.uid() and coalesce(v_role,'')<>'owner' then raise exception 'Managers and administrators cannot approve their own leave request.'; end if;
  update public.hr_leave_request set status=v_decision,reviewed_by=auth.uid(),reviewed_at=now(),review_notes=nullif(btrim(coalesce(p_notes,'')),'') where id=p_request_id;
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_leave_reviewed','hr',p_request_id,'Leave request reviewed.',jsonb_build_object('decision',v_decision,'employee_id',v_request.employee_id));
  return jsonb_build_object('ok',true,'id',p_request_id,'status',v_decision,'message','Leave request '||v_decision||'.');
end;
$$;

create or replace function public.cancel_hr_leave_request(
  p_request_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_company_id uuid; v_request public.hr_leave_request%rowtype; v_employee public.hr_employee%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  v_company_id:=public.current_company_id();
  select * into v_request from public.hr_leave_request where id=p_request_id and company_id=v_company_id for update;
  if not found then raise exception 'Leave request could not be found.'; end if;
  select * into v_employee from public.hr_employee where id=v_request.employee_id and company_id=v_company_id;
  if v_employee.user_id=auth.uid() then
    if not public.current_user_has_permission('hr.self') then raise exception 'Permission denied: hr.self'; end if;
    if v_request.status<>'pending' then raise exception 'Employees may only cancel pending leave requests.'; end if;
  else
    if not public.current_user_has_permission('hr.leave.approve') then raise exception 'Permission denied: hr.leave.approve'; end if;
    if v_request.status not in ('pending','approved') then raise exception 'This leave request cannot be cancelled.'; end if;
  end if;
  update public.hr_leave_request set status='cancelled',reviewed_by=case when v_employee.user_id=auth.uid() then reviewed_by else auth.uid() end,reviewed_at=case when v_employee.user_id=auth.uid() then reviewed_at else now() end,review_notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),review_notes) where id=p_request_id;
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_leave_cancelled','hr',p_request_id,'Leave request cancelled.',jsonb_build_object('employee_id',v_request.employee_id,'previous_status',v_request.status));
  return jsonb_build_object('ok',true,'id',p_request_id,'status','cancelled');
end;
$$;

create or replace function public.get_hr_workspace(
  p_branch_id uuid default null,
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company_id uuid; v_can_all boolean; v_can_self boolean; v_own_employee_id uuid; v_search text; v_tz text; v_today date;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  v_can_all:=public.current_user_has_permission('hr.view');
  v_can_self:=public.current_user_has_permission('hr.self');
  if not v_can_all and not v_can_self then raise exception 'Permission denied: HR access'; end if;
  v_company_id:=public.current_company_id();
  perform public.ensure_hr_default_leave_types(v_company_id);
  select id into v_own_employee_id from public.hr_employee where company_id=v_company_id and user_id=auth.uid() limit 1;
  if not v_can_all and v_own_employee_id is null then raise exception 'No HR employee profile is linked to this Nexus user.'; end if;
  if p_branch_id is not null and not exists(select 1 from public.branch b where b.id=p_branch_id and b.company_id=v_company_id) then raise exception 'Branch could not be found.'; end if;
  v_search:=lower(btrim(coalesce(p_search,'')));
  select coalesce(timezone,'UTC') into v_tz from public.company_profile_settings where company_id=v_company_id;
  if v_tz is null then v_tz:='UTC'; end if;
  v_today:=timezone(v_tz,now())::date;

  return jsonb_build_object(
    'ok',true,
    'can_manage_employees',public.current_user_has_permission('hr.employee.manage'),
    'can_manage_attendance',public.current_user_has_permission('hr.attendance.manage'),
    'can_approve_leave',public.current_user_has_permission('hr.leave.approve'),
    'own_employee_id',v_own_employee_id,
    'today',v_today,
    'timezone',v_tz,
    'branches',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.branch_name) order by b.branch_name) from public.branch b where b.company_id=v_company_id),'[]'::jsonb),
    'departments',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'code',d.code,'is_active',d.is_active) order by d.name) from public.hr_department d where d.company_id=v_company_id),'[]'::jsonb),
    'positions',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'code',p.code,'department_id',p.department_id,'is_active',p.is_active) order by p.title) from public.hr_position p where p.company_id=v_company_id),'[]'::jsonb),
    'leave_types',coalesce((select jsonb_agg(jsonb_build_object('id',lt.id,'code',lt.code,'name',lt.name,'is_paid',lt.is_paid,'requires_attachment',lt.requires_attachment) order by lt.name) from public.hr_leave_type lt where lt.company_id=v_company_id and lt.is_active=true),'[]'::jsonb),
    'summary',jsonb_build_object(
      'active_employees',(select count(*) from public.hr_employee e where e.company_id=v_company_id and e.status='active' and (v_can_all or e.id=v_own_employee_id) and (p_branch_id is null or e.primary_branch_id=p_branch_id)),
      'clocked_in',(select count(*) from public.hr_time_entry t where t.company_id=v_company_id and t.status='open' and (v_can_all or t.employee_id=v_own_employee_id) and (p_branch_id is null or t.branch_id=p_branch_id)),
      'pending_leave',(select count(*) from public.hr_leave_request lr where lr.company_id=v_company_id and lr.status='pending' and (v_can_all or lr.employee_id=v_own_employee_id))
    ),
    'employees',coalesce((
      select jsonb_agg(x.obj order by x.employee_number)
      from (
        select e.employee_number,
          jsonb_build_object(
            'id',e.id,'employee_number',e.employee_number,'first_name',e.first_name,'last_name',e.last_name,'preferred_name',e.preferred_name,
            'full_name',e.first_name||' '||e.last_name,'email',e.email,'phone',e.phone,'status',e.status,'employment_type',e.employment_type,
            'hire_date',e.hire_date,'standard_hours_per_week',e.standard_hours_per_week,'user_id',e.user_id,
            'branch_id',e.primary_branch_id,'branch_name',(select branch_name from public.branch where id=e.primary_branch_id),
            'department_id',e.department_id,'department_name',(select name from public.hr_department where id=e.department_id),
            'position_id',e.position_id,'position_title',(select title from public.hr_position where id=e.position_id),
            'manager_employee_id',e.manager_employee_id,
            'is_clocked_in',exists(select 1 from public.hr_time_entry t where t.company_id=v_company_id and t.employee_id=e.id and t.status='open')
          ) obj
        from public.hr_employee e
        where e.company_id=v_company_id
          and (v_can_all or e.id=v_own_employee_id)
          and (p_branch_id is null or e.primary_branch_id=p_branch_id)
          and (v_search='' or lower(e.first_name||' '||e.last_name) like '%'||v_search||'%' or lower(e.employee_number) like '%'||v_search||'%' or lower(coalesce(e.email,'')) like '%'||v_search||'%')
        order by e.employee_number
        limit 250
      ) x
    ),'[]'::jsonb),
    'today_attendance',coalesce((
      select jsonb_agg(x.obj order by x.clock_in_at desc)
      from (
        select t.clock_in_at,
          jsonb_build_object('id',t.id,'employee_id',t.employee_id,'employee_name',e.first_name||' '||e.last_name,'employee_number',e.employee_number,'branch_name',(select branch_name from public.branch where id=t.branch_id),'work_date',t.work_date,'clock_in_at',t.clock_in_at,'clock_out_at',t.clock_out_at,'status',t.status,'source',t.source,'duration_minutes',case when t.clock_out_at is null then null else greatest(0,floor(extract(epoch from (t.clock_out_at-t.clock_in_at))/60)::integer-t.break_minutes) end) obj
        from public.hr_time_entry t join public.hr_employee e on e.id=t.employee_id and e.company_id=t.company_id
        where t.company_id=v_company_id and t.work_date=v_today and (v_can_all or t.employee_id=v_own_employee_id) and (p_branch_id is null or t.branch_id=p_branch_id)
        order by t.clock_in_at desc limit 250
      ) x
    ),'[]'::jsonb),
    'leave_requests',coalesce((
      select jsonb_agg(x.obj order by x.requested_at desc)
      from (
        select lr.requested_at,
          jsonb_build_object('id',lr.id,'employee_id',lr.employee_id,'employee_name',e.first_name||' '||e.last_name,'employee_number',e.employee_number,'leave_type_id',lr.leave_type_id,'leave_type_name',lt.name,'start_date',lr.start_date,'end_date',lr.end_date,'calendar_days',lr.calendar_days,'reason',lr.reason,'status',lr.status,'requested_at',lr.requested_at,'reviewed_at',lr.reviewed_at,'review_notes',lr.review_notes) obj
        from public.hr_leave_request lr join public.hr_employee e on e.id=lr.employee_id and e.company_id=lr.company_id join public.hr_leave_type lt on lt.id=lr.leave_type_id and lt.company_id=lr.company_id
        where lr.company_id=v_company_id and (v_can_all or lr.employee_id=v_own_employee_id)
        order by lr.requested_at desc limit 100
      ) x
    ),'[]'::jsonb)
  );
end;
$$;

revoke execute on function public.save_hr_department(uuid,text,text,boolean) from public, anon;
grant execute on function public.save_hr_department(uuid,text,text,boolean) to authenticated;
revoke execute on function public.save_hr_position(uuid,text,text,uuid,boolean) from public, anon;
grant execute on function public.save_hr_position(uuid,text,text,uuid,boolean) to authenticated;
revoke execute on function public.create_hr_employee(text,text,uuid,text,text,uuid,uuid,uuid,uuid,text,date,numeric) from public, anon;
grant execute on function public.create_hr_employee(text,text,uuid,text,text,uuid,uuid,uuid,uuid,text,date,numeric) to authenticated;
revoke execute on function public.update_hr_employee(uuid,jsonb) from public, anon;
grant execute on function public.update_hr_employee(uuid,jsonb) to authenticated;
revoke execute on function public.clock_hr_employee(text,uuid,uuid,text,text) from public, anon;
grant execute on function public.clock_hr_employee(text,uuid,uuid,text,text) to authenticated;
revoke execute on function public.submit_hr_leave_request(uuid,date,date,text,uuid) from public, anon;
grant execute on function public.submit_hr_leave_request(uuid,date,date,text,uuid) to authenticated;
revoke execute on function public.review_hr_leave_request(uuid,text,text) from public, anon;
grant execute on function public.review_hr_leave_request(uuid,text,text) to authenticated;
revoke execute on function public.cancel_hr_leave_request(uuid,text) from public, anon;
grant execute on function public.cancel_hr_leave_request(uuid,text) to authenticated;
revoke execute on function public.get_hr_workspace(uuid,text) from public, anon;
grant execute on function public.get_hr_workspace(uuid,text) to authenticated;;
