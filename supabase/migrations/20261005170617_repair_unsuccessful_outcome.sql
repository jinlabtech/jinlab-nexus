alter table public.service_job
  add column repair_outcome text,
  add column repair_outcome_reason text,
  add constraint service_job_repair_outcome_check check (repair_outcome is null or repair_outcome in ('unsuccessful','unrepairable','parts_unavailable','uneconomical','customer_declined')),
  add constraint service_job_repair_outcome_reason_check check (repair_outcome is null or nullif(btrim(repair_outcome_reason),'') is not null);

create or replace function public.record_service_job_unsuccessful(p_job_id uuid,p_outcome text,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_company_id uuid;
  v_job public.service_job%rowtype;
  v_employee_id uuid;
  v_no_charge boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.complete') then raise exception 'Permission denied: repair.complete'; end if;
  if p_outcome is null or p_outcome not in ('unsuccessful','unrepairable','parts_unavailable','uneconomical','customer_declined') then raise exception 'Select a valid repair outcome.'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'A diagnosis or reason is required.'; end if;
  v_company_id:=public.current_company_id();
  select * into v_job from public.service_job where id=p_job_id and company_id=v_company_id for update;
  if not found then raise exception 'Job card could not be found.'; end if;
  if v_job.repair_outcome is not null then raise exception 'This job already has a recorded repair outcome.'; end if;
  if v_job.status in ('closed','collected','cancelled') then raise exception 'This job has already been returned or closed.'; end if;
  if v_job.intake_confirmed_at is null then raise exception 'Confirm customer intake before recording the repair outcome.'; end if;
  select id into v_employee_id from public.hr_employee where company_id=v_company_id and user_id=auth.uid() and status='active' limit 1;
  if not public.current_user_has_permission('repair.manage') and (v_job.assigned_employee_id is null or v_employee_id is distinct from v_job.assigned_employee_id) then raise exception 'You may only complete jobs assigned to you.'; end if;
  v_no_charge:=v_job.invoice_id is null and not exists(select 1 from public.service_job_line where service_job_id=p_job_id and company_id=v_company_id);
  update public.service_job set repair_outcome=p_outcome,repair_outcome_reason=btrim(p_reason),
    status=case when v_no_charge then 'ready_for_collection' else status end,updated_at=now()
    where id=p_job_id and company_id=v_company_id;
  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,p_job_id,'not_repaired','Not repaired: '||replace(p_outcome,'_',' ')||'. '||btrim(p_reason),jsonb_build_object('outcome',p_outcome,'reason',btrim(p_reason),'no_charge',v_no_charge,'previous_status',v_job.status),auth.uid());
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'service_job_not_repaired','repairs',p_job_id,'Unsuccessful repair outcome recorded.',jsonb_build_object('outcome',p_outcome,'reason',btrim(p_reason),'no_charge',v_no_charge));
  return jsonb_build_object('ok',true,'no_charge',v_no_charge,'status',case when v_no_charge then 'ready_for_collection' else v_job.status end);
end;
$$;
revoke all on function public.record_service_job_unsuccessful(uuid,text,text) from public,anon;
grant execute on function public.record_service_job_unsuccessful(uuid,text,text) to authenticated;
CREATE OR REPLACE FUNCTION public.get_service_job_queue(p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, job_number text, status text, created_at timestamp with time zone, updated_at timestamp with time zone, customer_id uuid, customer_name text, device_type text, brand text, model text, serial_number text, imei text, reported_fault text, assigned_employee_id uuid, assigned_employee text, approved_amount numeric, invoice_id uuid, invoice_number text, balance_due numeric, intake_confirmed boolean, repair_started boolean, technical_complete boolean, collection_confirmed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid;
  v_search text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('repair.view') then
    raise exception 'Permission denied: repair.view';
  end if;

  v_company_id := public.current_company_id();
  v_search := nullif(btrim(coalesce(p_search,'')), '');

  if p_status is not null and p_status not in (
    'received','diagnosing','awaiting_approval','approved','in_progress',
    'technical_complete','ready_for_collection','collected','closed','cancelled',
    'active','archived','not_repaired'
  ) then
    raise exception 'Invalid repair status filter.';
  end if;

  return query
  select
    j.id,
    j.job_number,
    j.status,
    j.created_at,
    j.updated_at,
    j.customer_id,
    c.customer_name,
    j.device_type,
    j.brand,
    j.model,
    j.serial_number,
    j.imei,
    j.reported_fault,
    j.assigned_employee_id,
    nullif(btrim(concat_ws(' ', e.first_name, e.last_name)), ''),
    j.approved_amount,
    j.invoice_id,
    i.invoice_number,
    i.balance_due,
    (j.intake_confirmed_at is not null),
    (j.repair_started_at is not null),
    (j.technical_completed_at is not null),
    (j.collection_confirmed_at is not null)
  from public.service_job j
  join public.customer c
    on c.id = j.customer_id
   and c.company_id = j.company_id
  left join public.hr_employee e
    on e.id = j.assigned_employee_id
   and e.company_id = j.company_id
  left join public.invoice i
    on i.id = j.invoice_id
   and i.company_id = j.company_id
  where j.company_id = v_company_id
    and (
      p_status is null
      or j.status = p_status
      or (p_status = 'not_repaired' and j.repair_outcome is not null)
      or (p_status = 'active' and j.status not in ('collected','closed','cancelled'))
      or (p_status = 'archived' and j.status in ('collected','closed','cancelled'))
    )
    and (
      v_search is null
      or j.job_number ilike '%' || v_search || '%'
      or c.customer_name ilike '%' || v_search || '%'
      or coalesce(j.device_type,'') ilike '%' || v_search || '%'
      or coalesce(j.brand,'') ilike '%' || v_search || '%'
      or coalesce(j.model,'') ilike '%' || v_search || '%'
      or coalesce(j.serial_number,'') ilike '%' || v_search || '%'
      or coalesce(j.imei,'') ilike '%' || v_search || '%'
      or coalesce(j.reported_fault,'') ilike '%' || v_search || '%'
    )
  order by
    case j.status
      when 'received' then 1
      when 'diagnosing' then 2
      when 'awaiting_approval' then 3
      when 'approved' then 4
      when 'in_progress' then 5
      when 'technical_complete' then 6
      when 'ready_for_collection' then 7
      when 'collected' then 8
      when 'closed' then 9
      when 'cancelled' then 10
      else 99
    end,
    j.updated_at desc,
    j.created_at desc
  limit greatest(1, least(coalesce(p_limit,100), 250));
end;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_service_job_collection(p_job_id uuid, p_method text, p_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid;
  v_job public.service_job%rowtype;
  v_invoice public.invoice%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.collection.confirm') then raise exception 'Permission denied: repair.collection.confirm'; end if;
  if nullif(btrim(coalesce(p_method,'')),'') is null or nullif(btrim(coalesce(p_reference,'')),'') is null then raise exception 'Collection confirmation method and customer reference are required.'; end if;
  v_company_id:=public.current_company_id();
  select * into v_job from public.service_job where id=p_job_id and company_id=v_company_id for update;
  if not found then raise exception 'Job card could not be found.'; end if;
  if v_job.status<>'ready_for_collection' then raise exception 'Job is not ready for collection.'; end if;
  if v_job.invoice_id is null then
    if v_job.repair_outcome is null or v_job.intake_confirmed_at is null or exists(select 1 from public.service_job_line where service_job_id=p_job_id and company_id=v_company_id) then
      raise exception 'A linked invoice is required unless this is a verified, not-repaired job with no work or parts lines.';
    end if;
  else
  select * into v_invoice from public.invoice where id=v_job.invoice_id and company_id=v_company_id;
  if not found then raise exception 'Linked invoice could not be found.'; end if;
  if coalesce(v_invoice.balance_due,0)>0.005 then raise exception 'Customer still has an outstanding balance of %.',v_invoice.balance_due; end if;
  end if;

  update public.service_job
  set status='closed',
      collection_confirmed_at=now(),collection_confirmed_by=auth.uid(),
      collection_method=btrim(p_method),collection_reference=btrim(p_reference),
      closed_at=now(),closed_by=auth.uid(),updated_at=now()
  where id=p_job_id;

  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,p_job_id,'collected','Customer collection confirmed after settlement or verified no-charge return.',jsonb_build_object('method',btrim(p_method),'reference',btrim(p_reference),'invoice_id',v_job.invoice_id),auth.uid());

  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,p_job_id,'auto_closed','Job card closed after confirmed collection; any linked invoice is settled.',jsonb_build_object('invoice_id',v_job.invoice_id),auth.uid());

  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'service_job_auto_closed','repairs',p_job_id,'Repair job closed after verified customer collection.',jsonb_build_object('job_number',v_job.job_number,'invoice_id',v_job.invoice_id,'collection_method',btrim(p_method),'collection_reference',btrim(p_reference)));

  return jsonb_build_object('ok',true,'id',p_job_id,'status','closed','auto_closed',true);
end;
$function$;
