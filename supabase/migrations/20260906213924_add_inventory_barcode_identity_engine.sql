create table if not exists public.inventory_barcode_sequence (
  company_id uuid primary key references public.company(id) on delete cascade,
  last_value bigint not null default 0 check (last_value >= 0),
  updated_at timestamptz not null default now()
);
alter table public.inventory_barcode_sequence enable row level security;
revoke all on public.inventory_barcode_sequence from public, anon, authenticated;

create unique index if not exists inventory_item_company_barcode_unique
on public.inventory_item(company_id, barcode)
where barcode is not null and btrim(barcode) <> '';

create or replace function public.generate_inventory_barcode(p_inventory_item_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_company_id uuid;
  v_item public.inventory_item%rowtype;
  v_next bigint;
  v_barcode text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('inventory.update') then raise exception 'Permission denied: inventory.update'; end if;
  v_company_id:=public.current_company_id();
  if v_company_id is null then raise exception 'Company could not be resolved.'; end if;
  select * into v_item from public.inventory_item where id=p_inventory_item_id and company_id=v_company_id for update;
  if not found then raise exception 'Inventory item could not be found.'; end if;
  if nullif(btrim(coalesce(v_item.barcode,'')),'') is not null then
    return jsonb_build_object('ok',true,'inventory_item_id',v_item.id,'barcode',v_item.barcode,'generated',false,'message','Item already has a barcode.');
  end if;
  loop
    insert into public.inventory_barcode_sequence(company_id,last_value,updated_at)
    values(v_company_id,1,now())
    on conflict(company_id) do update set last_value=public.inventory_barcode_sequence.last_value+1,updated_at=now()
    returning last_value into v_next;
    v_barcode:='NX'||lpad(v_next::text,10,'0');
    exit when not exists(select 1 from public.inventory_item i where i.company_id=v_company_id and i.barcode=v_barcode);
  end loop;
  update public.inventory_item set barcode=v_barcode,updated_at=now() where id=v_item.id;
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'inventory_barcode_generated','inventory',v_item.id,'Nexus inventory barcode generated.',jsonb_build_object('barcode',v_barcode,'sku',v_item.sku,'item_name',v_item.item_name));
  return jsonb_build_object('ok',true,'inventory_item_id',v_item.id,'barcode',v_barcode,'generated',true,'message','Nexus barcode generated.');
end;$$;

create or replace function public.set_inventory_barcode(p_inventory_item_id uuid,p_barcode text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_company_id uuid;
  v_item public.inventory_item%rowtype;
  v_barcode text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('inventory.update') then raise exception 'Permission denied: inventory.update'; end if;
  v_company_id:=public.current_company_id();
  v_barcode:=nullif(btrim(coalesce(p_barcode,'')),'');
  if v_barcode is not null and (length(v_barcode)<3 or length(v_barcode)>128) then raise exception 'Barcode must contain between 3 and 128 characters.'; end if;
  select * into v_item from public.inventory_item where id=p_inventory_item_id and company_id=v_company_id for update;
  if not found then raise exception 'Inventory item could not be found.'; end if;
  if v_barcode is not null and exists(select 1 from public.inventory_item i where i.company_id=v_company_id and i.barcode=v_barcode and i.id<>v_item.id) then raise exception 'This barcode is already assigned to another inventory item.'; end if;
  update public.inventory_item set barcode=v_barcode,updated_at=now() where id=v_item.id;
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'inventory_barcode_changed','inventory',v_item.id,'Inventory barcode changed.',jsonb_build_object('old_barcode',v_item.barcode,'new_barcode',v_barcode,'sku',v_item.sku));
  return jsonb_build_object('ok',true,'inventory_item_id',v_item.id,'barcode',v_barcode,'message','Barcode saved.');
end;$$;

create or replace function public.get_inventory_barcode_workspace(p_branch_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_company_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('inventory.view') then raise exception 'Permission denied: inventory.view'; end if;
  v_company_id:=public.current_company_id();
  if p_branch_id is not null and not exists(select 1 from public.branch b where b.id=p_branch_id and b.company_id=v_company_id) then raise exception 'Branch could not be found.'; end if;
  return jsonb_build_object(
    'ok',true,'selected_branch_id',p_branch_id,
    'branches',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.branch_name) order by b.branch_name) from public.branch b where b.company_id=v_company_id),'[]'::jsonb),
    'summary',jsonb_build_object(
      'active_items',(select count(*) from public.inventory_item i where i.company_id=v_company_id and i.is_active=true),
      'with_barcode',(select count(*) from public.inventory_item i where i.company_id=v_company_id and i.is_active=true and nullif(btrim(coalesce(i.barcode,'')),'') is not null),
      'without_barcode',(select count(*) from public.inventory_item i where i.company_id=v_company_id and i.is_active=true and nullif(btrim(coalesce(i.barcode,'')),'') is null)
    )
  );
end;$$;

create or replace function public.search_inventory_barcodes(p_search text default null,p_branch_id uuid default null,p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_company_id uuid; v_search text; v_limit integer;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('inventory.view') then raise exception 'Permission denied: inventory.view'; end if;
  v_company_id:=public.current_company_id();
  v_search:=lower(btrim(coalesce(p_search,'')));
  v_limit:=greatest(1,least(coalesce(p_limit,100),250));
  return coalesce((select jsonb_agg(x.obj) from (
    select jsonb_build_object('id',i.id,'item_name',i.item_name,'sku',i.sku,'barcode',i.barcode,'selling_price',i.selling_price,'cost_price',i.cost_price,'minimum_stock',i.minimum_stock,'branch_quantity',coalesce(stock.quantity,0)) as obj
    from public.inventory_item i
    left join lateral (
      select coalesce(sum(bs.quantity),0) as quantity from public.branch_stock bs
      where bs.company_id=i.company_id and bs.inventory_item_id=i.id and (p_branch_id is null or bs.branch_id=p_branch_id)
    ) stock on true
    where i.company_id=v_company_id and i.is_active=true
      and (v_search='' or lower(i.item_name) like '%'||v_search||'%' or lower(i.sku) like '%'||v_search||'%' or lower(coalesce(i.barcode,'')) like '%'||v_search||'%')
    order by i.item_name,i.sku limit v_limit
  ) x),'[]'::jsonb);
end;$$;

create or replace function public.lookup_inventory_barcode(p_code text,p_branch_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_company_id uuid; v_code text; v_item public.inventory_item%rowtype; v_selected_quantity integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('inventory.view') then raise exception 'Permission denied: inventory.view'; end if;
  v_company_id:=public.current_company_id();
  v_code:=btrim(coalesce(p_code,''));
  if v_code='' then return jsonb_build_object('ok',false,'message','Scan or enter a barcode or SKU.'); end if;
  select * into v_item from public.inventory_item i
  where i.company_id=v_company_id and i.is_active=true and (i.barcode=v_code or lower(i.sku)=lower(v_code))
  order by case when i.barcode=v_code then 0 else 1 end limit 1;
  if not found then return jsonb_build_object('ok',false,'code',v_code,'message','No inventory item matches this barcode or SKU.'); end if;
  select coalesce(sum(bs.quantity),0)::integer into v_selected_quantity from public.branch_stock bs
  where bs.company_id=v_company_id and bs.inventory_item_id=v_item.id and (p_branch_id is null or bs.branch_id=p_branch_id);
  return jsonb_build_object(
    'ok',true,
    'item',jsonb_build_object('id',v_item.id,'item_name',v_item.item_name,'sku',v_item.sku,'barcode',v_item.barcode,'selling_price',v_item.selling_price,'cost_price',v_item.cost_price,'minimum_stock',v_item.minimum_stock,'quantity',v_selected_quantity),
    'stock_by_branch',coalesce((select jsonb_agg(jsonb_build_object('branch_id',b.id,'branch_name',b.branch_name,'quantity',coalesce(bs.quantity,0)) order by b.branch_name)
      from public.branch b left join public.branch_stock bs on bs.branch_id=b.id and bs.company_id=b.company_id and bs.inventory_item_id=v_item.id
      where b.company_id=v_company_id),'[]'::jsonb)
  );
end;$$;

create or replace function public.get_inventory_barcode_labels(p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_company_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('inventory.view') then raise exception 'Permission denied: inventory.view'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Label items must be an array.'; end if;
  v_company_id:=public.current_company_id();
  return coalesce((select jsonb_agg(x.obj order by x.position) from (
    select e.position,
      jsonb_build_object('id',i.id,'item_name',i.item_name,'sku',i.sku,'barcode',i.barcode,'selling_price',i.selling_price,
        'copies',greatest(1,least(coalesce(nullif(e.item->>'copies','')::integer,1),999))) as obj
    from jsonb_array_elements(p_items) with ordinality as e(item,position)
    join public.inventory_item i on i.id=nullif(e.item->>'inventory_item_id','')::uuid and i.company_id=v_company_id and i.is_active=true
    where nullif(btrim(coalesce(i.barcode,'')),'') is not null
  ) x),'[]'::jsonb);
end;$$;

revoke execute on function public.generate_inventory_barcode(uuid) from public,anon;
grant execute on function public.generate_inventory_barcode(uuid) to authenticated;
revoke execute on function public.set_inventory_barcode(uuid,text) from public,anon;
grant execute on function public.set_inventory_barcode(uuid,text) to authenticated;
revoke execute on function public.get_inventory_barcode_workspace(uuid) from public,anon;
grant execute on function public.get_inventory_barcode_workspace(uuid) to authenticated;
revoke execute on function public.search_inventory_barcodes(text,uuid,integer) from public,anon;
grant execute on function public.search_inventory_barcodes(text,uuid,integer) to authenticated;
revoke execute on function public.lookup_inventory_barcode(text,uuid) from public,anon;
grant execute on function public.lookup_inventory_barcode(text,uuid) to authenticated;
revoke execute on function public.get_inventory_barcode_labels(jsonb) from public,anon;
grant execute on function public.get_inventory_barcode_labels(jsonb) to authenticated;;
