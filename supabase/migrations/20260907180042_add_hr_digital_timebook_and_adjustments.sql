create table if not exists public.hr_time_entry_adjustment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  time_entry_id uuid not null references public.hr_time_entry(id) on delete cascade,
  employee_id uuid not null references public.hr_employee(id) on delete cascade,
  previous_clock_in_at timestamptz not null,
  previous_clock_out_at timestamptz,
  previous_break_minutes integer not null,
  new_clock_in_at timestamptz not null,
  new_clock_out_at timestamptz,
  new_break_minutes integer not null,
  reason text not null check (char_length(btrim(reason)) >= 5),
  adjusted_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists hr_time_entry_adjustment_company_entry_idx
  on public.hr_time_entry_adjustment(company_id, time_entry_id, created_at desc);

alter table public.hr_time_entry_adjustment enable row level security;
revoke all on table public.hr_time_entry_adjustment from public, anon, authenticated;

create or replace function public.adjust_hr_time_entry(
  p_time_entry_id uuid,
  p_clock_in_at timestamptz default null,
  p_clock_out_at timestamptz default null,
  p_break_minutes integer default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_entry public.hr_time_entry%rowtype;
  v_new_in timestamptz;
  v_new_out timestamptz;
  v_new_break integer;
  v_tz text;
  v_reason text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.attendance.manage') then
    raise exception 'Permission denied: hr.attendance.manage';
  end if;

  v_company_id := public.current_company_id();
  select * into v_entry
  from public.hr_time_entry
  where id=p_time_entry_id and company_id=v_company_id
  for update;

  if not found then raise exception 'Time entry could not be found.'; end if;

  v_reason := btrim(coalesce(p_reason,''));
  if char_length(v_reason) < 5 then
    raise exception 'A correction reason of at least 5 characters is required.';
  end if;

  v_new_in := coalesce(p_clock_in_at, v_entry.clock_in_at);
  v_new_out := coalesce(p_clock_out_at, v_entry.clock_out_at);
  v_new_break := coalesce(p_break_minutes, v_entry.break_minutes);

  if v_new_break < 0 or v_new_break > 720 then
    raise exception 'Break minutes must be between 0 and 720.';
  end if;
  if v_new_out is not null and v_new_out <= v_new_in then
    raise exception 'Clock-out must be after clock-in.';
  end if;

  select coalesce(timezone,'Africa/Johannesburg') into v_tz
  from public.company_profile_settings
  where company_id=v_company_id;
  if v_tz is null then v_tz := 'Africa/Johannesburg'; end if;

  insert into public.hr_time_entry_adjustment(
    company_id,time_entry_id,employee_id,
    previous_clock_in_at,previous_clock_out_at,previous_break_minutes,
    new_clock_in_at,new_clock_out_at,new_break_minutes,
    reason,adjusted_by
  ) values (
    v_company_id,v_entry.id,v_entry.employee_id,
    v_entry.clock_in_at,v_entry.clock_out_at,v_entry.break_minutes,
    v_new_in,v_new_out,v_new_break,
    v_reason,auth.uid()
  );

  update public.hr_time_entry
  set clock_in_at=v_new_in,
      clock_out_at=v_new_out,
      break_minutes=v_new_break,
      work_date=(timezone(v_tz,v_new_in))::date,
      status=case when v_new_out is null then 'open' else 'adjusted' end,
      approved_by=auth.uid(),
      notes=case
        when nullif(btrim(coalesce(notes,'')),'') is null then 'Attendance correction: '||v_reason
        else notes||E'\nAttendance correction: '||v_reason
      end,
      metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('last_adjusted_by',auth.uid(),'last_adjusted_at',now()),
      updated_at=now()
  where id=v_entry.id;

  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(
    v_company_id,auth.uid(),'hr_time_entry_adjusted','hr',v_entry.id,
    'HR time entry corrected without impersonating the employee.',
    jsonb_build_object(
      'employee_id',v_entry.employee_id,
      'reason',v_reason,
      'previous_clock_in_at',v_entry.clock_in_at,
      'previous_clock_out_at',v_entry.clock_out_at,
      'new_clock_in_at',v_new_in,
      'new_clock_out_at',v_new_out,
      'new_break_minutes',v_new_break
    )
  );

  return jsonb_build_object(
    'ok',true,
    'time_entry_id',v_entry.id,
    'employee_id',v_entry.employee_id,
    'clock_in_at',v_new_in,
    'clock_out_at',v_new_out,
    'break_minutes',v_new_break,
    'status',case when v_new_out is null then 'open' else 'adjusted' end
  );
end;
$function$;

revoke all on function public.adjust_hr_time_entry(uuid,timestamptz,timestamptz,integer,text) from public, anon;
grant execute on function public.adjust_hr_time_entry(uuid,timestamptz,timestamptz,integer,text) to authenticated;

create or replace function public.get_hr_timebook_workspace(
  p_branch_id uuid default null,
  p_start_date date default current_date,
  p_end_date date default current_date,
  p_employee_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_is_manager boolean;
  v_own_employee_id uuid;
  v_tz text;
  v_today date;
  v_rows jsonb;
  v_summary jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;

  v_company_id := public.current_company_id();
  v_is_manager := public.current_user_has_permission('hr.view') or public.current_user_has_permission('hr.attendance.review');

  if not v_is_manager and not public.current_user_has_permission('hr.self') then
    raise exception 'Permission denied: HR access required.';
  end if;

  if p_start_date is null or p_end_date is null or p_end_date < p_start_date or p_end_date - p_start_date > 366 then
    raise exception 'Time book date range must be between 1 and 367 days.';
  end if;

  if p_branch_id is not null and not exists(
    select 1 from public.branch where id=p_branch_id and company_id=v_company_id
  ) then raise exception 'Branch could not be found.'; end if;

  select id into v_own_employee_id
  from public.hr_employee
  where company_id=v_company_id and user_id=auth.uid()
  limit 1;

  if not v_is_manager then
    if v_own_employee_id is null then raise exception 'No HR employee profile is linked to this Nexus user.'; end if;
    if p_employee_id is not null and p_employee_id <> v_own_employee_id then
      raise exception 'Employees may only view their own time book.';
    end if;
  elsif p_employee_id is not null and not exists(
    select 1 from public.hr_employee where id=p_employee_id and company_id=v_company_id
  ) then raise exception 'Employee could not be found.'; end if;

  select coalesce(timezone,'Africa/Johannesburg') into v_tz
  from public.company_profile_settings where company_id=v_company_id;
  if v_tz is null then v_tz := 'Africa/Johannesburg'; end if;
  v_today := (timezone(v_tz,now()))::date;

  with keys as (
    select ra.employee_id, ra.shift_date as work_date
    from public.hr_roster_assignment ra
    where ra.company_id=v_company_id
      and ra.shift_date between p_start_date and p_end_date
      and (p_branch_id is null or ra.branch_id=p_branch_id)
      and (case when v_is_manager then (p_employee_id is null or ra.employee_id=p_employee_id) else ra.employee_id=v_own_employee_id end)
    union
    select te.employee_id, te.work_date
    from public.hr_time_entry te
    where te.company_id=v_company_id
      and te.work_date between p_start_date and p_end_date
      and (p_branch_id is null or te.branch_id=p_branch_id)
      and (case when v_is_manager then (p_employee_id is null or te.employee_id=p_employee_id) else te.employee_id=v_own_employee_id end)
  ),
  time_agg as (
    select te.employee_id, te.work_date,
      min(te.clock_in_at) as first_clock_in,
      max(te.clock_out_at) filter (where te.clock_out_at is not null) as last_clock_out,
      bool_or(te.status='open') as has_open_entry,
      min(te.id) as primary_time_entry_id,
      count(*) as time_entry_count,
      sum(te.break_minutes)::integer as total_break_minutes,
      sum(greatest(0,
        floor(extract(epoch from (coalesce(te.clock_out_at,now())-te.clock_in_at))/60)::integer - te.break_minutes
      ))::integer as worked_minutes
    from public.hr_time_entry te
    where te.company_id=v_company_id and te.work_date between p_start_date and p_end_date
    group by te.employee_id, te.work_date
  ),
  rows as (
    select
      k.employee_id,
      k.work_date,
      e.employee_number,
      e.first_name||' '||e.last_name as employee_name,
      coalesce((select b.branch_name from public.branch b where b.id=coalesce(ra.branch_id,e.primary_branch_id)),'') as branch_name,
      ra.id as roster_assignment_id,
      st.name as shift_name,
      ra.planned_start_at,
      ra.planned_end_at,
      st.start_time as required_arrival_time,
      st.customer_open_time,
      st.break_start_time,
      st.break_end_time,
      st.end_time as scheduled_finish_time,
      st.late_grace_minutes,
      ta.primary_time_entry_id as time_entry_id,
      coalesce(ta.time_entry_count,0)::integer as time_entry_count,
      ta.first_clock_in,
      ta.last_clock_out,
      coalesce(ta.total_break_minutes,0)::integer as total_break_minutes,
      coalesce(ta.worked_minutes,0)::integer as worked_minutes,
      case when ra.id is not null then greatest(0,
        floor(extract(epoch from (ra.planned_end_at-ra.planned_start_at))/60)::integer - coalesce(st.break_minutes,0)
      ) else 0 end as scheduled_paid_minutes,
      case
        when ta.first_clock_in is not null and ra.planned_start_at is not null
          then greatest(0,floor(extract(epoch from (ta.first_clock_in-ra.planned_start_at))/60)::integer)
        else 0
      end as late_minutes,
      case
        when ta.last_clock_out is not null and ra.planned_end_at is not null
          then greatest(0,floor(extract(epoch from (ra.planned_end_at-ta.last_clock_out))/60)::integer)
        else 0
      end as early_leave_minutes,
      case
        when coalesce(ta.has_open_entry,false) then 'clocked_in'
        when ta.first_clock_in is not null and ta.last_clock_out is not null and ra.planned_start_at is not null
          and greatest(0,floor(extract(epoch from (ta.first_clock_in-ra.planned_start_at))/60)::integer) > coalesce(st.late_grace_minutes,0)
          then 'late'
        when ta.first_clock_in is not null then 'completed'
        when ra.id is not null and k.work_date < v_today then 'absent'
        when ra.id is not null then 'scheduled'
        else 'no_record'
      end as attendance_status
    from keys k
    join public.hr_employee e on e.id=k.employee_id and e.company_id=v_company_id
    left join public.hr_roster_assignment ra
      on ra.company_id=v_company_id and ra.employee_id=k.employee_id and ra.shift_date=k.work_date
    left join public.hr_shift_template st on st.id=ra.shift_template_id
    left join time_agg ta on ta.employee_id=k.employee_id and ta.work_date=k.work_date
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'employee_id',employee_id,
      'employee_number',employee_number,
      'employee_name',employee_name,
      'branch_name',branch_name,
      'work_date',work_date,
      'roster_assignment_id',roster_assignment_id,
      'shift_name',shift_name,
      'planned_start_at',planned_start_at,
      'planned_end_at',planned_end_at,
      'required_arrival_time',required_arrival_time,
      'customer_open_time',customer_open_time,
      'break_start_time',break_start_time,
      'break_end_time',break_end_time,
      'scheduled_finish_time',scheduled_finish_time,
      'late_grace_minutes',late_grace_minutes,
      'time_entry_id',time_entry_id,
      'time_entry_count',time_entry_count,
      'first_clock_in',first_clock_in,
      'last_clock_out',last_clock_out,
      'total_break_minutes',total_break_minutes,
      'worked_minutes',worked_minutes,
      'scheduled_paid_minutes',scheduled_paid_minutes,
      'late_minutes',late_minutes,
      'early_leave_minutes',early_leave_minutes,
      'attendance_status',attendance_status
    ) order by work_date desc, employee_name),'[]'::jsonb),
    jsonb_build_object(
      'employee_days',count(*),
      'scheduled_shifts',count(*) filter (where roster_assignment_id is not null),
      'attended_days',count(*) filter (where first_clock_in is not null),
      'late_days',count(*) filter (where late_minutes > coalesce(late_grace_minutes,0)),
      'absent_days',count(*) filter (where attendance_status='absent'),
      'open_clock_ins',count(*) filter (where attendance_status='clocked_in'),
      'worked_minutes',coalesce(sum(worked_minutes),0),
      'scheduled_paid_minutes',coalesce(sum(scheduled_paid_minutes),0)
    )
  into v_rows,v_summary
  from rows;

  return jsonb_build_object(
    'ok',true,
    'mode',case when v_is_manager then 'management' else 'self' end,
    'timezone',v_tz,
    'today',v_today,
    'can_adjust',public.current_user_has_permission('hr.attendance.manage'),
    'can_review',public.current_user_has_permission('hr.attendance.review'),
    'branches',case when v_is_manager then coalesce((
      select jsonb_agg(jsonb_build_object('id',b.id,'name',b.branch_name) order by b.branch_name)
      from public.branch b where b.company_id=v_company_id
    ),'[]'::jsonb) else '[]'::jsonb end,
    'employees',case when v_is_manager then coalesce((
      select jsonb_agg(jsonb_build_object('id',e.id,'employee_number',e.employee_number,'name',e.first_name||' '||e.last_name,'branch_id',e.primary_branch_id,'status',e.status) order by e.last_name,e.first_name)
      from public.hr_employee e where e.company_id=v_company_id
    ),'[]'::jsonb) else '[]'::jsonb end,
    'summary',v_summary,
    'open_exceptions',case when v_is_manager then (
      select count(*) from public.hr_attendance_exception ae
      where ae.company_id=v_company_id and ae.status='open' and ae.exception_date between p_start_date and p_end_date
        and (p_branch_id is null or ae.branch_id=p_branch_id)
        and (p_employee_id is null or ae.employee_id=p_employee_id)
    ) else 0 end,
    'rows',v_rows
  );
end;
$function$;

revoke all on function public.get_hr_timebook_workspace(uuid,date,date,uuid) from public, anon;
grant execute on function public.get_hr_timebook_workspace(uuid,date,date,uuid) to authenticated;;
