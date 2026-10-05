create or replace function public.correct_service_job_details(p_job_id uuid,p_changes jsonb,p_reason text,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_company_id uuid;
  v_job public.service_job%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_key text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_is_owner() then raise exception 'Only the company owner may correct job-card details.'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'A correction reason is required.'; end if;
  if p_changes is null or jsonb_typeof(p_changes)<>'object' or p_changes='{}'::jsonb then raise exception 'Supply the details to correct.'; end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    if v_key not in ('device_type','brand','model','serial_number','imei','reported_fault','device_condition','accessories_received','diagnosis','repair_outcome_reason') then raise exception 'This field must use its controlled workflow: %',v_key; end if;
    if jsonb_typeof(p_changes->v_key) not in ('string','null') then raise exception 'Correction values must be text.'; end if;
  end loop;
  v_company_id:=public.current_company_id();
  select * into v_job from public.service_job where id=p_job_id and company_id=v_company_id for update;
  if not found then raise exception 'Job card could not be found.'; end if;
  if p_expected_updated_at is null or v_job.updated_at is distinct from p_expected_updated_at then raise exception 'This job changed. Refresh it before correcting the details.'; end if;
  v_before:=jsonb_build_object('device_type',v_job.device_type,'brand',v_job.brand,'model',v_job.model,'serial_number',v_job.serial_number,'imei',v_job.imei,'reported_fault',v_job.reported_fault,'device_condition',v_job.device_condition,'accessories_received',v_job.accessories_received,'diagnosis',v_job.diagnosis,'repair_outcome_reason',v_job.repair_outcome_reason);
  v_after:=v_before||p_changes;
  if nullif(btrim(v_after->>'device_type'),'') is null or nullif(btrim(v_after->>'reported_fault'),'') is null then raise exception 'Device type and reported fault are required.'; end if;
  if v_job.repair_outcome is not null and nullif(btrim(v_after->>'repair_outcome_reason'),'') is null then raise exception 'The not-repaired reason cannot be cleared.'; end if;
  if v_job.diagnosis is not null and nullif(btrim(v_after->>'diagnosis'),'') is null and v_job.status not in ('received','diagnosing') then raise exception 'A diagnosis is required at this workflow stage.'; end if;
  update public.service_job set device_type=btrim(v_after->>'device_type'),brand=nullif(btrim(v_after->>'brand'),''),model=nullif(btrim(v_after->>'model'),''),serial_number=nullif(btrim(v_after->>'serial_number'),''),imei=nullif(btrim(v_after->>'imei'),''),reported_fault=btrim(v_after->>'reported_fault'),device_condition=nullif(btrim(v_after->>'device_condition'),''),accessories_received=nullif(btrim(v_after->>'accessories_received'),''),diagnosis=nullif(btrim(v_after->>'diagnosis'),''),repair_outcome_reason=nullif(btrim(v_after->>'repair_outcome_reason'),''),updated_at=now() where id=p_job_id and company_id=v_company_id;
  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,p_job_id,'owner_correction','Owner correction: '||btrim(p_reason),jsonb_build_object('before',v_before,'after',v_after,'reason',btrim(p_reason),'stage',v_job.status),auth.uid());
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'service_job_owner_correction','repairs',p_job_id,'Owner corrected job-card details.',jsonb_build_object('before',v_before,'after',v_after,'reason',btrim(p_reason),'stage',v_job.status));
  return jsonb_build_object('ok',true,'id',p_job_id);
end;
$$;
revoke all on function public.correct_service_job_details(uuid,jsonb,text,timestamptz) from public,anon;
grant execute on function public.correct_service_job_details(uuid,jsonb,text,timestamptz) to authenticated;
