create table if not exists public.payroll_statutory_rule_set (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null default 'ZA',
  tax_year integer not null,
  effective_from date not null,
  effective_to date not null,
  status text not null default 'active' check (status in ('draft','active','retired')),
  source_title text not null,
  source_url text not null,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(jurisdiction,tax_year)
);

insert into public.payroll_statutory_rule_set(
  jurisdiction,tax_year,effective_from,effective_to,status,source_title,source_url,rules
)
values(
  'ZA',2027,date '2026-03-01',date '2027-02-28','active',
  'SARS Guide for Employers in Respect of Tax Deduction Tables - 2027',
  'https://www.sars.gov.za/guide-for-employers-in-respect-of-tax-deduction-tables/',
  jsonb_build_object(
    'paye_brackets', jsonb_build_array(
      jsonb_build_object('from',0,'to',245100,'base_tax',0,'rate',0.18,'over',0),
      jsonb_build_object('from',245101,'to',383100,'base_tax',44118,'rate',0.26,'over',245100),
      jsonb_build_object('from',383101,'to',530200,'base_tax',79998,'rate',0.31,'over',383100),
      jsonb_build_object('from',530201,'to',695800,'base_tax',125599,'rate',0.36,'over',530200),
      jsonb_build_object('from',695801,'to',887000,'base_tax',185215,'rate',0.39,'over',695800),
      jsonb_build_object('from',887001,'to',1878600,'base_tax',259783,'rate',0.41,'over',887000),
      jsonb_build_object('from',1878601,'to',null,'base_tax',666339,'rate',0.45,'over',1878600)
    ),
    'rebates', jsonb_build_object('primary',17820,'secondary',9765,'tertiary',3249),
    'thresholds', jsonb_build_object('under_65',99000,'age_65_to_74',153250,'age_75_plus',171300),
    'medical_tax_credit_monthly', jsonb_build_object('taxpayer',376,'first_dependent',376,'additional_dependent',254),
    'uif', jsonb_build_object('employee_rate',0.01,'employer_rate',0.01,'monthly_ceiling',17712,'max_employee_monthly',177.12,'max_employer_monthly',177.12),
    'sdl', jsonb_build_object('employer_rate',0.01,'annual_remuneration_exemption_threshold',500000),
    'tax_period', jsonb_build_object('start','2026-03-01','end','2027-02-28'),
    'emp201_due_rule','PAYE, UIF and SDL are generally payable within seven days after month-end, subject to business-day rules.'
  )
)
on conflict (jurisdiction,tax_year) do update set
  effective_from=excluded.effective_from,
  effective_to=excluded.effective_to,
  status=excluded.status,
  source_title=excluded.source_title,
  source_url=excluded.source_url,
  rules=excluded.rules,
  updated_at=now();

create table if not exists public.payroll_employer_settings (
  company_id uuid primary key references public.company(id) on delete cascade,
  currency text not null default 'ZAR',
  pay_frequency text not null default 'monthly' check (pay_frequency in ('weekly','fortnightly','monthly')),
  default_payment_day integer null check (default_payment_day between 1 and 31),
  paye_enabled boolean not null default false,
  uif_enabled boolean not null default true,
  sdl_enabled boolean not null default false,
  paye_reference text null,
  uif_reference text null,
  sdl_reference text null,
  payroll_notes text null,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_employee_profile (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  employee_id uuid not null references public.hr_employee(id) on delete cascade,
  compensation_type text not null default 'salaried' check (compensation_type in ('salaried','hourly')),
  pay_frequency text not null default 'monthly' check (pay_frequency in ('weekly','fortnightly','monthly')),
  basic_salary_monthly numeric(14,2) not null default 0 check (basic_salary_monthly >= 0),
  hourly_rate numeric(14,2) not null default 0 check (hourly_rate >= 0),
  tax_number text null,
  birth_date date null,
  paye_exempt boolean not null default false,
  uif_exempt boolean not null default false,
  uif_exemption_reason text null,
  medical_scheme_main_member boolean not null default false,
  medical_scheme_dependants integer not null default 0 check (medical_scheme_dependants >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,employee_id)
);

create table if not exists public.payroll_component_definition (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  code text not null,
  name text not null,
  category text not null check (category in ('earning','deduction','employer_contribution','information')),
  taxable boolean not null default false,
  paye_remuneration boolean not null default false,
  uif_remuneration boolean not null default false,
  sdl_remuneration boolean not null default false,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,code)
);

create table if not exists public.payroll_pay_run (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid null references public.branch(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  payment_date date not null,
  pay_frequency text not null check (pay_frequency in ('weekly','fortnightly','monthly')),
  tax_year integer not null,
  status text not null default 'draft' check (status in ('draft','calculated','approved','posted','paid','void')),
  notes text null,
  created_by uuid null,
  approved_by uuid null,
  approved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(period_end >= period_start)
);

create table if not exists public.payroll_pay_run_employee (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  pay_run_id uuid not null references public.payroll_pay_run(id) on delete cascade,
  employee_id uuid not null references public.hr_employee(id) on delete restrict,
  gross_remuneration numeric(14,2) not null default 0,
  taxable_remuneration numeric(14,2) not null default 0,
  paye_amount numeric(14,2) not null default 0,
  uif_employee numeric(14,2) not null default 0,
  uif_employer numeric(14,2) not null default 0,
  sdl_employer numeric(14,2) not null default 0,
  other_deductions numeric(14,2) not null default 0,
  net_pay numeric(14,2) not null default 0,
  calculation_status text not null default 'draft' check (calculation_status in ('draft','partial','calculated','review_required','approved')),
  calculation_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(pay_run_id,employee_id)
);

create table if not exists public.payroll_pay_run_item (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  pay_run_employee_id uuid not null references public.payroll_pay_run_employee(id) on delete cascade,
  component_code text not null,
  component_name text not null,
  category text not null check (category in ('earning','deduction','employer_contribution','information')),
  quantity numeric(14,4) not null default 1,
  rate numeric(14,4) not null default 0,
  amount numeric(14,2) not null default 0,
  taxable boolean not null default false,
  paye_remuneration boolean not null default false,
  uif_remuneration boolean not null default false,
  sdl_remuneration boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payroll_employee_profile_company_idx on public.payroll_employee_profile(company_id);
create index if not exists payroll_pay_run_company_period_idx on public.payroll_pay_run(company_id,period_start,period_end);
create index if not exists payroll_pay_run_employee_run_idx on public.payroll_pay_run_employee(pay_run_id);

alter table public.payroll_statutory_rule_set enable row level security;
alter table public.payroll_employer_settings enable row level security;
alter table public.payroll_employee_profile enable row level security;
alter table public.payroll_component_definition enable row level security;
alter table public.payroll_pay_run enable row level security;
alter table public.payroll_pay_run_employee enable row level security;
alter table public.payroll_pay_run_item enable row level security;

revoke all on public.payroll_employer_settings,public.payroll_employee_profile,public.payroll_component_definition,public.payroll_pay_run,public.payroll_pay_run_employee,public.payroll_pay_run_item from public,anon,authenticated;
revoke all on public.payroll_statutory_rule_set from public,anon,authenticated;

insert into public.permissions(permission_name)
values ('payroll.view'),('payroll.manage'),('payroll.run'),('payroll.self')
on conflict (permission_name) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.permission_name in ('payroll.view','payroll.manage','payroll.run','payroll.self')
where r.role_name in ('owner','admin')
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.permission_name='payroll.self'
where r.role_name in ('manager','employee','technician','cashier')
on conflict do nothing;

create or replace function public.ensure_payroll_defaults(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path='public'
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
    (p_company_id,'MANUAL_DEDUCTION','Manual Deduction','deduction',false,false,false,false,true)
  on conflict(company_id,code) do nothing;
end;
$$;
revoke all on function public.ensure_payroll_defaults(uuid) from public,anon,authenticated;

create or replace function public.get_payroll_foundation_workspace()
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_company_id uuid;
  v_rule jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('payroll.view') then raise exception 'Permission denied: payroll.view'; end if;
  v_company_id:=public.current_company_id();
  perform public.ensure_payroll_defaults(v_company_id);

  select jsonb_build_object(
    'tax_year',tax_year,'effective_from',effective_from,'effective_to',effective_to,
    'source_title',source_title,'source_url',source_url,'rules',rules
  ) into v_rule
  from public.payroll_statutory_rule_set
  where jurisdiction='ZA' and status='active' and current_date between effective_from and effective_to
  order by effective_from desc limit 1;

  return jsonb_build_object(
    'ok',true,
    'settings',(select to_jsonb(s)-'company_id' from public.payroll_employer_settings s where s.company_id=v_company_id),
    'statutory_rule',v_rule,
    'employees',coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_id',e.id,'employee_number',e.employee_number,'employee_name',e.first_name||' '||e.last_name,
        'status',e.status,'branch_id',e.primary_branch_id,
        'branch_name',(select b.branch_name from public.branch b where b.id=e.primary_branch_id),
        'profile',case when pp.id is null then null else jsonb_build_object(
          'id',pp.id,'compensation_type',pp.compensation_type,'pay_frequency',pp.pay_frequency,
          'basic_salary_monthly',pp.basic_salary_monthly,'hourly_rate',pp.hourly_rate,
          'tax_number',pp.tax_number,'birth_date',pp.birth_date,'paye_exempt',pp.paye_exempt,
          'uif_exempt',pp.uif_exempt,'uif_exemption_reason',pp.uif_exemption_reason,
          'medical_scheme_main_member',pp.medical_scheme_main_member,'medical_scheme_dependants',pp.medical_scheme_dependants
        ) end
      ) order by e.last_name,e.first_name)
      from public.hr_employee e
      left join public.payroll_employee_profile pp on pp.employee_id=e.id and pp.company_id=v_company_id
      where e.company_id=v_company_id
    ),'[]'::jsonb),
    'components',coalesce((
      select jsonb_agg(jsonb_build_object('id',c.id,'code',c.code,'name',c.name,'category',c.category,'taxable',c.taxable,'paye_remuneration',c.paye_remuneration,'uif_remuneration',c.uif_remuneration,'sdl_remuneration',c.sdl_remuneration,'is_active',c.is_active) order by c.code)
      from public.payroll_component_definition c where c.company_id=v_company_id
    ),'[]'::jsonb),
    'pay_runs',coalesce((
      select jsonb_agg(jsonb_build_object('id',r.id,'branch_id',r.branch_id,'period_start',r.period_start,'period_end',r.period_end,'payment_date',r.payment_date,'pay_frequency',r.pay_frequency,'tax_year',r.tax_year,'status',r.status,'created_at',r.created_at) order by r.period_end desc,r.created_at desc)
      from public.payroll_pay_run r where r.company_id=v_company_id
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.save_payroll_employer_settings(
  p_pay_frequency text,
  p_default_payment_day integer,
  p_paye_enabled boolean,
  p_uif_enabled boolean,
  p_sdl_enabled boolean,
  p_paye_reference text default null,
  p_uif_reference text default null,
  p_sdl_reference text default null,
  p_payroll_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare v_company_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('payroll.manage') then raise exception 'Permission denied: payroll.manage'; end if;
  if lower(coalesce(p_pay_frequency,'')) not in ('weekly','fortnightly','monthly') then raise exception 'Unsupported pay frequency.'; end if;
  if p_default_payment_day is not null and (p_default_payment_day<1 or p_default_payment_day>31) then raise exception 'Payment day must be 1 to 31.'; end if;
  v_company_id:=public.current_company_id(); perform public.ensure_payroll_defaults(v_company_id);
  update public.payroll_employer_settings set
    pay_frequency=lower(p_pay_frequency),default_payment_day=p_default_payment_day,paye_enabled=coalesce(p_paye_enabled,false),
    uif_enabled=coalesce(p_uif_enabled,true),sdl_enabled=coalesce(p_sdl_enabled,false),
    paye_reference=nullif(btrim(coalesce(p_paye_reference,'')),''),uif_reference=nullif(btrim(coalesce(p_uif_reference,'')),''),
    sdl_reference=nullif(btrim(coalesce(p_sdl_reference,'')),''),payroll_notes=nullif(btrim(coalesce(p_payroll_notes,'')),''),
    updated_by=auth.uid(),updated_at=now()
  where company_id=v_company_id;
  insert into public.audit_log(company_id,user_id,action,module,description,metadata)
  values(v_company_id,auth.uid(),'payroll_settings_saved','payroll','Payroll employer settings updated.',jsonb_build_object('paye_enabled',p_paye_enabled,'uif_enabled',p_uif_enabled,'sdl_enabled',p_sdl_enabled));
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.save_payroll_employee_profile(
  p_employee_id uuid,
  p_compensation_type text,
  p_pay_frequency text,
  p_basic_salary_monthly numeric default 0,
  p_hourly_rate numeric default 0,
  p_tax_number text default null,
  p_birth_date date default null,
  p_paye_exempt boolean default false,
  p_uif_exempt boolean default false,
  p_uif_exemption_reason text default null,
  p_medical_scheme_main_member boolean default false,
  p_medical_scheme_dependants integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare v_company_id uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('payroll.manage') then raise exception 'Permission denied: payroll.manage'; end if;
  v_company_id:=public.current_company_id();
  if not exists(select 1 from public.hr_employee where id=p_employee_id and company_id=v_company_id) then raise exception 'Employee could not be found.'; end if;
  if lower(coalesce(p_compensation_type,'')) not in ('salaried','hourly') then raise exception 'Unsupported compensation type.'; end if;
  if lower(coalesce(p_pay_frequency,'')) not in ('weekly','fortnightly','monthly') then raise exception 'Unsupported pay frequency.'; end if;
  if coalesce(p_basic_salary_monthly,0)<0 or coalesce(p_hourly_rate,0)<0 then raise exception 'Compensation cannot be negative.'; end if;
  if coalesce(p_medical_scheme_dependants,0)<0 then raise exception 'Medical scheme dependants cannot be negative.'; end if;
  insert into public.payroll_employee_profile(company_id,employee_id,compensation_type,pay_frequency,basic_salary_monthly,hourly_rate,tax_number,birth_date,paye_exempt,uif_exempt,uif_exemption_reason,medical_scheme_main_member,medical_scheme_dependants,created_by,updated_by)
  values(v_company_id,p_employee_id,lower(p_compensation_type),lower(p_pay_frequency),coalesce(p_basic_salary_monthly,0),coalesce(p_hourly_rate,0),nullif(btrim(coalesce(p_tax_number,'')),''),p_birth_date,coalesce(p_paye_exempt,false),coalesce(p_uif_exempt,false),nullif(btrim(coalesce(p_uif_exemption_reason,'')),''),coalesce(p_medical_scheme_main_member,false),coalesce(p_medical_scheme_dependants,0),auth.uid(),auth.uid())
  on conflict(company_id,employee_id) do update set compensation_type=excluded.compensation_type,pay_frequency=excluded.pay_frequency,basic_salary_monthly=excluded.basic_salary_monthly,hourly_rate=excluded.hourly_rate,tax_number=excluded.tax_number,birth_date=excluded.birth_date,paye_exempt=excluded.paye_exempt,uif_exempt=excluded.uif_exempt,uif_exemption_reason=excluded.uif_exemption_reason,medical_scheme_main_member=excluded.medical_scheme_main_member,medical_scheme_dependants=excluded.medical_scheme_dependants,updated_by=auth.uid(),updated_at=now()
  returning id into v_id;
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'payroll_employee_profile_saved','payroll',v_id,'Payroll employee profile updated.',jsonb_build_object('employee_id',p_employee_id));
  return jsonb_build_object('ok',true,'id',v_id);
end;
$$;

create or replace function public.preview_payroll_statutory_contributions(p_employee_id uuid,p_gross_monthly numeric)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare v_company_id uuid; v_settings public.payroll_employer_settings%rowtype; v_profile public.payroll_employee_profile%rowtype; v_rules jsonb; v_uif_ceiling numeric; v_uif_emp_rate numeric; v_uif_er_rate numeric; v_sdl_rate numeric; v_uif_base numeric; v_uif_emp numeric; v_uif_er numeric; v_sdl numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('payroll.view') then raise exception 'Permission denied: payroll.view'; end if;
  if coalesce(p_gross_monthly,0)<0 then raise exception 'Gross remuneration cannot be negative.'; end if;
  v_company_id:=public.current_company_id(); perform public.ensure_payroll_defaults(v_company_id);
  select * into v_settings from public.payroll_employer_settings where company_id=v_company_id;
  select * into v_profile from public.payroll_employee_profile where company_id=v_company_id and employee_id=p_employee_id;
  if v_profile.id is null then raise exception 'Payroll profile is not configured for this employee.'; end if;
  select rules into v_rules from public.payroll_statutory_rule_set where jurisdiction='ZA' and status='active' and current_date between effective_from and effective_to order by effective_from desc limit 1;
  if v_rules is null then raise exception 'No active South African statutory rule set is configured.'; end if;
  v_uif_ceiling:=coalesce((v_rules#>>'{uif,monthly_ceiling}')::numeric,0);
  v_uif_emp_rate:=coalesce((v_rules#>>'{uif,employee_rate}')::numeric,0);
  v_uif_er_rate:=coalesce((v_rules#>>'{uif,employer_rate}')::numeric,0);
  v_sdl_rate:=coalesce((v_rules#>>'{sdl,employer_rate}')::numeric,0);
  v_uif_base:=least(coalesce(p_gross_monthly,0),v_uif_ceiling);
  v_uif_emp:=case when v_settings.uif_enabled and not v_profile.uif_exempt then round(v_uif_base*v_uif_emp_rate,2) else 0 end;
  v_uif_er:=case when v_settings.uif_enabled and not v_profile.uif_exempt then round(v_uif_base*v_uif_er_rate,2) else 0 end;
  v_sdl:=case when v_settings.sdl_enabled then round(coalesce(p_gross_monthly,0)*v_sdl_rate,2) else 0 end;
  return jsonb_build_object('ok',true,'gross_monthly',p_gross_monthly,'uif_employee',v_uif_emp,'uif_employer',v_uif_er,'sdl_employer',v_sdl,'paye_status',case when v_settings.paye_enabled and not v_profile.paye_exempt then 'not_calculated_in_foundation' else 'not_applicable' end,'rule_source',(select source_title from public.payroll_statutory_rule_set where rules=v_rules limit 1));
end;
$$;

create or replace function public.create_payroll_pay_run(p_period_start date,p_period_end date,p_payment_date date,p_branch_id uuid default null,p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare v_company_id uuid; v_settings public.payroll_employer_settings%rowtype; v_tax_year integer; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('payroll.run') then raise exception 'Permission denied: payroll.run'; end if;
  if p_period_start is null or p_period_end is null or p_payment_date is null or p_period_end<p_period_start then raise exception 'Invalid payroll period.'; end if;
  v_company_id:=public.current_company_id(); perform public.ensure_payroll_defaults(v_company_id);
  if p_branch_id is not null and not exists(select 1 from public.branch where id=p_branch_id and company_id=v_company_id) then raise exception 'Branch could not be found.'; end if;
  select * into v_settings from public.payroll_employer_settings where company_id=v_company_id;
  select tax_year into v_tax_year from public.payroll_statutory_rule_set where jurisdiction='ZA' and p_payment_date between effective_from and effective_to order by effective_from desc limit 1;
  if v_tax_year is null then raise exception 'No statutory tax year is configured for payment date.'; end if;
  insert into public.payroll_pay_run(company_id,branch_id,period_start,period_end,payment_date,pay_frequency,tax_year,notes,created_by)
  values(v_company_id,p_branch_id,p_period_start,p_period_end,p_payment_date,v_settings.pay_frequency,v_tax_year,nullif(btrim(coalesce(p_notes,'')),''),auth.uid()) returning id into v_id;
  insert into public.audit_log(company_id,user_id,action,module,record_id,description,metadata)
  values(v_company_id,auth.uid(),'payroll_run_created','payroll',v_id,'Draft payroll run created.',jsonb_build_object('period_start',p_period_start,'period_end',p_period_end,'payment_date',p_payment_date,'tax_year',v_tax_year));
  return jsonb_build_object('ok',true,'id',v_id,'status','draft','tax_year',v_tax_year);
end;
$$;

grant execute on function public.get_payroll_foundation_workspace() to authenticated;
grant execute on function public.save_payroll_employer_settings(text,integer,boolean,boolean,boolean,text,text,text,text) to authenticated;
grant execute on function public.save_payroll_employee_profile(uuid,text,text,numeric,numeric,text,date,boolean,boolean,text,boolean,integer) to authenticated;
grant execute on function public.preview_payroll_statutory_contributions(uuid,numeric) to authenticated;
grant execute on function public.create_payroll_pay_run(date,date,date,uuid,text) to authenticated;
revoke all on function public.get_payroll_foundation_workspace() from public,anon;
revoke all on function public.save_payroll_employer_settings(text,integer,boolean,boolean,boolean,text,text,text,text) from public,anon;
revoke all on function public.save_payroll_employee_profile(uuid,text,text,numeric,numeric,text,date,boolean,boolean,text,boolean,integer) from public,anon;
revoke all on function public.preview_payroll_statutory_contributions(uuid,numeric) from public,anon;
revoke all on function public.create_payroll_pay_run(date,date,date,uuid,text) from public,anon;;
