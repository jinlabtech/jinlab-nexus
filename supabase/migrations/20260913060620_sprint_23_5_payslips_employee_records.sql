-- ============================================================
-- JINLAB NEXUS
-- Sprint 23.5
-- Payslips + Employee Payroll Records
-- ============================================================


-- ============================================================
-- 1. SECURE PAYSLIP
-- ============================================================

create or replace function public.get_payroll_payslip(
  p_pay_run_employee_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_pre public.payroll_pay_run_employee%rowtype;
  v_run public.payroll_pay_run%rowtype;
  v_employee public.hr_employee%rowtype;
  v_profile public.payroll_employee_profile%rowtype;

  v_can_manage boolean := false;
  v_is_self boolean := false;

  v_earnings numeric := 0;
  v_deductions numeric := 0;
  v_employee_retirement numeric := 0;
  v_employer_retirement numeric := 0;

  v_company jsonb;
  v_branch_name text;
  v_department_name text;
  v_position_title text;

  v_settings public.payroll_employer_settings%rowtype;
begin

  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  v_company_id :=
    public.current_company_id();

  v_can_manage :=
    public.current_user_has_permission(
      'payroll.view'
    );

  select *
  into v_pre
  from public.payroll_pay_run_employee
  where
    id = p_pay_run_employee_id
    and company_id = v_company_id;

  if v_pre.id is null then
    raise exception
      'Payroll record could not be found.';
  end if;

  select *
  into v_run
  from public.payroll_pay_run
  where
    id = v_pre.pay_run_id
    and company_id = v_company_id;

  if v_run.id is null then
    raise exception
      'Pay run could not be found.';
  end if;

  select *
  into v_employee
  from public.hr_employee
  where
    id = v_pre.employee_id
    and company_id = v_company_id;

  if v_employee.id is null then
    raise exception
      'Employee could not be found.';
  end if;

  v_is_self :=
    v_employee.user_id = auth.uid();

  if not v_can_manage then

    if not public.current_user_has_permission(
      'payroll.self'
    ) then
      raise exception
        'Permission denied: payroll access required.';
    end if;

    if not v_is_self then
      raise exception
        'Employees may only view their own payslips.';
    end if;

    if v_run.status not in (
      'posted',
      'paid'
    ) then
      raise exception
        'This payslip is not yet available.';
    end if;

  else

    if v_run.status not in (
      'approved',
      'posted',
      'paid'
    ) then
      raise exception
        'Payslips are only available after payroll approval.';
    end if;

  end if;


  -- ----------------------------------------------------------
  -- Payroll profile snapshot source
  -- ----------------------------------------------------------

  select *
  into v_profile
  from public.payroll_employee_profile
  where
    company_id = v_company_id
    and employee_id = v_employee.id
  limit 1;


  -- ----------------------------------------------------------
  -- Employer settings
  -- ----------------------------------------------------------

  perform public.ensure_payroll_defaults(
    v_company_id
  );

  select *
  into v_settings
  from public.payroll_employer_settings
  where company_id = v_company_id;


  -- ----------------------------------------------------------
  -- Employee organisational information
  -- ----------------------------------------------------------

  select b.branch_name
  into v_branch_name
  from public.branch b
  where
    b.id = coalesce(
      v_run.branch_id,
      v_employee.primary_branch_id
    )
    and b.company_id = v_company_id;

  select d.name
  into v_department_name
  from public.hr_department d
  where
    d.id = v_employee.department_id
    and d.company_id = v_company_id;

  select p.title
  into v_position_title
  from public.hr_position p
  where
    p.id = v_employee.position_id
    and p.company_id = v_company_id;


  -- ----------------------------------------------------------
  -- Employer identity
  -- ----------------------------------------------------------

  select jsonb_build_object(
    'company_id',
      c.id,

    'legal_name',
      coalesce(
        nullif(cps.legal_name, ''),
        c.company_name
      ),

    'trading_name',
      coalesce(
        nullif(cps.trading_name, ''),
        nullif(c.trading_name, ''),
        c.company_name
      ),

    'registration_number',
      coalesce(
        nullif(cps.registration_number, ''),
        c.registration_number
      ),

    'email',
      coalesce(
        nullif(cps.email, ''),
        c.email
      ),

    'phone',
      coalesce(
        nullif(cps.phone, ''),
        c.phone
      ),

    'physical_address',
      coalesce(
        nullif(cps.physical_address, ''),
        nullif(c.physical_address, ''),
        c.address
      ),

    'website',
      coalesce(
        nullif(cps.website, ''),
        c.website
      ),

    'country_code',
      coalesce(
        cps.country_code,
        'ZA'
      ),

    'currency',
      coalesce(
        v_settings.currency,
        'ZAR'
      ),

    'paye_reference',
      v_settings.paye_reference,

    'uif_reference',
      v_settings.uif_reference,

    'sdl_reference',
      v_settings.sdl_reference
  )
  into v_company
  from public.company c
  left join public.company_profile_settings cps
    on cps.company_id = c.id
  where c.id = v_company_id;


  -- ----------------------------------------------------------
  -- Payslip totals
  -- ----------------------------------------------------------

  select
    coalesce(
      sum(i.amount) filter (
        where i.category = 'earning'
      ),
      0
    ),

    coalesce(
      sum(i.amount) filter (
        where i.category = 'deduction'
      ),
      0
    ),

    coalesce(
      sum(i.amount) filter (
        where i.component_code =
          'RETIREMENT_EMPLOYEE'
      ),
      0
    ),

    coalesce(
      sum(i.amount) filter (
        where i.component_code =
          'RETIREMENT_EMPLOYER'
      ),
      0
    )

  into
    v_earnings,
    v_deductions,
    v_employee_retirement,
    v_employer_retirement

  from public.payroll_pay_run_item i
  where
    i.company_id = v_company_id
    and i.pay_run_employee_id = v_pre.id;


  -- ----------------------------------------------------------
  -- Final secure payslip payload
  -- ----------------------------------------------------------

  return jsonb_build_object(

    'ok',
      true,

    'document',
      jsonb_build_object(

        'document_type',
          'payslip',

        'title',
          'PAYSLIP',

        'document_number',
          'PAYSLIP-' ||
          coalesce(
            v_employee.employee_number,
            'EMPLOYEE'
          ) ||
          '-' ||
          to_char(
            v_run.period_end,
            'YYYYMMDD'
          ),

        'status',
          case
            when v_run.status = 'approved'
              then 'preview'
            else 'issued'
          end,

        'print_ready',
          true
      ),


    'employer',
      v_company,


    'employee',
      jsonb_build_object(

        'employee_id',
          v_employee.id,

        'employee_number',
          v_employee.employee_number,

        'name',
          concat_ws(
            ' ',
            v_employee.first_name,
            v_employee.last_name
          ),

        'preferred_name',
          v_employee.preferred_name,

        'email',
          v_employee.email,

        'branch',
          v_branch_name,

        'department',
          v_department_name,

        'position',
          v_position_title,

        'employment_type',
          v_employee.employment_type,

        'tax_number',
          v_profile.tax_number,

        'pay_frequency',
          v_run.pay_frequency
      ),


    'period',
      jsonb_build_object(

        'period_start',
          v_run.period_start,

        'period_end',
          v_run.period_end,

        'payment_date',
          v_run.payment_date,

        'tax_year',
          v_run.tax_year
      ),


    'summary',
      jsonb_build_object(

        'gross_pay',
          round(
            v_pre.gross_remuneration,
            2
          ),

        'taxable_remuneration',
          round(
            v_pre.taxable_remuneration,
            2
          ),

        'total_earnings',
          round(
            v_earnings,
            2
          ),

        'total_employee_deductions',
          round(
            v_deductions,
            2
          ),

        'net_pay',
          round(
            v_pre.net_pay,
            2
          )
      ),


    'statutory',
      jsonb_build_object(

        'employee',
          jsonb_build_object(

            'paye',
              round(
                v_pre.paye_amount,
                2
              ),

            'uif',
              round(
                v_pre.uif_employee,
                2
              ),

            'retirement',
              round(
                v_employee_retirement,
                2
              ),

            'other_deductions',
              round(
                v_pre.other_deductions,
                2
              )
          ),

        'employer',
          jsonb_build_object(

            'uif',
              round(
                v_pre.uif_employer,
                2
              ),

            'sdl',
              round(
                v_pre.sdl_employer,
                2
              ),

            'retirement',
              round(
                v_employer_retirement,
                2
              )
          )
      ),


    'earnings',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(

              'code',
                i.component_code,

              'name',
                i.component_name,

              'quantity',
                i.quantity,

              'rate',
                i.rate,

              'amount',
                round(
                  i.amount,
                  2
                ),

              'taxable',
                i.taxable
            )
            order by
              i.created_at,
              i.component_code
          )

          from public.payroll_pay_run_item i

          where
            i.company_id =
              v_company_id

            and i.pay_run_employee_id =
              v_pre.id

            and i.category =
              'earning'
        ),
        '[]'::jsonb
      ),


    'deductions',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(

              'code',
                i.component_code,

              'name',
                i.component_name,

              'amount',
                round(
                  i.amount,
                  2
                )
            )
            order by
              i.created_at,
              i.component_code
          )

          from public.payroll_pay_run_item i

          where
            i.company_id =
              v_company_id

            and i.pay_run_employee_id =
              v_pre.id

            and i.category =
              'deduction'
        ),
        '[]'::jsonb
      ),


    'employer_contributions',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(

              'code',
                i.component_code,

              'name',
                i.component_name,

              'amount',
                round(
                  i.amount,
                  2
                )
            )
            order by
              i.created_at,
              i.component_code
          )

          from public.payroll_pay_run_item i

          where
            i.company_id =
              v_company_id

            and i.pay_run_employee_id =
              v_pre.id

            and i.category =
              'employer_contribution'
        ),
        '[]'::jsonb
      ),


    'payroll',
      jsonb_build_object(

        'pay_run_id',
          v_run.id,

        'pay_run_employee_id',
          v_pre.id,

        'payroll_status',
          v_run.status,

        'calculation_status',
          v_pre.calculation_status,

        'calculation_version',
          v_run.calculation_version
      )

  );

end;
$$;
-- ============================================================
-- 2. EMPLOYEE / MANAGEMENT PAYROLL HISTORY
-- ============================================================

create or replace function public.get_payroll_employee_records(
  p_employee_id uuid default null,
  p_limit integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_employee_id uuid;

  v_can_manage boolean := false;
  v_is_self_mode boolean := false;

  v_limit integer;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;

  v_company_id :=
    public.current_company_id();

  v_can_manage :=
    public.current_user_has_permission(
      'payroll.view'
    );

  v_limit :=
    greatest(
      1,
      least(
        coalesce(
          p_limit,
          24
        ),
        120
      )
    );


  -- ----------------------------------------------------------
  -- Determine employee scope
  -- ----------------------------------------------------------

  if v_can_manage then

    if p_employee_id is not null
       and not exists (
         select 1
         from public.hr_employee e
         where
           e.id = p_employee_id
           and e.company_id = v_company_id
       )
    then
      raise exception
        'Employee could not be found.';
    end if;

    v_employee_id :=
      p_employee_id;

  else

    if not public.current_user_has_permission(
      'payroll.self'
    ) then
      raise exception
        'Permission denied: payroll access required.';
    end if;

    select e.id
    into v_employee_id
    from public.hr_employee e
    where
      e.company_id = v_company_id
      and e.user_id = auth.uid()
    limit 1;

    if v_employee_id is null then
      raise exception
        'No HR employee profile is linked to this Nexus user.';
    end if;

    if p_employee_id is not null
       and p_employee_id <> v_employee_id
    then
      raise exception
        'Employees may only view their own payroll records.';
    end if;

    v_is_self_mode := true;

  end if;


  -- ----------------------------------------------------------
  -- Payroll history
  -- ----------------------------------------------------------

  return jsonb_build_object(

    'ok',
      true,

    'mode',
      case
        when v_is_self_mode
          then 'self'
        else 'management'
      end,

    'employee_id',
      v_employee_id,

    'records',
      coalesce(
        (
          select jsonb_agg(
            x.obj
            order by
              x.payment_date desc,
              x.created_at desc
          )

          from (
            select

              r.payment_date,
              r.created_at,

              jsonb_build_object(

                'pay_run_employee_id',
                  pre.id,

                'pay_run_id',
                  r.id,

                'employee_id',
                  e.id,

                'employee_number',
                  e.employee_number,

                'employee_name',
                  concat_ws(
                    ' ',
                    e.first_name,
                    e.last_name
                  ),

                'period_start',
                  r.period_start,

                'period_end',
                  r.period_end,

                'payment_date',
                  r.payment_date,

                'tax_year',
                  r.tax_year,

                'pay_frequency',
                  r.pay_frequency,

                'payroll_status',
                  r.status,

                'gross_pay',
                  round(
                    pre.gross_remuneration,
                    2
                  ),

                'paye',
                  round(
                    pre.paye_amount,
                    2
                  ),

                'uif_employee',
                  round(
                    pre.uif_employee,
                    2
                  ),

                'net_pay',
                  round(
                    pre.net_pay,
                    2
                  ),

                'payslip_available',
                  case

                    when v_is_self_mode
                      then r.status in (
                        'posted',
                        'paid'
                      )

                    else r.status in (
                      'approved',
                      'posted',
                      'paid'
                    )

                  end

              ) as obj

            from public.payroll_pay_run_employee pre

            join public.payroll_pay_run r
              on r.id =
                 pre.pay_run_id
             and r.company_id =
                 pre.company_id

            join public.hr_employee e
              on e.id =
                 pre.employee_id
             and e.company_id =
                 pre.company_id

            where
              pre.company_id =
                v_company_id

              and (
                v_employee_id is null
                or pre.employee_id =
                   v_employee_id
              )

              and (
                (
                  v_is_self_mode
                  and r.status in (
                    'posted',
                    'paid'
                  )
                )

                or

                (
                  not v_is_self_mode
                  and r.status in (
                    'approved',
                    'posted',
                    'paid'
                  )
                )
              )

            order by
              r.payment_date desc,
              r.created_at desc

            limit v_limit

          ) x
        ),
        '[]'::jsonb
      )

  );

end;
$$;
-- ============================================================
-- 3. CONVENIENT SELF-SERVICE RPC
-- ============================================================

create or replace function public.get_my_payslips(
  p_limit integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;

  if not public.current_user_has_permission(
    'payroll.self'
  ) then
    raise exception
      'Permission denied: payroll.self';
  end if;

  return public.get_payroll_employee_records(
    null,
    p_limit
  );

end;
$$;
-- ============================================================
-- 4. SECURITY
-- ============================================================

revoke all
on function public.get_payroll_payslip(uuid)
from public;
revoke all
on function public.get_payroll_payslip(uuid)
from anon;
grant execute
on function public.get_payroll_payslip(uuid)
to authenticated;
revoke all
on function public.get_payroll_employee_records(
  uuid,
  integer
)
from public;
revoke all
on function public.get_payroll_employee_records(
  uuid,
  integer
)
from anon;
grant execute
on function public.get_payroll_employee_records(
  uuid,
  integer
)
to authenticated;
revoke all
on function public.get_my_payslips(integer)
from public;
revoke all
on function public.get_my_payslips(integer)
from anon;
grant execute
on function public.get_my_payslips(integer)
to authenticated;
comment on function public.get_payroll_payslip(uuid)
is
'Returns a secure print-ready payroll payslip. Employees may access only their own posted/paid payslips; payroll viewers may preview approved payroll.';
comment on function public.get_payroll_employee_records(uuid, integer)
is
'Returns secure payroll history scoped to payroll managers or to the signed-in employee.';
comment on function public.get_my_payslips(integer)
is
'Employee self-service payroll history containing only the signed-in employee posted/paid payroll records.';
