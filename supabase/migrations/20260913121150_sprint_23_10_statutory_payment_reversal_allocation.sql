-- ============================================================
-- JINLAB NEXUS
-- Sprint 23.10
-- Statutory Payment Reversal + SARS Allocation Confirmation
-- ============================================================


-- ============================================================
-- 1. STATUTORY PAYMENT REVERSAL EVIDENCE
-- ============================================================

alter table public.payroll_statutory_payment
add column if not exists reversal_journal_entry_id uuid
references public.journal_entry(id)
on delete restrict;
alter table public.payroll_statutory_payment
add column if not exists reversal_reason text;
alter table public.payroll_statutory_payment
add column if not exists reversed_at timestamptz;
alter table public.payroll_statutory_payment
add column if not exists reversed_by uuid
references auth.users(id)
on delete set null;
create unique index if not exists
payroll_statutory_payment_reversal_journal_unique
on public.payroll_statutory_payment(
  reversal_journal_entry_id
)
where reversal_journal_entry_id is not null;
-- ============================================================
-- 2. SARS ALLOCATION CONFIRMATION EVIDENCE
-- ============================================================

alter table public.payroll_emp201_declaration
add column if not exists sars_allocation_confirmed boolean
not null default false;
alter table public.payroll_emp201_declaration
add column if not exists allocation_confirmation_reference text;
alter table public.payroll_emp201_declaration
add column if not exists allocation_confirmed_at timestamptz;
alter table public.payroll_emp201_declaration
add column if not exists allocation_confirmed_by uuid
references auth.users(id)
on delete set null;
alter table public.payroll_emp201_declaration
add column if not exists allocation_confirmation_notes text;
-- Extend declaration lifecycle.

alter table public.payroll_emp201_declaration
drop constraint if exists
payroll_emp201_declaration_status_check;
alter table public.payroll_emp201_declaration
add constraint payroll_emp201_declaration_status_check
check (
  status in (
    'submitted',
    'payment_partially_recorded',
    'payment_recorded',
    'allocation_confirmed'
  )
);
-- ============================================================
-- 3. REVERSE STATUTORY PAYMENT
-- ============================================================

create or replace function public.reverse_payroll_statutory_payment(
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

  v_payment public.payroll_statutory_payment%rowtype;
  v_declaration public.payroll_emp201_declaration%rowtype;

  v_reason text;

  v_reversal_result jsonb;
  v_reversal_journal_id uuid;

  v_paid_paye numeric := 0;
  v_paid_uif numeric := 0;
  v_paid_sdl numeric := 0;

  v_remaining_paye numeric := 0;
  v_remaining_uif numeric := 0;
  v_remaining_sdl numeric := 0;
  v_remaining_total numeric := 0;

  v_active_payment_count integer := 0;

  v_new_status text;
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


  if p_reversal_date is null then
    raise exception
      'Reversal date is required.';
  end if;


  if p_reversal_date > current_date then
    raise exception
      'Statutory payment reversal cannot be future dated.';
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
      'A statutory payment reversal reason is required.';
  end if;


  v_company_id :=
    public.current_company_id();


  -- ----------------------------------------------------------
  -- Lock payment
  -- ----------------------------------------------------------

  select *
  into v_payment

  from public.payroll_statutory_payment

  where
    id = p_payment_id
    and company_id = v_company_id

  for update;


  if v_payment.id is null then
    raise exception
      'Statutory payment could not be found.';
  end if;


  -- Idempotent retry.

  if v_payment.status = 'reversed' then

    return jsonb_build_object(

      'ok',
        true,

      'already_reversed',
        true,

      'payment_id',
        v_payment.id,

      'declaration_id',
        v_payment.declaration_id,

      'amount',
        v_payment.total_amount,

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
      'Only posted statutory payments can be reversed.';
  end if;


  if v_payment.journal_entry_id is null then
    raise exception
      'Statutory payment has no accounting journal to reverse.';
  end if;


  if p_reversal_date < v_payment.payment_date then
    raise exception
      'Reversal date cannot be before the original statutory payment date.';
  end if;


  -- ----------------------------------------------------------
  -- Lock declaration
  -- ----------------------------------------------------------

  select *
  into v_declaration

  from public.payroll_emp201_declaration

  where
    id = v_payment.declaration_id
    and company_id = v_company_id

  for update;


  if v_declaration.id is null then
    raise exception
      'EMP201 declaration could not be found.';
  end if;


  -- Once SARS allocation has actually been confirmed,
  -- do not silently change the local financial history.

  if v_declaration.sars_allocation_confirmed then
    raise exception
      'This EMP201 payment has already been confirmed as allocated by SARS. Use a controlled SARS correction/amendment workflow before reversing it.';
  end if;


  -- ----------------------------------------------------------
  -- Reverse accounting journal
  --
  -- Original:
  -- DR PAYE/UIF/SDL Payables
  -- CR Bank/Cash
  --
  -- Reversal:
  -- DR Bank/Cash
  -- CR PAYE/UIF/SDL Payables
  -- ----------------------------------------------------------

  v_reversal_result :=
    public.reverse_journal_entry(
      v_payment.journal_entry_id,
      p_reversal_date,
      'EMP201 statutory payment reversal: ' ||
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
      'Statutory payment reversal journal was not created.';
  end if;


  -- ----------------------------------------------------------
  -- Preserve original payment evidence
  -- ----------------------------------------------------------

  update public.payroll_statutory_payment
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
  -- Recalculate active payments
  -- ----------------------------------------------------------

  select

    coalesce(
      sum(paye_amount),
      0
    ),

    coalesce(
      sum(uif_amount),
      0
    ),

    coalesce(
      sum(sdl_amount),
      0
    ),

    count(*)

  into
    v_paid_paye,
    v_paid_uif,
    v_paid_sdl,
    v_active_payment_count

  from public.payroll_statutory_payment

  where
    company_id =
      v_company_id

    and declaration_id =
      v_declaration.id

    and status =
      'posted';


  v_remaining_paye :=
    greatest(
      round(
        v_declaration.paye_liability
        - v_paid_paye,
        2
      ),
      0
    );


  v_remaining_uif :=
    greatest(
      round(
        v_declaration.uif_liability
        - v_paid_uif,
        2
      ),
      0
    );


  v_remaining_sdl :=
    greatest(
      round(
        v_declaration.sdl_liability
        - v_paid_sdl,
        2
      ),
      0
    );


  v_remaining_total :=
    round(
      v_remaining_paye
      +
      v_remaining_uif
      +
      v_remaining_sdl,
      2
    );


  v_new_status :=
    case

      when v_remaining_total <= 0.005
        then 'payment_recorded'

      when v_active_payment_count > 0
        then 'payment_partially_recorded'

      else 'submitted'

    end;


  update public.payroll_emp201_declaration
  set
    status =
      v_new_status,

    updated_at =
      now()

  where id =
    v_declaration.id;


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

    'emp201_payment_reversed',

    'payroll',

    v_payment.id,

    'EMP201 statutory payment reversed through a compensating accounting journal.',

    jsonb_build_object(

      'declaration_id',
        v_declaration.id,

      'period_month',
        v_declaration.period_month,

      'sars_prn',
        v_declaration.sars_prn,

      'payment_id',
        v_payment.id,

      'payment_amount',
        v_payment.total_amount,

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

      'remaining_paye',
        v_remaining_paye,

      'remaining_uif',
        v_remaining_uif,

      'remaining_sdl',
        v_remaining_sdl,

      'remaining_total',
        v_remaining_total,

      'declaration_status',
        v_new_status
    )
  );


  return jsonb_build_object(

    'ok',
      true,

    'already_reversed',
      false,

    'payment_id',
      v_payment.id,

    'declaration_id',
      v_declaration.id,

    'period_month',
      v_declaration.period_month,

    'amount',
      v_payment.total_amount,

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

    'remaining',
      jsonb_build_object(

        'paye',
          v_remaining_paye,

        'uif',
          v_remaining_uif,

        'sdl',
          v_remaining_sdl,

        'total',
          v_remaining_total
      ),

    'declaration_status',
      v_new_status

  );

end;
$$;
-- ============================================================
-- 4. CONFIRM SARS ALLOCATION
-- ============================================================

create or replace function public.confirm_payroll_emp201_sars_allocation(
  p_declaration_id uuid,
  p_confirmation_reference text,
  p_confirmed_at timestamptz default now(),
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_declaration public.payroll_emp201_declaration%rowtype;

  v_reference text;

  v_paid_paye numeric := 0;
  v_paid_uif numeric := 0;
  v_paid_sdl numeric := 0;

  v_remaining_paye numeric := 0;
  v_remaining_uif numeric := 0;
  v_remaining_sdl numeric := 0;
  v_remaining_total numeric := 0;
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
    'payroll.view'
  ) then
    raise exception
      'Permission denied: payroll.view';
  end if;


  if p_confirmed_at is null then
    raise exception
      'SARS allocation confirmation date/time is required.';
  end if;


  if p_confirmed_at > now() then
    raise exception
      'SARS allocation confirmation cannot be future dated.';
  end if;


  v_reference :=
    nullif(
      btrim(
        coalesce(
          p_confirmation_reference,
          ''
        )
      ),
      ''
    );


  if v_reference is null then
    raise exception
      'A SARS allocation confirmation reference or evidence reference is required.';
  end if;


  v_company_id :=
    public.current_company_id();


  -- ----------------------------------------------------------
  -- Lock declaration
  -- ----------------------------------------------------------

  select *
  into v_declaration

  from public.payroll_emp201_declaration

  where
    id =
      p_declaration_id

    and company_id =
      v_company_id

  for update;


  if v_declaration.id is null then
    raise exception
      'EMP201 declaration could not be found.';
  end if;


  -- ----------------------------------------------------------
  -- Idempotent confirmation
  -- ----------------------------------------------------------

  if v_declaration.sars_allocation_confirmed then

    if v_declaration.allocation_confirmation_reference =
       v_reference then

      return jsonb_build_object(

        'ok',
          true,

        'already_confirmed',
          true,

        'declaration_id',
          v_declaration.id,

        'period_month',
          v_declaration.period_month,

        'sars_prn',
          v_declaration.sars_prn,

        'confirmation_reference',
          v_declaration.allocation_confirmation_reference,

        'confirmed_at',
          v_declaration.allocation_confirmed_at,

        'status',
          v_declaration.status

      );

    end if;


    raise exception
      'SARS allocation is already confirmed with a different evidence reference. Do not overwrite confirmed compliance history.';

  end if;


  if p_confirmed_at < v_declaration.submitted_at then
    raise exception
      'SARS allocation cannot be confirmed before the EMP201 submission date.';
  end if;


  -- ----------------------------------------------------------
  -- Calculate currently posted payments
  -- ----------------------------------------------------------

  select

    coalesce(
      sum(paye_amount),
      0
    ),

    coalesce(
      sum(uif_amount),
      0
    ),

    coalesce(
      sum(sdl_amount),
      0
    )

  into
    v_paid_paye,
    v_paid_uif,
    v_paid_sdl

  from public.payroll_statutory_payment

  where
    company_id =
      v_company_id

    and declaration_id =
      v_declaration.id

    and status =
      'posted';


  v_remaining_paye :=
    greatest(
      round(
        v_declaration.paye_liability
        - v_paid_paye,
        2
      ),
      0
    );


  v_remaining_uif :=
    greatest(
      round(
        v_declaration.uif_liability
        - v_paid_uif,
        2
      ),
      0
    );


  v_remaining_sdl :=
    greatest(
      round(
        v_declaration.sdl_liability
        - v_paid_sdl,
        2
      ),
      0
    );


  v_remaining_total :=
    round(
      v_remaining_paye
      +
      v_remaining_uif
      +
      v_remaining_sdl,
      2
    );


  -- If there is an amount payable, Nexus must have
  -- complete payment evidence before external allocation
  -- can be marked confirmed.

  if v_declaration.total_payable > 0.005
     and v_remaining_total > 0.005
  then

    raise exception
      'SARS allocation cannot be confirmed while EMP201 liabilities remain outstanding. Remaining amount: %.',
      v_remaining_total;

  end if;


  -- ----------------------------------------------------------
  -- Confirm external allocation
  -- ----------------------------------------------------------

  update public.payroll_emp201_declaration
  set
    sars_allocation_confirmed =
      true,

    allocation_confirmation_reference =
      v_reference,

    allocation_confirmed_at =
      p_confirmed_at,

    allocation_confirmed_by =
      auth.uid(),

    allocation_confirmation_notes =
      nullif(
        btrim(
          coalesce(
            p_notes,
            ''
          )
        ),
        ''
      ),

    status =
      'allocation_confirmed',

    updated_at =
      now()

  where id =
    v_declaration.id;


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

    'emp201_sars_allocation_confirmed',

    'payroll',

    v_declaration.id,

    'SARS allocation confirmation evidence recorded for EMP201.',

    jsonb_build_object(

      'period_month',
        v_declaration.period_month,

      'sars_prn',
        v_declaration.sars_prn,

      'confirmation_reference',
        v_reference,

      'confirmed_at',
        p_confirmed_at,

      'paye_paid',
        round(
          v_paid_paye,
          2
        ),

      'uif_paid',
        round(
          v_paid_uif,
          2
        ),

      'sdl_paid',
        round(
          v_paid_sdl,
          2
        ),

      'remaining_total',
        v_remaining_total,

      'external_confirmation',
        true
    )
  );


  return jsonb_build_object(

    'ok',
      true,

    'already_confirmed',
      false,

    'declaration_id',
      v_declaration.id,

    'period_month',
      v_declaration.period_month,

    'sars_prn',
      v_declaration.sars_prn,

    'confirmation_reference',
      v_reference,

    'confirmed_at',
      p_confirmed_at,

    'liabilities',
      jsonb_build_object(

        'paye',
          v_declaration.paye_liability,

        'uif',
          v_declaration.uif_liability,

        'sdl',
          v_declaration.sdl_liability,

        'total',
          v_declaration.total_payable
      ),

    'payments',
      jsonb_build_object(

        'paye',
          round(
            v_paid_paye,
            2
          ),

        'uif',
          round(
            v_paid_uif,
            2
          ),

        'sdl',
          round(
            v_paid_sdl,
            2
          ),

        'remaining',
          v_remaining_total
      ),

    'status',
      'allocation_confirmed',

    'compliance_closed',
      true

  );

end;
$$;
-- ============================================================
-- 5. UPDATED EMP201 FILING CONTROL
-- ============================================================

create or replace function public.get_payroll_emp201_filing_control(
  p_month date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_month_start date;

  v_workspace jsonb;

  v_declaration public.payroll_emp201_declaration%rowtype;

  v_paid_paye numeric := 0;
  v_paid_uif numeric := 0;
  v_paid_sdl numeric := 0;

  v_remaining_paye numeric := 0;
  v_remaining_uif numeric := 0;
  v_remaining_sdl numeric := 0;
  v_remaining_total numeric := 0;
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


  v_month_start :=
    date_trunc(
      'month',
      coalesce(
        p_month,
        current_date
      )
    )::date;


  v_workspace :=
    public.get_payroll_emp201_workspace(
      v_month_start
    );


  select *
  into v_declaration

  from public.payroll_emp201_declaration

  where
    company_id =
      v_company_id

    and period_month =
      v_month_start;


  if v_declaration.id is null then

    return jsonb_build_object(

      'ok',
        true,

      'period_month',
        v_month_start,

      'emp201_workspace',
        v_workspace,

      'submission',
        null,

      'payments',
        '[]'::jsonb,

      'control',
        jsonb_build_object(

          'submission_recorded',
            false,

          'payment_recorded',
            false,

          'fully_recorded',
            false,

          'sars_allocation_confirmed',
            false,

          'compliance_closed',
            false,

          'next_action',
            case

              when coalesce(
                (
                  v_workspace
                  #>>
                  '{readiness,financial_data_ready}'
                )::boolean,
                false
              )
                then 'Record the SARS EMP201 submission using the SARS-issued PRN.'

              else 'Resolve EMP201 readiness blockers before recording submission.'

            end
        )

    );

  end if;


  -- ----------------------------------------------------------
  -- Active payments only
  -- ----------------------------------------------------------

  select

    coalesce(
      sum(paye_amount),
      0
    ),

    coalesce(
      sum(uif_amount),
      0
    ),

    coalesce(
      sum(sdl_amount),
      0
    )

  into
    v_paid_paye,
    v_paid_uif,
    v_paid_sdl

  from public.payroll_statutory_payment

  where
    company_id =
      v_company_id

    and declaration_id =
      v_declaration.id

    and status =
      'posted';


  v_remaining_paye :=
    greatest(
      round(
        v_declaration.paye_liability
        - v_paid_paye,
        2
      ),
      0
    );


  v_remaining_uif :=
    greatest(
      round(
        v_declaration.uif_liability
        - v_paid_uif,
        2
      ),
      0
    );


  v_remaining_sdl :=
    greatest(
      round(
        v_declaration.sdl_liability
        - v_paid_sdl,
        2
      ),
      0
    );


  v_remaining_total :=
    round(
      v_remaining_paye
      +
      v_remaining_uif
      +
      v_remaining_sdl,
      2
    );


  return jsonb_build_object(

    'ok',
      true,

    'period_month',
      v_month_start,

    'emp201_workspace',
      v_workspace,


    'submission',
      jsonb_build_object(

        'id',
          v_declaration.id,

        'tax_year',
          v_declaration.tax_year,

        'sars_prn',
          v_declaration.sars_prn,

        'submission_reference',
          v_declaration.submission_reference,

        'submission_channel',
          v_declaration.submission_channel,

        'submitted_at',
          v_declaration.submitted_at,

        'due_date',
          v_declaration.due_date,

        'status',
          v_declaration.status,

        'liabilities',
          jsonb_build_object(

            'paye',
              v_declaration.paye_liability,

            'uif',
              v_declaration.uif_liability,

            'sdl',
              v_declaration.sdl_liability,

            'eti_utilised',
              v_declaration.eti_utilised,

            'total',
              v_declaration.total_payable
          ),

        'sars_allocation',
          jsonb_build_object(

            'confirmed',
              v_declaration.sars_allocation_confirmed,

            'confirmation_reference',
              v_declaration.allocation_confirmation_reference,

            'confirmed_at',
              v_declaration.allocation_confirmed_at,

            'confirmation_notes',
              v_declaration.allocation_confirmation_notes
          )
      ),


    'payments',
      coalesce(
        (
          select jsonb_agg(

            jsonb_build_object(

              'id',
                p.id,

              'payment_date',
                p.payment_date,

              'paye',
                p.paye_amount,

              'uif',
                p.uif_amount,

              'sdl',
                p.sdl_amount,

              'total',
                p.total_amount,

              'payment_method',
                p.payment_method,

              'reference',
                p.reference,

              'status',
                p.status,

              'journal_entry_id',
                p.journal_entry_id,

              'reversal_journal_entry_id',
                p.reversal_journal_entry_id,

              'reversal_reason',
                p.reversal_reason,

              'reversed_at',
                p.reversed_at

            )

            order by
              p.payment_date,
              p.created_at
          )

          from public.payroll_statutory_payment p

          where
            p.company_id =
              v_company_id

            and p.declaration_id =
              v_declaration.id
        ),
        '[]'::jsonb
      ),


    'payment_summary',
      jsonb_build_object(

        'paid',
          jsonb_build_object(

            'paye',
              round(
                v_paid_paye,
                2
              ),

            'uif',
              round(
                v_paid_uif,
                2
              ),

            'sdl',
              round(
                v_paid_sdl,
                2
              ),

            'total',
              round(
                v_paid_paye
                +
                v_paid_uif
                +
                v_paid_sdl,
                2
              )
          ),

        'remaining',
          jsonb_build_object(

            'paye',
              v_remaining_paye,

            'uif',
              v_remaining_uif,

            'sdl',
              v_remaining_sdl,

            'total',
              v_remaining_total
          )
      ),


    'control',
      jsonb_build_object(

        'submission_recorded',
          true,

        'payment_recorded',
          (
            v_paid_paye
            +
            v_paid_uif
            +
            v_paid_sdl
          ) > 0,

        'fully_recorded',
          v_remaining_total <= 0.005,

        'sars_allocation_confirmed',
          v_declaration.sars_allocation_confirmed,

        'compliance_closed',
          v_declaration.sars_allocation_confirmed
          and v_remaining_total <= 0.005,

        'overdue',
          current_date >
          v_declaration.due_date

          and
          v_remaining_total > 0.005,

        'next_action',
          case

            when v_declaration.sars_allocation_confirmed
              and v_remaining_total <= 0.005
              then 'EMP201 cycle closed. SARS allocation has been confirmed.'

            when v_remaining_total > 0.005
              then 'Record the actual SARS payment against the outstanding PAYE/UIF/SDL liabilities.'

            else 'Payment is fully recorded. Confirm allocation using evidence from the SARS employer account.'

          end
      )

  );

end;
$$;
-- ============================================================
-- 6. SECURITY
-- ============================================================

revoke all
on function public.reverse_payroll_statutory_payment(
  uuid,
  date,
  text
)
from public;
revoke all
on function public.reverse_payroll_statutory_payment(
  uuid,
  date,
  text
)
from anon;
grant execute
on function public.reverse_payroll_statutory_payment(
  uuid,
  date,
  text
)
to authenticated;
revoke all
on function public.confirm_payroll_emp201_sars_allocation(
  uuid,
  text,
  timestamptz,
  text
)
from public;
revoke all
on function public.confirm_payroll_emp201_sars_allocation(
  uuid,
  text,
  timestamptz,
  text
)
from anon;
grant execute
on function public.confirm_payroll_emp201_sars_allocation(
  uuid,
  text,
  timestamptz,
  text
)
to authenticated;
comment on function public.reverse_payroll_statutory_payment(
  uuid,
  date,
  text
)
is
'Reverses an EMP201 statutory payment using a compensating posted journal. Original payment evidence remains immutable and the declaration payment state is recalculated. Reversal is blocked after SARS allocation confirmation.';
comment on function public.confirm_payroll_emp201_sars_allocation(
  uuid,
  text,
  timestamptz,
  text
)
is
'Records external evidence that SARS has allocated the EMP201 payment. Nexus requires liabilities to be fully settled before confirmation and does not infer SARS allocation automatically.';
comment on column public.payroll_emp201_declaration.sars_allocation_confirmed
is
'True only after a user records external evidence that SARS allocated the EMP201 payment.';
comment on column public.payroll_statutory_payment.reversal_journal_entry_id
is
'Compensating posted accounting journal created when the statutory payment is reversed.';
