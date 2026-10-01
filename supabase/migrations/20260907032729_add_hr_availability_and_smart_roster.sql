-- JINLAB Nexus HR: employee availability + fair automatic timetable generator.

create table if not exists public.hr_employee_availability (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  employee_id uuid not null references public.hr_employee(id) on delete cascade,
  day_of_week smallint not null check(day_of_week between 1 and 7),
  is_available boolean not null default true,
  available_from time null,
  available_to time null,
  notes text null,
  updated_by uuid null,
  updated_at timestamptz not null default now(),
  unique(company_id, employee_id, day_of_week)
);

create index if not exists hr_employee_availability_employee_idx
on public.hr_employee_availability(company_id, employee_id, day_of_week);

alter table public.hr_employee_availability enable row level security;
revoke all on public.hr_employee_availability from public, anon, authenticated;

create or replace function public.ensure_hr_default_shift_templates(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_company_id is null or not exists(select 1 from public.company where id=p_company_id) then
    raise exception 'Company could not be found.';
  end if;

  insert into public.hr_shift_template(
    company_id,name,code,start_time,end_time,break_minutes,late_grace_minutes,overtime_threshold_minutes,is_active,created_by
  )
  values
    (p_company_id,'Early Shift','EARLY','07:00','16:00',60,5,30,true,null),
    (p_company_id,'Day Shift','DAY','08:00','17:00',60,5,30,true,null),
    (p_company_id,'Late Shift','LATE','09:00','18:00',60,5,30,true,null)
  on conflict(company_id,code) do nothing;
end;
$$;

revoke all on function public.ensure_hr_default_shift_templates(uuid) from public, anon, authenticated;

-- Seed current companies.
do $$
declare v_company record;
begin
  for v_company in select id from public.company loop
    perform public.ensure_hr_default_shift_templates(v_company.id);
  end loop;
end $$;

create or replace function public.seed_hr_company_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_hr_default_org_structure(new.id);
  perform public.ensure_hr_default_shift_templates(new.id);
  return new;
end;
$$;

revoke all on function public.seed_hr_company_defaults() from public, anon, authenticated;

drop trigger if exists company_seed_hr_defaults on public.company;
create trigger company_seed_hr_defaults
after insert on public.company
for each row execute function public.seed_hr_company_defaults();

create or replace function public.save_hr_employee_availability(
  p_employee_id uuid,
  p_day_of_week integer,
  p_is_available boolean default true,
  p_available_from time default null,
  p_available_to time default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_employee public.hr_employee%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  v_company_id := public.current_company_id();

  select * into v_employee
  from public.hr_employee
  where id=p_employee_id and company_id=v_company_id;
  if not found then raise exception 'Employee could not be found.'; end if;

  if v_employee.user_id=auth.uid() then
    if not public.current_user_has_permission('hr.self') then raise exception 'Permission denied: hr.self'; end if;
  elsif not public.current_user_has_permission('hr.schedule.manage') then
    raise exception 'Permission denied: hr.schedule.manage';
  end if;

  if p_day_of_week is null or p_day_of_week<1 or p_day_of_week>7 then
    raise exception 'Day of week must be 1 (Monday) through 7 (Sunday).';
  end if;

  insert into public.hr_employee_availability(
    company_id,employee_id,day_of_week,is_available,available_from,available_to,notes,updated_by,updated_at
  )
  values(
    v_company_id,v_employee.id,p_day_of_week,coalesce(p_is_available,true),p_available_from,p_available_to,
    nullif(btrim(coalesce(p_notes,'')),''),auth.uid(),now()
  )
  on conflict(company_id,employee_id,day_of_week)
  do update set
    is_available=excluded.is_available,
    available_from=excluded.available_from,
    available_to=excluded.available_to,
    notes=excluded.notes,
    updated_by=auth.uid(),
    updated_at=now()
  returning id into v_id;

  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_availability_saved','hr',v_id,'Employee work availability saved.',
    jsonb_build_object('employee_id',v_employee.id,'day_of_week',p_day_of_week,'is_available',coalesce(p_is_available,true),'available_from',p_available_from,'available_to',p_available_to));

  return jsonb_build_object('ok',true,'id',v_id,'employee_id',v_employee.id,'day_of_week',p_day_of_week);
end;
$$;

revoke all on function public.save_hr_employee_availability(uuid,integer,boolean,time,time,text) from public, anon;
grant execute on function public.save_hr_employee_availability(uuid,integer,boolean,time,time,text) to authenticated;

create or replace function public.get_my_hr_schedule(
  p_start_date date default current_date,
  p_end_date date default (current_date + 30)
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_employee public.hr_employee%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.self') then raise exception 'Permission denied: hr.self'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date or p_end_date-p_start_date>366 then
    raise exception 'Date range is invalid.';
  end if;

  v_company_id := public.current_company_id();
  select * into v_employee from public.hr_employee where company_id=v_company_id and user_id=auth.uid() limit 1;
  if not found then raise exception 'No HR employee profile is linked to this Nexus user.'; end if;

  return jsonb_build_object(
    'ok',true,
    'employee',jsonb_build_object('id',v_employee.id,'employee_number',v_employee.employee_number,'full_name',v_employee.first_name||' '||v_employee.last_name),
    'schedule',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',ra.id,
        'shift_date',ra.shift_date,
        'shift_name',st.name,
        'shift_code',st.code,
        'branch_name',(select branch_name from public.branch where id=ra.branch_id),
        'planned_start_at',ra.planned_start_at,
        'planned_end_at',ra.planned_end_at,
        'status',ra.status
      ) order by ra.shift_date,ra.planned_start_at)
      from public.hr_roster_assignment ra
      join public.hr_shift_template st on st.id=ra.shift_template_id
      where ra.company_id=v_company_id and ra.employee_id=v_employee.id and ra.shift_date between p_start_date and p_end_date
    ),'[]'::jsonb),
    'availability',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'day_of_week',a.day_of_week,'is_available',a.is_available,
        'available_from',a.available_from,'available_to',a.available_to,'notes',a.notes
      ) order by a.day_of_week)
      from public.hr_employee_availability a
      where a.company_id=v_company_id and a.employee_id=v_employee.id
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_my_hr_schedule(date,date) from public, anon;
grant execute on function public.get_my_hr_schedule(date,date) to authenticated;

create or replace function public.generate_hr_roster(
  p_branch_id uuid,
  p_start_date date,
  p_end_date date,
  p_shift_template_ids uuid[] default null,
  p_randomize boolean default true,
  p_replace_existing boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  v_tz text;
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
  select coalesce(timezone,'Africa/Johannesburg') into v_tz from public.company_profile_settings where company_id=v_company_id;
  if v_tz is null then v_tz := 'Africa/Johannesburg'; end if;

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
        -- Safe generic default: Monday-Friday available; weekends off until explicitly configured.
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

      v_shift_hours := round((
        case when v_shift.end_time > v_shift.start_time
          then extract(epoch from (v_shift.end_time-v_shift.start_time))/3600.0
          else extract(epoch from ((v_shift.end_time + interval '24 hours')-v_shift.start_time))/3600.0
        end
      ) - (v_shift.break_minutes/60.0), 2);

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
    'message','Automatic HR timetable generated. Existing assignments, approved leave, availability and weekly hour limits were respected.'
  );
end;
$$;

revoke all on function public.generate_hr_roster(uuid,date,date,uuid[],boolean,boolean) from public, anon;
grant execute on function public.generate_hr_roster(uuid,date,date,uuid[],boolean,boolean) to authenticated;
;
