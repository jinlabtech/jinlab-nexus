create or replace function public.list_repair_assignable_employees()
returns table(
  id uuid,
  employee_number text,
  display_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not (
    public.current_user_has_permission('repair.assign')
    or public.current_user_has_permission('repair.manage')
  ) then
    raise exception 'Permission denied: repair.assign';
  end if;

  v_company_id := public.current_company_id();

  return query
  select
    e.id,
    e.employee_number,
    nullif(btrim(concat_ws(' ', e.first_name, e.last_name)), '') as display_name
  from public.hr_employee e
  where e.company_id = v_company_id
    and e.status = 'active'
    and e.user_id is not null
    and public.user_has_effective_permission(e.user_id, v_company_id, 'repair.start')
    and public.user_has_effective_permission(e.user_id, v_company_id, 'repair.update')
  order by e.first_name, e.last_name;
end;
$$;

revoke all on function public.list_repair_assignable_employees() from public;
revoke all on function public.list_repair_assignable_employees() from anon;
grant execute on function public.list_repair_assignable_employees() to authenticated;;
