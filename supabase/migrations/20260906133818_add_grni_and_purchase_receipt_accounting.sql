alter table public.accounting_posting_profile
  add column if not exists goods_received_not_invoiced_account_id uuid references public.accounting_account(id) on delete set null;

create or replace function public.ensure_goods_received_not_invoiced_account(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_id uuid;
begin
  select id into v_id
  from public.accounting_account
  where company_id=p_company_id and system_key='goods_received_not_invoiced'
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  if exists(select 1 from public.accounting_account where company_id=p_company_id and code='2050') then
    raise exception 'Account code 2050 is already in use. Configure a Goods Received Not Invoiced liability account before continuing.';
  end if;

  insert into public.accounting_account(
    company_id,code,name,description,account_type,account_subtype,normal_balance,
    system_key,is_system,allow_manual_posting,is_active,created_by
  ) values (
    p_company_id,'2050','Goods Received Not Invoiced',
    'Temporary liability for stock physically received before the supplier bill is recorded.',
    'liability','grni','credit','goods_received_not_invoiced',true,false,true,auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.ensure_accounting_posting_profile(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_clearing_account_id uuid;
  v_grni_account_id uuid;
begin
  perform public.ensure_default_chart_of_accounts(p_company_id);
  v_clearing_account_id := public.ensure_payment_clearing_account(p_company_id);
  v_grni_account_id := public.ensure_goods_received_not_invoiced_account(p_company_id);

  if exists(select 1 from public.accounting_posting_profile where company_id=p_company_id) then
    update public.accounting_posting_profile
    set payment_clearing_account_id=coalesce(payment_clearing_account_id,v_clearing_account_id),
        goods_received_not_invoiced_account_id=coalesce(goods_received_not_invoiced_account_id,v_grni_account_id)
    where company_id=p_company_id;
    return;
  end if;

  insert into public.accounting_posting_profile(
    company_id,
    accounts_receivable_account_id,accounts_payable_account_id,
    sales_revenue_account_id,service_revenue_account_id,
    vat_output_account_id,vat_input_account_id,
    bank_account_id,cash_account_id,payment_clearing_account_id,
    inventory_account_id,cost_of_sales_account_id,
    customer_deposits_account_id,rounding_account_id,
    goods_received_not_invoiced_account_id
  )
  select
    p_company_id,
    (select id from public.accounting_account where company_id=p_company_id and system_key='accounts_receivable' limit 1),
    (select id from public.accounting_account where company_id=p_company_id and system_key='accounts_payable' limit 1),
    (select id from public.accounting_account where company_id=p_company_id and system_key='sales_revenue' limit 1),
    (select id from public.accounting_account where company_id=p_company_id and system_key='service_revenue' limit 1),
    (select id from public.accounting_account where company_id=p_company_id and system_key='vat_output' limit 1),
    (select id from public.accounting_account where company_id=p_company_id and system_key='vat_input' limit 1),
    (select id from public.accounting_account where company_id=p_company_id and system_key='bank' limit 1),
    (select id from public.accounting_account where company_id=p_company_id and system_key='cash_on_hand' limit 1),
    v_clearing_account_id,
    (select id from public.accounting_account where company_id=p_company_id and system_key='inventory' limit 1),
    (select id from public.accounting_account where company_id=p_company_id and system_key='cost_of_sales' limit 1),
    (select id from public.accounting_account where company_id=p_company_id and system_key='customer_deposits' limit 1),
    (select id from public.accounting_account where company_id=p_company_id and code='6800' limit 1),
    v_grni_account_id;
end;
$function$;

create or replace function public.record_purchase_receipt_costing(p_purchase_receipt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_receipt public.purchase_receipt%rowtype;
  v_enabled boolean := false;
  v_vat_registered boolean := false;
  v_row record;
  v_balance public.inventory_cost_balance%rowtype;
  v_capitalized_unit_cost numeric(18,6);
  v_line_cost numeric(18,2);
  v_new_qty numeric(18,3);
  v_new_total numeric(18,2);
  v_movement_id uuid;
  v_count integer := 0;
begin
  select * into v_receipt from public.purchase_receipt where id=p_purchase_receipt_id;
  if not found then raise exception 'Purchase receipt could not be found.'; end if;

  perform public.ensure_company_inventory_costing_settings(v_receipt.company_id);
  select enabled into v_enabled from public.company_inventory_costing_settings where company_id=v_receipt.company_id;
  if not coalesce(v_enabled,false) then
    return jsonb_build_object('ok',true,'costing_enabled',false,'movements',0);
  end if;

  select coalesce(vat_registered,false) into v_vat_registered
  from public.company_finance_settings where company_id=v_receipt.company_id;

  for v_row in
    select pri.id as receipt_item_id,pri.inventory_item_id,pri.quantity_received,pri.unit_cost,coalesce(poi.tax_rate,0) tax_rate
    from public.purchase_receipt_item pri
    join public.purchase_order_item poi on poi.id=pri.purchase_order_item_id and poi.company_id=pri.company_id
    where pri.company_id=v_receipt.company_id and pri.purchase_receipt_id=v_receipt.id
    order by pri.created_at,pri.id
  loop
    if v_row.quantity_received<=0 then raise exception 'Receipt quantity must be greater than zero.'; end if;
    if v_row.unit_cost<=0 then raise exception 'Inventory costing requires a positive unit cost for received stock.'; end if;

    if exists(
      select 1 from public.inventory_cost_movement
      where company_id=v_receipt.company_id and source_type='purchase_receipt'
        and source_id=v_receipt.id and source_line_id=v_row.receipt_item_id and movement_type='purchase_receipt'
    ) then
      continue;
    end if;

    v_capitalized_unit_cost := round(
      case when v_vat_registered then v_row.unit_cost else v_row.unit_cost*(1+(v_row.tax_rate/100.0)) end,
      6
    );
    v_line_cost := round(v_row.quantity_received*v_capitalized_unit_cost,2);

    insert into public.inventory_cost_balance(company_id,branch_id,inventory_item_id)
    values(v_receipt.company_id,v_receipt.branch_id,v_row.inventory_item_id)
    on conflict(company_id,branch_id,inventory_item_id) do nothing;

    select * into v_balance
    from public.inventory_cost_balance
    where company_id=v_receipt.company_id and branch_id=v_receipt.branch_id and inventory_item_id=v_row.inventory_item_id
    for update;

    v_new_qty := round(v_balance.quantity_on_hand+v_row.quantity_received,3);
    v_new_total := round(v_balance.total_cost+v_line_cost,2);

    update public.inventory_cost_balance
    set quantity_on_hand=v_new_qty,
        total_cost=v_new_total,
        average_unit_cost=case when v_new_qty=0 then 0 else round(v_new_total/v_new_qty,6) end,
        last_movement_at=now(),updated_at=now()
    where id=v_balance.id;

    insert into public.inventory_cost_movement(
      company_id,branch_id,inventory_item_id,movement_type,quantity,unit_cost,total_cost,movement_date,
      source_type,source_id,source_line_id,metadata,created_by
    ) values (
      v_receipt.company_id,v_receipt.branch_id,v_row.inventory_item_id,'purchase_receipt',v_row.quantity_received,
      v_capitalized_unit_cost,v_line_cost,v_receipt.received_at::date,
      'purchase_receipt',v_receipt.id,v_row.receipt_item_id,
      jsonb_build_object('receipt_number',v_receipt.receipt_number,'supplier_delivery_reference',v_receipt.supplier_delivery_reference,'vat_capitalized',not v_vat_registered),
      coalesce(v_receipt.received_by,auth.uid())
    ) returning id into v_movement_id;

    v_count := v_count+1;
  end loop;

  return jsonb_build_object('ok',true,'costing_enabled',true,'movements',v_count);
end;
$function$;

create or replace function public.post_purchase_receipt_grni_to_ledger(p_purchase_receipt_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_receipt public.purchase_receipt%rowtype;
  v_profile public.accounting_posting_profile%rowtype;
  v_accounting_enabled boolean := false;
  v_auto_journals boolean := false;
  v_basis text := 'accrual';
  v_vat_registered boolean := false;
  v_currency text := 'ZAR';
  v_net numeric(14,2) := 0;
  v_tax numeric(14,2) := 0;
  v_inventory_amount numeric(14,2) := 0;
  v_existing uuid;
  v_lines jsonb;
begin
  select * into v_receipt from public.purchase_receipt where id=p_purchase_receipt_id;
  if not found then raise exception 'Purchase receipt could not be found.'; end if;

  select id into v_existing from public.journal_entry
  where company_id=v_receipt.company_id and source_type='purchase' and source_id=v_receipt.id and source_event='goods_received'
  limit 1;
  if v_existing is not null then return v_existing; end if;

  select coalesce(accounting_enabled,false),coalesce(automatic_journals,false)
  into v_accounting_enabled,v_auto_journals
  from public.company_accounting_settings where company_id=v_receipt.company_id;

  if not v_accounting_enabled or not v_auto_journals then return null; end if;

  select coalesce(accounting_basis,'accrual'),coalesce(vat_registered,false),coalesce(base_currency,'ZAR')
  into v_basis,v_vat_registered,v_currency
  from public.company_finance_settings where company_id=v_receipt.company_id;

  if v_basis<>'accrual' then
    raise exception 'Purchase receipt accounting currently requires accrual basis.';
  end if;

  perform public.ensure_accounting_posting_profile(v_receipt.company_id);
  select * into v_profile from public.accounting_posting_profile where company_id=v_receipt.company_id;

  if v_profile.inventory_account_id is null or v_profile.goods_received_not_invoiced_account_id is null then
    raise exception 'Inventory or Goods Received Not Invoiced account is not configured.';
  end if;

  select
    round(coalesce(sum(pri.quantity_received*pri.unit_cost),0),2),
    round(coalesce(sum((pri.quantity_received*pri.unit_cost)*(coalesce(poi.tax_rate,0)/100.0)),0),2)
  into v_net,v_tax
  from public.purchase_receipt_item pri
  join public.purchase_order_item poi on poi.id=pri.purchase_order_item_id and poi.company_id=pri.company_id
  where pri.company_id=v_receipt.company_id and pri.purchase_receipt_id=v_receipt.id;

  v_inventory_amount := round(case when v_vat_registered then v_net else v_net+v_tax end,2);
  if v_inventory_amount<=0 then return null; end if;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_id',v_profile.inventory_account_id,'description','Goods received · '||v_receipt.receipt_number,'debit',v_inventory_amount,'credit',0,'metadata',jsonb_build_object('role','inventory_received')),
    jsonb_build_object('account_id',v_profile.goods_received_not_invoiced_account_id,'description','Goods received not yet invoiced · '||v_receipt.receipt_number,'debit',0,'credit',v_inventory_amount,'metadata',jsonb_build_object('role','grni'))
  );

  return public.create_automatic_accounting_journal(
    v_receipt.company_id,v_receipt.branch_id,v_receipt.received_at::date,
    'Goods received · '||v_receipt.receipt_number,
    coalesce(v_receipt.supplier_delivery_reference,v_receipt.receipt_number),
    'purchase',v_receipt.id,'goods_received',v_currency,coalesce(v_receipt.received_by,auth.uid()),v_lines,null
  );
end;
$function$;

create or replace function public.create_supplier_bill_from_receipt(
  p_purchase_receipt_id uuid,
  p_due_date date default null,
  p_supplier_invoice_number text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_company_id uuid;
  v_receipt public.purchase_receipt%rowtype;
  v_po public.purchase_order%rowtype;
  v_bill public.supplier_bill%rowtype;
  v_profile public.accounting_posting_profile%rowtype;
  v_subtotal numeric(14,2);
  v_tax numeric(14,2);
  v_total numeric(14,2);
  v_vat_registered boolean := false;
  v_has_grni boolean := false;
  v_lines jsonb;
  v_journal_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('accounting.payables.manage') then
    raise exception 'Permission denied: accounting.payables.manage';
  end if;

  v_company_id := public.current_company_id();

  select * into v_receipt from public.purchase_receipt
  where id=p_purchase_receipt_id and company_id=v_company_id;
  if not found then raise exception 'Purchase receipt could not be found.'; end if;

  if exists(select 1 from public.supplier_bill where company_id=v_company_id and purchase_receipt_id=v_receipt.id and status<>'cancelled') then
    select * into v_bill from public.supplier_bill
    where company_id=v_company_id and purchase_receipt_id=v_receipt.id and status<>'cancelled' limit 1;
    return jsonb_build_object('ok',true,'already_exists',true,'bill_id',v_bill.id,'bill_number',v_bill.bill_number,'balance_due',v_bill.balance_due);
  end if;

  select * into v_po from public.purchase_order where id=v_receipt.purchase_order_id and company_id=v_company_id;
  if not found then raise exception 'Purchase order could not be found.'; end if;

  select
    round(coalesce(sum(pri.quantity_received*pri.unit_cost),0),2),
    round(coalesce(sum((pri.quantity_received*pri.unit_cost)*(coalesce(poi.tax_rate,0)/100.0)),0),2)
  into v_subtotal,v_tax
  from public.purchase_receipt_item pri
  join public.purchase_order_item poi on poi.id=pri.purchase_order_item_id and poi.company_id=pri.company_id
  where pri.company_id=v_company_id and pri.purchase_receipt_id=v_receipt.id;

  if coalesce(v_subtotal,0)<=0 then raise exception 'Purchase receipt has no billable stock value.'; end if;
  v_total := round(v_subtotal+v_tax,2);

  select coalesce(vat_registered,false) into v_vat_registered
  from public.company_finance_settings where company_id=v_company_id;

  perform public.ensure_accounting_posting_profile(v_company_id);
  select * into v_profile from public.accounting_posting_profile where company_id=v_company_id;

  if v_profile.inventory_account_id is null or v_profile.accounts_payable_account_id is null or v_profile.goods_received_not_invoiced_account_id is null then
    raise exception 'Inventory, Trade Creditors or GRNI accounting account is not configured.';
  end if;
  if v_vat_registered and v_tax>0 and v_profile.vat_input_account_id is null then
    raise exception 'VAT Input accounting account is not configured.';
  end if;

  select exists(
    select 1 from public.journal_entry
    where company_id=v_company_id and source_type='purchase' and source_id=v_receipt.id and source_event='goods_received' and status='posted'
  ) into v_has_grni;

  insert into public.supplier_bill(
    company_id,supplier_id,branch_id,purchase_order_id,purchase_receipt_id,
    bill_number,supplier_invoice_number,bill_date,due_date,subtotal,tax_amount,
    total_amount,amount_paid,balance_due,status,notes,created_by
  ) values (
    v_company_id,v_po.supplier_id,v_receipt.branch_id,v_po.id,v_receipt.id,
    public.generate_supplier_bill_number(v_company_id),
    nullif(trim(coalesce(p_supplier_invoice_number,'')),''),
    v_receipt.received_at::date,p_due_date,v_subtotal,v_tax,v_total,0,v_total,'unpaid',
    nullif(trim(coalesce(p_notes,'')),''),auth.uid()
  ) returning * into v_bill;

  if v_has_grni then
    if v_vat_registered and v_tax>0 then
      v_lines := jsonb_build_array(
        jsonb_build_object('account_id',v_profile.goods_received_not_invoiced_account_id,'debit',v_subtotal,'credit',0,'description','Clear goods received accrual'),
        jsonb_build_object('account_id',v_profile.vat_input_account_id,'debit',v_tax,'credit',0,'description','Input VAT on supplier bill'),
        jsonb_build_object('account_id',v_profile.accounts_payable_account_id,'debit',0,'credit',v_total,'description','Amount owed to supplier')
      );
    else
      v_lines := jsonb_build_array(
        jsonb_build_object('account_id',v_profile.goods_received_not_invoiced_account_id,'debit',v_total,'credit',0,'description','Clear goods received accrual'),
        jsonb_build_object('account_id',v_profile.accounts_payable_account_id,'debit',0,'credit',v_total,'description','Amount owed to supplier')
      );
    end if;
  else
    if v_vat_registered and v_tax>0 then
      v_lines := jsonb_build_array(
        jsonb_build_object('account_id',v_profile.inventory_account_id,'debit',v_subtotal,'credit',0,'description','Historical stock receipt brought into supplier bill'),
        jsonb_build_object('account_id',v_profile.vat_input_account_id,'debit',v_tax,'credit',0,'description','Input VAT on supplier bill'),
        jsonb_build_object('account_id',v_profile.accounts_payable_account_id,'debit',0,'credit',v_total,'description','Amount owed to supplier')
      );
    else
      v_lines := jsonb_build_array(
        jsonb_build_object('account_id',v_profile.inventory_account_id,'debit',v_total,'credit',0,'description','Historical stock receipt brought into supplier bill'),
        jsonb_build_object('account_id',v_profile.accounts_payable_account_id,'debit',0,'credit',v_total,'description','Amount owed to supplier')
      );
    end if;
  end if;

  v_journal_id := public.create_automatic_accounting_journal(
    v_company_id,v_receipt.branch_id,v_receipt.received_at::date,
    'Supplier bill · '||v_bill.bill_number,
    coalesce(v_bill.supplier_invoice_number,v_receipt.receipt_number),
    'purchase',v_bill.id,'supplier_bill','ZAR',auth.uid(),v_lines,null
  );

  update public.supplier_bill set accounting_journal_id=v_journal_id,updated_at=now() where id=v_bill.id;

  return jsonb_build_object(
    'ok',true,'bill_id',v_bill.id,'bill_number',v_bill.bill_number,'supplier_id',v_bill.supplier_id,
    'total_amount',v_total,'balance_due',v_total,'status','unpaid','journal_entry_id',v_journal_id,
    'used_grni',v_has_grni,
    'simple_message','Supplier bill recorded. What We Owe now shows the supplier balance without double-counting stock.'
  );
end;
$function$;
;
