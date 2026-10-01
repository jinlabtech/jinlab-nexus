-- PostgreSQL cannot correlate UPDATE's target alias through FROM LATERAL.
-- A correlated SET subquery keeps each sale line's pricing snapshot intact.
-- Change only this block; preserve checkout's auth, permissions, atomic stock/
-- accounting updates, function attributes and existing execution grants.
DO $migration$
DECLARE
  v_definition text;
  v_old text := $old$
  update public.pos_sale_item psi
  set automatic_unit_price=(pricing.p->>'final_unit_price')::numeric,
      price_source=pricing.p->>'price_source',
      price_book_id=nullif(pricing.p->>'price_book_id','')::uuid,
      promotion_id=nullif(pricing.p->>'promotion_id','')::uuid,
      price_book_name=nullif(pricing.p->>'price_book_name',''),
      promotion_name=nullif(pricing.p->>'promotion_name','')
  from lateral (select public.resolve_pos_pricing(v_company_id,p_branch_id,p_customer_id,psi.inventory_item_id,psi.quantity,now()) p) pricing
  where psi.pos_sale_id=v_pos_sale_id;
$old$;
  v_new text := $new$
  update public.pos_sale_item psi
  set (automatic_unit_price, price_source, price_book_id, promotion_id,
       price_book_name, promotion_name) = (
    select (pricing.p->>'final_unit_price')::numeric,
           pricing.p->>'price_source',
           nullif(pricing.p->>'price_book_id','')::uuid,
           nullif(pricing.p->>'promotion_id','')::uuid,
           nullif(pricing.p->>'price_book_name',''),
           nullif(pricing.p->>'promotion_name','')
    from (
      select public.resolve_pos_pricing(
        v_company_id,p_branch_id,p_customer_id,
        psi.inventory_item_id,psi.quantity,now()
      ) p
    ) pricing
  )
  where psi.pos_sale_id=v_pos_sale_id;
$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.checkout_pos_sale(uuid,uuid,jsonb,text,numeric,text,uuid,jsonb)'::regprocedure
  ) INTO v_definition;

  IF position(v_new IN v_definition) > 0 THEN
    RETURN;
  END IF;

  IF position(v_old IN v_definition) = 0 OR
     (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'Expected POS pricing snapshot block was not found exactly once; review checkout before applying this migration.';
  END IF;

  EXECUTE replace(v_definition, v_old, v_new);
END;
$migration$;
;
