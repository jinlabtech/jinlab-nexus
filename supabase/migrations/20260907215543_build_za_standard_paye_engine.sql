alter table public.payroll_pay_run
  add column if not exists statutory_rule_set_id uuid references public.payroll_statutory_rule_set(id) on delete restrict,
  add column if not exists calculated_by uuid,
  add column if not exists calculated_at timestamptz,
  add column if not exists calculation_version text;

create or replace function public.ensure_payroll_defaults(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.payroll_employer_settings(company_id,created_by,updated_by)
  values(p_company_id,auth.uid(),auth.uid())
  on conflict(company_id) do nothing;

  insert into public.payroll_component_definition(company_id,code,name,category,taxable,paye_remuneration,uif_remuneration,sdl_remuneration,is_system)
  values
    (p_company_id,'BASIC','Basic Salary','earning',true,true,true,true,true),
    (p_company_id,'OVERTIME','Overtime','earning',true,true,true,true,true),
    (p_company_id,'BONUS','Bonus','earning',true,true,true,true,true),
    (p_company_id,'COMMISSION','Commission','earning',true,true,true,true,true),
    (p_company_id,'PAYE','PAYE','deduction',false,false,false,false,true),
    (p_company_id,'UIF_EMPLOYEE','UIF Employee','deduction',false,false,false,false,true),
    (p_company_id,'UIF_EMPLOYER','UIF Employer','employer_contribution',false,false,false,false,true),
    (p_company_id,'SDL_EMPLOYER','SDL Employer','employer_contribution',false,false,false,false,true),
    (p_company_id,'MANUAL_DEDUCTION','Manual Deduction','deduction',false,false,false,false,true)
  on conflict(company_id,code) do nothing;
end;
$$;

create or replace function public.payroll_za_standard_monthly_paye(
  p_gross_monthly numeric,
  p_birth_date date,
  p_medical_scheme_main_member boolean default false,
  p_medical_scheme_dependants integer default 0,
  p_payment_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rule public.payroll_statutory_rule_set%rowtype;
  v_bracket jsonb;
  v_annual_equivalent numeric;
  v_annual_tax_before_rebate numeric := 0;
  v_annual_tax_after_rebate numeric := 0;
  v_rebate numeric := 0;
  v_medical_monthly numeric := 0;
  v_periodic_tax numeric := 0;
  v_age integer;
  v_age_category text;
  v_rate numeric;
  v_base numeric;
  v_over numeric;
  v_to numeric;
  v_found boolean := false;
begin
  if p_payment_date is null then
    raise exception 'Payment date is required.';
  end if;
  if p_birth_date is null then
    raise exception 'Date of birth is required for PAYE rebate calculation.';
  end if;
  if coalesce(p_gross_monthly,0) < 0 then
    raise exception 'Gross monthly remuneration cannot be negative.';
  end if;
  if coalesce(p_medical_scheme_dependants,0) < 0 then
    raise exception 'Medical scheme dependants cannot be negative.';
  end if;

  select * into v_rule
  from public.payroll_statutory_rule_set
  where jurisdiction='ZA'
    and status='active'
    and p_payment_date between effective_from and effective_to
  order by effective_from desc
  limit 1;

  if v_rule.id is null then
    raise exception 'No South African statutory rule set is configured for this payment date.';
  end if;

  v_annual_equivalent := round(coalesce(p_gross_monthly,0) * 12,2);

  for v_bracket in
    select value
    from jsonb_array_elements(v_rule.rules->'paye_brackets')
    order by (value->>'from')::numeric
  loop
    v_to := nullif(v_bracket->>'to','')::numeric;
    if v_to is null or v_annual_equivalent <= v_to then
      v_rate := coalesce((v_bracket->>'rate')::numeric,0);
      v_base := coalesce((v_bracket->>'base_tax')::numeric,0);
      v_over := coalesce((v_bracket->>'over')::numeric,0);
      v_annual_tax_before_rebate := round(v_base + greatest(v_annual_equivalent-v_over,0)*v_rate,2);
      v_found := true;
      exit;
    end if;
  end loop;

  if not v_found then
    raise exception 'PAYE bracket configuration is incomplete.';
  end if;

  v_age := extract(year from age(v_rule.effective_to,p_birth_date))::integer;

  if v_age >= 75 then
    v_age_category := '75_plus';
    v_rebate := coalesce((v_rule.rules#>>'{rebates,primary}')::numeric,0)
              + coalesce((v_rule.rules#>>'{rebates,secondary}')::numeric,0)
              + coalesce((v_rule.rules#>>'{rebates,tertiary}')::numeric,0);
  elsif v_age >= 65 then
    v_age_category := '65_to_74';
    v_rebate := coalesce((v_rule.rules#>>'{rebates,primary}')::numeric,0)
              + coalesce((v_rule.rules#>>'{rebates,secondary}')::numeric,0);
  else
    v_age_category := 'under_65';
    v_rebate := coalesce((v_rule.rules#>>'{rebates,primary}')::numeric,0);
  end if;

  v_annual_tax_after_rebate := greatest(round(v_annual_tax_before_rebate-v_rebate,2),0);

  if coalesce(p_medical_scheme_main_member,false) then
    v_medical_monthly := coalesce((v_rule.rules#>>'{medical_tax_credit_monthly,taxpayer}')::numeric,0);
    if coalesce(p_medical_scheme_dependants,0) >= 1 then
      v_medical_monthly := v_medical_monthly + coalesce((v_rule.rules#>>'{medical_tax_credit_monthly,first_dependent}')::numeric,0);
    end if;
    if coalesce(p_medical_scheme_dependants,0) > 1 then
      v_medical_monthly := v_medical_monthly
        + (p_medical_scheme_dependants-1) * coalesce((v_rule.rules#>>'{medical_tax_credit_monthly,additional_dependent}')::numeric,0);
    end if;
  end if;

  v_periodic_tax := greatest(round(v_annual_tax_after_rebate/12 - v_medical_monthly,2),0);

  return jsonb_build_object(
    'ok',true,
    'engine_version','ZA-standard-monthly-v1',
    'rule_set_id',v_rule.id,
    'tax_year',v_rule.tax_year,
    'source_title',v_rule.source_title,
    'source_url',v_rule.source_url,
    'gross_monthly',round(coalesce(p_gross_monthly,0),2),
    'annual_equivalent',v_annual_equivalent,
    'age_at_tax_year_end',v_age,
    'age_category',v_age_category,
    'annual_tax_before_rebate',v_annual_tax_before_rebate,
    'annual_rebate',round(v_rebate,2),
    'annual_tax_after_rebate',v_annual_tax_after_rebate,
    'medical_tax_credit_monthly',round(v_medical_monthly,2),
    'paye_monthly',v_periodic_tax,
    'scope','standard_monthly_remuneration_only',
    'unsupported',jsonb_build_array('tax_directives','retirement_fund_deductions','annual_payments','partial_pay_periods','hourly_pay','fringe_benefits','complex_allowances')
  );
end;
$$;

revoke all on function public.payroll_za_standard_monthly_paye(numeric,date,boolean,integer,date) from public, anon, authenticated;

create or replace function public.preview_payroll_paye_standard(
  p_employee_id uuid,
  p_gross_monthly numeric,
  p_payment_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company_id uuid;
  v_settings public.payroll_employer_settings%rowtype;
  v_profile public.payroll_employee_profile%rowtype;
  v_calc jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('payroll.view') then raise exception 'Permission denied: payroll.view'; end if;
  if coalesce(p_gross_monthly,0)<0 then raise exception 'Gross remuneration cannot be negative.'; end if;

  v_company_id:=public.current_company_id();
  perform public.ensure_payroll_defaults(v_company_id);

  select * into v_settings from public.payroll_employer_settings where company_id=v_company_id;
  select * into v_profile from public.payroll_employee_profile where company_id=v_company_id and employee_id=p_employee_id;
  if v_profile.id is null then raise exception 'Payroll profile is not configured for this employee.'; end if;
  if v_profile.compensation_type <> 'salaried' or v_profile.pay_frequency <> 'monthly' then
    raise exception 'Sprint 23.2 PAYE preview supports standard monthly salaried employees only.';
  end if;

  if not v_settings.paye_enabled or v_profile.paye_exempt then
    return jsonb_build_object('ok',true,'paye_monthly',0,'status',case when not v_settings.paye_enabled then 'employer_paye_disabled' else 'employee_paye_exempt' end,'gross_monthly',round(coalesce(p_gross_monthly,0),2));
  end if;

  v_calc:=public.payroll_za_standard_monthly_paye(
    p_gross_monthly,
    v_profile.birth_date,
    v_profile.medical_scheme_main_member,
    v_profile.medical_scheme_dependants,
    p_payment_date
  );

  return v_calc || jsonb_build_object('status','calculated');
end;
$$;

revoke all on function public.preview_payroll_paye_standard(uuid,numeric,date) from public, anon;
grant execute on function public.preview_payroll_paye_standard(uuid,numeric,date) to authenticated;

create or replace function public.calculate_payroll_pay_run(p_pay_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company_id uuid;
  v_run public.payroll_pay_run%rowtype;
  v_settings public.payroll_employer_settings%rowtype;
  v_rule public.payroll_statutory_rule_set%rowtype;
  v_rec record;
  v_run_employee_id uuid;
  v_blockers text[];
  v_gross numeric;
  v_paye numeric;
  v_uif_base numeric;
  v_uif_employee numeric;
  v_uif_employer numeric;
  v_sdl_employer numeric;
  v_net numeric;
  v_paye_calc jsonb;
  v_uif_ceiling numeric;
  v_uif_emp_rate numeric;
  v_uif_er_rate numeric;
  v_sdl_rate numeric;
  v_total integer := 0;
  v_calculated integer := 0;
  v_review integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('payroll.run') then raise exception 'Permission denied: payroll.run'; end if;

  v_company_id:=public.current_company_id();
  perform public.ensure_payroll_defaults(v_company_id);

  select * into v_run from public.payroll_pay_run where id=p_pay_run_id and company_id=v_company_id for update;
  if v_run.id is null then raise exception 'Pay run could not be found.'; end if;
  if v_run.status not in ('draft','calculated') then raise exception 'Only draft or calculated pay runs can be recalculated.'; end if;
  if v_run.pay_frequency <> 'monthly' then raise exception 'Sprint 23.2 calculation supports monthly pay runs only.'; end if;

  select * into v_settings from public.payroll_employer_settings where company_id=v_company_id;
  select * into v_rule from public.payroll_statutory_rule_set
  where jurisdiction='ZA' and status='active' and v_run.payment_date between effective_from and effective_to
  order by effective_from desc limit 1;
  if v_rule.id is null then raise exception 'No statutory rule set is configured for this payment date.'; end if;

  v_uif_ceiling:=coalesce((v_rule.rules#>>'{uif,monthly_ceiling}')::numeric,0);
  v_uif_emp_rate:=coalesce((v_rule.rules#>>'{uif,employee_rate}')::numeric,0);
  v_uif_er_rate:=coalesce((v_rule.rules#>>'{uif,employer_rate}')::numeric,0);
  v_sdl_rate:=coalesce((v_rule.rules#>>'{sdl,employer_rate}')::numeric,0);

  delete from public.payroll_pay_run_employee where pay_run_id=v_run.id and company_id=v_company_id;

  for v_rec in
    select e.*, pp.id as profile_id, pp.compensation_type, pp.pay_frequency as employee_pay_frequency,
           pp.basic_salary_monthly, pp.hourly_rate, pp.tax_number, pp.birth_date, pp.paye_exempt,
           pp.uif_exempt, pp.uif_exemption_reason, pp.medical_scheme_main_member, pp.medical_scheme_dependants
    from public.hr_employee e
    left join public.payroll_employee_profile pp on pp.company_id=e.company_id and pp.employee_id=e.id
    where e.company_id=v_company_id
      and e.status='active'
      and e.hire_date <= v_run.period_end
      and (e.end_date is null or e.end_date >= v_run.period_start)
      and (v_run.branch_id is null or e.primary_branch_id=v_run.branch_id)
    order by e.last_name,e.first_name
  loop
    v_total:=v_total+1;
    v_blockers:=array[]::text[];
    v_gross:=0; v_paye:=0; v_uif_employee:=0; v_uif_employer:=0; v_sdl_employer:=0; v_net:=0; v_paye_calc:='{}'::jsonb;

    if v_rec.profile_id is null then
      v_blockers:=array_append(v_blockers,'missing_payroll_profile');
    else
      if v_rec.compensation_type <> 'salaried' then v_blockers:=array_append(v_blockers,'hourly_pay_requires_time_based_engine'); end if;
      if v_rec.employee_pay_frequency <> 'monthly' then v_blockers:=array_append(v_blockers,'employee_pay_frequency_not_monthly'); end if;
      if v_rec.hire_date > v_run.period_start or (v_rec.end_date is not null and v_rec.end_date < v_run.period_end) then
        v_blockers:=array_append(v_blockers,'partial_pay_period_requires_annual_equivalent_engine');
      end if;
      if v_settings.paye_enabled and not coalesce(v_rec.paye_exempt,false) and v_rec.birth_date is null then
        v_blockers:=array_append(v_blockers,'birth_date_required_for_paye_rebate');
      end if;
    end if;

    if coalesce(array_length(v_blockers,1),0) > 0 then
      insert into public.payroll_pay_run_employee(
        company_id,pay_run_id,employee_id,calculation_status,calculation_details
      ) values(
        v_company_id,v_run.id,v_rec.id,'review_required',
        jsonb_build_object('engine_version','ZA-standard-monthly-v1','blockers',to_jsonb(v_blockers),'rule_set_id',v_rule.id,'tax_year',v_rule.tax_year)
      );
      v_review:=v_review+1;
      continue;
    end if;

    v_gross:=round(coalesce(v_rec.basic_salary_monthly,0),2);

    if v_settings.paye_enabled and not coalesce(v_rec.paye_exempt,false) then
      v_paye_calc:=public.payroll_za_standard_monthly_paye(
        v_gross,v_rec.birth_date,coalesce(v_rec.medical_scheme_main_member,false),coalesce(v_rec.medical_scheme_dependants,0),v_run.payment_date
      );
      v_paye:=coalesce((v_paye_calc->>'paye_monthly')::numeric,0);
    else
      v_paye_calc:=jsonb_build_object('status',case when not v_settings.paye_enabled then 'employer_paye_disabled' else 'employee_paye_exempt' end,'paye_monthly',0,'rule_set_id',v_rule.id,'tax_year',v_rule.tax_year);
    end if;

    v_uif_base:=least(v_gross,v_uif_ceiling);
    v_uif_employee:=case when v_settings.uif_enabled and not coalesce(v_rec.uif_exempt,false) then round(v_uif_base*v_uif_emp_rate,2) else 0 end;
    v_uif_employer:=case when v_settings.uif_enabled and not coalesce(v_rec.uif_exempt,false) then round(v_uif_base*v_uif_er_rate,2) else 0 end;
    v_sdl_employer:=case when v_settings.sdl_enabled then round(v_gross*v_sdl_rate,2) else 0 end;
    v_net:=round(v_gross-v_paye-v_uif_employee,2);

    insert into public.payroll_pay_run_employee(
      company_id,pay_run_id,employee_id,gross_remuneration,taxable_remuneration,paye_amount,uif_employee,uif_employer,sdl_employer,other_deductions,net_pay,calculation_status,calculation_details
    ) values(
      v_company_id,v_run.id,v_rec.id,v_gross,v_gross,v_paye,v_uif_employee,v_uif_employer,v_sdl_employer,0,v_net,'calculated',
      jsonb_build_object(
        'engine_version','ZA-standard-monthly-v1','rule_set_id',v_rule.id,'tax_year',v_rule.tax_year,
        'paye',v_paye_calc,'uif',jsonb_build_object('remuneration_base',v_uif_base,'employee_rate',v_uif_emp_rate,'employer_rate',v_uif_er_rate,'employee_amount',v_uif_employee,'employer_amount',v_uif_employer),
        'sdl',jsonb_build_object('enabled',v_settings.sdl_enabled,'rate',v_sdl_rate,'employer_amount',v_sdl_employer),
        'limitations',jsonb_build_array('standard_monthly_salary_only','no_tax_directives','no_retirement_fund_deductions','no_annual_payments','no_fringe_benefits','no_complex_allowances')
      )
    ) returning id into v_run_employee_id;

    insert into public.payroll_pay_run_item(company_id,pay_run_employee_id,component_code,component_name,category,quantity,rate,amount,taxable,paye_remuneration,uif_remuneration,sdl_remuneration,metadata)
    values
      (v_company_id,v_run_employee_id,'BASIC','Basic Salary','earning',1,v_gross,v_gross,true,true,true,true,'{}'::jsonb),
      (v_company_id,v_run_employee_id,'PAYE','PAYE','deduction',1,v_paye,v_paye,false,false,false,false,jsonb_build_object('statutory',true)),
      (v_company_id,v_run_employee_id,'UIF_EMPLOYEE','UIF Employee','deduction',1,v_uif_employee,v_uif_employee,false,false,false,false,jsonb_build_object('statutory',true)),
      (v_company_id,v_run_employee_id,'UIF_EMPLOYER','UIF Employer','employer_contribution',1,v_uif_employer,v_uif_employer,false,false,false,false,jsonb_build_object('statutory',true)),
      (v_company_id,v_run_employee_id,'SDL_EMPLOYER','SDL Employer','employer_contribution',1,v_sdl_employer,v_sdl_employer,false,false,false,false,jsonb_build_object('statutory',true));

    v_calculated:=v_calculated+1;
  end loop;

  update public.payroll_pay_run
  set status=case when v_total>0 and v_review=0 then 'calculated' else 'draft' end,
      statutory_rule_set_id=v_rule.id,
      calculated_by=auth.uid(),
      calculated_at=now(),
      calculation_version='ZA-standard-monthly-v1',
      updated_at=now()
  where id=v_run.id;

  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'payroll_run_calculated','payroll',v_run.id,'Payroll run calculation executed.',jsonb_build_object('engine_version','ZA-standard-monthly-v1','employees_total',v_total,'calculated',v_calculated,'review_required',v_review,'rule_set_id',v_rule.id,'tax_year',v_rule.tax_year));

  return jsonb_build_object(
    'ok',true,
    'pay_run_id',v_run.id,
    'status',case when v_total>0 and v_review=0 then 'calculated' else 'draft' end,
    'engine_version','ZA-standard-monthly-v1',
    'employees_total',v_total,
    'calculated',v_calculated,
    'review_required',v_review,
    'ready_for_review',(v_total>0 and v_review=0),
    'rule_set_id',v_rule.id,
    'tax_year',v_rule.tax_year
  );
end;
$$;

revoke all on function public.calculate_payroll_pay_run(uuid) from public, anon;
grant execute on function public.calculate_payroll_pay_run(uuid) to authenticated;

create or replace function public.get_payroll_run_workspace(p_pay_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company_id uuid;
  v_run public.payroll_pay_run%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('payroll.view') then raise exception 'Permission denied: payroll.view'; end if;
  v_company_id:=public.current_company_id();

  select * into v_run from public.payroll_pay_run where id=p_pay_run_id and company_id=v_company_id;
  if v_run.id is null then raise exception 'Pay run could not be found.'; end if;

  return jsonb_build_object(
    'ok',true,
    'run',jsonb_build_object(
      'id',v_run.id,'branch_id',v_run.branch_id,'period_start',v_run.period_start,'period_end',v_run.period_end,'payment_date',v_run.payment_date,
      'pay_frequency',v_run.pay_frequency,'tax_year',v_run.tax_year,'status',v_run.status,'notes',v_run.notes,
      'statutory_rule_set_id',v_run.statutory_rule_set_id,'calculated_at',v_run.calculated_at,'calculation_version',v_run.calculation_version
    ),
    'summary',jsonb_build_object(
      'employees',(select count(*) from public.payroll_pay_run_employee pre where pre.pay_run_id=v_run.id),
      'review_required',(select count(*) from public.payroll_pay_run_employee pre where pre.pay_run_id=v_run.id and pre.calculation_status='review_required'),
      'gross',(select coalesce(sum(pre.gross_remuneration),0) from public.payroll_pay_run_employee pre where pre.pay_run_id=v_run.id),
      'paye',(select coalesce(sum(pre.paye_amount),0) from public.payroll_pay_run_employee pre where pre.pay_run_id=v_run.id),
      'uif_employee',(select coalesce(sum(pre.uif_employee),0) from public.payroll_pay_run_employee pre where pre.pay_run_id=v_run.id),
      'uif_employer',(select coalesce(sum(pre.uif_employer),0) from public.payroll_pay_run_employee pre where pre.pay_run_id=v_run.id),
      'sdl_employer',(select coalesce(sum(pre.sdl_employer),0) from public.payroll_pay_run_employee pre where pre.pay_run_id=v_run.id),
      'net_pay',(select coalesce(sum(pre.net_pay),0) from public.payroll_pay_run_employee pre where pre.pay_run_id=v_run.id)
    ),
    'employees',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',pre.id,'employee_id',pre.employee_id,'employee_number',e.employee_number,'employee_name',e.first_name||' '||e.last_name,
        'gross_remuneration',pre.gross_remuneration,'taxable_remuneration',pre.taxable_remuneration,'paye_amount',pre.paye_amount,
        'uif_employee',pre.uif_employee,'uif_employer',pre.uif_employer,'sdl_employer',pre.sdl_employer,'other_deductions',pre.other_deductions,
        'net_pay',pre.net_pay,'calculation_status',pre.calculation_status,'calculation_details',pre.calculation_details,
        'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'code',i.component_code,'name',i.component_name,'category',i.category,'amount',i.amount,'metadata',i.metadata) order by i.created_at,i.component_code) from public.payroll_pay_run_item i where i.pay_run_employee_id=pre.id),'[]'::jsonb)
      ) order by e.last_name,e.first_name)
      from public.payroll_pay_run_employee pre
      join public.hr_employee e on e.id=pre.employee_id
      where pre.pay_run_id=v_run.id and pre.company_id=v_company_id
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_payroll_run_workspace(uuid) from public, anon;
grant execute on function public.get_payroll_run_workspace(uuid) to authenticated;;
