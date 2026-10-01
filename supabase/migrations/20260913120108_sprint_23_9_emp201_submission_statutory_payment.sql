-- ============================================================
-- JINLAB NEXUS
-- Sprint 23.9
-- EMP201 Submission Evidence + Statutory Payment
-- ============================================================


-- ============================================================
-- 1. EMP201 SUBMISSION EVIDENCE
-- ============================================================

create table if not exists public.payroll_emp201_declaration (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  period_month date not null,

  tax_year integer not null,

  paye_liability numeric(14,2) not null default 0
    check (paye_liability >= 0),

  uif_employee numeric(14,2) not null default 0
    check (uif_employee >= 0),

  uif_employer numeric(14,2) not null default 0
    check (uif_employer >= 0),

  uif_liability numeric(14,2) not null default 0
    check (uif_liability >= 0),

  sdl_liability numeric(14,2) not null default 0
    check (sdl_liability >= 0),

  eti_utilised numeric(14,2) not null default 0
    check (eti_utilised >= 0),

  total_payable numeric(14,2) not null default 0
    check (total_payable >= 0),

  due_date date not null,

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
        'payment_partially_recorded',
        'payment_recorded'
      )
    ),

  workspace_snapshot jsonb not null default '{}'::jsonb,

  notes text,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  unique (
    company_id,
    period_month
  )
);
create index if not exists
payroll_emp201_declaration_company_period_idx
on public.payroll_emp201_declaration (
  company_id,
  period_month desc
);
alter table public.payroll_emp201_declaration
enable row level security;
revoke all
on table public.payroll_emp201_declaration
from anon;
revoke all
on table public.payroll_emp201_declaration
from authenticated;
-- ============================================================
-- 2. EMP201 / SARS PAYMENT EVIDENCE
-- ============================================================

create table if not exists public.payroll_statutory_payment (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  declaration_id uuid not null
    references public.payroll_emp201_declaration(id)
    on delete restrict,

  payment_date date not null,

  paye_amount numeric(14,2) not null default 0
    check (paye_amount >= 0),

  uif_amount numeric(14,2) not null default 0
    check (uif_amount >= 0),

  sdl_amount numeric(14,2) not null default 0
    check (sdl_amount >= 0),

  total_amount numeric(14,2) not null
    check (total_amount > 0),

  payment_method text not null
    check (
      payment_method in (
        'eft',
        'bank',
        'efiling',
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

  notes text,

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
  ),

  check (
    round(
      paye_amount
      + uif_amount
      + sdl_amount,
      2
    )
    =
    round(
      total_amount,
      2
    )
  )
);
create index if not exists
payroll_statutory_payment_declaration_idx
on public.payroll_statutory_payment (
  company_id,
  declaration_id
);
alter table public.payroll_statutory_payment
enable row level security;
revoke all
on table public.payroll_statutory_payment
from anon;
revoke all
on table public.payroll_statutory_payment
from authenticated;
-- ============================================================
-- 3. RECORD EMP201 SUBMISSION EVIDENCE
-- ============================================================

create or replace function public.record_payroll_emp201_submission(
  p_month date,
  p_sars_prn text,
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

  v_month_start date;

  v_workspace jsonb;

  v_ready boolean := false;

  v_tax_year integer;

  v_paye numeric := 0;
  v_uif_employee numeric := 0;
  v_uif_employer numeric := 0;
  v_uif_total numeric := 0;
  v_sdl numeric := 0;
  v_eti numeric := 0;
  v_total numeric := 0;

  v_due_date date;

  v_prn text;
  v_channel text;

  v_existing public.payroll_emp201_declaration%rowtype;
  v_id uuid;
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


  if p_month is null then
    raise exception
      'EMP201 month is required.';
  end if;


  if p_submitted_at is null then
    raise exception
      'Submission date/time is required.';
  end if;


  if p_submitted_at > now() then
    raise exception
      'EMP201 submission cannot be future dated.';
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
      'A SARS-issued EMP201 Payment Reference Number (PRN) is required.';
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
      'Unsupported EMP201 submission channel.';
  end if;


  v_company_id :=
    public.current_company_id();


  v_month_start :=
    date_trunc(
      'month',
      p_month
    )::date;


  -- ----------------------------------------------------------
  -- Current compliance state
  -- ----------------------------------------------------------

  v_workspace :=
    public.get_payroll_emp201_workspace(
      v_month_start
    );


  v_ready :=
    coalesce(
      (
        v_workspace
        #>>
        '{readiness,financial_data_ready}'
      )::boolean,
      false
    );


  if not v_ready then
    raise exception
      'EMP201 is not ready for submission. Resolve Nexus compliance blockers first: %',
      coalesce(
        v_workspace
        #>
        '{readiness,blockers}',
        '[]'::jsonb
      )::text;
  end if;


  v_tax_year :=
    nullif(
      v_workspace
      #>>
      '{period,tax_year}',
      ''
    )::integer;


  v_paye :=
    coalesce(
      nullif(
        v_workspace
        #>>
        '{emp201,paye}',
        ''
      )::numeric,
      0
    );


  v_uif_employee :=
    coalesce(
      nullif(
        v_workspace
        #>>
        '{emp201,uif_employee}',
        ''
      )::numeric,
      0
    );


  v_uif_employer :=
    coalesce(
      nullif(
        v_workspace
        #>>
        '{emp201,uif_employer}',
        ''
      )::numeric,
      0
    );


  v_uif_total :=
    coalesce(
      nullif(
        v_workspace
        #>>
        '{emp201,uif_total}',
        ''
      )::numeric,
      0
    );


  v_sdl :=
    coalesce(
      nullif(
        v_workspace
        #>>
        '{emp201,sdl}',
        ''
      )::numeric,
      0
    );


  v_eti :=
    coalesce(
      nullif(
        v_workspace
        #>>
        '{emp201,eti}',
        ''
      )::numeric,
      0
    );


  if abs(v_eti) > 0.005 then
    raise exception
      'Automatic ETI submission is not supported in Sprint 23.9.';
  end if;


  v_total :=
    round(
      coalesce(
        nullif(
          v_workspace
          #>>
          '{emp201,total_before_eti}',
          ''
        )::numeric,
        0
      ),
      2
    );


  v_due_date :=
    nullif(
      v_workspace
      #>>
      '{period,weekend_adjusted_due_date}',
      ''
    )::date;


  -- ----------------------------------------------------------
  -- Existing submission protection
  -- ----------------------------------------------------------

  select *
  into v_existing

  from public.payroll_emp201_declaration

  where
    company_id =
      v_company_id

    and period_month =
      v_month_start

  for update;


  if v_existing.id is not null then

    if v_existing.sars_prn = v_prn then

      return jsonb_build_object(

        'ok',
          true,

        'already_recorded',
          true,

        'declaration_id',
          v_existing.id,

        'period_month',
          v_existing.period_month,

        'sars_prn',
          v_existing.sars_prn,

        'status',
          v_existing.status,

        'total_payable',
          v_existing.total_payable
      );

    end if;


    raise exception
      'An EMP201 submission is already recorded for this month. A different PRN requires an amendment workflow rather than overwriting history.';

  end if;


  -- ----------------------------------------------------------
  -- Record SARS submission evidence
  -- ----------------------------------------------------------

  insert into public.payroll_emp201_declaration (
    company_id,
    period_month,
    tax_year,

    paye_liability,

    uif_employee,
    uif_employer,
    uif_liability,

    sdl_liability,

    eti_utilised,

    total_payable,

    due_date,

    sars_prn,

    submission_reference,
    submission_channel,

    submitted_at,
    submitted_by,

    status,

    workspace_snapshot,

    notes
  )
  values (
    v_company_id,
    v_month_start,
    v_tax_year,

    round(
      v_paye,
      2
    ),

    round(
      v_uif_employee,
      2
    ),

    round(
      v_uif_employer,
      2
    ),

    round(
      v_uif_total,
      2
    ),

    round(
      v_sdl,
      2
    ),

    round(
      v_eti,
      2
    ),

    v_total,

    v_due_date,

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

    'emp201_submission_recorded',

    'payroll',

    v_id,

    'EMP201 submission evidence recorded in Nexus.',

    jsonb_build_object(

      'period_month',
        v_month_start,

      'sars_prn',
        v_prn,

      'submission_channel',
        v_channel,

      'submitted_at',
        p_submitted_at,

      'paye',
        round(
          v_paye,
          2
        ),

      'uif',
        round(
          v_uif_total,
          2
        ),

      'sdl',
        round(
          v_sdl,
          2
        ),

      'total_payable',
        v_total,

      'submitted_by_nexus',
        false
    )
  );


  return jsonb_build_object(

    'ok',
      true,

    'already_recorded',
      false,

    'declaration_id',
      v_id,

    'period_month',
      v_month_start,

    'tax_year',
      v_tax_year,

    'sars_prn',
      v_prn,

    'submission_channel',
      v_channel,

    'submitted_at',
      p_submitted_at,

    'due_date',
      v_due_date,

    'liabilities',
      jsonb_build_object(

        'paye',
          round(
            v_paye,
            2
          ),

        'uif',
          round(
            v_uif_total,
            2
          ),

        'sdl',
          round(
            v_sdl,
            2
          ),

        'total',
          v_total
      ),

    'status',
      'submitted',

    'submitted_by_nexus',
      false
  );

end;
$$;
-- ============================================================
-- 4. RECORD ACTUAL SARS PAYMENT
-- ============================================================

create or replace function public.record_payroll_statutory_payment(
  p_declaration_id uuid,

  p_payment_date date,

  p_paye_amount numeric,
  p_uif_amount numeric,
  p_sdl_amount numeric,

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

  v_declaration public.payroll_emp201_declaration%rowtype;

  v_mapping public.payroll_accounting_mapping%rowtype;

  v_funding public.accounting_account%rowtype;

  v_existing public.payroll_statutory_payment%rowtype;

  v_payment_id uuid;
  v_journal_id uuid;
  v_entry_number text;

  v_paye numeric := 0;
  v_uif numeric := 0;
  v_sdl numeric := 0;
  v_total numeric := 0;

  v_paid_paye numeric := 0;
  v_paid_uif numeric := 0;
  v_paid_sdl numeric := 0;

  v_remaining_paye numeric := 0;
  v_remaining_uif numeric := 0;
  v_remaining_sdl numeric := 0;
  v_remaining_total numeric := 0;

  v_method text;
  v_key text;
  v_reference text;

  v_line_number integer := 1;

  v_post_result jsonb;
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
      'Statutory payment date is required.';
  end if;


  if p_payment_date > current_date then
    raise exception
      'Statutory payment cannot be future dated.';
  end if;


  v_paye :=
    round(
      greatest(
        coalesce(
          p_paye_amount,
          0
        ),
        0
      ),
      2
    );


  v_uif :=
    round(
      greatest(
        coalesce(
          p_uif_amount,
          0
        ),
        0
      ),
      2
    );


  v_sdl :=
    round(
      greatest(
        coalesce(
          p_sdl_amount,
          0
        ),
        0
      ),
      2
    );


  v_total :=
    round(
      v_paye
      + v_uif
      + v_sdl,
      2
    );


  if v_total <= 0 then
    raise exception
      'Statutory payment amount must be greater than zero.';
  end if;


  v_method :=
    lower(
      btrim(
        coalesce(
          p_payment_method,
          ''
        )
      )
    );


  if v_method not in (
    'eft',
    'bank',
    'efiling',
    'other'
  ) then
    raise exception
      'Unsupported statutory payment method.';
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
  -- Duplicate click / retry protection
  -- ----------------------------------------------------------

  select *
  into v_existing

  from public.payroll_statutory_payment

  where
    company_id =
      v_company_id

    and idempotency_key =
      v_key

  limit 1;


  if v_existing.id is not null then

    return jsonb_build_object(

      'ok',
        true,

      'already_recorded',
        true,

      'payment_id',
        v_existing.id,

      'declaration_id',
        v_existing.declaration_id,

      'payment_date',
        v_existing.payment_date,

      'total_amount',
        v_existing.total_amount,

      'journal_entry_id',
        v_existing.journal_entry_id
    );

  end if;


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
  -- Existing statutory payments
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


  if v_paye >
     v_remaining_paye + 0.005 then

    raise exception
      'PAYE payment % exceeds remaining PAYE liability %.',
      v_paye,
      v_remaining_paye;

  end if;


  if v_uif >
     v_remaining_uif + 0.005 then

    raise exception
      'UIF payment % exceeds remaining UIF liability %.',
      v_uif,
      v_remaining_uif;

  end if;


  if v_sdl >
     v_remaining_sdl + 0.005 then

    raise exception
      'SDL payment % exceeds remaining SDL liability %.',
      v_sdl,
      v_remaining_sdl;

  end if;


  -- ----------------------------------------------------------
  -- Funding account
  -- ----------------------------------------------------------

  select *
  into v_funding

  from public.accounting_account

  where
    id =
      p_funding_account_id

    and company_id =
      v_company_id

    and is_active =
      true;


  if v_funding.id is null then
    raise exception
      'Funding account could not be found.';
  end if;


  if v_funding.account_type <> 'asset'
     or v_funding.account_subtype
        not in (
          'bank',
          'cash'
        )
  then

    raise exception
      'Statutory liabilities must be settled from an active bank or cash account.';

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
  -- Payroll statutory mappings
  -- ----------------------------------------------------------

  perform public.ensure_payroll_accounting_defaults(
    v_company_id
  );


  select *
  into v_mapping

  from public.payroll_accounting_mapping

  where company_id =
    v_company_id;


  if v_paye > 0
     and v_mapping.paye_payable_account_id is null
  then
    raise exception
      'PAYE Payable account is not configured.';
  end if;


  if v_uif > 0
     and v_mapping.uif_payable_account_id is null
  then
    raise exception
      'UIF Payable account is not configured.';
  end if;


  if v_sdl > 0
     and v_mapping.sdl_payable_account_id is null
  then
    raise exception
      'SDL Payable account is not configured.';
  end if;


  -- ----------------------------------------------------------
  -- Payment evidence
  -- ----------------------------------------------------------

  insert into public.payroll_statutory_payment (
    company_id,
    declaration_id,
    payment_date,

    paye_amount,
    uif_amount,
    sdl_amount,

    total_amount,

    payment_method,

    funding_account_id,
    company_bank_account_id,

    reference,

    idempotency_key,

    status,

    notes,

    created_by
  )
  values (
    v_company_id,
    v_declaration.id,
    p_payment_date,

    v_paye,
    v_uif,
    v_sdl,

    v_total,

    v_method,

    v_funding.id,
    p_company_bank_account_id,

    coalesce(
      v_reference,
      v_declaration.sars_prn
    ),

    v_key,

    'posted',

    nullif(
      btrim(
        coalesce(
          p_notes,
          ''
        )
      ),
      ''
    ),

    auth.uid()
  )
  returning id
  into v_payment_id;


  -- ----------------------------------------------------------
  -- Accounting journal
  --
  -- DR PAYE / UIF / SDL Payables
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
    null,

    v_entry_number,
    p_payment_date,

    'EMP201 statutory payment - ' ||
    to_char(
      v_declaration.period_month,
      'YYYY-MM'
    ),

    coalesce(
      v_reference,
      v_declaration.sars_prn
    ),

    'payroll',
    v_payment_id,
    'emp201_payment',

    'ZAR',

    'draft',

    v_total,
    v_total,

    auth.uid(),

    'not_required'
  )
  returning id
  into v_journal_id;


  -- PAYE

  if v_paye > 0 then

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
      'EMP201 PAYE settlement',
      v_paye,
      0,
      jsonb_build_object(
        'source',
          'emp201_payment',

        'declaration_id',
          v_declaration.id,

        'payment_id',
          v_payment_id,

        'sars_prn',
          v_declaration.sars_prn
      )
    );

    v_line_number :=
      v_line_number + 1;

  end if;


  -- UIF

  if v_uif > 0 then

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
      'EMP201 UIF settlement',
      v_uif,
      0,
      jsonb_build_object(
        'source',
          'emp201_payment',

        'declaration_id',
          v_declaration.id,

        'payment_id',
          v_payment_id,

        'sars_prn',
          v_declaration.sars_prn
      )
    );

    v_line_number :=
      v_line_number + 1;

  end if;


  -- SDL

  if v_sdl > 0 then

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
      'EMP201 SDL settlement',
      v_sdl,
      0,
      jsonb_build_object(
        'source',
          'emp201_payment',

        'declaration_id',
          v_declaration.id,

        'payment_id',
          v_payment_id,

        'sars_prn',
          v_declaration.sars_prn
      )
    );

    v_line_number :=
      v_line_number + 1;

  end if;


  -- Funding credit

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
    v_funding.id,
    v_line_number,
    'EMP201 statutory payment funding',
    0,
    v_total,
    jsonb_build_object(
      'source',
        'emp201_payment',

      'declaration_id',
        v_declaration.id,

      'payment_id',
        v_payment_id,

      'sars_prn',
        v_declaration.sars_prn,

      'company_bank_account_id',
        p_company_bank_account_id
    )
  );


  v_post_result :=
    public.post_journal_entry(
      v_journal_id
    );


  update public.payroll_statutory_payment
  set
    journal_entry_id =
      v_journal_id
  where id =
    v_payment_id;


  -- ----------------------------------------------------------
  -- Recalculate declaration payment state
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
      + v_remaining_uif
      + v_remaining_sdl,
      2
    );


  update public.payroll_emp201_declaration
  set
    status =
      case

        when v_remaining_total <= 0.005
          then 'payment_recorded'

        else 'payment_partially_recorded'

      end,

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

    'emp201_payment_recorded',

    'payroll',

    v_payment_id,

    'EMP201 statutory payment recorded and posted to the accounting ledger.',

    jsonb_build_object(

      'declaration_id',
        v_declaration.id,

      'period_month',
        v_declaration.period_month,

      'sars_prn',
        v_declaration.sars_prn,

      'payment_date',
        p_payment_date,

      'paye_amount',
        v_paye,

      'uif_amount',
        v_uif,

      'sdl_amount',
        v_sdl,

      'total_amount',
        v_total,

      'journal_entry_id',
        v_journal_id,

      'remaining_paye',
        v_remaining_paye,

      'remaining_uif',
        v_remaining_uif,

      'remaining_sdl',
        v_remaining_sdl,

      'remaining_total',
        v_remaining_total,

      'sars_allocation_confirmed',
        false
    )
  );


  return jsonb_build_object(

    'ok',
      true,

    'already_recorded',
      false,

    'payment_id',
      v_payment_id,

    'declaration_id',
      v_declaration.id,

    'period_month',
      v_declaration.period_month,

    'sars_prn',
      v_declaration.sars_prn,

    'payment_date',
      p_payment_date,

    'allocations',
      jsonb_build_object(

        'paye',
          v_paye,

        'uif',
          v_uif,

        'sdl',
          v_sdl,

        'total',
          v_total
      ),

    'journal_entry_id',
      v_journal_id,

    'journal_number',
      v_entry_number,

    'accounting_post',
      v_post_result,

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

    'payment_fully_recorded',
      v_remaining_total <= 0.005,

    'sars_allocation_confirmed',
      false
  );

end;
$$;
-- ============================================================
-- 5. EMP201 FILING + PAYMENT CONTROL WORKSPACE
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
      + v_remaining_uif
      + v_remaining_sdl,
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
                p.journal_entry_id

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
                + v_paid_uif
                + v_paid_sdl,
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
            + v_paid_uif
            + v_paid_sdl
          ) > 0,

        'fully_recorded',
          v_remaining_total <= 0.005,

        'sars_allocation_confirmed',
          false,

        'overdue',
          current_date >
          v_declaration.due_date

          and
          v_remaining_total > 0.005,

        'next_action',
          case

            when v_remaining_total > 0.005
              then 'Record the actual SARS payment against the outstanding PAYE/UIF/SDL liabilities.'

            else 'Payment is recorded in Nexus. Confirm allocation on the SARS employer account before final compliance closure.'

          end
      )

  );

end;
$$;
-- ============================================================
-- 6. SECURITY
-- ============================================================

revoke all
on function public.record_payroll_emp201_submission(
  date,
  text,
  text,
  text,
  timestamptz,
  text
)
from public;
revoke all
on function public.record_payroll_emp201_submission(
  date,
  text,
  text,
  text,
  timestamptz,
  text
)
from anon;
grant execute
on function public.record_payroll_emp201_submission(
  date,
  text,
  text,
  text,
  timestamptz,
  text
)
to authenticated;
revoke all
on function public.record_payroll_statutory_payment(
  uuid,
  date,
  numeric,
  numeric,
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
on function public.record_payroll_statutory_payment(
  uuid,
  date,
  numeric,
  numeric,
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
on function public.record_payroll_statutory_payment(
  uuid,
  date,
  numeric,
  numeric,
  numeric,
  uuid,
  text,
  text,
  text,
  uuid,
  text
)
to authenticated;
revoke all
on function public.get_payroll_emp201_filing_control(date)
from public;
revoke all
on function public.get_payroll_emp201_filing_control(date)
from anon;
grant execute
on function public.get_payroll_emp201_filing_control(date)
to authenticated;
comment on table public.payroll_emp201_declaration
is
'Immutable Nexus evidence that an EMP201 declaration was submitted externally. Nexus records the SARS-issued PRN and calculated liabilities but does not claim to transmit the EMP201 to SARS.';
comment on table public.payroll_statutory_payment
is
'Accounting-backed evidence of actual PAYE/UIF/SDL payments associated with a recorded EMP201 declaration.';
comment on function public.record_payroll_emp201_submission(
  date,
  text,
  text,
  text,
  timestamptz,
  text
)
is
'Records EMP201 submission evidence only after Nexus compliance readiness passes. The SARS PRN must come from SARS; Nexus does not create it.';
comment on function public.record_payroll_statutory_payment(
  uuid,
  date,
  numeric,
  numeric,
  numeric,
  uuid,
  text,
  text,
  text,
  uuid,
  text
)
is
'Records an actual EMP201 statutory payment and posts PAYE/UIF/SDL liability settlement to Bank/Cash with idempotency and overpayment protection.';
comment on function public.get_payroll_emp201_filing_control(date)
is
'Combines EMP201 readiness, external submission evidence, statutory payment evidence and remaining PAYE/UIF/SDL balances without claiming SARS allocation confirmation.';
