create table if not exists public.supplier_bill (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  supplier_id uuid not null references public.supplier(id),
  branch_id uuid references public.branch(id),
  purchase_order_id uuid references public.purchase_order(id),
  purchase_receipt_id uuid references public.purchase_receipt(id),
  bill_number text not null,
  supplier_invoice_number text,
  bill_date date not null default current_date,
  due_date date,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14,2) not null check (total_amount > 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  balance_due numeric(14,2) not null check (balance_due >= 0),
  status text not null default 'unpaid' check (status in ('unpaid','partially_paid','paid','cancelled')),
  notes text,
  accounting_journal_id uuid references public.journal_entry(id),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,bill_number),
  unique(company_id,purchase_receipt_id),
  check (amount_paid <= total_amount),
  check (balance_due = total_amount - amount_paid)
);

create table if not exists public.supplier_bill_payment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  supplier_bill_id uuid not null references public.supplier_bill(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('eft','cash','card','other')),
  payment_date date not null default current_date,
  reference text,
  journal_entry_id uuid references public.journal_entry(id),
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists supplier_bill_company_status_idx
  on public.supplier_bill(company_id,status,due_date);
create index if not exists supplier_bill_supplier_idx
  on public.supplier_bill(company_id,supplier_id);
create index if not exists supplier_bill_payment_bill_idx
  on public.supplier_bill_payment(company_id,supplier_bill_id,payment_date);

alter table public.supplier_bill enable row level security;
alter table public.supplier_bill_payment enable row level security;

insert into public.permissions(permission_name)
select 'accounting.payables.manage'
where not exists (
  select 1 from public.permissions where permission_name='accounting.payables.manage'
);

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
cross join public.permissions p
where r.role_name in ('owner','admin')
  and p.permission_name='accounting.payables.manage'
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id=r.id and rp.permission_id=p.id
  );

create policy supplier_bill_select_policy
on public.supplier_bill
for select
to authenticated
using (
  company_id = public.current_company_id()
  and public.current_user_has_permission('accounting.view')
);

create policy supplier_bill_write_policy
on public.supplier_bill
for all
to authenticated
using (
  company_id = public.current_company_id()
  and public.current_user_has_permission('accounting.payables.manage')
)
with check (
  company_id = public.current_company_id()
  and public.current_user_has_permission('accounting.payables.manage')
);

create policy supplier_bill_payment_select_policy
on public.supplier_bill_payment
for select
to authenticated
using (
  company_id = public.current_company_id()
  and public.current_user_has_permission('accounting.view')
);

create policy supplier_bill_payment_write_policy
on public.supplier_bill_payment
for all
to authenticated
using (
  company_id = public.current_company_id()
  and public.current_user_has_permission('accounting.payables.manage')
)
with check (
  company_id = public.current_company_id()
  and public.current_user_has_permission('accounting.payables.manage')
);

create or replace function public.generate_supplier_bill_number(target_company_id uuid)
returns text
language plpgsql
set search_path='public'
as $$
declare
  next_number integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('jinlab-supplier-bill-' || target_company_id::text,0));

  select coalesce(max(substring(bill_number from '[0-9]+$')::integer),0)+1
  into next_number
  from public.supplier_bill
  where company_id=target_company_id;

  return 'BILL-' || to_char(current_date,'YYYYMM') || '-' || lpad(next_number::text,5,'0');
end;
$$;

create or replace function public.create_supplier_bill_from_receipt(
  p_purchase_receipt_id uuid,
  p_due_date date default null,
  p_supplier_invoice_number text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_company_id uuid;
  v_receipt public.purchase_receipt%rowtype;
  v_po public.purchase_order%rowtype;
  v_bill public.supplier_bill%rowtype;
  v_subtotal numeric(14,2);
  v_tax numeric(14,2);
  v_total numeric(14,2);
  v_vat_registered boolean := false;
  v_inventory_id uuid;
  v_vat_input_id uuid;
  v_ap_id uuid;
  v_lines jsonb;
  v_journal_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('accounting.payables.manage') then
    raise exception 'Permission denied: accounting.payables.manage';
  end if;

  v_company_id := public.current_company_id();

  select * into v_receipt
  from public.purchase_receipt
  where id=p_purchase_receipt_id and company_id=v_company_id;
  if not found then raise exception 'Purchase receipt could not be found.'; end if;

  if exists (
    select 1 from public.supplier_bill
    where company_id=v_company_id and purchase_receipt_id=v_receipt.id and status <> 'cancelled'
  ) then
    select * into v_bill from public.supplier_bill
    where company_id=v_company_id and purchase_receipt_id=v_receipt.id and status <> 'cancelled'
    limit 1;
    return jsonb_build_object('ok',true,'already_exists',true,'bill_id',v_bill.id,'bill_number',v_bill.bill_number,'balance_due',v_bill.balance_due);
  end if;

  select * into v_po from public.purchase_order
  where id=v_receipt.purchase_order_id and company_id=v_company_id;
  if not found then raise exception 'Purchase order could not be found.'; end if;

  select
    round(coalesce(sum(pri.quantity_received * pri.unit_cost),0),2),
    round(coalesce(sum((pri.quantity_received * pri.unit_cost) * (coalesce(poi.tax_rate,0)/100.0)),0),2)
  into v_subtotal,v_tax
  from public.purchase_receipt_item pri
  join public.purchase_order_item poi
    on poi.id=pri.purchase_order_item_id and poi.company_id=pri.company_id
  where pri.company_id=v_company_id and pri.purchase_receipt_id=v_receipt.id;

  if coalesce(v_subtotal,0) <= 0 then raise exception 'Purchase receipt has no billable stock value.'; end if;
  v_total := round(v_subtotal + v_tax,2);

  select coalesce(vat_registered,false)
  into v_vat_registered
  from public.company_finance_settings
  where company_id=v_company_id;

  select id into v_inventory_id from public.accounting_account
  where company_id=v_company_id and system_key='inventory' and is_active=true limit 1;
  select id into v_ap_id from public.accounting_account
  where company_id=v_company_id and system_key='accounts_payable' and is_active=true limit 1;
  select id into v_vat_input_id from public.accounting_account
  where company_id=v_company_id and system_key='vat_input' and is_active=true limit 1;

  if v_inventory_id is null or v_ap_id is null then
    raise exception 'Inventory or Trade Creditors accounting account is not configured.';
  end if;
  if v_vat_registered and v_tax > 0 and v_vat_input_id is null then
    raise exception 'VAT Input accounting account is not configured.';
  end if;

  insert into public.supplier_bill(
    company_id,supplier_id,branch_id,purchase_order_id,purchase_receipt_id,
    bill_number,supplier_invoice_number,bill_date,due_date,subtotal,tax_amount,
    total_amount,amount_paid,balance_due,status,notes,created_by
  ) values (
    v_company_id,v_po.supplier_id,v_receipt.branch_id,v_po.id,v_receipt.id,
    public.generate_supplier_bill_number(v_company_id),
    nullif(trim(coalesce(p_supplier_invoice_number,'')),''),
    v_receipt.received_at::date,
    p_due_date,
    v_subtotal,
    v_tax,
    v_total,
    0,
    v_total,
    'unpaid',
    nullif(trim(coalesce(p_notes,'')),''),
    auth.uid()
  ) returning * into v_bill;

  if v_vat_registered and v_tax > 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id',v_inventory_id,'debit',v_subtotal,'credit',0,'description','Stock received from supplier'),
      jsonb_build_object('account_id',v_vat_input_id,'debit',v_tax,'credit',0,'description','Input VAT on supplier stock'),
      jsonb_build_object('account_id',v_ap_id,'debit',0,'credit',v_total,'description','Amount owed to supplier')
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id',v_inventory_id,'debit',v_total,'credit',0,'description','Stock received from supplier'),
      jsonb_build_object('account_id',v_ap_id,'debit',0,'credit',v_total,'description','Amount owed to supplier')
    );
  end if;

  v_journal_id := public.create_automatic_accounting_journal(
    v_company_id,
    v_receipt.branch_id,
    v_receipt.received_at::date,
    'Stock received on supplier credit · ' || v_bill.bill_number,
    coalesce(v_bill.supplier_invoice_number,v_receipt.receipt_number),
    'purchase',
    v_bill.id,
    'supplier_bill',
    'ZAR',
    auth.uid(),
    v_lines,
    null
  );

  update public.supplier_bill
  set accounting_journal_id=v_journal_id,updated_at=now()
  where id=v_bill.id;

  return jsonb_build_object(
    'ok',true,
    'bill_id',v_bill.id,
    'bill_number',v_bill.bill_number,
    'supplier_id',v_bill.supplier_id,
    'total_amount',v_total,
    'balance_due',v_total,
    'status','unpaid',
    'journal_entry_id',v_journal_id,
    'simple_message','Stock received. Inventory increased and the amount now appears under What We Owe.'
  );
end;
$$;

create or replace function public.pay_supplier_bill(
  p_supplier_bill_id uuid,
  p_amount numeric default null,
  p_payment_method text default 'eft',
  p_payment_date date default current_date,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_company_id uuid;
  v_bill public.supplier_bill%rowtype;
  v_amount numeric(14,2);
  v_payment_id uuid;
  v_ap_id uuid;
  v_credit_account_id uuid;
  v_journal_id uuid;
  v_new_paid numeric(14,2);
  v_new_balance numeric(14,2);
  v_new_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('accounting.payables.manage') then
    raise exception 'Permission denied: accounting.payables.manage';
  end if;
  if p_payment_method not in ('eft','cash','card','other') then raise exception 'Invalid payment method.'; end if;

  v_company_id := public.current_company_id();

  select * into v_bill from public.supplier_bill
  where id=p_supplier_bill_id and company_id=v_company_id
  for update;
  if not found then raise exception 'Supplier bill could not be found.'; end if;
  if v_bill.status in ('paid','cancelled') then raise exception 'This supplier bill cannot receive another payment.'; end if;

  v_amount := round(coalesce(p_amount,v_bill.balance_due),2);
  if v_amount <= 0 then raise exception 'Payment amount must be greater than zero.'; end if;
  if v_amount > v_bill.balance_due then raise exception 'Payment exceeds the supplier bill balance.'; end if;

  select id into v_ap_id from public.accounting_account
  where company_id=v_company_id and system_key='accounts_payable' and is_active=true limit 1;

  select id into v_credit_account_id from public.accounting_account
  where company_id=v_company_id and is_active=true
    and system_key = case
      when p_payment_method='eft' then 'bank'
      when p_payment_method='cash' then 'cash_on_hand'
      else 'payment_clearing'
    end
  limit 1;

  if v_ap_id is null or v_credit_account_id is null then
    raise exception 'Supplier payment accounting accounts are not configured.';
  end if;

  insert into public.supplier_bill_payment(
    company_id,supplier_bill_id,amount,payment_method,payment_date,reference,created_by
  ) values (
    v_company_id,v_bill.id,v_amount,p_payment_method,coalesce(p_payment_date,current_date),
    nullif(trim(coalesce(p_reference,'')),''),auth.uid()
  ) returning id into v_payment_id;

  v_journal_id := public.create_automatic_accounting_journal(
    v_company_id,
    v_bill.branch_id,
    coalesce(p_payment_date,current_date),
    'Supplier payment · ' || v_bill.bill_number,
    nullif(trim(coalesce(p_reference,'')),''),
    'supplier_payment',
    v_payment_id,
    'paid',
    'ZAR',
    auth.uid(),
    jsonb_build_array(
      jsonb_build_object('account_id',v_ap_id,'debit',v_amount,'credit',0,'description','Reduce amount owed to supplier'),
      jsonb_build_object('account_id',v_credit_account_id,'debit',0,'credit',v_amount,'description','Supplier payment')
    ),
    null
  );

  update public.supplier_bill_payment set journal_entry_id=v_journal_id where id=v_payment_id;

  v_new_paid := round(v_bill.amount_paid + v_amount,2);
  v_new_balance := round(v_bill.total_amount - v_new_paid,2);
  v_new_status := case when v_new_balance=0 then 'paid' else 'partially_paid' end;

  update public.supplier_bill
  set amount_paid=v_new_paid,balance_due=v_new_balance,status=v_new_status,updated_at=now()
  where id=v_bill.id;

  return jsonb_build_object(
    'ok',true,
    'bill_id',v_bill.id,
    'bill_number',v_bill.bill_number,
    'payment_id',v_payment_id,
    'amount_paid_now',v_amount,
    'amount_paid_total',v_new_paid,
    'balance_due',v_new_balance,
    'status',v_new_status,
    'journal_entry_id',v_journal_id,
    'simple_message',case when v_new_balance=0 then 'Supplier bill paid in full. What We Owe has been reduced.' else 'Part payment recorded. What We Owe has been reduced by the payment amount.' end
  );
end;
$$;

create or replace function public.get_supplier_payables_workspace(p_as_of_date date default current_date)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_company_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('accounting.view') then raise exception 'Permission denied: accounting.view'; end if;
  v_company_id := public.current_company_id();

  select jsonb_build_object(
    'ok',true,
    'as_of_date',coalesce(p_as_of_date,current_date),
    'summary',jsonb_build_object(
      'total_owed',coalesce((select round(sum(balance_due),2) from public.supplier_bill where company_id=v_company_id and status in ('unpaid','partially_paid')),0),
      'overdue',coalesce((select round(sum(balance_due),2) from public.supplier_bill where company_id=v_company_id and status in ('unpaid','partially_paid') and due_date < coalesce(p_as_of_date,current_date)),0),
      'open_bills',coalesce((select count(*) from public.supplier_bill where company_id=v_company_id and status in ('unpaid','partially_paid')),0),
      'paid_total',coalesce((select round(sum(amount_paid),2) from public.supplier_bill where company_id=v_company_id and status <> 'cancelled'),0)
    ),
    'bills',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',b.id,'bill_number',b.bill_number,'supplier_invoice_number',b.supplier_invoice_number,
        'bill_date',b.bill_date,'due_date',b.due_date,'supplier_id',b.supplier_id,'supplier_name',s.supplier_name,
        'branch_id',b.branch_id,'branch_name',br.branch_name,'purchase_order_id',b.purchase_order_id,
        'purchase_receipt_id',b.purchase_receipt_id,'subtotal',b.subtotal,'tax_amount',b.tax_amount,
        'total_amount',b.total_amount,'amount_paid',b.amount_paid,'balance_due',b.balance_due,'status',b.status,
        'overdue',(b.status in ('unpaid','partially_paid') and b.due_date is not null and b.due_date < coalesce(p_as_of_date,current_date))
      ) order by case when b.status in ('unpaid','partially_paid') then 0 else 1 end,b.due_date nulls last,b.created_at desc)
      from public.supplier_bill b
      join public.supplier s on s.id=b.supplier_id and s.company_id=b.company_id
      left join public.branch br on br.id=b.branch_id and br.company_id=b.company_id
      where b.company_id=v_company_id and b.status <> 'cancelled'
    ),'[]'::jsonb),
    'unbilled_receipts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'receipt_id',pr.id,'receipt_number',pr.receipt_number,'received_at',pr.received_at,
        'purchase_order_id',po.id,'purchase_order_number',po.purchase_order_number,
        'supplier_id',po.supplier_id,'supplier_name',s.supplier_name,'branch_id',pr.branch_id,'branch_name',br.branch_name,
        'supplier_delivery_reference',pr.supplier_delivery_reference,
        'stock_value',coalesce(x.stock_value,0),'estimated_tax',coalesce(x.tax_value,0),'estimated_total',coalesce(x.stock_value,0)+coalesce(x.tax_value,0)
      ) order by pr.received_at desc)
      from public.purchase_receipt pr
      join public.purchase_order po on po.id=pr.purchase_order_id and po.company_id=pr.company_id
      join public.supplier s on s.id=po.supplier_id and s.company_id=po.company_id
      left join public.branch br on br.id=pr.branch_id and br.company_id=pr.company_id
      left join lateral (
        select round(coalesce(sum(pri.quantity_received*pri.unit_cost),0),2) stock_value,
               round(coalesce(sum((pri.quantity_received*pri.unit_cost)*(coalesce(poi.tax_rate,0)/100.0)),0),2) tax_value
        from public.purchase_receipt_item pri
        join public.purchase_order_item poi on poi.id=pri.purchase_order_item_id and poi.company_id=pri.company_id
        where pri.company_id=pr.company_id and pri.purchase_receipt_id=pr.id
      ) x on true
      where pr.company_id=v_company_id
        and not exists (select 1 from public.supplier_bill b where b.company_id=pr.company_id and b.purchase_receipt_id=pr.id and b.status <> 'cancelled')
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.create_supplier_bill_from_receipt(uuid,date,text,text) to authenticated;
grant execute on function public.pay_supplier_bill(uuid,numeric,text,date,text) to authenticated;
grant execute on function public.get_supplier_payables_workspace(date) to authenticated;;
