-- JINLAB Nexus HR: self-only clocking, default organisation structure, Nexus role directory.

create unique index if not exists hr_employee_company_user_unique
on public.hr_employee(company_id, user_id)
where user_id is not null;

create or replace function public.ensure_hr_default_org_structure(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_company_id is null or not exists(select 1 from public.company where id=p_company_id) then
    raise exception 'Company could not be found.';
  end if;

  insert into public.hr_department(company_id,name,code,is_active,created_by)
  values
    (p_company_id,'Administration','ADMIN',true,null),
    (p_company_id,'Operations','OPS',true,null),
    (p_company_id,'Technical','TECH',true,null),
    (p_company_id,'Sales & Customer Service','SALES',true,null),
    (p_company_id,'Finance','FIN',true,null),
    (p_company_id,'Human Resources','HR',true,null)
  on conflict do nothing;

  insert into public.hr_position(company_id,department_id,title,code,is_active,created_by)
  values
    (p_company_id,(select id from public.hr_department where company_id=p_company_id and lower(code)='admin' limit 1),'Owner / Director','OWNER',true,null),
    (p_company_id,(select id from public.hr_department where company_id=p_company_id and lower(code)='ops' limit 1),'Manager','MANAGER',true,null),
    (p_company_id,(select id from public.hr_department where company_id=p_company_id and lower(code)='admin' limit 1),'Administrator','ADMIN',true,null),
    (p_company_id,(select id from public.hr_department where company_id=p_company_id and lower(code)='tech' limit 1),'Technician','TECH',true,null),
    (p_company_id,(select id from public.hr_department where company_id=p_company_id and lower(code)='sales' limit 1),'Sales / Customer Service','SALES',true,null),
    (p_company_id,(select id from public.hr_department where company_id=p_company_id and lower(code)='sales' limit 1),'Cashier','CASHIER',true,null),
    (p_company_id,(select id from public.hr_department where company_id=p_company_id and lower(code)='hr' limit 1),'HR Officer','HROFFICER',true,null)
  on conflict do nothing;
end;
$$;

revoke all on function public.ensure_hr_default_org_structure(uuid) from public, anon, authenticated;

-- Seed every company that already exists.
do $$
declare v_company record;
begin
  for v_company in select id from public.company loop
    perform public.ensure_hr_default_org_structure(v_company.id);
  end loop;
end $$;

-- Ensure the global Nexus role catalogue is complete.
insert into public.roles(role_name)
values ('owner'),('admin'),('manager'),('employee'),('technician'),('cashier'),('viewer')
on conflict(role_name) do nothing;

create or replace function public.get_hr_directory_metadata()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_can_all boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.view') and not public.current_user_has_permission('hr.self') then
    raise exception 'Permission denied: HR access required.';
  end if;

  v_company_id := public.current_company_id();
  v_can_all := public.current_user_has_permission('hr.view');
  perform public.ensure_hr_default_org_structure(v_company_id);

  return jsonb_build_object(
    'ok', true,
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('id',r.id,'role_name',r.role_name) order by
        case r.role_name
          when 'owner' then 1 when 'admin' then 2 when 'manager' then 3
          when 'employee' then 4 when 'technician' then 5 when 'cashier' then 6 when 'viewer' then 7
          else 99 end,
        r.role_name)
      from public.roles r
    ), '[]'::jsonb),
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', up.user_id,
        'full_name', up.full_name,
        'email', up.email,
        'role', up.role,
        'employee_id', e.id,
        'employee_number', e.employee_number,
        'employee_name', case when e.id is null then null else e.first_name||' '||e.last_name end
      ) order by up.full_name)
      from public.user_profile up
      left join public.hr_employee e
        on e.company_id=up.company_id and e.user_id=up.user_id
      where up.company_id=v_company_id
        and (v_can_all or up.user_id=auth.uid())
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_hr_directory_metadata() from public, anon;
grant execute on function public.get_hr_directory_metadata() to authenticated;

-- Clocking is now strictly self-service. Managers/owners supervise and correct through review workflows,
-- but they cannot impersonate another employee's physical clock action.
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
set search_path = public
as $$
declare
  v_company_id uuid;
  v_employee public.hr_employee%rowtype;
  v_entry public.hr_time_entry%rowtype;
  v_action text;
  v_source text;
  v_branch_id uuid;
  v_tz text;
  v_work_date date;
  v_now timestamptz := now();
  v_duration integer;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.self') then raise exception 'Permission denied: hr.self'; end if;

  v_company_id := public.current_company_id();

  if p_employee_id is null then
    select * into v_employee
    from public.hr_employee
    where company_id=v_company_id and user_id=auth.uid()
    limit 1;
  else
    select * into v_employee
    from public.hr_employee
    where company_id=v_company_id and id=p_employee_id
    limit 1;
  end if;

  if not found then raise exception 'Employee profile could not be found.'; end if;
  if v_employee.user_id is null or v_employee.user_id <> auth.uid() then
    raise exception 'Employees may only clock themselves. Managers and owners cannot clock another employee in or out.';
  end if;

  v_action := lower(btrim(coalesce(p_action,'')));
  if v_action not in ('clock_in','clock_out') then raise exception 'Action must be clock_in or clock_out.'; end if;

  v_source := lower(btrim(coalesce(p_source,'web')));
  if v_source not in ('web','mobile','kiosk','biometric','import','manual') then raise exception 'Unsupported attendance source.'; end if;

  v_branch_id := coalesce(p_branch_id,v_employee.primary_branch_id);
  if v_branch_id is not null and not exists(
    select 1 from public.branch b where b.id=v_branch_id and b.company_id=v_company_id
  ) then raise exception 'Branch could not be found.'; end if;

  select coalesce(timezone,'Africa/Johannesburg') into v_tz
  from public.company_profile_settings where company_id=v_company_id;
  if v_tz is null then v_tz := 'Africa/Johannesburg'; end if;
  v_work_date := timezone(v_tz,v_now)::date;

  if v_action='clock_in' then
    if v_employee.status<>'active' then raise exception 'Only active employees may clock in.'; end if;
    if exists(select 1 from public.hr_time_entry where company_id=v_company_id and employee_id=v_employee.id and status='open') then
      raise exception 'Employee is already clocked in.';
    end if;

    insert into public.hr_time_entry(company_id,employee_id,branch_id,work_date,clock_in_at,status,source,notes,created_by)
    values(v_company_id,v_employee.id,v_branch_id,v_work_date,v_now,'open',v_source,nullif(btrim(coalesce(p_notes,'')),''),auth.uid())
    returning * into v_entry;

    insert into public.hr_attendance_event(company_id,employee_id,time_entry_id,branch_id,event_type,occurred_at,source,notes,recorded_by)
    values(v_company_id,v_employee.id,v_entry.id,v_branch_id,'clock_in',v_now,v_source,nullif(btrim(coalesce(p_notes,'')),''),auth.uid());

    insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
    values(v_company_id,auth.uid(),'hr_clock_in','hr',v_entry.id,'Employee clocked themselves in.',jsonb_build_object('employee_id',v_employee.id,'branch_id',v_branch_id,'source',v_source));

    return jsonb_build_object('ok',true,'action','clock_in','time_entry_id',v_entry.id,'employee_id',v_employee.id,'employee_number',v_employee.employee_number,'clock_in_at',v_now,'work_date',v_work_date);
  end if;

  select * into v_entry
  from public.hr_time_entry
  where company_id=v_company_id and employee_id=v_employee.id and status='open'
  order by clock_in_at desc limit 1 for update;

  if not found then raise exception 'Employee is not currently clocked in.'; end if;

  update public.hr_time_entry
  set clock_out_at=v_now,status='completed'
  where id=v_entry.id
  returning * into v_entry;

  insert into public.hr_attendance_event(company_id,employee_id,time_entry_id,branch_id,event_type,occurred_at,source,notes,recorded_by)
  values(v_company_id,v_employee.id,v_entry.id,coalesce(v_branch_id,v_entry.branch_id),'clock_out',v_now,v_source,nullif(btrim(coalesce(p_notes,'')),''),auth.uid());

  v_duration := greatest(0,floor(extract(epoch from (v_now-v_entry.clock_in_at))/60)::integer-v_entry.break_minutes);

  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_clock_out','hr',v_entry.id,'Employee clocked themselves out.',jsonb_build_object('employee_id',v_employee.id,'duration_minutes',v_duration,'source',v_source));

  return jsonb_build_object('ok',true,'action','clock_out','time_entry_id',v_entry.id,'employee_id',v_employee.id,'employee_number',v_employee.employee_number,'clock_in_at',v_entry.clock_in_at,'clock_out_at',v_now,'duration_minutes',v_duration);
end;
$$;

revoke all on function public.clock_hr_employee(text,uuid,uuid,text,text) from public, anon;
grant execute on function public.clock_hr_employee(text,uuid,uuid,text,text) to authenticated;
;
