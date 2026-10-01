create or replace function public.set_my_hr_clock_pin(
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
  if not public.current_user_has_permission('hr.self') then raise exception 'Permission denied: hr.self'; end if;
  v_company_id := public.current_company_id();
  select * into v_employee from public.hr_employee where company_id=v_company_id and user_id=auth.uid() limit 1;
  if not found then raise exception 'No HR employee profile is linked to this Nexus user.'; end if;
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
  values(v_company_id,auth.uid(),'hr_self_clock_credential_set','hr',v_id,'Employee configured their own kiosk clock PIN.',jsonb_build_object('employee_id',v_employee.id,'badge_code',v_badge));
  return jsonb_build_object('ok',true,'employee_id',v_employee.id,'employee_number',v_employee.employee_number,'badge_code',v_badge);
end;
$$;

revoke all on function public.set_my_hr_clock_pin(text,text) from public, anon;
grant execute on function public.set_my_hr_clock_pin(text,text) to authenticated;

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
  v_tz text;
begin
  select * into v_device from public.hr_attendance_device
  where id=p_device_id and status='active' and device_secret_hash=encode(extensions.digest(coalesce(p_device_secret,''),'sha256'),'hex') for update;
  if not found then raise exception 'Invalid or inactive attendance device.'; end if;
  if v_device.locked_until is not null and v_device.locked_until>now() then raise exception 'Attendance device is temporarily locked.'; end if;
  update public.hr_attendance_device set last_seen_at=now(),updated_at=now() where id=v_device.id;
  select company_name into v_company_name from public.company where id=v_device.company_id;
  select branch_name into v_branch_name from public.branch where id=v_device.branch_id;
  select coalesce(timezone,'Africa/Johannesburg') into v_tz from public.company_profile_settings where company_id=v_device.company_id;
  if v_tz is null then v_tz:='Africa/Johannesburg'; end if;
  return jsonb_build_object('ok',true,'device_id',v_device.id,'device_code',v_device.device_code,'device_name',v_device.name,'company_name',v_company_name,'branch_id',v_device.branch_id,'branch_name',v_branch_name,'timezone',v_tz,'allowed_methods',v_device.allowed_methods);
end;
$$;;
