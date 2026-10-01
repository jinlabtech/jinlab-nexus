create or replace function public.get_hr_user_linking_workspace()
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.employee.manage') then
    raise exception 'Permission denied: hr.employee.manage';
  end if;

  v_company_id := public.current_company_id();

  return jsonb_build_object(
    'ok', true,
    'summary', jsonb_build_object(
      'nexus_users', (select count(*) from public.user_profile up where up.company_id=v_company_id),
      'hr_employees', (select count(*) from public.hr_employee e where e.company_id=v_company_id),
      'linked', (select count(*) from public.hr_employee e where e.company_id=v_company_id and e.user_id is not null),
      'unlinked_users', (
        select count(*)
        from public.user_profile up
        where up.company_id=v_company_id
          and not exists(
            select 1 from public.hr_employee e
            where e.company_id=v_company_id and e.user_id=up.user_id
          )
      ),
      'unlinked_employees', (
        select count(*) from public.hr_employee e
        where e.company_id=v_company_id and e.user_id is null
      )
    ),
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', up.user_id,
        'full_name', up.full_name,
        'email', up.email,
        'role', up.role,
        'linked_employee_id', e.id,
        'linked_employee_number', e.employee_number,
        'linked_employee_name', case when e.id is null then null else e.first_name||' '||e.last_name end
      ) order by up.full_name)
      from public.user_profile up
      left join public.hr_employee e
        on e.company_id=up.company_id and e.user_id=up.user_id
      where up.company_id=v_company_id
    ), '[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_id', e.id,
        'employee_number', e.employee_number,
        'employee_name', e.first_name||' '||e.last_name,
        'email', e.email,
        'status', e.status,
        'branch_name', (select b.branch_name from public.branch b where b.id=e.primary_branch_id),
        'position_title', (select p.title from public.hr_position p where p.id=e.position_id),
        'department_name', (select d.name from public.hr_department d where d.id=e.department_id),
        'linked_user_id', e.user_id,
        'linked_user_name', up.full_name,
        'linked_user_email', up.email,
        'linked_user_role', up.role
      ) order by e.employee_number)
      from public.hr_employee e
      left join public.user_profile up
        on up.company_id=e.company_id and up.user_id=e.user_id
      where e.company_id=v_company_id
    ), '[]'::jsonb),
    'suggestions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_id', e.id,
        'employee_number', e.employee_number,
        'employee_name', e.first_name||' '||e.last_name,
        'user_id', up.user_id,
        'user_name', up.full_name,
        'user_email', up.email,
        'role', up.role,
        'reason', case
          when e.email is not null and up.email is not null and lower(btrim(e.email))=lower(btrim(up.email)) then 'exact_email'
          else 'exact_name'
        end
      ) order by e.employee_number)
      from public.hr_employee e
      join public.user_profile up
        on up.company_id=e.company_id
      where e.company_id=v_company_id
        and e.user_id is null
        and not exists(
          select 1 from public.hr_employee x
          where x.company_id=v_company_id and x.user_id=up.user_id
        )
        and (
          (e.email is not null and up.email is not null and lower(btrim(e.email))=lower(btrim(up.email)))
          or regexp_replace(lower(btrim(e.first_name||e.last_name)),'[^a-z0-9]','','g') = regexp_replace(lower(btrim(coalesce(up.full_name,''))),'[^a-z0-9]','','g')
        )
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.link_hr_employee_user(
  p_employee_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_company_id uuid;
  v_employee public.hr_employee%rowtype;
  v_user public.user_profile%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.employee.manage') then
    raise exception 'Permission denied: hr.employee.manage';
  end if;

  v_company_id := public.current_company_id();

  select * into v_employee
  from public.hr_employee
  where id=p_employee_id and company_id=v_company_id
  for update;
  if not found then raise exception 'Employee could not be found.'; end if;

  select * into v_user
  from public.user_profile
  where user_id=p_user_id and company_id=v_company_id
  limit 1;
  if not found then raise exception 'Nexus user could not be found in this company.'; end if;

  if exists(
    select 1 from public.hr_employee e
    where e.company_id=v_company_id and e.user_id=p_user_id and e.id<>p_employee_id
  ) then
    raise exception 'This Nexus user is already linked to another HR employee.';
  end if;

  if v_employee.user_id is not null and v_employee.user_id<>p_user_id then
    raise exception 'This HR employee is already linked to another Nexus user. Unlink it first.';
  end if;

  update public.hr_employee
  set user_id=p_user_id, updated_by=auth.uid(), updated_at=now()
  where id=p_employee_id and company_id=v_company_id;

  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(
    v_company_id, auth.uid(), 'hr_user_linked', 'hr', p_employee_id,
    'Nexus user linked to HR employee.',
    jsonb_build_object(
      'employee_id', p_employee_id,
      'employee_number', v_employee.employee_number,
      'linked_user_id', p_user_id,
      'linked_user_name', v_user.full_name,
      'linked_user_role', v_user.role
    )
  );

  return jsonb_build_object(
    'ok', true,
    'employee_id', p_employee_id,
    'employee_number', v_employee.employee_number,
    'user_id', p_user_id,
    'user_name', v_user.full_name,
    'role', v_user.role
  );
end;
$function$;

create or replace function public.unlink_hr_employee_user(
  p_employee_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_company_id uuid;
  v_employee public.hr_employee%rowtype;
  v_old_user_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.employee.manage') then
    raise exception 'Permission denied: hr.employee.manage';
  end if;

  v_company_id := public.current_company_id();

  select * into v_employee
  from public.hr_employee
  where id=p_employee_id and company_id=v_company_id
  for update;
  if not found then raise exception 'Employee could not be found.'; end if;

  v_old_user_id := v_employee.user_id;

  update public.hr_employee
  set user_id=null, updated_by=auth.uid(), updated_at=now()
  where id=p_employee_id and company_id=v_company_id;

  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(
    v_company_id, auth.uid(), 'hr_user_unlinked', 'hr', p_employee_id,
    'Nexus user unlinked from HR employee.',
    jsonb_build_object(
      'employee_id', p_employee_id,
      'employee_number', v_employee.employee_number,
      'previous_user_id', v_old_user_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'employee_id', p_employee_id,
    'employee_number', v_employee.employee_number,
    'previous_user_id', v_old_user_id
  );
end;
$function$;

revoke all on function public.get_hr_user_linking_workspace() from public, anon;
revoke all on function public.link_hr_employee_user(uuid,uuid) from public, anon;
revoke all on function public.unlink_hr_employee_user(uuid) from public, anon;

grant execute on function public.get_hr_user_linking_workspace() to authenticated;
grant execute on function public.link_hr_employee_user(uuid,uuid) to authenticated;
grant execute on function public.unlink_hr_employee_user(uuid) to authenticated;;
