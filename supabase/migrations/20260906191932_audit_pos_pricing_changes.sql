do $patch$
declare
  v_oid oid;
  v_def text;
  v_old text;
  v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='save_pos_price_book' order by p.oid desc limit 1;
  select pg_get_functiondef(v_oid) into v_def;
  v_old := '  return jsonb_build_object(''ok'',true,''price_book_id'',v_id,''message'',''POS price book saved.'');';
  v_new := '  perform public.log_settings_change(v_company_id,''pos_pricing'',''price_book_saved'',jsonb_build_object(''price_book_id'',v_id,''name'',trim(p_name),''enabled'',coalesce(p_enabled,false),''branch_id'',p_branch_id,''customer_type'',nullif(trim(coalesce(p_customer_type,'''')),'''')));' || chr(10) || chr(10) || v_old;
  if position(v_old in v_def)=0 then raise exception 'save_pos_price_book audit anchor not found'; end if;
  execute replace(v_def,v_old,v_new);

  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='save_pos_promotion' order by p.oid desc limit 1;
  select pg_get_functiondef(v_oid) into v_def;
  v_old := '  return jsonb_build_object(''ok'',true,''promotion_id'',v_id,''message'',''POS promotion saved.'');';
  v_new := '  perform public.log_settings_change(v_company_id,''pos_pricing'',''promotion_saved'',jsonb_build_object(''promotion_id'',v_id,''name'',trim(p_name),''enabled'',coalesce(p_enabled,false),''promotion_type'',v_type,''promotion_value'',v_value,''branch_id'',p_branch_id,''customer_type'',nullif(trim(coalesce(p_customer_type,'''')),''''),''inventory_item_id'',p_inventory_item_id,''category_id'',p_category_id));' || chr(10) || chr(10) || v_old;
  if position(v_old in v_def)=0 then raise exception 'save_pos_promotion audit anchor not found'; end if;
  execute replace(v_def,v_old,v_new);
end;
$patch$;;
