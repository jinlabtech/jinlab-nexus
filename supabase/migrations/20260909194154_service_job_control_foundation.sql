create table if not exists public.service_job_sequence (
  company_id uuid primary key references public.company(id) on delete cascade,
  last_value bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.service_job (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid not null references public.branch(id),
  job_number text not null,
  customer_id uuid not null references public.customer(id),
  assigned_employee_id uuid references public.hr_employee(id),
  status text not null default 'received' check (status in ('received','diagnosing','awaiting_approval','approved','in_progress','technical_complete','ready_for_collection','collected','closed','cancelled')),
  device_type text not null,
  brand text,
  model text,
  serial_number text,
  imei text,
  device_condition text,
  accessories_received text,
  reported_fault text not null,
  diagnosis text,
  proposed_amount numeric(18,2) not null default 0 check (proposed_amount >= 0),
  approved_amount numeric(18,2) check (approved_amount is null or approved_amount >= 0),
  quote_approved_at timestamptz,
  quote_approved_by uuid,
  quote_approval_method text,
  quote_approval_reference text,
  invoice_id uuid references public.invoice(id),
  technical_completed_at timestamptz,
  technical_completed_by uuid,
  collection_confirmed_at timestamptz,
  collection_confirmed_by uuid,
  collection_method text,
  collection_reference text,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancellation_reason text,
  closed_at timestamptz,
  closed_by uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, job_number)
);

create index if not exists service_job_company_status_idx on public.service_job(company_id,status,created_at desc);
create index if not exists service_job_company_customer_idx on public.service_job(company_id,customer_id,created_at desc);
create index if not exists service_job_company_assignee_idx on public.service_job(company_id,assigned_employee_id,status);
create index if not exists service_job_serial_idx on public.service_job(company_id,serial_number) where serial_number is not null;
create index if not exists service_job_imei_idx on public.service_job(company_id,imei) where imei is not null;

create table if not exists public.service_job_line (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  service_job_id uuid not null references public.service_job(id) on delete cascade,
  line_type text not null default 'service' check (line_type in ('labour','service','software','part','other')),
  inventory_item_id uuid references public.inventory_item(id),
  description text not null,
  quantity numeric(18,3) not null default 1 check (quantity > 0),
  unit_price numeric(18,2) not null default 0 check (unit_price >= 0),
  line_total numeric(18,2) generated always as (round(quantity * unit_price,2)) stored,
  entered_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists service_job_line_job_idx on public.service_job_line(service_job_id,created_at);

create table if not exists public.service_job_event (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  service_job_id uuid not null references public.service_job(id) on delete cascade,
  event_type text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  user_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists service_job_event_job_idx on public.service_job_event(service_job_id,created_at,id);

insert into public.permissions(permission_name)
select x.permission_name
from (values
 ('repair.view'),
 ('repair.create'),
 ('repair.update'),
 ('repair.assign'),
 ('repair.quote'),
 ('repair.quote.approve'),
 ('repair.complete'),
 ('repair.invoice.link'),
 ('repair.collection.confirm'),
 ('repair.cancel'),
 ('repair.close'),
 ('repair.manage')
) as x(permission_name)
on conflict(permission_name) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.permission_name like 'repair.%'
where r.role_name in ('owner','admin')
on conflict(role_id,permission_id) do nothing;

alter table public.service_job enable row level security;
alter table public.service_job_line enable row level security;
alter table public.service_job_event enable row level security;
alter table public.service_job_sequence enable row level security;

drop policy if exists service_job_select on public.service_job;
create policy service_job_select on public.service_job for select to authenticated
using (company_id=public.current_company_id() and public.current_user_has_permission('repair.view'));

drop policy if exists service_job_line_select on public.service_job_line;
create policy service_job_line_select on public.service_job_line for select to authenticated
using (company_id=public.current_company_id() and public.current_user_has_permission('repair.view'));

drop policy if exists service_job_event_select on public.service_job_event;
create policy service_job_event_select on public.service_job_event for select to authenticated
using (company_id=public.current_company_id() and public.current_user_has_permission('repair.view'));

revoke all on public.service_job from anon;
revoke insert,update,delete on public.service_job from authenticated;
revoke all on public.service_job_line from anon;
revoke insert,update,delete on public.service_job_line from authenticated;
revoke all on public.service_job_event from anon;
revoke insert,update,delete on public.service_job_event from authenticated;
revoke all on public.service_job_sequence from anon,authenticated;

grant select on public.service_job,public.service_job_line,public.service_job_event to authenticated;

create or replace function public.generate_service_job_number(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare v_next bigint;
begin
  insert into public.service_job_sequence(company_id,last_value,updated_at)
  values(p_company_id,1,now())
  on conflict(company_id) do update
    set last_value=public.service_job_sequence.last_value+1, updated_at=now()
  returning last_value into v_next;
  return 'JC-'||to_char(current_date,'YYYY')||'-'||lpad(v_next::text,6,'0');
end;
$$;

create or replace function public.create_service_job(
  p_branch_id uuid,
  p_customer_id uuid,
  p_device_type text,
  p_brand text default null,
  p_model text default null,
  p_serial_number text default null,
  p_imei text default null,
  p_device_condition text default null,
  p_accessories_received text default null,
  p_reported_fault text default null,
  p_assigned_employee_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_company_id uuid; v_id uuid; v_job_number text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.create') then raise exception 'Permission denied: repair.create'; end if;
  v_company_id:=public.current_company_id();
  if p_device_type is null or btrim(p_device_type)='' then raise exception 'Device type is required.'; end if;
  if p_reported_fault is null or btrim(p_reported_fault)='' then raise exception 'Reported fault is required.'; end if;
  if not exists(select 1 from public.branch b where b.id=p_branch_id and b.company_id=v_company_id) then raise exception 'Branch could not be found.'; end if;
  if not exists(select 1 from public.customer c where c.id=p_customer_id and c.company_id=v_company_id and c.is_active=true) then raise exception 'Customer could not be found.'; end if;
  if p_assigned_employee_id is not null and not exists(select 1 from public.hr_employee e where e.id=p_assigned_employee_id and e.company_id=v_company_id and e.status='active') then raise exception 'Assigned employee could not be found.'; end if;
  v_job_number:=public.generate_service_job_number(v_company_id);
  insert into public.service_job(company_id,branch_id,job_number,customer_id,assigned_employee_id,device_type,brand,model,serial_number,imei,device_condition,accessories_received,reported_fault,created_by)
  values(v_company_id,p_branch_id,v_job_number,p_customer_id,p_assigned_employee_id,btrim(p_device_type),nullif(btrim(coalesce(p_brand,'')),''),nullif(btrim(coalesce(p_model,'')),''),nullif(btrim(coalesce(p_serial_number,'')),''),nullif(btrim(coalesce(p_imei,'')),''),nullif(btrim(coalesce(p_device_condition,'')),''),nullif(btrim(coalesce(p_accessories_received,'')),''),btrim(p_reported_fault),auth.uid())
  returning id into v_id;
  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,v_id,'created','Job card opened.',jsonb_build_object('job_number',v_job_number,'assigned_employee_id',p_assigned_employee_id),auth.uid());
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'service_job_created','repairs',v_id,'Repair/service job card opened.',jsonb_build_object('job_number',v_job_number,'customer_id',p_customer_id,'device_type',btrim(p_device_type)));
  return jsonb_build_object('ok',true,'id',v_id,'job_number',v_job_number,'status','received');
end;
$$;

create or replace function public.update_service_job_technical(
  p_job_id uuid,
  p_diagnosis text,
  p_proposed_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_company_id uuid; v_job public.service_job%rowtype; v_employee_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.update') then raise exception 'Permission denied: repair.update'; end if;
  v_company_id:=public.current_company_id();
  select * into v_job from public.service_job where id=p_job_id and company_id=v_company_id for update;
  if not found then raise exception 'Job card could not be found.'; end if;
  if v_job.status in ('closed','cancelled','collected') then raise exception 'This job can no longer be edited technically.'; end if;
  select e.id into v_employee_id from public.hr_employee e where e.company_id=v_company_id and e.user_id=auth.uid() and e.status='active' limit 1;
  if not public.current_user_has_permission('repair.manage') and (v_job.assigned_employee_id is null or v_employee_id is distinct from v_job.assigned_employee_id) then
    raise exception 'You may only update jobs assigned to you.';
  end if;
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
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_company_id uuid; v_job public.service_job%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.quote.approve') then raise exception 'Permission denied: repair.quote.approve'; end if;
  if p_approved_amount is null or p_approved_amount<0 then raise exception 'Approved amount is required.'; end if;
  v_company_id:=public.current_company_id();
  select * into v_job from public.service_job where id=p_job_id and company_id=v_company_id for update;
  if not found then raise exception 'Job card could not be found.'; end if;
  if v_job.status in ('closed','cancelled','collected') then raise exception 'This job cannot be approved in its current state.'; end if;
  update public.service_job set approved_amount=p_approved_amount,quote_approved_at=now(),quote_approved_by=auth.uid(),quote_approval_method=nullif(btrim(coalesce(p_method,'')),''),quote_approval_reference=nullif(btrim(coalesce(p_reference,'')),''),status='approved',updated_at=now() where id=p_job_id;
  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,p_job_id,'quote_approved','Repair quote/price approved.',jsonb_build_object('approved_amount',p_approved_amount,'method',p_method,'reference',p_reference),auth.uid());
  return jsonb_build_object('ok',true,'id',p_job_id,'status','approved','approved_amount',p_approved_amount);
end;
$$;

create or replace function public.add_service_job_line(
  p_job_id uuid,
  p_line_type text,
  p_description text,
  p_quantity numeric default 1,
  p_unit_price numeric default 0,
  p_inventory_item_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_company_id uuid; v_job public.service_job%rowtype; v_id uuid; v_employee_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.update') then raise exception 'Permission denied: repair.update'; end if;
  v_company_id:=public.current_company_id();
  select * into v_job from public.service_job where id=p_job_id and company_id=v_company_id for update;
  if not found then raise exception 'Job card could not be found.'; end if;
  if v_job.status in ('closed','cancelled','collected') then raise exception 'Lines cannot be added to this job.'; end if;
  select e.id into v_employee_id from public.hr_employee e where e.company_id=v_company_id and e.user_id=auth.uid() and e.status='active' limit 1;
  if not public.current_user_has_permission('repair.manage') and (v_job.assigned_employee_id is null or v_employee_id is distinct from v_job.assigned_employee_id) then raise exception 'You may only update jobs assigned to you.'; end if;
  if p_line_type not in ('labour','service','software','part','other') then raise exception 'Invalid service line type.'; end if;
  if p_description is null or btrim(p_description)='' then raise exception 'Description is required.'; end if;
  if coalesce(p_quantity,0)<=0 or coalesce(p_unit_price,0)<0 then raise exception 'Invalid quantity or price.'; end if;
  if p_inventory_item_id is not null and not exists(select 1 from public.inventory_item i where i.id=p_inventory_item_id and i.company_id=v_company_id and i.is_active=true) then raise exception 'Inventory item could not be found.'; end if;
  insert into public.service_job_line(company_id,service_job_id,line_type,inventory_item_id,description,quantity,unit_price,entered_by)
  values(v_company_id,p_job_id,p_line_type,p_inventory_item_id,btrim(p_description),p_quantity,p_unit_price,auth.uid()) returning id into v_id;
  update public.service_job set status=case when status in ('approved','in_progress') then 'in_progress' else status end,updated_at=now() where id=p_job_id;
  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,p_job_id,'line_added','Repair/service line added.',jsonb_build_object('line_id',v_id,'line_type',p_line_type,'description',btrim(p_description),'quantity',p_quantity,'unit_price',p_unit_price,'inventory_item_id',p_inventory_item_id),auth.uid());
  return jsonb_build_object('ok',true,'id',v_id,'job_id',p_job_id);
end;
$$;

create or replace function public.complete_service_job_technical(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_company_id uuid; v_job public.service_job%rowtype; v_employee_id uuid; v_line_total numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.complete') then raise exception 'Permission denied: repair.complete'; end if;
  v_company_id:=public.current_company_id();
  select * into v_job from public.service_job where id=p_job_id and company_id=v_company_id for update;
  if not found then raise exception 'Job card could not be found.'; end if;
  select e.id into v_employee_id from public.hr_employee e where e.company_id=v_company_id and e.user_id=auth.uid() and e.status='active' limit 1;
  if not public.current_user_has_permission('repair.manage') and (v_job.assigned_employee_id is null or v_employee_id is distinct from v_job.assigned_employee_id) then raise exception 'You may only complete jobs assigned to you.'; end if;
  if v_job.approved_amount is null then raise exception 'Price/quote must be approved before technical completion.'; end if;
  if v_job.diagnosis is null or btrim(v_job.diagnosis)='' then raise exception 'Diagnosis is required before completion.'; end if;
  select coalesce(sum(line_total),0) into v_line_total from public.service_job_line where service_job_id=p_job_id and company_id=v_company_id;
  if v_line_total<=0 then raise exception 'At least one billable service/part line is required before completion.'; end if;
  update public.service_job set status='technical_complete',technical_completed_at=now(),technical_completed_by=auth.uid(),updated_at=now() where id=p_job_id;
  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,p_job_id,'technical_completed','Technical work marked complete.',jsonb_build_object('recorded_lines_total',v_line_total,'approved_amount',v_job.approved_amount),auth.uid());
  return jsonb_build_object('ok',true,'id',p_job_id,'status','technical_complete','recorded_lines_total',v_line_total);
end;
$$;

create or replace function public.link_service_job_invoice(p_job_id uuid,p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_company_id uuid; v_job public.service_job%rowtype; v_invoice public.invoice%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.invoice.link') then raise exception 'Permission denied: repair.invoice.link'; end if;
  v_company_id:=public.current_company_id();
  select * into v_job from public.service_job where id=p_job_id and company_id=v_company_id for update;
  if not found then raise exception 'Job card could not be found.'; end if;
  select * into v_invoice from public.invoice where id=p_invoice_id and company_id=v_company_id;
  if not found then raise exception 'Invoice could not be found.'; end if;
  if v_invoice.customer_id<>v_job.customer_id then raise exception 'Invoice customer does not match the job-card customer.'; end if;
  update public.service_job set invoice_id=p_invoice_id,status=case when status='technical_complete' then 'ready_for_collection' else status end,updated_at=now() where id=p_job_id;
  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,p_job_id,'invoice_linked','Invoice linked to job card.',jsonb_build_object('invoice_id',p_invoice_id,'invoice_number',v_invoice.invoice_number,'invoice_total',v_invoice.total_amount,'balance_due',v_invoice.balance_due),auth.uid());
  return jsonb_build_object('ok',true,'id',p_job_id,'invoice_id',p_invoice_id,'invoice_number',v_invoice.invoice_number,'balance_due',v_invoice.balance_due);
end;
$$;

create or replace function public.confirm_service_job_collection(p_job_id uuid,p_method text,p_reference text default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_company_id uuid; v_job public.service_job%rowtype; v_invoice public.invoice%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.collection.confirm') then raise exception 'Permission denied: repair.collection.confirm'; end if;
  v_company_id:=public.current_company_id();
  select * into v_job from public.service_job where id=p_job_id and company_id=v_company_id for update;
  if not found then raise exception 'Job card could not be found.'; end if;
  if v_job.status not in ('technical_complete','ready_for_collection') then raise exception 'Job is not ready for collection.'; end if;
  if v_job.invoice_id is null then raise exception 'A JINLAB invoice must be linked before collection.'; end if;
  select * into v_invoice from public.invoice where id=v_job.invoice_id and company_id=v_company_id;
  if not found then raise exception 'Linked invoice could not be found.'; end if;
  if coalesce(v_invoice.balance_due,0)>0.005 then raise exception 'Customer still has an outstanding balance of %.',v_invoice.balance_due; end if;
  update public.service_job set status='collected',collection_confirmed_at=now(),collection_confirmed_by=auth.uid(),collection_method=nullif(btrim(coalesce(p_method,'')),''),collection_reference=nullif(btrim(coalesce(p_reference,'')),''),updated_at=now() where id=p_job_id;
  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,p_job_id,'collected','Customer collection confirmed after invoice settlement.',jsonb_build_object('method',p_method,'reference',p_reference,'invoice_id',v_job.invoice_id),auth.uid());
  return jsonb_build_object('ok',true,'id',p_job_id,'status','collected');
end;
$$;

create or replace function public.close_service_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_company_id uuid; v_job public.service_job%rowtype; v_invoice public.invoice%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('repair.close') then raise exception 'Permission denied: repair.close'; end if;
  v_company_id:=public.current_company_id();
  select * into v_job from public.service_job where id=p_job_id and company_id=v_company_id for update;
  if not found then raise exception 'Job card could not be found.'; end if;
  if v_job.status<>'collected' then raise exception 'Customer collection must be confirmed before closing.'; end if;
  if v_job.invoice_id is null then raise exception 'Linked invoice is required before closing.'; end if;
  select * into v_invoice from public.invoice where id=v_job.invoice_id and company_id=v_company_id;
  if not found or coalesce(v_invoice.balance_due,0)>0.005 then raise exception 'The linked invoice must be fully settled before closing.'; end if;
  update public.service_job set status='closed',closed_at=now(),closed_by=auth.uid(),updated_at=now() where id=p_job_id;
  insert into public.service_job_event(company_id,service_job_id,event_type,description,metadata,user_id)
  values(v_company_id,p_job_id,'closed','Job card financially and operationally closed.',jsonb_build_object('invoice_id',v_job.invoice_id),auth.uid());
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'service_job_closed','repairs',p_job_id,'Repair/service job closed after collection and settlement.',jsonb_build_object('job_number',v_job.job_number,'invoice_id',v_job.invoice_id));
  return jsonb_build_object('ok',true,'id',p_job_id,'status','closed');
end;
$$;

revoke all on function public.generate_service_job_number(uuid) from public,anon,authenticated;
revoke all on function public.create_service_job(uuid,uuid,text,text,text,text,text,text,text,text,uuid) from public,anon;
revoke all on function public.update_service_job_technical(uuid,text,numeric) from public,anon;
revoke all on function public.approve_service_job_quote(uuid,numeric,text,text) from public,anon;
revoke all on function public.add_service_job_line(uuid,text,text,numeric,numeric,uuid) from public,anon;
revoke all on function public.complete_service_job_technical(uuid) from public,anon;
revoke all on function public.link_service_job_invoice(uuid,uuid) from public,anon;
revoke all on function public.confirm_service_job_collection(uuid,text,text) from public,anon;
revoke all on function public.close_service_job(uuid) from public,anon;

grant execute on function public.create_service_job(uuid,uuid,text,text,text,text,text,text,text,text,uuid) to authenticated;
grant execute on function public.update_service_job_technical(uuid,text,numeric) to authenticated;
grant execute on function public.approve_service_job_quote(uuid,numeric,text,text) to authenticated;
grant execute on function public.add_service_job_line(uuid,text,text,numeric,numeric,uuid) to authenticated;
grant execute on function public.complete_service_job_technical(uuid) to authenticated;
grant execute on function public.link_service_job_invoice(uuid,uuid) to authenticated;
grant execute on function public.confirm_service_job_collection(uuid,text,text) to authenticated;
grant execute on function public.close_service_job(uuid) to authenticated;;
