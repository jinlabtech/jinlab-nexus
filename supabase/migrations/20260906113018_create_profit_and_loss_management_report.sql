create or replace function public.get_profit_and_loss_report(
  p_start_date date default null,
  p_end_date date default current_date,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_company_id uuid;
  v_start_date date;
  v_end_date date;
  v_financial_year_id uuid;
  v_financial_year_name text;
  v_budget_id uuid;
  v_budget_name text;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('accounting.view') then
    raise exception 'Permission denied: accounting.view';
  end if;

  v_company_id := public.current_company_id();
  v_end_date := coalesce(p_end_date, current_date);

  select fy.id, fy.name, fy.start_date
  into v_financial_year_id, v_financial_year_name, v_start_date
  from public.accounting_financial_year fy
  where fy.company_id = v_company_id
    and v_end_date between fy.start_date and fy.end_date
  order by fy.start_date desc
  limit 1;

  if p_start_date is not null then
    v_start_date := p_start_date;
  elsif v_start_date is null then
    v_start_date := make_date(extract(year from v_end_date)::int, 1, 1);
  end if;

  if v_start_date > v_end_date then
    raise exception 'Start date cannot be after end date.';
  end if;

  if p_branch_id is not null and not exists (
    select 1
    from public.branch b
    where b.id = p_branch_id
      and b.company_id = v_company_id
  ) then
    raise exception 'Branch could not be found.';
  end if;

  select b.id, b.name
  into v_budget_id, v_budget_name
  from public.accounting_budget b
  where b.company_id = v_company_id
    and b.status = 'approved'
    and b.financial_year_id = v_financial_year_id
    and (
      (p_branch_id is null and b.branch_id is null)
      or b.branch_id = p_branch_id
    )
  order by b.approved_at desc nulls last, b.created_at desc
  limit 1;

  with actual_by_account as (
    select
      a.id as account_id,
      a.code,
      a.name,
      a.account_type,
      a.account_subtype,
      a.system_key,
      round(sum(
        case
          when a.account_type = 'revenue' then jl.credit - jl.debit
          else jl.debit - jl.credit
        end
      ),2) as actual
    from public.journal_entry je
    join public.journal_line jl
      on jl.journal_entry_id = je.id
     and jl.company_id = je.company_id
    join public.accounting_account a
      on a.id = jl.account_id
     and a.company_id = je.company_id
    where je.company_id = v_company_id
      and je.status = 'posted'
      and je.entry_date between v_start_date and v_end_date
      and (p_branch_id is null or je.branch_id = p_branch_id)
      and a.account_type in ('revenue','expense')
    group by a.id,a.code,a.name,a.account_type,a.account_subtype,a.system_key
  ),
  budget_by_account as (
    select
      bl.account_id,
      round(sum(
        bl.amount *
        greatest(
          0,
          (least(ap.end_date, v_end_date) - greatest(ap.start_date, v_start_date) + 1)::numeric
        ) /
        nullif((ap.end_date - ap.start_date + 1)::numeric,0)
      ),2) as budget
    from public.accounting_budget_line bl
    join public.accounting_period ap
      on ap.id = bl.accounting_period_id
     and ap.company_id = bl.company_id
    where v_budget_id is not null
      and bl.company_id = v_company_id
      and bl.budget_id = v_budget_id
      and ap.end_date >= v_start_date
      and ap.start_date <= v_end_date
    group by bl.account_id
  ),
  accounts as (
    select
      a.id as account_id,
      a.code,
      a.name,
      a.account_type,
      a.account_subtype,
      a.system_key,
      coalesce(x.actual,0)::numeric as actual,
      coalesce(b.budget,0)::numeric as budget
    from public.accounting_account a
    left join actual_by_account x on x.account_id=a.id
    left join budget_by_account b on b.account_id=a.id
    where a.company_id=v_company_id
      and a.is_active=true
      and a.account_type in ('revenue','expense')
      and (coalesce(x.actual,0) <> 0 or coalesce(b.budget,0) <> 0)
  ),
  totals as (
    select
      coalesce(sum(actual) filter (where account_type='revenue'),0) as revenue_actual,
      coalesce(sum(budget) filter (where account_type='revenue'),0) as revenue_budget,
      coalesce(sum(actual) filter (where account_type='expense' and (system_key='cost_of_sales' or account_subtype='cost_of_sales')),0) as cogs_actual,
      coalesce(sum(budget) filter (where account_type='expense' and (system_key='cost_of_sales' or account_subtype='cost_of_sales')),0) as cogs_budget,
      coalesce(sum(actual) filter (where account_type='expense' and not (system_key='cost_of_sales' or account_subtype='cost_of_sales')),0) as opex_actual,
      coalesce(sum(budget) filter (where account_type='expense' and not (system_key='cost_of_sales' or account_subtype='cost_of_sales')),0) as opex_budget,
      coalesce(sum(actual) filter (where account_type='revenue' and system_key='sales_revenue'),0) as product_revenue_actual
    from accounts
  ),
  month_series as (
    select generate_series(
      date_trunc('month', v_start_date::timestamp)::date,
      date_trunc('month', v_end_date::timestamp)::date,
      interval '1 month'
    )::date as month_start
  ),
  monthly_actual as (
    select
      date_trunc('month', je.entry_date::timestamp)::date as month_start,
      round(coalesce(sum(case when a.account_type='revenue' then jl.credit-jl.debit else 0 end),0),2) as revenue,
      round(coalesce(sum(case when a.account_type='expense' and (a.system_key='cost_of_sales' or a.account_subtype='cost_of_sales') then jl.debit-jl.credit else 0 end),0),2) as cogs,
      round(coalesce(sum(case when a.account_type='expense' and not (a.system_key='cost_of_sales' or a.account_subtype='cost_of_sales') then jl.debit-jl.credit else 0 end),0),2) as opex
    from public.journal_entry je
    join public.journal_line jl on jl.journal_entry_id=je.id and jl.company_id=je.company_id
    join public.accounting_account a on a.id=jl.account_id and a.company_id=je.company_id
    where je.company_id=v_company_id
      and je.status='posted'
      and je.entry_date between v_start_date and v_end_date
      and (p_branch_id is null or je.branch_id=p_branch_id)
      and a.account_type in ('revenue','expense')
    group by 1
  ),
  monthly_budget as (
    select
      date_trunc('month', ap.start_date::timestamp)::date as month_start,
      round(coalesce(sum(case when a.account_type='revenue' then bl.amount else 0 end),0),2) as revenue,
      round(coalesce(sum(case when a.account_type='expense' and (a.system_key='cost_of_sales' or a.account_subtype='cost_of_sales') then bl.amount else 0 end),0),2) as cogs,
      round(coalesce(sum(case when a.account_type='expense' and not (a.system_key='cost_of_sales' or a.account_subtype='cost_of_sales') then bl.amount else 0 end),0),2) as opex
    from public.accounting_budget_line bl
    join public.accounting_period ap on ap.id=bl.accounting_period_id and ap.company_id=bl.company_id
    join public.accounting_account a on a.id=bl.account_id and a.company_id=bl.company_id
    where v_budget_id is not null
      and bl.company_id=v_company_id
      and bl.budget_id=v_budget_id
      and ap.end_date >= v_start_date
      and ap.start_date <= v_end_date
    group by 1
  )
  select jsonb_build_object(
    'ok',true,
    'period',jsonb_build_object(
      'start_date',v_start_date,
      'end_date',v_end_date,
      'financial_year_id',v_financial_year_id,
      'financial_year_name',v_financial_year_name,
      'branch_id',p_branch_id
    ),
    'budget',case when v_budget_id is null
      then jsonb_build_object('available',false)
      else jsonb_build_object('available',true,'id',v_budget_id,'name',v_budget_name)
    end,
    'summary',(
      select jsonb_build_object(
        'revenue_actual',round(revenue_actual,2),
        'revenue_budget',round(revenue_budget,2),
        'revenue_variance',round(revenue_actual-revenue_budget,2),
        'cogs_actual',round(cogs_actual,2),
        'cogs_budget',round(cogs_budget,2),
        'gross_profit_actual',round(revenue_actual-cogs_actual,2),
        'gross_profit_budget',round(revenue_budget-cogs_budget,2),
        'operating_expenses_actual',round(opex_actual,2),
        'operating_expenses_budget',round(opex_budget,2),
        'net_profit_actual',round(revenue_actual-cogs_actual-opex_actual,2),
        'net_profit_budget',round(revenue_budget-cogs_budget-opex_budget,2),
        'gross_margin_pct',case when revenue_actual=0 then null else round(((revenue_actual-cogs_actual)/revenue_actual)*100,2) end,
        'net_margin_pct',case when revenue_actual=0 then null else round(((revenue_actual-cogs_actual-opex_actual)/revenue_actual)*100,2) end
      ) from totals
    ),
    'quality',(
      select jsonb_build_object(
        'ledger_source','posted_journals',
        'cogs_status',case when product_revenue_actual > 0 and cogs_actual = 0 then 'inventory_costing_not_posted' else 'available' end,
        'warning',case when product_revenue_actual > 0 and cogs_actual = 0 then 'Product revenue exists but no Cost of Sales has been posted. Gross and net profit are therefore overstated until inventory costing is connected.' else null end
      ) from totals
    ),
    'accounts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'account_id',account_id,
        'code',code,
        'name',name,
        'account_type',account_type,
        'account_subtype',account_subtype,
        'actual',round(actual,2),
        'budget',round(budget,2),
        'variance',round(case when account_type='revenue' then actual-budget else budget-actual end,2)
      ) order by case when account_type='revenue' then 1 else 2 end, code)
      from accounts
    ),'[]'::jsonb),
    'monthly',coalesce((
      select jsonb_agg(jsonb_build_object(
        'month_start',m.month_start,
        'month_name',to_char(m.month_start,'Mon YYYY'),
        'revenue_actual',coalesce(a.revenue,0),
        'revenue_budget',coalesce(b.revenue,0),
        'cogs_actual',coalesce(a.cogs,0),
        'cogs_budget',coalesce(b.cogs,0),
        'operating_expenses_actual',coalesce(a.opex,0),
        'operating_expenses_budget',coalesce(b.opex,0),
        'net_profit_actual',round(coalesce(a.revenue,0)-coalesce(a.cogs,0)-coalesce(a.opex,0),2),
        'net_profit_budget',round(coalesce(b.revenue,0)-coalesce(b.cogs,0)-coalesce(b.opex,0),2)
      ) order by m.month_start)
      from month_series m
      left join monthly_actual a on a.month_start=m.month_start
      left join monthly_budget b on b.month_start=m.month_start
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

grant execute on function public.get_profit_and_loss_report(date,date,uuid) to authenticated;;
