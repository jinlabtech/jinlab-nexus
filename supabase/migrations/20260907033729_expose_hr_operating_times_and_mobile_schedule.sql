create or replace function public.save_hr_shift_template_v2(
  p_id uuid,
  p_name text,
  p_code text,
  p_start_time time without time zone,
  p_customer_open_time time without time zone default null,
  p_end_time time without time zone default null,
  p_break_start_time time without time zone default null,
  p_break_end_time time without time zone default null,
  p_break_minutes integer default 0,
  p_late_grace_minutes integer default 5,
  p_overtime_threshold_minutes integer default 30,
  p_days_of_week smallint[] default array[1,2,3,4,5]::smallint[],
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_company_id uuid;
  v_id uuid;
  v_break_minutes integer;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.schedule.manage') then raise exception 'Permission denied: hr.schedule.manage'; end if;

  v_company_id:=public.current_company_id();

  if btrim(coalesce(p_name,''))='' or btrim(coalesce(p_code,''))='' then
    raise exception 'Shift name and code are required.';
  end if;
  if p_start_time is null or p_end_time is null then
    raise exception 'Shift start and end times are required.';
  end if;
  if p_days_of_week is null or cardinality(p_days_of_week)=0 or not (p_days_of_week <@ array[1,2,3,4,5,6,7]::smallint[]) then
    raise exception 'Choose valid days of week.';
  end if;
  if p_customer_open_time is not null and p_end_time > p_start_time and (p_customer_open_time < p_start_time or p_customer_open_time > p_end_time) then
    raise exception 'Customer opening time must fall within the shift.';
  end if;
  if p_break_start_time is not null and p_break_end_time is not null then
    if p_break_end_time <= p_break_start_time then raise exception 'Break end must be after break start.'; end if;
    v_break_minutes:=floor(extract(epoch from (p_break_end_time-p_break_start_time))/60)::integer;
  else
    v_break_minutes:=coalesce(p_break_minutes,0);
  end if;
  if v_break_minutes<0 or v_break_minutes>1440 then raise exception 'Break minutes are invalid.'; end if;

  if p_id is null then
    insert into public.hr_shift_template(
      company_id,name,code,start_time,end_time,break_minutes,
      late_grace_minutes,overtime_threshold_minutes,is_active,
      customer_open_time,break_start_time,break_end_time,days_of_week,created_by
    )
    values(
      v_company_id,btrim(p_name),upper(btrim(p_code)),p_start_time,p_end_time,v_break_minutes,
      coalesce(p_late_grace_minutes,5),coalesce(p_overtime_threshold_minutes,30),coalesce(p_is_active,true),
      p_customer_open_time,p_break_start_time,p_break_end_time,p_days_of_week,auth.uid()
    )
    returning id into v_id;
  else
    update public.hr_shift_template
    set name=btrim(p_name),
        code=upper(btrim(p_code)),
        start_time=p_start_time,
        customer_open_time=p_customer_open_time,
        end_time=p_end_time,
        break_start_time=p_break_start_time,
        break_end_time=p_break_end_time,
        break_minutes=v_break_minutes,
        late_grace_minutes=coalesce(p_late_grace_minutes,5),
        overtime_threshold_minutes=coalesce(p_overtime_threshold_minutes,30),
        days_of_week=p_days_of_week,
        is_active=coalesce(p_is_active,true),
        updated_at=now()
    where id=p_id and company_id=v_company_id
    returning id into v_id;

    if v_id is null then raise exception 'Shift template could not be found.'; end if;
  end if;

  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(
    v_company_id,auth.uid(),'hr_shift_saved','hr',v_id,'HR shift template saved.',
    jsonb_build_object(
      'code',upper(btrim(p_code)),
      'name',btrim(p_name),
      'start_time',p_start_time,
      'customer_open_time',p_customer_open_time,
      'end_time',p_end_time,
      'break_start_time',p_break_start_time,
      'break_end_time',p_break_end_time,
      'days_of_week',p_days_of_week
    )
  );

  return jsonb_build_object(
    'ok',true,'id',v_id,'name',btrim(p_name),'code',upper(btrim(p_code)),
    'start_time',p_start_time,'customer_open_time',p_customer_open_time,
    'end_time',p_end_time,'break_start_time',p_break_start_time,
    'break_end_time',p_break_end_time,'days_of_week',p_days_of_week
  );
end;
$function$;

revoke all on function public.save_hr_shift_template_v2(uuid,text,text,time,time,time,time,time,integer,integer,integer,smallint[],boolean) from public, anon;
grant execute on function public.save_hr_shift_template_v2(uuid,text,text,time,time,time,time,time,integer,integer,integer,smallint[],boolean) to authenticated;

create or replace function public.get_hr_mobile_schedule(
  p_start_date date default current_date,
  p_end_date date default current_date + 30
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_company_id uuid;
  v_employee public.hr_employee%rowtype;
  v_role text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.self') then raise exception 'Permission denied: hr.self'; end if;
  if p_end_date<p_start_date or p_end_date-p_start_date>93 then raise exception 'Schedule range is invalid.'; end if;

  v_company_id:=public.current_company_id();
  select * into v_employee from public.hr_employee where company_id=v_company_id and user_id=auth.uid() limit 1;
  if not found then raise exception 'No HR employee profile is linked to this Nexus user.'; end if;
  select role into v_role from public.user_profile where company_id=v_company_id and user_id=auth.uid() limit 1;

  return jsonb_build_object(
    'ok',true,
    'employee',jsonb_build_object(
      'id',v_employee.id,
      'employee_number',v_employee.employee_number,
      'name',v_employee.first_name||' '||v_employee.last_name,
      'role',v_role,
      'branch_name',(select branch_name from public.branch where id=v_employee.primary_branch_id)
    ),
    'schedule',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',ra.id,
          'shift_date',ra.shift_date,
          'shift_name',st.name,
          'status',ra.status,
          'branch_name',(select branch_name from public.branch where id=ra.branch_id),
          'required_arrival_time',st.start_time,
          'customer_open_time',st.customer_open_time,
          'break_start_time',st.break_start_time,
          'break_end_time',st.break_end_time,
          'finish_time',st.end_time,
          'planned_start_at',ra.planned_start_at,
          'planned_end_at',ra.planned_end_at
        ) order by ra.shift_date,ra.planned_start_at
      )
      from public.hr_roster_assignment ra
      join public.hr_shift_template st on st.id=ra.shift_template_id
      where ra.company_id=v_company_id
        and ra.employee_id=v_employee.id
        and ra.shift_date between p_start_date and p_end_date
    ),'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_hr_mobile_schedule(date,date) from public, anon;
grant execute on function public.get_hr_mobile_schedule(date,date) to authenticated;;
