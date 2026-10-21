create or replace function public.adjust_inventory_stock_costed(p_branch_id uuid,p_item_id uuid,p_movement_type text,p_quantity integer,p_notes text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare company uuid:=public.current_company_id(); qty integer; costqty numeric; price numeric; result jsonb; enabled boolean;
begin
 if auth.uid() is null or not coalesce(public.current_user_has_permission('inventory.stock.adjust'),false) then raise exception 'Stock adjustment and inventory update permissions are required.'; end if;
 if p_quantity is null or p_quantity<=0 or p_movement_type is null or p_movement_type not in ('stock_in','stock_out','adjustment_in','adjustment_out','return') then raise exception 'Use stock adjustments for additions/removals; use Transfers for branch transfers.'; end if;
 if not exists(select 1 from public.branch where id=p_branch_id and company_id=company) then raise exception 'Branch not found.'; end if;
 select cost_price into price from public.inventory_item where id=p_item_id and company_id=company and is_active=true for update;
 if not found then raise exception 'Active product not found.'; end if;
 select coalesce(s.enabled,false) into enabled from public.company_inventory_costing_settings s where company_id=company;
 if coalesce(enabled,false) and not coalesce(public.current_user_has_permission('inventory.update'),false) then raise exception 'Inventory update permission is required for costed stock adjustments.'; end if;
 if coalesce(enabled,false) and coalesce(price,0)<=0 then raise exception 'Save a positive purchase cost before adding or adjusting this product.'; end if;
 insert into public.branch_stock(company_id,branch_id,inventory_item_id,quantity) values(company,p_branch_id,p_item_id,0) on conflict(branch_id,inventory_item_id) do nothing;
 select quantity into qty from public.branch_stock where company_id=company and branch_id=p_branch_id and inventory_item_id=p_item_id for update;
 if not coalesce(enabled,false) then
  qty:=qty+case when p_movement_type in ('stock_in','adjustment_in','return') then p_quantity else -p_quantity end;
  if qty<0 then raise exception 'Insufficient stock.'; end if;
  update public.branch_stock set quantity=qty,updated_at=now() where company_id=company and branch_id=p_branch_id and inventory_item_id=p_item_id;
  insert into public.stock_movement(company_id,branch_id,inventory_item_id,user_id,movement_type,quantity,notes) values(company,p_branch_id,p_item_id,auth.uid(),p_movement_type,p_quantity,p_notes);
  return jsonb_build_object('ok',true,'costing_enabled',false);
 end if;
 select quantity_on_hand into costqty from public.inventory_cost_balance where company_id=company and branch_id=p_branch_id and inventory_item_id=p_item_id for update;
 if qty<>coalesce(costqty,0) then raise exception 'Physical stock and costing differ. Reconcile this product before adjusting stock.'; end if;
 qty:=qty+case when p_movement_type in ('stock_in','adjustment_in','return') then p_quantity else -p_quantity end;
 if qty<0 then raise exception 'Insufficient stock.'; end if;
 result:=public.submit_inventory_stock_count(p_branch_id,jsonb_build_array(jsonb_build_object('inventory_item_id',p_item_id,'counted_quantity',qty)),concat('Manual ',p_movement_type,': ',left(coalesce(p_notes,''),1000)));
 update public.inventory_stock_count_item set unit_cost_snapshot=price,value_variance=round(variance*price,2) where stock_count_id=(result->>'stock_count_id')::uuid and company_id=company and coalesce(unit_cost_snapshot,0)<=0;
 return public.apply_inventory_stock_count((result->>'stock_count_id')::uuid,'Authorised manual stock adjustment with costing and accounting.');
end $$;
revoke all on function public.adjust_inventory_stock_costed(uuid,uuid,text,integer,text) from public,anon;
grant execute on function public.adjust_inventory_stock_costed(uuid,uuid,text,integer,text) to authenticated;
;
