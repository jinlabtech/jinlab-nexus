do $$
declare
  v_old_company uuid;
  v_new_company uuid;
  v_old_branch uuid;
  v_new_branch uuid;
  v_owner_user uuid;
  v_last_employee_no bigint := 0;
begin
  select id into v_old_company from public.company where company_name='EPEX EDEMY' order by id limit 1;
  select id into v_new_company from public.company where company_name='JINLAB' order by id limit 1;

  if v_old_company is null or v_new_company is null then
    raise exception 'Required source or destination company not found.';
  end if;

  if exists(select 1 from public.hr_employee where company_id=v_new_company)
     or exists(select 1 from public.user_profile where company_id=v_new_company) then
    raise exception 'JINLAB already has production users or HR employees; migration stopped to avoid collisions.';
  end if;

  select user_id into v_owner_user
  from public.user_profile
  where company_id=v_old_company
    and lower(email)=lower('jinlabtech@gmail.com')
    and role='owner'
  order by created_at
  limit 1;

  if v_owner_user is null then
    raise exception 'JINLAB owner profile could not be identified safely.';
  end if;

  select id into v_old_branch
  from public.branch
  where company_id=v_old_company
    and branch_name='122J Pressident Street'
  order by created_at
  limit 1;

  if v_old_branch is null then
    raise exception 'Real JINLAB operating branch source could not be identified.';
  end if;

  insert into public.branch(company_id,branch_name,address)
  select v_new_company, b.branch_name, b.address
  from public.branch b
  where b.id=v_old_branch
    and not exists(
      select 1 from public.branch nb
      where nb.company_id=v_new_company
        and nb.branch_name=b.branch_name
    );

  select id into v_new_branch
  from public.branch
  where company_id=v_new_company
    and branch_name='122J Pressident Street'
  order by created_at
  limit 1;

  if v_new_branch is null then
    raise exception 'Failed to create or locate JINLAB operating branch.';
  end if;

  update public.hr_attendance_device set branch_id=v_new_branch where company_id=v_old_company and branch_id=v_old_branch;
  update public.hr_attendance_event set branch_id=v_new_branch where company_id=v_old_company and branch_id=v_old_branch;
  update public.hr_attendance_exception set branch_id=v_new_branch where company_id=v_old_company and branch_id=v_old_branch;
  update public.hr_roster_assignment set branch_id=v_new_branch where company_id=v_old_company and branch_id=v_old_branch;
  update public.hr_time_entry set branch_id=v_new_branch where company_id=v_old_company and branch_id=v_old_branch;

  update public.hr_employee e
  set
    department_id = case
      when e.department_id is null then null
      else (
        select d2.id
        from public.hr_department d1
        join public.hr_department d2
          on d2.company_id=v_new_company
         and lower(d2.code)=lower(d1.code)
        where d1.id=e.department_id
        limit 1
      )
    end,
    position_id = case
      when e.position_id is null then null
      else (
        select p2.id
        from public.hr_position p1
        join public.hr_position p2
          on p2.company_id=v_new_company
         and lower(p2.code)=lower(p1.code)
        where p1.id=e.position_id
        limit 1
      )
    end,
    primary_branch_id = case when e.primary_branch_id=v_old_branch then v_new_branch else e.primary_branch_id end,
    company_id = v_new_company,
    updated_at = now()
  where e.company_id=v_old_company;

  update public.hr_attendance_device set company_id=v_new_company where company_id=v_old_company;
  update public.hr_attendance_event set company_id=v_new_company where company_id=v_old_company;
  update public.hr_attendance_exception set company_id=v_new_company where company_id=v_old_company;
  update public.hr_disciplinary_case set company_id=v_new_company where company_id=v_old_company;
  update public.hr_document_record set company_id=v_new_company where company_id=v_old_company;
  update public.hr_employee_availability set company_id=v_new_company where company_id=v_old_company;
  update public.hr_employee_clock_credential set company_id=v_new_company where company_id=v_old_company;
  update public.hr_followup_task set company_id=v_new_company where company_id=v_old_company;
  update public.hr_leave_balance set company_id=v_new_company where company_id=v_old_company;
  update public.hr_leave_request set company_id=v_new_company where company_id=v_old_company;
  update public.hr_notification set company_id=v_new_company where company_id=v_old_company;
  update public.hr_performance_review set company_id=v_new_company where company_id=v_old_company;
  update public.hr_roster_assignment set company_id=v_new_company where company_id=v_old_company;
  update public.hr_time_entry set company_id=v_new_company where company_id=v_old_company;
  update public.hr_time_entry_adjustment set company_id=v_new_company where company_id=v_old_company;

  select coalesce(last_value,0) into v_last_employee_no
  from public.hr_employee_sequence
  where company_id=v_old_company;

  insert into public.hr_employee_sequence(company_id,last_value,updated_at)
  values(v_new_company,greatest(v_last_employee_no,3),now())
  on conflict(company_id) do update
    set last_value=greatest(public.hr_employee_sequence.last_value,excluded.last_value),
        updated_at=now();

  update public.audit_log
     set company_id=v_new_company
   where company_id=v_old_company
     and module='hr';

  update public.user_profile
     set company_id=v_new_company
   where company_id=v_old_company
     and user_id=v_owner_user
     and role='owner';

  insert into public.audit_log(company_id,user_id,action,module,description,metadata)
  values(
    v_new_company,
    v_owner_user,
    'jinlab_pilot_tenant_promoted',
    'system',
    'Real HR records and owner access promoted from QA tenant into the JINLAB pilot tenant.',
    jsonb_build_object(
      'source_company','EPEX EDEMY',
      'destination_company','JINLAB',
      'branch','122J Pressident Street',
      'qa_transaction_data_preserved',true
    )
  );
end $$;;
