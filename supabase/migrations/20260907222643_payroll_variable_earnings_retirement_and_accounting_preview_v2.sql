alter table public.payroll_employee_profile
  add column if not exists retirement_fund_type text,
  add column if not exists employee_retirement_monthly numeric not null default 0,
  add column if not exists employer_retirement_monthly numeric not null default 0;

alter table public.payroll_employee_profile drop constraint if exists payroll_employee_profile_retirement_fund_type_check;
alter table public.payroll_employee_profile add constraint payroll_employee_profile_retirement_fund_type_check check (retirement_fund_type is null or retirement_fund_type in ('pension','provident','retirement_annuity'));
alter table public.payroll_employee_profile drop constraint if exists payroll_employee_profile_employee_retirement_monthly_check;
alter table public.payroll_employee_profile add constraint payroll_employee_profile_employee_retirement_monthly_check check (employee_retirement_monthly >= 0);
alter table public.payroll_employee_profile drop constraint if exists payroll_employee_profile_employer_retirement_monthly_check;
alter table public.payroll_employee_profile add constraint payroll_employee_profile_employer_retirement_monthly_check check (employer_retirement_monthly >= 0);

create table if not exists public.payroll_pay_run_input (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  pay_run_id uuid not null references public.payroll_pay_run(id) on delete cascade,
  employee_id uuid not null references public.hr_employee(id) on delete restrict,
  component_code text not null,
  quantity numeric not null default 1,
  rate numeric not null default 0,
  amount numeric not null default 0,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_pay_run_input_component_check check (component_code in ('OVERTIME','COMMISSION','BONUS','MANUAL_DEDUCTION')),
  constraint payroll_pay_run_input_quantity_check check (quantity >= 0),
  constraint payroll_pay_run_input_rate_check check (rate >= 0),
  constraint payroll_pay_run_input_amount_check check (amount >= 0)
);
create index if not exists payroll_pay_run_input_run_idx on public.payroll_pay_run_input(pay_run_id, employee_id);
alter table public.payroll_pay_run_input enable row level security;
revoke all on public.payroll_pay_run_input from public, anon, authenticated;

insert into public.payroll_component_definition(company_id,code,name,category,taxable,paye_remuneration,uif_remuneration,sdl_remuneration,is_system)
select c.id,'RETIREMENT_EMPLOYEE','Employee Retirement Contribution','deduction',false,false,false,false,true from public.company c
on conflict(company_id,code) do nothing;
insert into public.payroll_component_definition(company_id,code,name,category,taxable,paye_remuneration,uif_remuneration,sdl_remuneration,is_system)
select c.id,'RETIREMENT_EMPLOYER','Employer Retirement Contribution','employer_contribution',true,true,false,false,true from public.company c
on conflict(company_id,code) do nothing;

create table if not exists public.payroll_accounting_mapping (
  company_id uuid primary key references public.company(id) on delete cascade,
  salaries_expense_account_id uuid references public.accounting_account(id) on delete restrict,
  employer_contribution_expense_account_id uuid references public.accounting_account(id) on delete restrict,
  net_pay_payable_account_id uuid references public.accounting_account(id) on delete restrict,
  paye_payable_account_id uuid references public.accounting_account(id) on delete restrict,
  uif_payable_account_id uuid references public.accounting_account(id) on delete restrict,
  sdl_payable_account_id uuid references public.accounting_account(id) on delete restrict,
  retirement_payable_account_id uuid references public.accounting_account(id) on delete restrict,
  other_deductions_payable_account_id uuid references public.accounting_account(id) on delete restrict,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.payroll_accounting_mapping enable row level security;
revoke all on public.payroll_accounting_mapping from public, anon, authenticated;

create or replace function public.ensure_payroll_accounting_defaults(p_company_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.company where id=p_company_id) then raise exception 'Company could not be found.'; end if;
  insert into public.accounting_account(company_id,code,name,description,account_type,account_subtype,normal_balance,system_key,is_system,allow_manual_posting,is_active)
  values
    (p_company_id,'2310','Payroll Payable','Net payroll payable to employees.','liability','payroll','credit','payroll_payable',true,false,true),
    (p_company_id,'2320','PAYE Payable','PAYE withheld and payable to SARS.','liability','payroll_tax','credit','paye_payable',true,false,true),
    (p_company_id,'2330','UIF Payable','Employee and employer UIF payable.','liability','payroll_tax','credit','uif_payable',true,false,true),
    (p_company_id,'2340','SDL Payable','Skills Development Levy payable.','liability','payroll_tax','credit','sdl_payable',true,false,true),
    (p_company_id,'2350','Retirement Fund Payable','Employee and employer retirement contributions payable.','liability','payroll','credit','retirement_payable',true,false,true),
    (p_company_id,'2360','Payroll Other Deductions Payable','Other payroll deductions payable to third parties.','liability','payroll','credit','payroll_other_deductions_payable',true,false,true),
    (p_company_id,'6310','Employer Payroll Contributions','Employer UIF, SDL and employer retirement contribution expense.','expense','payroll','debit','employer_payroll_contributions',true,false,true)
  on conflict(company_id,code) do nothing;
  insert into public.payroll_accounting_mapping(company_id,salaries_expense_account_id,employer_contribution_expense_account_id,net_pay_payable_account_id,paye_payable_account_id,uif_payable_account_id,sdl_payable_account_id,retirement_payable_account_id,other_deductions_payable_account_id,updated_by)
  values(
    p_company_id,
    (select id from public.accounting_account where company_id=p_company_id and system_key='salaries_wages' limit 1),
    (select id from public.accounting_account where company_id=p_company_id and system_key='employer_payroll_contributions' limit 1),
    (select id from public.accounting_account where company_id=p_company_id and system_key='payroll_payable' limit 1),
    (select id from public.accounting_account where company_id=p_company_id and system_key='paye_payable' limit 1),
    (select id from public.accounting_account where company_id=p_company_id and system_key='uif_payable' limit 1),
    (select id from public.accounting_account where company_id=p_company_id and system_key='sdl_payable' limit 1),
    (select id from public.accounting_account where company_id=p_company_id and system_key='retirement_payable' limit 1),
    (select id from public.accounting_account where company_id=p_company_id and system_key='payroll_other_deductions_payable' limit 1),auth.uid())
  on conflict(company_id) do update set salaries_expense_account_id=excluded.salaries_expense_account_id,employer_contribution_expense_account_id=excluded.employer_contribution_expense_account_id,net_pay_payable_account_id=excluded.net_pay_payable_account_id,paye_payable_account_id=excluded.paye_payable_account_id,uif_payable_account_id=excluded.uif_payable_account_id,sdl_payable_account_id=excluded.sdl_payable_account_id,retirement_payable_account_id=excluded.retirement_payable_account_id,other_deductions_payable_account_id=excluded.other_deductions_payable_account_id,updated_by=auth.uid(),updated_at=now();
end;$$;
revoke all on function public.ensure_payroll_accounting_defaults(uuid) from public,anon,authenticated;

create or replace function public.save_payroll_retirement_settings(p_employee_id uuid,p_retirement_fund_type text default null,p_employee_retirement_monthly numeric default 0,p_employer_retirement_monthly numeric default 0)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_company_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required.'; end if;
 if not public.current_user_has_permission('payroll.manage') then raise exception 'Permission denied: payroll.manage'; end if;
 v_company_id:=public.current_company_id();
 if not exists(select 1 from public.payroll_employee_profile where company_id=v_company_id and employee_id=p_employee_id) then raise exception 'Payroll profile is not configured for this employee.'; end if;
 if p_retirement_fund_type is not null and p_retirement_fund_type not in ('pension','provident','retirement_annuity') then raise exception 'Unsupported retirement fund type.'; end if;
 if coalesce(p_employee_retirement_monthly,0)<0 or coalesce(p_employer_retirement_monthly,0)<0 then raise exception 'Retirement contributions cannot be negative.'; end if;
 update public.payroll_employee_profile set retirement_fund_type=p_retirement_fund_type,employee_retirement_monthly=coalesce(p_employee_retirement_monthly,0),employer_retirement_monthly=coalesce(p_employer_retirement_monthly,0),updated_by=auth.uid(),updated_at=now() where company_id=v_company_id and employee_id=p_employee_id;
 insert into public.audit_log(company_id,user_id,action,module,description,metadata) values(v_company_id,auth.uid(),'payroll_retirement_settings_saved','payroll','Employee retirement contribution settings updated.',jsonb_build_object('employee_id',p_employee_id,'fund_type',p_retirement_fund_type));
 return jsonb_build_object('ok',true);
end;$$;

create or replace function public.save_payroll_run_input(p_pay_run_id uuid,p_employee_id uuid,p_component_code text,p_quantity numeric default 1,p_rate numeric default 0,p_amount numeric default 0,p_notes text default null,p_input_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_company_id uuid; v_id uuid; v_status text;
begin
 if auth.uid() is null then raise exception 'Authentication required.'; end if;
 if not public.current_user_has_permission('payroll.run') then raise exception 'Permission denied: payroll.run'; end if;
 v_company_id:=public.current_company_id();
 select status into v_status from public.payroll_pay_run where id=p_pay_run_id and company_id=v_company_id;
 if v_status is null then raise exception 'Pay run could not be found.'; end if;
 if v_status not in ('draft','calculated') then raise exception 'Payroll inputs can only be changed before approval.'; end if;
 if not exists(select 1 from public.hr_employee where id=p_employee_id and company_id=v_company_id) then raise exception 'Employee could not be found.'; end if;
 if p_component_code not in ('OVERTIME','COMMISSION','BONUS','MANUAL_DEDUCTION') then raise exception 'Unsupported payroll input component.'; end if;
 if coalesce(p_quantity,0)<0 or coalesce(p_rate,0)<0 or coalesce(p_amount,0)<0 then raise exception 'Payroll input values cannot be negative.'; end if;
 if p_input_id is null then
   insert into public.payroll_pay_run_input(company_id,pay_run_id,employee_id,component_code,quantity,rate,amount,notes,created_by,updated_by) values(v_company_id,p_pay_run_id,p_employee_id,p_component_code,coalesce(p_quantity,1),coalesce(p_rate,0),coalesce(p_amount,0),nullif(btrim(coalesce(p_notes,'')),''),auth.uid(),auth.uid()) returning id into v_id;
 else
   update public.payroll_pay_run_input set component_code=p_component_code,quantity=coalesce(p_quantity,1),rate=coalesce(p_rate,0),amount=coalesce(p_amount,0),notes=nullif(btrim(coalesce(p_notes,'')),''),updated_by=auth.uid(),updated_at=now() where id=p_input_id and company_id=v_company_id and pay_run_id=p_pay_run_id returning id into v_id;
   if v_id is null then raise exception 'Payroll input could not be found.'; end if;
 end if;
 delete from public.payroll_pay_run_employee where pay_run_id=p_pay_run_id and company_id=v_company_id;
 update public.payroll_pay_run set status='draft',calculated_by=null,calculated_at=null,calculation_version=null,statutory_rule_set_id=null,updated_at=now() where id=p_pay_run_id;
 insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata) values(v_company_id,auth.uid(),'payroll_run_input_saved','payroll',p_pay_run_id,'Payroll run earning or deduction input saved.',jsonb_build_object('input_id',v_id,'employee_id',p_employee_id,'component_code',p_component_code,'amount',p_amount));
 return jsonb_build_object('ok',true,'id',v_id);
end;$$;

create or replace function public.delete_payroll_run_input(p_input_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_company_id uuid; v_run_id uuid; v_status text;
begin
 if auth.uid() is null then raise exception 'Authentication required.'; end if;
 if not public.current_user_has_permission('payroll.run') then raise exception 'Permission denied: payroll.run'; end if;
 v_company_id:=public.current_company_id();
 select i.pay_run_id,r.status into v_run_id,v_status from public.payroll_pay_run_input i join public.payroll_pay_run r on r.id=i.pay_run_id where i.id=p_input_id and i.company_id=v_company_id;
 if v_run_id is null then raise exception 'Payroll input could not be found.'; end if;
 if v_status not in ('draft','calculated') then raise exception 'Payroll inputs cannot be removed after approval.'; end if;
 delete from public.payroll_pay_run_input where id=p_input_id and company_id=v_company_id;
 delete from public.payroll_pay_run_employee where pay_run_id=v_run_id and company_id=v_company_id;
 update public.payroll_pay_run set status='draft',calculated_by=null,calculated_at=null,calculation_version=null,statutory_rule_set_id=null,updated_at=now() where id=v_run_id;
 insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata) values(v_company_id,auth.uid(),'payroll_run_input_deleted','payroll',v_run_id,'Payroll run input removed.',jsonb_build_object('input_id',p_input_id));
 return jsonb_build_object('ok',true);
end;$$;

create or replace function public.calculate_payroll_pay_run(p_pay_run_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_company_id uuid; v_run public.payroll_pay_run%rowtype; v_settings public.payroll_employer_settings%rowtype; v_rule public.payroll_statutory_rule_set%rowtype; v_rec record; v_run_employee_id uuid; v_blockers text[];
 v_basic numeric; v_overtime numeric; v_commission numeric; v_bonus numeric; v_manual_deduction numeric; v_gross numeric; v_employee_retirement numeric; v_employer_retirement numeric; v_retirement_allowed numeric; v_paye_base numeric; v_paye numeric; v_uif_base numeric; v_uif_employee numeric; v_uif_employer numeric; v_sdl_employer numeric; v_net numeric; v_paye_calc jsonb; v_uif_ceiling numeric; v_uif_emp_rate numeric; v_uif_er_rate numeric; v_sdl_rate numeric; v_age integer; v_total integer:=0; v_calculated integer:=0; v_review integer:=0;
begin
 if auth.uid() is null then raise exception 'Authentication required.'; end if;
 if not public.current_user_has_permission('payroll.run') then raise exception 'Permission denied: payroll.run'; end if;
 v_company_id:=public.current_company_id(); perform public.ensure_payroll_defaults(v_company_id); perform public.ensure_payroll_accounting_defaults(v_company_id);
 select * into v_run from public.payroll_pay_run where id=p_pay_run_id and company_id=v_company_id for update;
 if v_run.id is null then raise exception 'Pay run could not be found.'; end if;
 if v_run.status not in ('draft','calculated') then raise exception 'Only draft or calculated pay runs can be recalculated.'; end if;
 if v_run.pay_frequency<>'monthly' then raise exception 'Sprint 23.3 calculation supports monthly pay runs only.'; end if;
 select * into v_settings from public.payroll_employer_settings where company_id=v_company_id;
 select * into v_rule from public.payroll_statutory_rule_set where jurisdiction='ZA' and status='active' and v_run.payment_date between effective_from and effective_to order by effective_from desc limit 1;
 if v_rule.id is null then raise exception 'No statutory rule set is configured for this payment date.'; end if;
 v_uif_ceiling:=coalesce((v_rule.rules#>>'{uif,monthly_ceiling}')::numeric,0); v_uif_emp_rate:=coalesce((v_rule.rules#>>'{uif,employee_rate}')::numeric,0); v_uif_er_rate:=coalesce((v_rule.rules#>>'{uif,employer_rate}')::numeric,0); v_sdl_rate:=coalesce((v_rule.rules#>>'{sdl,employer_rate}')::numeric,0);
 delete from public.payroll_pay_run_employee where pay_run_id=v_run.id and company_id=v_company_id;
 for v_rec in
   select e.*,pp.id profile_id,pp.compensation_type,pp.pay_frequency employee_pay_frequency,pp.basic_salary_monthly,pp.hourly_rate,pp.tax_number,pp.birth_date,pp.paye_exempt,pp.uif_exempt,pp.uif_exemption_reason,pp.medical_scheme_main_member,pp.medical_scheme_dependants,pp.retirement_fund_type,pp.employee_retirement_monthly,pp.employer_retirement_monthly
   from public.hr_employee e left join public.payroll_employee_profile pp on pp.company_id=e.company_id and pp.employee_id=e.id
   where e.company_id=v_company_id and e.status='active' and e.hire_date<=v_run.period_end and (e.end_date is null or e.end_date>=v_run.period_start) and (v_run.branch_id is null or e.primary_branch_id=v_run.branch_id) order by e.last_name,e.first_name
 loop
   v_total:=v_total+1; v_blockers:=array[]::text[]; v_basic:=0;v_overtime:=0;v_commission:=0;v_bonus:=0;v_manual_deduction:=0;v_gross:=0;v_employee_retirement:=0;v_employer_retirement:=0;v_retirement_allowed:=0;v_paye_base:=0;v_paye:=0;v_uif_employee:=0;v_uif_employer:=0;v_sdl_employer:=0;v_net:=0;v_paye_calc:='{}'::jsonb;v_age:=null;
   select coalesce(sum(amount) filter(where component_code='OVERTIME'),0),coalesce(sum(amount) filter(where component_code='COMMISSION'),0),coalesce(sum(amount) filter(where component_code='BONUS'),0),coalesce(sum(amount) filter(where component_code='MANUAL_DEDUCTION'),0)
   into v_overtime,v_commission,v_bonus,v_manual_deduction from public.payroll_pay_run_input where company_id=v_company_id and pay_run_id=v_run.id and employee_id=v_rec.id;
   if v_rec.profile_id is null then v_blockers:=array_append(v_blockers,'missing_payroll_profile'); else
     if v_rec.compensation_type<>'salaried' then v_blockers:=array_append(v_blockers,'hourly_pay_requires_time_based_engine'); end if;
     if v_rec.employee_pay_frequency<>'monthly' then v_blockers:=array_append(v_blockers,'employee_pay_frequency_not_monthly'); end if;
     if v_rec.hire_date>v_run.period_start or (v_rec.end_date is not null and v_rec.end_date<v_run.period_end) then v_blockers:=array_append(v_blockers,'partial_pay_period_requires_annual_equivalent_engine'); end if;
     if v_bonus>0 then v_blockers:=array_append(v_blockers,'bonus_requires_special_variable_remuneration_review'); end if;
     if coalesce(v_rec.employer_retirement_monthly,0)>0 then v_blockers:=array_append(v_blockers,'employer_retirement_fringe_benefit_requires_review'); end if;
     if v_settings.paye_enabled and not coalesce(v_rec.paye_exempt,false) then
       if v_rec.birth_date is null then v_blockers:=array_append(v_blockers,'birth_date_required_for_paye_rebate'); else v_age:=extract(year from age(v_rule.effective_to,v_rec.birth_date))::integer; if v_age>=65 and coalesce(v_rec.medical_scheme_main_member,false) then v_blockers:=array_append(v_blockers,'age_65_plus_medical_additional_credit_inputs_required'); end if; end if;
     end if;
   end if;
   if coalesce(array_length(v_blockers,1),0)>0 then
     insert into public.payroll_pay_run_employee(company_id,pay_run_id,employee_id,calculation_status,calculation_details) values(v_company_id,v_run.id,v_rec.id,'review_required',jsonb_build_object('engine_version','ZA-standard-monthly-v2','blockers',to_jsonb(v_blockers),'rule_set_id',v_rule.id,'tax_year',v_rule.tax_year,'inputs',jsonb_build_object('overtime',v_overtime,'commission',v_commission,'bonus',v_bonus,'manual_deduction',v_manual_deduction))); v_review:=v_review+1; continue;
   end if;
   v_basic:=round(coalesce(v_rec.basic_salary_monthly,0),2); v_employee_retirement:=round(coalesce(v_rec.employee_retirement_monthly,0),2); v_employer_retirement:=round(coalesce(v_rec.employer_retirement_monthly,0),2); v_gross:=round(v_basic+v_overtime+v_commission,2); v_retirement_allowed:=round(least(v_employee_retirement,round(v_gross*0.275,2),round(430000.00/12,2),v_gross),2); v_paye_base:=greatest(round(v_gross-v_retirement_allowed,2),0);
   if v_settings.paye_enabled and not coalesce(v_rec.paye_exempt,false) then
     v_paye_calc:=public.payroll_za_standard_monthly_paye(v_paye_base,v_rec.birth_date,coalesce(v_rec.medical_scheme_main_member,false),coalesce(v_rec.medical_scheme_dependants,0),v_run.payment_date)||jsonb_build_object('cash_gross_monthly',v_gross,'retirement_contribution_actual',v_employee_retirement,'retirement_deduction_allowed',v_retirement_allowed,'taxable_monthly_after_retirement',v_paye_base,'engine_version','ZA-standard-monthly-v2'); v_paye:=coalesce((v_paye_calc->>'paye_monthly')::numeric,0);
   else
     v_paye_calc:=jsonb_build_object('status',case when not v_settings.paye_enabled then 'employer_paye_disabled' else 'employee_paye_exempt' end,'paye_monthly',0,'rule_set_id',v_rule.id,'tax_year',v_rule.tax_year,'cash_gross_monthly',v_gross,'retirement_contribution_actual',v_employee_retirement,'retirement_deduction_allowed',v_retirement_allowed,'taxable_monthly_after_retirement',v_paye_base,'engine_version','ZA-standard-monthly-v2');
   end if;
   v_uif_base:=least(v_gross,v_uif_ceiling); v_uif_employee:=case when v_settings.uif_enabled and not coalesce(v_rec.uif_exempt,false) then round(v_uif_base*v_uif_emp_rate,2) else 0 end; v_uif_employer:=case when v_settings.uif_enabled and not coalesce(v_rec.uif_exempt,false) then round(v_uif_base*v_uif_er_rate,2) else 0 end; v_sdl_employer:=case when v_settings.sdl_enabled then round(v_gross*v_sdl_rate,2) else 0 end; v_net:=round(v_gross-v_paye-v_uif_employee-v_employee_retirement-v_manual_deduction,2);
   if v_net<0 then insert into public.payroll_pay_run_employee(company_id,pay_run_id,employee_id,gross_remuneration,taxable_remuneration,paye_amount,uif_employee,uif_employer,sdl_employer,other_deductions,net_pay,calculation_status,calculation_details) values(v_company_id,v_run.id,v_rec.id,v_gross,v_paye_base,v_paye,v_uif_employee,v_uif_employer,v_sdl_employer,v_manual_deduction,v_net,'review_required',jsonb_build_object('engine_version','ZA-standard-monthly-v2','blockers',jsonb_build_array('negative_net_pay'),'rule_set_id',v_rule.id,'tax_year',v_rule.tax_year)); v_review:=v_review+1; continue; end if;
   insert into public.payroll_pay_run_employee(company_id,pay_run_id,employee_id,gross_remuneration,taxable_remuneration,paye_amount,uif_employee,uif_employer,sdl_employer,other_deductions,net_pay,calculation_status,calculation_details)
   values(v_company_id,v_run.id,v_rec.id,v_gross,v_paye_base,v_paye,v_uif_employee,v_uif_employer,v_sdl_employer,v_manual_deduction,v_net,'calculated',jsonb_build_object('engine_version','ZA-standard-monthly-v2','rule_set_id',v_rule.id,'tax_year',v_rule.tax_year,'paye',v_paye_calc,'earnings',jsonb_build_object('basic',v_basic,'overtime',v_overtime,'commission',v_commission,'cash_gross',v_gross),'retirement',jsonb_build_object('fund_type',v_rec.retirement_fund_type,'employee_actual',v_employee_retirement,'employee_allowed_for_paye',v_retirement_allowed,'employer_actual',v_employer_retirement,'annual_limit',430000,'percentage_limit',0.275),'uif',jsonb_build_object('remuneration_base',v_uif_base,'employee_rate',v_uif_emp_rate,'employer_rate',v_uif_er_rate,'employee_amount',v_uif_employee,'employer_amount',v_uif_employer),'sdl',jsonb_build_object('enabled',v_settings.sdl_enabled,'rate',v_sdl_rate,'employer_amount',v_sdl_employer),'manual_deductions',v_manual_deduction,'limitations',jsonb_build_array('standard_monthly_salary','overtime_and_commission_supported_as_current_period_taxable_remuneration','bonus_requires_review','no_tax_directives','employer_retirement_fringe_benefit_requires_review','no_partial_periods','age_65_plus_medical_additional_credit_requires_inputs','disability_medical_special_cases_require_review'))) returning id into v_run_employee_id;
   insert into public.payroll_pay_run_item(company_id,pay_run_employee_id,component_code,component_name,category,quantity,rate,amount,taxable,paye_remuneration,uif_remuneration,sdl_remuneration,metadata) values(v_company_id,v_run_employee_id,'BASIC','Basic Salary','earning',1,v_basic,v_basic,true,true,true,true,'{}'::jsonb);
   if v_overtime>0 then insert into public.payroll_pay_run_item(company_id,pay_run_employee_id,component_code,component_name,category,quantity,rate,amount,taxable,paye_remuneration,uif_remuneration,sdl_remuneration,metadata) values(v_company_id,v_run_employee_id,'OVERTIME','Overtime','earning',1,v_overtime,v_overtime,true,true,true,true,jsonb_build_object('source','manual_payroll_input')); end if;
   if v_commission>0 then insert into public.payroll_pay_run_item(company_id,pay_run_employee_id,component_code,component_name,category,quantity,rate,amount,taxable,paye_remuneration,uif_remuneration,sdl_remuneration,metadata) values(v_company_id,v_run_employee_id,'COMMISSION','Commission','earning',1,v_commission,v_commission,true,true,true,true,jsonb_build_object('source','manual_payroll_input')); end if;
   if v_employee_retirement>0 then insert into public.payroll_pay_run_item(company_id,pay_run_employee_id,component_code,component_name,category,quantity,rate,amount,taxable,paye_remuneration,uif_remuneration,sdl_remuneration,metadata) values(v_company_id,v_run_employee_id,'RETIREMENT_EMPLOYEE','Employee Retirement Contribution','deduction',1,v_employee_retirement,v_employee_retirement,false,false,false,false,jsonb_build_object('fund_type',v_rec.retirement_fund_type,'allowed_for_paye',v_retirement_allowed)); end if;
   if v_manual_deduction>0 then insert into public.payroll_pay_run_item(company_id,pay_run_employee_id,component_code,component_name,category,quantity,rate,amount,taxable,paye_remuneration,uif_remuneration,sdl_remuneration,metadata) values(v_company_id,v_run_employee_id,'MANUAL_DEDUCTION','Manual Deduction','deduction',1,v_manual_deduction,v_manual_deduction,false,false,false,false,jsonb_build_object('source','manual_payroll_input')); end if;
   insert into public.payroll_pay_run_item(company_id,pay_run_employee_id,component_code,component_name,category,quantity,rate,amount,taxable,paye_remuneration,uif_remuneration,sdl_remuneration,metadata) values
    (v_company_id,v_run_employee_id,'PAYE','PAYE','deduction',1,v_paye,v_paye,false,false,false,false,jsonb_build_object('statutory',true)),
    (v_company_id,v_run_employee_id,'UIF_EMPLOYEE','UIF Employee','deduction',1,v_uif_employee,v_uif_employee,false,false,false,false,jsonb_build_object('statutory',true)),
    (v_company_id,v_run_employee_id,'UIF_EMPLOYER','UIF Employer','employer_contribution',1,v_uif_employer,v_uif_employer,false,false,false,false,jsonb_build_object('statutory',true)),
    (v_company_id,v_run_employee_id,'SDL_EMPLOYER','SDL Employer','employer_contribution',1,v_sdl_employer,v_sdl_employer,false,false,false,false,jsonb_build_object('statutory',true));
   v_calculated:=v_calculated+1;
 end loop;
 update public.payroll_pay_run set status=case when v_total>0 and v_review=0 then 'calculated' else 'draft' end,statutory_rule_set_id=v_rule.id,calculated_by=auth.uid(),calculated_at=now(),calculation_version='ZA-standard-monthly-v2',updated_at=now() where id=v_run.id;
 insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata) values(v_company_id,auth.uid(),'payroll_run_calculated','payroll',v_run.id,'Payroll run calculation executed with earnings, retirement and accounting-aware engine.',jsonb_build_object('engine_version','ZA-standard-monthly-v2','employees_total',v_total,'calculated',v_calculated,'review_required',v_review,'rule_set_id',v_rule.id,'tax_year',v_rule.tax_year));
 return jsonb_build_object('ok',true,'pay_run_id',v_run.id,'status',case when v_total>0 and v_review=0 then 'calculated' else 'draft' end,'engine_version','ZA-standard-monthly-v2','employees_total',v_total,'calculated',v_calculated,'review_required',v_review,'ready_for_review',(v_total>0 and v_review=0),'rule_set_id',v_rule.id,'tax_year',v_rule.tax_year);
end;$$;

create or replace function public.get_payroll_accounting_preview(p_pay_run_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_company_id uuid; v_mapping public.payroll_accounting_mapping%rowtype; v_gross numeric; v_paye numeric; v_uif_emp numeric; v_uif_er numeric; v_sdl numeric; v_net numeric; v_retirement numeric; v_other numeric; v_er_retirement numeric; v_debit numeric; v_credit numeric; v_accounting_enabled boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required.'; end if;
 if not public.current_user_has_permission('payroll.view') then raise exception 'Permission denied: payroll.view'; end if;
 v_company_id:=public.current_company_id();
 if not exists(select 1 from public.payroll_pay_run where id=p_pay_run_id and company_id=v_company_id) then raise exception 'Pay run could not be found.'; end if;
 perform public.ensure_payroll_accounting_defaults(v_company_id);
 select * into v_mapping from public.payroll_accounting_mapping where company_id=v_company_id;
 select coalesce(accounting_enabled,false) into v_accounting_enabled from public.company_accounting_settings where company_id=v_company_id; v_accounting_enabled:=coalesce(v_accounting_enabled,false);
 select coalesce(sum(gross_remuneration),0),coalesce(sum(paye_amount),0),coalesce(sum(uif_employee),0),coalesce(sum(uif_employer),0),coalesce(sum(sdl_employer),0),coalesce(sum(net_pay),0),coalesce(sum(other_deductions),0) into v_gross,v_paye,v_uif_emp,v_uif_er,v_sdl,v_net,v_other from public.payroll_pay_run_employee where company_id=v_company_id and pay_run_id=p_pay_run_id and calculation_status='calculated';
 select coalesce(sum(i.amount),0) into v_retirement from public.payroll_pay_run_item i join public.payroll_pay_run_employee pre on pre.id=i.pay_run_employee_id where pre.company_id=v_company_id and pre.pay_run_id=p_pay_run_id and i.component_code='RETIREMENT_EMPLOYEE';
 select coalesce(sum(i.amount),0) into v_er_retirement from public.payroll_pay_run_item i join public.payroll_pay_run_employee pre on pre.id=i.pay_run_employee_id where pre.company_id=v_company_id and pre.pay_run_id=p_pay_run_id and i.component_code='RETIREMENT_EMPLOYER';
 v_debit:=round(v_gross+v_uif_er+v_sdl+v_er_retirement,2); v_credit:=round(v_net+v_paye+v_uif_emp+v_uif_er+v_sdl+v_retirement+v_er_retirement+v_other,2);
 return jsonb_build_object('ok',true,'accounting_enabled',v_accounting_enabled,'mapping_ready',(v_mapping.salaries_expense_account_id is not null and v_mapping.employer_contribution_expense_account_id is not null and v_mapping.net_pay_payable_account_id is not null and v_mapping.paye_payable_account_id is not null and v_mapping.uif_payable_account_id is not null and v_mapping.sdl_payable_account_id is not null and v_mapping.retirement_payable_account_id is not null and v_mapping.other_deductions_payable_account_id is not null),'balanced',(v_debit=v_credit),'total_debit',v_debit,'total_credit',v_credit,'lines',jsonb_build_array(
  jsonb_build_object('account_id',v_mapping.salaries_expense_account_id,'system_key','salaries_wages','label','Salaries and Wages','debit',v_gross,'credit',0),
  jsonb_build_object('account_id',v_mapping.employer_contribution_expense_account_id,'system_key','employer_payroll_contributions','label','Employer Payroll Contributions','debit',round(v_uif_er+v_sdl+v_er_retirement,2),'credit',0),
  jsonb_build_object('account_id',v_mapping.net_pay_payable_account_id,'system_key','payroll_payable','label','Payroll Payable','debit',0,'credit',v_net),
  jsonb_build_object('account_id',v_mapping.paye_payable_account_id,'system_key','paye_payable','label','PAYE Payable','debit',0,'credit',v_paye),
  jsonb_build_object('account_id',v_mapping.uif_payable_account_id,'system_key','uif_payable','label','UIF Payable','debit',0,'credit',round(v_uif_emp+v_uif_er,2)),
  jsonb_build_object('account_id',v_mapping.sdl_payable_account_id,'system_key','sdl_payable','label','SDL Payable','debit',0,'credit',v_sdl),
  jsonb_build_object('account_id',v_mapping.retirement_payable_account_id,'system_key','retirement_payable','label','Retirement Fund Payable','debit',0,'credit',round(v_retirement+v_er_retirement,2)),
  jsonb_build_object('account_id',v_mapping.other_deductions_payable_account_id,'system_key','payroll_other_deductions_payable','label','Other Payroll Deductions Payable','debit',0,'credit',v_other)
 ),'note','Preview only. Journal posting occurs only after payroll approval in a later sprint.');
end;$$;

create or replace function public.get_payroll_earnings_workspace(p_pay_run_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_company_id uuid; v_run public.payroll_pay_run%rowtype; v_accounting jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required.'; end if;
 if not public.current_user_has_permission('payroll.view') then raise exception 'Permission denied: payroll.view'; end if;
 v_company_id:=public.current_company_id(); select * into v_run from public.payroll_pay_run where id=p_pay_run_id and company_id=v_company_id; if v_run.id is null then raise exception 'Pay run could not be found.'; end if;
 perform public.ensure_payroll_accounting_defaults(v_company_id); v_accounting:=public.get_payroll_accounting_preview(p_pay_run_id);
 return jsonb_build_object('ok',true,'run',jsonb_build_object('id',v_run.id,'status',v_run.status,'period_start',v_run.period_start,'period_end',v_run.period_end,'payment_date',v_run.payment_date,'calculation_version',v_run.calculation_version),'employees',coalesce((select jsonb_agg(jsonb_build_object('employee_id',e.id,'employee_number',e.employee_number,'employee_name',e.first_name||' '||e.last_name,'branch_name',(select b.branch_name from public.branch b where b.id=e.primary_branch_id),'profile',case when pp.id is null then null else jsonb_build_object('compensation_type',pp.compensation_type,'basic_salary_monthly',pp.basic_salary_monthly,'hourly_rate',pp.hourly_rate,'retirement_fund_type',pp.retirement_fund_type,'employee_retirement_monthly',pp.employee_retirement_monthly,'employer_retirement_monthly',pp.employer_retirement_monthly) end,'inputs',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'component_code',i.component_code,'quantity',i.quantity,'rate',i.rate,'amount',i.amount,'notes',i.notes) order by i.created_at) from public.payroll_pay_run_input i where i.company_id=v_company_id and i.pay_run_id=v_run.id and i.employee_id=e.id),'[]'::jsonb)) order by e.last_name,e.first_name) from public.hr_employee e left join public.payroll_employee_profile pp on pp.company_id=e.company_id and pp.employee_id=e.id where e.company_id=v_company_id and e.status='active' and e.hire_date<=v_run.period_end and (e.end_date is null or e.end_date>=v_run.period_start) and (v_run.branch_id is null or e.primary_branch_id=v_run.branch_id)),'[]'::jsonb),'accounting_preview',v_accounting,'compliance',jsonb_build_object('bcea_earnings_threshold_annual',269900.90,'threshold_effective_from','2026-05-01','overtime_note','Do not automatically apply the BCEA 1.5x overtime rule to every employee. Eligibility depends on earnings threshold, agreement and applicable employment conditions.','retirement_note','Employee retirement deductions are limited in this standard monthly engine to the lesser of actual contribution, 27.5% of remuneration, the prorated R430,000 annual cap, and taxable remuneration.','sources',jsonb_build_array('SARS Guide for Employers in Respect of Employees Tax 2027','Department of Employment and Labour BCEA earnings threshold effective 1 May 2026')));
end;$$;

revoke all on function public.save_payroll_retirement_settings(uuid,text,numeric,numeric) from public,anon; grant execute on function public.save_payroll_retirement_settings(uuid,text,numeric,numeric) to authenticated;
revoke all on function public.save_payroll_run_input(uuid,uuid,text,numeric,numeric,numeric,text,uuid) from public,anon; grant execute on function public.save_payroll_run_input(uuid,uuid,text,numeric,numeric,numeric,text,uuid) to authenticated;
revoke all on function public.delete_payroll_run_input(uuid) from public,anon; grant execute on function public.delete_payroll_run_input(uuid) to authenticated;
revoke all on function public.calculate_payroll_pay_run(uuid) from public,anon; grant execute on function public.calculate_payroll_pay_run(uuid) to authenticated;
revoke all on function public.get_payroll_accounting_preview(uuid) from public,anon; grant execute on function public.get_payroll_accounting_preview(uuid) to authenticated;
revoke all on function public.get_payroll_earnings_workspace(uuid) from public,anon; grant execute on function public.get_payroll_earnings_workspace(uuid) to authenticated;;
