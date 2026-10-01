create or replace function public.get_hr_operations_workspace(
  p_branch_id uuid default null::uuid,
  p_start_date date default current_date,
  p_end_date date default (current_date + 14)
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare v_company_id uuid; v_employee_id uuid; v_is_manager boolean; v_is_self boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  v_company_id:=public.current_company_id();
  v_is_manager:=public.current_user_has_permission('hr.view');
  v_is_self:=public.current_user_has_permission('hr.self');
  if not v_is_manager and not v_is_self then raise exception 'Permission denied: HR access required.'; end if;
  if p_end_date<p_start_date or p_end_date-p_start_date>366 then raise exception 'Date range is invalid.'; end if;
  if p_branch_id is not null and not exists(select 1 from public.branch where id=p_branch_id and company_id=v_company_id) then raise exception 'Branch could not be found.'; end if;
  select id into v_employee_id from public.hr_employee where company_id=v_company_id and user_id=auth.uid() limit 1;

  return jsonb_build_object(
    'ok',true,
    'mode',case when v_is_manager then 'management' else 'self' end,
    'branches',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.branch_name) order by b.branch_name) from public.branch b where b.company_id=v_company_id),'[]'::jsonb),
    'shift_templates',case when public.current_user_has_permission('hr.schedule.manage') then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'name',s.name,'code',s.code,'start_time',s.start_time,'end_time',s.end_time,
        'customer_open_time',s.customer_open_time,'break_start_time',s.break_start_time,'break_end_time',s.break_end_time,
        'break_minutes',s.break_minutes,'late_grace_minutes',s.late_grace_minutes,'overtime_threshold_minutes',s.overtime_threshold_minutes,
        'days_of_week',s.days_of_week,'is_active',s.is_active
      ) order by s.name)
      from public.hr_shift_template s where s.company_id=v_company_id
    ),'[]'::jsonb) else '[]'::jsonb end,
    'roster',coalesce((
      select jsonb_agg(x.obj order by x.shift_date,x.planned_start_at)
      from (
        select ra.shift_date,ra.planned_start_at,
          jsonb_build_object(
            'id',ra.id,'employee_id',e.id,'employee_number',e.employee_number,'employee_name',e.first_name||' '||e.last_name,
            'branch_name',(select branch_name from public.branch where id=ra.branch_id),
            'shift_name',st.name,'shift_date',ra.shift_date,'planned_start_at',ra.planned_start_at,'planned_end_at',ra.planned_end_at,
            'required_arrival_time',st.start_time,'customer_open_time',st.customer_open_time,
            'break_start_time',st.break_start_time,'break_end_time',st.break_end_time,'finish_time',st.end_time,
            'status',ra.status
          ) obj
        from public.hr_roster_assignment ra
        join public.hr_employee e on e.id=ra.employee_id
        join public.hr_shift_template st on st.id=ra.shift_template_id
        where ra.company_id=v_company_id
          and ra.shift_date between p_start_date and p_end_date
          and (p_branch_id is null or ra.branch_id=p_branch_id)
          and (v_is_manager or ra.employee_id=v_employee_id)
      ) x
    ),'[]'::jsonb),
    'attendance_exceptions',case when v_is_manager then coalesce((
      select jsonb_agg(x.obj order by x.exception_date desc)
      from (
        select ae.exception_date,
          jsonb_build_object('id',ae.id,'employee_id',e.id,'employee_name',e.first_name||' '||e.last_name,'exception_type',ae.exception_type,'severity',ae.severity,'status',ae.status,'minutes_variance',ae.minutes_variance,'details',ae.details,'exception_date',ae.exception_date,'branch_name',(select branch_name from public.branch where id=ae.branch_id)) obj
        from public.hr_attendance_exception ae
        join public.hr_employee e on e.id=ae.employee_id
        where ae.company_id=v_company_id
          and ae.exception_date between p_start_date and p_end_date
          and (p_branch_id is null or ae.branch_id=p_branch_id)
        order by ae.exception_date desc limit 200
      ) x
    ),'[]'::jsonb) else '[]'::jsonb end,
    'leave_balances',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',lb.id,'employee_id',e.id,'employee_name',e.first_name||' '||e.last_name,'leave_type',lt.name,
        'period_start',lb.period_start,'period_end',lb.period_end,'opening_units',lb.opening_units,'accrued_units',lb.accrued_units,
        'adjustment_units',lb.adjustment_units,
        'used_units',(select coalesce(sum(lr.calendar_days),0) from public.hr_leave_request lr where lr.company_id=v_company_id and lr.employee_id=lb.employee_id and lr.leave_type_id=lb.leave_type_id and lr.status='approved' and lr.start_date<=lb.period_end and lr.end_date>=lb.period_start),
        'available_units',lb.opening_units+lb.accrued_units+lb.adjustment_units-(select coalesce(sum(lr.calendar_days),0) from public.hr_leave_request lr where lr.company_id=v_company_id and lr.employee_id=lb.employee_id and lr.leave_type_id=lb.leave_type_id and lr.status='approved' and lr.start_date<=lb.period_end and lr.end_date>=lb.period_start)
      ) order by e.last_name,e.first_name,lt.name)
      from public.hr_leave_balance lb
      join public.hr_employee e on e.id=lb.employee_id
      join public.hr_leave_type lt on lt.id=lb.leave_type_id
      where lb.company_id=v_company_id and (v_is_manager or lb.employee_id=v_employee_id)
    ),'[]'::jsonb),
    'performance_summary',case when v_is_manager then jsonb_build_object(
      'open_reviews',(select count(*) from public.hr_performance_review where company_id=v_company_id and status in ('draft','submitted')),
      'closed_reviews',(select count(*) from public.hr_performance_review where company_id=v_company_id and status in ('acknowledged','closed'))
    ) else '{}'::jsonb end,
    'discipline_summary',case when public.current_user_has_permission('hr.discipline.manage') then jsonb_build_object(
      'open_cases',(select count(*) from public.hr_disciplinary_case where company_id=v_company_id and status in ('open','issued','appealed')),
      'closed_cases',(select count(*) from public.hr_disciplinary_case where company_id=v_company_id and status in ('closed','withdrawn'))
    ) else '{}'::jsonb end,
    'documents_summary',case when public.current_user_has_permission('hr.documents.manage') then jsonb_build_object(
      'current',(select count(*) from public.hr_document_record where company_id=v_company_id and status='current'),
      'expiring_30_days',(select count(*) from public.hr_document_record where company_id=v_company_id and status='current' and expiry_date between current_date and current_date+30)
    ) else '{}'::jsonb end
  );
end;
$function$;;
