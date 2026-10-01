create or replace function public.get_hr_self_service(
  p_start_date date default current_date,
  p_end_date date default (current_date + 30)
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_employee public.hr_employee%rowtype;
  v_role text;
  v_open_entry public.hr_time_entry%rowtype;
  v_tz text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.self') then raise exception 'Permission denied: hr.self'; end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date or p_end_date - p_start_date > 93 then
    raise exception 'Schedule range is invalid.';
  end if;

  v_company_id := public.current_company_id();
  select * into v_employee
  from public.hr_employee
  where company_id=v_company_id and user_id=auth.uid()
  limit 1;

  if not found then
    raise exception 'No HR employee profile is linked to this Nexus user.';
  end if;

  select role into v_role
  from public.user_profile
  where company_id=v_company_id and user_id=auth.uid()
  limit 1;

  select coalesce(timezone,'Africa/Johannesburg') into v_tz
  from public.company_profile_settings
  where company_id=v_company_id;
  if v_tz is null then v_tz := 'Africa/Johannesburg'; end if;

  select * into v_open_entry
  from public.hr_time_entry
  where company_id=v_company_id and employee_id=v_employee.id and status='open'
  order by clock_in_at desc
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'timezone', v_tz,
    'employee', jsonb_build_object(
      'id', v_employee.id,
      'employee_number', v_employee.employee_number,
      'name', v_employee.first_name||' '||v_employee.last_name,
      'role', v_role,
      'status', v_employee.status,
      'branch_name', (select branch_name from public.branch where id=v_employee.primary_branch_id),
      'is_clocked_in', v_open_entry.id is not null,
      'clock_in_at', v_open_entry.clock_in_at
    ),
    'availability', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'day_of_week', a.day_of_week,
          'is_available', a.is_available,
          'available_from', a.available_from,
          'available_to', a.available_to,
          'notes', a.notes
        ) order by a.day_of_week
      )
      from public.hr_employee_availability a
      where a.company_id=v_company_id and a.employee_id=v_employee.id
    ), '[]'::jsonb),
    'schedule', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ra.id,
          'shift_date', ra.shift_date,
          'shift_name', st.name,
          'status', ra.status,
          'branch_name', (select branch_name from public.branch where id=ra.branch_id),
          'required_arrival_time', st.start_time,
          'customer_open_time', st.customer_open_time,
          'break_start_time', st.break_start_time,
          'break_end_time', st.break_end_time,
          'finish_time', st.end_time,
          'planned_start_at', ra.planned_start_at,
          'planned_end_at', ra.planned_end_at
        ) order by ra.shift_date, ra.planned_start_at
      )
      from public.hr_roster_assignment ra
      join public.hr_shift_template st on st.id=ra.shift_template_id
      where ra.company_id=v_company_id
        and ra.employee_id=v_employee.id
        and ra.shift_date between p_start_date and p_end_date
    ), '[]'::jsonb),
    'today_shift', (
      select jsonb_build_object(
        'id', ra.id,
        'shift_date', ra.shift_date,
        'shift_name', st.name,
        'status', ra.status,
        'branch_name', (select branch_name from public.branch where id=ra.branch_id),
        'required_arrival_time', st.start_time,
        'customer_open_time', st.customer_open_time,
        'break_start_time', st.break_start_time,
        'break_end_time', st.break_end_time,
        'finish_time', st.end_time,
        'planned_start_at', ra.planned_start_at,
        'planned_end_at', ra.planned_end_at
      )
      from public.hr_roster_assignment ra
      join public.hr_shift_template st on st.id=ra.shift_template_id
      where ra.company_id=v_company_id
        and ra.employee_id=v_employee.id
        and ra.shift_date=(timezone(v_tz, now()))::date
      order by ra.planned_start_at
      limit 1
    )
  );
end;
$function$;

revoke all on function public.get_hr_self_service(date,date) from public;
revoke all on function public.get_hr_self_service(date,date) from anon;
grant execute on function public.get_hr_self_service(date,date) to authenticated;;
