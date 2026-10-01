create or replace function public.ensure_my_hr_profile(p_branch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_profile public.user_profile%rowtype;
  v_employee public.hr_employee%rowtype;
  v_branch_id uuid;
  v_branch_count integer;
  v_position_id uuid;
  v_department_id uuid;
  v_position_code text;
  v_full_name text;
  v_first_name text;
  v_last_name text;
  v_employee_number text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.employee.manage') then raise exception 'Permission denied: hr.employee.manage'; end if;

  v_company_id := public.current_company_id();

  select * into v_profile
  from public.user_profile
  where company_id=v_company_id and user_id=auth.uid()
  limit 1;
  if not found then raise exception 'Nexus user profile could not be found.'; end if;

  select * into v_employee
  from public.hr_employee
  where company_id=v_company_id and user_id=auth.uid()
  limit 1;
  if found then
    return jsonb_build_object('ok',true,'created',false,'employee_id',v_employee.id,'employee_number',v_employee.employee_number,'branch_id',v_employee.primary_branch_id);
  end if;

  perform public.ensure_hr_default_org_structure(v_company_id);

  if p_branch_id is not null then
    if not exists(select 1 from public.branch b where b.id=p_branch_id and b.company_id=v_company_id) then
      raise exception 'Branch could not be found.';
    end if;
    v_branch_id := p_branch_id;
  else
    select count(*) into v_branch_count from public.branch b where b.company_id=v_company_id;
    if v_branch_count = 1 then
      select b.id into v_branch_id from public.branch b where b.company_id=v_company_id limit 1;
    else
      v_branch_id := null;
    end if;
  end if;

  v_position_code := case lower(coalesce(v_profile.role,''))
    when 'owner' then 'OWNER'
    when 'admin' then 'ADMIN'
    when 'manager' then 'MANAGER'
    when 'technician' then 'TECH'
    when 'cashier' then 'CASHIER'
    else null
  end;

  if v_position_code is not null then
    select p.id,p.department_id into v_position_id,v_department_id
    from public.hr_position p
    where p.company_id=v_company_id and upper(p.code)=v_position_code and p.is_active=true
    limit 1;
  end if;

  v_full_name := btrim(coalesce(v_profile.full_name,''));
  if v_full_name='' then
    v_full_name := coalesce(nullif(split_part(coalesce(v_profile.email,''),'@',1),''),'Nexus User');
  end if;
  v_first_name := split_part(v_full_name,' ',1);
  v_last_name := nullif(btrim(substr(v_full_name,length(v_first_name)+1)),'');
  if v_last_name is null then v_last_name := 'User'; end if;

  v_employee_number := public.generate_hr_employee_number(v_company_id);

  insert into public.hr_employee(
    company_id,user_id,employee_number,first_name,last_name,email,
    primary_branch_id,department_id,position_id,employment_type,status,
    hire_date,standard_hours_per_week,created_by,updated_by
  ) values (
    v_company_id,auth.uid(),v_employee_number,v_first_name,v_last_name,
    nullif(btrim(coalesce(v_profile.email,'')),''),v_branch_id,v_department_id,v_position_id,
    'permanent','active',current_date,45,auth.uid(),auth.uid()
  ) returning * into v_employee;

  perform public.ensure_hr_default_leave_types(v_company_id);

  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_self_profile_bootstrapped','hr',v_employee.id,
    'Owner/admin HR employee profile created from Nexus user profile.',
    jsonb_build_object('employee_number',v_employee.employee_number,'branch_id',v_branch_id,'position_id',v_position_id,'source_role',v_profile.role));

  return jsonb_build_object('ok',true,'created',true,'employee_id',v_employee.id,'employee_number',v_employee.employee_number,'branch_id',v_branch_id);
end;
$function$;

revoke all on function public.ensure_my_hr_profile(uuid) from public, anon;
grant execute on function public.ensure_my_hr_profile(uuid) to authenticated;;
