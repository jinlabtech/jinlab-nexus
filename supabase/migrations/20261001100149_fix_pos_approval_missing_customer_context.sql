do $$
declare
  v_oid oid;
  v_def text;
begin
  select p.oid
    into v_oid
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'request_pos_approval'
    and pg_get_function_identity_arguments(p.oid) =
      'p_branch_id uuid, p_items jsonb, p_reason text'
  limit 1;

  if v_oid is null then
    raise exception
      'request_pos_approval(uuid,jsonb,text) was not found';
  end if;

  v_def :=
    pg_get_functiondef(v_oid);

  if position(
    'p_customer_id'
    in v_def
  ) = 0 then
    raise exception
      'Expected broken p_customer_id references were not found';
  end if;

  v_def :=
    replace(
      v_def,
      'nullif(p_customer_id,''00000000-0000-0000-0000-000000000000''::uuid)',
      'NULL::uuid'
    );

  v_def :=
    replace(
      v_def,
      'build_pos_pricing_context(v_company_id,p_branch_id,p_customer_id,p_items)',
      'build_pos_pricing_context(v_company_id,p_branch_id,NULL::uuid,p_items)'
    );

  if position(
    'p_customer_id'
    in v_def
  ) > 0 then
    raise exception
      'Not all broken p_customer_id references were replaced';
  end if;

  execute v_def;
end
$$;
