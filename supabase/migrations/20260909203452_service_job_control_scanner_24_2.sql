alter table public.service_job
  add column if not exists intake_confirmed_at timestamptz,
  add column if not exists intake_confirmed_by uuid,
  add column if not exists intake_confirmation_method text,
  add column if not exists intake_confirmation_reference text,
  add column if not exists repair_started_at timestamptz,
  add column if not exists repair_started_by uuid;

insert into public.permissions(permission_name)
values
  ('repair.intake.confirm'),
  ('repair.start'),
  ('repair.scanner.use'),
  ('repair.scanner.manage')
on conflict(permission_name) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.permission_name in ('repair.intake.confirm','repair.start','repair.scanner.use','repair.scanner.manage')
where r.role_name in ('owner','admin')
on conflict(role_id,permission_id) do nothing;

create table if not exists public.service_scanner_device (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid not null references public.branch(id) on delete cascade,
  device_code text not null,
  name text not null,
  purpose text not null default 'repair_processing' check (purpose in ('intake','repair_processing','collection','multi')),
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,device_code)
);

create table if not exists public.service_job_scan (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid not null references public.branch(id) on delete cascade,
  scanner_device_id uuid not null references public.service_scanner_device(id) on delete cascade,
  service_job_id uuid references public.service_job(id) on delete set null,
  scanned_value text not null,
  match_type text not null default 'unmatched' check (match_type in ('job_number','serial_number','imei','unmatched')),
  scan_action text not null default 'lookup' check (scan_action in ('lookup','intake','workbench','diagnosis','repair_start','repair_complete','collection')),
  user_id uuid,
  employee_id uuid references public.hr_employee(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  scanned_at timestamptz not null default now()
);

create index if not exists service_job_scan_company_scanned_at_idx
  on public.service_job_scan(company_id,scanned_at desc);
create index if not exists service_job_scan_job_idx
  on public.service_job_scan(service_job_id,scanned_at desc);

alter table public.service_scanner_device enable row level security;
alter table public.service_job_scan enable row level security;

revoke all on public.service_scanner_device from anon, authenticated;
revoke all on public.service_job_scan from anon, authenticated;

create or replace function public.confirm_service_job_intake(
  p_job_id uuid,
  p_method text,
  p_reference text
) returns jsonb
language plpgsql security definer set search_path='public'
as $$
declare v_company_id uuid; v_job public.service_job%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.intake.confirm') then raise exception 'Permission denied: repair.intake.confirm'; end if;
  if nullif(btrim(coalesce(p_method,'')),'') is null then raise exception 'Intake confirmation method is required.'; end if;
  if nullif(btrim(coalesce(p_reference,'')),'') is null then raise exception 'Customer confirmation reference is required.'; end if;
  v_company_id:=public.current_company_id();
  select * into v_job from public.service_job where id=p_job_id and company_id=v_company_id for update;
  if not found then raise exception 'Job card could not be found.'; end if;
  if v_job.status in ('closed','cancelled','collected') then raise exception 'This job cannot be intake-confirmed.'; end if;
  update public.service_job set
    intake_confirmed_at=now(), intake_confirmed_by=auth.uid(),
    intake_confirmation_method=btrim(p_method), intake_confirmation_reference=btrim(p_reference),
    updated_at=now()
  where id=p_job_id;
  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,p_job_id,'intake_confirmed','Device intake confirmed before diagnosis/repair.',jsonb_build_object('method',btrim(p_method),'reference',btrim(p_reference)),auth.uid());
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'service_job_intake_confirmed','repairs',p_job_id,'Repair intake confirmed before work.',jsonb_build_object('job_number',v_job.job_number,'method',btrim(p_method),'reference',btrim(p_reference)));
  return jsonb_build_object('ok',true,'id',p_job_id,'job_number',v_job.job_number,'intake_confirmed_at',now());
end;
$$;

create or replace function public.update_service_job_technical(
  p_job_id uuid,
  p_diagnosis text,
  p_proposed_amount numeric default null
) returns jsonb
language plpgsql security definer set search_path='public'
as $$
declare v_company_id uuid; v_job public.service_job%rowtype; v_employee_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.update') then raise exception 'Permission denied: repair.update'; end if;
  v_company_id:=public.current_company_id();
  select * into v_job from public.service_job where id=p_job_id and company_id=v_company_id for update;
  if not found then raise exception 'Job card could not be found.'; end if;
  if v_job.intake_confirmed_at is null then raise exception 'Intake must be confirmed before diagnosis.'; end if;
  if v_job.status not in ('received','diagnosing','awaiting_approval') then raise exception 'Technical diagnosis cannot be changed in the current job state.'; end if;
  select e.id into v_employee_id from public.hr_employee e where e.company_id=v_company_id and e.user_id=auth.uid() and e.status='active' limit 1;
  if not public.current_user_has_permission('repair.manage') and (v_job.assigned_employee_id is null or v_employee_id is distinct from v_job.assigned_employee_id) then raise exception 'You may only update jobs assigned to you.'; end if;
  if p_proposed_amount is not null and p_proposed_amount<0 then raise exception 'Proposed amount cannot be negative.'; end if;
  update public.service_job
  set diagnosis=nullif(btrim(coalesce(p_diagnosis,'')),''),
      proposed_amount=coalesce(p_proposed_amount,proposed_amount),
      status=case when p_proposed_amount is not null then 'awaiting_approval' else 'diagnosing' end,
      updated_at=now()
  where id=p_job_id;
  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,p_job_id,'technical_update','Diagnosis/technical details updated.',jsonb_build_object('proposed_amount',p_proposed_amount),auth.uid());
  return jsonb_build_object('ok',true,'id',p_job_id,'status',case when p_proposed_amount is not null then 'awaiting_approval' else 'diagnosing' end);
end;
$$;

create or replace function public.approve_service_job_quote(
  p_job_id uuid,
  p_approved_amount numeric,
  p_method text,
  p_reference text default null
) returns jsonb
language plpgsql security definer set search_path='public'
as $$
declare v_company_id uuid; v_job public.service_job%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.quote.approve') then raise exception 'Permission denied: repair.quote.approve'; end if;
  if p_approved_amount is null or p_approved_amount<0 then raise exception 'Approved amount is required.'; end if;
  if nullif(btrim(coalesce(p_method,'')),'') is null or nullif(btrim(coalesce(p_reference,'')),'') is null then raise exception 'Customer approval method and reference are required.'; end if;
  v_company_id:=public.current_company_id();
  select * into v_job from public.service_job where id=p_job_id and company_id=v_company_id for update;
  if not found then raise exception 'Job card could not be found.'; end if;
  if v_job.intake_confirmed_at is null then raise exception 'Intake must be confirmed before quote approval.'; end if;
  if v_job.status<>'awaiting_approval' then raise exception 'Job must be awaiting approval before price approval.'; end if;
  if v_job.diagnosis is null or btrim(v_job.diagnosis)='' then raise exception 'Diagnosis is required before quote approval.'; end if;
  update public.service_job set approved_amount=p_approved_amount,quote_approved_at=now(),quote_approved_by=auth.uid(),quote_approval_method=btrim(p_method),quote_approval_reference=btrim(p_reference),status='approved',updated_at=now() where id=p_job_id;
  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,p_job_id,'quote_approved','Repair quote/price approved.',jsonb_build_object('approved_amount',p_approved_amount,'method',btrim(p_method),'reference',btrim(p_reference)),auth.uid());
  return jsonb_build_object('ok',true,'id',p_job_id,'status','approved','approved_amount',p_approved_amount);
end;
$$;

create or replace function public.start_service_job_repair(p_job_id uuid)
returns jsonb
language plpgsql security definer set search_path='public'
as $$
declare v_company_id uuid; v_job public.service_job%rowtype; v_employee_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.start') then raise exception 'Permission denied: repair.start'; end if;
  v_company_id:=public.current_company_id();
  select * into v_job from public.service_job where id=p_job_id and company_id=v_company_id for update;
  if not found then raise exception 'Job card could not be found.'; end if;
  if v_job.status<>'approved' then raise exception 'Customer-approved price is required before repair can start.'; end if;
  if v_job.intake_confirmed_at is null then raise exception 'Intake must be confirmed before repair can start.'; end if;
  if v_job.approved_amount is null then raise exception 'Approved amount is required before repair can start.'; end if;
  select e.id into v_employee_id from public.hr_employee e where e.company_id=v_company_id and e.user_id=auth.uid() and e.status='active' limit 1;
  if not public.current_user_has_permission('repair.manage') and (v_job.assigned_employee_id is null or v_employee_id is distinct from v_job.assigned_employee_id) then raise exception 'You may only start jobs assigned to you.'; end if;
  update public.service_job set status='in_progress',repair_started_at=now(),repair_started_by=auth.uid(),updated_at=now() where id=p_job_id;
  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,p_job_id,'repair_started','Authorised repair work started.',jsonb_build_object('approved_amount',v_job.approved_amount),auth.uid());
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'service_job_repair_started','repairs',p_job_id,'Authorised repair work started.',jsonb_build_object('job_number',v_job.job_number,'approved_amount',v_job.approved_amount));
  return jsonb_build_object('ok',true,'id',p_job_id,'status','in_progress','repair_started_at',now());
end;
$$;

create or replace function public.add_service_job_line(
  p_job_id uuid,
  p_line_type text,
  p_description text,
  p_quantity numeric default 1,
  p_unit_price numeric default 0,
  p_inventory_item_id uuid default null
) returns jsonb
language plpgsql security definer set search_path='public'
as $$
declare v_company_id uuid; v_job public.service_job%rowtype; v_id uuid; v_employee_id uuid; v_existing numeric; v_new_total numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.update') then raise exception 'Permission denied: repair.update'; end if;
  v_company_id:=public.current_company_id();
  select * into v_job from public.service_job where id=p_job_id and company_id=v_company_id for update;
  if not found then raise exception 'Job card could not be found.'; end if;
  if v_job.status in ('technical_complete','ready_for_collection','collected','closed','cancelled') then raise exception 'Lines cannot be added to this job.'; end if;
  if v_job.intake_confirmed_at is null then raise exception 'Intake must be confirmed before service lines can be recorded.'; end if;
  select e.id into v_employee_id from public.hr_employee e where e.company_id=v_company_id and e.user_id=auth.uid() and e.status='active' limit 1;
  if not public.current_user_has_permission('repair.manage') and (v_job.assigned_employee_id is null or v_employee_id is distinct from v_job.assigned_employee_id) then raise exception 'You may only update jobs assigned to you.'; end if;
  if p_line_type not in ('labour','service','software','part','other') then raise exception 'Invalid service line type.'; end if;
  if p_description is null or btrim(p_description)='' then raise exception 'Description is required.'; end if;
  if coalesce(p_quantity,0)<=0 or coalesce(p_unit_price,0)<0 then raise exception 'Invalid quantity or price.'; end if;
  if p_inventory_item_id is not null and not exists(select 1 from public.inventory_item i where i.id=p_inventory_item_id and i.company_id=v_company_id and i.is_active=true) then raise exception 'Inventory item could not be found.'; end if;
  select coalesce(sum(line_total),0) into v_existing from public.service_job_line where company_id=v_company_id and service_job_id=p_job_id;
  v_new_total:=round(v_existing+(p_quantity*p_unit_price),2);
  if v_job.approved_amount is not null and v_job.status in ('approved','in_progress') and v_new_total>v_job.approved_amount+0.01 then raise exception 'Recorded job lines cannot exceed the customer-approved amount.'; end if;
  insert into public.service_job_line(company_id,service_job_id,line_type,inventory_item_id,description,quantity,unit_price,entered_by)
  values(v_company_id,p_job_id,p_line_type,p_inventory_item_id,btrim(p_description),p_quantity,p_unit_price,auth.uid()) returning id into v_id;
  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,p_job_id,'line_added','Repair/service line added.',jsonb_build_object('line_id',v_id,'line_type',p_line_type,'description',btrim(p_description),'quantity',p_quantity,'unit_price',p_unit_price,'inventory_item_id',p_inventory_item_id),auth.uid());
  return jsonb_build_object('ok',true,'id',v_id,'job_id',p_job_id,'job_lines_total',v_new_total);
end;
$$;

create or replace function public.complete_service_job_technical(p_job_id uuid)
returns jsonb
language plpgsql security definer set search_path='public'
as $$
declare v_company_id uuid; v_job public.service_job%rowtype; v_employee_id uuid; v_line_total numeric;
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
  update public.service_job set status='technical_complete',technical_completed_at=now(),technical_completed_by=auth.uid(),updated_at=now() where id=p_job_id;
  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,p_job_id,'technical_completed','Technical work marked complete.',jsonb_build_object('recorded_lines_total',v_line_total,'approved_amount',v_job.approved_amount),auth.uid());
  return jsonb_build_object('ok',true,'id',p_job_id,'status','technical_complete','recorded_lines_total',v_line_total);
end;
$$;

create or replace function public.link_service_job_invoice(p_job_id uuid,p_invoice_id uuid)
returns jsonb
language plpgsql security definer set search_path='public'
as $$
declare v_company_id uuid; v_job public.service_job%rowtype; v_invoice public.invoice%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.invoice.link') then raise exception 'Permission denied: repair.invoice.link'; end if;
  v_company_id:=public.current_company_id();
  select * into v_job from public.service_job where id=p_job_id and company_id=v_company_id for update;
  if not found then raise exception 'Job card could not be found.'; end if;
  if v_job.status not in ('technical_complete','ready_for_collection') then raise exception 'Technical work must be complete before invoice linking.'; end if;
  select * into v_invoice from public.invoice where id=p_invoice_id and company_id=v_company_id;
  if not found then raise exception 'Invoice could not be found.'; end if;
  if v_invoice.customer_id<>v_job.customer_id then raise exception 'Invoice customer does not match the job-card customer.'; end if;
  if v_job.approved_amount is null or abs(coalesce(v_invoice.total_amount,0)-v_job.approved_amount)>0.01 then raise exception 'Invoice total must match the customer-approved job amount.'; end if;
  update public.service_job set invoice_id=p_invoice_id,status='ready_for_collection',updated_at=now() where id=p_job_id;
  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,p_job_id,'invoice_linked','Invoice linked to job card.',jsonb_build_object('invoice_id',p_invoice_id,'invoice_number',v_invoice.invoice_number,'invoice_total',v_invoice.total_amount,'balance_due',v_invoice.balance_due),auth.uid());
  return jsonb_build_object('ok',true,'id',p_job_id,'status','ready_for_collection','invoice_id',p_invoice_id,'invoice_number',v_invoice.invoice_number,'balance_due',v_invoice.balance_due);
end;
$$;

create or replace function public.confirm_service_job_collection(p_job_id uuid,p_method text,p_reference text default null)
returns jsonb
language plpgsql security definer set search_path='public'
as $$
declare v_company_id uuid; v_job public.service_job%rowtype; v_invoice public.invoice%rowtype;
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
  update public.service_job set status='collected',collection_confirmed_at=now(),collection_confirmed_by=auth.uid(),collection_method=btrim(p_method),collection_reference=btrim(p_reference),updated_at=now() where id=p_job_id;
  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,p_job_id,'collected','Customer collection confirmed after invoice settlement.',jsonb_build_object('method',btrim(p_method),'reference',btrim(p_reference),'invoice_id',v_job.invoice_id),auth.uid());
  return jsonb_build_object('ok',true,'id',p_job_id,'status','collected');
end;
$$;

create or replace function public.register_service_scanner_device(
  p_branch_id uuid,
  p_name text,
  p_purpose text default 'repair_processing'
) returns jsonb
language plpgsql security definer set search_path='public'
as $$
declare v_company_id uuid; v_id uuid; v_code text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.scanner.manage') then raise exception 'Permission denied: repair.scanner.manage'; end if;
  v_company_id:=public.current_company_id();
  if not exists(select 1 from public.branch where id=p_branch_id and company_id=v_company_id) then raise exception 'Branch could not be found.'; end if;
  if nullif(btrim(coalesce(p_name,'')),'') is null then raise exception 'Scanner name is required.'; end if;
  if p_purpose not in ('intake','repair_processing','collection','multi') then raise exception 'Invalid scanner purpose.'; end if;
  v_code:='SCN-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.service_scanner_device(company_id,branch_id,device_code,name,purpose,created_by)
  values(v_company_id,p_branch_id,v_code,btrim(p_name),p_purpose,auth.uid()) returning id into v_id;
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'service_scanner_registered','repairs',v_id,'Repair scanner device registered.',jsonb_build_object('device_code',v_code,'name',btrim(p_name),'branch_id',p_branch_id,'purpose',p_purpose));
  return jsonb_build_object('ok',true,'id',v_id,'device_code',v_code,'name',btrim(p_name),'purpose',p_purpose);
end;
$$;

create or replace function public.list_service_scanner_devices()
returns table(id uuid,branch_id uuid,device_code text,name text,purpose text,is_active boolean,last_seen_at timestamptz)
language sql stable security definer set search_path='public'
as $$
  select d.id,d.branch_id,d.device_code,d.name,d.purpose,d.is_active,d.last_seen_at
  from public.service_scanner_device d
  where d.company_id=public.current_company_id()
    and auth.uid() is not null
    and public.current_user_has_permission('repair.scanner.use')
  order by d.name;
$$;

create or replace function public.scan_service_job(
  p_scanner_device_id uuid,
  p_scanned_value text,
  p_action text default 'lookup'
) returns jsonb
language plpgsql security definer set search_path='public'
as $$
declare v_company_id uuid; v_device public.service_scanner_device%rowtype; v_job public.service_job%rowtype; v_match text:='unmatched'; v_employee_id uuid; v_customer text; v_employee text; v_invoice_number text; v_balance numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.scanner.use') then raise exception 'Permission denied: repair.scanner.use'; end if;
  if nullif(btrim(coalesce(p_scanned_value,'')),'') is null then raise exception 'Scan value is required.'; end if;
  if p_action not in ('lookup','intake','workbench','diagnosis','repair_start','repair_complete','collection') then raise exception 'Invalid scan action.'; end if;
  v_company_id:=public.current_company_id();
  select * into v_device from public.service_scanner_device where id=p_scanner_device_id and company_id=v_company_id and is_active=true;
  if not found then raise exception 'Scanner device is not registered or is inactive.'; end if;
  select e.id into v_employee_id from public.hr_employee e where e.company_id=v_company_id and e.user_id=auth.uid() and e.status='active' limit 1;

  select j.* into v_job
  from public.service_job j
  where j.company_id=v_company_id and j.branch_id=v_device.branch_id
    and upper(j.job_number)=upper(btrim(p_scanned_value))
  order by j.created_at desc limit 1;
  if found then v_match:='job_number';
  else
    select j.* into v_job
    from public.service_job j
    where j.company_id=v_company_id and j.branch_id=v_device.branch_id
      and j.serial_number is not null and upper(j.serial_number)=upper(btrim(p_scanned_value))
    order by j.created_at desc limit 1;
    if found then v_match:='serial_number';
    else
      select j.* into v_job
      from public.service_job j
      where j.company_id=v_company_id and j.branch_id=v_device.branch_id
        and j.imei is not null and regexp_replace(j.imei,'\\s','','g')=regexp_replace(btrim(p_scanned_value),'\\s','','g')
      order by j.created_at desc limit 1;
      if found then v_match:='imei'; end if;
    end if;
  end if;

  update public.service_scanner_device set last_seen_at=now(),updated_at=now() where id=v_device.id;
  insert into public.service_job_scan(company_id,branch_id,scanner_device_id,service_job_id,scanned_value,match_type,scan_action,user_id,employee_id)
  values(v_company_id,v_device.branch_id,v_device.id,case when v_match='unmatched' then null else v_job.id end,btrim(p_scanned_value),v_match,p_action,auth.uid(),v_employee_id);

  if v_match='unmatched' then
    return jsonb_build_object('ok',true,'found',false,'scan_value',btrim(p_scanned_value),'action',p_action,'message','No matching JINLAB job card, serial number or IMEI was found for this branch.');
  end if;

  select c.customer_name into v_customer from public.customer c where c.id=v_job.customer_id and c.company_id=v_company_id;
  select concat_ws(' ',e.first_name,e.last_name) into v_employee from public.hr_employee e where e.id=v_job.assigned_employee_id and e.company_id=v_company_id;
  if v_job.invoice_id is not null then select i.invoice_number,i.balance_due into v_invoice_number,v_balance from public.invoice i where i.id=v_job.invoice_id and i.company_id=v_company_id; end if;

  return jsonb_build_object(
    'ok',true,'found',true,'match_type',v_match,'action',p_action,
    'job',jsonb_build_object(
      'id',v_job.id,'job_number',v_job.job_number,'status',v_job.status,
      'customer_name',v_customer,'device_type',v_job.device_type,'brand',v_job.brand,'model',v_job.model,
      'serial_number',v_job.serial_number,'imei',v_job.imei,'reported_fault',v_job.reported_fault,
      'assigned_employee',v_employee,'intake_confirmed',v_job.intake_confirmed_at is not null,
      'approved_amount',v_job.approved_amount,'repair_started_at',v_job.repair_started_at,
      'invoice_number',v_invoice_number,'balance_due',v_balance
    )
  );
end;
$$;

grant execute on function public.confirm_service_job_intake(uuid,text,text) to authenticated;
grant execute on function public.start_service_job_repair(uuid) to authenticated;
grant execute on function public.register_service_scanner_device(uuid,text,text) to authenticated;
grant execute on function public.list_service_scanner_devices() to authenticated;
grant execute on function public.scan_service_job(uuid,text,text) to authenticated;
;
