-- Sprint 19.4/19.5: Accounting KPI + Budget foundation

insert into public.permissions (permission_name)
select 'accounting.budget.manage'
where not exists (
  select 1 from public.permissions
  where permission_name='accounting.budget.manage'
);

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.permission_name='accounting.budget.manage'
where r.role_name in ('owner','admin')
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id=r.id
      and rp.permission_id=p.id
  );

create table if not exists public.accounting_budget (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  financial_year_id uuid not null references public.accounting_financial_year(id) on delete restrict,
  branch_id uuid null references public.branch(id) on delete restrict,
  name text not null,
  status text not null default 'draft'
    check (status in ('draft','approved','archived')),
  notes text null,
  approved_by uuid null,
  approved_at timestamptz null,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(name)) > 0)
);

create unique index if not exists accounting_budget_scope_name_unique
on public.accounting_budget (
  company_id,
  financial_year_id,
  coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid),
  lower(name)
);

create index if not exists accounting_budget_company_year_idx
on public.accounting_budget(company_id,financial_year_id,status,branch_id);

create table if not exists public.accounting_budget_line (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.accounting_budget(id) on delete cascade,
  company_id uuid not null references public.company(id) on delete cascade,
  account_id uuid not null references public.accounting_account(id) on delete restrict,
  accounting_period_id uuid not null references public.accounting_period(id) on delete restrict,
  amount numeric(18,2) not null default 0 check (amount >= 0),
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (budget_id, account_id, accounting_period_id)
);

create index if not exists accounting_budget_line_budget_idx
on public.accounting_budget_line(budget_id,accounting_period_id,account_id);

alter table public.accounting_budget enable row level security;
alter table public.accounting_budget_line enable row level security;

drop policy if exists accounting_budget_select on public.accounting_budget;
create policy accounting_budget_select
on public.accounting_budget
for select
to authenticated
using (
  company_id=public.current_company_id()
  and public.current_user_has_permission('accounting.view')
);

drop policy if exists accounting_budget_manage on public.accounting_budget;
create policy accounting_budget_manage
on public.accounting_budget
for all
to authenticated
using (
  company_id=public.current_company_id()
  and public.current_user_has_permission('accounting.budget.manage')
)
with check (
  company_id=public.current_company_id()
  and public.current_user_has_permission('accounting.budget.manage')
);

drop policy if exists accounting_budget_line_select on public.accounting_budget_line;
create policy accounting_budget_line_select
on public.accounting_budget_line
for select
to authenticated
using (
  company_id=public.current_company_id()
  and public.current_user_has_permission('accounting.view')
);

drop policy if exists accounting_budget_line_manage on public.accounting_budget_line;
create policy accounting_budget_line_manage
on public.accounting_budget_line
for all
to authenticated
using (
  company_id=public.current_company_id()
  and public.current_user_has_permission('accounting.budget.manage')
)
with check (
  company_id=public.current_company_id()
  and public.current_user_has_permission('accounting.budget.manage')
);

create or replace function public.create_accounting_budget(
  p_financial_year_id uuid,
  p_name text,
  p_branch_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company_id uuid;
  v_budget public.accounting_budget%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;
  if not public.current_user_has_permission('accounting.budget.manage') then
    raise exception 'Permission denied: accounting.budget.manage';
  end if;
  v_company_id:=public.current_company_id();

  if nullif(trim(coalesce(p_name,'')),'') is null then
    raise exception 'Budget name is required.';
  end if;

  if not exists (
    select 1 from public.accounting_financial_year fy
    where fy.id=p_financial_year_id and fy.company_id=v_company_id
  ) then
    raise exception 'Financial year could not be found.';
  end if;

  if p_branch_id is not null and not exists (
    select 1 from public.branch b
    where b.id=p_branch_id and b.company_id=v_company_id
  ) then
    raise exception 'Branch could not be found.';
  end if;

  insert into public.accounting_budget(
    company_id,financial_year_id,branch_id,name,status,notes,created_by,updated_by
  ) values (
    v_company_id,p_financial_year_id,p_branch_id,trim(p_name),'draft',
    nullif(trim(coalesce(p_notes,'')),''),auth.uid(),auth.uid()
  )
  returning * into v_budget;

  return jsonb_build_object(
    'ok',true,
    'budget',jsonb_build_object(
      'id',v_budget.id,
      'name',v_budget.name,
      'status',v_budget.status,
      'financial_year_id',v_budget.financial_year_id,
      'branch_id',v_budget.branch_id
    )
  );
end;
$$;

create or replace function public.upsert_accounting_budget_line(
  p_budget_id uuid,
  p_account_id uuid,
  p_accounting_period_id uuid,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company_id uuid;
  v_budget public.accounting_budget%rowtype;
  v_account public.accounting_account%rowtype;
  v_period public.accounting_period%rowtype;
  v_line_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('accounting.budget.manage') then
    raise exception 'Permission denied: accounting.budget.manage';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'Budget amount must be zero or greater.';
  end if;

  v_company_id:=public.current_company_id();

  select * into v_budget
  from public.accounting_budget
  where id=p_budget_id and company_id=v_company_id
  for update;
  if not found then raise exception 'Budget could not be found.'; end if;
  if v_budget.status <> 'draft' then
    raise exception 'Only draft budgets can be edited.';
  end if;

  select * into v_account
  from public.accounting_account
  where id=p_account_id and company_id=v_company_id and is_active=true;
  if not found then raise exception 'Account could not be found.'; end if;
  if v_account.account_type not in ('revenue','expense') then
    raise exception 'Budgets currently support revenue and expense accounts.';
  end if;

  select * into v_period
  from public.accounting_period
  where id=p_accounting_period_id
    and company_id=v_company_id
    and financial_year_id=v_budget.financial_year_id
    and coalesce(is_adjustment_period,false)=false;
  if not found then
    raise exception 'Accounting period is not part of this budget financial year.';
  end if;

  insert into public.accounting_budget_line(
    budget_id,company_id,account_id,accounting_period_id,amount,created_by,updated_by
  ) values (
    v_budget.id,v_company_id,v_account.id,v_period.id,round(p_amount,2),auth.uid(),auth.uid()
  )
  on conflict (budget_id,account_id,accounting_period_id)
  do update set
    amount=excluded.amount,
    updated_by=auth.uid(),
    updated_at=now()
  returning id into v_line_id;

  return jsonb_build_object('ok',true,'line_id',v_line_id,'amount',round(p_amount,2));
end;
$$;

create or replace function public.approve_accounting_budget(p_budget_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company_id uuid;
  v_budget public.accounting_budget%rowtype;
  v_line_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('accounting.budget.manage') then
    raise exception 'Permission denied: accounting.budget.manage';
  end if;
  v_company_id:=public.current_company_id();

  select * into v_budget
  from public.accounting_budget
  where id=p_budget_id and company_id=v_company_id
  for update;
  if not found then raise exception 'Budget could not be found.'; end if;
  if v_budget.status='archived' then raise exception 'Archived budgets cannot be approved.'; end if;

  select count(*) into v_line_count
  from public.accounting_budget_line
  where budget_id=v_budget.id and amount>0;
  if v_line_count=0 then raise exception 'Add at least one budget line before approval.'; end if;

  update public.accounting_budget
  set status='archived',updated_by=auth.uid(),updated_at=now()
  where company_id=v_company_id
    and financial_year_id=v_budget.financial_year_id
    and id<>v_budget.id
    and status='approved'
    and branch_id is not distinct from v_budget.branch_id;

  update public.accounting_budget
  set status='approved',approved_by=auth.uid(),approved_at=now(),updated_by=auth.uid(),updated_at=now()
  where id=v_budget.id;

  return jsonb_build_object('ok',true,'budget_id',v_budget.id,'status','approved');
end;
$$;

create or replace function public.get_accounting_budgets(
  p_financial_year_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('accounting.view') then
    raise exception 'Permission denied: accounting.view';
  end if;
  v_company_id:=public.current_company_id();

  select jsonb_build_object(
    'ok',true,
    'budgets',coalesce(jsonb_agg(jsonb_build_object(
      'id',b.id,
      'name',b.name,
      'status',b.status,
      'financial_year_id',b.financial_year_id,
      'financial_year_name',fy.name,
      'financial_year_start',fy.start_date,
      'financial_year_end',fy.end_date,
      'branch_id',b.branch_id,
      'branch_name',br.branch_name,
      'notes',b.notes,
      'total_budget',coalesce(x.total_budget,0),
      'line_count',coalesce(x.line_count,0),
      'approved_at',b.approved_at,
      'created_at',b.created_at,
      'updated_at',b.updated_at
    ) order by fy.start_date desc,b.created_at desc),'[]'::jsonb)
  ) into v_result
  from public.accounting_budget b
  join public.accounting_financial_year fy on fy.id=b.financial_year_id and fy.company_id=b.company_id
  left join public.branch br on br.id=b.branch_id and br.company_id=b.company_id
  left join lateral (
    select round(coalesce(sum(l.amount),0),2) total_budget,count(*)::int line_count
    from public.accounting_budget_line l where l.budget_id=b.id
  ) x on true
  where b.company_id=v_company_id
    and (p_financial_year_id is null or b.financial_year_id=p_financial_year_id);

  return v_result;
end;
$$;

create or replace function public.get_accounting_budget_workspace(p_budget_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company_id uuid;
  v_budget public.accounting_budget%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('accounting.view') then
    raise exception 'Permission denied: accounting.view';
  end if;
  v_company_id:=public.current_company_id();

  select * into v_budget from public.accounting_budget
  where id=p_budget_id and company_id=v_company_id;
  if not found then raise exception 'Budget could not be found.'; end if;

  select jsonb_build_object(
    'ok',true,
    'budget',jsonb_build_object(
      'id',b.id,'name',b.name,'status',b.status,'notes',b.notes,
      'financial_year_id',b.financial_year_id,'financial_year_name',fy.name,
      'financial_year_start',fy.start_date,'financial_year_end',fy.end_date,
      'branch_id',b.branch_id,'branch_name',br.branch_name,
      'approved_at',b.approved_at
    ),
    'periods',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,'name',p.name,'start_date',p.start_date,'end_date',p.end_date,'status',p.status
      ) order by p.start_date)
      from public.accounting_period p
      where p.company_id=v_company_id
        and p.financial_year_id=b.financial_year_id
        and coalesce(p.is_adjustment_period,false)=false
    ),'[]'::jsonb),
    'accounts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'code',a.code,'name',a.name,'account_type',a.account_type,'account_subtype',a.account_subtype
      ) order by case a.account_type when 'revenue' then 1 else 2 end,a.code)
      from public.accounting_account a
      where a.company_id=v_company_id and a.is_active=true and a.account_type in ('revenue','expense')
    ),'[]'::jsonb),
    'lines',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',l.id,'account_id',l.account_id,'accounting_period_id',l.accounting_period_id,'amount',l.amount
      ))
      from public.accounting_budget_line l where l.budget_id=b.id
    ),'[]'::jsonb)
  ) into v_result
  from public.accounting_budget b
  join public.accounting_financial_year fy on fy.id=b.financial_year_id and fy.company_id=b.company_id
  left join public.branch br on br.id=b.branch_id and br.company_id=b.company_id
  where b.id=v_budget.id;

  return v_result;
end;
$$;

create or replace function public.get_budget_vs_actual(
  p_budget_id uuid,
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company_id uuid;
  v_budget public.accounting_budget%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('accounting.view') then
    raise exception 'Permission denied: accounting.view';
  end if;
  if p_as_of_date is null then raise exception 'As-of date is required.'; end if;
  v_company_id:=public.current_company_id();

  select * into v_budget
  from public.accounting_budget
  where id=p_budget_id and company_id=v_company_id;
  if not found then raise exception 'Budget could not be found.'; end if;

  with line_actual as (
    select
      l.id,l.account_id,l.accounting_period_id,l.amount as budget_amount,
      a.code,a.name as account_name,a.account_type,a.account_subtype,
      p.name as period_name,p.start_date,p.end_date,
      case
        when p.start_date > p_as_of_date then 0::numeric
        when p.end_date <= p_as_of_date then l.amount
        else round(l.amount * greatest((p_as_of_date-p.start_date+1)::numeric,0) / greatest((p.end_date-p.start_date+1)::numeric,1),2)
      end as budget_to_date,
      coalesce((
        select round(sum(
          case when a.account_type='revenue' then jl.credit-jl.debit else jl.debit-jl.credit end
        ),2)
        from public.journal_line jl
        join public.journal_entry je on je.id=jl.journal_entry_id and je.company_id=jl.company_id
        where jl.company_id=v_company_id
          and jl.account_id=l.account_id
          and je.status='posted'
          and je.entry_date between p.start_date and least(p.end_date,p_as_of_date)
          and (v_budget.branch_id is null or je.branch_id=v_budget.branch_id)
      ),0) as actual_to_date
    from public.accounting_budget_line l
    join public.accounting_account a on a.id=l.account_id and a.company_id=l.company_id
    join public.accounting_period p on p.id=l.accounting_period_id and p.company_id=l.company_id
    where l.budget_id=v_budget.id
  ),
  account_summary as (
    select
      account_id,code,account_name,account_type,account_subtype,
      round(sum(budget_amount),2) annual_budget,
      round(sum(budget_to_date),2) budget_to_date,
      round(sum(actual_to_date),2) actual_to_date
    from line_actual
    group by account_id,code,account_name,account_type,account_subtype
  )
  select jsonb_build_object(
    'ok',true,
    'as_of_date',p_as_of_date,
    'budget',jsonb_build_object(
      'id',v_budget.id,'name',v_budget.name,'status',v_budget.status,
      'financial_year_id',v_budget.financial_year_id,'branch_id',v_budget.branch_id
    ),
    'summary',jsonb_build_object(
      'revenue_budget_to_date',coalesce((select round(sum(budget_to_date),2) from account_summary where account_type='revenue'),0),
      'revenue_actual_to_date',coalesce((select round(sum(actual_to_date),2) from account_summary where account_type='revenue'),0),
      'expense_budget_to_date',coalesce((select round(sum(budget_to_date),2) from account_summary where account_type='expense'),0),
      'expense_actual_to_date',coalesce((select round(sum(actual_to_date),2) from account_summary where account_type='expense'),0),
      'profit_budget_to_date',coalesce((select round(sum(case when account_type='revenue' then budget_to_date else -budget_to_date end),2) from account_summary),0),
      'profit_actual_to_date',coalesce((select round(sum(case when account_type='revenue' then actual_to_date else -actual_to_date end),2) from account_summary),0)
    ),
    'accounts',coalesce((select jsonb_agg(jsonb_build_object(
      'account_id',account_id,'code',code,'name',account_name,'account_type',account_type,'account_subtype',account_subtype,
      'annual_budget',annual_budget,'budget_to_date',budget_to_date,'actual_to_date',actual_to_date,
      'variance',round(actual_to_date-budget_to_date,2),
      'variance_pct',case when budget_to_date=0 then null else round(((actual_to_date-budget_to_date)/budget_to_date)*100,2) end
    ) order by case account_type when 'revenue' then 1 else 2 end,code) from account_summary),'[]'::jsonb),
    'periods',coalesce((select jsonb_agg(jsonb_build_object(
      'period_id',accounting_period_id,'period_name',period_name,'start_date',start_date,'end_date',end_date,
      'budget',round(sum(budget_amount),2),'budget_to_date',round(sum(budget_to_date),2),'actual_to_date',round(sum(actual_to_date),2)
    ) order by start_date) from line_actual group by true),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.get_accounting_kpi_dashboard(
  p_as_of_date date default current_date,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company_id uuid;
  v_fy public.accounting_financial_year%rowtype;
  v_month_start date;
  v_ytd_start date;
  v_budget_id uuid;
  v_result jsonb;
  v_branch_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('accounting.view') then
    raise exception 'Permission denied: accounting.view';
  end if;
  if p_as_of_date is null then raise exception 'As-of date is required.'; end if;

  v_company_id:=public.current_company_id();
  if p_branch_id is not null then
    select branch_name into v_branch_name from public.branch
    where id=p_branch_id and company_id=v_company_id;
    if not found then raise exception 'Branch could not be found.'; end if;
  end if;

  select * into v_fy
  from public.accounting_financial_year
  where company_id=v_company_id
    and p_as_of_date between start_date and end_date
  order by start_date desc limit 1;

  v_ytd_start:=coalesce(v_fy.start_date,date_trunc('year',p_as_of_date)::date);
  v_month_start:=date_trunc('month',p_as_of_date)::date;

  if v_fy.id is not null then
    select id into v_budget_id
    from public.accounting_budget
    where company_id=v_company_id
      and financial_year_id=v_fy.id
      and status='approved'
      and branch_id is not distinct from p_branch_id
    order by approved_at desc nulls last,created_at desc
    limit 1;
  end if;

  with ledger as (
    select
      a.account_type,a.account_subtype,a.system_key,
      je.entry_date,
      case when a.account_type='revenue' then jl.credit-jl.debit else jl.debit-jl.credit end as pnl_amount,
      jl.debit-jl.credit as debit_balance_amount,
      jl.credit-jl.debit as credit_balance_amount
    from public.journal_line jl
    join public.journal_entry je on je.id=jl.journal_entry_id and je.company_id=jl.company_id
    join public.accounting_account a on a.id=jl.account_id and a.company_id=jl.company_id
    where jl.company_id=v_company_id
      and je.status='posted'
      and je.entry_date<=p_as_of_date
      and (p_branch_id is null or je.branch_id=p_branch_id)
  ),
  invoices as (
    select i.id,i.total_amount,i.invoice_date,coalesce(i.due_date,i.invoice_date) due_date,
      greatest(i.total_amount-coalesce((
        select sum(ip.amount) from public.invoice_payment ip
        where ip.company_id=i.company_id and ip.invoice_id=i.id and ip.payment_date<=p_as_of_date
      ),0),0) outstanding
    from public.invoice i
    where i.company_id=v_company_id
      and i.invoice_date<=p_as_of_date
      and i.status not in ('draft','cancelled')
      and (p_branch_id is null or i.branch_id=p_branch_id)
  ),
  metrics as (
    select
      coalesce((select round(sum(pnl_amount),2) from ledger where account_type='revenue' and entry_date between v_month_start and p_as_of_date),0) revenue_mtd,
      coalesce((select round(sum(pnl_amount),2) from ledger where account_type='revenue' and entry_date between v_ytd_start and p_as_of_date),0) revenue_ytd,
      coalesce((select round(sum(pnl_amount),2) from ledger where account_type='expense' and account_subtype='cost_of_sales' and entry_date between v_month_start and p_as_of_date),0) cogs_mtd,
      coalesce((select round(sum(pnl_amount),2) from ledger where account_type='expense' and account_subtype='cost_of_sales' and entry_date between v_ytd_start and p_as_of_date),0) cogs_ytd,
      coalesce((select round(sum(pnl_amount),2) from ledger where account_type='expense' and account_subtype<>'cost_of_sales' and entry_date between v_month_start and p_as_of_date),0) operating_expenses_mtd,
      coalesce((select round(sum(pnl_amount),2) from ledger where account_type='expense' and account_subtype<>'cost_of_sales' and entry_date between v_ytd_start and p_as_of_date),0) operating_expenses_ytd,
      coalesce((select round(sum(pnl_amount),2) from ledger where account_type='expense' and entry_date between v_month_start and p_as_of_date),0) total_expenses_mtd,
      coalesce((select round(sum(pnl_amount),2) from ledger where account_type='expense' and entry_date between v_ytd_start and p_as_of_date),0) total_expenses_ytd,
      coalesce((select round(sum(debit_balance_amount),2) from ledger where system_key in ('bank','cash_on_hand')),0) cash_and_bank,
      coalesce((select round(sum(debit_balance_amount),2) from ledger where system_key='accounts_receivable'),0) trade_debtors,
      coalesce((select round(sum(credit_balance_amount),2) from ledger where system_key='accounts_payable'),0) trade_creditors,
      coalesce((select round(sum(outstanding),2) from invoices where outstanding>0.009),0) operational_receivables,
      coalesce((select round(sum(outstanding),2) from invoices where outstanding>0.009 and due_date<p_as_of_date),0) overdue_receivables,
      coalesce((select count(*)::int from invoices where outstanding>0.009 and due_date<p_as_of_date),0) overdue_invoice_count,
      coalesce((select round(sum(ip.amount),2) from public.invoice_payment ip join public.invoice i on i.id=ip.invoice_id and i.company_id=ip.company_id where ip.company_id=v_company_id and ip.payment_date between v_month_start and p_as_of_date and (p_branch_id is null or i.branch_id=p_branch_id)),0) cash_collected_mtd,
      coalesce((select count(*)::int from public.accounting_posting_exception e where e.company_id=v_company_id and e.status='open' and (p_branch_id is null or e.branch_id=p_branch_id)),0) open_posting_exceptions
  ),
  budget_summary as (
    select
      coalesce(sum(case when a.account_type='revenue' then
        case when p.start_date>p_as_of_date then 0 when p.end_date<=p_as_of_date then l.amount else l.amount*greatest((p_as_of_date-p.start_date+1)::numeric,0)/greatest((p.end_date-p.start_date+1)::numeric,1) end
      else 0 end),0) revenue_budget_ytd,
      coalesce(sum(case when a.account_type='expense' then
        case when p.start_date>p_as_of_date then 0 when p.end_date<=p_as_of_date then l.amount else l.amount*greatest((p_as_of_date-p.start_date+1)::numeric,0)/greatest((p.end_date-p.start_date+1)::numeric,1) end
      else 0 end),0) expense_budget_ytd
    from public.accounting_budget_line l
    join public.accounting_account a on a.id=l.account_id and a.company_id=l.company_id
    join public.accounting_period p on p.id=l.accounting_period_id and p.company_id=l.company_id
    where l.budget_id=v_budget_id
  )
  select jsonb_build_object(
    'ok',true,
    'as_of_date',p_as_of_date,
    'branch',case when p_branch_id is null then null else jsonb_build_object('id',p_branch_id,'name',v_branch_name) end,
    'financial_year',case when v_fy.id is null then null else jsonb_build_object('id',v_fy.id,'name',v_fy.name,'start_date',v_fy.start_date,'end_date',v_fy.end_date) end,
    'period',jsonb_build_object('month_start',v_month_start,'ytd_start',v_ytd_start),
    'kpis',jsonb_build_object(
      'revenue_mtd',m.revenue_mtd,
      'revenue_ytd',m.revenue_ytd,
      'cost_of_sales_mtd',m.cogs_mtd,
      'cost_of_sales_ytd',m.cogs_ytd,
      'gross_profit_mtd',round(m.revenue_mtd-m.cogs_mtd,2),
      'gross_profit_ytd',round(m.revenue_ytd-m.cogs_ytd,2),
      'operating_expenses_mtd',m.operating_expenses_mtd,
      'operating_expenses_ytd',m.operating_expenses_ytd,
      'net_profit_mtd',round(m.revenue_mtd-m.total_expenses_mtd,2),
      'net_profit_ytd',round(m.revenue_ytd-m.total_expenses_ytd,2),
      'net_margin_ytd_pct',case when m.revenue_ytd=0 then null else round(((m.revenue_ytd-m.total_expenses_ytd)/m.revenue_ytd)*100,2) end,
      'cash_and_bank',m.cash_and_bank,
      'trade_debtors',m.trade_debtors,
      'trade_creditors',m.trade_creditors,
      'operational_receivables',m.operational_receivables,
      'overdue_receivables',m.overdue_receivables,
      'overdue_invoice_count',m.overdue_invoice_count,
      'cash_collected_mtd',m.cash_collected_mtd,
      'open_posting_exceptions',m.open_posting_exceptions
    ),
    'budget',case when v_budget_id is null then jsonb_build_object('available',false) else jsonb_build_object(
      'available',true,
      'budget_id',v_budget_id,
      'revenue_budget_ytd',round(bs.revenue_budget_ytd,2),
      'expense_budget_ytd',round(bs.expense_budget_ytd,2),
      'profit_budget_ytd',round(bs.revenue_budget_ytd-bs.expense_budget_ytd,2),
      'revenue_variance_ytd',round(m.revenue_ytd-bs.revenue_budget_ytd,2),
      'expense_variance_ytd',round(m.total_expenses_ytd-bs.expense_budget_ytd,2),
      'profit_variance_ytd',round((m.revenue_ytd-m.total_expenses_ytd)-(bs.revenue_budget_ytd-bs.expense_budget_ytd),2)
    ) end,
    'quality',jsonb_build_object(
      'ledger_source','posted_journals',
      'cost_of_sales_note','Gross profit reflects only Cost of Sales entries already posted to the ledger.',
      'healthy',m.open_posting_exceptions=0
    )
  ) into v_result
  from metrics m cross join budget_summary bs;

  return v_result;
end;
$$;

grant execute on function public.create_accounting_budget(uuid,text,uuid,text) to authenticated;
grant execute on function public.upsert_accounting_budget_line(uuid,uuid,uuid,numeric) to authenticated;
grant execute on function public.approve_accounting_budget(uuid) to authenticated;
grant execute on function public.get_accounting_budgets(uuid) to authenticated;
grant execute on function public.get_accounting_budget_workspace(uuid) to authenticated;
grant execute on function public.get_budget_vs_actual(uuid,date) to authenticated;
grant execute on function public.get_accounting_kpi_dashboard(date,uuid) to authenticated;
;
