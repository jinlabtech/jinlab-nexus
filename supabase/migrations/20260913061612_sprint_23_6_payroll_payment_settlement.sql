-- ============================================================
-- JINLAB NEXUS
-- Sprint 23.6
-- Payroll Payment + Settlement
-- ============================================================


-- ============================================================
-- 1. PAYROLL PAYMENT EVIDENCE
-- ============================================================

create table if not exists public.payroll_payment (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  pay_run_id uuid not null
    references public.payroll_pay_run(id)
    on delete restrict,

  pay_run_employee_id uuid not null
    references public.payroll_pay_run_employee(id)
    on delete restrict,

  employee_id uuid not null
    references public.hr_employee(id)
    on delete restrict,

  payment_date date not null,

  amount numeric(14,2) not null
    check (amount > 0),

  payment_method text not null
    check (
      payment_method in (
        'bank_transfer',
        'eft',
        'cash',
        'other'
      )
    ),

  funding_account_id uuid not null
    references public.accounting_account(id)
    on delete restrict,

  company_bank_account_id uuid
    references public.company_bank_account(id)
    on delete restrict,

  reference text,

  notes text,

  idempotency_key text not null,

  journal_entry_id uuid
    references public.journal_entry(id)
    on delete restrict,

  status text not null default 'posted'
    check (
      status in (
        'posted',
        'reversed'
      )
    ),

  created_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now(),

  unique (
    company_id,
    idempotency_key
  ),

  unique (
    journal_entry_id
  )
);
create index if not exists
payroll_payment_run_idx
on public.payroll_payment (
  company_id,
  pay_run_id
);
create index if not exists
payroll_payment_employee_idx
on public.payroll_payment (
  company_id,
  pay_run_employee_id
);
alter table public.payroll_payment
enable row level security;
-- No direct browser table access.
-- Payroll goes through controlled RPCs only.

revoke all
on table public.payroll_payment
from anon;
revoke all
on table public.payroll_payment
from authenticated;
-- ============================================================
-- 2. PAY-RUN SETTLEMENT AUDIT FIELDS
-- ============================================================

alter table public.payroll_pay_run
add column if not exists paid_at timestamptz;
alter table public.payroll_pay_run
add column if not exists paid_by uuid
references auth.users(id)
on delete set null;
-- ============================================================
-- 3. PAYMENT / SETTLEMENT WORKSPACE
-- ============================================================

create or replace function public.get_payroll_settlement_workspace(
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

  v_total_net numeric := 0;
  v_total_paid numeric := 0;
  v_remaining numeric := 0;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;

  if not public.current_user_has_permission(
    'payroll.view'
  ) then
    raise exception
      'Permission denied: payroll.view';
  end if;

  v_company_id :=
    public.current_company_id();


  select *
  into v_run
  from public.payroll_pay_run
  where
    id = p_pay_run_id
    and company_id = v_company_id;

  if v_run.id is null then
    raise exception
      'Pay run could not be found.';
  end if;


  select
    coalesce(
      sum(pre.net_pay),
      0
    )
  into v_total_net
  from public.payroll_pay_run_employee pre
  where
    pre.company_id = v_company_id
    and pre.pay_run_id = v_run.id
    and pre.calculation_status = 'calculated';


  select
    coalesce(
      sum(pp.amount),
      0
    )
  into v_total_paid
  from public.payroll_payment pp
  where
    pp.company_id = v_company_id
    and pp.pay_run_id = v_run.id
    and pp.status = 'posted';


  v_remaining :=
    greatest(
      round(
        v_total_net - v_total_paid,
        2
      ),
      0
    );


  return jsonb_build_object(

    'ok',
      true,

    'run',
      jsonb_build_object(
        'id',
          v_run.id,

        'period_start',
          v_run.period_start,

        'period_end',
          v_run.period_end,

        'payment_date',
          v_run.payment_date,

        'status',
          v_run.status,

        'paid_at',
          v_run.paid_at
      ),

    'summary',
      jsonb_build_object(
        'total_net_pay',
          round(v_total_net, 2),

        'total_paid',
          round(v_total_paid, 2),

        'remaining',
          v_remaining,

        'fully_settled',
          v_remaining = 0
          and v_total_net > 0
      ),


    'employees',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(

              'pay_run_employee_id',
                pre.id,

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

              'net_pay',
                round(
                  pre.net_pay,
                  2
                ),

              'paid',
                round(
                  coalesce(
                    (
                      select sum(pp.amount)
                      from public.payroll_payment pp
                      where
                        pp.company_id =
                          v_company_id
                        and pp.pay_run_employee_id =
                          pre.id
                        and pp.status =
                          'posted'
                    ),
                    0
                  ),
                  2
                ),

              'remaining',
                greatest(
                  round(
                    pre.net_pay
                    -
                    coalesce(
                      (
                        select sum(pp.amount)
                        from public.payroll_payment pp
                        where
                          pp.company_id =
                            v_company_id
                          and pp.pay_run_employee_id =
                            pre.id
                          and pp.status =
                            'posted'
                      ),
                      0
                    ),
                    2
                  ),
                  0
                ),

              'payment_status',
                case

                  when coalesce(
                    (
                      select sum(pp.amount)
                      from public.payroll_payment pp
                      where
                        pp.company_id =
                          v_company_id
                        and pp.pay_run_employee_id =
                          pre.id
                        and pp.status =
                          'posted'
                    ),
                    0
                  ) <= 0
                    then 'unpaid'

                  when coalesce(
                    (
                      select sum(pp.amount)
                      from public.payroll_payment pp
                      where
                        pp.company_id =
                          v_company_id
                        and pp.pay_run_employee_id =
                          pre.id
                        and pp.status =
                          'posted'
                    ),
                    0
                  ) + 0.005 >= pre.net_pay
                    then 'paid'

                  else 'partial'

                end,

              'payments',
                coalesce(
                  (
                    select jsonb_agg(
                      jsonb_build_object(

                        'id',
                          pp.id,

                        'payment_date',
                          pp.payment_date,

                        'amount',
                          pp.amount,

                        'payment_method',
                          pp.payment_method,

                        'reference',
                          pp.reference,

                        'status',
                          pp.status,

                        'journal_entry_id',
                          pp.journal_entry_id

                      )
                      order by
                        pp.payment_date,
                        pp.created_at
                    )

                    from public.payroll_payment pp

                    where
                      pp.company_id =
                        v_company_id

                      and pp.pay_run_employee_id =
                        pre.id
                  ),
                  '[]'::jsonb
                )

            )
            order by
              e.last_name,
              e.first_name
          )

          from public.payroll_pay_run_employee pre

          join public.hr_employee e
            on e.id =
               pre.employee_id
           and e.company_id =
               pre.company_id

          where
            pre.company_id =
              v_company_id

            and pre.pay_run_id =
              v_run.id
        ),
        '[]'::jsonb
      ),


    'funding_accounts',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(

              'id',
                aa.id,

              'code',
                aa.code,

              'name',
                aa.name,

              'account_subtype',
                aa.account_subtype,

              'system_key',
                aa.system_key

            )
            order by
              aa.code
          )

          from public.accounting_account aa

          where
            aa.company_id =
              v_company_id

            and aa.is_active =
              true

            and aa.account_type =
              'asset'

            and aa.account_subtype in (
              'bank',
              'cash'
            )
        ),
        '[]'::jsonb
      ),


    'company_bank_accounts',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(

              'id',
                ba.id,

              'bank_name',
                ba.bank_name,

              'account_name',
                ba.account_name,

              'account_type',
                ba.account_type,

              'currency',
                ba.currency,

              'is_default',
                ba.is_default,

              'account_last4',
                case
                  when length(
                    coalesce(
                      ba.account_number,
                      ''
                    )
                  ) >= 4
                  then right(
                    ba.account_number,
                    4
                  )
                  else null
                end

            )
            order by
              ba.is_default desc,
              ba.bank_name
          )

          from public.company_bank_account ba

          where
            ba.company_id =
              v_company_id

            and ba.is_active =
              true
        ),
        '[]'::jsonb
      )

  );

end;
$$;
-- ============================================================
-- 4. RECORD A REAL EMPLOYEE PAYROLL PAYMENT
-- ============================================================

create or replace function public.record_payroll_employee_payment(
  p_pay_run_employee_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_funding_account_id uuid,
  p_payment_method text,
  p_reference text,
  p_idempotency_key text,
  p_company_bank_account_id uuid default null,
  p_notes text default null
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

  v_mapping public.payroll_accounting_mapping%rowtype;

  v_funding_account public.accounting_account%rowtype;

  v_payment_id uuid;

  v_existing public.payroll_payment%rowtype;

  v_already_paid numeric := 0;
  v_remaining numeric := 0;

  v_run_total numeric := 0;
  v_run_paid numeric := 0;
  v_run_remaining numeric := 0;

  v_entry_number text;
  v_journal_id uuid;

  v_post_result jsonb;

  v_key text;
  v_reference text;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
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


  if p_payment_date is null then
    raise exception
      'Payment date is required.';
  end if;


  if p_payment_date > current_date then
    raise exception
      'Payroll payment cannot be future dated.';
  end if;


  if coalesce(p_amount, 0) <= 0 then
    raise exception
      'Payment amount must be greater than zero.';
  end if;


  if p_payment_method not in (
    'bank_transfer',
    'eft',
    'cash',
    'other'
  ) then
    raise exception
      'Unsupported payroll payment method.';
  end if;


  v_key :=
    nullif(
      btrim(
        coalesce(
          p_idempotency_key,
          ''
        )
      ),
      ''
    );

  if v_key is null then
    raise exception
      'Payment idempotency key is required.';
  end if;


  v_reference :=
    nullif(
      btrim(
        coalesce(
          p_reference,
          ''
        )
      ),
      ''
    );


  v_company_id :=
    public.current_company_id();


  -- ----------------------------------------------------------
  -- Idempotent retry protection
  -- ----------------------------------------------------------

  select *
  into v_existing
  from public.payroll_payment
  where
    company_id = v_company_id
    and idempotency_key = v_key
  limit 1;

  if v_existing.id is not null then

    return jsonb_build_object(
      'ok',
        true,

      'already_recorded',
        true,

      'payment_id',
        v_existing.id,

      'pay_run_id',
        v_existing.pay_run_id,

      'pay_run_employee_id',
        v_existing.pay_run_employee_id,

      'amount',
        v_existing.amount,

      'payment_date',
        v_existing.payment_date,

      'journal_entry_id',
        v_existing.journal_entry_id
    );

  end if;


  -- ----------------------------------------------------------
  -- Lock payroll employee + run
  -- ----------------------------------------------------------

  select *
  into v_pre
  from public.payroll_pay_run_employee
  where
    id = p_pay_run_employee_id
    and company_id = v_company_id
  for update;

  if v_pre.id is null then
    raise exception
      'Payroll employee record could not be found.';
  end if;


  select *
  into v_run
  from public.payroll_pay_run
  where
    id = v_pre.pay_run_id
    and company_id = v_company_id
  for update;

  if v_run.id is null then
    raise exception
      'Pay run could not be found.';
  end if;


  if v_run.status not in (
    'posted',
    'paid'
  ) then
    raise exception
      'Payroll must be posted before payment can be recorded.';
  end if;


  if v_pre.calculation_status <> 'calculated' then
    raise exception
      'Only successfully calculated payroll can be paid.';
  end if;


  if p_payment_date < v_run.period_start then
    raise exception
      'Payroll payment cannot be dated before the payroll period.';
  end if;


  -- ----------------------------------------------------------
  -- Validate funding ledger account
  -- ----------------------------------------------------------

  select *
  into v_funding_account
  from public.accounting_account
  where
    id = p_funding_account_id
    and company_id = v_company_id
    and is_active = true;

  if v_funding_account.id is null then
    raise exception
      'Funding account could not be found.';
  end if;


  if v_funding_account.account_type <> 'asset'
     or v_funding_account.account_subtype
        not in (
          'bank',
          'cash'
        )
  then
    raise exception
      'Payroll must be settled from an active bank or cash account.';
  end if;


  if p_company_bank_account_id is not null
     and not exists (
       select 1
       from public.company_bank_account ba
       where
         ba.id =
           p_company_bank_account_id
         and ba.company_id =
           v_company_id
         and ba.is_active =
           true
     )
  then
    raise exception
      'Company bank account could not be found.';
  end if;


  -- ----------------------------------------------------------
  -- Calculate employee remaining balance
  -- ----------------------------------------------------------

  select
    coalesce(
      sum(pp.amount),
      0
    )
  into v_already_paid
  from public.payroll_payment pp
  where
    pp.company_id =
      v_company_id
    and pp.pay_run_employee_id =
      v_pre.id
    and pp.status =
      'posted';


  v_remaining :=
    round(
      v_pre.net_pay
      - v_already_paid,
      2
    );


  if v_remaining <= 0.005 then
    raise exception
      'This employee payroll is already fully paid.';
  end if;


  if round(p_amount, 2)
     >
     v_remaining + 0.005
  then
    raise exception
      'Payment amount % exceeds the remaining payroll balance %.',
      round(p_amount, 2),
      v_remaining;
  end if;


  -- ----------------------------------------------------------
  -- Payroll payable mapping
  -- ----------------------------------------------------------

  perform public.ensure_payroll_accounting_defaults(
    v_company_id
  );


  select *
  into v_mapping
  from public.payroll_accounting_mapping
  where company_id =
    v_company_id;


  if v_mapping.net_pay_payable_account_id is null then
    raise exception
      'Payroll Payable accounting mapping is not configured.';
  end if;


  -- ----------------------------------------------------------
  -- Create payment evidence first
  -- Entire RPC remains atomic.
  -- ----------------------------------------------------------

  insert into public.payroll_payment (
    company_id,
    pay_run_id,
    pay_run_employee_id,
    employee_id,
    payment_date,
    amount,
    payment_method,
    funding_account_id,
    company_bank_account_id,
    reference,
    notes,
    idempotency_key,
    status,
    created_by
  )
  values (
    v_company_id,
    v_run.id,
    v_pre.id,
    v_pre.employee_id,
    p_payment_date,
    round(
      p_amount,
      2
    ),
    p_payment_method,
    p_funding_account_id,
    p_company_bank_account_id,
    v_reference,
    nullif(
      btrim(
        coalesce(
          p_notes,
          ''
        )
      ),
      ''
    ),
    v_key,
    'posted',
    auth.uid()
  )
  returning id
  into v_payment_id;


  -- ----------------------------------------------------------
  -- Create balanced settlement journal
  --
  -- DR Payroll Payable
  -- CR Bank / Cash
  -- ----------------------------------------------------------

  v_entry_number :=
    public.next_automatic_journal_number(
      v_company_id,
      p_payment_date
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
    p_payment_date,

    'Payroll payment - ' ||
    coalesce(
      (
        select
          concat_ws(
            ' ',
            e.first_name,
            e.last_name
          )
        from public.hr_employee e
        where e.id =
          v_pre.employee_id
      ),
      'Employee'
    ),

    coalesce(
      v_reference,
      'PAYROLL-PAYMENT-' ||
      v_payment_id::text
    ),

    'payroll',
    v_payment_id,
    'payroll_payment',
    'ZAR',
    'draft',

    round(
      p_amount,
      2
    ),

    round(
      p_amount,
      2
    ),

    auth.uid(),
    'not_required'
  )
  returning id
  into v_journal_id;


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
  values
  (
    v_journal_id,
    v_company_id,
    v_mapping.net_pay_payable_account_id,
    1,
    'Payroll payable settlement',
    round(
      p_amount,
      2
    ),
    0,
    jsonb_build_object(
      'source',
        'payroll_payment',

      'payment_id',
        v_payment_id,

      'pay_run_id',
        v_run.id,

      'pay_run_employee_id',
        v_pre.id,

      'employee_id',
        v_pre.employee_id
    )
  ),
  (
    v_journal_id,
    v_company_id,
    v_funding_account.id,
    2,
    'Payroll payment funding',
    0,
    round(
      p_amount,
      2
    ),
    jsonb_build_object(
      'source',
        'payroll_payment',

      'payment_id',
        v_payment_id,

      'pay_run_id',
        v_run.id,

      'funding_account_id',
        v_funding_account.id,

      'company_bank_account_id',
        p_company_bank_account_id
    )
  );


  v_post_result :=
    public.post_journal_entry(
      v_journal_id
    );


  update public.payroll_payment
  set
    journal_entry_id =
      v_journal_id
  where id =
    v_payment_id;


  -- ----------------------------------------------------------
  -- Recalculate whole pay-run settlement
  -- ----------------------------------------------------------

  select
    coalesce(
      sum(pre.net_pay),
      0
    )
  into v_run_total
  from public.payroll_pay_run_employee pre
  where
    pre.company_id =
      v_company_id

    and pre.pay_run_id =
      v_run.id

    and pre.calculation_status =
      'calculated';


  select
    coalesce(
      sum(pp.amount),
      0
    )
  into v_run_paid
  from public.payroll_payment pp
  where
    pp.company_id =
      v_company_id

    and pp.pay_run_id =
      v_run.id

    and pp.status =
      'posted';


  v_run_remaining :=
    greatest(
      round(
        v_run_total
        - v_run_paid,
        2
      ),
      0
    );


  if v_run_total > 0
     and v_run_remaining <= 0.005
  then

    update public.payroll_pay_run
    set
      status =
        'paid',

      paid_at =
        coalesce(
          paid_at,
          now()
        ),

      paid_by =
        coalesce(
          paid_by,
          auth.uid()
        ),

      updated_at =
        now()

    where id =
      v_run.id;

  end if;


  -- ----------------------------------------------------------
  -- Audit
  -- ----------------------------------------------------------

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
    'payroll_payment_recorded',
    'payroll',
    v_payment_id,
    'Employee payroll payment recorded and posted to the accounting ledger.',
    jsonb_build_object(

      'pay_run_id',
        v_run.id,

      'pay_run_employee_id',
        v_pre.id,

      'employee_id',
        v_pre.employee_id,

      'amount',
        round(
          p_amount,
          2
        ),

      'payment_date',
        p_payment_date,

      'payment_method',
        p_payment_method,

      'funding_account_id',
        v_funding_account.id,

      'journal_entry_id',
        v_journal_id,

      'run_total',
        v_run_total,

      'run_paid',
        v_run_paid,

      'run_remaining',
        v_run_remaining,

      'run_fully_paid',
        v_run_remaining <= 0.005
    )
  );


  return jsonb_build_object(

    'ok',
      true,

    'already_recorded',
      false,

    'payment_id',
      v_payment_id,

    'pay_run_id',
      v_run.id,

    'pay_run_employee_id',
      v_pre.id,

    'employee_id',
      v_pre.employee_id,

    'amount',
      round(
        p_amount,
        2
      ),

    'payment_date',
      p_payment_date,

    'payment_method',
      p_payment_method,

    'funding_account',
      jsonb_build_object(
        'id',
          v_funding_account.id,

        'code',
          v_funding_account.code,

        'name',
          v_funding_account.name
      ),

    'journal_entry_id',
      v_journal_id,

    'journal_number',
      v_entry_number,

    'accounting_post',
      v_post_result,

    'settlement',
      jsonb_build_object(
        'run_total',
          round(
            v_run_total,
            2
          ),

        'run_paid',
          round(
            v_run_paid,
            2
          ),

        'run_remaining',
          v_run_remaining,

        'run_status',
          case
            when v_run_remaining <= 0.005
              then 'paid'
            else 'posted'
          end
      )

  );

end;
$$;
-- ============================================================
-- 5. SECURITY
-- ============================================================

revoke all
on function public.get_payroll_settlement_workspace(uuid)
from public;
revoke all
on function public.get_payroll_settlement_workspace(uuid)
from anon;
grant execute
on function public.get_payroll_settlement_workspace(uuid)
to authenticated;
revoke all
on function public.record_payroll_employee_payment(
  uuid,
  date,
  numeric,
  uuid,
  text,
  text,
  text,
  uuid,
  text
)
from public;
revoke all
on function public.record_payroll_employee_payment(
  uuid,
  date,
  numeric,
  uuid,
  text,
  text,
  text,
  uuid,
  text
)
from anon;
grant execute
on function public.record_payroll_employee_payment(
  uuid,
  date,
  numeric,
  uuid,
  text,
  text,
  text,
  uuid,
  text
)
to authenticated;
comment on table public.payroll_payment
is
'Immutable evidence of actual payroll settlement. Posting payroll creates the liability; payroll_payment records the later real-world payment event.';
comment on function public.record_payroll_employee_payment(
  uuid,
  date,
  numeric,
  uuid,
  text,
  text,
  text,
  uuid,
  text
)
is
'Records an actual employee payroll payment, debits Payroll Payable, credits Bank/Cash, prevents overpayment and duplicate submission, and marks the pay run paid only after full settlement.';
comment on function public.get_payroll_settlement_workspace(uuid)
is
'Payroll settlement workspace showing each employee net pay, paid amount, remaining amount, payment evidence and available bank/cash funding accounts.';
