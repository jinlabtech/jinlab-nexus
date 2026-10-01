-- Sprint 20.4: Suspend & Recall POS sales

insert into public.permissions(permission_name)
values
  ('pos.suspend'),
  ('pos.recall'),
  ('pos.suspended.manage')
on conflict (permission_name) do nothing;

-- Owner/Admin/Manager can suspend, recall, and manage all held carts.
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.permission_name in ('pos.suspend','pos.recall','pos.suspended.manage')
where r.role_name in ('owner','admin','manager')
on conflict do nothing;

-- Cashier receives only operational POS rights, not management/discount authority.
insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.permission_name in (
  'pos.view',
  'pos.sell',
  'pos.session.open',
  'pos.session.close',
  'pos.cashup.view',
  'pos.suspend',
  'pos.recall'
)
where r.role_name = 'cashier'
on conflict do nothing;

create table if not exists public.pos_suspended_sale (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid not null references public.branch(id) on delete restrict,
  hold_number text not null,
  customer_id uuid null references public.customer(id) on delete set null,
  cashier_user_id uuid not null,
  till_session_id uuid null references public.pos_till_session(id) on delete set null,
  status text not null default 'suspended' check (status in ('suspended','completed','cancelled')),
  estimated_total numeric(14,2) not null default 0 check (estimated_total >= 0),
  notes text null,
  recall_count integer not null default 0 check (recall_count >= 0),
  last_recalled_at timestamptz null,
  last_recalled_by uuid null,
  completed_pos_sale_id uuid null references public.pos_sale(id) on delete set null,
  completed_at timestamptz null,
  cancelled_at timestamptz null,
  cancelled_by uuid null,
  cancel_reason text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, hold_number)
);

create index if not exists idx_pos_suspended_sale_company_branch_status
  on public.pos_suspended_sale(company_id, branch_id, status, created_at desc);

create index if not exists idx_pos_suspended_sale_cashier
  on public.pos_suspended_sale(company_id, cashier_user_id, status, created_at desc);

create table if not exists public.pos_suspended_sale_item (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  suspended_sale_id uuid not null references public.pos_suspended_sale(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_item(id) on delete restrict,
  line_order integer not null default 1,
  description_snapshot text not null,
  sku_snapshot text null,
  barcode_snapshot text null,
  quantity numeric(14,3) not null check (quantity > 0),
  catalogue_unit_price_snapshot numeric(14,2) not null check (catalogue_unit_price_snapshot >= 0),
  discount_mode text not null default 'percentage' check (discount_mode in ('percentage','fixed')),
  discount_value numeric(14,2) not null default 0 check (discount_value >= 0),
  line_total_snapshot numeric(14,2) not null default 0 check (line_total_snapshot >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_pos_suspended_sale_item_parent
  on public.pos_suspended_sale_item(suspended_sale_id, line_order, id);

alter table public.pos_suspended_sale enable row level security;
alter table public.pos_suspended_sale_item enable row level security;

drop policy if exists pos_suspended_sale_select on public.pos_suspended_sale;
create policy pos_suspended_sale_select
on public.pos_suspended_sale
for select
to authenticated
using (
  company_id = public.current_company_id()
  and public.current_user_has_permission('pos.view')
);

drop policy if exists pos_suspended_sale_item_select on public.pos_suspended_sale_item;
create policy pos_suspended_sale_item_select
on public.pos_suspended_sale_item
for select
to authenticated
using (
  company_id = public.current_company_id()
  and public.current_user_has_permission('pos.view')
  and exists (
    select 1
    from public.pos_suspended_sale s
    where s.id = suspended_sale_id
      and s.company_id = public.current_company_id()
  )
);

create or replace function public.pos_capability_enabled(
  p_company_id uuid,
  p_capability_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      (
        coalesce(t.capabilities, '{}'::jsonb)
        || coalesce(s.capability_overrides, '{}'::jsonb)
      ) ->> p_capability_key
    )::boolean,
    false
  )
  from public.company_pos_settings s
  join public.pos_profile_template t
    on t.profile_key = s.profile_key
   and t.is_active = true
  where s.company_id = p_company_id
  limit 1;
$$;

revoke all on function public.pos_capability_enabled(uuid,text) from public, authenticated;
grant execute on function public.pos_capability_enabled(uuid,text) to service_role;

create or replace function public.generate_pos_hold_number(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number text;
begin
  loop
    v_number := 'HOLD-' || to_char(clock_timestamp(),'YYYYMMDD-HH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
    exit when not exists (
      select 1 from public.pos_suspended_sale
      where company_id = p_company_id
        and hold_number = v_number
    );
  end loop;
  return v_number;
end;
$$;

revoke all on function public.generate_pos_hold_number(uuid) from public, authenticated;
grant execute on function public.generate_pos_hold_number(uuid) to service_role;

create or replace function public.suspend_pos_sale(
  p_branch_id uuid,
  p_customer_id uuid default null,
  p_items jsonb default '[]'::jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_settings public.company_pos_settings%rowtype;
  v_template public.pos_profile_template%rowtype;
  v_capabilities jsonb;
  v_session public.pos_till_session%rowtype;
  v_hold_id uuid;
  v_hold_number text;
  v_item jsonb;
  v_inventory public.inventory_item%rowtype;
  v_qty numeric(14,3);
  v_discount_mode text;
  v_discount_value numeric(14,2);
  v_discount_pct numeric(8,4);
  v_line_base numeric(14,2);
  v_line_after_discount numeric(14,2);
  v_line_total numeric(14,2);
  v_estimated_total numeric(14,2) := 0;
  v_vat_registered boolean := false;
  v_tax_rate numeric(8,4) := 0;
  v_prices_include_vat boolean := false;
  v_line_order integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.suspend') then raise exception 'Permission denied: pos.suspend'; end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item before suspending the sale.';
  end if;

  v_company_id := public.current_company_id();
  if v_company_id is null then raise exception 'Company context could not be resolved.'; end if;

  if not exists(select 1 from public.branch where id=p_branch_id and company_id=v_company_id) then
    raise exception 'Branch could not be found.';
  end if;

  insert into public.company_pos_settings(company_id)
  values(v_company_id)
  on conflict(company_id) do nothing;

  select * into v_settings
  from public.company_pos_settings
  where company_id=v_company_id;

  select * into v_template
  from public.pos_profile_template
  where profile_key=v_settings.profile_key
    and is_active=true;

  if not found then raise exception 'POS profile template could not be found.'; end if;

  v_capabilities := coalesce(v_template.capabilities,'{}'::jsonb) || coalesce(v_settings.capability_overrides,'{}'::jsonb);

  if not v_settings.enabled then raise exception 'POS is disabled in company settings.'; end if;
  if coalesce((v_capabilities->>'suspend_sale')::boolean,false)=false then
    raise exception 'Suspend & Recall is disabled for this POS profile.';
  end if;

  -- Mirror the till/branch guard used by completed sales.
  select * into v_session
  from public.pos_till_session
  where company_id=v_company_id
    and cashier_user_id=auth.uid()
    and status='open'
  order by opened_at desc
  limit 1;

  if found then
    if v_session.branch_id <> p_branch_id then
      raise exception 'Your open till session belongs to another branch. Close it before suspending a sale from this branch.';
    end if;
  elsif v_settings.require_cashier_session then
    raise exception 'Open a till session before suspending POS sales.';
  end if;

  if p_customer_id is not null then
    if not exists(
      select 1 from public.customer
      where id=p_customer_id
        and company_id=v_company_id
        and is_active=true
    ) then
      raise exception 'Customer could not be found.';
    end if;
  elsif v_settings.require_customer then
    raise exception 'This POS profile requires a named customer.';
  end if;

  select coalesce(vat_registered,false), coalesce(default_vat_rate,0), coalesce(prices_include_vat,false)
  into v_vat_registered, v_tax_rate, v_prices_include_vat
  from public.company_finance_settings
  where company_id=v_company_id;

  v_hold_id := gen_random_uuid();
  v_hold_number := public.generate_pos_hold_number(v_company_id);

  insert into public.pos_suspended_sale(
    id, company_id, branch_id, hold_number, customer_id, cashier_user_id,
    till_session_id, notes, metadata
  )
  values(
    v_hold_id, v_company_id, p_branch_id, v_hold_number, p_customer_id, auth.uid(),
    case when v_session.id is not null then v_session.id else null end,
    nullif(trim(coalesce(p_notes,'')),''),
    jsonb_build_object('source','pos_suspend','profile_key',v_settings.profile_key)
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_line_order := v_line_order + 1;

    select * into v_inventory
    from public.inventory_item
    where id=(v_item->>'inventory_item_id')::uuid
      and company_id=v_company_id
      and is_active=true;

    if not found then raise exception 'One or more POS items could not be found.'; end if;

    v_qty := round(coalesce(nullif(v_item->>'quantity','')::numeric,0),3);
    if v_qty <= 0 then raise exception 'Suspended item quantity must be greater than zero.'; end if;
    if v_qty <> trunc(v_qty) then raise exception 'Current POS inventory items must use whole-number quantities.'; end if;

    if coalesce((
      select quantity from public.branch_stock
      where company_id=v_company_id
        and branch_id=p_branch_id
        and inventory_item_id=v_inventory.id
    ),0) < v_qty then
      raise exception 'Insufficient stock for %.', v_inventory.item_name;
    end if;

    if round(v_inventory.selling_price,2) <= 0 then
      raise exception 'POS cannot suspend % because its selling price is zero.', v_inventory.item_name;
    end if;

    v_discount_mode := coalesce(nullif(v_item->>'discount_mode',''),'percentage');
    if v_discount_mode not in ('percentage','fixed') then raise exception 'Invalid discount mode.'; end if;

    v_discount_value := round(coalesce(nullif(v_item->>'discount_value','')::numeric,0),2);
    if v_discount_value < 0 then raise exception 'Discount cannot be negative.'; end if;

    v_line_base := round(round(v_inventory.selling_price,2) * v_qty,2);

    if v_discount_value > 0 then
      if coalesce((v_capabilities->>'discounts')::boolean,false)=false then
        raise exception 'Discounts are disabled for this POS profile.';
      end if;
      if not public.current_user_has_permission('pos.discount') then
        raise exception 'Permission denied: pos.discount';
      end if;

      v_discount_pct := case
        when v_discount_mode='percentage' then v_discount_value
        when v_line_base=0 then 0
        else round((v_discount_value/v_line_base)*100,4)
      end;

      if v_discount_pct > v_settings.max_cashier_discount_pct
         and not public.current_user_has_permission('pos.manage') then
        raise exception 'Discount %.2f%% exceeds the cashier limit of %.2f%%.',v_discount_pct,v_settings.max_cashier_discount_pct;
      end if;
    end if;

    v_line_after_discount := case
      when v_discount_mode='percentage' then round(v_line_base * (1-(v_discount_value/100)),2)
      else greatest(round(v_line_base-v_discount_value,2),0)
    end;

    v_line_total := case
      when v_vat_registered and v_tax_rate>0 and not v_prices_include_vat
        then round(v_line_after_discount * (1+(v_tax_rate/100)),2)
      else v_line_after_discount
    end;

    v_estimated_total := v_estimated_total + v_line_total;

    insert into public.pos_suspended_sale_item(
      company_id, suspended_sale_id, inventory_item_id, line_order,
      description_snapshot, sku_snapshot, barcode_snapshot,
      quantity, catalogue_unit_price_snapshot,
      discount_mode, discount_value, line_total_snapshot
    )
    values(
      v_company_id, v_hold_id, v_inventory.id, v_line_order,
      v_inventory.item_name, v_inventory.sku, v_inventory.barcode,
      v_qty, round(v_inventory.selling_price,2),
      v_discount_mode, v_discount_value, v_line_total
    );
  end loop;

  update public.pos_suspended_sale
  set estimated_total=round(v_estimated_total,2), updated_at=now()
  where id=v_hold_id;

  return jsonb_build_object(
    'ok',true,
    'suspended_sale_id',v_hold_id,
    'hold_number',v_hold_number,
    'estimated_total',round(v_estimated_total,2),
    'item_count',v_line_order,
    'message','Sale suspended. No stock, payment, revenue or Accounting entry was created.'
  );
end;
$$;

create or replace function public.get_pos_suspended_sales(p_branch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_can_manage boolean;
  v_enabled boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.view') then raise exception 'Permission denied: pos.view'; end if;

  v_company_id := public.current_company_id();
  if not exists(select 1 from public.branch where id=p_branch_id and company_id=v_company_id) then
    raise exception 'Branch could not be found.';
  end if;

  insert into public.company_pos_settings(company_id)
  values(v_company_id)
  on conflict(company_id) do nothing;

  v_enabled := public.pos_capability_enabled(v_company_id,'suspend_sale');
  v_can_manage := public.current_user_has_permission('pos.suspended.manage');

  return jsonb_build_object(
    'ok',true,
    'enabled',coalesce(v_enabled,false),
    'can_manage',v_can_manage,
    'rows',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',s.id,
          'hold_number',s.hold_number,
          'branch_id',s.branch_id,
          'branch_name',b.branch_name,
          'customer_id',s.customer_id,
          'customer_name',c.customer_name,
          'cashier_user_id',s.cashier_user_id,
          'cashier_name',coalesce(up.full_name,up.email,'User'),
          'estimated_total',s.estimated_total,
          'item_count',(select count(*) from public.pos_suspended_sale_item si where si.suspended_sale_id=s.id),
          'notes',s.notes,
          'created_at',s.created_at,
          'recall_count',s.recall_count,
          'last_recalled_at',s.last_recalled_at,
          'is_mine',s.cashier_user_id=auth.uid()
        )
        order by s.created_at desc
      )
      from public.pos_suspended_sale s
      join public.branch b on b.id=s.branch_id
      left join public.customer c on c.id=s.customer_id
      left join public.user_profile up on up.user_id=s.cashier_user_id and up.company_id=s.company_id
      where s.company_id=v_company_id
        and s.branch_id=p_branch_id
        and s.status='suspended'
        and (v_can_manage or s.cashier_user_id=auth.uid())
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.recall_pos_sale(p_suspended_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_hold public.pos_suspended_sale%rowtype;
  v_can_manage boolean;
  v_enabled boolean;
  v_branch_name text;
  v_customer_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.recall') then raise exception 'Permission denied: pos.recall'; end if;

  v_company_id := public.current_company_id();
  v_can_manage := public.current_user_has_permission('pos.suspended.manage');
  v_enabled := public.pos_capability_enabled(v_company_id,'suspend_sale');

  if not coalesce(v_enabled,false) then
    raise exception 'Suspend & Recall is disabled for this POS profile.';
  end if;

  select * into v_hold
  from public.pos_suspended_sale
  where id=p_suspended_sale_id
    and company_id=v_company_id
    and status='suspended'
  for update;

  if not found then raise exception 'Suspended sale could not be found.'; end if;

  if not v_can_manage and v_hold.cashier_user_id<>auth.uid() then
    raise exception 'You can recall only your own suspended sales.';
  end if;

  select branch_name into v_branch_name from public.branch where id=v_hold.branch_id;
  select customer_name into v_customer_name from public.customer where id=v_hold.customer_id;

  update public.pos_suspended_sale
  set recall_count=recall_count+1,
      last_recalled_at=now(),
      last_recalled_by=auth.uid(),
      updated_at=now()
  where id=v_hold.id;

  return jsonb_build_object(
    'ok',true,
    'id',v_hold.id,
    'hold_number',v_hold.hold_number,
    'branch_id',v_hold.branch_id,
    'branch_name',v_branch_name,
    'customer_id',v_hold.customer_id,
    'customer_name',v_customer_name,
    'notes',v_hold.notes,
    'estimated_total_snapshot',v_hold.estimated_total,
    'items',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'inventory_item_id',si.inventory_item_id,
          'name',coalesce(inv.item_name,si.description_snapshot),
          'sku',coalesce(inv.sku,si.sku_snapshot),
          'barcode',coalesce(inv.barcode,si.barcode_snapshot),
          'quantity',si.quantity,
          'discount_mode',si.discount_mode,
          'discount_value',si.discount_value,
          'snapshot_unit_price',si.catalogue_unit_price_snapshot,
          'current_unit_price',coalesce(inv.selling_price,si.catalogue_unit_price_snapshot),
          'current_stock',coalesce(bs.quantity,0),
          'price_changed',abs(coalesce(inv.selling_price,si.catalogue_unit_price_snapshot)-si.catalogue_unit_price_snapshot)>0.009,
          'stock_short',coalesce(bs.quantity,0)<si.quantity,
          'inactive',coalesce(inv.is_active,false)=false
        )
        order by si.line_order,si.id
      )
      from public.pos_suspended_sale_item si
      left join public.inventory_item inv
        on inv.id=si.inventory_item_id and inv.company_id=si.company_id
      left join public.branch_stock bs
        on bs.company_id=si.company_id
       and bs.branch_id=v_hold.branch_id
       and bs.inventory_item_id=si.inventory_item_id
      where si.suspended_sale_id=v_hold.id
    ),'[]'::jsonb),
    'message','Suspended sale recalled. Current price and stock were rechecked before checkout.'
  );
end;
$$;

create or replace function public.cancel_pos_suspended_sale(
  p_suspended_sale_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_hold public.pos_suspended_sale%rowtype;
  v_can_manage boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.recall') then raise exception 'Permission denied: pos.recall'; end if;

  v_company_id := public.current_company_id();
  v_can_manage := public.current_user_has_permission('pos.suspended.manage');

  select * into v_hold
  from public.pos_suspended_sale
  where id=p_suspended_sale_id
    and company_id=v_company_id
    and status='suspended'
  for update;

  if not found then raise exception 'Suspended sale could not be found.'; end if;

  if not v_can_manage and v_hold.cashier_user_id<>auth.uid() then
    raise exception 'You can discard only your own suspended sales.';
  end if;

  update public.pos_suspended_sale
  set status='cancelled',
      cancelled_at=now(),
      cancelled_by=auth.uid(),
      cancel_reason=nullif(trim(coalesce(p_reason,'')),''),
      updated_at=now()
  where id=v_hold.id;

  return jsonb_build_object(
    'ok',true,
    'id',v_hold.id,
    'hold_number',v_hold.hold_number,
    'message','Suspended sale discarded. No financial or stock transaction was created.'
  );
end;
$$;

-- Replace checkout with a session-compatible version that can atomically finish a recalled held sale.
drop function if exists public.checkout_pos_sale(uuid,uuid,jsonb,text,numeric,text);

create function public.checkout_pos_sale(
  p_branch_id uuid,
  p_customer_id uuid default null,
  p_items jsonb default '[]'::jsonb,
  p_payment_method text default 'cash',
  p_amount_tendered numeric default null,
  p_reference text default null,
  p_suspended_sale_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
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
  v_costing_enabled boolean:=false;
  v_settings public.company_pos_settings%rowtype;
  v_template public.pos_profile_template%rowtype;
  v_capabilities jsonb;
  v_discount_pct numeric(8,4);
  v_line_base numeric(14,2);
  v_hold public.pos_suspended_sale%rowtype;
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
  -- Cashier-session enforcement is performed atomically by attach_pos_till_session_trigger on pos_sale insert.

  if p_suspended_sale_id is not null then
    select * into v_hold
    from public.pos_suspended_sale
    where id=p_suspended_sale_id
      and company_id=v_company_id
      and status='suspended'
    for update;

    if not found then raise exception 'The suspended sale is no longer available.'; end if;
    if v_hold.branch_id<>p_branch_id then raise exception 'The suspended sale belongs to another branch.'; end if;
    if v_hold.cashier_user_id<>auth.uid() and not public.current_user_has_permission('pos.suspended.manage') then
      raise exception 'You cannot complete another cashier''s suspended sale.';
    end if;
  end if;

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
  values(
    v_pos_sale_id,v_company_id,p_branch_id,v_sale_number,v_invoice_id,v_payment_id,v_customer_id,auth.uid(),
    p_payment_method,v_tendered,v_total,v_change,nullif(trim(coalesce(p_reference,'')),''),'completed',
    jsonb_strip_nulls(jsonb_build_object(
      'source','pos_checkout',
      'profile_key',v_settings.profile_key,
      'suspended_sale_id',p_suspended_sale_id
    ))
  );

  insert into public.pos_sale_item(company_id,pos_sale_id,invoice_item_id,inventory_item_id,description,quantity,catalogue_unit_price,invoice_unit_price,discount_mode,discount_value,line_total)
  select v_company_id,v_pos_sale_id,ii.id,ii.inventory_item_id,ii.description,ii.quantity,inv.selling_price,ii.unit_price,ii.discount_mode,ii.discount_value,ii.line_total
  from public.invoice_item ii
  join public.inventory_item inv on inv.id=ii.inventory_item_id and inv.company_id=ii.company_id
  where ii.invoice_id=v_invoice_id;

  if p_suspended_sale_id is not null then
    update public.pos_suspended_sale
    set status='completed',
        completed_pos_sale_id=v_pos_sale_id,
        completed_at=now(),
        updated_at=now()
    where id=p_suspended_sale_id
      and company_id=v_company_id
      and status='suspended';

    if not found then
      raise exception 'Suspended sale completion could not be recorded.';
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,'pos_sale_id',v_pos_sale_id,'sale_number',v_sale_number,'invoice_id',v_invoice_id,
    'invoice_number',v_invoice_number,'payment_id',v_payment_id,'total',v_total,'amount_tendered',v_tendered,
    'change_due',v_change,'payment_method',p_payment_method,'profile_key',v_settings.profile_key,
    'suspended_sale_id',p_suspended_sale_id,
    'message','POS sale completed. Invoice, payment, stock, Cost of Sales and Accounting were updated automatically.'
  );
end;
$$;

revoke all on function public.suspend_pos_sale(uuid,uuid,jsonb,text) from public;
revoke all on function public.get_pos_suspended_sales(uuid) from public;
revoke all on function public.recall_pos_sale(uuid) from public;
revoke all on function public.cancel_pos_suspended_sale(uuid,text) from public;
revoke all on function public.checkout_pos_sale(uuid,uuid,jsonb,text,numeric,text,uuid) from public;

grant execute on function public.suspend_pos_sale(uuid,uuid,jsonb,text) to authenticated, service_role;
grant execute on function public.get_pos_suspended_sales(uuid) to authenticated, service_role;
grant execute on function public.recall_pos_sale(uuid) to authenticated, service_role;
grant execute on function public.cancel_pos_suspended_sale(uuid,text) to authenticated, service_role;
grant execute on function public.checkout_pos_sale(uuid,uuid,jsonb,text,numeric,text,uuid) to authenticated, service_role;;
