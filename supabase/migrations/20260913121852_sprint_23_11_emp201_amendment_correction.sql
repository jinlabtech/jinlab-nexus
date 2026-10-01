-- ============================================================
-- JINLAB NEXUS
-- Sprint 23.11
-- EMP201 Amendment + Correction Workflow
-- ============================================================


-- ============================================================
-- 1. IMMUTABLE EMP201 AMENDMENT RECORD
-- ============================================================

create table if not exists public.payroll_emp201_amendment (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  declaration_id uuid not null
    references public.payroll_emp201_declaration(id)
    on delete restrict,

  amendment_number integer not null
    check (amendment_number > 0),

  reason text not null,

  prior_paye_liability numeric(14,2) not null default 0,
  prior_uif_employee numeric(14,2) not null default 0,
  prior_uif_employer numeric(14,2) not null default 0,
  prior_uif_liability numeric(14,2) not null default 0,
  prior_sdl_liability numeric(14,2) not null default 0,
  prior_eti_utilised numeric(14,2) not null default 0,
  prior_total_payable numeric(14,2) not null default 0,

  corrected_paye_liability numeric(14,2) not null default 0
    check (corrected_paye_liability >= 0),

  corrected_uif_employee numeric(14,2) not null default 0
    check (corrected_uif_employee >= 0),

  corrected_uif_employer numeric(14,2) not null default 0
    check (corrected_uif_employer >= 0),

  corrected_uif_liability numeric(14,2) not null default 0
    check (corrected_uif_liability >= 0),

  corrected_sdl_liability numeric(14,2) not null default 0
    check (corrected_sdl_liability >= 0),

  corrected_eti_utilised numeric(14,2) not null default 0
    check (corrected_eti_utilised >= 0),

  corrected_total_payable numeric(14,2) not null default 0
    check (corrected_total_payable >= 0),

  delta_paye numeric(14,2) not null default 0,
  delta_uif numeric(14,2) not null default 0,
  delta_sdl numeric(14,2) not null default 0,
  delta_total numeric(14,2) not null default 0,

  sars_prn text not null,

  submission_reference text,

  submission_channel text not null default 'efiling'
    check (
      submission_channel in (
        'efiling',
        'easyfile',
        'other'
      )
    ),

  submitted_at timestamptz not null,

  submitted_by uuid
    references auth.users(id)
    on delete set null,

  status text not null default 'submitted'
    check (
      status in (
        'submitted',
        'accepted'
      )
    ),

  acceptance_reference text,
  accepted_at timestamptz,
  accepted_by uuid
    references auth.users(id)
    on delete set null,

  acceptance_notes text,

  prior_effective_snapshot jsonb not null
    default '{}'::jsonb,

  nexus_workspace_snapshot jsonb not null
    default '{}'::jsonb,

  notes text,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  unique (
    declaration_id,
    amendment_number
  )
);
create index if not exists
payroll_emp201_amendment_company_declaration_idx
on public.payroll_emp201_amendment (
  company_id,
  declaration_id,
  amendment_number desc
);
alter table public.payroll_emp201_amendment
enable row level security;
revoke all
on table public.payroll_emp201_amendment
from anon;
revoke all
on table public.payroll_emp201_amendment
from authenticated;
-- ============================================================
-- 2. RECORD EMP201 AMENDMENT
-- ============================================================

create or replace function public.record_payroll_emp201_amendment(
  p_declaration_id uuid,

  p_corrected_paye numeric,
  p_corrected_uif_employee numeric,
  p_corrected_uif_employer numeric,
  p_corrected_sdl numeric,

  p_corrected_eti numeric,

  p_sars_prn text,

  p_reason text,

  p_submission_channel text default 'efiling',

  p_submission_reference text default null,

  p_submitted_at timestamptz default now(),

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

  v_previous public.payroll_emp201_amendment%rowtype;

  v_amendment_number integer;

  v_reason text;
  v_prn text;
  v_channel text;

  v_prior_paye numeric := 0;
  v_prior_uif_employee numeric := 0;
  v_prior_uif_employer numeric := 0;
  v_prior_uif numeric := 0;
  v_prior_sdl numeric := 0;
  v_prior_eti numeric := 0;
  v_prior_total numeric := 0;

  v_new_paye numeric := 0;
  v_new_uif_employee numeric := 0;
  v_new_uif_employer numeric := 0;
  v_new_uif numeric := 0;
  v_new_sdl numeric := 0;
  v_new_eti numeric := 0;
  v_new_total numeric := 0;

  v_delta_paye numeric := 0;
  v_delta_uif numeric := 0;
  v_delta_sdl numeric := 0;
  v_delta_total numeric := 0;

  v_workspace jsonb;

  v_prior_snapshot jsonb;

  v_id uuid;

  v_min_submission_time timestamptz;
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


  if p_submitted_at is null then
    raise exception
      'EMP201 amendment submission date/time is required.';
  end if;


  if p_submitted_at > now() then
    raise exception
      'EMP201 amendment cannot be future dated.';
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
      'A business reason for the EMP201 amendment is required.';
  end if;


  v_prn :=
    nullif(
      btrim(
        coalesce(
          p_sars_prn,
          ''
        )
      ),
      ''
    );


  if v_prn is null then
    raise exception
      'A SARS-issued PRN or amendment PRN is required.';
  end if;


  v_channel :=
    lower(
      btrim(
        coalesce(
          p_submission_channel,
          'efiling'
        )
      )
    );


  if v_channel not in (
    'efiling',
    'easyfile',
    'other'
  ) then
    raise exception
      'Unsupported EMP201 amendment submission channel.';
  end if;


  if coalesce(p_corrected_paye, 0) < 0
     or coalesce(p_corrected_uif_employee, 0) < 0
     or coalesce(p_corrected_uif_employer, 0) < 0
     or coalesce(p_corrected_sdl, 0) < 0
     or coalesce(p_corrected_eti, 0) < 0
  then
    raise exception
      'Corrected EMP201 values cannot be negative.';
  end if;


  -- ETI requires its own controlled calculation/accounting workflow.
  -- Do not silently accept an ETI adjustment yet.

  if abs(
    coalesce(
      p_corrected_eti,
      0
    )
  ) > 0.005 then

    raise exception
      'ETI amendments are not yet supported by this Nexus workflow. Do not record an ETI correction manually here.';

  end if;


  v_company_id :=
    public.current_company_id();


  -- ----------------------------------------------------------
  -- Lock original declaration
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
  -- Find latest amendment
  -- ----------------------------------------------------------

  select *
  into v_previous

  from public.payroll_emp201_amendment

  where
    company_id =
      v_company_id

    and declaration_id =
      v_declaration.id

  order by
    amendment_number desc

  limit 1;


  if v_previous.id is not null then

    v_amendment_number :=
      v_previous.amendment_number + 1;

    v_prior_paye :=
      v_previous.corrected_paye_liability;

    v_prior_uif_employee :=
      v_previous.corrected_uif_employee;

    v_prior_uif_employer :=
      v_previous.corrected_uif_employer;

    v_prior_uif :=
      v_previous.corrected_uif_liability;

    v_prior_sdl :=
      v_previous.corrected_sdl_liability;

    v_prior_eti :=
      v_previous.corrected_eti_utilised;

    v_prior_total :=
      v_previous.corrected_total_payable;

    v_min_submission_time :=
      v_previous.submitted_at;

    v_prior_snapshot :=
      jsonb_build_object(

        'source',
          'previous_amendment',

        'amendment_id',
          v_previous.id,

        'amendment_number',
          v_previous.amendment_number,

        'status',
          v_previous.status,

        'sars_prn',
          v_previous.sars_prn,

        'paye',
          v_prior_paye,

        'uif_employee',
          v_prior_uif_employee,

        'uif_employer',
          v_prior_uif_employer,

        'uif_total',
          v_prior_uif,

        'sdl',
          v_prior_sdl,

        'eti',
          v_prior_eti,

        'total',
          v_prior_total
      );

  else

    v_amendment_number :=
      1;

    v_prior_paye :=
      v_declaration.paye_liability;

    v_prior_uif_employee :=
      v_declaration.uif_employee;

    v_prior_uif_employer :=
      v_declaration.uif_employer;

    v_prior_uif :=
      v_declaration.uif_liability;

    v_prior_sdl :=
      v_declaration.sdl_liability;

    v_prior_eti :=
      v_declaration.eti_utilised;

    v_prior_total :=
      v_declaration.total_payable;

    v_min_submission_time :=
      v_declaration.submitted_at;

    v_prior_snapshot :=
      jsonb_build_object(

        'source',
          'original_declaration',

        'declaration_id',
          v_declaration.id,

        'status',
          v_declaration.status,

        'sars_prn',
          v_declaration.sars_prn,

        'sars_allocation_confirmed',
          v_declaration.sars_allocation_confirmed,

        'paye',
          v_prior_paye,

        'uif_employee',
          v_prior_uif_employee,

        'uif_employer',
          v_prior_uif_employer,

        'uif_total',
          v_prior_uif,

        'sdl',
          v_prior_sdl,

        'eti',
          v_prior_eti,

        'total',
          v_prior_total
      );

  end if;


  if p_submitted_at < v_min_submission_time then
    raise exception
      'An EMP201 amendment cannot be recorded before the declaration or previous amendment submission.';
  end if;


  -- ----------------------------------------------------------
  -- Corrected values
  -- ----------------------------------------------------------

  v_new_paye :=
    round(
      coalesce(
        p_corrected_paye,
        0
      ),
      2
    );


  v_new_uif_employee :=
    round(
      coalesce(
        p_corrected_uif_employee,
        0
      ),
      2
    );


  v_new_uif_employer :=
    round(
      coalesce(
        p_corrected_uif_employer,
        0
      ),
      2
    );


  v_new_uif :=
    round(
      v_new_uif_employee
      +
      v_new_uif_employer,
      2
    );


  v_new_sdl :=
    round(
      coalesce(
        p_corrected_sdl,
        0
      ),
      2
    );


  v_new_eti :=
    0;


  v_new_total :=
    round(
      greatest(
        v_new_paye
        +
        v_new_uif
        +
        v_new_sdl
        -
        v_new_eti,
        0
      ),
      2
    );


  v_delta_paye :=
    round(
      v_new_paye
      -
      v_prior_paye,
      2
    );


  v_delta_uif :=
    round(
      v_new_uif
      -
      v_prior_uif,
      2
    );


  v_delta_sdl :=
    round(
      v_new_sdl
      -
      v_prior_sdl,
      2
    );


  v_delta_total :=
    round(
      v_new_total
      -
      v_prior_total,
      2
    );


  if abs(v_delta_paye) <= 0.005
     and abs(v_delta_uif) <= 0.005
     and abs(v_delta_sdl) <= 0.005
     and abs(v_delta_total) <= 0.005
  then

    raise exception
      'The amendment does not change the effective EMP201 liabilities.';

  end if;


  -- ----------------------------------------------------------
  -- Capture current Nexus calculation as evidence only.
  --
  -- The amendment is not silently forced to match this
  -- workspace because the external correction may itself
  -- be the reason the discrepancy is being investigated.
  -- ----------------------------------------------------------

  v_workspace :=
    public.get_payroll_emp201_workspace(
      v_declaration.period_month
    );


  -- ----------------------------------------------------------
  -- Insert immutable amendment
  -- ----------------------------------------------------------

  insert into public.payroll_emp201_amendment (
    company_id,
    declaration_id,
    amendment_number,

    reason,

    prior_paye_liability,
    prior_uif_employee,
    prior_uif_employer,
    prior_uif_liability,
    prior_sdl_liability,
    prior_eti_utilised,
    prior_total_payable,

    corrected_paye_liability,
    corrected_uif_employee,
    corrected_uif_employer,
    corrected_uif_liability,
    corrected_sdl_liability,
    corrected_eti_utilised,
    corrected_total_payable,

    delta_paye,
    delta_uif,
    delta_sdl,
    delta_total,

    sars_prn,

    submission_reference,
    submission_channel,

    submitted_at,
    submitted_by,

    status,

    prior_effective_snapshot,
    nexus_workspace_snapshot,

    notes
  )
  values (
    v_company_id,
    v_declaration.id,
    v_amendment_number,

    v_reason,

    v_prior_paye,
    v_prior_uif_employee,
    v_prior_uif_employer,
    v_prior_uif,
    v_prior_sdl,
    v_prior_eti,
    v_prior_total,

    v_new_paye,
    v_new_uif_employee,
    v_new_uif_employer,
    v_new_uif,
    v_new_sdl,
    v_new_eti,
    v_new_total,

    v_delta_paye,
    v_delta_uif,
    v_delta_sdl,
    v_delta_total,

    v_prn,

    nullif(
      btrim(
        coalesce(
          p_submission_reference,
          ''
        )
      ),
      ''
    ),

    v_channel,

    p_submitted_at,
    auth.uid(),

    'submitted',

    v_prior_snapshot,
    v_workspace,

    nullif(
      btrim(
        coalesce(
          p_notes,
          ''
        )
      ),
      ''
    )
  )
  returning id
  into v_id;


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

    'emp201_amendment_recorded',

    'payroll',

    v_id,

    'EMP201 amendment submission evidence recorded without changing the original declaration.',

    jsonb_build_object(

      'declaration_id',
        v_declaration.id,

      'period_month',
        v_declaration.period_month,

      'amendment_number',
        v_amendment_number,

      'reason',
        v_reason,

      'sars_prn',
        v_prn,

      'prior_total',
        v_prior_total,

      'corrected_total',
        v_new_total,

      'delta_total',
        v_delta_total,

      'original_allocation_confirmed',
        v_declaration.sars_allocation_confirmed,

      'submitted_by_nexus',
        false
    )
  );


  return jsonb_build_object(

    'ok',
      true,

    'amendment_id',
      v_id,

    'declaration_id',
      v_declaration.id,

    'period_month',
      v_declaration.period_month,

    'amendment_number',
      v_amendment_number,

    'status',
      'submitted',

    'reason',
      v_reason,

    'sars_prn',
      v_prn,

    'prior',
      jsonb_build_object(

        'paye',
          v_prior_paye,

        'uif',
          v_prior_uif,

        'sdl',
          v_prior_sdl,

        'total',
          v_prior_total
      ),

    'corrected',
      jsonb_build_object(

        'paye',
          v_new_paye,

        'uif_employee',
          v_new_uif_employee,

        'uif_employer',
          v_new_uif_employer,

        'uif',
          v_new_uif,

        'sdl',
          v_new_sdl,

        'eti',
          v_new_eti,

        'total',
          v_new_total
      ),

    'delta',
      jsonb_build_object(

        'paye',
          v_delta_paye,

        'uif',
          v_delta_uif,

        'sdl',
          v_delta_sdl,

        'total',
          v_delta_total
      ),

    'original_declaration_unchanged',
      true,

    'accounting_changed',
      false,

    'submitted_by_nexus',
      false

  );

end;
$$;
-- ============================================================
-- 3. CONFIRM SARS ACCEPTANCE OF AMENDMENT
-- ============================================================

create or replace function public.confirm_payroll_emp201_amendment_acceptance(
  p_amendment_id uuid,
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

  v_amendment public.payroll_emp201_amendment%rowtype;

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
    'payroll.view'
  ) then
    raise exception
      'Permission denied: payroll.view';
  end if;


  if p_confirmed_at is null then
    raise exception
      'SARS amendment acceptance date/time is required.';
  end if;


  if p_confirmed_at > now() then
    raise exception
      'SARS amendment acceptance cannot be future dated.';
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
      'A SARS amendment acceptance reference or evidence reference is required.';
  end if;


  v_company_id :=
    public.current_company_id();


  select *
  into v_amendment

  from public.payroll_emp201_amendment

  where
    id =
      p_amendment_id

    and company_id =
      v_company_id

  for update;


  if v_amendment.id is null then
    raise exception
      'EMP201 amendment could not be found.';
  end if;


  if v_amendment.status = 'accepted' then

    if v_amendment.acceptance_reference =
       v_reference then

      return jsonb_build_object(

        'ok',
          true,

        'already_confirmed',
          true,

        'amendment_id',
          v_amendment.id,

        'declaration_id',
          v_amendment.declaration_id,

        'amendment_number',
          v_amendment.amendment_number,

        'confirmation_reference',
          v_amendment.acceptance_reference,

        'accepted_at',
          v_amendment.accepted_at,

        'status',
          v_amendment.status

      );

    end if;


    raise exception
      'This EMP201 amendment was already accepted with a different evidence reference.';

  end if;


  if p_confirmed_at <
     v_amendment.submitted_at
  then

    raise exception
      'SARS amendment acceptance cannot be before amendment submission.';

  end if;


  update public.payroll_emp201_amendment
  set
    status =
      'accepted',

    acceptance_reference =
      v_reference,

    accepted_at =
      p_confirmed_at,

    accepted_by =
      auth.uid(),

    acceptance_notes =
      nullif(
        btrim(
          coalesce(
            p_notes,
            ''
          )
        ),
        ''
      ),

    updated_at =
      now()

  where id =
    v_amendment.id;


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

    'emp201_amendment_accepted',

    'payroll',

    v_amendment.id,

    'External evidence that SARS accepted the EMP201 amendment was recorded.',

    jsonb_build_object(

      'declaration_id',
        v_amendment.declaration_id,

      'amendment_number',
        v_amendment.amendment_number,

      'sars_prn',
        v_amendment.sars_prn,

      'confirmation_reference',
        v_reference,

      'confirmed_at',
        p_confirmed_at,

      'delta_total',
        v_amendment.delta_total
    )
  );


  return jsonb_build_object(

    'ok',
      true,

    'already_confirmed',
      false,

    'amendment_id',
      v_amendment.id,

    'declaration_id',
      v_amendment.declaration_id,

    'amendment_number',
      v_amendment.amendment_number,

    'confirmation_reference',
      v_reference,

    'accepted_at',
      p_confirmed_at,

    'status',
      'accepted',

    'effective_total_payable',
      v_amendment.corrected_total_payable,

    'delta_total',
      v_amendment.delta_total

  );

end;
$$;
-- ============================================================
-- 4. AMENDMENT / CORRECTION CONTROL WORKSPACE
-- ============================================================

create or replace function public.get_payroll_emp201_amendment_control(
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

  v_declaration public.payroll_emp201_declaration%rowtype;

  v_latest public.payroll_emp201_amendment%rowtype;

  v_base_control jsonb;

  v_effective_paye numeric := 0;
  v_effective_uif numeric := 0;
  v_effective_sdl numeric := 0;
  v_effective_total numeric := 0;

  v_paid_paye numeric := 0;
  v_paid_uif numeric := 0;
  v_paid_sdl numeric := 0;
  v_paid_total numeric := 0;

  v_balance_paye numeric := 0;
  v_balance_uif numeric := 0;
  v_balance_sdl numeric := 0;
  v_balance_total numeric := 0;
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


  v_base_control :=
    public.get_payroll_emp201_filing_control(
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

      'filing_control',
        v_base_control,

      'amendments',
        '[]'::jsonb,

      'effective_liability',
        null,

      'settlement_position',
        null,

      'control',
        jsonb_build_object(

          'amendment_exists',
            false,

          'next_action',
            'No submitted EMP201 declaration exists for this period.'

        )
    );

  end if;


  select *
  into v_latest

  from public.payroll_emp201_amendment

  where
    company_id =
      v_company_id

    and declaration_id =
      v_declaration.id

  order by
    amendment_number desc

  limit 1;


  if v_latest.id is not null then

    v_effective_paye :=
      v_latest.corrected_paye_liability;

    v_effective_uif :=
      v_latest.corrected_uif_liability;

    v_effective_sdl :=
      v_latest.corrected_sdl_liability;

    v_effective_total :=
      v_latest.corrected_total_payable;

  else

    v_effective_paye :=
      v_declaration.paye_liability;

    v_effective_uif :=
      v_declaration.uif_liability;

    v_effective_sdl :=
      v_declaration.sdl_liability;

    v_effective_total :=
      v_declaration.total_payable;

  end if;


  -- ----------------------------------------------------------
  -- Actual active statutory payments already recorded
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


  v_paid_total :=
    round(
      v_paid_paye
      +
      v_paid_uif
      +
      v_paid_sdl,
      2
    );


  -- Signed balance:
  --
  -- positive = more still payable
  -- zero     = fully matched
  -- negative = possible overpayment / SARS credit

  v_balance_paye :=
    round(
      v_effective_paye
      -
      v_paid_paye,
      2
    );


  v_balance_uif :=
    round(
      v_effective_uif
      -
      v_paid_uif,
      2
    );


  v_balance_sdl :=
    round(
      v_effective_sdl
      -
      v_paid_sdl,
      2
    );


  v_balance_total :=
    round(
      v_effective_total
      -
      v_paid_total,
      2
    );


  return jsonb_build_object(

    'ok',
      true,

    'period_month',
      v_month_start,

    'filing_control',
      v_base_control,


    'original_declaration',
      jsonb_build_object(

        'id',
          v_declaration.id,

        'status',
          v_declaration.status,

        'sars_prn',
          v_declaration.sars_prn,

        'allocation_confirmed',
          v_declaration.sars_allocation_confirmed,

        'original_total_payable',
          v_declaration.total_payable
      ),


    'amendments',
      coalesce(
        (
          select jsonb_agg(

            jsonb_build_object(

              'id',
                a.id,

              'amendment_number',
                a.amendment_number,

              'reason',
                a.reason,

              'status',
                a.status,

              'sars_prn',
                a.sars_prn,

              'submitted_at',
                a.submitted_at,

              'acceptance_reference',
                a.acceptance_reference,

              'accepted_at',
                a.accepted_at,

              'prior_total',
                a.prior_total_payable,

              'corrected_total',
                a.corrected_total_payable,

              'delta',
                jsonb_build_object(

                  'paye',
                    a.delta_paye,

                  'uif',
                    a.delta_uif,

                  'sdl',
                    a.delta_sdl,

                  'total',
                    a.delta_total
                )

            )

            order by
              a.amendment_number
          )

          from public.payroll_emp201_amendment a

          where
            a.company_id =
              v_company_id

            and a.declaration_id =
              v_declaration.id
        ),
        '[]'::jsonb
      ),


    'effective_liability',
      jsonb_build_object(

        'source',
          case
            when v_latest.id is null
              then 'original_declaration'
            else 'latest_amendment'
          end,

        'amendment_id',
          v_latest.id,

        'amendment_number',
          v_latest.amendment_number,

        'amendment_status',
          v_latest.status,

        'paye',
          v_effective_paye,

        'uif',
          v_effective_uif,

        'sdl',
          v_effective_sdl,

        'total',
          v_effective_total
      ),


    'settlement_position',
      jsonb_build_object(

        'payments_recorded',
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
              v_paid_total
          ),

        'balance',
          jsonb_build_object(

            'paye',
              v_balance_paye,

            'uif',
              v_balance_uif,

            'sdl',
              v_balance_sdl,

            'total',
              v_balance_total
          ),

        'position',
          case

            when v_balance_total > 0.005
              then 'additional_payment_required'

            when v_balance_total < -0.005
              then 'possible_sars_credit_or_refund'

            else 'settled'

          end
      ),


    'control',
      jsonb_build_object(

        'amendment_exists',
          v_latest.id is not null,

        'latest_amendment_accepted',
          coalesce(
            v_latest.status = 'accepted',
            false
          ),

        'original_history_preserved',
          true,

        'accounting_auto_changed',
          false,

        'next_action',
          case

            when v_latest.id is null
              then 'No amendment has been recorded.'

            when v_latest.status <> 'accepted'
              then 'Confirm external SARS acceptance of the latest amendment when evidence is available.'

            when v_balance_total > 0.005
              then 'The accepted amendment increases the effective liability. Additional statutory settlement is required.'

            when v_balance_total < -0.005
              then 'The accepted amendment creates a possible SARS credit or refund position. Do not automatically reverse bank or liability entries.'

            else 'The accepted amendment matches the statutory payments already recorded.'

          end
      )

  );

end;
$$;
-- ============================================================
-- 5. SECURITY
-- ============================================================

revoke all
on function public.record_payroll_emp201_amendment(
  uuid,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  text,
  text,
  text,
  timestamptz,
  text
)
from public;
revoke all
on function public.record_payroll_emp201_amendment(
  uuid,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  text,
  text,
  text,
  timestamptz,
  text
)
from anon;
grant execute
on function public.record_payroll_emp201_amendment(
  uuid,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  text,
  text,
  text,
  timestamptz,
  text
)
to authenticated;
revoke all
on function public.confirm_payroll_emp201_amendment_acceptance(
  uuid,
  text,
  timestamptz,
  text
)
from public;
revoke all
on function public.confirm_payroll_emp201_amendment_acceptance(
  uuid,
  text,
  timestamptz,
  text
)
from anon;
grant execute
on function public.confirm_payroll_emp201_amendment_acceptance(
  uuid,
  text,
  timestamptz,
  text
)
to authenticated;
revoke all
on function public.get_payroll_emp201_amendment_control(date)
from public;
revoke all
on function public.get_payroll_emp201_amendment_control(date)
from anon;
grant execute
on function public.get_payroll_emp201_amendment_control(date)
to authenticated;
comment on table public.payroll_emp201_amendment
is
'Immutable EMP201 amendment history. Original declaration and prior amendments remain unchanged; each correction records the previous effective values, corrected liabilities, delta and external SARS evidence.';
comment on function public.record_payroll_emp201_amendment(
  uuid,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  text,
  text,
  text,
  timestamptz,
  text
)
is
'Records external EMP201 amendment evidence without changing the original declaration or accounting journals. Calculates the liability delta against the previous effective declaration state.';
comment on function public.confirm_payroll_emp201_amendment_acceptance(
  uuid,
  text,
  timestamptz,
  text
)
is
'Records evidence that SARS accepted an EMP201 amendment. Acceptance is distinct from submission and does not automatically move cash or change accounting.';
comment on function public.get_payroll_emp201_amendment_control(date)
is
'Shows the complete EMP201 correction chain, latest effective liability and signed settlement position while preserving original SARS and accounting history.';
