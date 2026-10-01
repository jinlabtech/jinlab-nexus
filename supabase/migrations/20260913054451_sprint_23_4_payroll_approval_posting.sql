-- ============================================================
-- JINLAB NEXUS
-- Sprint 23.4
-- Payroll Approval + Controlled Accounting Posting
-- ============================================================

-- ------------------------------------------------------------
-- 1. Allow payroll as an automatic accounting source
-- ------------------------------------------------------------

alter table public.journal_entry
drop constraint if exists journal_entry_source_type_check;
alter table public.journal_entry
add constraint journal_entry_source_type_check
check (
  source_type = any (
    array[
      'manual',
      'invoice',
      'invoice_payment',
      'sales_order_payment',
      'purchase',
      'supplier_payment',
      'expense',
      'bank_transaction',
      'payment_settlement',
      'pos_sale',
      'pos_return',
      'opening_balance',
      'adjustment',
      'reversal',
      'payroll'
    ]::text[]
  )
);
-- A pay run may create only one accounting journal.
create unique index if not exists
journal_entry_payroll_source_unique
on public.journal_entry (
  company_id,
  source_id
)
where
  source_type = 'payroll'
  and source_id is not null;
-- ============================================================
-- 2. APPROVE PAYROLL
-- ============================================================

create or replace function public.approve_payroll_pay_run(
  p_pay_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_run public.payroll_pay_run%rowtype;
  v_mapping public.payroll_accounting_mapping%rowtype;

  v_employee_count integer := 0;
  v_review_count integer := 0;
  v_invalid_count integer := 0;

  v_accounting_enabled boolean := false;

  v_gross numeric := 0;
  v_paye numeric := 0;
  v_uif_employee numeric := 0;
  v_uif_employer numeric := 0;
  v_sdl numeric := 0;
  v_net numeric := 0;
  v_other numeric := 0;

  v_employee_retirement numeric := 0;
  v_employer_retirement numeric := 0;

  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
begin

  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission(
    'payroll.manage'
  ) then
    raise exception
      'Permission denied: payroll.manage';
  end if;

  v_company_id :=
    public.current_company_id();

  select *
  into v_run
  from public.payroll_pay_run
  where
    id = p_pay_run_id
    and company_id = v_company_id
  for update;

  if v_run.id is null then
    raise exception
      'Pay run could not be found.';
  end if;

  if v_run.status <> 'calculated' then
    raise exception
      'Only a calculated pay run can be approved.';
  end if;


  -- ----------------------------------------------------------
  -- Every employee must have a successful calculation.
  -- ----------------------------------------------------------

  select
    count(*),
    count(*) filter (
      where calculation_status = 'review_required'
    ),
    count(*) filter (
      where calculation_status <> 'calculated'
    )
  into
    v_employee_count,
    v_review_count,
    v_invalid_count
  from public.payroll_pay_run_employee
  where
    company_id = v_company_id
    and pay_run_id = v_run.id;

  if v_employee_count = 0 then
    raise exception
      'This pay run contains no calculated employees.';
  end if;

  if v_review_count > 0 then
    raise exception
      'Payroll cannot be approved while % employee calculation(s) require review.',
      v_review_count;
  end if;

  if v_invalid_count > 0 then
    raise exception
      'All payroll employee calculations must be complete before approval.';
  end if;


  -- ----------------------------------------------------------
  -- Payroll must already be accounting-ready before approval.
  -- ----------------------------------------------------------

  perform public.ensure_payroll_accounting_defaults(
    v_company_id
  );

  select *
  into v_mapping
  from public.payroll_accounting_mapping
  where company_id = v_company_id;

  select coalesce(
    (
      select accounting_enabled
      from public.company_accounting_settings
      where company_id = v_company_id
    ),
    false
  )
  into v_accounting_enabled;

  if not v_accounting_enabled then
    raise exception
      'Accounting must be enabled before payroll approval.';
  end if;

  if
    v_mapping.salaries_expense_account_id is null
    or v_mapping.employer_contribution_expense_account_id is null
    or v_mapping.net_pay_payable_account_id is null
    or v_mapping.paye_payable_account_id is null
    or v_mapping.uif_payable_account_id is null
    or v_mapping.sdl_payable_account_id is null
    or v_mapping.retirement_payable_account_id is null
    or v_mapping.other_deductions_payable_account_id is null
  then
    raise exception
      'Payroll accounting mapping is incomplete.';
  end if;


  -- ----------------------------------------------------------
  -- Recalculate the accounting control totals.
  -- ----------------------------------------------------------

  select
    coalesce(sum(gross_remuneration), 0),
    coalesce(sum(paye_amount), 0),
    coalesce(sum(uif_employee), 0),
    coalesce(sum(uif_employer), 0),
    coalesce(sum(sdl_employer), 0),
    coalesce(sum(net_pay), 0),
    coalesce(sum(other_deductions), 0)
  into
    v_gross,
    v_paye,
    v_uif_employee,
    v_uif_employer,
    v_sdl,
    v_net,
    v_other
  from public.payroll_pay_run_employee
  where
    company_id = v_company_id
    and pay_run_id = v_run.id
    and calculation_status = 'calculated';

  select
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
    v_employee_retirement,
    v_employer_retirement
  from public.payroll_pay_run_item i
  join public.payroll_pay_run_employee pre
    on pre.id = i.pay_run_employee_id
  where
    pre.company_id = v_company_id
    and pre.pay_run_id = v_run.id;

  v_total_debit :=
    round(
      v_gross
      + v_uif_employer
      + v_sdl
      + v_employer_retirement,
      2
    );

  v_total_credit :=
    round(
      v_net
      + v_paye
      + v_uif_employee
      + v_uif_employer
      + v_sdl
      + v_employee_retirement
      + v_employer_retirement
      + v_other,
      2
    );

  if v_total_debit <= 0 then
    raise exception
      'Payroll accounting total must be greater than zero.';
  end if;

  if v_total_debit <> v_total_credit then
    raise exception
      'Payroll accounting preview is not balanced. Debit % does not equal credit %.',
      v_total_debit,
      v_total_credit;
  end if;


  -- ----------------------------------------------------------
  -- Approval freezes the calculated payroll.
  -- ----------------------------------------------------------

  update public.payroll_pay_run
  set
    status = 'approved',
    approved_by = auth.uid(),
    approved_at = now(),
    updated_at = now()
  where id = v_run.id;


  insert into public.audit_log (
    company_id,
    user_id,
    action,
    module,
    record_id,
    description,
    metadata
  )
  values (
    v_company_id,
    auth.uid(),
    'payroll_run_approved',
    'payroll',
    v_run.id,
    'Payroll run approved after calculation and accounting control validation.',
    jsonb_build_object(
      'employees', v_employee_count,
      'gross', v_gross,
      'net_pay', v_net,
      'paye', v_paye,
      'uif_employee', v_uif_employee,
      'uif_employer', v_uif_employer,
      'sdl_employer', v_sdl,
      'total_debit', v_total_debit,
      'total_credit', v_total_credit
    )
  );


  return jsonb_build_object(
    'ok', true,
    'pay_run_id', v_run.id,
    'status', 'approved',
    'approved_by', auth.uid(),
    'approved_at', now(),
    'employees', v_employee_count,
    'accounting', jsonb_build_object(
      'balanced', true,
      'total_debit', v_total_debit,
      'total_credit', v_total_credit
    )
  );

end;
$$;
-- ============================================================
-- 3. POST APPROVED PAYROLL TO ACCOUNTING
-- ============================================================

create or replace function public.post_payroll_pay_run(
  p_pay_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_run public.payroll_pay_run%rowtype;
  v_mapping public.payroll_accounting_mapping%rowtype;

  v_accounting_enabled boolean := false;

  v_gross numeric := 0;
  v_paye numeric := 0;
  v_uif_employee numeric := 0;
  v_uif_employer numeric := 0;
  v_sdl numeric := 0;
  v_net numeric := 0;
  v_other numeric := 0;

  v_employee_retirement numeric := 0;
  v_employer_retirement numeric := 0;

  v_employer_contributions numeric := 0;

  v_total_debit numeric := 0;
  v_total_credit numeric := 0;

  v_journal_id uuid;
  v_existing_journal_id uuid;
  v_existing_journal_number text;
  v_existing_journal_status text;

  v_entry_number text;
  v_line_number integer := 0;

  v_post_result jsonb;
begin

  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission(
    'payroll.manage'
  ) then
    raise exception
      'Permission denied: payroll.manage';
  end if;

  if not public.current_user_has_permission(
    'accounting.journal.post'
  ) then
    raise exception
      'Permission denied: accounting.journal.post';
  end if;

  v_company_id :=
    public.current_company_id();

  select *
  into v_run
  from public.payroll_pay_run
  where
    id = p_pay_run_id
    and company_id = v_company_id
  for update;

  if v_run.id is null then
    raise exception
      'Pay run could not be found.';
  end if;


  -- ----------------------------------------------------------
  -- Duplicate protection / idempotence
  -- ----------------------------------------------------------

  select
    id,
    entry_number,
    status
  into
    v_existing_journal_id,
    v_existing_journal_number,
    v_existing_journal_status
  from public.journal_entry
  where
    company_id = v_company_id
    and source_type = 'payroll'
    and source_id = v_run.id
  limit 1;

  if v_run.status = 'posted' then

    if v_existing_journal_id is null then
      raise exception
        'Payroll is marked posted but its accounting journal could not be found.';
    end if;

    return jsonb_build_object(
      'ok', true,
      'already_posted', true,
      'pay_run_id', v_run.id,
      'status', 'posted',
      'journal_id', v_existing_journal_id,
      'journal_number', v_existing_journal_number,
      'journal_status', v_existing_journal_status
    );

  end if;

  if v_run.status <> 'approved' then
    raise exception
      'Only an approved pay run can be posted.';
  end if;

  if v_existing_journal_id is not null then
    raise exception
      'A payroll accounting journal already exists for this pay run.';
  end if;


  -- ----------------------------------------------------------
  -- Accounting readiness
  -- ----------------------------------------------------------

  perform public.ensure_payroll_accounting_defaults(
    v_company_id
  );

  select *
  into v_mapping
  from public.payroll_accounting_mapping
  where company_id = v_company_id;

  select coalesce(
    (
      select accounting_enabled
      from public.company_accounting_settings
      where company_id = v_company_id
    ),
    false
  )
  into v_accounting_enabled;

  if not v_accounting_enabled then
    raise exception
      'Accounting is disabled for this company.';
  end if;

  if
    v_mapping.salaries_expense_account_id is null
    or v_mapping.employer_contribution_expense_account_id is null
    or v_mapping.net_pay_payable_account_id is null
    or v_mapping.paye_payable_account_id is null
    or v_mapping.uif_payable_account_id is null
    or v_mapping.sdl_payable_account_id is null
    or v_mapping.retirement_payable_account_id is null
    or v_mapping.other_deductions_payable_account_id is null
  then
    raise exception
      'Payroll accounting mapping is incomplete.';
  end if;


  -- ----------------------------------------------------------
  -- Recompute from frozen payroll data before posting.
  -- ----------------------------------------------------------

  select
    coalesce(sum(gross_remuneration), 0),
    coalesce(sum(paye_amount), 0),
    coalesce(sum(uif_employee), 0),
    coalesce(sum(uif_employer), 0),
    coalesce(sum(sdl_employer), 0),
    coalesce(sum(net_pay), 0),
    coalesce(sum(other_deductions), 0)
  into
    v_gross,
    v_paye,
    v_uif_employee,
    v_uif_employer,
    v_sdl,
    v_net,
    v_other
  from public.payroll_pay_run_employee
  where
    company_id = v_company_id
    and pay_run_id = v_run.id
    and calculation_status = 'calculated';

  select
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
    v_employee_retirement,
    v_employer_retirement
  from public.payroll_pay_run_item i
  join public.payroll_pay_run_employee pre
    on pre.id = i.pay_run_employee_id
  where
    pre.company_id = v_company_id
    and pre.pay_run_id = v_run.id;

  v_employer_contributions :=
    round(
      v_uif_employer
      + v_sdl
      + v_employer_retirement,
      2
    );

  v_total_debit :=
    round(
      v_gross
      + v_employer_contributions,
      2
    );

  v_total_credit :=
    round(
      v_net
      + v_paye
      + v_uif_employee
      + v_uif_employer
      + v_sdl
      + v_employee_retirement
      + v_employer_retirement
      + v_other,
      2
    );

  if v_total_debit <= 0 then
    raise exception
      'Payroll journal total must be greater than zero.';
  end if;

  if v_total_debit <> v_total_credit then
    raise exception
      'Payroll journal is not balanced. Debit % does not equal credit %.',
      v_total_debit,
      v_total_credit;
  end if;


  -- ----------------------------------------------------------
  -- Create automatic payroll journal
  -- ----------------------------------------------------------

  v_entry_number :=
    public.next_automatic_journal_number(
      v_company_id,
      v_run.payment_date
    );

  insert into public.journal_entry (
    company_id,
    branch_id,
    entry_number,
    entry_date,
    description,
    reference,
    source_type,
    source_id,
    source_event,
    currency,
    status,
    total_debit,
    total_credit,
    created_by,
    approval_status
  )
  values (
    v_company_id,
    v_run.branch_id,
    v_entry_number,
    v_run.payment_date,
    'Payroll ' ||
      v_run.period_start::text ||
      ' to ' ||
      v_run.period_end::text,
    'PAYROLL-' || v_run.id::text,
    'payroll',
    v_run.id,
    'payroll_posting',
    'ZAR',
    'draft',
    v_total_debit,
    v_total_credit,
    auth.uid(),
    'not_required'
  )
  returning id
  into v_journal_id;


  -- Salaries and wages
  if v_gross > 0 then
    v_line_number := v_line_number + 1;

    insert into public.journal_line (
      journal_entry_id,
      company_id,
      account_id,
      line_number,
      description,
      debit,
      credit,
      metadata
    )
    values (
      v_journal_id,
      v_company_id,
      v_mapping.salaries_expense_account_id,
      v_line_number,
      'Payroll gross remuneration',
      round(v_gross, 2),
      0,
      jsonb_build_object(
        'source', 'payroll',
        'pay_run_id', v_run.id
      )
    );
  end if;


  -- Employer contributions expense
  if v_employer_contributions > 0 then
    v_line_number := v_line_number + 1;

    insert into public.journal_line (
      journal_entry_id,
      company_id,
      account_id,
      line_number,
      description,
      debit,
      credit,
      metadata
    )
    values (
      v_journal_id,
      v_company_id,
      v_mapping.employer_contribution_expense_account_id,
      v_line_number,
      'Employer payroll contributions',
      v_employer_contributions,
      0,
      jsonb_build_object(
        'source', 'payroll',
        'pay_run_id', v_run.id
      )
    );
  end if;


  -- Net pay liability
  if v_net > 0 then
    v_line_number := v_line_number + 1;

    insert into public.journal_line (
      journal_entry_id,
      company_id,
      account_id,
      line_number,
      description,
      debit,
      credit,
      metadata
    )
    values (
      v_journal_id,
      v_company_id,
      v_mapping.net_pay_payable_account_id,
      v_line_number,
      'Net payroll payable',
      0,
      round(v_net, 2),
      jsonb_build_object(
        'source', 'payroll',
        'pay_run_id', v_run.id
      )
    );
  end if;


  -- PAYE liability
  if v_paye > 0 then
    v_line_number := v_line_number + 1;

    insert into public.journal_line (
      journal_entry_id,
      company_id,
      account_id,
      line_number,
      description,
      debit,
      credit,
      metadata
    )
    values (
      v_journal_id,
      v_company_id,
      v_mapping.paye_payable_account_id,
      v_line_number,
      'PAYE payable',
      0,
      round(v_paye, 2),
      jsonb_build_object(
        'source', 'payroll',
        'pay_run_id', v_run.id
      )
    );
  end if;


  -- UIF employee + employer liability
  if (v_uif_employee + v_uif_employer) > 0 then
    v_line_number := v_line_number + 1;

    insert into public.journal_line (
      journal_entry_id,
      company_id,
      account_id,
      line_number,
      description,
      debit,
      credit,
      metadata
    )
    values (
      v_journal_id,
      v_company_id,
      v_mapping.uif_payable_account_id,
      v_line_number,
      'UIF payable',
      0,
      round(
        v_uif_employee + v_uif_employer,
        2
      ),
      jsonb_build_object(
        'source', 'payroll',
        'pay_run_id', v_run.id
      )
    );
  end if;


  -- SDL liability
  if v_sdl > 0 then
    v_line_number := v_line_number + 1;

    insert into public.journal_line (
      journal_entry_id,
      company_id,
      account_id,
      line_number,
      description,
      debit,
      credit,
      metadata
    )
    values (
      v_journal_id,
      v_company_id,
      v_mapping.sdl_payable_account_id,
      v_line_number,
      'SDL payable',
      0,
      round(v_sdl, 2),
      jsonb_build_object(
        'source', 'payroll',
        'pay_run_id', v_run.id
      )
    );
  end if;


  -- Retirement liability
  if (
    v_employee_retirement
    + v_employer_retirement
  ) > 0 then

    v_line_number := v_line_number + 1;

    insert into public.journal_line (
      journal_entry_id,
      company_id,
      account_id,
      line_number,
      description,
      debit,
      credit,
      metadata
    )
    values (
      v_journal_id,
      v_company_id,
      v_mapping.retirement_payable_account_id,
      v_line_number,
      'Retirement fund payable',
      0,
      round(
        v_employee_retirement
        + v_employer_retirement,
        2
      ),
      jsonb_build_object(
        'source', 'payroll',
        'pay_run_id', v_run.id
      )
    );
  end if;


  -- Other deductions liability
  if v_other > 0 then
    v_line_number := v_line_number + 1;

    insert into public.journal_line (
      journal_entry_id,
      company_id,
      account_id,
      line_number,
      description,
      debit,
      credit,
      metadata
    )
    values (
      v_journal_id,
      v_company_id,
      v_mapping.other_deductions_payable_account_id,
      v_line_number,
      'Other payroll deductions payable',
      0,
      round(v_other, 2),
      jsonb_build_object(
        'source', 'payroll',
        'pay_run_id', v_run.id
      )
    );
  end if;


  -- ----------------------------------------------------------
  -- Use the existing accounting engine to validate:
  -- period, locks, totals and posting integrity.
  -- ----------------------------------------------------------

  v_post_result :=
    public.post_journal_entry(
      v_journal_id
    );


  -- ----------------------------------------------------------
  -- Payroll becomes posted only after ledger success.
  -- ----------------------------------------------------------

  update public.payroll_pay_run
  set
    status = 'posted',
    updated_at = now()
  where id = v_run.id;


  insert into public.audit_log (
    company_id,
    user_id,
    action,
    module,
    record_id,
    description,
    metadata
  )
  values (
    v_company_id,
    auth.uid(),
    'payroll_run_posted',
    'payroll',
    v_run.id,
    'Approved payroll posted to the accounting ledger.',
    jsonb_build_object(
      'journal_id', v_journal_id,
      'journal_number', v_entry_number,
      'payment_date', v_run.payment_date,
      'total_debit', v_total_debit,
      'total_credit', v_total_credit
    )
  );


  return jsonb_build_object(
    'ok', true,
    'already_posted', false,
    'pay_run_id', v_run.id,
    'status', 'posted',
    'journal_id', v_journal_id,
    'journal_number', v_entry_number,
    'total_debit', v_total_debit,
    'total_credit', v_total_credit,
    'accounting_post', v_post_result
  );

end;
$$;
-- ============================================================
-- 4. SECURITY
-- ============================================================

revoke all
on function public.approve_payroll_pay_run(uuid)
from public;
revoke all
on function public.approve_payroll_pay_run(uuid)
from anon;
grant execute
on function public.approve_payroll_pay_run(uuid)
to authenticated;
revoke all
on function public.post_payroll_pay_run(uuid)
from public;
revoke all
on function public.post_payroll_pay_run(uuid)
from anon;
grant execute
on function public.post_payroll_pay_run(uuid)
to authenticated;
comment on function public.approve_payroll_pay_run(uuid)
is
'Approves a fully calculated payroll run after employee and accounting integrity validation.';
comment on function public.post_payroll_pay_run(uuid)
is
'Posts an approved payroll run as one balanced automatic accounting journal with duplicate protection.';
