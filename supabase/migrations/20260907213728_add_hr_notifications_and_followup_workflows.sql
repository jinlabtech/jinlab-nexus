create table if not exists public.hr_notification (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  recipient_user_id uuid not null,
  employee_id uuid null references public.hr_employee(id) on delete cascade,
  category text not null check (category in ('shift','attendance','leave','document','discipline','system')),
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  title text not null check (btrim(title) <> ''),
  message text not null check (btrim(message) <> ''),
  action_url text null,
  source_type text not null,
  source_id uuid null,
  notification_key text not null,
  due_at timestamptz null,
  read_at timestamptz null,
  resolved_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, recipient_user_id, notification_key)
);

create index if not exists hr_notification_recipient_open_idx
  on public.hr_notification(company_id, recipient_user_id, resolved_at, created_at desc);

create table if not exists public.hr_followup_task (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  assigned_user_id uuid not null,
  employee_id uuid null references public.hr_employee(id) on delete cascade,
  category text not null check (category in ('attendance','leave','document','discipline','other')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  title text not null check (btrim(title) <> ''),
  description text null,
  action_url text null,
  source_type text not null,
  source_id uuid null,
  task_key text not null,
  due_at timestamptz null,
  status text not null default 'open' check (status in ('open','in_progress','done','dismissed')),
  resolution_notes text null,
  completed_at timestamptz null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, assigned_user_id, task_key)
);

create index if not exists hr_followup_task_assignee_status_idx
  on public.hr_followup_task(company_id, assigned_user_id, status, due_at);

alter table public.hr_notification enable row level security;
alter table public.hr_followup_task enable row level security;

revoke all on public.hr_notification from public, anon, authenticated;
revoke all on public.hr_followup_task from public, anon, authenticated;

create or replace function public.refresh_hr_workflow_notifications(p_days_ahead integer default 7)
returns jsonb
language plpgsql
security definer
set search_path to public
as $function$
declare
  v_company_id uuid;
  v_employee_id uuid;
  v_is_manager boolean;
  v_tz text;
  v_today date;
  v_days integer;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.self') and not public.current_user_has_permission('hr.view') then
    raise exception 'Permission denied: HR access required.';
  end if;

  v_company_id := public.current_company_id();
  v_is_manager := public.current_user_has_permission('hr.view');
  v_days := greatest(1, least(coalesce(p_days_ahead,7), 30));

  select coalesce(timezone,'Africa/Johannesburg') into v_tz
  from public.company_profile_settings where company_id=v_company_id;
  if v_tz is null then v_tz := 'Africa/Johannesburg'; end if;
  v_today := (timezone(v_tz,now()))::date;

  select id into v_employee_id
  from public.hr_employee
  where company_id=v_company_id and user_id=auth.uid()
  limit 1;

  -- Employee shift reminders.
  if v_employee_id is not null then
    insert into public.hr_notification(
      company_id,recipient_user_id,employee_id,category,severity,title,message,
      action_url,source_type,source_id,notification_key,due_at,metadata
    )
    select
      v_company_id,auth.uid(),ra.employee_id,'shift','info','Upcoming shift',
      'You are scheduled for '||to_char(ra.shift_date,'Dy, DD Mon')||' at '||to_char(timezone(v_tz,ra.planned_start_at),'HH24:MI')||'.',
      '/hr/my-schedule','roster_shift',ra.id,'shift:'||ra.id::text,
      ra.planned_start_at - interval '12 hours',
      jsonb_build_object('shift_date',ra.shift_date,'branch_id',ra.branch_id,'shift_template_id',ra.shift_template_id)
    from public.hr_roster_assignment ra
    where ra.company_id=v_company_id
      and ra.employee_id=v_employee_id
      and ra.status='scheduled'
      and ra.shift_date between v_today and v_today+v_days
    on conflict(company_id,recipient_user_id,notification_key) do nothing;

    -- Resolve completed shift reminders after the planned shift ends.
    update public.hr_notification n
    set resolved_at=coalesce(n.resolved_at,now()), updated_at=now()
    where n.company_id=v_company_id and n.recipient_user_id=auth.uid()
      and n.source_type='roster_shift' and n.resolved_at is null
      and exists(select 1 from public.hr_roster_assignment ra where ra.id=n.source_id and ra.planned_end_at < now());
  end if;

  if v_is_manager then
    -- Pending leave approvals for every HR manager/owner/admin user.
    with managers as (
      select distinct up.user_id
      from public.user_profile up
      join public.roles r on lower(r.role_name)=lower(up.role)
      join public.role_permissions rp on rp.role_id=r.id
      join public.permissions p on p.id=rp.permission_id
      where up.company_id=v_company_id and p.permission_name='hr.view'
    )
    insert into public.hr_notification(
      company_id,recipient_user_id,employee_id,category,severity,title,message,
      action_url,source_type,source_id,notification_key,due_at,metadata
    )
    select v_company_id,m.user_id,lr.employee_id,'leave','warning','Leave approval required',
      e.first_name||' '||e.last_name||' has a leave request awaiting review.',
      '/hr','leave_request',lr.id,'leave:'||lr.id::text,
      lr.requested_at + interval '1 day',jsonb_build_object('start_date',lr.start_date,'end_date',lr.end_date)
    from managers m
    cross join public.hr_leave_request lr
    join public.hr_employee e on e.id=lr.employee_id
    where lr.company_id=v_company_id and lr.status='pending'
    on conflict(company_id,recipient_user_id,notification_key) do nothing;

    -- Open attendance exceptions.
    with managers as (
      select distinct up.user_id
      from public.user_profile up
      join public.roles r on lower(r.role_name)=lower(up.role)
      join public.role_permissions rp on rp.role_id=r.id
      join public.permissions p on p.id=rp.permission_id
      where up.company_id=v_company_id and p.permission_name='hr.view'
    )
    insert into public.hr_notification(
      company_id,recipient_user_id,employee_id,category,severity,title,message,
      action_url,source_type,source_id,notification_key,due_at,metadata
    )
    select v_company_id,m.user_id,ae.employee_id,'attendance',
      case when ae.severity='high' then 'critical' else 'warning' end,
      'Attendance exception',
      e.first_name||' '||e.last_name||': '||coalesce(ae.details,replace(ae.exception_type,'_',' ')),
      '/hr/timebook','attendance_exception',ae.id,'attendance-exception:'||ae.id::text,
      ae.created_at + interval '1 day',jsonb_build_object('exception_type',ae.exception_type,'exception_date',ae.exception_date)
    from managers m
    cross join public.hr_attendance_exception ae
    join public.hr_employee e on e.id=ae.employee_id
    where ae.company_id=v_company_id and ae.status='open'
    on conflict(company_id,recipient_user_id,notification_key) do nothing;

    -- Employees who should have arrived but have not clocked in.
    with managers as (
      select distinct up.user_id
      from public.user_profile up
      join public.roles r on lower(r.role_name)=lower(up.role)
      join public.role_permissions rp on rp.role_id=r.id
      join public.permissions p on p.id=rp.permission_id
      where up.company_id=v_company_id and p.permission_name='hr.view'
    )
    insert into public.hr_notification(
      company_id,recipient_user_id,employee_id,category,severity,title,message,
      action_url,source_type,source_id,notification_key,due_at,metadata
    )
    select v_company_id,m.user_id,ra.employee_id,'attendance','critical','Employee has not arrived',
      e.first_name||' '||e.last_name||' was expected at '||to_char(timezone(v_tz,ra.planned_start_at),'HH24:MI')||' and has no clock-in.',
      '/hr/timebook','roster_missing_arrival',ra.id,'not-arrived:'||ra.id::text,
      ra.planned_start_at + (coalesce(st.late_grace_minutes,5) * interval '1 minute'),
      jsonb_build_object('branch_id',ra.branch_id,'shift_date',ra.shift_date)
    from managers m
    cross join public.hr_roster_assignment ra
    join public.hr_employee e on e.id=ra.employee_id
    left join public.hr_shift_template st on st.id=ra.shift_template_id
    where ra.company_id=v_company_id and ra.status='scheduled' and ra.shift_date=v_today
      and now() > ra.planned_start_at + (coalesce(st.late_grace_minutes,5) * interval '1 minute')
      and not exists(select 1 from public.hr_time_entry te where te.company_id=v_company_id and te.employee_id=ra.employee_id and te.work_date=v_today)
    on conflict(company_id,recipient_user_id,notification_key) do nothing;

    -- Still clocked in after the planned end or an excessive open shift.
    with managers as (
      select distinct up.user_id
      from public.user_profile up
      join public.roles r on lower(r.role_name)=lower(up.role)
      join public.role_permissions rp on rp.role_id=r.id
      join public.permissions p on p.id=rp.permission_id
      where up.company_id=v_company_id and p.permission_name='hr.view'
    )
    insert into public.hr_notification(
      company_id,recipient_user_id,employee_id,category,severity,title,message,
      action_url,source_type,source_id,notification_key,due_at,metadata
    )
    select v_company_id,m.user_id,te.employee_id,'attendance','warning','Employee still clocked in',
      e.first_name||' '||e.last_name||' still has an open attendance entry.',
      '/hr/timebook','open_time_entry',te.id,'open-time:'||te.id::text,
      coalesce(ra.planned_end_at + interval '30 minutes',te.clock_in_at + interval '12 hours'),
      jsonb_build_object('work_date',te.work_date,'branch_id',te.branch_id)
    from managers m
    cross join public.hr_time_entry te
    join public.hr_employee e on e.id=te.employee_id
    left join public.hr_roster_assignment ra on ra.company_id=v_company_id and ra.employee_id=te.employee_id and ra.shift_date=te.work_date
    where te.company_id=v_company_id and te.status='open'
      and (now() > coalesce(ra.planned_end_at + interval '30 minutes',te.clock_in_at + interval '12 hours'))
    on conflict(company_id,recipient_user_id,notification_key) do nothing;

    -- Expiring HR documents.
    with managers as (
      select distinct up.user_id
      from public.user_profile up
      join public.roles r on lower(r.role_name)=lower(up.role)
      join public.role_permissions rp on rp.role_id=r.id
      join public.permissions p on p.id=rp.permission_id
      where up.company_id=v_company_id and p.permission_name='hr.documents.manage'
    )
    insert into public.hr_notification(
      company_id,recipient_user_id,employee_id,category,severity,title,message,
      action_url,source_type,source_id,notification_key,due_at,metadata
    )
    select v_company_id,m.user_id,d.employee_id,'document','warning','Employee document expiring',
      d.title||' for '||e.first_name||' '||e.last_name||' expires on '||to_char(d.expiry_date,'DD Mon YYYY')||'.',
      '/hr/documents','hr_document',d.id,'document-expiry:'||d.id::text,
      (d.expiry_date::timestamp at time zone v_tz),jsonb_build_object('document_type',d.document_type,'expiry_date',d.expiry_date)
    from managers m
    cross join public.hr_document_record d
    join public.hr_employee e on e.id=d.employee_id
    where d.company_id=v_company_id and d.status='current' and d.expiry_date between v_today and v_today+30
    on conflict(company_id,recipient_user_id,notification_key) do nothing;

    -- Expiring disciplinary records.
    with managers as (
      select distinct up.user_id
      from public.user_profile up
      join public.roles r on lower(r.role_name)=lower(up.role)
      join public.role_permissions rp on rp.role_id=r.id
      join public.permissions p on p.id=rp.permission_id
      where up.company_id=v_company_id and p.permission_name='hr.discipline.manage'
    )
    insert into public.hr_notification(
      company_id,recipient_user_id,employee_id,category,severity,title,message,
      action_url,source_type,source_id,notification_key,due_at,metadata
    )
    select v_company_id,m.user_id,dc.employee_id,'discipline','info','Disciplinary record expiring',
      replace(dc.case_type,'_',' ')||' for '||e.first_name||' '||e.last_name||' expires on '||to_char(dc.expiry_date,'DD Mon YYYY')||'.',
      '/hr/records','disciplinary_case',dc.id,'discipline-expiry:'||dc.id::text,
      (dc.expiry_date::timestamp at time zone v_tz),jsonb_build_object('case_type',dc.case_type,'expiry_date',dc.expiry_date)
    from managers m
    cross join public.hr_disciplinary_case dc
    join public.hr_employee e on e.id=dc.employee_id
    where dc.company_id=v_company_id and dc.status not in ('closed','withdrawn') and dc.expiry_date between v_today and v_today+30
    on conflict(company_id,recipient_user_id,notification_key) do nothing;

    -- Auto-resolve notifications when their underlying workflow is completed.
    update public.hr_notification n set resolved_at=coalesce(n.resolved_at,now()),updated_at=now()
    where n.company_id=v_company_id and n.resolved_at is null and (
      (n.source_type='leave_request' and not exists(select 1 from public.hr_leave_request x where x.id=n.source_id and x.status='pending'))
      or (n.source_type='attendance_exception' and not exists(select 1 from public.hr_attendance_exception x where x.id=n.source_id and x.status='open'))
      or (n.source_type='open_time_entry' and not exists(select 1 from public.hr_time_entry x where x.id=n.source_id and x.status='open'))
      or (n.source_type='roster_missing_arrival' and exists(select 1 from public.hr_roster_assignment ra join public.hr_time_entry te on te.employee_id=ra.employee_id and te.work_date=ra.shift_date and te.company_id=ra.company_id where ra.id=n.source_id))
      or (n.source_type='hr_document' and not exists(select 1 from public.hr_document_record x where x.id=n.source_id and x.status='current'))
      or (n.source_type='disciplinary_case' and not exists(select 1 from public.hr_disciplinary_case x where x.id=n.source_id and x.status not in ('closed','withdrawn')))
    );

    -- Follow-up tasks mirror actionable manager notifications.
    insert into public.hr_followup_task(
      company_id,assigned_user_id,employee_id,category,priority,title,description,
      action_url,source_type,source_id,task_key,due_at,created_by
    )
    select n.company_id,n.recipient_user_id,n.employee_id,
      case when n.category in ('attendance','leave','document','discipline') then n.category else 'other' end,
      case n.severity when 'critical' then 'urgent' when 'warning' then 'high' else 'normal' end,
      n.title,n.message,n.action_url,n.source_type,n.source_id,'task:'||n.notification_key,n.due_at,auth.uid()
    from public.hr_notification n
    where n.company_id=v_company_id and n.resolved_at is null
      and n.recipient_user_id in (
        select distinct up.user_id
        from public.user_profile up
        join public.roles r on lower(r.role_name)=lower(up.role)
        join public.role_permissions rp on rp.role_id=r.id
        join public.permissions p on p.id=rp.permission_id
        where up.company_id=v_company_id and p.permission_name='hr.view'
      )
      and n.category in ('attendance','leave','document','discipline')
    on conflict(company_id,assigned_user_id,task_key) do nothing;

    -- Close follow-up tasks whose source notification is resolved.
    update public.hr_followup_task t
    set status='done',completed_at=coalesce(t.completed_at,now()),updated_at=now(),
        resolution_notes=coalesce(t.resolution_notes,'Automatically completed because the underlying HR issue was resolved.')
    where t.company_id=v_company_id and t.status in ('open','in_progress')
      and exists(
        select 1 from public.hr_notification n
        where n.company_id=t.company_id and n.recipient_user_id=t.assigned_user_id
          and ('task:'||n.notification_key)=t.task_key and n.resolved_at is not null
      );
  end if;

  return jsonb_build_object(
    'ok',true,
    'unread',(select count(*) from public.hr_notification n where n.company_id=v_company_id and n.recipient_user_id=auth.uid() and n.read_at is null and n.resolved_at is null),
    'open_tasks',(select count(*) from public.hr_followup_task t where t.company_id=v_company_id and t.assigned_user_id=auth.uid() and t.status in ('open','in_progress'))
  );
end;
$function$;

create or replace function public.get_hr_notifications_workspace(p_include_resolved boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to public
as $function$
declare
  v_company_id uuid;
  v_is_manager boolean;
  v_refresh jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.self') and not public.current_user_has_permission('hr.view') then
    raise exception 'Permission denied: HR access required.';
  end if;

  v_company_id:=public.current_company_id();
  v_is_manager:=public.current_user_has_permission('hr.view');
  v_refresh:=public.refresh_hr_workflow_notifications(7);

  return jsonb_build_object(
    'ok',true,
    'mode',case when v_is_manager then 'management' else 'self' end,
    'summary',jsonb_build_object(
      'unread',(select count(*) from public.hr_notification n where n.company_id=v_company_id and n.recipient_user_id=auth.uid() and n.read_at is null and n.resolved_at is null),
      'critical',(select count(*) from public.hr_notification n where n.company_id=v_company_id and n.recipient_user_id=auth.uid() and n.severity='critical' and n.resolved_at is null),
      'warnings',(select count(*) from public.hr_notification n where n.company_id=v_company_id and n.recipient_user_id=auth.uid() and n.severity='warning' and n.resolved_at is null),
      'open_tasks',(select count(*) from public.hr_followup_task t where t.company_id=v_company_id and t.assigned_user_id=auth.uid() and t.status in ('open','in_progress'))
    ),
    'notifications',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',n.id,'category',n.category,'severity',n.severity,'title',n.title,'message',n.message,
        'action_url',n.action_url,'employee_id',n.employee_id,'employee_name',case when e.id is null then null else e.first_name||' '||e.last_name end,
        'due_at',n.due_at,'read_at',n.read_at,'resolved_at',n.resolved_at,'created_at',n.created_at,'source_type',n.source_type
      ) order by case n.severity when 'critical' then 1 when 'warning' then 2 else 3 end,n.created_at desc)
      from public.hr_notification n
      left join public.hr_employee e on e.id=n.employee_id
      where n.company_id=v_company_id and n.recipient_user_id=auth.uid()
        and (p_include_resolved or n.resolved_at is null)
    ),'[]'::jsonb),
    'tasks',case when v_is_manager then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',t.id,'category',t.category,'priority',t.priority,'title',t.title,'description',t.description,
        'action_url',t.action_url,'employee_id',t.employee_id,'employee_name',case when e.id is null then null else e.first_name||' '||e.last_name end,
        'due_at',t.due_at,'status',t.status,'resolution_notes',t.resolution_notes,'created_at',t.created_at
      ) order by case t.priority when 'urgent' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,coalesce(t.due_at,t.created_at))
      from public.hr_followup_task t
      left join public.hr_employee e on e.id=t.employee_id
      where t.company_id=v_company_id and t.assigned_user_id=auth.uid()
        and (p_include_resolved or t.status in ('open','in_progress'))
    ),'[]'::jsonb) else '[]'::jsonb end
  );
end;
$function$;

create or replace function public.mark_hr_notification_read(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $function$
declare v_company_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  v_company_id:=public.current_company_id();
  update public.hr_notification set read_at=coalesce(read_at,now()),updated_at=now()
  where id=p_notification_id and company_id=v_company_id and recipient_user_id=auth.uid();
  if not found then raise exception 'Notification could not be found.'; end if;
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.dismiss_hr_notification(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $function$
declare v_company_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  v_company_id:=public.current_company_id();
  update public.hr_notification set read_at=coalesce(read_at,now()),resolved_at=coalesce(resolved_at,now()),updated_at=now()
  where id=p_notification_id and company_id=v_company_id and recipient_user_id=auth.uid();
  if not found then raise exception 'Notification could not be found.'; end if;
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.update_hr_followup_task_status(p_task_id uuid,p_status text,p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path to public
as $function$
declare v_company_id uuid; v_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.view') then raise exception 'Permission denied: hr.view'; end if;
  v_company_id:=public.current_company_id();
  v_status:=lower(btrim(coalesce(p_status,'')));
  if v_status not in ('open','in_progress','done','dismissed') then raise exception 'Unsupported task status.'; end if;
  update public.hr_followup_task
  set status=v_status,resolution_notes=nullif(btrim(coalesce(p_notes,'')),''),
      completed_at=case when v_status in ('done','dismissed') then coalesce(completed_at,now()) else null end,
      updated_at=now()
  where id=p_task_id and company_id=v_company_id and assigned_user_id=auth.uid();
  if not found then raise exception 'Follow-up task could not be found.'; end if;
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_followup_task_status','hr',p_task_id,'HR follow-up task status changed.',jsonb_build_object('status',v_status));
  return jsonb_build_object('ok',true,'status',v_status);
end;
$function$;

revoke all on function public.refresh_hr_workflow_notifications(integer) from public,anon;
revoke all on function public.get_hr_notifications_workspace(boolean) from public,anon;
revoke all on function public.mark_hr_notification_read(uuid) from public,anon;
revoke all on function public.dismiss_hr_notification(uuid) from public,anon;
revoke all on function public.update_hr_followup_task_status(uuid,text,text) from public,anon;

grant execute on function public.refresh_hr_workflow_notifications(integer) to authenticated;
grant execute on function public.get_hr_notifications_workspace(boolean) to authenticated;
grant execute on function public.mark_hr_notification_read(uuid) to authenticated;
grant execute on function public.dismiss_hr_notification(uuid) to authenticated;
grant execute on function public.update_hr_followup_task_status(uuid,text,text) to authenticated;;
