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
  ),
  period_summary as (
    select
      accounting_period_id,period_name,start_date,end_date,
      round(sum(budget_amount),2) budget,
      round(sum(budget_to_date),2) budget_to_date,
      round(sum(actual_to_date),2) actual_to_date
    from line_actual
    group by accounting_period_id,period_name,start_date,end_date
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
      'budget',budget,'budget_to_date',budget_to_date,'actual_to_date',actual_to_date,
      'variance',round(actual_to_date-budget_to_date,2)
    ) order by start_date) from period_summary),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_budget_vs_actual(uuid,date) to authenticated;;
