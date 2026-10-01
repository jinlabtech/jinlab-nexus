alter function public.get_accounting_pos_readiness_audit()
rename to get_accounting_pos_readiness_audit_legacy_pre_costing_cutover;

create or replace function public.get_accounting_pos_readiness_audit()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_base jsonb;
  v_company_id uuid;
  v_costing_enabled boolean := false;
  v_activated_at timestamptz;
  v_post_cutover_product_sales int := 0;
  v_missing_cogs int := 0;
  v_missing_stock_out int := 0;
  v_checks jsonb := '[]'::jsonb;
  v_check jsonb;
  v_status text;
  v_detail text;
  v_blockers int := 0;
  v_warnings int := 0;
begin
  v_base := public.get_accounting_pos_readiness_audit_legacy_pre_costing_cutover();
  v_company_id := public.current_company_id();

  select coalesce(enabled,false), activated_at
  into v_costing_enabled, v_activated_at
  from public.company_inventory_costing_settings
  where company_id=v_company_id;

  if v_costing_enabled and v_activated_at is not null then
    select count(distinct i.id)
    into v_post_cutover_product_sales
    from public.invoice i
    join public.journal_entry je
      on je.company_id=i.company_id
     and je.source_type='invoice'
     and je.source_id=i.id
     and je.source_event='issued'
     and je.status='posted'
     and je.created_at>=v_activated_at
    where i.company_id=v_company_id
      and i.status not in ('draft','cancelled')
      and exists (
        select 1
        from public.invoice_item ii
        where ii.company_id=i.company_id
          and ii.invoice_id=i.id
          and ii.inventory_item_id is not null
      );

    select count(distinct i.id)
    into v_missing_cogs
    from public.invoice i
    join public.journal_entry je
      on je.company_id=i.company_id
     and je.source_type='invoice'
     and je.source_id=i.id
     and je.source_event='issued'
     and je.status='posted'
     and je.created_at>=v_activated_at
    where i.company_id=v_company_id
      and i.status not in ('draft','cancelled')
      and exists (
        select 1
        from public.invoice_item ii
        where ii.company_id=i.company_id
          and ii.invoice_id=i.id
          and ii.inventory_item_id is not null
      )
      and not exists (
        select 1
        from public.journal_entry cj
        where cj.company_id=i.company_id
          and cj.source_type='invoice'
          and cj.source_id=i.id
          and cj.source_event='cogs'
          and cj.status='posted'
      );

    select count(distinct i.id)
    into v_missing_stock_out
    from public.invoice i
    join public.journal_entry je
      on je.company_id=i.company_id
     and je.source_type='invoice'
     and je.source_id=i.id
     and je.source_event='issued'
     and je.status='posted'
     and je.created_at>=v_activated_at
    where i.company_id=v_company_id
      and i.status not in ('draft','cancelled')
      and exists (
        select 1
        from public.invoice_item ii
        where ii.company_id=i.company_id
          and ii.invoice_id=i.id
          and ii.inventory_item_id is not null
      )
      and not exists (
        select 1
        from public.inventory_cost_movement m
        where m.company_id=i.company_id
          and m.source_type='invoice'
          and m.source_id=i.id
          and m.movement_type='sale'
      );
  end if;

  for v_check in
    select value from jsonb_array_elements(v_base->'checks')
  loop
    if v_check->>'key'='cogs_posting' then
      if not v_costing_enabled then
        v_status := 'blocker';
        v_detail := 'Inventory costing is not activated.';
      elsif v_post_cutover_product_sales=0 then
        v_status := 'pass';
        v_detail := 'Weighted-average Cost of Sales is active. No post-cutover product sale has occurred yet; historical sales were intentionally not backfilled.';
      elsif v_missing_cogs>0 then
        v_status := 'blocker';
        v_detail := format('%s post-cutover product invoice(s) are missing Cost of Sales journals.',v_missing_cogs);
      else
        v_status := 'pass';
        v_detail := format('All %s post-cutover product invoice(s) have Cost of Sales journals.',v_post_cutover_product_sales);
      end if;
      v_check := v_check || jsonb_build_object('status',v_status,'detail',v_detail);

    elsif v_check->>'key'='stock_out' then
      if not v_costing_enabled then
        v_status := 'blocker';
        v_detail := 'Inventory costing is not activated, so product sales are not yet financially authoritative.';
      elsif v_post_cutover_product_sales=0 then
        v_status := 'pass';
        v_detail := 'Automatic stock-out is active. No post-cutover product sale has occurred yet; historical stock movements were intentionally not fabricated.';
      elsif v_missing_stock_out>0 then
        v_status := 'blocker';
        v_detail := format('%s post-cutover product invoice(s) are missing inventory sale movements.',v_missing_stock_out);
      else
        v_status := 'pass';
        v_detail := format('All %s post-cutover product invoice(s) reduced inventory through the costing engine.',v_post_cutover_product_sales);
      end if;
      v_check := v_check || jsonb_build_object('status',v_status,'detail',v_detail);
    end if;

    v_checks := v_checks || jsonb_build_array(v_check);
  end loop;

  select
    count(*) filter (where x->>'status'='blocker'),
    count(*) filter (where x->>'status'='warning')
  into v_blockers,v_warnings
  from jsonb_array_elements(v_checks) x;

  return v_base
    || jsonb_build_object(
      'checks',v_checks,
      'pos_ready',v_blockers=0,
      'summary',
        coalesce(v_base->'summary','{}'::jsonb)
        || jsonb_build_object(
          'blockers',v_blockers,
          'warnings',v_warnings,
          'inventory_costing_enabled',v_costing_enabled,
          'inventory_costing_activated_at',v_activated_at,
          'post_cutover_product_sales',v_post_cutover_product_sales,
          'missing_post_cutover_cogs',v_missing_cogs,
          'missing_post_cutover_stock_out',v_missing_stock_out
        ),
      'conclusion',case when v_blockers=0
        then 'Accounting core is ready for POS integration. Remaining warnings should still be monitored.'
        else 'Do not make POS financially authoritative yet. Resolve the accounting blockers first.'
      end
    );
end;
$function$;

grant execute on function public.get_accounting_pos_readiness_audit() to authenticated;;
