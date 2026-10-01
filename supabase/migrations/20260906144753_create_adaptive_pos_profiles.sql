create table if not exists public.pos_profile_template (
  profile_key text primary key,
  profile_name text not null,
  description text not null,
  capabilities jsonb not null default '{}'::jsonb,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.pos_profile_template(profile_key,profile_name,description,capabilities,sort_order)
values
('general','General Business','Flexible checkout for mixed product and service businesses.',jsonb_build_object(
  'barcode',true,'product_grid',true,'inventory_sales',true,'service_sales',true,'walk_in_customer',true,
  'account_sales',true,'discounts',true,'returns',true,'exchanges',true,'suspend_sale',true,'split_tender',true,
  'loyalty',false,'price_override',false,'promotions',false,'cash_drawer',false,'customer_display',false,
  'receipt_printing',true,'branch_stock_lookup',true,'job_cards',false,'serial_tracking',false,'deposits',true,
  'learner_accounts',false,'tables',false,'kitchen',false,'delivery',false,'bulk_pricing',false
),10),
('retail','Retail','Fast barcode-first checkout for shops, supermarkets, spazas and electronics stores.',jsonb_build_object(
  'barcode',true,'product_grid',true,'inventory_sales',true,'service_sales',false,'walk_in_customer',true,
  'account_sales',false,'discounts',true,'returns',true,'exchanges',true,'suspend_sale',true,'split_tender',true,
  'loyalty',true,'price_override',true,'promotions',true,'cash_drawer',true,'customer_display',true,
  'receipt_printing',true,'branch_stock_lookup',true,'job_cards',false,'serial_tracking',false,'deposits',false,
  'learner_accounts',false,'tables',false,'kitchen',false,'delivery',false,'bulk_pricing',false
),20),
('repair_service','Repair & Service','Customers, devices, parts, labour, deposits and service-focused checkout.',jsonb_build_object(
  'barcode',true,'product_grid',true,'inventory_sales',true,'service_sales',true,'walk_in_customer',true,
  'account_sales',true,'discounts',true,'returns',true,'exchanges',false,'suspend_sale',true,'split_tender',true,
  'loyalty',false,'price_override',true,'promotions',false,'cash_drawer',true,'customer_display',false,
  'receipt_printing',true,'branch_stock_lookup',true,'job_cards',true,'serial_tracking',true,'deposits',true,
  'learner_accounts',false,'tables',false,'kitchen',false,'delivery',false,'bulk_pricing',false
),30),
('school_payments','School Payments','Learner and parent payments for fees, uniforms, stationery, transport and events.',jsonb_build_object(
  'barcode',true,'product_grid',true,'inventory_sales',true,'service_sales',true,'walk_in_customer',false,
  'account_sales',true,'discounts',false,'returns',true,'exchanges',true,'suspend_sale',false,'split_tender',true,
  'loyalty',false,'price_override',false,'promotions',false,'cash_drawer',true,'customer_display',false,
  'receipt_printing',true,'branch_stock_lookup',true,'job_cards',false,'serial_tracking',false,'deposits',true,
  'learner_accounts',true,'tables',false,'kitchen',false,'delivery',false,'bulk_pricing',false
),40),
('wholesale_b2b','Wholesale / B2B','Bulk, account-customer and branch-aware sales for wholesalers and distributors.',jsonb_build_object(
  'barcode',true,'product_grid',true,'inventory_sales',true,'service_sales',false,'walk_in_customer',false,
  'account_sales',true,'discounts',true,'returns',true,'exchanges',true,'suspend_sale',true,'split_tender',true,
  'loyalty',false,'price_override',true,'promotions',true,'cash_drawer',false,'customer_display',false,
  'receipt_printing',true,'branch_stock_lookup',true,'job_cards',false,'serial_tracking',true,'deposits',true,
  'learner_accounts',false,'tables',false,'kitchen',false,'delivery',true,'bulk_pricing',true
),50),
('hospitality','Hospitality','Tables, tabs, kitchen workflows, takeaway and hospitality payments.',jsonb_build_object(
  'barcode',false,'product_grid',true,'inventory_sales',true,'service_sales',true,'walk_in_customer',true,
  'account_sales',false,'discounts',true,'returns',false,'exchanges',false,'suspend_sale',true,'split_tender',true,
  'loyalty',true,'price_override',false,'promotions',true,'cash_drawer',true,'customer_display',true,
  'receipt_printing',true,'branch_stock_lookup',false,'job_cards',false,'serial_tracking',false,'deposits',false,
  'learner_accounts',false,'tables',true,'kitchen',true,'delivery',true,'bulk_pricing',false
),60)
on conflict(profile_key) do update set
  profile_name=excluded.profile_name,
  description=excluded.description,
  capabilities=excluded.capabilities,
  sort_order=excluded.sort_order,
  is_active=true,
  updated_at=now();

create table if not exists public.company_pos_settings (
  company_id uuid primary key references public.company(id) on delete cascade,
  profile_key text not null default 'general' references public.pos_profile_template(profile_key),
  enabled boolean not null default true,
  display_name text not null default 'Point of Sale',
  allow_walk_in_customer boolean not null default true,
  require_customer boolean not null default false,
  require_cashier_session boolean not null default false,
  max_cashier_discount_pct numeric(5,2) not null default 10 check (max_cashier_discount_pct between 0 and 100),
  supervisor_discount_threshold_pct numeric(5,2) not null default 10 check (supervisor_discount_threshold_pct between 0 and 100),
  capability_overrides jsonb not null default '{}'::jsonb,
  receipt_options jsonb not null default jsonb_build_object('paper_size','80mm','auto_print',false,'show_cashier',true,'show_branch',true),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.company_pos_settings(company_id)
select c.id from public.company c
on conflict(company_id) do nothing;

alter table public.pos_profile_template enable row level security;
alter table public.company_pos_settings enable row level security;

drop policy if exists pos_profile_template_read on public.pos_profile_template;
create policy pos_profile_template_read on public.pos_profile_template
for select to authenticated using (is_active=true);

drop policy if exists company_pos_settings_read on public.company_pos_settings;
create policy company_pos_settings_read on public.company_pos_settings
for select to authenticated using (
  company_id=public.current_company_id() and public.current_user_has_permission('pos.view')
);

create or replace function public.get_pos_profile_settings()
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_company_id uuid;
  v_settings public.company_pos_settings%rowtype;
  v_template public.pos_profile_template%rowtype;
  v_effective jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.view') then raise exception 'Permission denied: pos.view'; end if;

  v_company_id:=public.current_company_id();

  insert into public.company_pos_settings(company_id)
  values(v_company_id)
  on conflict(company_id) do nothing;

  select * into v_settings from public.company_pos_settings where company_id=v_company_id;
  select * into v_template from public.pos_profile_template where profile_key=v_settings.profile_key and is_active=true;
  if not found then raise exception 'POS profile template could not be found.'; end if;

  v_effective:=coalesce(v_template.capabilities,'{}'::jsonb) || coalesce(v_settings.capability_overrides,'{}'::jsonb);

  return jsonb_build_object(
    'ok',true,
    'settings',jsonb_build_object(
      'profile_key',v_settings.profile_key,
      'enabled',v_settings.enabled,
      'display_name',v_settings.display_name,
      'allow_walk_in_customer',v_settings.allow_walk_in_customer,
      'require_customer',v_settings.require_customer,
      'require_cashier_session',v_settings.require_cashier_session,
      'max_cashier_discount_pct',v_settings.max_cashier_discount_pct,
      'supervisor_discount_threshold_pct',v_settings.supervisor_discount_threshold_pct,
      'capability_overrides',v_settings.capability_overrides,
      'receipt_options',v_settings.receipt_options
    ),
    'active_profile',jsonb_build_object(
      'key',v_template.profile_key,
      'name',v_template.profile_name,
      'description',v_template.description,
      'base_capabilities',v_template.capabilities,
      'effective_capabilities',v_effective
    ),
    'templates',coalesce((
      select jsonb_agg(jsonb_build_object(
        'key',t.profile_key,'name',t.profile_name,'description',t.description,'capabilities',t.capabilities
      ) order by t.sort_order,t.profile_name)
      from public.pos_profile_template t where t.is_active=true
    ),'[]'::jsonb),
    'can_manage',public.current_user_has_permission('pos.manage')
  );
end;
$function$;

grant execute on function public.get_pos_profile_settings() to authenticated;

create or replace function public.save_pos_profile_settings(
  p_profile_key text,
  p_enabled boolean default true,
  p_display_name text default 'Point of Sale',
  p_allow_walk_in_customer boolean default true,
  p_require_customer boolean default false,
  p_require_cashier_session boolean default false,
  p_max_cashier_discount_pct numeric default 10,
  p_supervisor_discount_threshold_pct numeric default 10,
  p_capability_overrides jsonb default '{}'::jsonb,
  p_receipt_options jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_company_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.manage') then raise exception 'Permission denied: pos.manage'; end if;

  v_company_id:=public.current_company_id();

  if not exists(select 1 from public.pos_profile_template where profile_key=p_profile_key and is_active=true) then
    raise exception 'Invalid POS profile.';
  end if;
  if p_require_customer and p_allow_walk_in_customer then
    raise exception 'Walk-in customers cannot be enabled when every sale requires a customer.';
  end if;
  if p_max_cashier_discount_pct is null or p_max_cashier_discount_pct<0 or p_max_cashier_discount_pct>100 then
    raise exception 'Maximum cashier discount must be between 0 and 100.';
  end if;
  if p_supervisor_discount_threshold_pct is null or p_supervisor_discount_threshold_pct<0 or p_supervisor_discount_threshold_pct>100 then
    raise exception 'Supervisor discount threshold must be between 0 and 100.';
  end if;
  if p_capability_overrides is null or jsonb_typeof(p_capability_overrides)<>'object' then
    raise exception 'Capability overrides must be a JSON object.';
  end if;
  if p_receipt_options is null or jsonb_typeof(p_receipt_options)<>'object' then
    raise exception 'Receipt options must be a JSON object.';
  end if;

  insert into public.company_pos_settings(
    company_id,profile_key,enabled,display_name,allow_walk_in_customer,require_customer,
    require_cashier_session,max_cashier_discount_pct,supervisor_discount_threshold_pct,
    capability_overrides,receipt_options,updated_by,updated_at
  ) values (
    v_company_id,p_profile_key,coalesce(p_enabled,true),coalesce(nullif(trim(p_display_name),''),'Point of Sale'),
    coalesce(p_allow_walk_in_customer,true),coalesce(p_require_customer,false),coalesce(p_require_cashier_session,false),
    round(p_max_cashier_discount_pct,2),round(p_supervisor_discount_threshold_pct,2),
    p_capability_overrides,p_receipt_options,auth.uid(),now()
  )
  on conflict(company_id) do update set
    profile_key=excluded.profile_key,
    enabled=excluded.enabled,
    display_name=excluded.display_name,
    allow_walk_in_customer=excluded.allow_walk_in_customer,
    require_customer=excluded.require_customer,
    require_cashier_session=excluded.require_cashier_session,
    max_cashier_discount_pct=excluded.max_cashier_discount_pct,
    supervisor_discount_threshold_pct=excluded.supervisor_discount_threshold_pct,
    capability_overrides=excluded.capability_overrides,
    receipt_options=excluded.receipt_options,
    updated_by=auth.uid(),updated_at=now();

  v_result:=public.get_pos_profile_settings();
  return jsonb_set(v_result,'{message}',to_jsonb('POS profile settings saved.'::text));
end;
$function$;

grant execute on function public.save_pos_profile_settings(text,boolean,text,boolean,boolean,boolean,numeric,numeric,jsonb,jsonb) to authenticated;

create or replace function public.get_pos_workspace(p_branch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_company_id uuid;
  v_branch_id uuid;
  v_result jsonb;
  v_settings public.company_pos_settings%rowtype;
  v_template public.pos_profile_template%rowtype;
  v_capabilities jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.view') then raise exception 'Permission denied: pos.view'; end if;
  v_company_id:=public.current_company_id();

  insert into public.company_pos_settings(company_id) values(v_company_id) on conflict(company_id) do nothing;
  select * into v_settings from public.company_pos_settings where company_id=v_company_id;
  select * into v_template from public.pos_profile_template where profile_key=v_settings.profile_key and is_active=true;
  v_capabilities:=coalesce(v_template.capabilities,'{}'::jsonb)||coalesce(v_settings.capability_overrides,'{}'::jsonb);

  if p_branch_id is not null then
    select id into v_branch_id from public.branch where id=p_branch_id and company_id=v_company_id;
    if v_branch_id is null then raise exception 'Branch could not be found.'; end if;
  end if;

  select jsonb_build_object(
    'ok',true,
    'selected_branch_id',v_branch_id,
    'profile',jsonb_build_object(
      'enabled',v_settings.enabled,
      'key',v_settings.profile_key,
      'name',v_template.profile_name,
      'display_name',v_settings.display_name,
      'allow_walk_in_customer',v_settings.allow_walk_in_customer,
      'require_customer',v_settings.require_customer,
      'require_cashier_session',v_settings.require_cashier_session,
      'max_cashier_discount_pct',v_settings.max_cashier_discount_pct,
      'supervisor_discount_threshold_pct',v_settings.supervisor_discount_threshold_pct,
      'capabilities',v_capabilities,
      'receipt_options',v_settings.receipt_options
    ),
    'branches',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.branch_name) order by b.branch_name) from public.branch b where b.company_id=v_company_id),'[]'::jsonb),
    'products',case when v_branch_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',ii.id,'name',ii.item_name,'sku',ii.sku,'barcode',ii.barcode,
        'selling_price',ii.selling_price,'quantity',bs.quantity,
        'average_unit_cost',coalesce(icb.average_unit_cost,0),
        'low_stock',bs.quantity<=ii.minimum_stock
      ) order by ii.item_name)
      from public.branch_stock bs
      join public.inventory_item ii on ii.id=bs.inventory_item_id and ii.company_id=bs.company_id and ii.is_active=true
      left join public.inventory_cost_balance icb on icb.company_id=bs.company_id and icb.branch_id=bs.branch_id and icb.inventory_item_id=bs.inventory_item_id
      where bs.company_id=v_company_id and bs.branch_id=v_branch_id and bs.quantity>0
    ),'[]'::jsonb) end,
    'customers',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.customer_name,'number',c.customer_number,'phone',c.phone) order by c.customer_name) from public.customer c where c.company_id=v_company_id and c.is_active=true),'[]'::jsonb),
    'finance',(select jsonb_build_object('vat_registered',coalesce(vat_registered,false),'vat_rate',coalesce(default_vat_rate,0),'prices_include_vat',coalesce(prices_include_vat,false),'currency',coalesce(base_currency,'ZAR')) from public.company_finance_settings where company_id=v_company_id),
    'permissions',jsonb_build_object('can_sell',public.current_user_has_permission('pos.sell'),'can_discount',public.current_user_has_permission('pos.discount'),'can_manage',public.current_user_has_permission('pos.manage'))
  ) into v_result;

  return v_result;
end;
$function$;

grant execute on function public.get_pos_workspace(uuid) to authenticated;

create or replace function public.checkout_pos_sale(
  p_branch_id uuid,
  p_customer_id uuid default null,
  p_items jsonb default '[]'::jsonb,
  p_payment_method text default 'cash',
  p_amount_tendered numeric default null,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_company_id uuid;
  v_customer_id uuid;
  v_invoice_id uuid;
  v_payment_id uuid;
  v_pos_sale_id uuid;
  v_invoice_number text;
  v_sale_number text;
  v_item jsonb;
  v_inventory public.inventory_item%rowtype;
  v_qty numeric(14,3);
  v_discount_mode text;
  v_discount_value numeric(14,2);
  v_catalogue_price numeric(14,2);
  v_invoice_price numeric(14,6);
  v_tax_mode text;
  v_tax_rate numeric(8,4):=0;
  v_vat_registered boolean:=false;
  v_prices_include_vat boolean:=false;
  v_total numeric(14,2);
  v_tendered numeric(14,2);
  v_change numeric(14,2):=0;
  v_invoice_item_id uuid;
  v_line_total numeric(14,2);
  v_costing_enabled boolean:=false;
  v_settings public.company_pos_settings%rowtype;
  v_template public.pos_profile_template%rowtype;
  v_capabilities jsonb;
  v_discount_pct numeric(8,4);
  v_line_base numeric(14,2);
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.sell') then raise exception 'Permission denied: pos.sell'; end if;
  if p_payment_method not in ('cash','eft','card','other') then raise exception 'Invalid POS payment method.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Add at least one item to the POS cart.'; end if;

  v_company_id:=public.current_company_id();
  if not exists(select 1 from public.branch where id=p_branch_id and company_id=v_company_id) then raise exception 'Branch could not be found.'; end if;

  insert into public.company_pos_settings(company_id) values(v_company_id) on conflict(company_id) do nothing;
  select * into v_settings from public.company_pos_settings where company_id=v_company_id;
  select * into v_template from public.pos_profile_template where profile_key=v_settings.profile_key and is_active=true;
  v_capabilities:=coalesce(v_template.capabilities,'{}'::jsonb)||coalesce(v_settings.capability_overrides,'{}'::jsonb);

  if not v_settings.enabled then raise exception 'POS is disabled in company settings.'; end if;
  if v_settings.require_cashier_session then raise exception 'This POS profile requires a cashier session. Cashier sessions are enabled in the next POS sprint.'; end if;

  select coalesce(enabled,false) into v_costing_enabled from public.company_inventory_costing_settings where company_id=v_company_id;
  if not v_costing_enabled then raise exception 'Inventory costing must be active before POS can sell stock.'; end if;

  select coalesce(vat_registered,false),coalesce(default_vat_rate,0),coalesce(prices_include_vat,false)
  into v_vat_registered,v_tax_rate,v_prices_include_vat
  from public.company_finance_settings where company_id=v_company_id;
  v_tax_mode:=case when v_vat_registered and v_tax_rate>0 then 'vat' else 'none' end;

  if p_customer_id is null then
    if v_settings.require_customer then raise exception 'This POS profile requires a customer on every sale.'; end if;
    if not v_settings.allow_walk_in_customer then raise exception 'Walk-in customer sales are disabled.'; end if;
    v_customer_id:=public.ensure_pos_walk_in_customer(v_company_id);
  else
    select id into v_customer_id from public.customer where id=p_customer_id and company_id=v_company_id and is_active=true;
    if v_customer_id is null then raise exception 'Customer could not be found.'; end if;
  end if;

  v_invoice_id:=gen_random_uuid();
  v_invoice_number:=public.generate_invoice_number(v_company_id);
  insert into public.invoice(id,company_id,branch_id,customer_id,invoice_number,status,invoice_date,due_date,notes,created_by)
  values(v_invoice_id,v_company_id,p_branch_id,v_customer_id,v_invoice_number,'draft',current_date,current_date,'JINLAB Nexus POS sale',auth.uid());

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select * into v_inventory from public.inventory_item where id=(v_item->>'inventory_item_id')::uuid and company_id=v_company_id and is_active=true;
    if not found then raise exception 'One or more POS items could not be found.'; end if;

    v_qty:=round(coalesce(nullif(v_item->>'quantity','')::numeric,0),3);
    if v_qty<=0 then raise exception 'POS item quantity must be greater than zero.'; end if;
    if v_qty<>trunc(v_qty) then raise exception 'Current POS inventory items must use whole-number quantities.'; end if;

    if coalesce((select quantity from public.branch_stock where company_id=v_company_id and branch_id=p_branch_id and inventory_item_id=v_inventory.id),0) < v_qty then
      raise exception 'Insufficient stock for %.',v_inventory.item_name;
    end if;

    v_catalogue_price:=round(v_inventory.selling_price,2);
    if v_catalogue_price<=0 then raise exception 'POS cannot sell % because its selling price is zero.',v_inventory.item_name; end if;

    v_discount_mode:=coalesce(nullif(v_item->>'discount_mode',''),'percentage');
    if v_discount_mode not in ('percentage','fixed') then raise exception 'Invalid discount mode.'; end if;
    v_discount_value:=round(coalesce(nullif(v_item->>'discount_value','')::numeric,0),2);
    if v_discount_value<0 then raise exception 'Discount cannot be negative.'; end if;

    if v_discount_value>0 then
      if coalesce((v_capabilities->>'discounts')::boolean,false)=false then raise exception 'Discounts are disabled for this POS profile.'; end if;
      if not public.current_user_has_permission('pos.discount') then raise exception 'Permission denied: pos.discount'; end if;

      v_line_base:=round(v_catalogue_price*v_qty,2);
      v_discount_pct:=case when v_discount_mode='percentage' then v_discount_value else case when v_line_base=0 then 0 else round((v_discount_value/v_line_base)*100,4) end end;

      if v_discount_pct>v_settings.max_cashier_discount_pct and not public.current_user_has_permission('pos.manage') then
        raise exception 'Discount %.2f%% exceeds the cashier limit of %.2f%%.',v_discount_pct,v_settings.max_cashier_discount_pct;
      end if;
    end if;

    v_invoice_price:=case when v_tax_mode='vat' and v_prices_include_vat then round(v_catalogue_price/(1+(v_tax_rate/100)),6) else v_catalogue_price end;

    insert into public.invoice_item(invoice_id,company_id,inventory_item_id,description,quantity,unit_price,discount_mode,discount_value,tax_mode,tax_rate)
    values(v_invoice_id,v_company_id,v_inventory.id,v_inventory.item_name,v_qty,v_invoice_price,v_discount_mode,v_discount_value,v_tax_mode,v_tax_rate)
    returning id,line_total into v_invoice_item_id,v_line_total;
  end loop;

  select total_amount into v_total from public.invoice where id=v_invoice_id;
  if v_total<=0 then raise exception 'POS sale total must be greater than zero.'; end if;

  v_tendered:=round(coalesce(p_amount_tendered,v_total),2);
  if p_payment_method='cash' then
    if v_tendered<v_total then raise exception 'Cash tendered is less than the sale total.'; end if;
    v_change:=round(v_tendered-v_total,2);
  else
    if abs(v_tendered-v_total)>0.009 then raise exception 'Card, EFT and other POS payments must equal the sale total.'; end if;
    v_change:=0;
  end if;

  update public.invoice set status='issued',due_date=current_date,updated_at=now() where id=v_invoice_id;

  insert into public.invoice_payment(company_id,branch_id,invoice_id,customer_id,payment_date,payment_method,reference,amount,notes,received_by,payment_source)
  values(v_company_id,p_branch_id,v_invoice_id,v_customer_id,current_date,p_payment_method,nullif(trim(coalesce(p_reference,'')),''),v_total,'JINLAB Nexus POS payment',auth.uid(),'pos')
  returning id into v_payment_id;

  v_pos_sale_id:=gen_random_uuid();
  v_sale_number:=public.generate_pos_sale_number(v_company_id);
  insert into public.pos_sale(id,company_id,branch_id,sale_number,invoice_id,payment_id,customer_id,cashier_user_id,payment_method,amount_tendered,total_amount,change_due,reference,status,metadata)
  values(v_pos_sale_id,v_company_id,p_branch_id,v_sale_number,v_invoice_id,v_payment_id,v_customer_id,auth.uid(),p_payment_method,v_tendered,v_total,v_change,nullif(trim(coalesce(p_reference,'')),''),'completed',jsonb_build_object('source','pos_checkout','profile_key',v_settings.profile_key));

  insert into public.pos_sale_item(company_id,pos_sale_id,invoice_item_id,inventory_item_id,description,quantity,catalogue_unit_price,invoice_unit_price,discount_mode,discount_value,line_total)
  select v_company_id,v_pos_sale_id,ii.id,ii.inventory_item_id,ii.description,ii.quantity,inv.selling_price,ii.unit_price,ii.discount_mode,ii.discount_value,ii.line_total
  from public.invoice_item ii
  join public.inventory_item inv on inv.id=ii.inventory_item_id and inv.company_id=ii.company_id
  where ii.invoice_id=v_invoice_id;

  return jsonb_build_object(
    'ok',true,'pos_sale_id',v_pos_sale_id,'sale_number',v_sale_number,'invoice_id',v_invoice_id,
    'invoice_number',v_invoice_number,'payment_id',v_payment_id,'total',v_total,'amount_tendered',v_tendered,
    'change_due',v_change,'payment_method',p_payment_method,'profile_key',v_settings.profile_key,
    'message','POS sale completed. Invoice, payment, stock, Cost of Sales and Accounting were updated automatically.'
  );
end;
$function$;

grant execute on function public.checkout_pos_sale(uuid,uuid,jsonb,text,numeric,text) to authenticated;;
