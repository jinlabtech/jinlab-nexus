insert into public.permissions(permission_name)
values ('accounting.inventory_costing.manage')
on conflict (permission_name) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.permission_name='accounting.inventory_costing.manage'
where r.role_name in ('owner','admin')
on conflict do nothing;

create table if not exists public.company_inventory_costing_settings (
  company_id uuid primary key references public.company(id) on delete cascade,
  costing_method text not null default 'weighted_average',
  enabled boolean not null default false,
  activated_at timestamptz,
  activated_by uuid,
  stock_counts_confirmed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_inventory_costing_method_check check (costing_method in ('weighted_average'))
);

create table if not exists public.inventory_cost_balance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid not null references public.branch(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_item(id) on delete cascade,
  quantity_on_hand numeric(18,3) not null default 0,
  total_cost numeric(18,2) not null default 0,
  average_unit_cost numeric(18,6) not null default 0,
  last_movement_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_cost_balance_quantity_check check (quantity_on_hand >= 0),
  constraint inventory_cost_balance_total_cost_check check (total_cost >= 0),
  constraint inventory_cost_balance_average_cost_check check (average_unit_cost >= 0),
  unique(company_id,branch_id,inventory_item_id)
);

create table if not exists public.inventory_cost_movement (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid not null references public.branch(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_item(id) on delete cascade,
  movement_type text not null,
  quantity numeric(18,3) not null,
  unit_cost numeric(18,6) not null,
  total_cost numeric(18,2) not null,
  movement_date date not null default current_date,
  source_type text not null,
  source_id uuid not null,
  source_line_id uuid,
  journal_entry_id uuid references public.journal_entry(id) on delete set null,
  reversal_of_movement_id uuid references public.inventory_cost_movement(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint inventory_cost_movement_type_check check (movement_type in ('opening','purchase_receipt','sale','sale_reversal','adjustment_in','adjustment_out')),
  constraint inventory_cost_movement_quantity_check check (quantity > 0),
  constraint inventory_cost_movement_unit_cost_check check (unit_cost >= 0),
  constraint inventory_cost_movement_total_cost_check check (total_cost >= 0)
);

create unique index if not exists inventory_cost_movement_source_uidx
on public.inventory_cost_movement(
  company_id,
  source_type,
  source_id,
  coalesce(source_line_id,'00000000-0000-0000-0000-000000000000'::uuid),
  movement_type
);

alter table public.invoice_item
  add column if not exists unit_cost_snapshot numeric(18,6),
  add column if not exists total_cost_snapshot numeric(18,2),
  add column if not exists costing_method text,
  add column if not exists costed_at timestamptz,
  add column if not exists cost_movement_id uuid references public.inventory_cost_movement(id) on delete set null;

alter table public.company_inventory_costing_settings enable row level security;
alter table public.inventory_cost_balance enable row level security;
alter table public.inventory_cost_movement enable row level security;

create policy company_inventory_costing_settings_select
on public.company_inventory_costing_settings
for select to authenticated
using (
  company_id=public.current_company_id()
  and (public.current_user_has_permission('accounting.view') or public.current_user_has_permission('inventory.view'))
);

create policy inventory_cost_balance_select
on public.inventory_cost_balance
for select to authenticated
using (
  company_id=public.current_company_id()
  and (public.current_user_has_permission('accounting.view') or public.current_user_has_permission('inventory.view'))
);

create policy inventory_cost_movement_select
on public.inventory_cost_movement
for select to authenticated
using (
  company_id=public.current_company_id()
  and (public.current_user_has_permission('accounting.view') or public.current_user_has_permission('inventory.view'))
);

create or replace function public.ensure_company_inventory_costing_settings(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $function$
begin
  if p_company_id is null then
    raise exception 'Company is required.';
  end if;

  insert into public.company_inventory_costing_settings(company_id)
  values (p_company_id)
  on conflict (company_id) do nothing;
end;
$function$;

create or replace function public.get_inventory_costing_readiness()
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_company_id uuid;
  v_enabled boolean := false;
  v_method text := 'weighted_average';
  v_accounting_enabled boolean := false;
  v_auto_journals boolean := false;
  v_auto_invoice boolean := false;
  v_basis text := 'accrual';
  v_inventory_account_id uuid;
  v_cogs_account_id uuid;
  v_owner_equity_id uuid;
  v_inventory_ledger numeric := 0;
  v_stock_valuation numeric := 0;
  v_missing_cost bigint := 0;
  v_stock_units numeric := 0;
  v_historical_sold_qty numeric := 0;
  v_historical_product_revenue numeric := 0;
  v_zero_price_lines bigint := 0;
  v_rows jsonb := '[]'::jsonb;
  v_can_activate boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('accounting.view') then
    raise exception 'Permission denied: accounting.view';
  end if;

  v_company_id := public.current_company_id();
  if v_company_id is null then
    raise exception 'Your account is not linked to a company.';
  end if;

  perform public.ensure_company_inventory_costing_settings(v_company_id);
  perform public.ensure_accounting_posting_profile(v_company_id);

  select enabled,costing_method
  into v_enabled,v_method
  from public.company_inventory_costing_settings
  where company_id=v_company_id;

  select coalesce(accounting_enabled,false),coalesce(automatic_journals,false),coalesce(automatic_invoice_posting,false)
  into v_accounting_enabled,v_auto_journals,v_auto_invoice
  from public.company_accounting_settings
  where company_id=v_company_id;

  select coalesce(accounting_basis,'accrual')
  into v_basis
  from public.company_finance_settings
  where company_id=v_company_id;

  select inventory_account_id,cost_of_sales_account_id
  into v_inventory_account_id,v_cogs_account_id
  from public.accounting_posting_profile
  where company_id=v_company_id;

  select id into v_owner_equity_id
  from public.accounting_account
  where company_id=v_company_id and system_key='owner_equity' and is_active=true
  limit 1;

  if v_inventory_account_id is not null then
    select round(coalesce(sum(jl.debit-jl.credit),0),2)
    into v_inventory_ledger
    from public.journal_entry je
    join public.journal_line jl on jl.journal_entry_id=je.id and jl.company_id=je.company_id
    where je.company_id=v_company_id and je.status='posted' and jl.account_id=v_inventory_account_id;
  end if;

  select
    round(coalesce(sum(bs.quantity * coalesce(ii.cost_price,0)),0),2),
    coalesce(sum(bs.quantity),0),
    count(*) filter (where bs.quantity>0 and coalesce(ii.cost_price,0)<=0)
  into v_stock_valuation,v_stock_units,v_missing_cost
  from public.branch_stock bs
  join public.inventory_item ii on ii.id=bs.inventory_item_id and ii.company_id=bs.company_id
  where bs.company_id=v_company_id and bs.quantity>0;

  select
    coalesce(sum(ii.quantity),0),
    round(coalesce(sum(ii.line_subtotal-ii.line_discount),0),2),
    count(*) filter (where ii.unit_price=0)
  into v_historical_sold_qty,v_historical_product_revenue,v_zero_price_lines
  from public.invoice i
  join public.invoice_item ii on ii.invoice_id=i.id and ii.company_id=i.company_id
  where i.company_id=v_company_id
    and i.status<>'cancelled'
    and ii.inventory_item_id is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'branch_id',b.id,
    'branch_name',b.branch_name,
    'inventory_item_id',ii.id,
    'item_name',ii.item_name,
    'sku',ii.sku,
    'quantity',bs.quantity,
    'catalog_unit_cost',ii.cost_price,
    'opening_value',round(bs.quantity*coalesce(ii.cost_price,0),2),
    'cost_ok',coalesce(ii.cost_price,0)>0
  ) order by b.branch_name,ii.item_name),'[]'::jsonb)
  into v_rows
  from public.branch_stock bs
  join public.branch b on b.id=bs.branch_id and b.company_id=bs.company_id
  join public.inventory_item ii on ii.id=bs.inventory_item_id and ii.company_id=bs.company_id
  where bs.company_id=v_company_id and bs.quantity>0;

  v_can_activate :=
    not v_enabled
    and v_missing_cost=0
    and v_accounting_enabled
    and v_auto_journals
    and v_auto_invoice
    and v_basis='accrual'
    and v_inventory_account_id is not null
    and v_cogs_account_id is not null
    and v_owner_equity_id is not null;

  return jsonb_build_object(
    'ok',true,
    'company_id',v_company_id,
    'enabled',v_enabled,
    'costing_method',v_method,
    'can_activate',v_can_activate,
    'requires_stock_count_confirmation',true,
    'summary',jsonb_build_object(
      'physical_units',v_stock_units,
      'opening_stock_valuation',v_stock_valuation,
      'inventory_ledger_balance',v_inventory_ledger,
      'cutover_adjustment',round(v_stock_valuation-v_inventory_ledger,2),
      'missing_cost_items',v_missing_cost,
      'historical_product_units_sold',v_historical_sold_qty,
      'historical_product_revenue',v_historical_product_revenue,
      'historical_zero_price_product_lines',v_zero_price_lines
    ),
    'accounting',jsonb_build_object(
      'enabled',v_accounting_enabled,
      'automatic_journals',v_auto_journals,
      'automatic_invoice_posting',v_auto_invoice,
      'basis',v_basis,
      'inventory_account_configured',v_inventory_account_id is not null,
      'cost_of_sales_account_configured',v_cogs_account_id is not null,
      'owner_equity_account_configured',v_owner_equity_id is not null
    ),
    'opening_stock',v_rows,
    'warning','Activation is a cutover, not a historical COGS backfill. Confirm physical stock counts and catalog costs before activation. Historical product sales remain unchanged.'
  );
end;
$function$;

create or replace function public.activate_inventory_costing(p_confirm_stock_counts boolean default false,p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_company_id uuid;
  v_readiness jsonb;
  v_profile public.accounting_posting_profile%rowtype;
  v_owner_equity_id uuid;
  v_currency text := 'ZAR';
  v_branch record;
  v_desired numeric;
  v_ledger numeric;
  v_diff numeric;
  v_lines jsonb;
  v_journal_id uuid;
  v_adjustment_total numeric := 0;
  v_seeded_rows bigint := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('accounting.inventory_costing.manage') then
    raise exception 'Permission denied: accounting.inventory_costing.manage';
  end if;

  if not coalesce(p_confirm_stock_counts,false) then
    raise exception 'Confirm the physical stock counts before activating inventory costing.';
  end if;

  v_company_id := public.current_company_id();
  if v_company_id is null then
    raise exception 'Your account is not linked to a company.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('inventory-costing-activate-'||v_company_id::text,0));
  perform public.ensure_company_inventory_costing_settings(v_company_id);

  if exists(select 1 from public.company_inventory_costing_settings where company_id=v_company_id and enabled=true) then
    return jsonb_build_object('ok',true,'already_enabled',true);
  end if;

  v_readiness := public.get_inventory_costing_readiness();
  if not coalesce((v_readiness->>'can_activate')::boolean,false) then
    raise exception 'Inventory costing is not ready for activation. Review the readiness report first.';
  end if;

  select * into v_profile
  from public.accounting_posting_profile
  where company_id=v_company_id;

  select id into v_owner_equity_id
  from public.accounting_account
  where company_id=v_company_id and system_key='owner_equity' and is_active=true
  limit 1;

  select coalesce(base_currency,'ZAR') into v_currency
  from public.company_finance_settings where company_id=v_company_id;

  delete from public.inventory_cost_movement where company_id=v_company_id and movement_type='opening' and source_type='inventory_cutover';
  delete from public.inventory_cost_balance where company_id=v_company_id;

  insert into public.inventory_cost_balance(
    company_id,branch_id,inventory_item_id,quantity_on_hand,total_cost,average_unit_cost,last_movement_at,updated_at
  )
  select
    bs.company_id,bs.branch_id,bs.inventory_item_id,bs.quantity,
    round(bs.quantity*ii.cost_price,2),
    round(ii.cost_price,6),now(),now()
  from public.branch_stock bs
  join public.inventory_item ii on ii.id=bs.inventory_item_id and ii.company_id=bs.company_id
  where bs.company_id=v_company_id and bs.quantity>0;

  get diagnostics v_seeded_rows = row_count;

  insert into public.inventory_cost_movement(
    company_id,branch_id,inventory_item_id,movement_type,quantity,unit_cost,total_cost,movement_date,
    source_type,source_id,metadata,created_by
  )
  select
    bs.company_id,bs.branch_id,bs.inventory_item_id,'opening',bs.quantity,round(ii.cost_price,6),
    round(bs.quantity*ii.cost_price,2),current_date,'inventory_cutover',bs.id,
    jsonb_build_object('basis','confirmed branch stock quantity × catalog cost at cutover','historical_backfill',false),auth.uid()
  from public.branch_stock bs
  join public.inventory_item ii on ii.id=bs.inventory_item_id and ii.company_id=bs.company_id
  where bs.company_id=v_company_id and bs.quantity>0;

  for v_branch in
    select b.id,b.branch_name
    from public.branch b
    where b.company_id=v_company_id
  loop
    select round(coalesce(sum(total_cost),0),2)
    into v_desired
    from public.inventory_cost_balance
    where company_id=v_company_id and branch_id=v_branch.id;

    select round(coalesce(sum(jl.debit-jl.credit),0),2)
    into v_ledger
    from public.journal_entry je
    join public.journal_line jl on jl.journal_entry_id=je.id and jl.company_id=je.company_id
    where je.company_id=v_company_id and je.status='posted' and je.branch_id=v_branch.id
      and jl.account_id=v_profile.inventory_account_id;

    v_diff := round(v_desired-v_ledger,2);

    if v_diff<>0 then
      if v_diff>0 then
        v_lines := jsonb_build_array(
          jsonb_build_object('account_id',v_profile.inventory_account_id,'description','Inventory costing cutover · '||v_branch.branch_name,'debit',v_diff,'credit',0,'metadata',jsonb_build_object('role','inventory_cutover')),
          jsonb_build_object('account_id',v_owner_equity_id,'description','Opening inventory equity · '||v_branch.branch_name,'debit',0,'credit',v_diff,'metadata',jsonb_build_object('role','opening_equity'))
        );
      else
        v_lines := jsonb_build_array(
          jsonb_build_object('account_id',v_owner_equity_id,'description','Opening inventory equity adjustment · '||v_branch.branch_name,'debit',abs(v_diff),'credit',0,'metadata',jsonb_build_object('role','opening_equity')),
          jsonb_build_object('account_id',v_profile.inventory_account_id,'description','Inventory costing cutover adjustment · '||v_branch.branch_name,'debit',0,'credit',abs(v_diff),'metadata',jsonb_build_object('role','inventory_cutover'))
        );
      end if;

      v_journal_id := public.create_automatic_accounting_journal(
        v_company_id,v_branch.id,current_date,'Inventory costing cutover · '||v_branch.branch_name,
        'Inventory costing cutover','opening_balance',v_branch.id,'inventory_costing_cutover',v_currency,auth.uid(),v_lines,null
      );

      v_adjustment_total := v_adjustment_total+v_diff;
    end if;
  end loop;

  update public.company_inventory_costing_settings
  set enabled=true,
      costing_method='weighted_average',
      activated_at=now(),
      activated_by=auth.uid(),
      stock_counts_confirmed_at=now(),
      notes=nullif(trim(coalesce(p_notes,'')),''),
      updated_at=now()
  where company_id=v_company_id;

  return jsonb_build_object(
    'ok',true,
    'enabled',true,
    'costing_method','weighted_average',
    'seeded_stock_rows',v_seeded_rows,
    'ledger_cutover_adjustment',round(v_adjustment_total,2),
    'message','Inventory costing activated from the confirmed stock cutover. Historical sales were not rewritten.'
  );
end;
$function$;

grant execute on function public.get_inventory_costing_readiness() to authenticated;
grant execute on function public.activate_inventory_costing(boolean,text) to authenticated;
;
