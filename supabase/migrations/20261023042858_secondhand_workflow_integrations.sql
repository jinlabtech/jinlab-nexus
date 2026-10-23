-- Additive workflow links. These estimates never create a payment, stock receipt,
-- customer credit or accounting entry; ordinary Second-hand POS guards stay intact.
create table nexus_sh.trade_in (
  item_id uuid primary key references nexus_sh.item(id),
  branch_id uuid not null references public.branch(id),
  customer_id uuid not null references public.customer(id),
  customer_name text not null,
  customer_number text not null,
  replacement_inventory_item_id uuid not null references public.inventory_item(id),
  replacement_item_name text not null,
  replacement_sku text not null,
  replacement_price numeric(12,2) not null check (replacement_price between 0 and 9999999999),
  allowance_amount numeric(12,2) not null check (allowance_amount between 0 and 9999999999),
  balance_due numeric(12,2) generated always as (greatest(replacement_price-allowance_amount,0)) stored,
  excess_allowance numeric(12,2) generated always as (greatest(allowance_amount-replacement_price,0)) stored,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index sh_trade_in_branch_idx on nexus_sh.trade_in(branch_id,created_at desc);
alter table nexus_sh.trade_in enable row level security;
revoke all on nexus_sh.trade_in from public,anon,authenticated;
create trigger sh_trade_in_immutable before update or delete on nexus_sh.trade_in
for each row execute function nexus_sh.immutable_record();

create function nexus_sh.integrated_action(p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_access nexus_sh.access; v_item nexus_sh.item; v_job public.service_job;
  v_customer public.customer; v_inventory public.inventory_item; v_stock integer;
  v_branch uuid; v_customer_id uuid; v_replacement_id uuid; v_job_id uuid;
  v_result jsonb; v_id uuid;
begin
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>20000 then
    raise exception 'Invalid request payload.' using errcode='22023';
  end if;
  v_branch:=(p_payload->>'branch_id')::uuid;

  if p_action='link_repair' then
    v_access:=nexus_sh.require_access(v_branch);
    if v_access.role='auditor' then raise exception 'Auditor access is read-only.' using errcode='42501'; end if;
    v_id:=(p_payload->>'item_id')::uuid;
    v_job_id:=(p_payload->>'service_job_id')::uuid;
    -- Match Repairs' job -> device lock order to avoid a concurrent job-update deadlock.
    select * into v_job from public.service_job j
      where j.id=v_job_id and j.company_id=v_access.company_id and j.branch_id=v_branch for update;
    if not found then raise exception 'Repair job must match this branch, company and device identifier.' using errcode='22023'; end if;
    select * into v_item from nexus_sh.item where id=v_id and branch_id=v_branch for update;
    if not found then raise exception 'The item is not available in this branch.' using errcode='22023'; end if;
    if v_item.flag_reason is not null or v_item.status='quarantined' or v_item.screening_result<>'clear' then
      raise exception 'Quarantined or unresolved goods cannot be released, altered or sold.' using errcode='42501';
    end if;
    if now()<v_item.hold_until then
      raise exception 'Statutory/conservative holding period has not elapsed; no delivery or refurbishment is allowed.' using errcode='42501';
    end if;
    if v_item.approved_at is null then raise exception 'Owner approval is required before release or refurbishment.' using errcode='42501'; end if;
    if v_item.status not in ('approved','released') then raise exception 'Only approved, unsold devices can be linked to repairs.' using errcode='22023'; end if;
    if not coalesce(((v_item.imei is not null and v_job.imei=v_item.imei)
      or (v_item.serial_number is not null and upper(v_job.serial_number)=upper(v_item.serial_number))),false) then
      raise exception 'Repair job must match this branch, company and device identifier.' using errcode='22023';
    end if;
    if v_item.service_job_id is not null and v_item.service_job_id<>v_job_id then
      raise exception 'This device already has a linked repair job.' using errcode='22023';
    end if;
    if v_item.service_job_id is null then
      update nexus_sh.item set service_job_id=v_job_id where id=v_id;
      perform nexus_sh.log(v_branch,'repair_job_linked',v_id,jsonb_build_object('service_job_id',v_job_id,'job_number',v_job.job_number));
    end if;
    return jsonb_build_object('id',v_id);
  end if;

  -- A later cost must never overwrite the explicit repair link and remove the
  -- existing repair/line guards after an identifier correction.
  if p_action='add_cost' and nullif(p_payload->>'service_job_id','') is not null then
    v_access:=nexus_sh.require_access(v_branch);
    if v_access.role='auditor' then raise exception 'Auditor access is read-only.' using errcode='42501'; end if;
    select * into v_item from nexus_sh.item where id=(p_payload->>'item_id')::uuid and branch_id=v_branch for update;
    if found and v_item.service_job_id is not null and v_item.service_job_id<>(p_payload->>'service_job_id')::uuid then
      raise exception 'This device already has a linked repair job.' using errcode='22023';
    end if;
  end if;

  if p_action='acquire' then
    v_customer_id:=nullif(p_payload->>'customer_id','')::uuid;
    v_replacement_id:=nullif(p_payload->>'replacement_inventory_item_id','')::uuid;
    if v_customer_id is not null or v_replacement_id is not null then
      v_access:=nexus_sh.require_access(v_branch);
      if v_access.role='auditor' then raise exception 'Auditor access is read-only.' using errcode='42501'; end if;
      if coalesce(p_payload->>'acquisition_type','purchase')<>'trade_in' or v_customer_id is null or v_replacement_id is null then
        raise exception 'Choose both a customer and replacement product for a trade-in estimate.' using errcode='22023';
      end if;
      select * into v_customer from public.customer c where c.id=v_customer_id
        and c.company_id=v_access.company_id and c.is_active=true for share;
      if not found then raise exception 'Choose an active customer in this company.' using errcode='22023'; end if;
      select * into v_inventory from public.inventory_item i where i.id=v_replacement_id
        and i.company_id=v_access.company_id and i.is_active=true
        and not exists(select 1 from nexus_sh.item s where s.inventory_item_id=i.id) for share;
      if not found then raise exception 'Choose an available replacement product in this branch.' using errcode='22023'; end if;
      select s.quantity into v_stock from public.branch_stock s where s.inventory_item_id=v_replacement_id
        and s.company_id=v_access.company_id and s.branch_id=v_branch for share;
      if coalesce(v_stock,0)<=0 then raise exception 'Choose an available replacement product in this branch.' using errcode='22023'; end if;
    end if;
  end if;

  -- Delegate every established acquisition, approval, quarantine, holding-period,
  -- export and permission check to the unchanged implementation.
  v_result:=nexus_sh.action(p_action,p_payload);
  if p_action='acquire' and v_customer_id is not null then
    v_id:=(v_result->>'id')::uuid;
    select * into strict v_item from nexus_sh.item where id=v_id;
    insert into nexus_sh.trade_in(item_id,branch_id,customer_id,customer_name,customer_number,
      replacement_inventory_item_id,replacement_item_name,replacement_sku,replacement_price,allowance_amount,created_by)
    values(v_id,v_branch,v_customer.id,v_customer.customer_name,v_customer.customer_number,
      v_inventory.id,v_inventory.item_name,v_inventory.sku,v_inventory.selling_price,v_item.purchase_amount,auth.uid());
    perform nexus_sh.log(v_branch,'trade_in_estimate_recorded',v_id,jsonb_build_object(
      'customer_id',v_customer.id,'replacement_inventory_item_id',v_inventory.id,
      'replacement_price',v_inventory.selling_price,'allowance_amount',v_item.purchase_amount,
      'balance_due',greatest(v_inventory.selling_price-v_item.purchase_amount,0),
      'settlement','estimate_only_no_payment_or_accounting'));
  end if;
  return v_result;
end $$;

create function nexus_sh.integration_choices(p_branch_id uuid,p_query text default '',p_item_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_access nexus_sh.access; v_item nexus_sh.item; v_query text:=btrim(coalesce(p_query,''));
begin
  v_access:=nexus_sh.require_access(p_branch_id);
  if length(v_query)>100 then raise exception 'Search must contain no more than 100 characters.' using errcode='22023'; end if;
  if p_item_id is not null then
    select * into v_item from nexus_sh.item where id=p_item_id and branch_id=p_branch_id;
    if not found then raise exception 'The item is not available in this branch.' using errcode='22023'; end if;
  end if;
  return jsonb_build_object(
    'customers',coalesce((select jsonb_agg(to_jsonb(c) order by c.name,c.id) from
      (select c.id,c.customer_name name,c.customer_number number from public.customer c
       where c.company_id=v_access.company_id and c.is_active=true
       and (v_query='' or position(lower(v_query) in lower(c.customer_name||' '||c.customer_number))>0)
       order by c.customer_name,c.id limit 20) c),'[]'::jsonb),
    'replacement_items',coalesce((select jsonb_agg(to_jsonb(i) order by i.name,i.id) from
      (select i.id,i.item_name name,i.sku,i.selling_price,s.quantity from public.inventory_item i
       join public.branch_stock s on s.inventory_item_id=i.id and s.company_id=v_access.company_id and s.branch_id=p_branch_id
       where i.company_id=v_access.company_id and i.is_active=true and s.quantity>0
       and not exists(select 1 from nexus_sh.item r where r.inventory_item_id=i.id)
       and (v_query='' or position(lower(v_query) in lower(i.item_name||' '||i.sku))>0)
       order by i.item_name,i.id limit 20) i),'[]'::jsonb),
    'repair_jobs',coalesce((select jsonb_agg(to_jsonb(j) order by j.job_number,j.id) from
      (select j.id,j.job_number,j.status from public.service_job j
       where p_item_id is not null and j.company_id=v_access.company_id and j.branch_id=p_branch_id
       and ((v_item.imei is not null and j.imei=v_item.imei) or (v_item.serial_number is not null and upper(j.serial_number)=upper(v_item.serial_number)))
       and (v_query='' or position(lower(v_query) in lower(j.job_number))>0)
       order by j.job_number,j.id limit 20) j),'[]'::jsonb),
    'staff',case when v_access.role='owner' then coalesce((select jsonb_agg(to_jsonb(u) order by u.name,u.id) from
      (select distinct u.id,coalesce(nullif(btrim(p.full_name),''),u.email) name,u.email
       from auth.users u join public.user_profile p on p.user_id=u.id and p.company_id=v_access.company_id
       where u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
       and (u.banned_until is null or u.banned_until<=now())
       and (v_query='' or position(lower(v_query) in lower(coalesce(p.full_name,'')||' '||coalesce(u.email,'')))>0)
       order by name,u.id limit 20) u),'[]'::jsonb) else '[]'::jsonb end
  );
end $$;

create function nexus_sh.integrated_workspace(p_branch_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  v_result:=nexus_sh.workspace(p_branch_id);
  if coalesce((v_result->>'access_required')::boolean,false) then return v_result; end if;
  return jsonb_set(v_result,'{items}',coalesce((select jsonb_agg(e.value||jsonb_build_object('trade_in',
    (select to_jsonb(t)-array['created_by','branch_id'] from nexus_sh.trade_in t where t.item_id=(e.value->>'id')::uuid)) order by e.ordinality)
    from jsonb_array_elements(v_result->'items') with ordinality e(value,ordinality)),'[]'::jsonb));
end $$;

create function nexus_sh.integrated_register_export(p_branch_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  -- The established export enforces owner/auditor access and logs sensitive access.
  v_result:=nexus_sh.register_export(p_branch_id);
  return jsonb_set(v_result,'{register}',coalesce((select jsonb_agg(e.value||jsonb_build_object('trade_in',
    (select to_jsonb(t) from nexus_sh.trade_in t where t.item_id=(e.value->>'id')::uuid)) order by e.ordinality)
    from jsonb_array_elements(v_result->'register') with ordinality e(value,ordinality)),'[]'::jsonb));
end $$;

create or replace function public.sh_action(p_action text,p_payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select nexus_sh.integrated_action(p_action,p_payload); $$;
create or replace function public.sh_workspace(p_branch_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$ select nexus_sh.integrated_workspace(p_branch_id); $$;
create or replace function public.sh_register_export(p_branch_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select nexus_sh.integrated_register_export(p_branch_id); $$;
create function public.sh_integration_choices(p_branch_id uuid,p_query text default '',p_item_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$ select nexus_sh.integration_choices(p_branch_id,p_query,p_item_id); $$;

-- The old private entry points are now implementation helpers, callable only by
-- the narrow definer wrappers above. Direct helper access cannot bypass appendices.
revoke all on function nexus_sh.action(text,jsonb),nexus_sh.workspace(uuid),nexus_sh.register_export(uuid) from public,anon,authenticated;
revoke all on function nexus_sh.integrated_action(text,jsonb),nexus_sh.integration_choices(uuid,text,uuid),nexus_sh.integrated_workspace(uuid),nexus_sh.integrated_register_export(uuid) from public,anon,authenticated;
grant execute on function nexus_sh.integrated_action(text,jsonb),nexus_sh.integration_choices(uuid,text,uuid),nexus_sh.integrated_workspace(uuid),nexus_sh.integrated_register_export(uuid) to authenticated;
revoke all on function public.sh_action(text,jsonb),public.sh_workspace(uuid),public.sh_register_export(uuid),public.sh_integration_choices(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.sh_action(text,jsonb),public.sh_workspace(uuid),public.sh_register_export(uuid),public.sh_integration_choices(uuid,text,uuid) to authenticated;
notify pgrst,'reload schema';
