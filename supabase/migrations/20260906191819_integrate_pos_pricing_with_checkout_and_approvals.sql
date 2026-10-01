alter table public.pos_sale_item
  add column if not exists automatic_unit_price numeric(14,2),
  add column if not exists price_source text,
  add column if not exists price_book_id uuid references public.pos_price_book(id) on delete set null,
  add column if not exists promotion_id uuid references public.pos_promotion(id) on delete set null,
  add column if not exists price_book_name text,
  add column if not exists promotion_name text;

alter table public.pos_approval_request
  add column if not exists pricing_context jsonb not null default '[]'::jsonb;

create or replace function public.build_pos_pricing_context(
  p_company_id uuid,
  p_branch_id uuid,
  p_customer_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item jsonb;
  v_result jsonb := '[]'::jsonb;
  v_price jsonb;
  v_inventory_id uuid;
  v_qty numeric;
begin
  if p_items is null or jsonb_typeof(p_items)<>'array' then
    raise exception 'Pricing context items must be an array.';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
    order by (value->>'inventory_item_id'), coalesce((value->>'quantity')::numeric,0)
  loop
    v_inventory_id := (v_item->>'inventory_item_id')::uuid;
    v_qty := coalesce(nullif(v_item->>'quantity','')::numeric,0);
    v_price := public.resolve_pos_pricing(
      p_company_id,p_branch_id,p_customer_id,v_inventory_id,v_qty,now()
    );

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'inventory_item_id',v_inventory_id,
      'quantity',v_qty,
      'automatic_unit_price',(v_price->>'final_unit_price')::numeric,
      'price_source',v_price->>'price_source',
      'price_book_id',v_price->>'price_book_id',
      'promotion_id',v_price->>'promotion_id'
    ));
  end loop;

  return v_result;
end;
$function$;

revoke all on function public.build_pos_pricing_context(uuid,uuid,uuid,jsonb) from public, anon, authenticated;

do $patch$
declare
  v_oid oid;
  v_def text;
  v_old text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='request_pos_approval'
  order by p.oid desc limit 1;

  if v_oid is null then raise exception 'request_pos_approval not found'; end if;
  select pg_get_functiondef(v_oid) into v_def;

  v_old := '  v_item jsonb;' || chr(10);
  v_new := '  v_item jsonb;' || chr(10) || '  v_pricing jsonb;' || chr(10);
  if position(v_old in v_def)=0 then raise exception 'request approval declaration patch anchor not found'; end if;
  v_def := replace(v_def,v_old,v_new);

  v_old := '    v_line_base:=round(v_inventory.selling_price*v_qty,2);';
  v_new := '    v_pricing:=public.resolve_pos_pricing(v_company_id,p_branch_id,nullif(p_customer_id,''00000000-0000-0000-0000-000000000000''::uuid),v_inventory.id,v_qty,now());' || chr(10) ||
           '    v_line_base:=round(((v_pricing->>''final_unit_price'')::numeric)*v_qty,2);';
  if position(v_old in v_def)=0 then raise exception 'request approval pricing anchor not found'; end if;
  v_def := replace(v_def,v_old,v_new);

  v_old := '    requested_max_discount_pct,requested_discount_amount,cart_snapshot,expires_at' || chr(10) ||
           '  ) values(' || chr(10) ||
           '    v_company_id,p_branch_id,v_request_type,''pending'',v_required_level,auth.uid(),v_reason,' || chr(10) ||
           '    v_max_pct,v_total_discount,public.normalize_pos_approval_items(p_items),now()+interval ''15 minutes''';
  v_new := '    requested_max_discount_pct,requested_discount_amount,cart_snapshot,pricing_context,expires_at' || chr(10) ||
           '  ) values(' || chr(10) ||
           '    v_company_id,p_branch_id,v_request_type,''pending'',v_required_level,auth.uid(),v_reason,' || chr(10) ||
           '    v_max_pct,v_total_discount,public.normalize_pos_approval_items(p_items),public.build_pos_pricing_context(v_company_id,p_branch_id,p_customer_id,p_items),now()+interval ''15 minutes''';
  if position(v_old in v_def)=0 then raise exception 'request approval insert patch anchor not found'; end if;
  v_def := replace(v_def,v_old,v_new);

  execute v_def;
end;
$patch$;

do $patch$
declare
  v_oid oid;
  v_def text;
  v_old text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='checkout_pos_sale'
  order by p.oid desc limit 1;

  if v_oid is null then raise exception 'checkout_pos_sale not found'; end if;
  select pg_get_functiondef(v_oid) into v_def;

  v_old := '  v_catalogue_price numeric(14,2);' || chr(10);
  v_new := '  v_catalogue_price numeric(14,2);' || chr(10) ||
           '  v_pricing jsonb;' || chr(10) ||
           '  v_auto_price numeric(14,2);' || chr(10);
  if position(v_old in v_def)=0 then raise exception 'checkout declaration patch anchor not found'; end if;
  v_def := replace(v_def,v_old,v_new);

  v_old := '    v_catalogue_price:=round(v_inventory.selling_price,2);' || chr(10) ||
           '    if v_catalogue_price<=0 then raise exception ''POS cannot sell % because its selling price is zero.'',v_inventory.item_name; end if;' || chr(10) || chr(10) ||
           '    v_discount_mode:=coalesce(nullif(v_item->>''discount_mode'',''''),''percentage'');';
  v_new := '    v_catalogue_price:=round(v_inventory.selling_price,2);' || chr(10) ||
           '    if v_catalogue_price<=0 then raise exception ''POS cannot sell % because its selling price is zero.'',v_inventory.item_name; end if;' || chr(10) ||
           '    v_pricing:=public.resolve_pos_pricing(v_company_id,p_branch_id,p_customer_id,v_inventory.id,v_qty,now());' || chr(10) ||
           '    v_auto_price:=round((v_pricing->>''final_unit_price'')::numeric,2);' || chr(10) || chr(10) ||
           '    v_discount_mode:=coalesce(nullif(v_item->>''discount_mode'',''''),''percentage'');';
  if position(v_old in v_def)=0 then raise exception 'checkout first pricing patch anchor not found'; end if;
  v_def := replace(v_def,v_old,v_new);

  v_old := '    v_line_base:=round(v_catalogue_price*v_qty,2);';
  v_new := '    v_line_base:=round(v_auto_price*v_qty,2);';
  if position(v_old in v_def)=0 then raise exception 'checkout approval baseline anchor not found'; end if;
  v_def := replace(v_def,v_old,v_new);

  v_old := '    if v_approval.cart_snapshot<>public.normalize_pos_approval_items(p_items) then raise exception ''The POS cart changed after approval. Request approval again for the current cart.''; end if;' || chr(10) ||
           '    if v_has_override and v_approval.request_type<>''price_override'' then raise exception ''A price override requires an Owner/Admin price-override approval.''; end if;';
  v_new := '    if v_approval.cart_snapshot<>public.normalize_pos_approval_items(p_items) then raise exception ''The POS cart changed after approval. Request approval again for the current cart.''; end if;' || chr(10) ||
           '    if v_approval.pricing_context<>public.build_pos_pricing_context(v_company_id,p_branch_id,p_customer_id,p_items) then raise exception ''POS pricing changed after approval. Request approval again for the current price.''; end if;' || chr(10) ||
           '    if v_has_override and v_approval.request_type<>''price_override'' then raise exception ''A price override requires an Owner/Admin price-override approval.''; end if;';
  if position(v_old in v_def)=0 then raise exception 'checkout approval context anchor not found'; end if;
  v_def := replace(v_def,v_old,v_new);

  v_old := '    v_catalogue_price:=round(v_inventory.selling_price,2);' || chr(10) ||
           '    v_requested_price:=case when nullif(v_item->>''requested_unit_price'','''') is null then null else round((v_item->>''requested_unit_price'')::numeric,2) end;' || chr(10) ||
           '    v_effective_price:=coalesce(v_requested_price,v_catalogue_price);';
  v_new := '    v_catalogue_price:=round(v_inventory.selling_price,2);' || chr(10) ||
           '    v_pricing:=public.resolve_pos_pricing(v_company_id,p_branch_id,p_customer_id,v_inventory.id,v_qty,now());' || chr(10) ||
           '    v_auto_price:=round((v_pricing->>''final_unit_price'')::numeric,2);' || chr(10) ||
           '    v_requested_price:=case when nullif(v_item->>''requested_unit_price'','''') is null then null else round((v_item->>''requested_unit_price'')::numeric,2) end;' || chr(10) ||
           '    v_effective_price:=coalesce(v_requested_price,v_auto_price);';
  if position(v_old in v_def)=0 then raise exception 'checkout invoice pricing anchor not found'; end if;
  v_def := replace(v_def,v_old,v_new);

  v_old := '  from public.invoice_item ii join public.inventory_item inv on inv.id=ii.inventory_item_id and inv.company_id=ii.company_id where ii.invoice_id=v_invoice_id;' || chr(10) || chr(10) ||
           '  if p_suspended_sale_id is not null then';
  v_new := '  from public.invoice_item ii join public.inventory_item inv on inv.id=ii.inventory_item_id and inv.company_id=ii.company_id where ii.invoice_id=v_invoice_id;' || chr(10) || chr(10) ||
           '  update public.pos_sale_item psi' || chr(10) ||
           '  set automatic_unit_price=(pricing.p->>''final_unit_price'')::numeric,' || chr(10) ||
           '      price_source=pricing.p->>''price_source'',' || chr(10) ||
           '      price_book_id=nullif(pricing.p->>''price_book_id'','''')::uuid,' || chr(10) ||
           '      promotion_id=nullif(pricing.p->>''promotion_id'','''')::uuid,' || chr(10) ||
           '      price_book_name=nullif(pricing.p->>''price_book_name'',''''),' || chr(10) ||
           '      promotion_name=nullif(pricing.p->>''promotion_name'','''')' || chr(10) ||
           '  from lateral (select public.resolve_pos_pricing(v_company_id,p_branch_id,p_customer_id,psi.inventory_item_id,psi.quantity,now()) p) pricing' || chr(10) ||
           '  where psi.pos_sale_id=v_pos_sale_id;' || chr(10) || chr(10) ||
           '  if p_suspended_sale_id is not null then';
  if position(v_old in v_def)=0 then raise exception 'checkout pricing audit patch anchor not found'; end if;
  v_def := replace(v_def,v_old,v_new);

  execute v_def;
end;
$patch$;;
