create or replace function public.get_budget_print_report(
  p_budget_id uuid,
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_budget public.accounting_budget%rowtype;
  v_company record;
  v_fy public.accounting_financial_year%rowtype;
  v_branch_name text;
  v_summary jsonb;
  v_monthly jsonb;
  v_accounts jsonb;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('accounting.view') then
    raise exception 'Permission denied: accounting.view';
  end if;

  v_company_id := public.current_company_id();

  select * into v_budget
  from public.accounting_budget
  where id=p_budget_id and company_id=v_company_id;

  if not found then
    raise exception 'Budget could not be found.';
  end if;

  select * into v_fy
  from public.accounting_financial_year
  where id=v_budget.financial_year_id
    and company_id=v_company_id;

  select company_name,registration_number,email,phone
  into v_company
  from public.company
  where id=v_company_id;

  if v_budget.branch_id is not null then
    select branch_name into v_branch_name
    from public.branch
    where id=v_budget.branch_id
      and company_id=v_company_id;
  end if;

  with account_totals as (
    select
      a.id as account_id,
      a.code,
      a.name,
      a.account_type,
      a.account_subtype,
      a.system_key,
      round(coalesce(sum(bl.amount),0),2) as annual_budget,
      round(coalesce((
        select sum(case when a.account_type='revenue' then jl.credit-jl.debit else jl.debit-jl.credit end)
        from public.journal_entry je
        join public.journal_line jl
          on jl.journal_entry_id=je.id
         and jl.company_id=je.company_id
        where je.company_id=v_company_id
          and je.status='posted'
          and jl.account_id=a.id
          and je.entry_date between v_fy.start_date and least(v_fy.end_date,coalesce(p_as_of_date,current_date))
          and (v_budget.branch_id is null or je.branch_id=v_budget.branch_id)
      ),0),2) as actual_to_date
    from public.accounting_account a
    left join public.accounting_budget_line bl
      on bl.account_id=a.id
     and bl.company_id=a.company_id
     and bl.budget_id=v_budget.id
    where a.company_id=v_company_id
      and a.is_active=true
      and a.account_type in ('revenue','expense')
    group by a.id,a.code,a.name,a.account_type,a.account_subtype,a.system_key
  ), totals as (
    select
      coalesce(sum(annual_budget) filter (where account_type='revenue'),0) revenue_budget,
      coalesce(sum(annual_budget) filter (where account_type='expense'),0) expense_budget,
      coalesce(sum(annual_budget) filter (where account_type='expense' and (system_key='cost_of_sales' or account_subtype='cost_of_sales')),0) cogs_budget,
      coalesce(sum(actual_to_date) filter (where account_type='revenue'),0) revenue_actual,
      coalesce(sum(actual_to_date) filter (where account_type='expense'),0) expense_actual,
      coalesce(sum(actual_to_date) filter (where account_type='expense' and (system_key='cost_of_sales' or account_subtype='cost_of_sales')),0) cogs_actual
    from account_totals
  )
  select jsonb_build_object(
    'annual_revenue_budget',round(revenue_budget,2),
    'annual_expense_budget',round(expense_budget,2),
    'annual_cogs_budget',round(cogs_budget,2),
    'annual_gross_profit_budget',round(revenue_budget-cogs_budget,2),
    'annual_net_profit_budget',round(revenue_budget-expense_budget,2),
    'annual_net_margin_budget_pct',case when revenue_budget=0 then null else round(((revenue_budget-expense_budget)/revenue_budget)*100,2) end,
    'actual_revenue_to_date',round(revenue_actual,2),
    'actual_expense_to_date',round(expense_actual,2),
    'actual_net_profit_to_date',round(revenue_actual-expense_actual,2),
    'revenue_progress_pct',case when revenue_budget=0 then null else round((revenue_actual/revenue_budget)*100,2) end,
    'profit_progress_pct',case when revenue_budget-expense_budget=0 then null else round(((revenue_actual-expense_actual)/(revenue_budget-expense_budget))*100,2) end
  ) into v_summary
  from totals;

  with periods as (
    select p.id,p.name,p.start_date,p.end_date
    from public.accounting_period p
    where p.company_id=v_company_id
      and p.financial_year_id=v_fy.id
      and coalesce(p.is_adjustment_period,false)=false
  ), budget_month as (
    select
      p.id as period_id,
      round(coalesce(sum(bl.amount) filter (where a.account_type='revenue'),0),2) revenue_budget,
      round(coalesce(sum(bl.amount) filter (where a.account_type='expense' and (a.system_key='cost_of_sales' or a.account_subtype='cost_of_sales')),0),2) cogs_budget,
      round(coalesce(sum(bl.amount) filter (where a.account_type='expense' and not (a.system_key='cost_of_sales' or a.account_subtype='cost_of_sales')),0),2) opex_budget
    from periods p
    left join public.accounting_budget_line bl
      on bl.accounting_period_id=p.id
     and bl.company_id=v_company_id
     and bl.budget_id=v_budget.id
    left join public.accounting_account a
      on a.id=bl.account_id
     and a.company_id=bl.company_id
    group by p.id
  ), actual_month as (
    select
      p.id as period_id,
      round(coalesce(sum(case when a.account_type='revenue' then jl.credit-jl.debit else 0 end),0),2) revenue_actual,
      round(coalesce(sum(case when a.account_type='expense' and (a.system_key='cost_of_sales' or a.account_subtype='cost_of_sales') then jl.debit-jl.credit else 0 end),0),2) cogs_actual,
      round(coalesce(sum(case when a.account_type='expense' and not (a.system_key='cost_of_sales' or a.account_subtype='cost_of_sales') then jl.debit-jl.credit else 0 end),0),2) opex_actual
    from periods p
    left join public.journal_entry je
      on je.company_id=v_company_id
     and je.status='posted'
     and je.entry_date between p.start_date and least(p.end_date,coalesce(p_as_of_date,current_date))
     and (v_budget.branch_id is null or je.branch_id=v_budget.branch_id)
    left join public.journal_line jl
      on jl.journal_entry_id=je.id
     and jl.company_id=je.company_id
    left join public.accounting_account a
      on a.id=jl.account_id
     and a.company_id=jl.company_id
    group by p.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'period_id',p.id,
    'period_name',p.name,
    'start_date',p.start_date,
    'end_date',p.end_date,
    'revenue_budget',coalesce(b.revenue_budget,0),
    'revenue_actual',coalesce(x.revenue_actual,0),
    'cogs_budget',coalesce(b.cogs_budget,0),
    'cogs_actual',coalesce(x.cogs_actual,0),
    'operating_expenses_budget',coalesce(b.opex_budget,0),
    'operating_expenses_actual',coalesce(x.opex_actual,0),
    'gross_profit_budget',round(coalesce(b.revenue_budget,0)-coalesce(b.cogs_budget,0),2),
    'gross_profit_actual',round(coalesce(x.revenue_actual,0)-coalesce(x.cogs_actual,0),2),
    'net_profit_budget',round(coalesce(b.revenue_budget,0)-coalesce(b.cogs_budget,0)-coalesce(b.opex_budget,0),2),
    'net_profit_actual',round(coalesce(x.revenue_actual,0)-coalesce(x.cogs_actual,0)-coalesce(x.opex_actual,0),2)
  ) order by p.start_date),'[]'::jsonb)
  into v_monthly
  from periods p
  left join budget_month b on b.period_id=p.id
  left join actual_month x on x.period_id=p.id;

  with account_totals as (
    select
      a.id as account_id,
      a.code,
      a.name,
      a.account_type,
      a.account_subtype,
      a.system_key,
      round(coalesce(sum(bl.amount),0),2) annual_budget,
      round(coalesce((
        select sum(case when a.account_type='revenue' then jl.credit-jl.debit else jl.debit-jl.credit end)
        from public.journal_entry je
        join public.journal_line jl on jl.journal_entry_id=je.id and jl.company_id=je.company_id
        where je.company_id=v_company_id
          and je.status='posted'
          and jl.account_id=a.id
          and je.entry_date between v_fy.start_date and least(v_fy.end_date,coalesce(p_as_of_date,current_date))
          and (v_budget.branch_id is null or je.branch_id=v_budget.branch_id)
      ),0),2) actual_to_date
    from public.accounting_account a
    left join public.accounting_budget_line bl
      on bl.account_id=a.id
     and bl.company_id=a.company_id
     and bl.budget_id=v_budget.id
    where a.company_id=v_company_id
      and a.is_active=true
      and a.account_type in ('revenue','expense')
    group by a.id,a.code,a.name,a.account_type,a.account_subtype,a.system_key
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'account_id',account_id,
    'code',code,
    'name',name,
    'account_type',account_type,
    'account_subtype',account_subtype,
    'annual_budget',annual_budget,
    'actual_to_date',actual_to_date,
    'variance_to_annual_budget',round(actual_to_date-annual_budget,2)
  ) order by case account_type when 'revenue' then 1 else 2 end,code) filter (where annual_budget<>0 or actual_to_date<>0),'[]'::jsonb)
  into v_accounts
  from account_totals;

  v_result := jsonb_build_object(
    'ok',true,
    'document',jsonb_build_object(
      'title','Budget & Performance Plan',
      'generated_at',now(),
      'as_of_date',coalesce(p_as_of_date,current_date),
      'status',v_budget.status,
      'draft_notice',case when v_budget.status='draft' then 'DRAFT · Review and approve before operational use.' else null end
    ),
    'company',jsonb_build_object(
      'name',v_company.company_name,
      'registration_number',v_company.registration_number,
      'email',v_company.email,
      'phone',v_company.phone,
      'branch_name',v_branch_name
    ),
    'financial_year',jsonb_build_object(
      'id',v_fy.id,
      'name',v_fy.name,
      'start_date',v_fy.start_date,
      'end_date',v_fy.end_date
    ),
    'budget',jsonb_build_object(
      'id',v_budget.id,
      'name',v_budget.name,
      'status',v_budget.status,
      'notes',v_budget.notes,
      'generation_method',v_budget.generation_method,
      'generation_metadata',v_budget.generation_metadata,
      'approved_at',v_budget.approved_at,
      'approved_by',v_budget.approved_by
    ),
    'summary',v_summary,
    'monthly_plan',v_monthly,
    'accounts',v_accounts,
    'methodology',coalesce(v_budget.generation_metadata->'methodology','[]'::jsonb),
    'quality_warning',v_budget.generation_metadata->>'quality_warning',
    'signature_fields',jsonb_build_object(
      'prepared_by_label','Prepared by',
      'reviewed_by_label','Reviewed by',
      'approved_by_label','Approved by',
      'date_label','Date'
    )
  );

  return v_result;
end;
$function$;;
