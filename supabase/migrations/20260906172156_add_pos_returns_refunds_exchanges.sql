create table if not exists public.pos_return (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid not null references public.branch(id),
  return_number text not null,
  original_pos_sale_id uuid not null references public.pos_sale(id),
  customer_id uuid not null references public.customer(id),
  processed_by uuid null,
  return_type text not null default 'refund',
  refund_method text not null,
  reason text not null,
  status text not null default 'completed',
  refund_total numeric(14,2) not null default 0,
  tax_total_reversed numeric(14,2) not null default 0,
  cost_total_restored numeric(14,2) not null default 0,
  journal_entry_id uuid null references public.journal_entry(id),
  exchange_pos_sale_id uuid null references public.pos_sale(id),
  metadata jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint pos_return_return_type_check check (return_type in ('refund','exchange')),
  constraint pos_return_refund_method_check check (refund_method in ('cash','card','eft','other')),
  constraint pos_return_status_check check (status in ('completed','cancelled')),
  constraint pos_return_refund_total_check check (refund_total >= 0),
  constraint pos_return_tax_total_check check (tax_total_reversed >= 0),
  constraint pos_return_cost_total_check check (cost_total_restored >= 0),
  constraint pos_return_company_number_unique unique (company_id, return_number)
);

create table if not exists public.pos_return_item (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  pos_return_id uuid not null references public.pos_return(id) on delete cascade,
  original_pos_sale_item_id uuid not null references public.pos_sale_item(id),
  inventory_item_id uuid not null references public.inventory_item(id),
  quantity numeric(14,3) not null,
  unit_refund_amount numeric(14,6) not null,
  refund_amount numeric(14,2) not null,
  tax_amount_reversed numeric(14,2) not null default 0,
  unit_cost_snapshot numeric(18,6) not null,
  cost_restored numeric(18,2) not null,
  inventory_cost_movement_id uuid null references public.inventory_cost_movement(id),
  created_at timestamptz not null default now(),
  constraint pos_return_item_quantity_check check (quantity > 0),
  constraint pos_return_item_refund_check check (refund_amount >= 0),
  constraint pos_return_item_tax_check check (tax_amount_reversed >= 0),
  constraint pos_return_item_unit_cost_check check (unit_cost_snapshot >= 0),
  constraint pos_return_item_cost_check check (cost_restored >= 0)
);

create index if not exists pos_return_company_created_idx
  on public.pos_return(company_id, created_at desc);

create index if not exists pos_return_original_sale_idx
  on public.pos_return(company_id, original_pos_sale_id, status);

create index if not exists pos_return_item_original_idx
  on public.pos_return_item(company_id, original_pos_sale_item_id);

alter table public.pos_return enable row level security;
alter table public.pos_return_item enable row level security;
revoke all on public.pos_return from anon, authenticated;
revoke all on public.pos_return_item from anon, authenticated;

insert into public.permissions(permission_name)
values
  ('pos.return.view'),
  ('pos.return.process'),
  ('pos.return.manage')
on conflict(permission_name) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.permission_name='pos.return.view'
where r.role_name in ('owner','admin','manager','cashier')
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id=r.id and rp.permission_id=p.id
  );

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.permission_name='pos.return.process'
where r.role_name in ('owner','admin','manager')
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id=r.id and rp.permission_id=p.id
  );

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.permission_name='pos.return.manage'
where r.role_name in ('owner','admin')
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id=r.id and rp.permission_id=p.id
  );

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid='public.journal_entry'::regclass
      and conname='journal_entry_source_type_check'
  ) then
    alter table public.journal_entry drop constraint journal_entry_source_type_check;
  end if;
end $$;

alter table public.journal_entry
  add constraint journal_entry_source_type_check
  check (source_type = any (array[
    'manual'::text,
    'invoice'::text,
    'invoice_payment'::text,
    'sales_order_payment'::text,
    'purchase'::text,
    'supplier_payment'::text,
    'expense'::text,
    'bank_transaction'::text,
    'payment_settlement'::text,
    'pos_sale'::text,
    'pos_return'::text,
    'opening_balance'::text,
    'adjustment'::text,
    'reversal'::text
  ]));

create or replace function public.generate_pos_return_number(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_prefix text:=to_char(current_date,'YYYYMM');
  v_seq integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_company_id::text||':pos_return:'||v_prefix));

  select coalesce(max(nullif(regexp_replace(return_number,'^RET-[0-9]{6}-','','g'),'')::integer),0)+1
  into v_seq
  from public.pos_return
  where company_id=p_company_id
    and return_number like 'RET-'||v_prefix||'-%';

  return 'RET-'||v_prefix||'-'||lpad(v_seq::text,5,'0');
end;
$function$;

create or replace function public.get_pos_return_workspace(p_lookup text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_lookup text:=lower(trim(coalesce(p_lookup,'')));
  v_rows jsonb;
  v_recent_returns jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.return.view') then raise exception 'Permission denied: pos.return.view'; end if;

  v_company_id:=public.current_company_id();
  if v_company_id is null then raise exception 'Company could not be resolved.'; end if;

  select coalesce(jsonb_agg(row_data order by (row_data->>'created_at') desc),'[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'pos_sale_id',ps.id,
      'sale_number',ps.sale_number,
      'invoice_id',ps.invoice_id,
      'invoice_number',i.invoice_number,
      'branch_id',ps.branch_id,
      'branch_name',b.branch_name,
      'customer_id',ps.customer_id,
      'customer_name',c.customer_name,
      'payment_method',ps.payment_method,
      'total_amount',ps.total_amount,
      'created_at',ps.created_at,
      'cashier_name',coalesce(up.full_name,up.email,'Unknown'),
      'items',coalesce((
        select jsonb_agg(jsonb_build_object(
          'pos_sale_item_id',psi.id,
          'inventory_item_id',psi.inventory_item_id,
          'name',psi.description,
          'sku',inv.sku,
          'barcode',inv.barcode,
          'sold_quantity',psi.quantity,
          'returned_quantity',coalesce(ret.returned_quantity,0),
          'returnable_quantity',greatest(psi.quantity-coalesce(ret.returned_quantity,0),0),
          'line_total',psi.line_total,
          'unit_refund_amount',case when psi.quantity=0 then 0 else round(psi.line_total/psi.quantity,6) end,
          'unit_cost_snapshot',ii.unit_cost_snapshot,
          'returnable',greatest(psi.quantity-coalesce(ret.returned_quantity,0),0)>0
        ) order by psi.created_at,psi.id)
        from public.pos_sale_item psi
        join public.inventory_item inv on inv.id=psi.inventory_item_id and inv.company_id=psi.company_id
        join public.invoice_item ii on ii.id=psi.invoice_item_id and ii.company_id=psi.company_id
        left join lateral (
          select sum(pri.quantity) as returned_quantity
          from public.pos_return_item pri
          join public.pos_return pr on pr.id=pri.pos_return_id
          where pri.company_id=psi.company_id
            and pri.original_pos_sale_item_id=psi.id
            and pr.status='completed'
        ) ret on true
        where psi.pos_sale_id=ps.id and psi.company_id=ps.company_id
      ),'[]'::jsonb),
      'returnable_total',coalesce((
        select round(sum(
          case
            when psi.quantity<=0 then 0
            else (psi.line_total/psi.quantity)*greatest(psi.quantity-coalesce(ret.returned_quantity,0),0)
          end
        ),2)
        from public.pos_sale_item psi
        left join lateral (
          select sum(pri.quantity) as returned_quantity
          from public.pos_return_item pri
          join public.pos_return pr on pr.id=pri.pos_return_id
          where pri.company_id=psi.company_id
            and pri.original_pos_sale_item_id=psi.id
            and pr.status='completed'
        ) ret on true
        where psi.pos_sale_id=ps.id and psi.company_id=ps.company_id
      ),0)
    ) as row_data
    from public.pos_sale ps
    join public.invoice i on i.id=ps.invoice_id and i.company_id=ps.company_id
    join public.branch b on b.id=ps.branch_id and b.company_id=ps.company_id
    join public.customer c on c.id=ps.customer_id and c.company_id=ps.company_id
    left join public.user_profile up on up.user_id=ps.cashier_user_id and up.company_id=ps.company_id
    where ps.company_id=v_company_id
      and ps.status='completed'
      and (
        v_lookup='' or
        lower(ps.sale_number)=v_lookup or
        lower(i.invoice_number)=v_lookup or
        lower(coalesce(ps.reference,''))=v_lookup or
        lower(c.customer_name) like '%'||v_lookup||'%'
      )
    order by ps.created_at desc
    limit case when v_lookup='' then 20 else 50 end
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',pr.id,
    'return_number',pr.return_number,
    'original_pos_sale_id',pr.original_pos_sale_id,
    'original_sale_number',ps.sale_number,
    'return_type',pr.return_type,
    'refund_method',pr.refund_method,
    'refund_total',pr.refund_total,
    'cost_total_restored',pr.cost_total_restored,
    'reason',pr.reason,
    'status',pr.status,
    'exchange_pos_sale_id',pr.exchange_pos_sale_id,
    'created_at',pr.created_at,
    'processed_by_name',coalesce(up.full_name,up.email,'Unknown')
  ) order by pr.created_at desc),'[]'::jsonb)
  into v_recent_returns
  from public.pos_return pr
  join public.pos_sale ps on ps.id=pr.original_pos_sale_id and ps.company_id=pr.company_id
  left join public.user_profile up on up.user_id=pr.processed_by and up.company_id=pr.company_id
  where pr.company_id=v_company_id
  limit 30;

  return jsonb_build_object(
    'ok',true,
    'sales',coalesce(v_rows,'[]'::jsonb),
    'recent_returns',coalesce(v_recent_returns,'[]'::jsonb),
    'permissions',jsonb_build_object(
      'can_view',public.current_user_has_permission('pos.return.view'),
      'can_process',public.current_user_has_permission('pos.return.process'),
      'can_manage',public.current_user_has_permission('pos.return.manage')
    )
  );
end;
$function$;

create or replace function public.process_pos_return(
  p_pos_sale_id uuid,
  p_items jsonb,
  p_reason text,
  p_return_type text default 'refund',
  p_refund_method text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_sale public.pos_sale%rowtype;
  v_invoice public.invoice%rowtype;
  v_profile public.accounting_posting_profile%rowtype;
  v_currency text:='ZAR';
  v_return_id uuid:=gen_random_uuid();
  v_return_number text;
  v_return_type text:=lower(trim(coalesce(p_return_type,'refund')));
  v_refund_method text;
  v_reason text:=trim(coalesce(p_reason,''));
  v_payment_account uuid;
  v_item jsonb;
  v_sale_item public.pos_sale_item%rowtype;
  v_invoice_item public.invoice_item%rowtype;
  v_qty numeric(14,3);
  v_prior_qty numeric(14,3);
  v_prior_refund numeric(14,2);
  v_prior_tax numeric(14,2);
  v_prior_cost numeric(18,2);
  v_remaining_qty numeric(14,3);
  v_fraction numeric;
  v_refund_amount numeric(14,2);
  v_tax_amount numeric(14,2);
  v_net_revenue numeric(14,2);
  v_cost_restored numeric(18,2);
  v_unit_cost numeric(18,6);
  v_return_item_id uuid;
  v_cost_movement_id uuid;
  v_cost_balance public.inventory_cost_balance%rowtype;
  v_total_refund numeric(14,2):=0;
  v_total_tax numeric(14,2):=0;
  v_total_net_revenue numeric(14,2):=0;
  v_total_cost numeric(18,2):=0;
  v_journal_lines jsonb:='[]'::jsonb;
  v_journal_id uuid;
  v_item_count integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.return.process') then raise exception 'Permission denied: pos.return.process'; end if;

  v_company_id:=public.current_company_id();
  if v_company_id is null then raise exception 'Company could not be resolved.'; end if;

  if v_reason='' or length(v_reason)<3 then raise exception 'A clear return reason is required.'; end if;
  if v_return_type not in ('refund','exchange') then raise exception 'Return type must be refund or exchange.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Select at least one item to return.'; end if;

  select * into v_sale
  from public.pos_sale
  where id=p_pos_sale_id and company_id=v_company_id
  for update;

  if not found then raise exception 'POS sale could not be found.'; end if;
  if v_sale.status<>'completed' then raise exception 'Only completed POS sales can be returned.'; end if;

  select * into v_invoice
  from public.invoice
  where id=v_sale.invoice_id and company_id=v_company_id;

  if not found then raise exception 'Original invoice could not be found.'; end if;

  v_refund_method:=lower(trim(coalesce(p_refund_method,v_sale.payment_method)));
  if v_refund_method not in ('cash','card','eft','other') then raise exception 'Refund method must be cash, card, EFT or other.'; end if;

  if v_refund_method<>v_sale.payment_method and not public.current_user_has_permission('pos.return.manage') then
    raise exception 'Only Owner/Admin may refund to a different payment method.';
  end if;

  perform public.ensure_accounting_posting_profile(v_company_id);
  select * into v_profile from public.accounting_posting_profile where company_id=v_company_id;
  select coalesce(base_currency,'ZAR') into v_currency from public.company_finance_settings where company_id=v_company_id;

  if v_profile.sales_revenue_account_id is null or v_profile.inventory_account_id is null or v_profile.cost_of_sales_account_id is null then
    raise exception 'POS return accounting accounts are not configured.';
  end if;

  v_payment_account:=public.get_accounting_payment_account(v_company_id,v_refund_method);
  v_return_number:=public.generate_pos_return_number(v_company_id);

  insert into public.pos_return(
    id,company_id,branch_id,return_number,original_pos_sale_id,customer_id,processed_by,
    return_type,refund_method,reason,status,refund_total,tax_total_reversed,cost_total_restored,metadata
  ) values (
    v_return_id,v_company_id,v_sale.branch_id,v_return_number,v_sale.id,v_sale.customer_id,auth.uid(),
    v_return_type,v_refund_method,v_reason,'completed',0,0,0,
    jsonb_build_object('original_sale_number',v_sale.sale_number,'original_payment_method',v_sale.payment_method)
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_count:=v_item_count+1;

    select * into v_sale_item
    from public.pos_sale_item
    where id=nullif(v_item->>'pos_sale_item_id','')::uuid
      and pos_sale_id=v_sale.id
      and company_id=v_company_id
    for update;

    if not found then raise exception 'One or more return items do not belong to the original POS sale.'; end if;

    select * into v_invoice_item
    from public.invoice_item
    where id=v_sale_item.invoice_item_id and company_id=v_company_id;

    if not found then raise exception 'Original invoice line could not be found.'; end if;

    v_qty:=round(coalesce(nullif(v_item->>'quantity','')::numeric,0),3);
    if v_qty<=0 then raise exception 'Return quantity must be greater than zero.'; end if;
    if v_qty<>trunc(v_qty) then raise exception 'Current POS returns use whole-number quantities.'; end if;

    select
      coalesce(sum(pri.quantity),0),
      coalesce(sum(pri.refund_amount),0),
      coalesce(sum(pri.tax_amount_reversed),0),
      coalesce(sum(pri.cost_restored),0)
    into v_prior_qty,v_prior_refund,v_prior_tax,v_prior_cost
    from public.pos_return_item pri
    join public.pos_return pr on pr.id=pri.pos_return_id
    where pri.company_id=v_company_id
      and pri.original_pos_sale_item_id=v_sale_item.id
      and pr.status='completed';

    v_remaining_qty:=round(v_sale_item.quantity-v_prior_qty,3);
    if v_remaining_qty<=0 then raise exception '% has already been fully returned.',v_sale_item.description; end if;
    if v_qty>v_remaining_qty then raise exception 'Return quantity for % exceeds the remaining returnable quantity of %.',v_sale_item.description,v_remaining_qty; end if;

    if coalesce(v_invoice_item.total_cost_snapshot,0)<=0 or coalesce(v_invoice_item.unit_cost_snapshot,0)<=0 then
      raise exception 'Original cost snapshot is missing for %. This sale cannot be safely returned automatically.',v_sale_item.description;
    end if;

    v_fraction:=v_qty/v_sale_item.quantity;

    if v_qty=v_remaining_qty then
      v_refund_amount:=round(v_sale_item.line_total-v_prior_refund,2);
      v_tax_amount:=round(coalesce(v_invoice_item.line_tax,0)-v_prior_tax,2);
      v_cost_restored:=round(v_invoice_item.total_cost_snapshot-v_prior_cost,2);
    else
      v_refund_amount:=round(v_sale_item.line_total*v_fraction,2);
      v_tax_amount:=round(coalesce(v_invoice_item.line_tax,0)*v_fraction,2);
      v_cost_restored:=round(v_invoice_item.total_cost_snapshot*v_fraction,2);
    end if;

    v_net_revenue:=round(v_refund_amount-v_tax_amount,2);
    v_unit_cost:=round(v_cost_restored/v_qty,6);

    if v_refund_amount<=0 or v_cost_restored<=0 then
      raise exception 'Return value or cost is invalid for %.',v_sale_item.description;
    end if;

    insert into public.pos_return_item(
      company_id,pos_return_id,original_pos_sale_item_id,inventory_item_id,quantity,
      unit_refund_amount,refund_amount,tax_amount_reversed,unit_cost_snapshot,cost_restored
    ) values (
      v_company_id,v_return_id,v_sale_item.id,v_sale_item.inventory_item_id,v_qty,
      round(v_refund_amount/v_qty,6),v_refund_amount,v_tax_amount,v_unit_cost,v_cost_restored
    ) returning id into v_return_item_id;

    select * into v_cost_balance
    from public.inventory_cost_balance
    where company_id=v_company_id
      and branch_id=v_sale.branch_id
      and inventory_item_id=v_sale_item.inventory_item_id
    for update;

    if not found then raise exception 'Inventory cost balance could not be found for returned item %.',v_sale_item.description; end if;

    update public.inventory_cost_balance
    set quantity_on_hand=round(quantity_on_hand+v_qty,3),
        total_cost=round(total_cost+v_cost_restored,2),
        average_unit_cost=case
          when round(quantity_on_hand+v_qty,3)=0 then 0
          else round((total_cost+v_cost_restored)/(quantity_on_hand+v_qty),6)
        end,
        last_movement_at=now(),
        updated_at=now()
    where id=v_cost_balance.id;

    update public.branch_stock
    set quantity=quantity+v_qty::integer,
        updated_at=now()
    where company_id=v_company_id
      and branch_id=v_sale.branch_id
      and inventory_item_id=v_sale_item.inventory_item_id;

    if not found then raise exception 'Branch stock could not be found for returned item %.',v_sale_item.description; end if;

    insert into public.stock_movement(
      company_id,branch_id,inventory_item_id,user_id,movement_type,quantity,reference,notes
    ) values (
      v_company_id,v_sale.branch_id,v_sale_item.inventory_item_id,auth.uid(),'return',v_qty::integer,
      v_return_number,'POS return of '||v_sale_item.description||' from '||v_sale.sale_number
    );

    insert into public.inventory_cost_movement(
      company_id,branch_id,inventory_item_id,movement_type,quantity,unit_cost,total_cost,movement_date,
      source_type,source_id,source_line_id,reversal_of_movement_id,metadata,created_by
    ) values (
      v_company_id,v_sale.branch_id,v_sale_item.inventory_item_id,'sale_reversal',v_qty,v_unit_cost,v_cost_restored,current_date,
      'pos_return',v_return_id,v_return_item_id,v_invoice_item.cost_movement_id,
      jsonb_build_object('return_number',v_return_number,'original_sale_number',v_sale.sale_number,'reason',v_reason),
      auth.uid()
    ) returning id into v_cost_movement_id;

    update public.pos_return_item
    set inventory_cost_movement_id=v_cost_movement_id
    where id=v_return_item_id;

    v_total_refund:=round(v_total_refund+v_refund_amount,2);
    v_total_tax:=round(v_total_tax+v_tax_amount,2);
    v_total_net_revenue:=round(v_total_net_revenue+v_net_revenue,2);
    v_total_cost:=round(v_total_cost+v_cost_restored,2);
  end loop;

  if v_item_count<>jsonb_array_length(p_items) then raise exception 'Return item processing failed.'; end if;
  if v_total_refund<=0 then raise exception 'Return total must be greater than zero.'; end if;

  v_journal_lines:=v_journal_lines || jsonb_build_array(
    jsonb_build_object(
      'account_id',v_profile.sales_revenue_account_id,
      'description','POS return · '||v_return_number||' · revenue reversal',
      'debit',v_total_net_revenue,
      'credit',0,
      'customer_id',v_sale.customer_id,
      'metadata',jsonb_build_object('role','sales_return','original_sale',v_sale.sale_number)
    )
  );

  if v_total_tax>0 then
    if v_profile.vat_output_account_id is null then raise exception 'VAT Output account is not configured.'; end if;
    v_journal_lines:=v_journal_lines || jsonb_build_array(
      jsonb_build_object(
        'account_id',v_profile.vat_output_account_id,
        'description','POS return · '||v_return_number||' · VAT reversal',
        'debit',v_total_tax,
        'credit',0,
        'customer_id',v_sale.customer_id,
        'metadata',jsonb_build_object('role','vat_return')
      )
    );
  end if;

  v_journal_lines:=v_journal_lines || jsonb_build_array(
    jsonb_build_object(
      'account_id',v_payment_account,
      'description','POS refund · '||v_return_number,
      'debit',0,
      'credit',v_total_refund,
      'customer_id',v_sale.customer_id,
      'metadata',jsonb_build_object('role','refund','payment_method',v_refund_method)
    ),
    jsonb_build_object(
      'account_id',v_profile.inventory_account_id,
      'description','Inventory restored · '||v_return_number,
      'debit',v_total_cost,
      'credit',0,
      'metadata',jsonb_build_object('role','inventory_return')
    ),
    jsonb_build_object(
      'account_id',v_profile.cost_of_sales_account_id,
      'description','Cost of Sales reversed · '||v_return_number,
      'debit',0,
      'credit',v_total_cost,
      'metadata',jsonb_build_object('role','cogs_reversal')
    )
  );

  v_journal_id:=public.create_automatic_accounting_journal(
    v_company_id,
    v_sale.branch_id,
    current_date,
    'POS return/refund · '||v_return_number,
    v_return_number,
    'pos_return',
    v_return_id,
    'completed',
    v_currency,
    auth.uid(),
    v_journal_lines,
    null
  );

  update public.inventory_cost_movement
  set journal_entry_id=v_journal_id
  where company_id=v_company_id
    and source_type='pos_return'
    and source_id=v_return_id;

  update public.pos_return
  set refund_total=v_total_refund,
      tax_total_reversed=v_total_tax,
      cost_total_restored=v_total_cost,
      journal_entry_id=v_journal_id,
      metadata=metadata||jsonb_build_object(
        'net_revenue_reversed',v_total_net_revenue,
        'item_count',v_item_count
      )
  where id=v_return_id;

  return jsonb_build_object(
    'ok',true,
    'return_id',v_return_id,
    'return_number',v_return_number,
    'original_sale_number',v_sale.sale_number,
    'return_type',v_return_type,
    'refund_method',v_refund_method,
    'refund_total',v_total_refund,
    'tax_reversed',v_total_tax,
    'cost_restored',v_total_cost,
    'journal_entry_id',v_journal_id,
    'message',case when v_return_type='exchange'
      then 'Return completed for exchange. Process the replacement item as a new POS sale and link it to this return.'
      else 'POS return and refund completed. Stock, Cost of Sales and Accounting were reversed automatically.'
    end
  );
end;
$function$;

create or replace function public.link_pos_exchange_sale(p_return_id uuid,p_replacement_pos_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_return public.pos_return%rowtype;
  v_sale public.pos_sale%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('pos.return.process') then raise exception 'Permission denied: pos.return.process'; end if;

  v_company_id:=public.current_company_id();

  select * into v_return
  from public.pos_return
  where id=p_return_id and company_id=v_company_id
  for update;

  if not found then raise exception 'Exchange return could not be found.'; end if;
  if v_return.return_type<>'exchange' then raise exception 'This return is not an exchange.'; end if;
  if v_return.status<>'completed' then raise exception 'Only completed returns can be linked to an exchange sale.'; end if;
  if v_return.exchange_pos_sale_id is not null then raise exception 'This exchange is already linked to a replacement sale.'; end if;

  select * into v_sale
  from public.pos_sale
  where id=p_replacement_pos_sale_id and company_id=v_company_id and status='completed';

  if not found then raise exception 'Replacement POS sale could not be found.'; end if;
  if v_sale.branch_id<>v_return.branch_id then raise exception 'Replacement sale must be completed at the same branch as the return.'; end if;

  update public.pos_return
  set exchange_pos_sale_id=v_sale.id,
      metadata=metadata||jsonb_build_object('replacement_sale_number',v_sale.sale_number,'linked_at',now(),'linked_by',auth.uid())
  where id=v_return.id;

  return jsonb_build_object(
    'ok',true,
    'return_number',v_return.return_number,
    'replacement_sale_number',v_sale.sale_number,
    'message','Exchange return linked to the replacement POS sale.'
  );
end;
$function$;

grant execute on function public.generate_pos_return_number(uuid) to authenticated;
grant execute on function public.get_pos_return_workspace(text) to authenticated;
grant execute on function public.process_pos_return(uuid,jsonb,text,text,text) to authenticated;
grant execute on function public.link_pos_exchange_sale(uuid,uuid) to authenticated;;
