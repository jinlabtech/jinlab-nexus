create table if not exists public.pos_sale (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid not null references public.branch(id) on delete restrict,
  sale_number text not null,
  invoice_id uuid not null unique references public.invoice(id) on delete restrict,
  payment_id uuid not null unique references public.invoice_payment(id) on delete restrict,
  customer_id uuid not null references public.customer(id) on delete restrict,
  cashier_user_id uuid references auth.users(id) on delete set null,
  payment_method text not null check (payment_method in ('cash','eft','card','other')),
  amount_tendered numeric(14,2) not null check (amount_tendered >= 0),
  total_amount numeric(14,2) not null check (total_amount >= 0),
  change_due numeric(14,2) not null default 0 check (change_due >= 0),
  reference text,
  status text not null default 'completed' check (status in ('completed','cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(company_id,sale_number)
);

create table if not exists public.pos_sale_item (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  pos_sale_id uuid not null references public.pos_sale(id) on delete cascade,
  invoice_item_id uuid not null unique references public.invoice_item(id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_item(id) on delete restrict,
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  catalogue_unit_price numeric(14,2) not null check (catalogue_unit_price >= 0),
  invoice_unit_price numeric(14,6) not null check (invoice_unit_price >= 0),
  discount_mode text not null default 'percentage' check (discount_mode in ('percentage','fixed')),
  discount_value numeric(14,2) not null default 0 check (discount_value >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create index if not exists pos_sale_company_created_idx on public.pos_sale(company_id,created_at desc);
create index if not exists pos_sale_branch_created_idx on public.pos_sale(company_id,branch_id,created_at desc);
create index if not exists pos_sale_item_sale_idx on public.pos_sale_item(pos_sale_id);

alter table public.pos_sale enable row level security;
alter table public.pos_sale_item enable row level security;

drop policy if exists pos_sale_select_policy on public.pos_sale;
create policy pos_sale_select_policy on public.pos_sale for select to authenticated using (
  company_id=public.current_company_id() and public.current_user_has_permission('pos.view')
);

drop policy if exists pos_sale_item_select_policy on public.pos_sale_item;
create policy pos_sale_item_select_policy on public.pos_sale_item for select to authenticated using (
  company_id=public.current_company_id() and public.current_user_has_permission('pos.view')
);

insert into public.permissions(permission_name)
values ('pos.view'),('pos.sell'),('pos.discount'),('pos.manage')
on conflict(permission_name) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.permission_name in ('pos.view','pos.sell','pos.manage','pos.discount')
where r.role_name in ('owner','admin')
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.permission_name in ('pos.view','pos.sell')
where r.role_name='manager'
on conflict do nothing;

create or replace function public.generate_pos_sale_number(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_prefix text := 'POS-' || to_char(current_date,'YYYYMM') || '-';
  v_next integer;
begin
  select coalesce(max(nullif(regexp_replace(sale_number,'^.*-','','g'),'')::integer),0)+1
  into v_next
  from public.pos_sale
  where company_id=p_company_id and sale_number like v_prefix || '%';
  return v_prefix || lpad(v_next::text,5,'0');
exception when invalid_text_representation then
  return v_prefix || to_char(clock_timestamp(),'DDHH24MISSMS');
end;
$$;

create or replace function public.ensure_pos_walk_in_customer(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_customer_id uuid;
begin
  select id into v_customer_id
  from public.customer
  where company_id=p_company_id and lower(customer_name)='walk-in customer' and is_active=true
  order by created_at limit 1;

  if v_customer_id is null then
    insert into public.customer(
      company_id,customer_number,customer_type,customer_name,country,credit_limit,payment_terms_days,is_active,created_by
    ) values (
      p_company_id,public.generate_customer_number(p_company_id),'individual','Walk-in Customer','South Africa',0,0,true,auth.uid()
    ) returning id into v_customer_id;
  end if;
  return v_customer_id;
end;
$$;

create or replace function public.get_pos_workspace(p_branch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company_id uuid;
  v_branch_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.view') then raise exception 'Permission denied: pos.view'; end if;
  v_company_id:=public.current_company_id();

  if p_branch_id is not null then
    select id into v_branch_id from public.branch where id=p_branch_id and company_id=v_company_id;
    if v_branch_id is null then raise exception 'Branch could not be found.'; end if;
  end if;

  select jsonb_build_object(
    'ok',true,
    'selected_branch_id',v_branch_id,
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
    'permissions',jsonb_build_object('can_sell',public.current_user_has_permission('pos.sell'),'can_discount',public.current_user_has_permission('pos.discount'))
  ) into v_result;

  return v_result;
end;
$$;

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
set search_path=public
as $$
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
  v_has_discount boolean:=false;
  v_costing_enabled boolean:=false;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.sell') then raise exception 'Permission denied: pos.sell'; end if;
  if p_payment_method not in ('cash','eft','card','other') then raise exception 'Invalid POS payment method.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Add at least one item to the POS cart.'; end if;

  v_company_id:=public.current_company_id();
  if not exists(select 1 from public.branch where id=p_branch_id and company_id=v_company_id) then raise exception 'Branch could not be found.'; end if;

  select coalesce(enabled,false) into v_costing_enabled from public.company_inventory_costing_settings where company_id=v_company_id;
  if not v_costing_enabled then raise exception 'Inventory costing must be active before POS can sell stock.'; end if;

  select coalesce(vat_registered,false),coalesce(default_vat_rate,0),coalesce(prices_include_vat,false)
  into v_vat_registered,v_tax_rate,v_prices_include_vat
  from public.company_finance_settings where company_id=v_company_id;
  v_tax_mode:=case when v_vat_registered and v_tax_rate>0 then 'vat' else 'none' end;

  if p_customer_id is null then
    v_customer_id:=public.ensure_pos_walk_in_customer(v_company_id);
  else
    select id into v_customer_id from public.customer where id=p_customer_id and company_id=v_company_id and is_active=true;
    if v_customer_id is null then raise exception 'Customer could not be found.'; end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_discount_value:=round(coalesce(nullif(v_item->>'discount_value','')::numeric,0),2);
    if v_discount_value>0 then v_has_discount:=true; end if;
  end loop;
  if v_has_discount and not public.current_user_has_permission('pos.discount') then raise exception 'Permission denied: pos.discount'; end if;

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
  values(v_pos_sale_id,v_company_id,p_branch_id,v_sale_number,v_invoice_id,v_payment_id,v_customer_id,auth.uid(),p_payment_method,v_tendered,v_total,v_change,nullif(trim(coalesce(p_reference,'')),''),'completed',jsonb_build_object('source','pos_checkout'));

  insert into public.pos_sale_item(company_id,pos_sale_id,invoice_item_id,inventory_item_id,description,quantity,catalogue_unit_price,invoice_unit_price,discount_mode,discount_value,line_total)
  select v_company_id,v_pos_sale_id,ii.id,ii.inventory_item_id,ii.description,ii.quantity,inv.selling_price,ii.unit_price,ii.discount_mode,ii.discount_value,ii.line_total
  from public.invoice_item ii
  join public.inventory_item inv on inv.id=ii.inventory_item_id and inv.company_id=ii.company_id
  where ii.invoice_id=v_invoice_id;

  return jsonb_build_object(
    'ok',true,
    'pos_sale_id',v_pos_sale_id,
    'sale_number',v_sale_number,
    'invoice_id',v_invoice_id,
    'invoice_number',v_invoice_number,
    'payment_id',v_payment_id,
    'total',v_total,
    'amount_tendered',v_tendered,
    'change_due',v_change,
    'payment_method',p_payment_method,
    'message','POS sale completed. Invoice, payment, stock, Cost of Sales and Accounting were updated automatically.'
  );
end;
$$;

grant execute on function public.get_pos_workspace(uuid) to authenticated;
grant execute on function public.checkout_pos_sale(uuid,uuid,jsonb,text,numeric,text) to authenticated;
;
