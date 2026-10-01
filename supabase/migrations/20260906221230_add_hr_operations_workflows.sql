create or replace function public.save_hr_shift_template(
  p_id uuid,
  p_name text,
  p_code text,
  p_start_time time,
  p_end_time time,
  p_break_minutes integer default 0,
  p_late_grace_minutes integer default 5,
  p_overtime_threshold_minutes integer default 30,
  p_is_active boolean default true
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_company_id uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.schedule.manage') then raise exception 'Permission denied: hr.schedule.manage'; end if;
  v_company_id:=public.current_company_id();
  if btrim(coalesce(p_name,''))='' or btrim(coalesce(p_code,''))='' then raise exception 'Shift name and code are required.'; end if;
  if p_start_time is null or p_end_time is null then raise exception 'Shift start and end times are required.'; end if;
  if coalesce(p_break_minutes,0)<0 or coalesce(p_break_minutes,0)>1440 then raise exception 'Break minutes are invalid.'; end if;
  if p_id is null then
    insert into public.hr_shift_template(company_id,name,code,start_time,end_time,break_minutes,late_grace_minutes,overtime_threshold_minutes,is_active,created_by)
    values(v_company_id,btrim(p_name),upper(btrim(p_code)),p_start_time,p_end_time,coalesce(p_break_minutes,0),coalesce(p_late_grace_minutes,5),coalesce(p_overtime_threshold_minutes,30),coalesce(p_is_active,true),auth.uid()) returning id into v_id;
  else
    update public.hr_shift_template set name=btrim(p_name),code=upper(btrim(p_code)),start_time=p_start_time,end_time=p_end_time,break_minutes=coalesce(p_break_minutes,0),late_grace_minutes=coalesce(p_late_grace_minutes,5),overtime_threshold_minutes=coalesce(p_overtime_threshold_minutes,30),is_active=coalesce(p_is_active,true),updated_at=now()
    where id=p_id and company_id=v_company_id returning id into v_id;
    if v_id is null then raise exception 'Shift template could not be found.'; end if;
  end if;
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_shift_saved','hr',v_id,'HR shift template saved.',jsonb_build_object('code',upper(btrim(p_code)),'name',btrim(p_name)));
  return jsonb_build_object('ok',true,'id',v_id,'name',btrim(p_name),'code',upper(btrim(p_code)));
end; $$;

create or replace function public.assign_hr_shift(
  p_employee_id uuid,
  p_shift_template_id uuid,
  p_shift_date date,
  p_branch_id uuid default null,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_company_id uuid; v_shift public.hr_shift_template%rowtype; v_employee public.hr_employee%rowtype; v_tz text; v_start timestamp; v_end timestamp; v_start_at timestamptz; v_end_at timestamptz; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.schedule.manage') then raise exception 'Permission denied: hr.schedule.manage'; end if;
  v_company_id:=public.current_company_id();
  select * into v_employee from public.hr_employee where id=p_employee_id and company_id=v_company_id and status in ('active','on_leave');
  if not found then raise exception 'Employee could not be found or is inactive.'; end if;
  select * into v_shift from public.hr_shift_template where id=p_shift_template_id and company_id=v_company_id and is_active=true;
  if not found then raise exception 'Shift template could not be found.'; end if;
  if p_branch_id is not null and not exists(select 1 from public.branch where id=p_branch_id and company_id=v_company_id) then raise exception 'Branch could not be found.'; end if;
  select coalesce(timezone,'Africa/Johannesburg') into v_tz from public.company_profile_settings where company_id=v_company_id;
  if v_tz is null then v_tz:='Africa/Johannesburg'; end if;
  v_start:=p_shift_date+v_shift.start_time;
  v_end:=p_shift_date+v_shift.end_time;
  if v_shift.end_time<=v_shift.start_time then v_end:=v_end+interval '1 day'; end if;
  v_start_at:=v_start at time zone v_tz;
  v_end_at:=v_end at time zone v_tz;
  insert into public.hr_roster_assignment(company_id,employee_id,branch_id,shift_template_id,shift_date,planned_start_at,planned_end_at,status,notes,created_by)
  values(v_company_id,p_employee_id,coalesce(p_branch_id,v_employee.primary_branch_id),p_shift_template_id,p_shift_date,v_start_at,v_end_at,'scheduled',nullif(btrim(coalesce(p_notes,'')),''),auth.uid())
  on conflict(company_id,employee_id,shift_date) do update set branch_id=excluded.branch_id,shift_template_id=excluded.shift_template_id,planned_start_at=excluded.planned_start_at,planned_end_at=excluded.planned_end_at,status='scheduled',notes=excluded.notes,updated_at=now()
  returning id into v_id;
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_shift_assigned','hr',v_id,'Employee shift assigned.',jsonb_build_object('employee_id',p_employee_id,'shift_date',p_shift_date,'shift_template_id',p_shift_template_id));
  return jsonb_build_object('ok',true,'id',v_id,'employee_id',p_employee_id,'shift_date',p_shift_date,'planned_start_at',v_start_at,'planned_end_at',v_end_at);
end; $$;

create or replace function public.set_hr_leave_balance(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_period_start date,
  p_period_end date,
  p_opening_units numeric default 0,
  p_accrued_units numeric default 0,
  p_adjustment_units numeric default 0,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_company_id uuid; v_id uuid; v_used numeric; v_available numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.leave.manage') then raise exception 'Permission denied: hr.leave.manage'; end if;
  v_company_id:=public.current_company_id();
  if p_period_start is null or p_period_end is null or p_period_end<p_period_start then raise exception 'Leave balance period is invalid.'; end if;
  if not exists(select 1 from public.hr_employee where id=p_employee_id and company_id=v_company_id) then raise exception 'Employee could not be found.'; end if;
  if not exists(select 1 from public.hr_leave_type where id=p_leave_type_id and company_id=v_company_id) then raise exception 'Leave type could not be found.'; end if;
  insert into public.hr_leave_balance(company_id,employee_id,leave_type_id,period_start,period_end,opening_units,accrued_units,adjustment_units,notes,updated_by)
  values(v_company_id,p_employee_id,p_leave_type_id,p_period_start,p_period_end,coalesce(p_opening_units,0),coalesce(p_accrued_units,0),coalesce(p_adjustment_units,0),nullif(btrim(coalesce(p_notes,'')),''),auth.uid())
  on conflict(company_id,employee_id,leave_type_id,period_start,period_end) do update set opening_units=excluded.opening_units,accrued_units=excluded.accrued_units,adjustment_units=excluded.adjustment_units,notes=excluded.notes,updated_by=auth.uid(),updated_at=now()
  returning id into v_id;
  select coalesce(sum(lr.calendar_days),0) into v_used from public.hr_leave_request lr where lr.company_id=v_company_id and lr.employee_id=p_employee_id and lr.leave_type_id=p_leave_type_id and lr.status='approved' and lr.start_date<=p_period_end and lr.end_date>=p_period_start;
  v_available:=coalesce(p_opening_units,0)+coalesce(p_accrued_units,0)+coalesce(p_adjustment_units,0)-v_used;
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_leave_balance_saved','hr',v_id,'Leave balance configured.',jsonb_build_object('employee_id',p_employee_id,'leave_type_id',p_leave_type_id,'available_units',v_available));
  return jsonb_build_object('ok',true,'id',v_id,'used_units',v_used,'available_units',v_available);
end; $$;

create or replace function public.run_hr_attendance_review(
  p_date date default current_date,
  p_branch_id uuid default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_company_id uuid; r record; te public.hr_time_entry%rowtype; v_now timestamptz:=now(); v_count integer:=0; v_minutes integer; v_key text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.attendance.review') then raise exception 'Permission denied: hr.attendance.review'; end if;
  v_company_id:=public.current_company_id();
  if p_branch_id is not null and not exists(select 1 from public.branch where id=p_branch_id and company_id=v_company_id) then raise exception 'Branch could not be found.'; end if;
  for r in select ra.*, st.late_grace_minutes, st.overtime_threshold_minutes, e.first_name,e.last_name from public.hr_roster_assignment ra join public.hr_shift_template st on st.id=ra.shift_template_id join public.hr_employee e on e.id=ra.employee_id where ra.company_id=v_company_id and ra.shift_date=p_date and ra.status='scheduled' and (p_branch_id is null or ra.branch_id=p_branch_id)
  loop
    select * into te from public.hr_time_entry where company_id=v_company_id and employee_id=r.employee_id and work_date=r.shift_date order by clock_in_at asc limit 1;
    if not found then
      if v_now>r.planned_end_at then
        v_key:=r.id::text||':absence';
        insert into public.hr_attendance_exception(company_id,employee_id,roster_assignment_id,branch_id,exception_date,exception_type,severity,exception_key,details,metadata)
        values(v_company_id,r.employee_id,r.id,r.branch_id,r.shift_date,'absence','high',v_key,'No time entry found for scheduled shift.',jsonb_build_object('planned_start_at',r.planned_start_at,'planned_end_at',r.planned_end_at))
        on conflict(company_id,exception_key) do update set updated_at=now();
        v_count:=v_count+1;
      end if;
      continue;
    end if;
    if te.clock_in_at>r.planned_start_at+make_interval(mins=>r.late_grace_minutes) then
      v_minutes:=greatest(0,floor(extract(epoch from (te.clock_in_at-r.planned_start_at))/60)::int);
      v_key:=r.id::text||':late';
      insert into public.hr_attendance_exception(company_id,employee_id,roster_assignment_id,time_entry_id,branch_id,exception_date,exception_type,severity,exception_key,minutes_variance,details)
      values(v_company_id,r.employee_id,r.id,te.id,r.branch_id,r.shift_date,'late',case when v_minutes>=60 then 'high' when v_minutes>=15 then 'medium' else 'low' end,v_key,v_minutes,'Clock-in occurred after scheduled start.')
      on conflict(company_id,exception_key) do update set time_entry_id=excluded.time_entry_id,minutes_variance=excluded.minutes_variance,severity=excluded.severity,updated_at=now();
      v_count:=v_count+1;
    end if;
    if te.clock_out_at is null and v_now>r.planned_end_at+interval '30 minutes' then
      v_key:=r.id::text||':missing_clock_out';
      insert into public.hr_attendance_exception(company_id,employee_id,roster_assignment_id,time_entry_id,branch_id,exception_date,exception_type,severity,exception_key,details)
      values(v_company_id,r.employee_id,r.id,te.id,r.branch_id,r.shift_date,'missing_clock_out','high',v_key,'Shift ended but no clock-out was recorded.')
      on conflict(company_id,exception_key) do update set time_entry_id=excluded.time_entry_id,updated_at=now();
      v_count:=v_count+1;
    elsif te.clock_out_at is not null then
      if te.clock_out_at<r.planned_end_at then
        v_minutes:=greatest(0,floor(extract(epoch from (r.planned_end_at-te.clock_out_at))/60)::int);
        if v_minutes>=5 then
          v_key:=r.id::text||':early_departure';
          insert into public.hr_attendance_exception(company_id,employee_id,roster_assignment_id,time_entry_id,branch_id,exception_date,exception_type,severity,exception_key,minutes_variance,details)
          values(v_company_id,r.employee_id,r.id,te.id,r.branch_id,r.shift_date,'early_departure',case when v_minutes>=60 then 'high' when v_minutes>=15 then 'medium' else 'low' end,v_key,v_minutes,'Clock-out occurred before scheduled end.')
          on conflict(company_id,exception_key) do update set minutes_variance=excluded.minutes_variance,severity=excluded.severity,updated_at=now();
          v_count:=v_count+1;
        end if;
      end if;
      if te.clock_out_at>r.planned_end_at+make_interval(mins=>r.overtime_threshold_minutes) then
        v_minutes:=greatest(0,floor(extract(epoch from (te.clock_out_at-r.planned_end_at))/60)::int);
        v_key:=r.id::text||':overtime';
        insert into public.hr_attendance_exception(company_id,employee_id,roster_assignment_id,time_entry_id,branch_id,exception_date,exception_type,severity,exception_key,minutes_variance,details)
        values(v_company_id,r.employee_id,r.id,te.id,r.branch_id,r.shift_date,'overtime','medium',v_key,v_minutes,'Time worked beyond scheduled end requires review.')
        on conflict(company_id,exception_key) do update set minutes_variance=excluded.minutes_variance,updated_at=now();
        v_count:=v_count+1;
      end if;
    end if;
  end loop;
  insert into public.audit_log(company_id,user_id,action,module,description,metadata)
  values(v_company_id,auth.uid(),'hr_attendance_review_run','hr','Attendance exception review completed.',jsonb_build_object('date',p_date,'branch_id',p_branch_id,'signals_processed',v_count));
  return jsonb_build_object('ok',true,'date',p_date,'signals_processed',v_count);
end; $$;

create or replace function public.resolve_hr_attendance_exception(
  p_exception_id uuid,
  p_resolution text,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_company_id uuid; v_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.attendance.review') then raise exception 'Permission denied: hr.attendance.review'; end if;
  v_company_id:=public.current_company_id(); v_status:=lower(btrim(coalesce(p_resolution,'')));
  if v_status not in ('resolved','dismissed') then raise exception 'Resolution must be resolved or dismissed.'; end if;
  update public.hr_attendance_exception set status=v_status,resolution_notes=nullif(btrim(coalesce(p_notes,'')),''),resolved_by=auth.uid(),resolved_at=now(),updated_at=now() where id=p_exception_id and company_id=v_company_id and status='open';
  if not found then raise exception 'Open attendance exception could not be found.'; end if;
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_attendance_exception_resolved','hr',p_exception_id,'Attendance exception reviewed.',jsonb_build_object('resolution',v_status));
  return jsonb_build_object('ok',true,'id',p_exception_id,'status',v_status);
end; $$;

create or replace function public.save_hr_performance_review(
  p_id uuid,
  p_employee_id uuid,
  p_period_start date,
  p_period_end date,
  p_rating numeric default null,
  p_summary text default null,
  p_strengths text default null,
  p_improvement_areas text default null,
  p_goals text default null,
  p_status text default 'draft'
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_company_id uuid; v_id uuid; v_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.performance.manage') then raise exception 'Permission denied: hr.performance.manage'; end if;
  v_company_id:=public.current_company_id(); v_status:=lower(btrim(coalesce(p_status,'draft')));
  if p_period_start is null or p_period_end is null or p_period_end<p_period_start then raise exception 'Performance review period is invalid.'; end if;
  if p_rating is not null and (p_rating<1 or p_rating>5) then raise exception 'Rating must be between 1 and 5.'; end if;
  if v_status not in ('draft','submitted','acknowledged','closed') then raise exception 'Unsupported review status.'; end if;
  if not exists(select 1 from public.hr_employee where id=p_employee_id and company_id=v_company_id) then raise exception 'Employee could not be found.'; end if;
  if p_id is null then
    insert into public.hr_performance_review(company_id,employee_id,reviewer_user_id,period_start,period_end,rating,status,summary,strengths,improvement_areas,goals,reviewed_at,created_by)
    values(v_company_id,p_employee_id,auth.uid(),p_period_start,p_period_end,p_rating,v_status,nullif(btrim(coalesce(p_summary,'')),''),nullif(btrim(coalesce(p_strengths,'')),''),nullif(btrim(coalesce(p_improvement_areas,'')),''),nullif(btrim(coalesce(p_goals,'')),''),case when v_status='draft' then null else now() end,auth.uid()) returning id into v_id;
  else
    update public.hr_performance_review set period_start=p_period_start,period_end=p_period_end,rating=p_rating,status=v_status,summary=nullif(btrim(coalesce(p_summary,'')),''),strengths=nullif(btrim(coalesce(p_strengths,'')),''),improvement_areas=nullif(btrim(coalesce(p_improvement_areas,'')),''),goals=nullif(btrim(coalesce(p_goals,'')),''),reviewer_user_id=auth.uid(),reviewed_at=case when v_status='draft' then reviewed_at else coalesce(reviewed_at,now()) end,updated_at=now() where id=p_id and company_id=v_company_id returning id into v_id;
    if v_id is null then raise exception 'Performance review could not be found.'; end if;
  end if;
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_performance_review_saved','hr',v_id,'Performance review saved.',jsonb_build_object('employee_id',p_employee_id,'status',v_status,'rating',p_rating));
  return jsonb_build_object('ok',true,'id',v_id,'status',v_status,'rating',p_rating);
end; $$;

create or replace function public.save_hr_disciplinary_case(
  p_id uuid,
  p_employee_id uuid,
  p_case_type text,
  p_incident_date date,
  p_summary text,
  p_details text default null,
  p_action_taken text default null,
  p_status text default 'open',
  p_expiry_date date default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_company_id uuid; v_id uuid; v_type text; v_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.discipline.manage') then raise exception 'Permission denied: hr.discipline.manage'; end if;
  v_company_id:=public.current_company_id(); v_type:=lower(btrim(coalesce(p_case_type,''))); v_status:=lower(btrim(coalesce(p_status,'open')));
  if v_type not in ('counselling','verbal_warning','written_warning','final_written_warning','investigation','misconduct','other') then raise exception 'Unsupported disciplinary case type.'; end if;
  if v_status not in ('open','issued','appealed','closed','withdrawn') then raise exception 'Unsupported disciplinary status.'; end if;
  if btrim(coalesce(p_summary,''))='' then raise exception 'Case summary is required.'; end if;
  if not exists(select 1 from public.hr_employee where id=p_employee_id and company_id=v_company_id) then raise exception 'Employee could not be found.'; end if;
  if p_id is null then
    insert into public.hr_disciplinary_case(company_id,employee_id,case_type,incident_date,status,summary,details,action_taken,issued_by,issued_at,expiry_date,created_by)
    values(v_company_id,p_employee_id,v_type,coalesce(p_incident_date,current_date),v_status,btrim(p_summary),nullif(btrim(coalesce(p_details,'')),''),nullif(btrim(coalesce(p_action_taken,'')),''),case when v_status in ('issued','closed') then auth.uid() else null end,case when v_status in ('issued','closed') then now() else null end,p_expiry_date,auth.uid()) returning id into v_id;
  else
    update public.hr_disciplinary_case set case_type=v_type,incident_date=coalesce(p_incident_date,incident_date),status=v_status,summary=btrim(p_summary),details=nullif(btrim(coalesce(p_details,'')),''),action_taken=nullif(btrim(coalesce(p_action_taken,'')),''),issued_by=case when v_status in ('issued','closed') then coalesce(issued_by,auth.uid()) else issued_by end,issued_at=case when v_status in ('issued','closed') then coalesce(issued_at,now()) else issued_at end,expiry_date=p_expiry_date,updated_at=now() where id=p_id and company_id=v_company_id returning id into v_id;
    if v_id is null then raise exception 'Disciplinary case could not be found.'; end if;
  end if;
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_disciplinary_case_saved','hr',v_id,'Disciplinary case saved.',jsonb_build_object('employee_id',p_employee_id,'case_type',v_type,'status',v_status));
  return jsonb_build_object('ok',true,'id',v_id,'case_type',v_type,'status',v_status);
end; $$;

create or replace function public.save_hr_document_record(
  p_id uuid,
  p_employee_id uuid,
  p_document_type text,
  p_title text,
  p_file_path text default null,
  p_issued_date date default null,
  p_expiry_date date default null,
  p_status text default 'current',
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_company_id uuid; v_id uuid; v_type text; v_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.documents.manage') then raise exception 'Permission denied: hr.documents.manage'; end if;
  v_company_id:=public.current_company_id(); v_type:=lower(btrim(coalesce(p_document_type,''))); v_status:=lower(btrim(coalesce(p_status,'current')));
  if v_type not in ('contract','id_document','certificate','medical_note','warning','performance','policy_acknowledgement','other') then raise exception 'Unsupported document type.'; end if;
  if v_status not in ('current','expired','archived') then raise exception 'Unsupported document status.'; end if;
  if btrim(coalesce(p_title,''))='' then raise exception 'Document title is required.'; end if;
  if p_expiry_date is not null and p_issued_date is not null and p_expiry_date<p_issued_date then raise exception 'Document expiry date is invalid.'; end if;
  if not exists(select 1 from public.hr_employee where id=p_employee_id and company_id=v_company_id) then raise exception 'Employee could not be found.'; end if;
  if p_id is null then
    insert into public.hr_document_record(company_id,employee_id,document_type,title,file_path,issued_date,expiry_date,status,notes,created_by)
    values(v_company_id,p_employee_id,v_type,btrim(p_title),nullif(btrim(coalesce(p_file_path,'')),''),p_issued_date,p_expiry_date,v_status,nullif(btrim(coalesce(p_notes,'')),''),auth.uid()) returning id into v_id;
  else
    update public.hr_document_record set document_type=v_type,title=btrim(p_title),file_path=nullif(btrim(coalesce(p_file_path,'')),''),issued_date=p_issued_date,expiry_date=p_expiry_date,status=v_status,notes=nullif(btrim(coalesce(p_notes,'')),''),updated_at=now() where id=p_id and company_id=v_company_id returning id into v_id;
    if v_id is null then raise exception 'HR document record could not be found.'; end if;
  end if;
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_document_saved','hr',v_id,'HR document metadata saved.',jsonb_build_object('employee_id',p_employee_id,'document_type',v_type,'status',v_status));
  return jsonb_build_object('ok',true,'id',v_id,'document_type',v_type,'status',v_status);
end; $$;

create or replace function public.get_hr_operations_workspace(
  p_branch_id uuid default null,
  p_start_date date default current_date,
  p_end_date date default (current_date+14)
) returns jsonb
language plpgsql security definer set search_path=public as $$
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
    'shift_templates',case when public.current_user_has_permission('hr.schedule.manage') then coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'code',s.code,'start_time',s.start_time,'end_time',s.end_time,'break_minutes',s.break_minutes,'is_active',s.is_active) order by s.name) from public.hr_shift_template s where s.company_id=v_company_id),'[]'::jsonb) else '[]'::jsonb end,
    'roster',coalesce((select jsonb_agg(x.obj order by x.shift_date,x.planned_start_at) from (select ra.shift_date,ra.planned_start_at,jsonb_build_object('id',ra.id,'employee_id',e.id,'employee_number',e.employee_number,'employee_name',e.first_name||' '||e.last_name,'branch_name',(select branch_name from public.branch where id=ra.branch_id),'shift_name',st.name,'shift_date',ra.shift_date,'planned_start_at',ra.planned_start_at,'planned_end_at',ra.planned_end_at,'status',ra.status) obj from public.hr_roster_assignment ra join public.hr_employee e on e.id=ra.employee_id join public.hr_shift_template st on st.id=ra.shift_template_id where ra.company_id=v_company_id and ra.shift_date between p_start_date and p_end_date and (p_branch_id is null or ra.branch_id=p_branch_id) and (v_is_manager or ra.employee_id=v_employee_id)) x),'[]'::jsonb),
    'attendance_exceptions',case when v_is_manager then coalesce((select jsonb_agg(x.obj order by x.exception_date desc) from (select ae.exception_date,jsonb_build_object('id',ae.id,'employee_id',e.id,'employee_name',e.first_name||' '||e.last_name,'exception_type',ae.exception_type,'severity',ae.severity,'status',ae.status,'minutes_variance',ae.minutes_variance,'details',ae.details,'exception_date',ae.exception_date,'branch_name',(select branch_name from public.branch where id=ae.branch_id)) obj from public.hr_attendance_exception ae join public.hr_employee e on e.id=ae.employee_id where ae.company_id=v_company_id and ae.exception_date between p_start_date and p_end_date and (p_branch_id is null or ae.branch_id=p_branch_id) order by ae.exception_date desc limit 200) x),'[]'::jsonb) else '[]'::jsonb end,
    'leave_balances',coalesce((select jsonb_agg(jsonb_build_object('id',lb.id,'employee_id',e.id,'employee_name',e.first_name||' '||e.last_name,'leave_type',lt.name,'period_start',lb.period_start,'period_end',lb.period_end,'opening_units',lb.opening_units,'accrued_units',lb.accrued_units,'adjustment_units',lb.adjustment_units,'used_units',(select coalesce(sum(lr.calendar_days),0) from public.hr_leave_request lr where lr.company_id=v_company_id and lr.employee_id=lb.employee_id and lr.leave_type_id=lb.leave_type_id and lr.status='approved' and lr.start_date<=lb.period_end and lr.end_date>=lb.period_start),'available_units',lb.opening_units+lb.accrued_units+lb.adjustment_units-(select coalesce(sum(lr.calendar_days),0) from public.hr_leave_request lr where lr.company_id=v_company_id and lr.employee_id=lb.employee_id and lr.leave_type_id=lb.leave_type_id and lr.status='approved' and lr.start_date<=lb.period_end and lr.end_date>=lb.period_start)) order by e.last_name,e.first_name,lt.name) from public.hr_leave_balance lb join public.hr_employee e on e.id=lb.employee_id join public.hr_leave_type lt on lt.id=lb.leave_type_id where lb.company_id=v_company_id and (v_is_manager or lb.employee_id=v_employee_id)),'[]'::jsonb),
    'performance_summary',case when v_is_manager then jsonb_build_object('open_reviews',(select count(*) from public.hr_performance_review where company_id=v_company_id and status in ('draft','submitted')),'closed_reviews',(select count(*) from public.hr_performance_review where company_id=v_company_id and status in ('acknowledged','closed'))) else '{}'::jsonb end,
    'discipline_summary',case when public.current_user_has_permission('hr.discipline.manage') then jsonb_build_object('open_cases',(select count(*) from public.hr_disciplinary_case where company_id=v_company_id and status in ('open','issued','appealed')),'closed_cases',(select count(*) from public.hr_disciplinary_case where company_id=v_company_id and status in ('closed','withdrawn'))) else '{}'::jsonb end,
    'documents_summary',case when public.current_user_has_permission('hr.documents.manage') then jsonb_build_object('current',(select count(*) from public.hr_document_record where company_id=v_company_id and status='current'),'expiring_30_days',(select count(*) from public.hr_document_record where company_id=v_company_id and status='current' and expiry_date between current_date and current_date+30)) else '{}'::jsonb end
  );
end; $$;

revoke execute on function public.save_hr_shift_template(uuid,text,text,time,time,integer,integer,integer,boolean) from public,anon;
revoke execute on function public.assign_hr_shift(uuid,uuid,date,uuid,text) from public,anon;
revoke execute on function public.set_hr_leave_balance(uuid,uuid,date,date,numeric,numeric,numeric,text) from public,anon;
revoke execute on function public.run_hr_attendance_review(date,uuid) from public,anon;
revoke execute on function public.resolve_hr_attendance_exception(uuid,text,text) from public,anon;
revoke execute on function public.save_hr_performance_review(uuid,uuid,date,date,numeric,text,text,text,text,text) from public,anon;
revoke execute on function public.save_hr_disciplinary_case(uuid,uuid,text,date,text,text,text,text,date) from public,anon;
revoke execute on function public.save_hr_document_record(uuid,uuid,text,text,text,date,date,text,text) from public,anon;
revoke execute on function public.get_hr_operations_workspace(uuid,date,date) from public,anon;

grant execute on function public.save_hr_shift_template(uuid,text,text,time,time,integer,integer,integer,boolean) to authenticated;
grant execute on function public.assign_hr_shift(uuid,uuid,date,uuid,text) to authenticated;
grant execute on function public.set_hr_leave_balance(uuid,uuid,date,date,numeric,numeric,numeric,text) to authenticated;
grant execute on function public.run_hr_attendance_review(date,uuid) to authenticated;
grant execute on function public.resolve_hr_attendance_exception(uuid,text,text) to authenticated;
grant execute on function public.save_hr_performance_review(uuid,uuid,date,date,numeric,text,text,text,text,text) to authenticated;
grant execute on function public.save_hr_disciplinary_case(uuid,uuid,text,date,text,text,text,text,date) to authenticated;
grant execute on function public.save_hr_document_record(uuid,uuid,text,text,text,date,date,text,text) to authenticated;
grant execute on function public.get_hr_operations_workspace(uuid,date,date) to authenticated;;
