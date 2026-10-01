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
  v_rule public.payroll_statutory_rule_set%rowtype;
  v_age integer;
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

  select * into v_rule from public.payroll_statutory_rule_set
  where jurisdiction='ZA' and status='active' and p_payment_date between effective_from and effective_to
  order by effective_from desc limit 1;
  if v_rule.id is null then raise exception 'No statutory rule set is configured for this payment date.'; end if;
  if v_profile.birth_date is null then raise exception 'Date of birth is required for PAYE rebate calculation.'; end if;

  v_age:=extract(year from age(v_rule.effective_to,v_profile.birth_date))::integer;
  if v_age>=65 and v_profile.medical_scheme_main_member then
    raise exception 'PAYE review required: age 65+ medical scheme cases require additional medical tax credit inputs not yet implemented.';
  end if;

  v_calc:=public.payroll_za_standard_monthly_paye(
    p_gross_monthly,
    v_profile.birth_date,
    v_profile.medical_scheme_main_member,
    v_profile.medical_scheme_dependants,
    p_payment_date
  );

  return v_calc || jsonb_build_object('status','calculated','special_case_scope','standard_non_disability_medical_credit_only');
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
  v_age integer;
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
    v_gross:=0; v_paye:=0; v_uif_employee:=0; v_uif_employer:=0; v_sdl_employer:=0; v_net:=0; v_paye_calc:='{}'::jsonb; v_age:=null;

    if v_rec.profile_id is null then
      v_blockers:=array_append(v_blockers,'missing_payroll_profile');
    else
      if v_rec.compensation_type <> 'salaried' then v_blockers:=array_append(v_blockers,'hourly_pay_requires_time_based_engine'); end if;
      if v_rec.employee_pay_frequency <> 'monthly' then v_blockers:=array_append(v_blockers,'employee_pay_frequency_not_monthly'); end if;
      if v_rec.hire_date > v_run.period_start or (v_rec.end_date is not null and v_rec.end_date < v_run.period_end) then
        v_blockers:=array_append(v_blockers,'partial_pay_period_requires_annual_equivalent_engine');
      end if;
      if v_settings.paye_enabled and not coalesce(v_rec.paye_exempt,false) then
        if v_rec.birth_date is null then
          v_blockers:=array_append(v_blockers,'birth_date_required_for_paye_rebate');
        else
          v_age:=extract(year from age(v_rule.effective_to,v_rec.birth_date))::integer;
          if v_age>=65 and coalesce(v_rec.medical_scheme_main_member,false) then
            v_blockers:=array_append(v_blockers,'age_65_plus_medical_additional_credit_inputs_required');
          end if;
        end if;
      end if;
    end if;

    if coalesce(array_length(v_blockers,1),0) > 0 then
      insert into public.payroll_pay_run_employee(company_id,pay_run_id,employee_id,calculation_status,calculation_details)
      values(v_company_id,v_run.id,v_rec.id,'review_required',jsonb_build_object('engine_version','ZA-standard-monthly-v1','blockers',to_jsonb(v_blockers),'rule_set_id',v_rule.id,'tax_year',v_rule.tax_year));
      v_review:=v_review+1;
      continue;
    end if;

    v_gross:=round(coalesce(v_rec.basic_salary_monthly,0),2);

    if v_settings.paye_enabled and not coalesce(v_rec.paye_exempt,false) then
      v_paye_calc:=public.payroll_za_standard_monthly_paye(v_gross,v_rec.birth_date,coalesce(v_rec.medical_scheme_main_member,false),coalesce(v_rec.medical_scheme_dependants,0),v_run.payment_date);
      v_paye:=coalesce((v_paye_calc->>'paye_monthly')::numeric,0);
    else
      v_paye_calc:=jsonb_build_object('status',case when not v_settings.paye_enabled then 'employer_paye_disabled' else 'employee_paye_exempt' end,'paye_monthly',0,'rule_set_id',v_rule.id,'tax_year',v_rule.tax_year);
    end if;

    v_uif_base:=least(v_gross,v_uif_ceiling);
    v_uif_employee:=case when v_settings.uif_enabled and not coalesce(v_rec.uif_exempt,false) then round(v_uif_base*v_uif_emp_rate,2) else 0 end;
    v_uif_employer:=case when v_settings.uif_enabled and not coalesce(v_rec.uif_exempt,false) then round(v_uif_base*v_uif_er_rate,2) else 0 end;
    v_sdl_employer:=case when v_settings.sdl_enabled then round(v_gross*v_sdl_rate,2) else 0 end;
    v_net:=round(v_gross-v_paye-v_uif_employee,2);

    insert into public.payroll_pay_run_employee(company_id,pay_run_id,employee_id,gross_remuneration,taxable_remuneration,paye_amount,uif_employee,uif_employer,sdl_employer,other_deductions,net_pay,calculation_status,calculation_details)
    values(v_company_id,v_run.id,v_rec.id,v_gross,v_gross,v_paye,v_uif_employee,v_uif_employer,v_sdl_employer,0,v_net,'calculated',
      jsonb_build_object('engine_version','ZA-standard-monthly-v1','rule_set_id',v_rule.id,'tax_year',v_rule.tax_year,'paye',v_paye_calc,
        'uif',jsonb_build_object('remuneration_base',v_uif_base,'employee_rate',v_uif_emp_rate,'employer_rate',v_uif_er_rate,'employee_amount',v_uif_employee,'employer_amount',v_uif_employer),
        'sdl',jsonb_build_object('enabled',v_settings.sdl_enabled,'rate',v_sdl_rate,'employer_amount',v_sdl_employer),
        'limitations',jsonb_build_array('standard_monthly_salary_only','no_tax_directives','no_retirement_fund_deductions','no_annual_payments','no_fringe_benefits','no_complex_allowances','age_65_plus_medical_additional_credit_requires_inputs','disability_medical_special_cases_require_review')))
    returning id into v_run_employee_id;

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
      statutory_rule_set_id=v_rule.id,calculated_by=auth.uid(),calculated_at=now(),calculation_version='ZA-standard-monthly-v1',updated_at=now()
  where id=v_run.id;

  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'payroll_run_calculated','payroll',v_run.id,'Payroll run calculation executed.',jsonb_build_object('engine_version','ZA-standard-monthly-v1','employees_total',v_total,'calculated',v_calculated,'review_required',v_review,'rule_set_id',v_rule.id,'tax_year',v_rule.tax_year));

  return jsonb_build_object('ok',true,'pay_run_id',v_run.id,'status',case when v_total>0 and v_review=0 then 'calculated' else 'draft' end,'engine_version','ZA-standard-monthly-v1','employees_total',v_total,'calculated',v_calculated,'review_required',v_review,'ready_for_review',(v_total>0 and v_review=0),'rule_set_id',v_rule.id,'tax_year',v_rule.tax_year);
end;
$$;

revoke all on function public.calculate_payroll_pay_run(uuid) from public, anon;
grant execute on function public.calculate_payroll_pay_run(uuid) to authenticated;;
