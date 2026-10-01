insert into public.permissions(permission_name)
select 'repair.invoice.auto'
where not exists (
  select 1 from public.permissions where permission_name='repair.invoice.auto'
);

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.permission_name='repair.invoice.auto'
where r.role_name in ('owner','admin')
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id=r.id and rp.permission_id=p.id
  );

create or replace function public.auto_issue_service_job_invoice(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_company_id uuid;
  v_job public.service_job%rowtype;
  v_invoice_id uuid;
  v_invoice_number text;
  v_line public.service_job_line%rowtype;
  v_line_total numeric := 0;
  v_invoice_total numeric := 0;
  v_vat_registered boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not (
    public.current_user_has_permission('repair.invoice.auto')
    or public.current_user_has_permission('repair.complete')
  ) then
    raise exception 'Permission denied: repair.invoice.auto';
  end if;

  v_company_id := public.current_company_id();

  select * into v_job
  from public.service_job
  where id=p_job_id and company_id=v_company_id
  for update;

  if not found then
    raise exception 'Job card could not be found.';
  end if;

  if v_job.invoice_id is not null then
    select i.invoice_number into v_invoice_number
    from public.invoice i
    where i.id=v_job.invoice_id and i.company_id=v_company_id;

    return jsonb_build_object(
      'ok',true,
      'already_linked',true,
      'job_id',v_job.id,
      'invoice_id',v_job.invoice_id,
      'invoice_number',v_invoice_number,
      'status',v_job.status
    );
  end if;

  if v_job.status <> 'technical_complete' then
    raise exception 'Technical work must be complete before automatic invoicing.';
  end if;

  if v_job.approved_amount is null or v_job.approved_amount <= 0 then
    raise exception 'Customer-approved amount is required before invoicing.';
  end if;

  select coalesce(sum(line_total),0)
  into v_line_total
  from public.service_job_line
  where company_id=v_company_id and service_job_id=v_job.id;

  if abs(v_line_total-v_job.approved_amount) > 0.01 then
    raise exception 'Recorded service/parts total (%) must match the customer-approved amount (%).',v_line_total,v_job.approved_amount;
  end if;

  if not exists (
    select 1 from public.service_job_line
    where company_id=v_company_id and service_job_id=v_job.id
  ) then
    raise exception 'At least one repair/service line is required before invoicing.';
  end if;

  select coalesce(vat_registered,false)
  into v_vat_registered
  from public.company_finance_settings
  where company_id=v_company_id;

  if v_vat_registered then
    raise exception 'Automatic repair invoicing requires VAT-aware repair pricing configuration before it can be used for a VAT-registered company.';
  end if;

  v_invoice_number := public.generate_invoice_number(v_company_id);

  insert into public.invoice(
    company_id,branch_id,customer_id,invoice_number,status,invoice_date,
    customer_reference,notes,created_by
  ) values (
    v_company_id,v_job.branch_id,v_job.customer_id,v_invoice_number,'draft',current_date,
    v_job.job_number,
    'Automatically generated from JINLAB Job Card '||v_job.job_number||'.',
    auth.uid()
  ) returning id into v_invoice_id;

  for v_line in
    select *
    from public.service_job_line
    where company_id=v_company_id and service_job_id=v_job.id
    order by created_at,id
  loop
    insert into public.invoice_item(
      invoice_id,company_id,inventory_item_id,description,quantity,unit_price,
      discount_mode,discount_value,tax_mode,tax_rate
    ) values (
      v_invoice_id,v_company_id,v_line.inventory_item_id,v_line.description,
      v_line.quantity,v_line.unit_price,'percentage',0,'none',0
    );
  end loop;

  select total_amount into v_invoice_total
  from public.invoice
  where id=v_invoice_id and company_id=v_company_id;

  if abs(v_invoice_total-v_job.approved_amount) > 0.01 then
    raise exception 'Generated invoice total (%) does not match the customer-approved amount (%).',v_invoice_total,v_job.approved_amount;
  end if;

  update public.invoice
  set status='issued',updated_at=now()
  where id=v_invoice_id and company_id=v_company_id;

  update public.service_job
  set invoice_id=v_invoice_id,status='ready_for_collection',updated_at=now()
  where id=v_job.id and company_id=v_company_id;

  insert into public.service_job_event(
    company_id,service_job_id,event_type,description,metadata,user_id
  ) values (
    v_company_id,v_job.id,'invoice_auto_created',
    'JINLAB invoice automatically created and linked from approved job-card lines.',
    jsonb_build_object(
      'invoice_id',v_invoice_id,
      'invoice_number',v_invoice_number,
      'invoice_total',v_invoice_total
    ),auth.uid()
  );

  insert into public.audit_log(
    company_id,user_id,action,module,record_id,description,metadata
  ) values (
    v_company_id,auth.uid(),'service_job_invoice_auto_created','repairs',v_job.id,
    'Repair invoice automatically generated, issued and linked.',
    jsonb_build_object(
      'job_number',v_job.job_number,
      'invoice_id',v_invoice_id,
      'invoice_number',v_invoice_number,
      'approved_amount',v_job.approved_amount
    )
  );

  return jsonb_build_object(
    'ok',true,
    'job_id',v_job.id,
    'job_number',v_job.job_number,
    'invoice_id',v_invoice_id,
    'invoice_number',v_invoice_number,
    'invoice_total',v_invoice_total,
    'status','ready_for_collection'
  );
end;
$function$;

revoke all on function public.auto_issue_service_job_invoice(uuid) from public, anon, authenticated;
grant execute on function public.auto_issue_service_job_invoice(uuid) to authenticated;

create or replace function public.complete_service_job_technical(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_company_id uuid;
  v_job public.service_job%rowtype;
  v_employee_id uuid;
  v_line_total numeric;
  v_invoice_result jsonb := null;
  v_invoice_error text := null;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.complete') then raise exception 'Permission denied: repair.complete'; end if;
  v_company_id:=public.current_company_id();
  select * into v_job from public.service_job where id=p_job_id and company_id=v_company_id for update;
  if not found then raise exception 'Job card could not be found.'; end if;
  if v_job.status<>'in_progress' then raise exception 'Repair must be explicitly started before technical completion.'; end if;
  select e.id into v_employee_id from public.hr_employee e where e.company_id=v_company_id and e.user_id=auth.uid() and e.status='active' limit 1;
  if not public.current_user_has_permission('repair.manage') and (v_job.assigned_employee_id is null or v_employee_id is distinct from v_job.assigned_employee_id) then raise exception 'You may only complete jobs assigned to you.'; end if;
  if v_job.approved_amount is null then raise exception 'Price/quote must be approved before technical completion.'; end if;
  if v_job.diagnosis is null or btrim(v_job.diagnosis)='' then raise exception 'Diagnosis is required before completion.'; end if;
  select coalesce(sum(line_total),0) into v_line_total from public.service_job_line where service_job_id=p_job_id and company_id=v_company_id;
  if abs(v_line_total-v_job.approved_amount)>0.01 then raise exception 'Recorded service/parts total (%) must match the customer-approved amount (%).',v_line_total,v_job.approved_amount; end if;

  update public.service_job
  set status='technical_complete',technical_completed_at=now(),technical_completed_by=auth.uid(),updated_at=now()
  where id=p_job_id;

  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,p_job_id,'technical_completed','Technical work marked complete.',jsonb_build_object('recorded_lines_total',v_line_total,'approved_amount',v_job.approved_amount),auth.uid());

  begin
    v_invoice_result := public.auto_issue_service_job_invoice(p_job_id);
  exception when others then
    v_invoice_error := sqlerrm;
    insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
    values(
      v_company_id,p_job_id,'invoice_auto_pending',
      'Technical work completed, but automatic invoice creation needs administrative attention.',
      jsonb_build_object('error',v_invoice_error),auth.uid()
    );
    insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
    values(
      v_company_id,auth.uid(),'service_job_invoice_auto_pending','repairs',p_job_id,
      'Automatic repair invoice could not be completed after technical completion.',
      jsonb_build_object('job_number',v_job.job_number,'error',v_invoice_error)
    );
  end;

  return jsonb_build_object(
    'ok',true,
    'id',p_job_id,
    'status',case when v_invoice_result is not null then coalesce(v_invoice_result->>'status','technical_complete') else 'technical_complete' end,
    'recorded_lines_total',v_line_total,
    'invoice_auto_created',v_invoice_result is not null,
    'invoice',v_invoice_result,
    'invoice_error',v_invoice_error
  );
end;
$function$;

revoke all on function public.complete_service_job_technical(uuid) from public, anon, authenticated;
grant execute on function public.complete_service_job_technical(uuid) to authenticated;

create or replace function public.confirm_service_job_collection(p_job_id uuid, p_method text, p_reference text default null::text)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
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
  if v_job.invoice_id is null then raise exception 'A JINLAB invoice must be linked before collection.'; end if;
  select * into v_invoice from public.invoice where id=v_job.invoice_id and company_id=v_company_id;
  if not found then raise exception 'Linked invoice could not be found.'; end if;
  if coalesce(v_invoice.balance_due,0)>0.005 then raise exception 'Customer still has an outstanding balance of %.',v_invoice.balance_due; end if;

  update public.service_job
  set status='closed',
      collection_confirmed_at=now(),collection_confirmed_by=auth.uid(),
      collection_method=btrim(p_method),collection_reference=btrim(p_reference),
      closed_at=now(),closed_by=auth.uid(),updated_at=now()
  where id=p_job_id;

  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,p_job_id,'collected','Customer collection confirmed after invoice settlement.',jsonb_build_object('method',btrim(p_method),'reference',btrim(p_reference),'invoice_id',v_job.invoice_id),auth.uid());

  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,p_job_id,'auto_closed','Job card automatically closed after confirmed collection and full settlement.',jsonb_build_object('invoice_id',v_job.invoice_id),auth.uid());

  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'service_job_auto_closed','repairs',p_job_id,'Repair job automatically closed after paid customer collection.',jsonb_build_object('job_number',v_job.job_number,'invoice_id',v_job.invoice_id,'collection_method',btrim(p_method),'collection_reference',btrim(p_reference)));

  return jsonb_build_object('ok',true,'id',p_job_id,'status','closed','auto_closed',true);
end;
$function$;

revoke all on function public.confirm_service_job_collection(uuid,text,text) from public, anon, authenticated;
grant execute on function public.confirm_service_job_collection(uuid,text,text) to authenticated;;
