create or replace function public.get_hr_employee_management(p_employee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_employee public.hr_employee%rowtype;
  v_can_view boolean;
  v_can_manage_employee boolean;
  v_can_manage_schedule boolean;
  v_can_manage_leave boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;

  v_can_view := public.current_user_has_permission('hr.view');
  if not v_can_view then raise exception 'Permission denied: hr.view'; end if;

  v_company_id := public.current_company_id();
  v_can_manage_employee := public.current_user_has_permission('hr.employee.manage');
  v_can_manage_schedule := public.current_user_has_permission('hr.schedule.manage');
  v_can_manage_leave := public.current_user_has_permission('hr.leave.manage');

  select * into v_employee
  from public.hr_employee
  where id=p_employee_id and company_id=v_company_id;

  if not found then raise exception 'Employee could not be found.'; end if;

  return jsonb_build_object(
    'ok', true,
    'can_manage_employee', v_can_manage_employee,
    'can_manage_schedule', v_can_manage_schedule,
    'can_manage_leave', v_can_manage_leave,
    'employee', jsonb_build_object(
      'id', v_employee.id,
      'employee_number', v_employee.employee_number,
      'first_name', v_employee.first_name,
      'last_name', v_employee.last_name,
      'preferred_name', v_employee.preferred_name,
      'email', v_employee.email,
      'phone', v_employee.phone,
      'user_id', v_employee.user_id,
      'primary_branch_id', v_employee.primary_branch_id,
      'department_id', v_employee.department_id,
      'position_id', v_employee.position_id,
      'manager_employee_id', v_employee.manager_employee_id,
      'employment_type', v_employee.employment_type,
      'status', v_employee.status,
      'hire_date', v_employee.hire_date,
      'end_date', v_employee.end_date,
      'standard_hours_per_week', v_employee.standard_hours_per_week,
      'internal_notes', case when v_can_manage_employee then v_employee.internal_notes else null end
    ),
    'availability', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,
        'day_of_week',a.day_of_week,
        'is_available',a.is_available,
        'available_from',a.available_from,
        'available_to',a.available_to,
        'notes',a.notes
      ) order by a.day_of_week)
      from public.hr_employee_availability a
      where a.company_id=v_company_id and a.employee_id=v_employee.id
    ), '[]'::jsonb),
    'leave_balances', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',lb.id,
        'leave_type_id',lb.leave_type_id,
        'leave_type_name',lt.name,
        'period_start',lb.period_start,
        'period_end',lb.period_end,
        'opening_units',lb.opening_units,
        'accrued_units',lb.accrued_units,
        'adjustment_units',lb.adjustment_units,
        'used_units',(
          select coalesce(sum(
            (least(lr.end_date,lb.period_end) - greatest(lr.start_date,lb.period_start) + 1)
          ),0)
          from public.hr_leave_request lr
          where lr.company_id=v_company_id
            and lr.employee_id=lb.employee_id
            and lr.leave_type_id=lb.leave_type_id
            and lr.status='approved'
            and lr.start_date<=lb.period_end
            and lr.end_date>=lb.period_start
        ),
        'available_units',lb.opening_units+lb.accrued_units+lb.adjustment_units-(
          select coalesce(sum(
            (least(lr.end_date,lb.period_end) - greatest(lr.start_date,lb.period_start) + 1)
          ),0)
          from public.hr_leave_request lr
          where lr.company_id=v_company_id
            and lr.employee_id=lb.employee_id
            and lr.leave_type_id=lb.leave_type_id
            and lr.status='approved'
            and lr.start_date<=lb.period_end
            and lr.end_date>=lb.period_start
        ),
        'notes',lb.notes
      ) order by lt.name,lb.period_start desc)
      from public.hr_leave_balance lb
      join public.hr_leave_type lt on lt.id=lb.leave_type_id
      where lb.company_id=v_company_id and lb.employee_id=v_employee.id
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_hr_employee_management(uuid) from public;
revoke all on function public.get_hr_employee_management(uuid) from anon;
grant execute on function public.get_hr_employee_management(uuid) to authenticated;;
