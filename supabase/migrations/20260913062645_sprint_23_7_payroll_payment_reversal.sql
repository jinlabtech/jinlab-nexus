-- ============================================================
-- JINLAB NEXUS
-- Sprint 23.7
-- Payroll Payment Reversal + Correction
-- ============================================================


-- ============================================================
-- 1. REVERSAL EVIDENCE
-- ============================================================

alter table public.payroll_payment
add column if not exists reversal_journal_entry_id uuid
references public.journal_entry(id)
on delete restrict;
alter table public.payroll_payment
add column if not exists reversal_reason text;
alter table public.payroll_payment
add column if not exists reversed_at timestamptz;
alter table public.payroll_payment
add column if not exists reversed_by uuid
references auth.users(id)
on delete set null;
create unique index if not exists
payroll_payment_reversal_journal_unique
on public.payroll_payment(reversal_journal_entry_id)
where reversal_journal_entry_id is not null;
-- ============================================================
-- 2. REVERSE PAYROLL PAYMENT
-- ============================================================

create or replace function public.reverse_payroll_employee_payment(
  p_payment_id uuid,
  p_reversal_date date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_payment public.payroll_payment%rowtype;
  v_run public.payroll_pay_run%rowtype;

  v_reason text;

  v_reversal_result jsonb;
  v_reversal_journal_id uuid;

  v_run_total numeric := 0;
  v_run_paid numeric := 0;
  v_run_remaining numeric := 0;
begin

  -- ----------------------------------------------------------
  -- Authentication + permissions
  -- ----------------------------------------------------------

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


  if p_reversal_date is null then
    raise exception
      'Reversal date is required.';
  end if;


  if p_reversal_date > current_date then
    raise exception
      'Payroll payment reversal cannot be future dated.';
  end if;


  v_reason :=
    nullif(
      btrim(
        coalesce(
          p_reason,
          ''
        )
      ),
      ''
    );


  if v_reason is null then
    raise exception
      'A reversal reason is required.';
  end if;


  v_company_id :=
    public.current_company_id();


  -- ----------------------------------------------------------
  -- Lock original payment
  -- ----------------------------------------------------------

  select *
  into v_payment
  from public.payroll_payment
  where
    id = p_payment_id
    and company_id = v_company_id
  for update;


  if v_payment.id is null then
    raise exception
      'Payroll payment could not be found.';
  end if;


  -- ----------------------------------------------------------
  -- Idempotent reversal behaviour
  -- ----------------------------------------------------------

  if v_payment.status = 'reversed' then

    return jsonb_build_object(

      'ok',
        true,

      'already_reversed',
        true,

      'payment_id',
        v_payment.id,

      'pay_run_id',
        v_payment.pay_run_id,

      'amount',
        v_payment.amount,

      'original_journal_entry_id',
        v_payment.journal_entry_id,

      'reversal_journal_entry_id',
        v_payment.reversal_journal_entry_id,

      'reversal_reason',
        v_payment.reversal_reason,

      'reversed_at',
        v_payment.reversed_at
    );

  end if;


  if v_payment.status <> 'posted' then
    raise exception
      'Only posted payroll payments can be reversed.';
  end if;


  if v_payment.journal_entry_id is null then
    raise exception
      'Payroll payment does not have an accounting journal to reverse.';
  end if;


  if p_reversal_date < v_payment.payment_date then
    raise exception
      'Reversal date cannot be before the original payment date.';
  end if;


  -- ----------------------------------------------------------
  -- Lock pay run
  -- ----------------------------------------------------------

  select *
  into v_run
  from public.payroll_pay_run
  where
    id = v_payment.pay_run_id
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
      'Payroll payment reversal is only allowed for posted or paid payroll.';
  end if;


  -- ----------------------------------------------------------
  -- Reverse accounting journal
  --
  -- Original payment:
  -- DR Payroll Payable
  -- CR Bank / Cash
  --
  -- Reversal:
  -- DR Bank / Cash
  -- CR Payroll Payable
  -- ----------------------------------------------------------

  v_reversal_result :=
    public.reverse_journal_entry(
      v_payment.journal_entry_id,
      p_reversal_date,
      'Payroll payment reversal: ' ||
      v_reason
    );


  v_reversal_journal_id :=
    nullif(
      v_reversal_result
      ->>
      'reversal_journal_id',
      ''
    )::uuid;


  if v_reversal_journal_id is null then
    raise exception
      'Payroll payment reversal journal was not created.';
  end if;


  -- ----------------------------------------------------------
  -- Preserve original payment.
  -- Never delete accounting evidence.
  -- ----------------------------------------------------------

  update public.payroll_payment
  set
    status =
      'reversed',

    reversal_journal_entry_id =
      v_reversal_journal_id,

    reversal_reason =
      v_reason,

    reversed_at =
      now(),

    reversed_by =
      auth.uid()

  where id =
    v_payment.id;


  -- ----------------------------------------------------------
  -- Recalculate current pay-run settlement
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


  -- ----------------------------------------------------------
  -- A previously fully-paid run becomes outstanding again
  -- when a payment is legitimately reversed.
  -- ----------------------------------------------------------

  if v_run_remaining > 0.005 then

    update public.payroll_pay_run
    set
      status =
        'posted',

      paid_at =
        null,

      paid_by =
        null,

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

    'payroll_payment_reversed',

    'payroll',

    v_payment.id,

    'Payroll payment reversed through a compensating accounting journal.',

    jsonb_build_object(

      'pay_run_id',
        v_run.id,

      'pay_run_employee_id',
        v_payment.pay_run_employee_id,

      'employee_id',
        v_payment.employee_id,

      'payment_amount',
        v_payment.amount,

      'payment_date',
        v_payment.payment_date,

      'reversal_date',
        p_reversal_date,

      'reason',
        v_reason,

      'original_journal_entry_id',
        v_payment.journal_entry_id,

      'reversal_journal_entry_id',
        v_reversal_journal_id,

      'run_total',
        round(
          v_run_total,
          2
        ),

      'run_paid_after_reversal',
        round(
          v_run_paid,
          2
        ),

      'run_remaining_after_reversal',
        v_run_remaining
    )
  );


  -- ----------------------------------------------------------
  -- Response
  -- ----------------------------------------------------------

  return jsonb_build_object(

    'ok',
      true,

    'already_reversed',
      false,

    'payment_id',
      v_payment.id,

    'pay_run_id',
      v_run.id,

    'pay_run_employee_id',
      v_payment.pay_run_employee_id,

    'employee_id',
      v_payment.employee_id,

    'amount',
      v_payment.amount,

    'reversal_date',
      p_reversal_date,

    'reversal_reason',
      v_reason,

    'original_journal_entry_id',
      v_payment.journal_entry_id,

    'reversal_journal_entry_id',
      v_reversal_journal_id,

    'accounting_reversal',
      v_reversal_result,

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
-- 3. SECURITY
-- ============================================================

revoke all
on function public.reverse_payroll_employee_payment(
  uuid,
  date,
  text
)
from public;
revoke all
on function public.reverse_payroll_employee_payment(
  uuid,
  date,
  text
)
from anon;
grant execute
on function public.reverse_payroll_employee_payment(
  uuid,
  date,
  text
)
to authenticated;
comment on function public.reverse_payroll_employee_payment(
  uuid,
  date,
  text
)
is
'Reverses a payroll payment without deleting financial history. Creates a compensating posted journal, preserves the original payment as reversed evidence, recalculates settlement, and reopens the pay run when money becomes outstanding again.';
comment on column public.payroll_payment.reversal_journal_entry_id
is
'Posted compensating journal created when the payroll payment is reversed.';
comment on column public.payroll_payment.reversal_reason
is
'Required business reason explaining why the payroll payment was reversed.';
