alter table public.hr_shift_template
  add column if not exists customer_open_time time without time zone,
  add column if not exists break_start_time time without time zone,
  add column if not exists break_end_time time without time zone,
  add column if not exists days_of_week smallint[] not null default array[1,2,3,4,5]::smallint[];

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='hr_shift_template_days_of_week_check'
      and conrelid='public.hr_shift_template'::regclass
  ) then
    alter table public.hr_shift_template
      add constraint hr_shift_template_days_of_week_check
      check (
        cardinality(days_of_week) between 1 and 7
        and days_of_week <@ array[1,2,3,4,5,6,7]::smallint[]
      );
  end if;
end $$;

update public.hr_shift_template
set days_of_week=array[1,2,3,4,5]::smallint[]
where days_of_week is null;

update public.hr_shift_template s
set
  name='Standard Weekday',
  start_time='08:00'::time,
  end_time='17:30'::time,
  break_minutes=60,
  break_start_time='11:00'::time,
  break_end_time='12:00'::time,
  customer_open_time='08:30'::time,
  late_grace_minutes=5,
  overtime_threshold_minutes=30,
  days_of_week=array[1,2,3,4,5]::smallint[],
  is_active=true,
  updated_at=now()
from public.company c
where s.company_id=c.id
  and c.company_name='JINLAB'
  and s.code='DAY';

update public.hr_shift_template s
set is_active=false, updated_at=now()
from public.company c
where s.company_id=c.id
  and c.company_name='JINLAB'
  and s.code in ('EARLY','LATE');

insert into public.hr_shift_template(
  company_id,name,code,start_time,end_time,break_minutes,
  late_grace_minutes,overtime_threshold_minutes,is_active,
  customer_open_time,break_start_time,break_end_time,days_of_week
)
select
  c.id,'Weekend','WEEKEND','08:30'::time,'16:00'::time,60,
  5,30,true,'08:30'::time,'11:00'::time,'12:00'::time,
  array[6,7]::smallint[]
from public.company c
where c.company_name='JINLAB'
on conflict(company_id,code) do update set
  name=excluded.name,
  start_time=excluded.start_time,
  end_time=excluded.end_time,
  break_minutes=excluded.break_minutes,
  late_grace_minutes=excluded.late_grace_minutes,
  overtime_threshold_minutes=excluded.overtime_threshold_minutes,
  is_active=excluded.is_active,
  customer_open_time=excluded.customer_open_time,
  break_start_time=excluded.break_start_time,
  break_end_time=excluded.break_end_time,
  days_of_week=excluded.days_of_week,
  updated_at=now();

create or replace function public.generate_hr_roster(
  p_branch_id uuid,
  p_start_date date,
  p_end_date date,
  p_shift_template_ids uuid[] default null::uuid[],
  p_randomize boolean default true,
  p_replace_existing boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_company_id uuid;
  v_date date;
  v_employee record;
  v_shift public.hr_shift_template%rowtype;
  v_availability public.hr_employee_availability%rowtype;
  v_has_availability boolean;
  v_week_start date;
  v_week_end date;
  v_existing_hours numeric;
  v_shift_hours numeric;
  v_created integer := 0;
  v_skipped_existing integer := 0;
  v_skipped_leave integer := 0;
  v_skipped_unavailable integer := 0;
  v_skipped_hours integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.schedule.manage') then raise exception 'Permission denied: hr.schedule.manage'; end if;

  v_company_id := public.current_company_id();
  if p_branch_id is null or not exists(select 1 from public.branch where id=p_branch_id and company_id=v_company_id) then
    raise exception 'A valid branch is required for automatic scheduling.';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date or p_end_date-p_start_date>62 then
    raise exception 'Automatic roster range must be between 1 and 63 days.';
  end if;

  perform public.ensure_hr_default_shift_templates(v_company_id);

  if p_replace_existing then
    if p_start_date < current_date then raise exception 'Past roster assignments cannot be bulk replaced.'; end if;
    delete from public.hr_roster_assignment
    where company_id=v_company_id and branch_id=p_branch_id and shift_date between p_start_date and p_end_date and status='scheduled';
  end if;

  for v_date in
    select d::date from generate_series(p_start_date::timestamp,p_end_date::timestamp,interval '1 day') d
  loop
    for v_employee in
      select e.*
      from public.hr_employee e
      where e.company_id=v_company_id
        and e.status='active'
        and e.primary_branch_id=p_branch_id
      order by case when p_randomize then random() else 0 end, e.employee_number
    loop
      if exists(
        select 1 from public.hr_roster_assignment ra
        where ra.company_id=v_company_id and ra.employee_id=v_employee.id and ra.shift_date=v_date
      ) then
        v_skipped_existing := v_skipped_existing + 1;
        continue;
      end if;

      if exists(
        select 1 from public.hr_leave_request lr
        where lr.company_id=v_company_id and lr.employee_id=v_employee.id and lr.status='approved'
          and v_date between lr.start_date and lr.end_date
      ) then
        v_skipped_leave := v_skipped_leave + 1;
        continue;
      end if;

      select exists(
        select 1 from public.hr_employee_availability a
        where a.company_id=v_company_id and a.employee_id=v_employee.id and a.day_of_week=extract(isodow from v_date)::integer
      ) into v_has_availability;

      if v_has_availability then
        select * into v_availability
        from public.hr_employee_availability a
        where a.company_id=v_company_id and a.employee_id=v_employee.id and a.day_of_week=extract(isodow from v_date)::integer;

        if not v_availability.is_available then
          v_skipped_unavailable := v_skipped_unavailable + 1;
          continue;
        end if;
      else
        if extract(isodow from v_date)::integer > 5 then
          v_skipped_unavailable := v_skipped_unavailable + 1;
          continue;
        end if;
        v_availability.available_from := null;
        v_availability.available_to := null;
      end if;

      select st.* into v_shift
      from public.hr_shift_template st
      where st.company_id=v_company_id and st.is_active=true
        and extract(isodow from v_date)::smallint = any(st.days_of_week)
        and (p_shift_template_ids is null or cardinality(p_shift_template_ids)=0 or st.id=any(p_shift_template_ids))
        and (
          v_availability.available_from is null or v_availability.available_to is null
          or (
            v_availability.available_from <= v_availability.available_to
            and st.end_time > st.start_time
            and st.start_time >= v_availability.available_from
            and st.end_time <= v_availability.available_to
          )
          or (
            v_availability.available_from > v_availability.available_to
            and (st.start_time >= v_availability.available_from or st.end_time <= v_availability.available_to)
          )
        )
      order by case when p_randomize then random() else 0 end, st.start_time, st.code
      limit 1;

      if not found then
        v_skipped_unavailable := v_skipped_unavailable + 1;
        continue;
      end if;

      v_shift_hours := public.hr_shift_paid_hours(v_shift.start_time,v_shift.end_time,v_shift.break_minutes);

      v_week_start := v_date - (extract(isodow from v_date)::integer - 1);
      v_week_end := v_week_start + 6;

      select coalesce(sum(
        greatest(0,
          extract(epoch from (ra.planned_end_at-ra.planned_start_at))/3600.0 - (st.break_minutes/60.0)
        )
      ),0)
      into v_existing_hours
      from public.hr_roster_assignment ra
      join public.hr_shift_template st on st.id=ra.shift_template_id
      where ra.company_id=v_company_id and ra.employee_id=v_employee.id and ra.shift_date between v_week_start and v_week_end;

      if v_existing_hours + v_shift_hours > coalesce(v_employee.standard_hours_per_week,45) + 0.01 then
        v_skipped_hours := v_skipped_hours + 1;
        continue;
      end if;

      perform public.assign_hr_shift(v_employee.id,v_shift.id,v_date,p_branch_id,'Automatically generated by Nexus HR timetable');
      v_created := v_created + 1;
    end loop;
  end loop;

  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_roster_generated','hr',null,'Nexus HR automatic timetable generated.',
    jsonb_build_object('branch_id',p_branch_id,'start_date',p_start_date,'end_date',p_end_date,'randomize',coalesce(p_randomize,true),'replace_existing',coalesce(p_replace_existing,false),'created',v_created,'skipped_existing',v_skipped_existing,'skipped_leave',v_skipped_leave,'skipped_unavailable',v_skipped_unavailable,'skipped_hours',v_skipped_hours));

  return jsonb_build_object(
    'ok',true,
    'created',v_created,
    'skipped_existing',v_skipped_existing,
    'skipped_leave',v_skipped_leave,
    'skipped_unavailable',v_skipped_unavailable,
    'skipped_hours',v_skipped_hours,
    'message','Automatic HR timetable generated. Shift day rules, existing assignments, approved leave, employee availability and weekly hour limits were respected.'
  );
end;
$function$;;
