alter table public.accounting_budget
  add column if not exists generation_method text not null default 'manual',
  add column if not exists generation_metadata jsonb not null default '{}'::jsonb;

alter table public.accounting_budget
  drop constraint if exists accounting_budget_generation_method_check;

alter table public.accounting_budget
  add constraint accounting_budget_generation_method_check
  check (generation_method in ('manual','performance_forecast'));

create or replace function public.generate_performance_based_budget(
  p_financial_year_id uuid,
  p_branch_id uuid default null,
  p_scenario text default 'auto',
  p_name text default null,
  p_randomness_pct numeric default 4
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_fy public.accounting_financial_year%rowtype;
  v_budget public.accounting_budget%rowtype;
  v_account record;
  v_period record;
  v_current_month date := date_trunc('month', current_date)::date;
  v_history_start date := (date_trunc('month', current_date) - interval '12 months')::date;
  v_history_end date := current_date;
  v_history_months integer := 0;
  v_confidence text := 'low';
  v_recent_revenue numeric := 0;
  v_previous_revenue numeric := 0;
  v_company_trend numeric := 0;
  v_roll numeric;
  v_scenario text;
  v_base_growth numeric := 0;
  v_revenue_growth numeric := 0;
  v_expense_growth numeric := 0;
  v_active_avg numeric := 0;
  v_recent_avg numeric := 0;
  v_previous_avg numeric := 0;
  v_account_trend numeric := 0;
  v_baseline numeric := 0;
  v_current_actual numeric := 0;
  v_period_actual numeric := 0;
  v_projected_current numeric := 0;
  v_target numeric := 0;
  v_jitter numeric := 1;
  v_seasonality numeric := 1;
  v_months_forward integer := 0;
  v_elapsed_days numeric := 1;
  v_days_in_month numeric := 1;
  v_line_count integer := 0;
  v_total_revenue numeric := 0;
  v_total_expense numeric := 0;
  v_cogs_account_id uuid;
  v_sales_revenue_account_id uuid;
  v_catalog_cost_ratio numeric;
  v_existing_cogs_actual numeric := 0;
  v_notes text;
  v_quality_warning text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('accounting.budget.manage') then
    raise exception 'Permission denied: accounting.budget.manage';
  end if;

  if p_scenario not in ('auto','conservative','balanced','growth') then
    raise exception 'Scenario must be auto, conservative, balanced or growth.';
  end if;

  if p_randomness_pct < 0 or p_randomness_pct > 15 then
    raise exception 'Randomness must be between 0 and 15 percent.';
  end if;

  v_company_id := public.current_company_id();

  select * into v_fy
  from public.accounting_financial_year
  where id = p_financial_year_id
    and company_id = v_company_id;

  if not found then
    raise exception 'Financial year could not be found.';
  end if;

  if p_branch_id is not null and not exists (
    select 1
    from public.branch
    where id = p_branch_id
      and company_id = v_company_id
  ) then
    raise exception 'Branch could not be found.';
  end if;

  select count(distinct date_trunc('month',je.entry_date::timestamp))::int
  into v_history_months
  from public.journal_entry je
  join public.journal_line jl
    on jl.journal_entry_id = je.id
   and jl.company_id = je.company_id
  join public.accounting_account a
    on a.id = jl.account_id
   and a.company_id = jl.company_id
  where je.company_id = v_company_id
    and je.status = 'posted'
    and je.entry_date >= v_history_start
    and je.entry_date <= v_history_end
    and (p_branch_id is null or je.branch_id = p_branch_id)
    and a.account_type in ('revenue','expense')
    and abs(case when a.account_type='revenue' then jl.credit-jl.debit else jl.debit-jl.credit end) > 0.009;

  v_confidence := case
    when v_history_months >= 6 then 'high'
    when v_history_months >= 3 then 'medium'
    else 'low'
  end;

  with monthly_revenue as (
    select
      date_trunc('month',je.entry_date::timestamp)::date as month_start,
      round(sum(jl.credit-jl.debit),2) as amount
    from public.journal_entry je
    join public.journal_line jl
      on jl.journal_entry_id=je.id
     and jl.company_id=je.company_id
    join public.accounting_account a
      on a.id=jl.account_id
     and a.company_id=jl.company_id
    where je.company_id=v_company_id
      and je.status='posted'
      and je.entry_date >= (v_current_month - interval '6 months')::date
      and je.entry_date < v_current_month
      and (p_branch_id is null or je.branch_id=p_branch_id)
      and a.account_type='revenue'
    group by 1
  )
  select
    coalesce(avg(amount) filter (
      where month_start >= (v_current_month - interval '3 months')::date
        and month_start < v_current_month
        and amount <> 0
    ),0),
    coalesce(avg(amount) filter (
      where month_start >= (v_current_month - interval '6 months')::date
        and month_start < (v_current_month - interval '3 months')::date
        and amount <> 0
    ),0)
  into v_recent_revenue,v_previous_revenue
  from monthly_revenue;

  if v_recent_revenue > 0 and v_previous_revenue > 0 then
    v_company_trend := greatest(-0.50,least(0.50,(v_recent_revenue/v_previous_revenue)-1));
  else
    v_company_trend := 0;
  end if;

  if p_scenario = 'auto' then
    v_roll := random();
    if v_company_trend >= 0.15 then
      v_scenario := case when v_roll < 0.15 then 'conservative' when v_roll < 0.55 then 'balanced' else 'growth' end;
    elsif v_company_trend <= -0.10 then
      v_scenario := case when v_roll < 0.50 then 'conservative' when v_roll < 0.90 then 'balanced' else 'growth' end;
    else
      v_scenario := case when v_roll < 0.20 then 'conservative' when v_roll < 0.80 then 'balanced' else 'growth' end;
    end if;
  else
    v_scenario := p_scenario;
  end if;

  v_base_growth := case v_scenario
    when 'conservative' then 0.03
    when 'balanced' then 0.08
    else 0.15
  end;

  v_revenue_growth := case v_scenario
    when 'conservative' then greatest(-0.03,least(0.08, v_base_growth + (v_company_trend*0.15) + ((random()*0.03)-0.015)))
    when 'balanced' then greatest(0.00,least(0.18, v_base_growth + (v_company_trend*0.25) + ((random()*0.04)-0.02)))
    else greatest(0.05,least(0.30, v_base_growth + (v_company_trend*0.35) + ((random()*0.05)-0.025)))
  end;

  v_expense_growth := greatest(0.02,least(0.12,0.035 + greatest(v_revenue_growth,0)*0.30 + ((random()*0.02)-0.01)));

  select a.id into v_cogs_account_id
  from public.accounting_account a
  where a.company_id=v_company_id
    and a.is_active=true
    and (a.system_key='cost_of_sales' or a.account_subtype='cost_of_sales')
  order by a.is_system desc,a.code
  limit 1;

  select a.id into v_sales_revenue_account_id
  from public.accounting_account a
  where a.company_id=v_company_id
    and a.is_active=true
    and a.system_key='sales_revenue'
  order by a.is_system desc,a.code
  limit 1;

  select round(avg(greatest(0.05,least(0.95,i.cost_price/nullif(i.selling_price,0)))),4)
  into v_catalog_cost_ratio
  from public.inventory_item i
  where i.company_id=v_company_id
    and i.is_active=true
    and i.cost_price > 0
    and i.selling_price > 0;

  select coalesce(round(sum(jl.debit-jl.credit),2),0)
  into v_existing_cogs_actual
  from public.journal_entry je
  join public.journal_line jl
    on jl.journal_entry_id=je.id
   and jl.company_id=je.company_id
  where je.company_id=v_company_id
    and je.status='posted'
    and jl.account_id=v_cogs_account_id
    and je.entry_date between v_history_start and current_date
    and (p_branch_id is null or je.branch_id=p_branch_id);

  v_quality_warning := case
    when v_existing_cogs_actual = 0 and v_catalog_cost_ratio is not null
      then 'Historical Cost of Sales is not yet posted. Future Cost of Sales targets use current inventory cost-to-selling-price ratios as a planning estimate only.'
    when v_existing_cogs_actual = 0
      then 'Historical Cost of Sales is not yet posted and inventory catalogue ratios were unavailable. Cost of Sales may require manual review.'
    else null
  end;

  v_notes := format(
    'Generated by Nexus Smart Budget v1 from posted accounting performance on %s. Scenario: %s. Confidence: %s. Draft only; review before approval.',
    to_char(current_date,'DD Mon YYYY'),v_scenario,v_confidence
  );

  insert into public.accounting_budget(
    company_id,financial_year_id,branch_id,name,status,notes,
    generation_method,generation_metadata,created_by,updated_by
  ) values (
    v_company_id,
    v_fy.id,
    p_branch_id,
    coalesce(nullif(trim(coalesce(p_name,'')),''),format('Nexus Smart Budget · %s · %s · %s',v_fy.name,initcap(v_scenario),to_char(clock_timestamp(),'DD Mon HH24:MI'))),
    'draft',
    v_notes,
    'performance_forecast',
    jsonb_build_object(
      'algorithm_version','1.0',
      'generated_at',now(),
      'scenario',v_scenario,
      'requested_scenario',p_scenario,
      'confidence',v_confidence,
      'history_months',v_history_months,
      'company_revenue_trend',round(v_company_trend*100,2),
      'annual_revenue_growth_assumption_pct',round(v_revenue_growth*100,2),
      'annual_expense_growth_assumption_pct',round(v_expense_growth*100,2),
      'randomness_pct',p_randomness_pct,
      'catalog_cost_ratio_pct',case when v_catalog_cost_ratio is null then null else round(v_catalog_cost_ratio*100,2) end,
      'quality_warning',v_quality_warning,
      'methodology',jsonb_build_array(
        'Past periods use posted actuals as the rolling-forecast baseline.',
        'The current month is pace-adjusted and capped against recent performance to reduce early-month distortion.',
        'Future periods use weighted recent performance, momentum, bounded scenario growth, seasonality when sufficient history exists, and controlled random variation.',
        'Revenue growth and operating-expense growth are modelled separately.',
        'When historical Cost of Sales is unavailable, future COGS may use current inventory catalogue cost ratios as a planning estimate.',
        'Generated budgets remain drafts until explicitly approved.'
      )
    ),
    auth.uid(),auth.uid()
  ) returning * into v_budget;

  for v_account in
    select a.*
    from public.accounting_account a
    where a.company_id=v_company_id
      and a.is_active=true
      and a.account_type in ('revenue','expense')
      and (v_cogs_account_id is null or a.id<>v_cogs_account_id)
    order by case a.account_type when 'revenue' then 1 else 2 end,a.code
  loop
    with month_actual as (
      select
        date_trunc('month',je.entry_date::timestamp)::date as month_start,
        round(sum(case when v_account.account_type='revenue' then jl.credit-jl.debit else jl.debit-jl.credit end),2) amount
      from public.journal_entry je
      join public.journal_line jl
        on jl.journal_entry_id=je.id
       and jl.company_id=je.company_id
      where je.company_id=v_company_id
        and je.status='posted'
        and jl.account_id=v_account.id
        and je.entry_date >= (v_current_month - interval '12 months')::date
        and je.entry_date <= current_date
        and (p_branch_id is null or je.branch_id=p_branch_id)
      group by 1
    )
    select
      coalesce(avg(amount) filter (where month_start < v_current_month and amount<>0),0),
      coalesce(avg(amount) filter (where month_start >= (v_current_month-interval '3 months')::date and month_start<v_current_month and amount<>0),0),
      coalesce(avg(amount) filter (where month_start >= (v_current_month-interval '6 months')::date and month_start<(v_current_month-interval '3 months')::date and amount<>0),0),
      coalesce(sum(amount) filter (where month_start=v_current_month),0)
    into v_active_avg,v_recent_avg,v_previous_avg,v_current_actual
    from month_actual;

    if v_recent_avg > 0 and v_previous_avg > 0 then
      v_account_trend := greatest(-0.40,least(0.40,(v_recent_avg/v_previous_avg)-1));
    else
      v_account_trend := 0;
    end if;

    v_baseline := case
      when v_recent_avg>0 and v_previous_avg>0 then (v_recent_avg*0.65)+(v_previous_avg*0.20)+(v_active_avg*0.15)
      when v_recent_avg>0 then (v_recent_avg*0.80)+(v_active_avg*0.20)
      else v_active_avg
    end;

    for v_period in
      select p.*
      from public.accounting_period p
      where p.company_id=v_company_id
        and p.financial_year_id=v_fy.id
        and coalesce(p.is_adjustment_period,false)=false
      order by p.start_date
    loop
      select coalesce(round(sum(case when v_account.account_type='revenue' then jl.credit-jl.debit else jl.debit-jl.credit end),2),0)
      into v_period_actual
      from public.journal_entry je
      join public.journal_line jl
        on jl.journal_entry_id=je.id
       and jl.company_id=je.company_id
      where je.company_id=v_company_id
        and je.status='posted'
        and jl.account_id=v_account.id
        and je.entry_date between v_period.start_date and least(v_period.end_date,current_date)
        and (p_branch_id is null or je.branch_id=p_branch_id);

      if v_period.end_date < v_current_month then
        v_target := greatest(v_period_actual,0);

      elsif current_date between v_period.start_date and v_period.end_date then
        v_elapsed_days := greatest((current_date-v_period.start_date+1)::numeric,1);
        v_days_in_month := greatest((v_period.end_date-v_period.start_date+1)::numeric,1);
        v_projected_current := greatest(v_period_actual,0) * v_days_in_month / v_elapsed_days;

        if v_baseline > 0 then
          if v_account.account_type='revenue' then
            v_target := greatest(v_period_actual,least(v_projected_current,v_baseline*1.75));
          else
            v_target := greatest(v_period_actual,least(v_projected_current,v_baseline*1.50));
          end if;
        else
          v_target := greatest(v_period_actual,0);
        end if;

      else
        v_months_forward := ((extract(year from v_period.start_date)::int-extract(year from v_current_month)::int)*12)
                          + (extract(month from v_period.start_date)::int-extract(month from v_current_month)::int);

        v_seasonality := 1;
        if v_history_months >= 6 and v_active_avg > 0 then
          select coalesce(avg(x.amount),v_active_avg)/nullif(v_active_avg,0)
          into v_seasonality
          from (
            select round(sum(case when v_account.account_type='revenue' then jl.credit-jl.debit else jl.debit-jl.credit end),2) amount
            from public.journal_entry je
            join public.journal_line jl
              on jl.journal_entry_id=je.id
             and jl.company_id=je.company_id
            where je.company_id=v_company_id
              and je.status='posted'
              and jl.account_id=v_account.id
              and je.entry_date >= (v_current_month-interval '24 months')::date
              and je.entry_date < v_current_month
              and extract(month from je.entry_date)=extract(month from v_period.start_date)
              and (p_branch_id is null or je.branch_id=p_branch_id)
            group by date_trunc('month',je.entry_date::timestamp)
          ) x;
          v_seasonality := greatest(0.75,least(1.25,coalesce(v_seasonality,1)));
        end if;

        v_jitter := 1 + (((random()*2)-1) * (p_randomness_pct/100.0));

        if v_account.account_type='revenue' then
          v_target := v_baseline
            * power(1 + greatest(-0.20,least(0.35,v_revenue_growth + (v_account_trend*0.10))), greatest(v_months_forward,0)/12.0)
            * v_seasonality
            * v_jitter;
        else
          v_target := v_baseline
            * power(1 + greatest(0.00,least(0.20,v_expense_growth + (v_account_trend*0.05))), greatest(v_months_forward,0)/12.0)
            * v_seasonality
            * v_jitter;
        end if;
      end if;

      v_target := greatest(coalesce(v_target,0),0);
      if v_target >= 500 then
        v_target := round(v_target/50.0)*50;
      elsif v_target > 0 then
        v_target := round(v_target/10.0)*10;
      end if;

      if v_target > 0.009 then
        insert into public.accounting_budget_line(
          budget_id,company_id,account_id,accounting_period_id,amount,created_by,updated_by
        ) values (
          v_budget.id,v_company_id,v_account.id,v_period.id,round(v_target,2),auth.uid(),auth.uid()
        );
        v_line_count := v_line_count + 1;
      end if;
    end loop;
  end loop;

  if v_cogs_account_id is not null then
    for v_period in
      select p.*
      from public.accounting_period p
      where p.company_id=v_company_id
        and p.financial_year_id=v_fy.id
        and coalesce(p.is_adjustment_period,false)=false
      order by p.start_date
    loop
      select coalesce(round(sum(jl.debit-jl.credit),2),0)
      into v_period_actual
      from public.journal_entry je
      join public.journal_line jl
        on jl.journal_entry_id=je.id
       and jl.company_id=je.company_id
      where je.company_id=v_company_id
        and je.status='posted'
        and jl.account_id=v_cogs_account_id
        and je.entry_date between v_period.start_date and least(v_period.end_date,current_date)
        and (p_branch_id is null or je.branch_id=p_branch_id);

      if v_period.end_date < v_current_month then
        v_target := greatest(v_period_actual,0);
      elsif v_existing_cogs_actual > 0 then
        select coalesce(avg(case when jl.debit-jl.credit>0 then jl.debit-jl.credit end),0)
        into v_baseline
        from public.journal_entry je
        join public.journal_line jl
          on jl.journal_entry_id=je.id
         and jl.company_id=je.company_id
        where je.company_id=v_company_id
          and je.status='posted'
          and jl.account_id=v_cogs_account_id
          and je.entry_date >= (v_current_month-interval '6 months')::date
          and je.entry_date < v_current_month
          and (p_branch_id is null or je.branch_id=p_branch_id);
        v_target := greatest(v_period_actual, v_baseline * (1+v_expense_growth));
      elsif v_catalog_cost_ratio is not null and v_sales_revenue_account_id is not null then
        select coalesce(amount,0)
        into v_target
        from public.accounting_budget_line
        where budget_id=v_budget.id
          and account_id=v_sales_revenue_account_id
          and accounting_period_id=v_period.id;
        v_target := coalesce(v_target,0) * v_catalog_cost_ratio;
      else
        v_target := greatest(v_period_actual,0);
      end if;

      v_target := greatest(coalesce(v_target,0),0);
      if v_target >= 500 then
        v_target := round(v_target/50.0)*50;
      elsif v_target > 0 then
        v_target := round(v_target/10.0)*10;
      end if;

      if v_target > 0.009 then
        insert into public.accounting_budget_line(
          budget_id,company_id,account_id,accounting_period_id,amount,created_by,updated_by
        ) values (
          v_budget.id,v_company_id,v_cogs_account_id,v_period.id,round(v_target,2),auth.uid(),auth.uid()
        )
        on conflict (budget_id,account_id,accounting_period_id)
        do update set amount=excluded.amount,updated_by=auth.uid(),updated_at=now();
        v_line_count := v_line_count + 1;
      end if;
    end loop;
  end if;

  select
    coalesce(round(sum(bl.amount) filter (where a.account_type='revenue'),2),0),
    coalesce(round(sum(bl.amount) filter (where a.account_type='expense'),2),0)
  into v_total_revenue,v_total_expense
  from public.accounting_budget_line bl
  join public.accounting_account a
    on a.id=bl.account_id
   and a.company_id=bl.company_id
  where bl.budget_id=v_budget.id;

  update public.accounting_budget
  set generation_metadata = generation_metadata || jsonb_build_object(
    'generated_line_count',v_line_count,
    'annual_revenue_target',v_total_revenue,
    'annual_expense_target',v_total_expense,
    'annual_profit_target',round(v_total_revenue-v_total_expense,2),
    'annual_net_margin_target_pct',case when v_total_revenue=0 then null else round(((v_total_revenue-v_total_expense)/v_total_revenue)*100,2) end
  ),
  updated_at=now()
  where id=v_budget.id;

  return jsonb_build_object(
    'ok',true,
    'budget_id',v_budget.id,
    'name',v_budget.name,
    'status','draft',
    'scenario',v_scenario,
    'confidence',v_confidence,
    'history_months',v_history_months,
    'revenue_growth_assumption_pct',round(v_revenue_growth*100,2),
    'expense_growth_assumption_pct',round(v_expense_growth*100,2),
    'annual_revenue_target',v_total_revenue,
    'annual_expense_target',v_total_expense,
    'annual_profit_target',round(v_total_revenue-v_total_expense,2),
    'quality_warning',v_quality_warning,
    'message','Smart budget generated as a draft. Review before approval.'
  );
end;
$function$;

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
  v_branch_name text;
  v_workspace jsonb;
  v_comparison jsonb;
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
  where id=p_budget_id
    and company_id=v_company_id;

  if not found then
    raise exception 'Budget could not be found.';
  end if;

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

  v_workspace := public.get_accounting_budget_workspace(p_budget_id);
  v_comparison := public.get_budget_vs_actual(p_budget_id,coalesce(p_as_of_date,current_date));

  select jsonb_build_object(
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
    'budget',jsonb_build_object(
      'id',v_budget.id,
      'name',v_budget.name,
      'status',v_budget.status,
      'notes',v_budget.notes,
      'generation_method',v_budget.generation_method,
      'generation_metadata',v_budget.generation_metadata,
      'approved_at',v_budget.approved_at
    ),
    'financial_year',v_workspace->'budget',
    'summary',v_comparison->'summary',
    'accounts',v_comparison->'accounts',
    'periods',v_comparison->'periods',
    'workspace_periods',v_workspace->'periods',
    'workspace_lines',v_workspace->'lines',
    'methodology',coalesce(v_budget.generation_metadata->'methodology','[]'::jsonb),
    'quality_warning',v_budget.generation_metadata->>'quality_warning'
  ) into v_result;

  return v_result;
end;
$function$;

grant execute on function public.generate_performance_based_budget(uuid,uuid,text,text,numeric) to authenticated;
grant execute on function public.get_budget_print_report(uuid,date) to authenticated;;
