create or replace function public.get_hr_intelligence_workspace(
  p_branch_id uuid default null,
  p_days integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_tz text;
  v_today date;
  v_now timestamptz;
  v_start_date date;
  v_timebook jsonb;
  v_can_docs boolean;
  v_can_discipline boolean;
  v_can_leave boolean;
  v_alerts jsonb;
  v_trend jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('hr.view') then
    raise exception 'Permission denied: hr.view';
  end if;

  v_company_id := public.current_company_id();

  if p_branch_id is not null and not exists(
    select 1
    from public.branch b
    where b.id=p_branch_id and b.company_id=v_company_id
  ) then
    raise exception 'Branch could not be found.';
  end if;

  if p_days is null or p_days < 1 or p_days > 31 then
    raise exception 'Intelligence range must be between 1 and 31 days.';
  end if;

  select coalesce(timezone,'Africa/Johannesburg')
  into v_tz
  from public.company_profile_settings
  where company_id=v_company_id;

  if v_tz is null then
    v_tz := 'Africa/Johannesburg';
  end if;

  v_now := now();
  v_today := (timezone(v_tz,v_now))::date;
  v_start_date := v_today - (p_days - 1);

  v_can_docs := public.current_user_has_permission('hr.documents.manage');
  v_can_discipline := public.current_user_has_permission('hr.discipline.manage');
  v_can_leave := public.current_user_has_permission('hr.leave.approve');

  v_timebook := public.get_hr_timebook_workspace(
    p_branch_id,
    v_start_date,
    v_today,
    null
  );

  with row_data as (
    select value as row
    from jsonb_array_elements(coalesce(v_timebook->'rows','[]'::jsonb))
  ),
  day_series as (
    select d::date as day
    from generate_series(v_start_date::timestamp,v_today::timestamp,interval '1 day') d
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', ds.day,
    'scheduled', coalesce(x.scheduled,0),
    'attended', coalesce(x.attended,0),
    'late', coalesce(x.late,0),
    'absent', coalesce(x.absent,0),
    'worked_minutes', coalesce(x.worked_minutes,0),
    'sales_count', coalesce(x.sales_count,0),
    'sales_value', coalesce(x.sales_value,0)
  ) order by ds.day),'[]'::jsonb)
  into v_trend
  from day_series ds
  left join lateral (
    select
      count(*) filter (where (rd.row->>'roster_assignment_id') is not null) as scheduled,
      count(*) filter (where (rd.row->>'first_clock_in') is not null) as attended,
      count(*) filter (where (rd.row->>'attendance_status')='late') as late,
      count(*) filter (where (rd.row->>'attendance_status')='absent') as absent,
      coalesce(sum((rd.row->>'worked_minutes')::integer),0) as worked_minutes,
      coalesce(sum((rd.row->>'sales_count')::integer),0) as sales_count,
      coalesce(sum((rd.row->>'sales_value')::numeric),0) as sales_value
    from row_data rd
    where (rd.row->>'work_date')::date = ds.day
  ) x on true;

  with today_roster as (
    select
      ra.id,
      ra.employee_id,
      ra.branch_id,
      ra.shift_date,
      ra.planned_start_at,
      ra.planned_end_at,
      e.employee_number,
      e.first_name||' '||e.last_name as employee_name,
      coalesce(b.branch_name,'') as branch_name,
      st.name as shift_name,
      st.late_grace_minutes
    from public.hr_roster_assignment ra
    join public.hr_employee e on e.id=ra.employee_id and e.company_id=v_company_id
    join public.hr_shift_template st on st.id=ra.shift_template_id
    left join public.branch b on b.id=ra.branch_id
    where ra.company_id=v_company_id
      and ra.shift_date=v_today
      and ra.status='scheduled'
      and (p_branch_id is null or ra.branch_id=p_branch_id)
  ),
  today_time as (
    select
      te.employee_id,
      min(te.clock_in_at) as first_clock_in,
      max(te.clock_out_at) filter (where te.clock_out_at is not null) as last_clock_out,
      bool_or(te.status='open') as is_open
    from public.hr_time_entry te
    where te.company_id=v_company_id and te.work_date=v_today
    group by te.employee_id
  ),
  alert_rows as (
    select
      10 as priority,
      'critical'::text as severity,
      'not_arrived'::text as alert_type,
      tr.employee_id,
      tr.employee_number,
      tr.employee_name,
      tr.branch_name,
      tr.shift_name,
      tr.planned_start_at as occurred_at,
      greatest(0,floor(extract(epoch from (v_now-(tr.planned_start_at + make_interval(mins=>coalesce(tr.late_grace_minutes,0)))))/60)::integer) as minutes_variance,
      'Scheduled employee has not clocked in.'::text as message
    from today_roster tr
    left join today_time tt on tt.employee_id=tr.employee_id
    where tt.first_clock_in is null
      and v_now > tr.planned_start_at + make_interval(mins=>coalesce(tr.late_grace_minutes,0))

    union all

    select
      20,
      'warning',
      'late_arrival',
      tr.employee_id,
      tr.employee_number,
      tr.employee_name,
      tr.branch_name,
      tr.shift_name,
      tt.first_clock_in,
      greatest(0,floor(extract(epoch from (tt.first_clock_in-tr.planned_start_at))/60)::integer),
      'Employee arrived after the scheduled start time.'
    from today_roster tr
    join today_time tt on tt.employee_id=tr.employee_id
    where tt.first_clock_in is not null
      and tt.first_clock_in > tr.planned_start_at + make_interval(mins=>coalesce(tr.late_grace_minutes,0))

    union all

    select
      15,
      'critical',
      'still_clocked_in',
      tr.employee_id,
      tr.employee_number,
      tr.employee_name,
      tr.branch_name,
      tr.shift_name,
      tr.planned_end_at,
      greatest(0,floor(extract(epoch from (v_now-tr.planned_end_at))/60)::integer),
      'Employee is still clocked in after the scheduled finish time.'
    from today_roster tr
    join today_time tt on tt.employee_id=tr.employee_id
    where coalesce(tt.is_open,false)=true
      and v_now > tr.planned_end_at

    union all

    select
      30,
      case when ae.severity='high' then 'critical' else 'warning' end,
      'attendance_exception',
      ae.employee_id,
      e.employee_number,
      e.first_name||' '||e.last_name,
      coalesce(b.branch_name,''),
      null,
      ae.created_at,
      coalesce(ae.minutes_variance,0),
      coalesce(ae.details,ae.exception_type)
    from public.hr_attendance_exception ae
    join public.hr_employee e on e.id=ae.employee_id
    left join public.branch b on b.id=ae.branch_id
    where ae.company_id=v_company_id
      and ae.status='open'
      and ae.exception_date between v_start_date and v_today
      and (p_branch_id is null or ae.branch_id=p_branch_id)

    union all

    select
      40,
      'info',
      'pending_leave',
      lr.employee_id,
      e.employee_number,
      e.first_name||' '||e.last_name,
      coalesce(b.branch_name,''),
      null,
      lr.created_at,
      lr.calendar_days::integer,
      'Leave request is waiting for review.'
    from public.hr_leave_request lr
    join public.hr_employee e on e.id=lr.employee_id
    left join public.branch b on b.id=e.primary_branch_id
    where v_can_leave
      and lr.company_id=v_company_id
      and lr.status='pending'
      and (p_branch_id is null or e.primary_branch_id=p_branch_id)

    union all

    select
      50,
      'warning',
      'document_expiry',
      d.employee_id,
      e.employee_number,
      e.first_name||' '||e.last_name,
      coalesce(b.branch_name,''),
      null,
      d.expiry_date::timestamp,
      (d.expiry_date-v_today)::integer,
      d.title||' expires on '||d.expiry_date::text
    from public.hr_document_record d
    join public.hr_employee e on e.id=d.employee_id
    left join public.branch b on b.id=e.primary_branch_id
    where v_can_docs
      and d.company_id=v_company_id
      and d.status='current'
      and d.expiry_date between v_today and v_today+30
      and (p_branch_id is null or e.primary_branch_id=p_branch_id)

    union all

    select
      60,
      'info',
      'discipline_expiry',
      dc.employee_id,
      e.employee_number,
      e.first_name||' '||e.last_name,
      coalesce(b.branch_name,''),
      null,
      dc.expiry_date::timestamp,
      (dc.expiry_date-v_today)::integer,
      'Disciplinary record reaches expiry on '||dc.expiry_date::text
    from public.hr_disciplinary_case dc
    join public.hr_employee e on e.id=dc.employee_id
    left join public.branch b on b.id=e.primary_branch_id
    where v_can_discipline
      and dc.company_id=v_company_id
      and dc.status in ('open','issued','appealed')
      and dc.expiry_date between v_today and v_today+30
      and (p_branch_id is null or e.primary_branch_id=p_branch_id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'severity',severity,
    'type',alert_type,
    'employee_id',employee_id,
    'employee_number',employee_number,
    'employee_name',employee_name,
    'branch_name',branch_name,
    'shift_name',shift_name,
    'occurred_at',occurred_at,
    'minutes_variance',minutes_variance,
    'message',message
  ) order by priority, occurred_at desc nulls last),'[]'::jsonb)
  into v_alerts
  from alert_rows;

  return jsonb_build_object(
    'ok',true,
    'timezone',v_tz,
    'today',v_today,
    'range_start',v_start_date,
    'range_end',v_today,
    'branches',coalesce((
      select jsonb_agg(jsonb_build_object('id',b.id,'name',b.branch_name) order by b.branch_name)
      from public.branch b
      where b.company_id=v_company_id
    ),'[]'::jsonb),
    'capabilities',jsonb_build_object(
      'documents',v_can_docs,
      'discipline',v_can_discipline,
      'leave_approval',v_can_leave
    ),
    'summary',jsonb_build_object(
      'active_employees',(select count(*) from public.hr_employee e where e.company_id=v_company_id and e.status='active' and (p_branch_id is null or e.primary_branch_id=p_branch_id)),
      'scheduled_today',(select count(*) from public.hr_roster_assignment ra where ra.company_id=v_company_id and ra.shift_date=v_today and ra.status='scheduled' and (p_branch_id is null or ra.branch_id=p_branch_id)),
      'clocked_in_now',(select count(*) from public.hr_time_entry te where te.company_id=v_company_id and te.status='open' and (p_branch_id is null or te.branch_id=p_branch_id)),
      'pending_leave',(select count(*) from public.hr_leave_request lr join public.hr_employee e on e.id=lr.employee_id where lr.company_id=v_company_id and lr.status='pending' and (p_branch_id is null or e.primary_branch_id=p_branch_id)),
      'open_attendance_exceptions',(select count(*) from public.hr_attendance_exception ae where ae.company_id=v_company_id and ae.status='open' and (p_branch_id is null or ae.branch_id=p_branch_id)),
      'documents_expiring_30_days',case when v_can_docs then (select count(*) from public.hr_document_record d join public.hr_employee e on e.id=d.employee_id where d.company_id=v_company_id and d.status='current' and d.expiry_date between v_today and v_today+30 and (p_branch_id is null or e.primary_branch_id=p_branch_id)) else 0 end,
      'discipline_expiring_30_days',case when v_can_discipline then (select count(*) from public.hr_disciplinary_case dc join public.hr_employee e on e.id=dc.employee_id where dc.company_id=v_company_id and dc.status in ('open','issued','appealed') and dc.expiry_date between v_today and v_today+30 and (p_branch_id is null or e.primary_branch_id=p_branch_id)) else 0 end,
      'period_attended_days',coalesce((v_timebook->'summary'->>'attended_days')::integer,0),
      'period_late_days',coalesce((v_timebook->'summary'->>'late_days')::integer,0),
      'period_absent_days',coalesce((v_timebook->'summary'->>'absent_days')::integer,0),
      'period_worked_minutes',coalesce((v_timebook->'summary'->>'worked_minutes')::integer,0),
      'period_sales_count',coalesce((v_timebook->'summary'->>'sales_count')::integer,0),
      'period_sales_value',coalesce((v_timebook->'summary'->>'sales_value')::numeric,0)
    ),
    'trend',v_trend,
    'alerts',v_alerts
  );
end;
$function$;

revoke all on function public.get_hr_intelligence_workspace(uuid,integer) from public, anon;
grant execute on function public.get_hr_intelligence_workspace(uuid,integer) to authenticated;;
