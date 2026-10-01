create or replace function public.get_hr_reports_workspace(
  p_branch_id uuid default null,
  p_start_date date default current_date - 6,
  p_end_date date default current_date,
  p_employee_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_company_id uuid;
  v_tz text;
  v_today date;
  v_company jsonb;
  v_employee_summary jsonb;
  v_attendance_rows jsonb;
  v_leave_rows jsonb;
  v_performance_rows jsonb;
  v_document_rows jsonb;
  v_discipline_rows jsonb;
  v_summary jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.view') then
    raise exception 'Permission denied: hr.view';
  end if;

  v_company_id := public.current_company_id();

  if p_start_date is null or p_end_date is null or p_end_date < p_start_date or p_end_date - p_start_date > 366 then
    raise exception 'Report date range must be between 1 and 367 days.';
  end if;

  if p_branch_id is not null and not exists(
    select 1 from public.branch b where b.id=p_branch_id and b.company_id=v_company_id
  ) then raise exception 'Branch could not be found.'; end if;

  if p_employee_id is not null and not exists(
    select 1 from public.hr_employee e where e.id=p_employee_id and e.company_id=v_company_id
  ) then raise exception 'Employee could not be found.'; end if;

  select coalesce(cps.timezone,'Africa/Johannesburg') into v_tz
  from public.company_profile_settings cps
  where cps.company_id=v_company_id;
  if v_tz is null then v_tz := 'Africa/Johannesburg'; end if;

  v_today := (timezone(v_tz,now()))::date;

  select jsonb_build_object(
    'id',c.id,
    'company_name',c.company_name,
    'trading_name',c.trading_name,
    'registration_number',c.registration_number,
    'email',c.email,
    'phone',c.phone,
    'address',coalesce(c.physical_address,c.address),
    'logo_path',c.logo_path
  ) into v_company
  from public.company c
  where c.id=v_company_id;

  with filtered_employees as (
    select e.*
    from public.hr_employee e
    where e.company_id=v_company_id
      and (p_employee_id is null or e.id=p_employee_id)
      and (p_branch_id is null or e.primary_branch_id=p_branch_id)
  ),
  time_agg as (
    select te.employee_id,te.work_date,
      min(te.clock_in_at) as first_clock_in,
      max(te.clock_out_at) filter(where te.clock_out_at is not null) as last_clock_out,
      bool_or(te.status='open') as has_open_entry,
      sum(te.break_minutes)::integer as break_minutes,
      sum(greatest(0,
        floor(extract(epoch from (coalesce(te.clock_out_at,case when te.work_date=v_today then now() else te.clock_in_at end)-te.clock_in_at))/60)::integer - te.break_minutes
      ))::integer as worked_minutes
    from public.hr_time_entry te
    join filtered_employees fe on fe.id=te.employee_id
    where te.work_date between p_start_date and p_end_date
      and (p_branch_id is null or te.branch_id=p_branch_id)
    group by te.employee_id,te.work_date
  ),
  keys as (
    select ra.employee_id,ra.shift_date as work_date
    from public.hr_roster_assignment ra
    join filtered_employees fe on fe.id=ra.employee_id
    where ra.company_id=v_company_id
      and ra.shift_date between p_start_date and p_end_date
      and (p_branch_id is null or ra.branch_id=p_branch_id)
    union
    select ta.employee_id,ta.work_date from time_agg ta
  ),
  rows as (
    select
      k.employee_id,
      k.work_date,
      fe.employee_number,
      fe.first_name||' '||fe.last_name as employee_name,
      coalesce(b.branch_name,'') as branch_name,
      st.name as shift_name,
      ra.planned_start_at,
      ra.planned_end_at,
      ta.first_clock_in,
      ta.last_clock_out,
      coalesce(ta.has_open_entry,false) as has_open_entry,
      coalesce(ta.break_minutes,0) as break_minutes,
      coalesce(ta.worked_minutes,0) as worked_minutes,
      case when ra.id is not null then greatest(0,
        floor(extract(epoch from (ra.planned_end_at-ra.planned_start_at))/60)::integer - coalesce(st.break_minutes,0)
      ) else 0 end as scheduled_minutes,
      case when ta.first_clock_in is not null and ra.planned_start_at is not null then greatest(0,
        floor(extract(epoch from (ta.first_clock_in-ra.planned_start_at))/60)::integer
      ) else 0 end as late_minutes,
      case
        when ta.has_open_entry then 'clocked_in'
        when ta.first_clock_in is not null and ta.last_clock_out is not null and ra.planned_start_at is not null
          and greatest(0,floor(extract(epoch from (ta.first_clock_in-ra.planned_start_at))/60)::integer) > coalesce(st.late_grace_minutes,0)
          then 'late'
        when ta.first_clock_in is not null then 'completed'
        when ra.id is not null and k.work_date < v_today then 'absent'
        when ra.id is not null then 'scheduled'
        else 'unscheduled_attendance'
      end as attendance_status
    from keys k
    join filtered_employees fe on fe.id=k.employee_id
    left join public.hr_roster_assignment ra
      on ra.company_id=v_company_id and ra.employee_id=k.employee_id and ra.shift_date=k.work_date
      and (p_branch_id is null or ra.branch_id=p_branch_id)
    left join public.hr_shift_template st on st.id=ra.shift_template_id
    left join time_agg ta on ta.employee_id=k.employee_id and ta.work_date=k.work_date
    left join public.branch b on b.id=coalesce(ra.branch_id,fe.primary_branch_id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'employee_id',employee_id,
    'employee_number',employee_number,
    'employee_name',employee_name,
    'branch_name',branch_name,
    'work_date',work_date,
    'shift_name',shift_name,
    'planned_start_at',planned_start_at,
    'planned_end_at',planned_end_at,
    'first_clock_in',first_clock_in,
    'last_clock_out',last_clock_out,
    'break_minutes',break_minutes,
    'worked_minutes',worked_minutes,
    'scheduled_minutes',scheduled_minutes,
    'late_minutes',late_minutes,
    'attendance_status',attendance_status
  ) order by work_date,employee_name),'[]'::jsonb)
  into v_attendance_rows
  from rows;

  with filtered_employees as (
    select e.*
    from public.hr_employee e
    where e.company_id=v_company_id
      and (p_employee_id is null or e.id=p_employee_id)
      and (p_branch_id is null or e.primary_branch_id=p_branch_id)
  ),
  roster_agg as (
    select fe.id as employee_id,
      count(ra.id)::integer as scheduled_days
    from filtered_employees fe
    left join public.hr_roster_assignment ra on ra.employee_id=fe.id and ra.company_id=v_company_id
      and ra.shift_date between p_start_date and p_end_date
      and (p_branch_id is null or ra.branch_id=p_branch_id)
    group by fe.id
  ),
  time_days as (
    select te.employee_id,
      count(distinct te.work_date)::integer as attended_days,
      sum(greatest(0,
        floor(extract(epoch from (coalesce(te.clock_out_at,case when te.work_date=v_today then now() else te.clock_in_at end)-te.clock_in_at))/60)::integer - te.break_minutes
      ))::integer as worked_minutes
    from public.hr_time_entry te
    join filtered_employees fe on fe.id=te.employee_id
    where te.work_date between p_start_date and p_end_date
      and (p_branch_id is null or te.branch_id=p_branch_id)
    group by te.employee_id
  ),
  late_absent as (
    select fe.id as employee_id,
      count(*) filter(where te.first_clock_in is not null and te.first_clock_in > ra.planned_start_at + make_interval(mins=>coalesce(st.late_grace_minutes,0)))::integer as late_days,
      count(*) filter(where ra.shift_date < v_today and te.first_clock_in is null)::integer as absent_days
    from filtered_employees fe
    join public.hr_roster_assignment ra on ra.employee_id=fe.id and ra.company_id=v_company_id
      and ra.shift_date between p_start_date and p_end_date
      and (p_branch_id is null or ra.branch_id=p_branch_id)
    join public.hr_shift_template st on st.id=ra.shift_template_id
    left join lateral (
      select min(x.clock_in_at) as first_clock_in
      from public.hr_time_entry x
      where x.company_id=v_company_id and x.employee_id=fe.id and x.work_date=ra.shift_date
    ) te on true
    group by fe.id
  ),
  leave_agg as (
    select lr.employee_id,
      sum((least(lr.end_date,p_end_date)-greatest(lr.start_date,p_start_date))+1)::integer as approved_leave_days
    from public.hr_leave_request lr
    join filtered_employees fe on fe.id=lr.employee_id
    where lr.company_id=v_company_id and lr.status='approved'
      and lr.start_date<=p_end_date and lr.end_date>=p_start_date
    group by lr.employee_id
  ),
  sales_agg as (
    select fe.id as employee_id,
      count(ps.id)::integer as sales_count,
      coalesce(sum(ps.total_amount),0)::numeric as sales_value
    from filtered_employees fe
    left join public.pos_sale ps on ps.company_id=v_company_id and ps.cashier_user_id=fe.user_id
      and ps.status='completed'
      and (timezone(v_tz,ps.created_at))::date between p_start_date and p_end_date
      and (p_branch_id is null or ps.branch_id=p_branch_id)
    group by fe.id
  ),
  performance_agg as (
    select pr.employee_id,
      count(*)::integer as review_count,
      round(avg(pr.rating),2) as average_rating
    from public.hr_performance_review pr
    join filtered_employees fe on fe.id=pr.employee_id
    where pr.company_id=v_company_id
      and pr.period_start<=p_end_date and pr.period_end>=p_start_date
      and pr.rating is not null
    group by pr.employee_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'employee_id',fe.id,
    'employee_number',fe.employee_number,
    'employee_name',fe.first_name||' '||fe.last_name,
    'status',fe.status,
    'branch_name',coalesce(b.branch_name,''),
    'scheduled_days',coalesce(r.scheduled_days,0),
    'attended_days',coalesce(td.attended_days,0),
    'late_days',coalesce(la.late_days,0),
    'absent_days',coalesce(la.absent_days,0),
    'worked_minutes',coalesce(td.worked_minutes,0),
    'approved_leave_days',coalesce(lv.approved_leave_days,0),
    'attendance_rate',case when coalesce(r.scheduled_days,0)>0 then round((coalesce(td.attended_days,0)::numeric/r.scheduled_days)*100,1) else null end,
    'sales_count',coalesce(sa.sales_count,0),
    'sales_value',coalesce(sa.sales_value,0),
    'performance_reviews',coalesce(pa.review_count,0),
    'average_rating',pa.average_rating
  ) order by fe.last_name,fe.first_name),'[]'::jsonb)
  into v_employee_summary
  from filtered_employees fe
  left join public.branch b on b.id=fe.primary_branch_id
  left join roster_agg r on r.employee_id=fe.id
  left join time_days td on td.employee_id=fe.id
  left join late_absent la on la.employee_id=fe.id
  left join leave_agg lv on lv.employee_id=fe.id
  left join sales_agg sa on sa.employee_id=fe.id
  left join performance_agg pa on pa.employee_id=fe.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',lr.id,
    'employee_id',lr.employee_id,
    'employee_number',e.employee_number,
    'employee_name',e.first_name||' '||e.last_name,
    'leave_type',lt.name,
    'start_date',lr.start_date,
    'end_date',lr.end_date,
    'calendar_days',lr.calendar_days,
    'days_in_report',((least(lr.end_date,p_end_date)-greatest(lr.start_date,p_start_date))+1),
    'status',lr.status,
    'reason',lr.reason
  ) order by lr.start_date,e.last_name),'[]'::jsonb)
  into v_leave_rows
  from public.hr_leave_request lr
  join public.hr_employee e on e.id=lr.employee_id
  join public.hr_leave_type lt on lt.id=lr.leave_type_id
  where lr.company_id=v_company_id
    and lr.start_date<=p_end_date and lr.end_date>=p_start_date
    and (p_employee_id is null or lr.employee_id=p_employee_id)
    and (p_branch_id is null or e.primary_branch_id=p_branch_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',pr.id,
    'employee_id',pr.employee_id,
    'employee_number',e.employee_number,
    'employee_name',e.first_name||' '||e.last_name,
    'period_start',pr.period_start,
    'period_end',pr.period_end,
    'rating',pr.rating,
    'status',pr.status,
    'summary',pr.summary,
    'goals',pr.goals
  ) order by pr.period_end desc,e.last_name),'[]'::jsonb)
  into v_performance_rows
  from public.hr_performance_review pr
  join public.hr_employee e on e.id=pr.employee_id
  where pr.company_id=v_company_id
    and pr.period_start<=p_end_date and pr.period_end>=p_start_date
    and (p_employee_id is null or pr.employee_id=p_employee_id)
    and (p_branch_id is null or e.primary_branch_id=p_branch_id);

  if public.current_user_has_permission('hr.documents.manage') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',d.id,
      'employee_id',d.employee_id,
      'employee_number',e.employee_number,
      'employee_name',e.first_name||' '||e.last_name,
      'document_type',d.document_type,
      'title',d.title,
      'expiry_date',d.expiry_date,
      'status',d.status
    ) order by d.expiry_date nulls last),'[]'::jsonb)
    into v_document_rows
    from public.hr_document_record d
    join public.hr_employee e on e.id=d.employee_id
    where d.company_id=v_company_id and d.status='current'
      and d.expiry_date is not null and d.expiry_date<=v_today+60
      and (p_employee_id is null or d.employee_id=p_employee_id)
      and (p_branch_id is null or e.primary_branch_id=p_branch_id);
  else
    v_document_rows := '[]'::jsonb;
  end if;

  if public.current_user_has_permission('hr.discipline.manage') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',dc.id,
      'employee_id',dc.employee_id,
      'employee_number',e.employee_number,
      'employee_name',e.first_name||' '||e.last_name,
      'case_type',dc.case_type,
      'incident_date',dc.incident_date,
      'summary',dc.summary,
      'status',dc.status,
      'expiry_date',dc.expiry_date
    ) order by dc.expiry_date nulls last,dc.incident_date desc),'[]'::jsonb)
    into v_discipline_rows
    from public.hr_disciplinary_case dc
    join public.hr_employee e on e.id=dc.employee_id
    where dc.company_id=v_company_id and dc.status in ('open','issued','appealed')
      and (p_employee_id is null or dc.employee_id=p_employee_id)
      and (p_branch_id is null or e.primary_branch_id=p_branch_id);
  else
    v_discipline_rows := '[]'::jsonb;
  end if;

  select jsonb_build_object(
    'employees',count(*),
    'scheduled_days',coalesce(sum((x->>'scheduled_days')::integer),0),
    'attended_days',coalesce(sum((x->>'attended_days')::integer),0),
    'late_days',coalesce(sum((x->>'late_days')::integer),0),
    'absent_days',coalesce(sum((x->>'absent_days')::integer),0),
    'worked_minutes',coalesce(sum((x->>'worked_minutes')::integer),0),
    'approved_leave_days',coalesce(sum((x->>'approved_leave_days')::integer),0),
    'sales_count',coalesce(sum((x->>'sales_count')::integer),0),
    'sales_value',coalesce(sum((x->>'sales_value')::numeric),0),
    'average_attendance_rate',round(avg((x->>'attendance_rate')::numeric) filter(where x->>'attendance_rate' is not null),1)
  ) into v_summary
  from jsonb_array_elements(v_employee_summary) x;

  return jsonb_build_object(
    'ok',true,
    'company',v_company,
    'timezone',v_tz,
    'today',v_today,
    'range_start',p_start_date,
    'range_end',p_end_date,
    'branches',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.branch_name,'address',b.address) order by b.branch_name) from public.branch b where b.company_id=v_company_id),'[]'::jsonb),
    'employees',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'employee_number',e.employee_number,'name',e.first_name||' '||e.last_name,'branch_id',e.primary_branch_id,'status',e.status) order by e.last_name,e.first_name) from public.hr_employee e where e.company_id=v_company_id),'[]'::jsonb),
    'capabilities',jsonb_build_object(
      'documents',public.current_user_has_permission('hr.documents.manage'),
      'discipline',public.current_user_has_permission('hr.discipline.manage')
    ),
    'summary',v_summary,
    'employee_summary',v_employee_summary,
    'attendance_rows',v_attendance_rows,
    'leave_rows',v_leave_rows,
    'performance_rows',v_performance_rows,
    'document_rows',v_document_rows,
    'discipline_rows',v_discipline_rows
  );
end;
$function$;

revoke all on function public.get_hr_reports_workspace(uuid,date,date,uuid) from public,anon;
grant execute on function public.get_hr_reports_workspace(uuid,date,date,uuid) to authenticated;

create or replace function public.record_hr_report_export(
  p_report_type text,
  p_format text,
  p_start_date date,
  p_end_date date,
  p_branch_id uuid default null,
  p_employee_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_company_id uuid;
  v_type text;
  v_format text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.view') then raise exception 'Permission denied: hr.view'; end if;
  v_company_id:=public.current_company_id();
  v_type:=lower(btrim(coalesce(p_report_type,'')));
  v_format:=lower(btrim(coalesce(p_format,'')));
  if v_type not in ('management_pack','attendance','employee_summary','leave','performance','documents','discipline') then raise exception 'Unsupported HR report type.'; end if;
  if v_format not in ('print','csv','pdf') then raise exception 'Unsupported HR report format.'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then raise exception 'Report date range is invalid.'; end if;

  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_report_exported','hr',null,'HR management report exported.',jsonb_build_object(
    'report_type',v_type,'format',v_format,'start_date',p_start_date,'end_date',p_end_date,'branch_id',p_branch_id,'employee_id',p_employee_id
  ));

  return jsonb_build_object('ok',true,'report_type',v_type,'format',v_format);
end;
$function$;

revoke all on function public.record_hr_report_export(text,text,date,date,uuid,uuid) from public,anon;
grant execute on function public.record_hr_report_export(text,text,date,date,uuid,uuid) to authenticated;;
