create or replace function public.get_hr_records_workspace(p_employee_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_company_id uuid;
  v_own_employee_id uuid;
  v_target_employee_id uuid;
  v_can_view_all boolean;
  v_can_performance boolean;
  v_can_discipline boolean;
  v_can_documents boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;

  v_company_id := public.current_company_id();
  v_can_view_all := public.current_user_has_permission('hr.view');
  v_can_performance := public.current_user_has_permission('hr.performance.manage');
  v_can_discipline := public.current_user_has_permission('hr.discipline.manage');
  v_can_documents := public.current_user_has_permission('hr.documents.manage');

  if not v_can_view_all and not public.current_user_has_permission('hr.self') then
    raise exception 'Permission denied: HR access required.';
  end if;

  select e.id into v_own_employee_id
  from public.hr_employee e
  where e.company_id=v_company_id and e.user_id=auth.uid()
  limit 1;

  if v_can_view_all then
    v_target_employee_id := p_employee_id;
    if v_target_employee_id is not null and not exists(
      select 1 from public.hr_employee e where e.id=v_target_employee_id and e.company_id=v_company_id
    ) then
      raise exception 'Employee could not be found.';
    end if;
  else
    if v_own_employee_id is null then
      raise exception 'No HR employee profile is linked to this Nexus user.';
    end if;
    if p_employee_id is not null and p_employee_id<>v_own_employee_id then
      raise exception 'Employees may only view their own HR records.';
    end if;
    v_target_employee_id := v_own_employee_id;
  end if;

  return jsonb_build_object(
    'ok',true,
    'mode',case when v_can_view_all then 'management' else 'self' end,
    'own_employee_id',v_own_employee_id,
    'selected_employee_id',v_target_employee_id,
    'capabilities',jsonb_build_object(
      'performance_manage',v_can_performance,
      'discipline_manage',v_can_discipline,
      'documents_manage',v_can_documents,
      'performance_acknowledge',v_own_employee_id is not null
    ),
    'employees',case when v_can_view_all then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,
        'employee_number',e.employee_number,
        'full_name',e.first_name||' '||e.last_name,
        'status',e.status,
        'position_title',(select p.title from public.hr_position p where p.id=e.position_id),
        'branch_name',(select b.branch_name from public.branch b where b.id=e.primary_branch_id)
      ) order by e.employee_number)
      from public.hr_employee e
      where e.company_id=v_company_id
    ),'[]'::jsonb) else '[]'::jsonb end,
    'performance_reviews',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,
        'employee_id',e.id,
        'employee_number',e.employee_number,
        'employee_name',e.first_name||' '||e.last_name,
        'period_start',r.period_start,
        'period_end',r.period_end,
        'rating',r.rating,
        'status',r.status,
        'summary',r.summary,
        'strengths',r.strengths,
        'improvement_areas',r.improvement_areas,
        'goals',r.goals,
        'employee_comments',r.employee_comments,
        'reviewed_at',r.reviewed_at,
        'created_at',r.created_at,
        'updated_at',r.updated_at
      ) order by r.period_end desc,r.created_at desc)
      from public.hr_performance_review r
      join public.hr_employee e on e.id=r.employee_id and e.company_id=r.company_id
      where r.company_id=v_company_id
        and (v_target_employee_id is null or r.employee_id=v_target_employee_id)
        and (v_can_view_all or (r.employee_id=v_own_employee_id and r.status in ('submitted','acknowledged','closed')))
    ),'[]'::jsonb),
    'disciplinary_cases',case when v_can_discipline then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',d.id,
        'employee_id',e.id,
        'employee_number',e.employee_number,
        'employee_name',e.first_name||' '||e.last_name,
        'case_type',d.case_type,
        'incident_date',d.incident_date,
        'status',d.status,
        'summary',d.summary,
        'details',d.details,
        'action_taken',d.action_taken,
        'issued_at',d.issued_at,
        'expiry_date',d.expiry_date,
        'employee_comments',d.employee_comments,
        'created_at',d.created_at,
        'updated_at',d.updated_at
      ) order by d.incident_date desc,d.created_at desc)
      from public.hr_disciplinary_case d
      join public.hr_employee e on e.id=d.employee_id and e.company_id=d.company_id
      where d.company_id=v_company_id
        and (v_target_employee_id is null or d.employee_id=v_target_employee_id)
    ),'[]'::jsonb) else '[]'::jsonb end,
    'documents',case when v_can_documents then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',d.id,
        'employee_id',e.id,
        'employee_number',e.employee_number,
        'employee_name',e.first_name||' '||e.last_name,
        'document_type',d.document_type,
        'title',d.title,
        'file_path',d.file_path,
        'issued_date',d.issued_date,
        'expiry_date',d.expiry_date,
        'status',d.status,
        'notes',d.notes,
        'created_at',d.created_at,
        'updated_at',d.updated_at
      ) order by coalesce(d.expiry_date,d.issued_date,current_date) desc,d.created_at desc)
      from public.hr_document_record d
      join public.hr_employee e on e.id=d.employee_id and e.company_id=d.company_id
      where d.company_id=v_company_id
        and (v_target_employee_id is null or d.employee_id=v_target_employee_id)
    ),'[]'::jsonb) else '[]'::jsonb end,
    'summary',jsonb_build_object(
      'performance_total',(select count(*) from public.hr_performance_review r where r.company_id=v_company_id and (v_target_employee_id is null or r.employee_id=v_target_employee_id) and (v_can_view_all or (r.employee_id=v_own_employee_id and r.status in ('submitted','acknowledged','closed')))),
      'discipline_open',case when v_can_discipline then (select count(*) from public.hr_disciplinary_case d where d.company_id=v_company_id and (v_target_employee_id is null or d.employee_id=v_target_employee_id) and d.status in ('open','issued','appealed')) else 0 end,
      'documents_current',case when v_can_documents then (select count(*) from public.hr_document_record d where d.company_id=v_company_id and (v_target_employee_id is null or d.employee_id=v_target_employee_id) and d.status='current') else 0 end,
      'documents_expiring_30_days',case when v_can_documents then (select count(*) from public.hr_document_record d where d.company_id=v_company_id and (v_target_employee_id is null or d.employee_id=v_target_employee_id) and d.status='current' and d.expiry_date between current_date and current_date+30) else 0 end
    )
  );
end;
$function$;

create or replace function public.acknowledge_hr_performance_review(p_review_id uuid, p_comments text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_company_id uuid;
  v_employee_id uuid;
  v_review public.hr_performance_review%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('hr.self') then raise exception 'Permission denied: hr.self'; end if;

  v_company_id := public.current_company_id();
  select e.id into v_employee_id
  from public.hr_employee e
  where e.company_id=v_company_id and e.user_id=auth.uid()
  limit 1;
  if v_employee_id is null then raise exception 'No HR employee profile is linked to this Nexus user.'; end if;

  select * into v_review
  from public.hr_performance_review r
  where r.id=p_review_id and r.company_id=v_company_id and r.employee_id=v_employee_id
  for update;
  if not found then raise exception 'Performance review could not be found.'; end if;
  if v_review.status<>'submitted' then raise exception 'Only submitted performance reviews can be acknowledged.'; end if;

  update public.hr_performance_review
  set status='acknowledged',
      employee_comments=nullif(btrim(coalesce(p_comments,'')),''),
      updated_at=now()
  where id=p_review_id;

  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'hr_performance_acknowledged','hr',p_review_id,'Employee acknowledged a performance review.',jsonb_build_object('employee_id',v_employee_id));

  return jsonb_build_object('ok',true,'id',p_review_id,'status','acknowledged');
end;
$function$;

revoke all on function public.get_hr_records_workspace(uuid) from public, anon;
revoke all on function public.acknowledge_hr_performance_review(uuid,text) from public, anon;
grant execute on function public.get_hr_records_workspace(uuid) to authenticated;
grant execute on function public.acknowledge_hr_performance_review(uuid,text) to authenticated;;
