create or replace function public.register_hr_attendance_device(
  p_name text,
  p_branch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_id uuid;
  v_code text;
  v_secret text;
  v_branch_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.attendance.manage') then raise exception 'Permission denied: hr.attendance.manage'; end if;
  v_company_id := public.current_company_id();
  if btrim(coalesce(p_name,'')) = '' then raise exception 'Device name is required.'; end if;
  select branch_name into v_branch_name from public.branch where id=p_branch_id and company_id=v_company_id;
  if v_branch_name is null then raise exception 'Branch could not be found.'; end if;
  v_code := 'KSK-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  v_secret := encode(extensions.gen_random_bytes(24),'hex');
  insert into public.hr_attendance_device(company_id,branch_id,name,device_code,device_secret_hash,created_by)
  values(v_company_id,p_branch_id,btrim(p_name),v_code,encode(extensions.digest(v_secret,'sha256'),'hex'),auth.uid())
  returning id into v_id;
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_kiosk_device_registered','hr',v_id,'HR attendance kiosk device registered.',jsonb_build_object('branch_id',p_branch_id,'device_code',v_code,'name',btrim(p_name)));
  return jsonb_build_object('ok',true,'id',v_id,'device_code',v_code,'device_secret',v_secret,'branch_id',p_branch_id,'branch_name',v_branch_name,'message','Save the device secret now. It is only returned at registration or rotation.');
end;
$$;

create or replace function public.rotate_hr_attendance_device_secret(p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_secret text;
  v_device public.hr_attendance_device%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.attendance.manage') then raise exception 'Permission denied: hr.attendance.manage'; end if;
  v_company_id := public.current_company_id();
  select * into v_device from public.hr_attendance_device where id=p_device_id and company_id=v_company_id for update;
  if not found then raise exception 'Attendance device could not be found.'; end if;
  v_secret := encode(extensions.gen_random_bytes(24),'hex');
  update public.hr_attendance_device set device_secret_hash=encode(extensions.digest(v_secret,'sha256'),'hex'),failed_attempts=0,locked_until=null,updated_at=now() where id=p_device_id;
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_kiosk_device_secret_rotated','hr',p_device_id,'HR attendance kiosk secret rotated.',jsonb_build_object('device_code',v_device.device_code));
  return jsonb_build_object('ok',true,'id',p_device_id,'device_secret',v_secret);
end;
$$;

create or replace function public.set_hr_employee_clock_pin(
  p_employee_id uuid,
  p_pin text,
  p_badge_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_employee public.hr_employee%rowtype;
  v_badge text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.employee.manage') then raise exception 'Permission denied: hr.employee.manage'; end if;
  v_company_id := public.current_company_id();
  select * into v_employee from public.hr_employee where id=p_employee_id and company_id=v_company_id;
  if not found then raise exception 'Employee could not be found.'; end if;
  if p_pin !~ '^[0-9]{4,8}$' then raise exception 'Clock PIN must contain 4 to 8 digits.'; end if;
  v_badge := upper(btrim(coalesce(p_badge_code,'')));
  if v_badge='' then v_badge := upper(v_employee.employee_number); end if;
  if length(v_badge)<3 or length(v_badge)>64 then raise exception 'Badge code must be between 3 and 64 characters.'; end if;
  insert into public.hr_employee_clock_credential(company_id,employee_id,badge_code,pin_hash,is_active,failed_attempts,locked_until,pin_changed_at,created_by,updated_at)
  values(v_company_id,v_employee.id,v_badge,extensions.crypt(p_pin,extensions.gen_salt('bf')),true,0,null,now(),auth.uid(),now())
  on conflict(company_id,employee_id)
  do update set badge_code=excluded.badge_code,pin_hash=excluded.pin_hash,is_active=true,failed_attempts=0,locked_until=null,pin_changed_at=now(),updated_at=now()
  returning id into v_id;
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_clock_credential_set','hr',v_id,'Employee kiosk clock credential configured.',jsonb_build_object('employee_id',v_employee.id,'badge_code',v_badge));
  return jsonb_build_object('ok',true,'id',v_id,'employee_id',v_employee.id,'employee_number',v_employee.employee_number,'badge_code',v_badge);
end;
$$;

create or replace function public.kiosk_get_device_info(p_device_id uuid,p_device_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.hr_attendance_device%rowtype;
  v_company_name text;
  v_branch_name text;
begin
  select * into v_device from public.hr_attendance_device
  where id=p_device_id and status='active' and device_secret_hash=encode(extensions.digest(coalesce(p_device_secret,''),'sha256'),'hex') for update;
  if not found then raise exception 'Invalid or inactive attendance device.'; end if;
  if v_device.locked_until is not null and v_device.locked_until>now() then raise exception 'Attendance device is temporarily locked.'; end if;
  update public.hr_attendance_device set last_seen_at=now(),updated_at=now() where id=v_device.id;
  select company_name into v_company_name from public.company where id=v_device.company_id;
  select branch_name into v_branch_name from public.branch where id=v_device.branch_id;
  return jsonb_build_object('ok',true,'device_id',v_device.id,'device_code',v_device.device_code,'device_name',v_device.name,'company_name',v_company_name,'branch_id',v_device.branch_id,'branch_name',v_branch_name,'allowed_methods',v_device.allowed_methods);
end;
$$;

create or replace function public.kiosk_clock_hr_employee(
  p_device_id uuid,
  p_device_secret text,
  p_badge_code text,
  p_pin text,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.hr_attendance_device%rowtype;
  v_credential public.hr_employee_clock_credential%rowtype;
  v_employee public.hr_employee%rowtype;
  v_entry public.hr_time_entry%rowtype;
  v_action text;
  v_tz text;
  v_now timestamptz := now();
  v_work_date date;
  v_duration integer;
  v_shift record;
  v_late integer := 0;
begin
  v_action := lower(btrim(coalesce(p_action,'')));
  if v_action not in ('clock_in','clock_out') then raise exception 'Action must be clock_in or clock_out.'; end if;
  select * into v_device from public.hr_attendance_device
  where id=p_device_id and status='active' and device_secret_hash=encode(extensions.digest(coalesce(p_device_secret,''),'sha256'),'hex') for update;
  if not found then raise exception 'Invalid or inactive attendance device.'; end if;
  if v_device.locked_until is not null and v_device.locked_until>now() then raise exception 'Attendance device is temporarily locked.'; end if;
  select * into v_credential from public.hr_employee_clock_credential
  where company_id=v_device.company_id and upper(badge_code)=upper(btrim(coalesce(p_badge_code,''))) and is_active=true for update;
  if not found then
    update public.hr_attendance_device set failed_attempts=failed_attempts+1,locked_until=case when failed_attempts+1>=20 then now()+interval '15 minutes' else locked_until end,last_seen_at=now(),updated_at=now() where id=v_device.id;
    raise exception 'Invalid employee code or PIN.';
  end if;
  if v_credential.locked_until is not null and v_credential.locked_until>now() then raise exception 'Employee clock credential is temporarily locked.'; end if;
  if extensions.crypt(coalesce(p_pin,''),v_credential.pin_hash)<>v_credential.pin_hash then
    update public.hr_employee_clock_credential set failed_attempts=failed_attempts+1,locked_until=case when failed_attempts+1>=5 then now()+interval '15 minutes' else locked_until end,updated_at=now() where id=v_credential.id;
    update public.hr_attendance_device set failed_attempts=failed_attempts+1,locked_until=case when failed_attempts+1>=20 then now()+interval '15 minutes' else locked_until end,last_seen_at=now(),updated_at=now() where id=v_device.id;
    raise exception 'Invalid employee code or PIN.';
  end if;
  select * into v_employee from public.hr_employee where id=v_credential.employee_id and company_id=v_device.company_id;
  if not found or v_employee.status<>'active' then raise exception 'Employee is not active for attendance.'; end if;
  if v_employee.primary_branch_id is null or v_employee.primary_branch_id<>v_device.branch_id then raise exception 'This employee is not assigned to this kiosk branch.'; end if;
  update public.hr_employee_clock_credential set failed_attempts=0,locked_until=null,updated_at=now() where id=v_credential.id;
  update public.hr_attendance_device set failed_attempts=0,locked_until=null,last_seen_at=now(),updated_at=now() where id=v_device.id;
  select coalesce(timezone,'Africa/Johannesburg') into v_tz from public.company_profile_settings where company_id=v_device.company_id;
  if v_tz is null then v_tz:='Africa/Johannesburg'; end if;
  v_work_date := timezone(v_tz,v_now)::date;
  if v_action='clock_in' then
    if exists(select 1 from public.hr_time_entry where company_id=v_device.company_id and employee_id=v_employee.id and status='open') then raise exception 'Employee is already clocked in.'; end if;
    insert into public.hr_time_entry(company_id,employee_id,branch_id,work_date,clock_in_at,status,source,notes,created_by,metadata)
    values(v_device.company_id,v_employee.id,v_device.branch_id,v_work_date,v_now,'open','kiosk','Verified employee self-clock at registered kiosk.',null,jsonb_build_object('device_id',v_device.id,'device_code',v_device.device_code,'badge_code',v_credential.badge_code,'verified_self_service',true)) returning * into v_entry;
    insert into public.hr_attendance_event(company_id,employee_id,time_entry_id,branch_id,event_type,occurred_at,source,notes,recorded_by,metadata)
    values(v_device.company_id,v_employee.id,v_entry.id,v_device.branch_id,'clock_in',v_now,'kiosk','Verified employee self-clock at registered kiosk.',null,jsonb_build_object('device_id',v_device.id,'device_code',v_device.device_code,'verified_self_service',true));
    select ra.planned_start_at,st.start_time,st.late_grace_minutes,st.name into v_shift
    from public.hr_roster_assignment ra join public.hr_shift_template st on st.id=ra.shift_template_id
    where ra.company_id=v_device.company_id and ra.employee_id=v_employee.id and ra.shift_date=v_work_date
    order by ra.planned_start_at limit 1;
    if v_shift.planned_start_at is not null then v_late := greatest(0,floor(extract(epoch from (v_now-v_shift.planned_start_at))/60)::integer-coalesce(v_shift.late_grace_minutes,0)); end if;
    insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
    values(v_device.company_id,null,'hr_kiosk_clock_in','hr',v_entry.id,'Employee self-clocked in at registered kiosk.',jsonb_build_object('employee_id',v_employee.id,'device_id',v_device.id,'branch_id',v_device.branch_id,'verified_self_service',true));
    return jsonb_build_object('ok',true,'action','clock_in','employee_id',v_employee.id,'employee_number',v_employee.employee_number,'employee_name',v_employee.first_name||' '||v_employee.last_name,'occurred_at',v_now,'work_date',v_work_date,'shift_name',v_shift.name,'late_minutes',v_late);
  end if;
  select * into v_entry from public.hr_time_entry where company_id=v_device.company_id and employee_id=v_employee.id and status='open' order by clock_in_at desc limit 1 for update;
  if not found then raise exception 'Employee is not currently clocked in.'; end if;
  update public.hr_time_entry set clock_out_at=v_now,status='completed',updated_at=now() where id=v_entry.id returning * into v_entry;
  insert into public.hr_attendance_event(company_id,employee_id,time_entry_id,branch_id,event_type,occurred_at,source,notes,recorded_by,metadata)
  values(v_device.company_id,v_employee.id,v_entry.id,v_device.branch_id,'clock_out',v_now,'kiosk','Verified employee self-clock at registered kiosk.',null,jsonb_build_object('device_id',v_device.id,'device_code',v_device.device_code,'verified_self_service',true));
  v_duration := greatest(0,floor(extract(epoch from (v_now-v_entry.clock_in_at))/60)::integer-v_entry.break_minutes);
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_device.company_id,null,'hr_kiosk_clock_out','hr',v_entry.id,'Employee self-clocked out at registered kiosk.',jsonb_build_object('employee_id',v_employee.id,'device_id',v_device.id,'branch_id',v_device.branch_id,'duration_minutes',v_duration,'verified_self_service',true));
  return jsonb_build_object('ok',true,'action','clock_out','employee_id',v_employee.id,'employee_number',v_employee.employee_number,'employee_name',v_employee.first_name||' '||v_employee.last_name,'occurred_at',v_now,'work_date',v_work_date,'duration_minutes',v_duration);
end;
$$;;
