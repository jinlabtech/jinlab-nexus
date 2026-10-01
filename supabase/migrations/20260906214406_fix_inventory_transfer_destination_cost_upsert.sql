create or replace function public.complete_inventory_stock_transfer(
  p_from_branch_id uuid,
  p_to_branch_id uuid,
  p_items jsonb,
  p_notes text default null
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_company_id uuid; v_transfer_id uuid:=gen_random_uuid(); v_transfer_number text; v_item jsonb;
  v_inventory_item public.inventory_item%rowtype; v_source_stock public.branch_stock%rowtype; v_source_cost public.inventory_cost_balance%rowtype;
  v_qty integer; v_unit_cost numeric(18,6); v_total_cost numeric(18,2); v_source_new_qty numeric(18,3); v_source_new_total numeric(18,2); v_count integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('inventory.stock.adjust') then raise exception 'Permission denied: inventory.stock.adjust'; end if;
  v_company_id:=public.current_company_id();
  if p_from_branch_id is null or p_to_branch_id is null or p_from_branch_id=p_to_branch_id then raise exception 'Choose two different branches.'; end if;
  if not exists(select 1 from public.branch b where b.id=p_from_branch_id and b.company_id=v_company_id) then raise exception 'Source branch could not be found.'; end if;
  if not exists(select 1 from public.branch b where b.id=p_to_branch_id and b.company_id=v_company_id) then raise exception 'Destination branch could not be found.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Transfer must contain at least one item.'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) e group by e->>'inventory_item_id' having count(*)>1) then raise exception 'Each inventory item may appear only once in a transfer.'; end if;

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
    values(v_company_id,p_to_branch_id,v_inventory_item.id,v_qty,v_total_cost,v_unit_cost,now(),now())
    on conflict(company_id,branch_id,inventory_item_id) do update set
      quantity_on_hand=public.inventory_cost_balance.quantity_on_hand+excluded.quantity_on_hand,
      total_cost=public.inventory_cost_balance.total_cost+excluded.total_cost,
      average_unit_cost=case
        when public.inventory_cost_balance.quantity_on_hand+excluded.quantity_on_hand=0 then 0
        else round((public.inventory_cost_balance.total_cost+excluded.total_cost)/(public.inventory_cost_balance.quantity_on_hand+excluded.quantity_on_hand),6)
      end,
      last_movement_at=now(),updated_at=now();

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

revoke execute on function public.complete_inventory_stock_transfer(uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.complete_inventory_stock_transfer(uuid,uuid,jsonb,text) to authenticated;;
