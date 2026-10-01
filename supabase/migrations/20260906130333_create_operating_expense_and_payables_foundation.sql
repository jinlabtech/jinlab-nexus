insert into public.permissions(permission_name)
select 'accounting.expense.manage'
where not exists (
  select 1 from public.permissions where permission_name='accounting.expense.manage'
);

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.permission_name='accounting.expense.manage'
where lower(r.role_name) in ('owner','admin')
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id=r.id and rp.permission_id=p.id
  );

-- Standard owner-friendly operating expense categories for every company.
insert into public.accounting_account(
  company_id,code,name,description,account_type,account_subtype,normal_balance,
  system_key,is_system,allow_manual_posting,is_active,created_by
)
select c.id,x.code,x.name,x.description,'expense',x.subtype,'debit',x.system_key,false,true,true,null
from public.company c
cross join (values
  ('6450','Fuel and Travel','Fuel, local travel and transport costs.','travel','fuel_travel'),
  ('6550','Marketing and Advertising','Advertising, promotions and marketing costs.','marketing','marketing_advertising'),
  ('6560','Office Supplies and Consumables','Stationery, printing and everyday office consumables.','office_supplies','office_supplies'),
  ('6570','Insurance Expense','Business insurance costs.','insurance','insurance_expense'),
  ('6580','Professional Fees','Accounting, legal, consulting and other professional services.','professional_fees','professional_fees'),
  ('6590','Other Operating Costs','Other ordinary operating costs not classified elsewhere.','operating_expense','other_operating_costs')
) as x(code,name,description,subtype,system_key)
where not exists (
  select 1 from public.accounting_account a
  where a.company_id=c.id and a.code=x.code
);

create table if not exists public.accounting_expense (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete restrict,
  branch_id uuid null references public.branch(id) on delete restrict,
  supplier_id uuid null references public.supplier(id) on delete restrict,

  expense_number text not null,
  expense_date date not null,
  due_date date null,

  expense_account_id uuid not null references public.accounting_account(id) on delete restrict,
  liability_account_id uuid null references public.accounting_account(id) on delete restrict,
  payment_account_id uuid null references public.accounting_account(id) on delete restrict,

  payee_name text null,
  reference text null,
  notes text null,

  total_amount numeric(14,2) not null check (total_amount > 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  expense_amount numeric(14,2) not null check (expense_amount > 0),

  payment_status text not null check (payment_status in ('paid','unpaid')),
  payment_method text null check (payment_method is null or payment_method in ('cash','eft','card','other')),
  payment_date date null,
  payment_reference text null,

  status text not null default 'posted' check (status in ('posted','void')),

  journal_entry_id uuid null references public.journal_entry(id) on delete restrict,
  payment_journal_entry_id uuid null references public.journal_entry(id) on delete restrict,

  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint accounting_expense_tax_less_than_total check (tax_amount < total_amount),
  constraint accounting_expense_paid_fields check (
    (payment_status='paid' and payment_method is not null and payment_date is not null)
    or (payment_status='unpaid' and payment_date is null)
  ),
  unique(company_id,expense_number)
);

create index if not exists accounting_expense_company_date_idx
  on public.accounting_expense(company_id,expense_date desc);
create index if not exists accounting_expense_company_payment_idx
  on public.accounting_expense(company_id,payment_status,due_date);
create index if not exists accounting_expense_supplier_idx
  on public.accounting_expense(company_id,supplier_id)
  where supplier_id is not null;

alter table public.accounting_expense enable row level security;

drop policy if exists accounting_expense_select on public.accounting_expense;
create policy accounting_expense_select
on public.accounting_expense
for select
to authenticated
using (
  company_id=public.current_company_id()
  and public.current_user_has_permission('accounting.view')
);

create or replace function public.generate_accounting_expense_number(p_company_id uuid)
returns text
language plpgsql
set search_path to 'public'
as $$
declare
  v_next integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('jinlab-expense-' || p_company_id::text,0)
  );

  select coalesce(max(substring(expense_number from '[0-9]+$')::integer),0)+1
  into v_next
  from public.accounting_expense
  where company_id=p_company_id;

  return 'EXP-' || to_char(current_date,'YYYYMM') || '-' || lpad(v_next::text,5,'0');
end;
$$;

create or replace function public.get_accounting_payment_account(
  p_company_id uuid,
  p_payment_method text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_profile public.accounting_posting_profile%rowtype;
  v_method text:=lower(trim(coalesce(p_payment_method,'')));
begin
  perform public.ensure_accounting_posting_profile(p_company_id);
  select * into v_profile
  from public.accounting_posting_profile
  where company_id=p_company_id;

  if v_method='cash' then
    if v_profile.cash_account_id is null then raise exception 'Cash account is not configured.'; end if;
    return v_profile.cash_account_id;
  elsif v_method='eft' then
    if v_profile.bank_account_id is null then raise exception 'Bank account is not configured.'; end if;
    return v_profile.bank_account_id;
  elsif v_method in ('card','other') then
    if v_profile.payment_clearing_account_id is null then raise exception 'Payment Clearing account is not configured.'; end if;
    return v_profile.payment_clearing_account_id;
  end if;

  raise exception 'Payment method must be cash, eft, card or other.';
end;
$$;

create or replace function public.record_accounting_expense(
  p_expense_date date,
  p_expense_account_id uuid,
  p_total_amount numeric,
  p_payment_status text,
  p_payment_method text default null,
  p_branch_id uuid default null,
  p_supplier_id uuid default null,
  p_payee_name text default null,
  p_reference text default null,
  p_notes text default null,
  p_due_date date default null,
  p_tax_amount numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company_id uuid;
  v_expense public.accounting_expense%rowtype;
  v_account public.accounting_account%rowtype;
  v_payment_status text:=lower(trim(coalesce(p_payment_status,'')));
  v_payment_method text:=nullif(lower(trim(coalesce(p_payment_method,''))),'');
  v_total numeric(14,2):=round(coalesce(p_total_amount,0),2);
  v_tax numeric(14,2):=round(coalesce(p_tax_amount,0),2);
  v_net numeric(14,2);
  v_currency text:='ZAR';
  v_vat_registered boolean:=false;
  v_accounting_enabled boolean:=false;
  v_liability_account_id uuid;
  v_payment_account_id uuid;
  v_vat_input_account_id uuid;
  v_lines jsonb:='[]'::jsonb;
  v_journal_id uuid;
  v_number text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('accounting.expense.manage') then
    raise exception 'Permission denied: accounting.expense.manage';
  end if;

  v_company_id:=public.current_company_id();
  if v_company_id is null then raise exception 'Your account is not linked to a company.'; end if;

  if p_expense_date is null then raise exception 'Expense date is required.'; end if;
  if v_total<=0 then raise exception 'Expense amount must be greater than zero.'; end if;
  if v_tax<0 or v_tax>=v_total then raise exception 'Tax amount must be zero or less than the total amount.'; end if;
  v_net:=round(v_total-v_tax,2);

  select * into v_account
  from public.accounting_account
  where id=p_expense_account_id
    and company_id=v_company_id
    and is_active=true
    and account_type='expense'
    and coalesce(system_key,'')<>'cost_of_sales'
    and coalesce(account_subtype,'')<>'cost_of_sales';
  if not found then
    raise exception 'Choose an active operating expense category. Cost of Sales is generated by inventory accounting and cannot be entered here.';
  end if;

  if p_branch_id is not null and not exists (
    select 1 from public.branch where id=p_branch_id and company_id=v_company_id
  ) then raise exception 'Branch could not be found.'; end if;

  if p_supplier_id is not null and not exists (
    select 1 from public.supplier where id=p_supplier_id and company_id=v_company_id
  ) then raise exception 'Supplier could not be found.'; end if;

  select coalesce(accounting_enabled,false)
  into v_accounting_enabled
  from public.company_accounting_settings
  where company_id=v_company_id;
  if not v_accounting_enabled then raise exception 'Accounting must be enabled before recording an expense.'; end if;

  select coalesce(base_currency,'ZAR'),coalesce(vat_registered,false)
  into v_currency,v_vat_registered
  from public.company_finance_settings
  where company_id=v_company_id;

  perform public.ensure_accounting_posting_profile(v_company_id);
  select vat_input_account_id
  into v_vat_input_account_id
  from public.accounting_posting_profile
  where company_id=v_company_id;

  if v_tax>0 and not v_vat_registered then
    raise exception 'Tax cannot be separated because the company is not marked VAT registered. Record the full amount as the expense.';
  end if;
  if v_tax>0 and v_vat_input_account_id is null then raise exception 'VAT Input account is not configured.'; end if;

  if v_payment_status not in ('paid','unpaid') then
    raise exception 'Payment status must be paid or unpaid.';
  end if;

  if v_payment_status='paid' then
    if v_payment_method is null then raise exception 'Choose how the expense was paid.'; end if;
    v_payment_account_id:=public.get_accounting_payment_account(v_company_id,v_payment_method);
  else
    if v_payment_method is not null then raise exception 'Do not choose a payment method for an unpaid expense.'; end if;

    if p_supplier_id is not null then
      select accounts_payable_account_id into v_liability_account_id
      from public.accounting_posting_profile where company_id=v_company_id;
    else
      select id into v_liability_account_id
      from public.accounting_account
      where company_id=v_company_id and system_key='accrued_expenses' and is_active=true
      limit 1;
    end if;

    if v_liability_account_id is null then raise exception 'Liability account is not configured.'; end if;
  end if;

  v_number:=public.generate_accounting_expense_number(v_company_id);

  insert into public.accounting_expense(
    company_id,branch_id,supplier_id,expense_number,expense_date,due_date,
    expense_account_id,liability_account_id,payment_account_id,payee_name,
    reference,notes,total_amount,tax_amount,expense_amount,payment_status,
    payment_method,payment_date,status,created_by,updated_by
  ) values (
    v_company_id,p_branch_id,p_supplier_id,v_number,p_expense_date,p_due_date,
    p_expense_account_id,v_liability_account_id,v_payment_account_id,
    nullif(trim(coalesce(p_payee_name,'')),''),nullif(trim(coalesce(p_reference,'')),''),
    nullif(trim(coalesce(p_notes,'')),''),v_total,v_tax,v_net,v_payment_status,
    v_payment_method,case when v_payment_status='paid' then p_expense_date else null end,
    'posted',auth.uid(),auth.uid()
  ) returning * into v_expense;

  v_lines:=v_lines || jsonb_build_array(jsonb_build_object(
    'account_id',p_expense_account_id,
    'description',v_account.name || ' · ' || v_number,
    'debit',v_net,
    'credit',0,
    'metadata',jsonb_build_object('role','operating_expense','expense_number',v_number,'supplier_id',p_supplier_id)
  ));

  if v_tax>0 then
    v_lines:=v_lines || jsonb_build_array(jsonb_build_object(
      'account_id',v_vat_input_account_id,
      'description','VAT Input · ' || v_number,
      'debit',v_tax,
      'credit',0,
      'metadata',jsonb_build_object('role','vat_input','expense_number',v_number)
    ));
  end if;

  if v_payment_status='paid' then
    v_lines:=v_lines || jsonb_build_array(jsonb_build_object(
      'account_id',v_payment_account_id,
      'description','Paid expense · ' || v_number,
      'debit',0,
      'credit',v_total,
      'metadata',jsonb_build_object('role','payment','payment_method',v_payment_method,'expense_number',v_number)
    ));
  else
    v_lines:=v_lines || jsonb_build_array(jsonb_build_object(
      'account_id',v_liability_account_id,
      'description','Expense payable · ' || v_number,
      'debit',0,
      'credit',v_total,
      'metadata',jsonb_build_object('role','expense_payable','expense_number',v_number,'supplier_id',p_supplier_id)
    ));
  end if;

  v_journal_id:=public.create_automatic_accounting_journal(
    v_company_id,p_branch_id,p_expense_date,
    coalesce(nullif(trim(coalesce(p_payee_name,'')),''),v_account.name) || ' · ' || v_number,
    coalesce(nullif(trim(coalesce(p_reference,'')),''),v_number),
    'accounting_expense',v_expense.id,'recorded',v_currency,auth.uid(),v_lines,null
  );

  update public.accounting_expense
  set journal_entry_id=v_journal_id,updated_at=now()
  where id=v_expense.id;

  return jsonb_build_object(
    'ok',true,
    'expense',jsonb_build_object(
      'id',v_expense.id,'expense_number',v_number,'date',p_expense_date,
      'category',v_account.name,'total_amount',v_total,'expense_amount',v_net,'tax_amount',v_tax,
      'payment_status',v_payment_status,'payment_method',v_payment_method,'due_date',p_due_date,
      'payee',coalesce(nullif(trim(coalesce(p_payee_name,'')),''),v_account.name)
    ),
    'journal_entry_id',v_journal_id,
    'simple_message',case when v_payment_status='paid'
      then v_account.name || ' recorded and paid.'
      else v_account.name || ' recorded. The amount now appears under What We Owe until paid.' end
  );
end;
$$;

create or replace function public.pay_accounting_expense(
  p_expense_id uuid,
  p_payment_method text,
  p_payment_date date default current_date,
  p_payment_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company_id uuid;
  v_expense public.accounting_expense%rowtype;
  v_payment_account_id uuid;
  v_currency text:='ZAR';
  v_lines jsonb;
  v_journal_id uuid;
  v_method text:=lower(trim(coalesce(p_payment_method,'')));
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('accounting.expense.manage') then
    raise exception 'Permission denied: accounting.expense.manage';
  end if;

  v_company_id:=public.current_company_id();

  select * into v_expense
  from public.accounting_expense
  where id=p_expense_id and company_id=v_company_id
  for update;
  if not found then raise exception 'Expense could not be found.'; end if;
  if v_expense.status<>'posted' then raise exception 'Only posted expenses can be paid.'; end if;
  if v_expense.payment_status='paid' then raise exception 'This expense is already paid.'; end if;
  if v_expense.liability_account_id is null then raise exception 'Expense liability account is missing.'; end if;
  if p_payment_date is null then raise exception 'Payment date is required.'; end if;
  if p_payment_date<v_expense.expense_date then raise exception 'Payment date cannot be before the expense date.'; end if;

  v_payment_account_id:=public.get_accounting_payment_account(v_company_id,v_method);
  select coalesce(base_currency,'ZAR') into v_currency
  from public.company_finance_settings where company_id=v_company_id;

  v_lines:=jsonb_build_array(
    jsonb_build_object(
      'account_id',v_expense.liability_account_id,
      'description','Settle expense payable · ' || v_expense.expense_number,
      'debit',v_expense.total_amount,'credit',0,
      'metadata',jsonb_build_object('role','expense_payable_settlement','expense_number',v_expense.expense_number)
    ),
    jsonb_build_object(
      'account_id',v_payment_account_id,
      'description','Expense payment · ' || v_expense.expense_number,
      'debit',0,'credit',v_expense.total_amount,
      'metadata',jsonb_build_object('role','payment','payment_method',v_method,'expense_number',v_expense.expense_number)
    )
  );

  v_journal_id:=public.create_automatic_accounting_journal(
    v_company_id,v_expense.branch_id,p_payment_date,
    'Pay ' || v_expense.expense_number,
    coalesce(nullif(trim(coalesce(p_payment_reference,'')),''),v_expense.reference,v_expense.expense_number),
    'accounting_expense',v_expense.id,'paid',v_currency,auth.uid(),v_lines,null
  );

  update public.accounting_expense
  set payment_status='paid',payment_method=v_method,payment_date=p_payment_date,
      payment_reference=nullif(trim(coalesce(p_payment_reference,'')),''),
      payment_account_id=v_payment_account_id,payment_journal_entry_id=v_journal_id,
      updated_by=auth.uid(),updated_at=now()
  where id=v_expense.id;

  return jsonb_build_object(
    'ok',true,'expense_id',v_expense.id,'expense_number',v_expense.expense_number,
    'payment_status','paid','amount',v_expense.total_amount,'payment_method',v_method,
    'payment_journal_entry_id',v_journal_id,
    'simple_message','Expense paid. What We Owe has been reduced and the payment account has been reduced.'
  );
end;
$$;

create or replace function public.get_accounting_expense_workspace(
  p_from_date date default null,
  p_to_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company_id uuid;
  v_from date;
  v_to date:=coalesce(p_to_date,current_date);
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('accounting.view') then
    raise exception 'Permission denied: accounting.view';
  end if;

  v_company_id:=public.current_company_id();
  v_from:=coalesce(p_from_date,date_trunc('year',v_to)::date);
  if v_from>v_to then raise exception 'From date cannot be after To date.'; end if;

  select jsonb_build_object(
    'ok',true,
    'period',jsonb_build_object('from_date',v_from,'to_date',v_to),
    'summary',jsonb_build_object(
      'total_expenses',coalesce((select round(sum(e.expense_amount),2) from public.accounting_expense e where e.company_id=v_company_id and e.status='posted' and e.expense_date between v_from and v_to),0),
      'paid_expenses',coalesce((select round(sum(e.total_amount),2) from public.accounting_expense e where e.company_id=v_company_id and e.status='posted' and e.payment_status='paid' and e.expense_date between v_from and v_to),0),
      'still_owed',coalesce((select round(sum(e.total_amount),2) from public.accounting_expense e where e.company_id=v_company_id and e.status='posted' and e.payment_status='unpaid' and e.expense_date<=v_to),0),
      'overdue',coalesce((select round(sum(e.total_amount),2) from public.accounting_expense e where e.company_id=v_company_id and e.status='posted' and e.payment_status='unpaid' and e.due_date is not null and e.due_date<v_to),0),
      'unpaid_count',coalesce((select count(*)::int from public.accounting_expense e where e.company_id=v_company_id and e.status='posted' and e.payment_status='unpaid' and e.expense_date<=v_to),0)
    ),
    'categories',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'code',a.code,'name',a.name,'subtype',a.account_subtype
      ) order by a.code)
      from public.accounting_account a
      where a.company_id=v_company_id and a.is_active=true and a.account_type='expense'
        and coalesce(a.system_key,'')<>'cost_of_sales' and coalesce(a.account_subtype,'')<>'cost_of_sales'
    ),'[]'::jsonb),
    'suppliers',coalesce((
      select jsonb_agg(jsonb_build_object('id',s.id,'name',s.supplier_name) order by s.supplier_name)
      from public.supplier s where s.company_id=v_company_id
    ),'[]'::jsonb),
    'branches',coalesce((
      select jsonb_agg(jsonb_build_object('id',b.id,'name',b.branch_name) order by b.branch_name)
      from public.branch b where b.company_id=v_company_id
    ),'[]'::jsonb),
    'expenses',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,'expense_number',e.expense_number,'expense_date',e.expense_date,'due_date',e.due_date,
        'category_id',e.expense_account_id,'category',a.name,'payee',coalesce(e.payee_name,s.supplier_name,a.name),
        'supplier_id',e.supplier_id,'supplier_name',s.supplier_name,'branch_id',e.branch_id,'branch_name',b.branch_name,
        'total_amount',e.total_amount,'expense_amount',e.expense_amount,'tax_amount',e.tax_amount,
        'payment_status',e.payment_status,'payment_method',e.payment_method,'payment_date',e.payment_date,
        'reference',e.reference,'notes',e.notes,'status',e.status,
        'overdue',e.payment_status='unpaid' and e.due_date is not null and e.due_date<v_to
      ) order by e.expense_date desc,e.created_at desc)
      from public.accounting_expense e
      join public.accounting_account a on a.id=e.expense_account_id and a.company_id=e.company_id
      left join public.supplier s on s.id=e.supplier_id and s.company_id=e.company_id
      left join public.branch b on b.id=e.branch_id and b.company_id=e.company_id
      where e.company_id=v_company_id and e.expense_date between v_from and v_to
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.record_accounting_expense(date,uuid,numeric,text,text,uuid,uuid,text,text,text,date,numeric) to authenticated;
grant execute on function public.pay_accounting_expense(uuid,text,date,text) to authenticated;
grant execute on function public.get_accounting_expense_workspace(date,date) to authenticated;
;
