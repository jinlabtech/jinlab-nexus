create or replace function public.validate_invoice_inventory_sale(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_invoice public.invoice%rowtype;
  v_enabled boolean := false;
  v_profile public.accounting_posting_profile%rowtype;
  v_row record;
  v_stock_qty numeric;
  v_cost_qty numeric;
  v_avg_cost numeric;
begin
  select * into v_invoice from public.invoice where id=p_invoice_id;
  if not found then raise exception 'Invoice could not be found.'; end if;

  perform public.ensure_company_inventory_costing_settings(v_invoice.company_id);
  select enabled into v_enabled from public.company_inventory_costing_settings where company_id=v_invoice.company_id;
  if not coalesce(v_enabled,false) then
    return jsonb_build_object('ok',true,'costing_enabled',false);
  end if;

  perform public.ensure_accounting_posting_profile(v_invoice.company_id);
  select * into v_profile from public.accounting_posting_profile where company_id=v_invoice.company_id;

  if v_profile.inventory_account_id is null or v_profile.cost_of_sales_account_id is null then
    raise exception 'Inventory and Cost of Sales accounts must be configured before product sales can be issued.';
  end if;

  for v_row in
    select inventory_item_id,sum(quantity)::numeric(18,3) qty
    from public.invoice_item
    where invoice_id=v_invoice.id and company_id=v_invoice.company_id and inventory_item_id is not null
    group by inventory_item_id
  loop
    if v_row.qty<=0 or trunc(v_row.qty)<>v_row.qty then
      raise exception 'Inventory-linked invoice quantities must currently be positive whole numbers.';
    end if;

    select quantity into v_stock_qty
    from public.branch_stock
    where company_id=v_invoice.company_id and branch_id=v_invoice.branch_id and inventory_item_id=v_row.inventory_item_id
    for update;

    if v_stock_qty is null or v_stock_qty<v_row.qty then
      raise exception 'Not enough branch stock to issue this invoice. Required %, available %.',v_row.qty,coalesce(v_stock_qty,0);
    end if;

    select quantity_on_hand,average_unit_cost into v_cost_qty,v_avg_cost
    from public.inventory_cost_balance
    where company_id=v_invoice.company_id and branch_id=v_invoice.branch_id and inventory_item_id=v_row.inventory_item_id
    for update;

    if v_cost_qty is null or v_cost_qty<v_row.qty then
      raise exception 'Inventory costing balance is not sufficient for this sale. Review the stock costing cutover or purchase receipts.';
    end if;

    if coalesce(v_avg_cost,0)<=0 then
      raise exception 'Inventory costing requires a positive average unit cost before this product can be sold.';
    end if;
  end loop;

  return jsonb_build_object('ok',true,'costing_enabled',true);
end;
$function$;

create or replace function public.invoice_inventory_costing_guard()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_enabled boolean := false;
begin
  if new.status='issued' and old.status is distinct from new.status then
    perform public.ensure_company_inventory_costing_settings(new.company_id);
    select enabled into v_enabled from public.company_inventory_costing_settings where company_id=new.company_id;
    if coalesce(v_enabled,false) then
      perform public.validate_invoice_inventory_sale(new.id);
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists invoice_inventory_costing_guard on public.invoice;
create trigger invoice_inventory_costing_guard
before update of status on public.invoice
for each row execute function public.invoice_inventory_costing_guard();

create or replace function public.post_invoice_inventory_cost(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_invoice public.invoice%rowtype;
  v_profile public.accounting_posting_profile%rowtype;
  v_enabled boolean := false;
  v_currency text := 'ZAR';
  v_existing_journal uuid;
  v_item public.invoice_item%rowtype;
  v_balance public.inventory_cost_balance%rowtype;
  v_qty numeric(18,3);
  v_unit_cost numeric(18,6);
  v_line_cost numeric(18,2);
  v_new_qty numeric(18,3);
  v_new_total numeric(18,2);
  v_total_cogs numeric(18,2) := 0;
  v_movement_id uuid;
  v_journal_id uuid;
  v_lines jsonb;
begin
  select * into v_invoice from public.invoice where id=p_invoice_id for update;
  if not found then raise exception 'Invoice could not be found.'; end if;

  perform public.ensure_company_inventory_costing_settings(v_invoice.company_id);
  select enabled into v_enabled from public.company_inventory_costing_settings where company_id=v_invoice.company_id;
  if not coalesce(v_enabled,false) then return null; end if;

  if v_invoice.status in ('draft','cancelled') then
    raise exception 'Inventory cost can only be posted for an active issued invoice.';
  end if;

  select id into v_existing_journal from public.journal_entry
  where company_id=v_invoice.company_id and source_type='invoice' and source_id=v_invoice.id and source_event='cogs'
  limit 1;
  if v_existing_journal is not null then return v_existing_journal; end if;

  perform public.ensure_accounting_posting_profile(v_invoice.company_id);
  select * into v_profile from public.accounting_posting_profile where company_id=v_invoice.company_id;
  select coalesce(base_currency,'ZAR') into v_currency from public.company_finance_settings where company_id=v_invoice.company_id;

  if v_profile.inventory_account_id is null or v_profile.cost_of_sales_account_id is null then
    raise exception 'Inventory and Cost of Sales accounts are not configured.';
  end if;

  perform public.validate_invoice_inventory_sale(v_invoice.id);

  for v_item in
    select * from public.invoice_item
    where invoice_id=v_invoice.id and company_id=v_invoice.company_id and inventory_item_id is not null
    order by created_at,id
  loop
    if exists(
      select 1 from public.inventory_cost_movement
      where company_id=v_invoice.company_id and source_type='invoice' and source_id=v_invoice.id
        and source_line_id=v_item.id and movement_type='sale'
    ) then
      continue;
    end if;

    v_qty := round(v_item.quantity,3);

    select * into v_balance
    from public.inventory_cost_balance
    where company_id=v_invoice.company_id and branch_id=v_invoice.branch_id and inventory_item_id=v_item.inventory_item_id
    for update;

    if v_balance.quantity_on_hand<v_qty then
      raise exception 'Inventory costing quantity changed while processing the sale.';
    end if;

    if v_balance.quantity_on_hand=v_qty then
      v_line_cost := round(v_balance.total_cost,2);
      v_unit_cost := case when v_qty=0 then 0 else round(v_line_cost/v_qty,6) end;
    else
      v_unit_cost := round(v_balance.average_unit_cost,6);
      v_line_cost := round(v_qty*v_unit_cost,2);
    end if;

    if v_unit_cost<=0 or v_line_cost<=0 then
      raise exception 'The product has no valid cost for Cost of Sales.';
    end if;

    v_new_qty := round(v_balance.quantity_on_hand-v_qty,3);
    v_new_total := round(greatest(v_balance.total_cost-v_line_cost,0),2);

    update public.inventory_cost_balance
    set quantity_on_hand=v_new_qty,
        total_cost=v_new_total,
        average_unit_cost=case when v_new_qty=0 then 0 else round(v_new_total/v_new_qty,6) end,
        last_movement_at=now(),updated_at=now()
    where id=v_balance.id;

    update public.branch_stock
    set quantity=quantity-v_qty::integer,updated_at=now()
    where company_id=v_invoice.company_id and branch_id=v_invoice.branch_id and inventory_item_id=v_item.inventory_item_id;

    if not found then raise exception 'Branch stock disappeared while processing the sale.'; end if;

    insert into public.stock_movement(
      company_id,branch_id,inventory_item_id,user_id,movement_type,quantity,reference,notes
    ) values (
      v_invoice.company_id,v_invoice.branch_id,v_item.inventory_item_id,coalesce(v_invoice.created_by,auth.uid()),
      'sale',v_qty::integer,v_invoice.invoice_number,'Stock issued on invoice '||v_invoice.invoice_number
    );

    insert into public.inventory_cost_movement(
      company_id,branch_id,inventory_item_id,movement_type,quantity,unit_cost,total_cost,movement_date,
      source_type,source_id,source_line_id,metadata,created_by
    ) values (
      v_invoice.company_id,v_invoice.branch_id,v_item.inventory_item_id,'sale',v_qty,v_unit_cost,v_line_cost,v_invoice.invoice_date,
      'invoice',v_invoice.id,v_item.id,
      jsonb_build_object('invoice_number',v_invoice.invoice_number,'costing_method','weighted_average'),
      coalesce(v_invoice.created_by,auth.uid())
    ) returning id into v_movement_id;

    update public.invoice_item
    set unit_cost_snapshot=v_unit_cost,
        total_cost_snapshot=v_line_cost,
        costing_method='weighted_average',
        costed_at=now(),
        cost_movement_id=v_movement_id
    where id=v_item.id and company_id=v_invoice.company_id;

    v_total_cogs := round(v_total_cogs+v_line_cost,2);
  end loop;

  if v_total_cogs=0 then return null; end if;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_id',v_profile.cost_of_sales_account_id,'description','Cost of Sales · '||v_invoice.invoice_number,'debit',v_total_cogs,'credit',0,'metadata',jsonb_build_object('role','cost_of_sales')),
    jsonb_build_object('account_id',v_profile.inventory_account_id,'description','Inventory sold · '||v_invoice.invoice_number,'debit',0,'credit',v_total_cogs,'metadata',jsonb_build_object('role','inventory_relief'))
  );

  v_journal_id := public.create_automatic_accounting_journal(
    v_invoice.company_id,v_invoice.branch_id,v_invoice.invoice_date,
    'Cost of Sales · '||v_invoice.invoice_number,
    v_invoice.invoice_number,
    'invoice',v_invoice.id,'cogs',v_currency,coalesce(v_invoice.created_by,auth.uid()),v_lines,null
  );

  update public.inventory_cost_movement
  set journal_entry_id=v_journal_id
  where company_id=v_invoice.company_id and source_type='invoice' and source_id=v_invoice.id and movement_type='sale';

  return v_journal_id;
end;
$function$;

create or replace function public.reverse_invoice_inventory_cost(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_invoice public.invoice%rowtype;
  v_original_journal uuid;
  v_existing_reversal uuid;
  v_currency text := 'ZAR';
  v_sale public.inventory_cost_movement%rowtype;
  v_balance_id uuid;
  v_new_qty numeric(18,3);
  v_new_total numeric(18,2);
  v_reversal_movement_id uuid;
  v_lines jsonb;
  v_journal_id uuid;
begin
  select * into v_invoice from public.invoice where id=p_invoice_id for update;
  if not found then raise exception 'Invoice could not be found.'; end if;

  select id,currency into v_original_journal,v_currency
  from public.journal_entry
  where company_id=v_invoice.company_id and source_type='invoice' and source_id=v_invoice.id and source_event='cogs' and status='posted'
  limit 1;

  if v_original_journal is null then return null; end if;

  select id into v_existing_reversal
  from public.journal_entry
  where company_id=v_invoice.company_id and source_type='invoice' and source_id=v_invoice.id and source_event='cogs_cancelled'
  limit 1;
  if v_existing_reversal is not null then return v_existing_reversal; end if;

  for v_sale in
    select * from public.inventory_cost_movement
    where company_id=v_invoice.company_id and source_type='invoice' and source_id=v_invoice.id and movement_type='sale'
    order by created_at,id
  loop
    if exists(select 1 from public.inventory_cost_movement where reversal_of_movement_id=v_sale.id and movement_type='sale_reversal') then
      continue;
    end if;

    insert into public.inventory_cost_balance(company_id,branch_id,inventory_item_id)
    values(v_sale.company_id,v_sale.branch_id,v_sale.inventory_item_id)
    on conflict(company_id,branch_id,inventory_item_id) do nothing;

    select id,round(quantity_on_hand+v_sale.quantity,3),round(total_cost+v_sale.total_cost,2)
    into v_balance_id,v_new_qty,v_new_total
    from public.inventory_cost_balance
    where company_id=v_sale.company_id and branch_id=v_sale.branch_id and inventory_item_id=v_sale.inventory_item_id
    for update;

    update public.inventory_cost_balance
    set quantity_on_hand=v_new_qty,total_cost=v_new_total,
        average_unit_cost=case when v_new_qty=0 then 0 else round(v_new_total/v_new_qty,6) end,
        last_movement_at=now(),updated_at=now()
    where id=v_balance_id;

    update public.branch_stock
    set quantity=quantity+v_sale.quantity::integer,updated_at=now()
    where company_id=v_sale.company_id and branch_id=v_sale.branch_id and inventory_item_id=v_sale.inventory_item_id;

    if not found then
      insert into public.branch_stock(company_id,branch_id,inventory_item_id,quantity)
      values(v_sale.company_id,v_sale.branch_id,v_sale.inventory_item_id,v_sale.quantity::integer);
    end if;

    insert into public.stock_movement(
      company_id,branch_id,inventory_item_id,user_id,movement_type,quantity,reference,notes
    ) values (
      v_sale.company_id,v_sale.branch_id,v_sale.inventory_item_id,auth.uid(),'return',v_sale.quantity::integer,
      v_invoice.invoice_number,'Stock restored after invoice cancellation '||v_invoice.invoice_number
    );

    insert into public.inventory_cost_movement(
      company_id,branch_id,inventory_item_id,movement_type,quantity,unit_cost,total_cost,movement_date,
      source_type,source_id,source_line_id,reversal_of_movement_id,metadata,created_by
    ) values (
      v_sale.company_id,v_sale.branch_id,v_sale.inventory_item_id,'sale_reversal',v_sale.quantity,v_sale.unit_cost,v_sale.total_cost,current_date,
      'invoice',v_invoice.id,v_sale.source_line_id,v_sale.id,
      jsonb_build_object('invoice_number',v_invoice.invoice_number,'reason','invoice_cancelled'),auth.uid()
    ) returning id into v_reversal_movement_id;
  end loop;

  select jsonb_agg(jsonb_build_object(
    'account_id',jl.account_id,
    'description','COGS reversal · '||v_invoice.invoice_number,
    'debit',jl.credit,
    'credit',jl.debit,
    'metadata',coalesce(jl.metadata,'{}'::jsonb)||jsonb_build_object('reversal_of',v_original_journal)
  ) order by jl.line_number)
  into v_lines
  from public.journal_line jl
  where jl.journal_entry_id=v_original_journal;

  v_journal_id := public.create_automatic_accounting_journal(
    v_invoice.company_id,v_invoice.branch_id,current_date,
    'Cost of Sales reversal · '||v_invoice.invoice_number,
    v_invoice.invoice_number,
    'invoice',v_invoice.id,'cogs_cancelled',v_currency,auth.uid(),v_lines,v_original_journal
  );

  update public.inventory_cost_movement
  set journal_entry_id=v_journal_id
  where company_id=v_invoice.company_id and source_type='invoice' and source_id=v_invoice.id and movement_type='sale_reversal';

  return v_journal_id;
end;
$function$;

create or replace function public.invoice_accounting_event_sync()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_costing_enabled boolean := false;
  v_issue_journal uuid;
begin
  if new.status='issued' and old.status is distinct from new.status then
    begin
      v_issue_journal := public.post_invoice_issue_to_ledger(new.id);
    exception when others then
      perform public.record_accounting_posting_exception(
        new.company_id,new.branch_id,'invoice',new.id,'issued',new.invoice_date,sqlstate,sqlerrm
      );
      v_issue_journal := null;
    end;

    if new.sales_order_id is not null then
      perform public.apply_sales_order_deposits_to_invoice(new.id);
    end if;

    perform public.ensure_company_inventory_costing_settings(new.company_id);
    select enabled into v_costing_enabled from public.company_inventory_costing_settings where company_id=new.company_id;

    if coalesce(v_costing_enabled,false) and exists(
      select 1 from public.invoice_item where invoice_id=new.id and company_id=new.company_id and inventory_item_id is not null
    ) then
      if not exists(
        select 1 from public.journal_entry
        where company_id=new.company_id and source_type='invoice' and source_id=new.id and source_event='issued' and status='posted'
      ) then
        raise exception 'The product sale could not be issued because revenue accounting did not post successfully.';
      end if;
      perform public.post_invoice_inventory_cost(new.id);
    end if;
  end if;

  if new.status='cancelled' and old.status is distinct from new.status then
    perform public.post_invoice_cancellation_to_ledger(new.id);
    perform public.reverse_invoice_inventory_cost(new.id);
  end if;

  return new;
end;
$function$;

grant execute on function public.validate_invoice_inventory_sale(uuid) to authenticated;
;
