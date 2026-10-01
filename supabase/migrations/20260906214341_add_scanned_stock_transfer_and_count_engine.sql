-- JINLAB Nexus Sprint 21.2: scanned stock transfer + physical count foundation

alter table public.inventory_cost_movement drop constraint if exists inventory_cost_movement_type_check;
alter table public.inventory_cost_movement add constraint inventory_cost_movement_type_check check (movement_type = any (array['opening'::text,'purchase_receipt'::text,'sale'::text,'sale_reversal'::text,'adjustment_in'::text,'adjustment_out'::text,'transfer_in'::text,'transfer_out'::text]));

create table if not exists public.inventory_transfer_sequence (
  company_id uuid primary key references public.company(id) on delete cascade,
  last_value bigint not null default 0 check (last_value >= 0),
  updated_at timestamptz not null default now()
);
alter table public.inventory_transfer_sequence enable row level security;
revoke all on public.inventory_transfer_sequence from public,anon,authenticated;

create table if not exists public.inventory_stock_transfer (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  transfer_number text not null,
  from_branch_id uuid not null references public.branch(id),
  to_branch_id uuid not null references public.branch(id),
  status text not null default 'completed' check (status in ('completed','cancelled')),
  initiated_by uuid,
  completed_by uuid,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  constraint inventory_stock_transfer_different_branches check (from_branch_id <> to_branch_id),
  constraint inventory_stock_transfer_company_number_key unique(company_id,transfer_number)
);
create index if not exists inventory_stock_transfer_company_created_idx on public.inventory_stock_transfer(company_id,created_at desc);
create index if not exists inventory_stock_transfer_from_branch_idx on public.inventory_stock_transfer(from_branch_id,created_at desc);
create index if not exists inventory_stock_transfer_to_branch_idx on public.inventory_stock_transfer(to_branch_id,created_at desc);
alter table public.inventory_stock_transfer enable row level security;
revoke all on public.inventory_stock_transfer from public,anon,authenticated;

create table if not exists public.inventory_stock_transfer_item (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  transfer_id uuid not null references public.inventory_stock_transfer(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_item(id),
  quantity integer not null check (quantity > 0),
  unit_cost_snapshot numeric(18,6) not null default 0 check (unit_cost_snapshot >= 0),
  total_cost_snapshot numeric(18,2) not null default 0 check (total_cost_snapshot >= 0),
  created_at timestamptz not null default now(),
  constraint inventory_stock_transfer_item_unique unique(transfer_id,inventory_item_id)
);
create index if not exists inventory_stock_transfer_item_item_idx on public.inventory_stock_transfer_item(company_id,inventory_item_id);
alter table public.inventory_stock_transfer_item enable row level security;
revoke all on public.inventory_stock_transfer_item from public,anon,authenticated;

create table if not exists public.inventory_stock_count_sequence (
  company_id uuid primary key references public.company(id) on delete cascade,
  last_value bigint not null default 0 check (last_value >= 0),
  updated_at timestamptz not null default now()
);
alter table public.inventory_stock_count_sequence enable row level security;
revoke all on public.inventory_stock_count_sequence from public,anon,authenticated;

create table if not exists public.inventory_stock_count (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid not null references public.branch(id),
  count_number text not null,
  status text not null default 'submitted' check (status in ('submitted','applied','rejected')),
  counted_by uuid,
  approved_by uuid,
  submitted_at timestamptz not null default now(),
  approved_at timestamptz,
  notes text,
  approval_notes text,
  journal_entry_id uuid references public.journal_entry(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_stock_count_company_number_key unique(company_id,count_number)
);
create index if not exists inventory_stock_count_company_created_idx on public.inventory_stock_count(company_id,created_at desc);
create index if not exists inventory_stock_count_branch_idx on public.inventory_stock_count(branch_id,created_at desc);
alter table public.inventory_stock_count enable row level security;
revoke all on public.inventory_stock_count from public,anon,authenticated;

create table if not exists public.inventory_stock_count_item (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  stock_count_id uuid not null references public.inventory_stock_count(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_item(id),
  system_quantity integer not null,
  counted_quantity integer not null check (counted_quantity >= 0),
  variance integer not null,
  unit_cost_snapshot numeric(18,6) not null default 0 check (unit_cost_snapshot >= 0),
  value_variance numeric(18,2) not null default 0,
  created_at timestamptz not null default now(),
  constraint inventory_stock_count_item_unique unique(stock_count_id,inventory_item_id)
);
create index if not exists inventory_stock_count_item_item_idx on public.inventory_stock_count_item(company_id,inventory_item_id);
alter table public.inventory_stock_count_item enable row level security;
revoke all on public.inventory_stock_count_item from public,anon,authenticated;

create table if not exists public.inventory_scan_event (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid references public.branch(id),
  inventory_item_id uuid references public.inventory_item(id),
  scanned_by uuid,
  scan_code text not null,
  scan_action text not null check (scan_action in ('lookup','receive','transfer','stock_count','issue','sale','return')),
  device_type text not null default 'unknown' check (device_type in ('iphone_camera','mobile_camera','usb_scanner','bluetooth_scanner','keyboard','unknown')),
  outcome text not null default 'matched' check (outcome in ('matched','not_found','completed','rejected')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists inventory_scan_event_company_created_idx on public.inventory_scan_event(company_id,created_at desc);
create index if not exists inventory_scan_event_item_idx on public.inventory_scan_event(company_id,inventory_item_id,created_at desc);
alter table public.inventory_scan_event enable row level security;
revoke all on public.inventory_scan_event from public,anon,authenticated;

create or replace function public.generate_inventory_transfer_number(p_company_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare v_next bigint;
begin
  insert into public.inventory_transfer_sequence(company_id,last_value,updated_at)
  values(p_company_id,1,now())
  on conflict(company_id) do update set last_value=public.inventory_transfer_sequence.last_value+1,updated_at=now()
  returning last_value into v_next;
  return 'TRF-'||to_char(now(),'YYYYMM')||'-'||lpad(v_next::text,6,'0');
end;$$;

create or replace function public.generate_inventory_stock_count_number(p_company_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare v_next bigint;
begin
  insert into public.inventory_stock_count_sequence(company_id,last_value,updated_at)
  values(p_company_id,1,now())
  on conflict(company_id) do update set last_value=public.inventory_stock_count_sequence.last_value+1,updated_at=now()
  returning last_value into v_next;
  return 'CNT-'||to_char(now(),'YYYYMM')||'-'||lpad(v_next::text,6,'0');
end;$$;

create or replace function public.record_inventory_scan_event(
  p_code text,
  p_action text default 'lookup',
  p_branch_id uuid default null,
  p_device_type text default 'unknown',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_company_id uuid; v_item_id uuid; v_code text; v_action text; v_device text; v_event_id uuid; v_outcome text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('inventory.view') then raise exception 'Permission denied: inventory.view'; end if;
  v_company_id:=public.current_company_id();
  v_code:=btrim(coalesce(p_code,''));
  if v_code='' then raise exception 'Scan code is required.'; end if;
  v_action:=lower(btrim(coalesce(p_action,'lookup')));
  if v_action not in ('lookup','receive','transfer','stock_count','issue','sale','return') then raise exception 'Unsupported scan action.'; end if;
  v_device:=lower(btrim(coalesce(p_device_type,'unknown')));
  if v_device not in ('iphone_camera','mobile_camera','usb_scanner','bluetooth_scanner','keyboard','unknown') then v_device:='unknown'; end if;
  if p_branch_id is not null and not exists(select 1 from public.branch b where b.id=p_branch_id and b.company_id=v_company_id) then raise exception 'Branch could not be found.'; end if;
  select i.id into v_item_id from public.inventory_item i
  where i.company_id=v_company_id and i.is_active=true and (i.barcode=v_code or lower(i.sku)=lower(v_code))
  order by case when i.barcode=v_code then 0 else 1 end limit 1;
  v_outcome:=case when v_item_id is null then 'not_found' else 'matched' end;
  insert into public.inventory_scan_event(company_id,branch_id,inventory_item_id,scanned_by,scan_code,scan_action,device_type,outcome,metadata)
  values(v_company_id,p_branch_id,v_item_id,auth.uid(),v_code,v_action,v_device,v_outcome,coalesce(p_metadata,'{}'::jsonb)) returning id into v_event_id;
  return jsonb_build_object('ok',v_item_id is not null,'event_id',v_event_id,'inventory_item_id',v_item_id,'outcome',v_outcome,'code',v_code);
end;$$;

create or replace function public.complete_inventory_stock_transfer(
  p_from_branch_id uuid,
  p_to_branch_id uuid,
  p_items jsonb,
  p_notes text default null
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_company_id uuid; v_transfer_id uuid:=gen_random_uuid(); v_transfer_number text; v_item jsonb;
  v_inventory_item public.inventory_item%rowtype; v_source_stock public.branch_stock%rowtype; v_source_cost public.inventory_cost_balance%rowtype; v_dest_cost public.inventory_cost_balance%rowtype;
  v_qty integer; v_unit_cost numeric(18,6); v_total_cost numeric(18,2); v_source_new_qty numeric(18,3); v_source_new_total numeric(18,2); v_dest_new_qty numeric(18,3); v_dest_new_total numeric(18,2); v_count integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('inventory.stock.adjust') then raise exception 'Permission denied: inventory.stock.adjust'; end if;
  v_company_id:=public.current_company_id();
  if p_from_branch_id is null or p_to_branch_id is null or p_from_branch_id=p_to_branch_id then raise exception 'Choose two different branches.'; end if;
  if not exists(select 1 from public.branch b where b.id=p_from_branch_id and b.company_id=v_company_id) then raise exception 'Source branch could not be found.'; end if;
  if not exists(select 1 from public.branch b where b.id=p_to_branch_id and b.company_id=v_company_id) then raise exception 'Destination branch could not be found.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Transfer must contain at least one item.'; end if;
  v_transfer_number:=public.generate_inventory_transfer_number(v_company_id);
  insert into public.inventory_stock_transfer(id,company_id,transfer_number,from_branch_id,to_branch_id,status,initiated_by,completed_by,notes,metadata)
  values(v_transfer_id,v_company_id,v_transfer_number,p_from_branch_id,p_to_branch_id,'completed',auth.uid(),auth.uid(),nullif(btrim(coalesce(p_notes,'')),''),jsonb_build_object('item_count',jsonb_array_length(p_items)));

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_count:=v_count+1;
    select * into v_inventory_item from public.inventory_item where id=nullif(v_item->>'inventory_item_id','')::uuid and company_id=v_company_id and is_active=true;
    if not found then raise exception 'One or more transfer items could not be found.'; end if;
    v_qty:=coalesce(nullif(v_item->>'quantity','')::integer,0);
    if v_qty<=0 then raise exception 'Transfer quantity must be greater than zero for %.',v_inventory_item.item_name; end if;

    select * into v_source_stock from public.branch_stock where company_id=v_company_id and branch_id=p_from_branch_id and inventory_item_id=v_inventory_item.id for update;
    if not found or v_source_stock.quantity<v_qty then raise exception 'Insufficient source stock for %. Available: %, requested: %.',v_inventory_item.item_name,coalesce(v_source_stock.quantity,0),v_qty; end if;
    select * into v_source_cost from public.inventory_cost_balance where company_id=v_company_id and branch_id=p_from_branch_id and inventory_item_id=v_inventory_item.id for update;
    if not found or v_source_cost.quantity_on_hand<v_qty then raise exception 'Inventory cost balance is insufficient for %.',v_inventory_item.item_name; end if;

    v_unit_cost:=round(coalesce(v_source_cost.average_unit_cost,0),6);
    v_total_cost:=round(v_unit_cost*v_qty,2);
    v_source_new_qty:=round(v_source_cost.quantity_on_hand-v_qty,3);
    v_source_new_total:=case when v_source_new_qty=0 then 0 else round(greatest(v_source_cost.total_cost-v_total_cost,0),2) end;

    update public.branch_stock set quantity=quantity-v_qty,updated_at=now() where id=v_source_stock.id;
    update public.inventory_cost_balance set quantity_on_hand=v_source_new_qty,total_cost=v_source_new_total,average_unit_cost=case when v_source_new_qty=0 then 0 else round(v_source_new_total/v_source_new_qty,6) end,last_movement_at=now(),updated_at=now() where id=v_source_cost.id;

    insert into public.branch_stock(company_id,branch_id,inventory_item_id,quantity,updated_at)
    values(v_company_id,p_to_branch_id,v_inventory_item.id,v_qty,now())
    on conflict(branch_id,inventory_item_id) do update set quantity=public.branch_stock.quantity+excluded.quantity,updated_at=now();

    insert into public.inventory_cost_balance(company_id,branch_id,inventory_item_id,quantity_on_hand,total_cost,average_unit_cost,last_movement_at,updated_at)
    values(v_company_id,p_to_branch_id,v_inventory_item.id,v_qty,v_total_cost,case when v_qty=0 then 0 else round(v_total_cost/v_qty,6) end,now(),now())
    on conflict(company_id,branch_id,inventory_item_id) do nothing;
    select * into v_dest_cost from public.inventory_cost_balance where company_id=v_company_id and branch_id=p_to_branch_id and inventory_item_id=v_inventory_item.id for update;
    if v_dest_cost.quantity_on_hand<>v_qty or v_dest_cost.total_cost<>v_total_cost or v_dest_cost.created_at < now()-interval '1 second' then
      -- Existing destination balance: add transfer cost. For a freshly inserted row, values already include this transfer.
      if not (v_dest_cost.quantity_on_hand=v_qty and v_dest_cost.total_cost=v_total_cost and v_dest_cost.last_movement_at >= now()-interval '2 seconds') then
        v_dest_new_qty:=round(v_dest_cost.quantity_on_hand+v_qty,3);
        v_dest_new_total:=round(v_dest_cost.total_cost+v_total_cost,2);
        update public.inventory_cost_balance set quantity_on_hand=v_dest_new_qty,total_cost=v_dest_new_total,average_unit_cost=case when v_dest_new_qty=0 then 0 else round(v_dest_new_total/v_dest_new_qty,6) end,last_movement_at=now(),updated_at=now() where id=v_dest_cost.id;
      end if;
    end if;

    insert into public.inventory_stock_transfer_item(company_id,transfer_id,inventory_item_id,quantity,unit_cost_snapshot,total_cost_snapshot)
    values(v_company_id,v_transfer_id,v_inventory_item.id,v_qty,v_unit_cost,v_total_cost);
    insert into public.stock_movement(company_id,branch_id,inventory_item_id,user_id,movement_type,quantity,reference,notes)
    values
      (v_company_id,p_from_branch_id,v_inventory_item.id,auth.uid(),'transfer_out',v_qty,v_transfer_number,'Stock transfer to branch '||p_to_branch_id::text),
      (v_company_id,p_to_branch_id,v_inventory_item.id,auth.uid(),'transfer_in',v_qty,v_transfer_number,'Stock transfer from branch '||p_from_branch_id::text);
    insert into public.inventory_cost_movement(company_id,branch_id,inventory_item_id,movement_type,quantity,unit_cost,total_cost,movement_date,source_type,source_id,metadata,created_by)
    values
      (v_company_id,p_from_branch_id,v_inventory_item.id,'transfer_out',v_qty,v_unit_cost,v_total_cost,current_date,'stock_transfer',v_transfer_id,jsonb_build_object('transfer_number',v_transfer_number,'to_branch_id',p_to_branch_id),auth.uid()),
      (v_company_id,p_to_branch_id,v_inventory_item.id,'transfer_in',v_qty,v_unit_cost,v_total_cost,current_date,'stock_transfer',v_transfer_id,jsonb_build_object('transfer_number',v_transfer_number,'from_branch_id',p_from_branch_id),auth.uid());
  end loop;

  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'inventory_stock_transfer_completed','inventory',v_transfer_id,'Inventory stock transfer completed.',jsonb_build_object('transfer_number',v_transfer_number,'from_branch_id',p_from_branch_id,'to_branch_id',p_to_branch_id,'item_count',v_count));
  return jsonb_build_object('ok',true,'transfer_id',v_transfer_id,'transfer_number',v_transfer_number,'item_count',v_count,'message','Stock transfer completed. Quantity and weighted-average cost moved between branches without changing total company inventory value.');
end;$$;

create or replace function public.submit_inventory_stock_count(
  p_branch_id uuid,
  p_items jsonb,
  p_notes text default null
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_company_id uuid; v_count_id uuid:=gen_random_uuid(); v_count_number text; v_item jsonb; v_inventory public.inventory_item%rowtype;
  v_system_qty integer; v_counted_qty integer; v_variance integer; v_unit_cost numeric(18,6); v_value_variance numeric(18,2); v_items_count integer:=0; v_variance_count integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('inventory.stock.adjust') then raise exception 'Permission denied: inventory.stock.adjust'; end if;
  v_company_id:=public.current_company_id();
  if not exists(select 1 from public.branch b where b.id=p_branch_id and b.company_id=v_company_id) then raise exception 'Branch could not be found.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Stock count must contain at least one item.'; end if;
  v_count_number:=public.generate_inventory_stock_count_number(v_company_id);
  insert into public.inventory_stock_count(id,company_id,branch_id,count_number,status,counted_by,notes,metadata)
  values(v_count_id,v_company_id,p_branch_id,v_count_number,'submitted',auth.uid(),nullif(btrim(coalesce(p_notes,'')),''),jsonb_build_object('item_count',jsonb_array_length(p_items)));

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_items_count:=v_items_count+1;
    select * into v_inventory from public.inventory_item where id=nullif(v_item->>'inventory_item_id','')::uuid and company_id=v_company_id and is_active=true;
    if not found then raise exception 'One or more counted items could not be found.'; end if;
    v_counted_qty:=coalesce(nullif(v_item->>'counted_quantity','')::integer,-1);
    if v_counted_qty<0 then raise exception 'Counted quantity cannot be negative for %.',v_inventory.item_name; end if;
    select coalesce(bs.quantity,0) into v_system_qty from public.branch_stock bs where bs.company_id=v_company_id and bs.branch_id=p_branch_id and bs.inventory_item_id=v_inventory.id;
    if not found then v_system_qty:=0; end if;
    select coalesce(icb.average_unit_cost,v_inventory.cost_price,0) into v_unit_cost from public.inventory_cost_balance icb where icb.company_id=v_company_id and icb.branch_id=p_branch_id and icb.inventory_item_id=v_inventory.id;
    if not found then v_unit_cost:=coalesce(v_inventory.cost_price,0); end if;
    v_variance:=v_counted_qty-v_system_qty;
    v_value_variance:=round(v_variance*v_unit_cost,2);
    if v_variance<>0 then v_variance_count:=v_variance_count+1; end if;
    insert into public.inventory_stock_count_item(company_id,stock_count_id,inventory_item_id,system_quantity,counted_quantity,variance,unit_cost_snapshot,value_variance)
    values(v_company_id,v_count_id,v_inventory.id,v_system_qty,v_counted_qty,v_variance,v_unit_cost,v_value_variance);
  end loop;

  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'inventory_stock_count_submitted','inventory',v_count_id,'Physical inventory stock count submitted for review.',jsonb_build_object('count_number',v_count_number,'branch_id',p_branch_id,'item_count',v_items_count,'variance_count',v_variance_count));
  return jsonb_build_object('ok',true,'stock_count_id',v_count_id,'count_number',v_count_number,'item_count',v_items_count,'variance_count',v_variance_count,'status','submitted','message','Stock count captured. A manager/owner must apply variances.');
end;$$;

create or replace function public.apply_inventory_stock_count(
  p_stock_count_id uuid,
  p_approval_notes text default null
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_company_id uuid; v_count public.inventory_stock_count%rowtype; v_line record; v_current_qty integer; v_cost public.inventory_cost_balance%rowtype; v_item public.inventory_item%rowtype;
  v_unit_cost numeric(18,6); v_value numeric(18,2); v_new_qty numeric(18,3); v_new_total numeric(18,2); v_lines jsonb:='[]'::jsonb; v_journal_id uuid; v_inventory_account uuid; v_gain_account uuid; v_loss_account uuid; v_currency text:='ZAR'; v_applied integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('inventory.update') then raise exception 'Permission denied: inventory.update'; end if;
  v_company_id:=public.current_company_id();
  select * into v_count from public.inventory_stock_count where id=p_stock_count_id and company_id=v_company_id for update;
  if not found then raise exception 'Stock count could not be found.'; end if;
  if v_count.status<>'submitted' then raise exception 'Only submitted stock counts can be applied.'; end if;

  perform public.ensure_accounting_posting_profile(v_company_id);
  select inventory_account_id into v_inventory_account from public.accounting_posting_profile where company_id=v_company_id;
  if v_inventory_account is null then raise exception 'Inventory accounting account is not configured.'; end if;
  select coalesce(base_currency,'ZAR') into v_currency from public.company_finance_settings where company_id=v_company_id;

  select id into v_gain_account from public.accounting_account where company_id=v_company_id and system_key='inventory_count_gain' and is_active=true limit 1;
  if v_gain_account is null then
    insert into public.accounting_account(company_id,code,name,description,account_type,account_subtype,normal_balance,system_key,is_system,allow_manual_posting,is_active,created_by)
    values(v_company_id,'4250','Inventory Count Gains','Inventory value discovered through approved physical stock counts.','revenue','other_income','credit','inventory_count_gain',true,false,true,auth.uid()) on conflict do nothing;
    select id into v_gain_account from public.accounting_account where company_id=v_company_id and system_key='inventory_count_gain' limit 1;
    if v_gain_account is null then select id into v_gain_account from public.accounting_account where company_id=v_company_id and system_key='other_income' limit 1; end if;
  end if;
  select id into v_loss_account from public.accounting_account where company_id=v_company_id and system_key='inventory_count_loss' and is_active=true limit 1;
  if v_loss_account is null then
    insert into public.accounting_account(company_id,code,name,description,account_type,account_subtype,normal_balance,system_key,is_system,allow_manual_posting,is_active,created_by)
    values(v_company_id,'5950','Inventory Shrinkage and Count Losses','Inventory shortages discovered through approved physical stock counts.','expense','inventory_shrinkage','debit','inventory_count_loss',true,false,true,auth.uid()) on conflict do nothing;
    select id into v_loss_account from public.accounting_account where company_id=v_company_id and system_key='inventory_count_loss' limit 1;
    if v_loss_account is null then select id into v_loss_account from public.accounting_account where company_id=v_company_id and system_key='general_expense' limit 1; end if;
  end if;
  if v_gain_account is null or v_loss_account is null then raise exception 'Inventory count gain/loss accounts could not be resolved.'; end if;

  for v_line in select sci.* from public.inventory_stock_count_item sci where sci.stock_count_id=v_count.id and sci.company_id=v_company_id order by sci.created_at,sci.id
  loop
    if v_line.variance=0 then continue; end if;
    select * into v_item from public.inventory_item where id=v_line.inventory_item_id and company_id=v_company_id;
    select coalesce(bs.quantity,0) into v_current_qty from public.branch_stock bs where bs.company_id=v_company_id and bs.branch_id=v_count.branch_id and bs.inventory_item_id=v_line.inventory_item_id;
    if not found then v_current_qty:=0; end if;
    if v_current_qty<>v_line.system_quantity then raise exception 'Stock changed after count submission for %. Expected snapshot %, current %. Recount before applying.',v_item.item_name,v_line.system_quantity,v_current_qty; end if;

    insert into public.branch_stock(company_id,branch_id,inventory_item_id,quantity,updated_at)
    values(v_company_id,v_count.branch_id,v_line.inventory_item_id,v_line.counted_quantity,now())
    on conflict(branch_id,inventory_item_id) do update set quantity=excluded.quantity,updated_at=now();

    insert into public.inventory_cost_balance(company_id,branch_id,inventory_item_id,quantity_on_hand,total_cost,average_unit_cost,last_movement_at,updated_at)
    values(v_company_id,v_count.branch_id,v_line.inventory_item_id,0,0,0,now(),now())
    on conflict(company_id,branch_id,inventory_item_id) do nothing;
    select * into v_cost from public.inventory_cost_balance where company_id=v_company_id and branch_id=v_count.branch_id and inventory_item_id=v_line.inventory_item_id for update;
    v_unit_cost:=case when coalesce(v_cost.average_unit_cost,0)>0 then v_cost.average_unit_cost else coalesce(v_line.unit_cost_snapshot,v_item.cost_price,0) end;
    v_value:=round(abs(v_line.variance)*v_unit_cost,2);

    if v_line.variance<0 then
      if v_cost.quantity_on_hand<abs(v_line.variance) then raise exception 'Cost balance is insufficient to apply shortage for %.',v_item.item_name; end if;
      v_new_qty:=round(v_cost.quantity_on_hand-abs(v_line.variance),3);
      v_new_total:=case when v_new_qty=0 then 0 else round(greatest(v_cost.total_cost-v_value,0),2) end;
      update public.inventory_cost_balance set quantity_on_hand=v_new_qty,total_cost=v_new_total,average_unit_cost=case when v_new_qty=0 then 0 else round(v_new_total/v_new_qty,6) end,last_movement_at=now(),updated_at=now() where id=v_cost.id;
      insert into public.stock_movement(company_id,branch_id,inventory_item_id,user_id,movement_type,quantity,reference,notes)
      values(v_company_id,v_count.branch_id,v_line.inventory_item_id,auth.uid(),'adjustment_out',abs(v_line.variance),v_count.count_number,'Approved physical stock count shortage');
      insert into public.inventory_cost_movement(company_id,branch_id,inventory_item_id,movement_type,quantity,unit_cost,total_cost,movement_date,source_type,source_id,metadata,created_by)
      values(v_company_id,v_count.branch_id,v_line.inventory_item_id,'adjustment_out',abs(v_line.variance),v_unit_cost,v_value,current_date,'stock_count',v_count.id,jsonb_build_object('count_number',v_count.count_number,'variance',v_line.variance),auth.uid());
      v_lines:=v_lines||jsonb_build_array(
        jsonb_build_object('account_id',v_loss_account,'description','Inventory count shortage · '||v_item.item_name,'debit',v_value,'credit',0,'metadata',jsonb_build_object('role','inventory_count_loss')),
        jsonb_build_object('account_id',v_inventory_account,'description','Inventory reduction · '||v_item.item_name,'debit',0,'credit',v_value,'metadata',jsonb_build_object('role','inventory'))
      );
    else
      v_new_qty:=round(v_cost.quantity_on_hand+v_line.variance,3);
      v_new_total:=round(v_cost.total_cost+v_value,2);
      update public.inventory_cost_balance set quantity_on_hand=v_new_qty,total_cost=v_new_total,average_unit_cost=case when v_new_qty=0 then 0 else round(v_new_total/v_new_qty,6) end,last_movement_at=now(),updated_at=now() where id=v_cost.id;
      insert into public.stock_movement(company_id,branch_id,inventory_item_id,user_id,movement_type,quantity,reference,notes)
      values(v_company_id,v_count.branch_id,v_line.inventory_item_id,auth.uid(),'adjustment_in',v_line.variance,v_count.count_number,'Approved physical stock count gain');
      insert into public.inventory_cost_movement(company_id,branch_id,inventory_item_id,movement_type,quantity,unit_cost,total_cost,movement_date,source_type,source_id,metadata,created_by)
      values(v_company_id,v_count.branch_id,v_line.inventory_item_id,'adjustment_in',v_line.variance,v_unit_cost,v_value,current_date,'stock_count',v_count.id,jsonb_build_object('count_number',v_count.count_number,'variance',v_line.variance),auth.uid());
      v_lines:=v_lines||jsonb_build_array(
        jsonb_build_object('account_id',v_inventory_account,'description','Inventory increase · '||v_item.item_name,'debit',v_value,'credit',0,'metadata',jsonb_build_object('role','inventory')),
        jsonb_build_object('account_id',v_gain_account,'description','Inventory count gain · '||v_item.item_name,'debit',0,'credit',v_value,'metadata',jsonb_build_object('role','inventory_count_gain'))
      );
    end if;
    v_applied:=v_applied+1;
  end loop;

  if jsonb_array_length(v_lines)>0 then
    v_journal_id:=public.create_automatic_accounting_journal(v_company_id,v_count.branch_id,current_date,'Physical inventory stock count · '||v_count.count_number,v_count.count_number,'adjustment',v_count.id,'stock_count',v_currency,auth.uid(),v_lines,null);
    update public.inventory_cost_movement set journal_entry_id=v_journal_id where company_id=v_company_id and source_type='stock_count' and source_id=v_count.id;
  end if;

  update public.inventory_stock_count set status='applied',approved_by=auth.uid(),approved_at=now(),approval_notes=nullif(btrim(coalesce(p_approval_notes,'')),''),journal_entry_id=v_journal_id,updated_at=now() where id=v_count.id;
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'inventory_stock_count_applied','inventory',v_count.id,'Physical stock count variances applied.',jsonb_build_object('count_number',v_count.count_number,'adjusted_lines',v_applied,'journal_entry_id',v_journal_id));
  return jsonb_build_object('ok',true,'stock_count_id',v_count.id,'count_number',v_count.count_number,'adjusted_lines',v_applied,'journal_entry_id',v_journal_id,'status','applied','message','Stock count approved and inventory/accounting variances applied.');
end;$$;

create or replace function public.get_inventory_tracking_workspace(p_branch_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_company_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('inventory.view') then raise exception 'Permission denied: inventory.view'; end if;
  v_company_id:=public.current_company_id();
  return jsonb_build_object(
    'ok',true,
    'branches',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.branch_name) order by b.branch_name) from public.branch b where b.company_id=v_company_id),'[]'::jsonb),
    'recent_transfers',coalesce((select jsonb_agg(x.obj order by x.completed_at desc) from (select t.completed_at,jsonb_build_object('id',t.id,'transfer_number',t.transfer_number,'from_branch',(select branch_name from public.branch where id=t.from_branch_id),'to_branch',(select branch_name from public.branch where id=t.to_branch_id),'status',t.status,'completed_at',t.completed_at,'item_count',(select count(*) from public.inventory_stock_transfer_item ti where ti.transfer_id=t.id)) obj from public.inventory_stock_transfer t where t.company_id=v_company_id and (p_branch_id is null or t.from_branch_id=p_branch_id or t.to_branch_id=p_branch_id) order by t.completed_at desc limit 30) x),'[]'::jsonb),
    'recent_counts',coalesce((select jsonb_agg(x.obj order by x.submitted_at desc) from (select c.submitted_at,jsonb_build_object('id',c.id,'count_number',c.count_number,'branch_name',(select branch_name from public.branch where id=c.branch_id),'status',c.status,'submitted_at',c.submitted_at,'variance_lines',(select count(*) from public.inventory_stock_count_item ci where ci.stock_count_id=c.id and ci.variance<>0),'can_apply',public.current_user_has_permission('inventory.update')) obj from public.inventory_stock_count c where c.company_id=v_company_id and (p_branch_id is null or c.branch_id=p_branch_id) order by c.submitted_at desc limit 30) x),'[]'::jsonb),
    'recent_scans',coalesce((select jsonb_agg(x.obj order by x.created_at desc) from (select s.created_at,jsonb_build_object('id',s.id,'scan_code',s.scan_code,'action',s.scan_action,'device_type',s.device_type,'outcome',s.outcome,'item_name',(select item_name from public.inventory_item where id=s.inventory_item_id),'branch_name',(select branch_name from public.branch where id=s.branch_id),'created_at',s.created_at) obj from public.inventory_scan_event s where s.company_id=v_company_id and (p_branch_id is null or s.branch_id=p_branch_id) order by s.created_at desc limit 50) x),'[]'::jsonb)
  );
end;$$;

revoke execute on function public.generate_inventory_transfer_number(uuid) from public,anon;
revoke execute on function public.generate_inventory_stock_count_number(uuid) from public,anon;
revoke execute on function public.record_inventory_scan_event(text,text,uuid,text,jsonb) from public,anon;
grant execute on function public.record_inventory_scan_event(text,text,uuid,text,jsonb) to authenticated;
revoke execute on function public.complete_inventory_stock_transfer(uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.complete_inventory_stock_transfer(uuid,uuid,jsonb,text) to authenticated;
revoke execute on function public.submit_inventory_stock_count(uuid,jsonb,text) from public,anon;
grant execute on function public.submit_inventory_stock_count(uuid,jsonb,text) to authenticated;
revoke execute on function public.apply_inventory_stock_count(uuid,text) from public,anon;
grant execute on function public.apply_inventory_stock_count(uuid,text) to authenticated;
revoke execute on function public.get_inventory_tracking_workspace(uuid) from public,anon;
grant execute on function public.get_inventory_tracking_workspace(uuid) to authenticated;;
