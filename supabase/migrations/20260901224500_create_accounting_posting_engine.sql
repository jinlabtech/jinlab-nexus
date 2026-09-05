-- ============================================================
-- JINLAB Nexus
-- Accounting Sprint 19.1B
-- Safe Posting Engine
-- ============================================================


-- ============================================================
-- 1. JOURNAL APPROVAL STATE
-- ============================================================

alter table public.journal_entry
add column approval_status text
not null default 'not_required'
check (
  approval_status in (
    'not_required',
    'pending',
    'approved'
  )
);

alter table public.journal_entry
add column approved_by uuid
references auth.users(id)
on delete set null;

alter table public.journal_entry
add column approved_at timestamptz;


-- Only one reversal is allowed for one posted journal.
create unique index if not exists
journal_entry_single_reversal_idx
on public.journal_entry (
  company_id,
  reversal_of_entry_id
)
where reversal_of_entry_id is not null;


-- ============================================================
-- 2. JOURNAL NUMBER SEQUENCE
-- ============================================================

create table if not exists
public.accounting_journal_sequence (
  company_id uuid not null
    references public.company(id)
    on delete cascade,

  sequence_year integer not null,

  last_number bigint not null
    default 0
    check (
      last_number >= 0
    ),

  primary key (
    company_id,
    sequence_year
  )
);


alter table
public.accounting_journal_sequence
enable row level security;


-- Sequence is internal only.
revoke all
on public.accounting_journal_sequence
from anon, authenticated;


create or replace function
public.next_journal_entry_number(
  p_company_id uuid,
  p_entry_date date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer;
  v_number bigint;
begin

  v_year :=
    extract(
      year from p_entry_date
    )::integer;

  insert into
  public.accounting_journal_sequence (
    company_id,
    sequence_year,
    last_number
  )
  values (
    p_company_id,
    v_year,
    1
  )
  on conflict (
    company_id,
    sequence_year
  )
  do update set
    last_number =
      public.accounting_journal_sequence
        .last_number + 1
  returning last_number
  into v_number;

  return
    'JE-' ||
    v_year::text ||
    '-' ||
    lpad(
      v_number::text,
      6,
      '0'
    );

end;
$$;


revoke all
on function
public.next_journal_entry_number(
  uuid,
  date
)
from public;


-- ============================================================
-- 3. DEFAULT CHART OF ACCOUNTS
-- ============================================================

create or replace function
public.ensure_default_chart_of_accounts(
  p_company_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin

  insert into public.accounting_account (
    company_id,
    code,
    name,
    description,
    account_type,
    account_subtype,
    normal_balance,
    system_key,
    is_system,
    allow_manual_posting,
    is_active
  )
  values

    (
      p_company_id,
      '1000',
      'Bank',
      'Primary business bank account.',
      'asset',
      'bank',
      'debit',
      'bank',
      true,
      true,
      true
    ),

    (
      p_company_id,
      '1010',
      'Cash on Hand',
      'Physical cash and till cash.',
      'asset',
      'cash',
      'debit',
      'cash_on_hand',
      true,
      true,
      true
    ),

    (
      p_company_id,
      '1100',
      'Trade Debtors',
      'Amounts owed by customers.',
      'asset',
      'accounts_receivable',
      'debit',
      'accounts_receivable',
      true,
      false,
      true
    ),

    (
      p_company_id,
      '1200',
      'Inventory',
      'Inventory held for sale.',
      'asset',
      'inventory',
      'debit',
      'inventory',
      true,
      false,
      true
    ),

    (
      p_company_id,
      '1300',
      'VAT Input',
      'Recoverable VAT on purchases.',
      'asset',
      'vat',
      'debit',
      'vat_input',
      true,
      false,
      true
    ),

    (
      p_company_id,
      '1400',
      'Prepaid Expenses',
      'Expenses paid before recognition.',
      'asset',
      'prepayment',
      'debit',
      'prepaid_expenses',
      true,
      true,
      true
    ),

    (
      p_company_id,
      '2000',
      'Trade Creditors',
      'Amounts owed to suppliers.',
      'liability',
      'accounts_payable',
      'credit',
      'accounts_payable',
      true,
      false,
      true
    ),

    (
      p_company_id,
      '2100',
      'VAT Output',
      'VAT collected on taxable sales.',
      'liability',
      'vat',
      'credit',
      'vat_output',
      true,
      false,
      true
    ),

    (
      p_company_id,
      '2200',
      'Customer Deposits',
      'Customer money received before revenue recognition.',
      'liability',
      'customer_deposit',
      'credit',
      'customer_deposits',
      true,
      false,
      true
    ),

    (
      p_company_id,
      '2300',
      'Accrued Expenses',
      'Expenses incurred but not yet paid.',
      'liability',
      'accrual',
      'credit',
      'accrued_expenses',
      true,
      true,
      true
    ),

    (
      p_company_id,
      '3000',
      'Owner Equity',
      'Owner capital or share capital.',
      'equity',
      'capital',
      'credit',
      'owner_equity',
      true,
      true,
      true
    ),

    (
      p_company_id,
      '3100',
      'Retained Earnings',
      'Accumulated retained profits and losses.',
      'equity',
      'retained_earnings',
      'credit',
      'retained_earnings',
      true,
      false,
      true
    ),

    (
      p_company_id,
      '4000',
      'Sales Revenue',
      'Revenue from sales of goods.',
      'revenue',
      'sales',
      'credit',
      'sales_revenue',
      true,
      true,
      true
    ),

    (
      p_company_id,
      '4100',
      'Service Revenue',
      'Revenue from services rendered.',
      'revenue',
      'services',
      'credit',
      'service_revenue',
      true,
      true,
      true
    ),

    (
      p_company_id,
      '4200',
      'Other Income',
      'Other operating and non-operating income.',
      'revenue',
      'other_income',
      'credit',
      'other_income',
      true,
      true,
      true
    ),

    (
      p_company_id,
      '5000',
      'Cost of Sales',
      'Direct cost of goods sold.',
      'expense',
      'cost_of_sales',
      'debit',
      'cost_of_sales',
      true,
      true,
      true
    ),

    (
      p_company_id,
      '6000',
      'General Operating Expenses',
      'General business operating expenses.',
      'expense',
      'operating_expense',
      'debit',
      'general_expense',
      true,
      true,
      true
    ),

    (
      p_company_id,
      '6100',
      'Rent Expense',
      'Business premises rental expenses.',
      'expense',
      'rent',
      'debit',
      'rent_expense',
      true,
      true,
      true
    ),

    (
      p_company_id,
      '6200',
      'Utilities Expense',
      'Electricity, water and related utilities.',
      'expense',
      'utilities',
      'debit',
      'utilities_expense',
      true,
      true,
      true
    ),

    (
      p_company_id,
      '6300',
      'Salaries and Wages',
      'Employee salary and wage expenses.',
      'expense',
      'payroll',
      'debit',
      'salaries_wages',
      true,
      true,
      true
    ),

    (
      p_company_id,
      '6400',
      'Bank Charges',
      'Banking and transaction fees.',
      'expense',
      'bank_fees',
      'debit',
      'bank_fees',
      true,
      true,
      true
    ),

    (
      p_company_id,
      '6500',
      'Repairs and Maintenance',
      'Repair and maintenance expenses.',
      'expense',
      'repairs',
      'debit',
      'repairs_maintenance',
      true,
      true,
      true
    ),

    (
      p_company_id,
      '6600',
      'Depreciation Expense',
      'Periodic depreciation expense.',
      'expense',
      'depreciation',
      'debit',
      'depreciation_expense',
      true,
      true,
      true
    ),

    (
      p_company_id,
      '6700',
      'Bad Debts',
      'Customer balances written off.',
      'expense',
      'bad_debt',
      'debit',
      'bad_debts',
      true,
      true,
      true
    ),

    (
      p_company_id,
      '6800',
      'Rounding Gain or Loss',
      'Small financial rounding differences.',
      'expense',
      'rounding',
      'debit',
      'rounding_gain_loss',
      true,
      false,
      true
    )

  on conflict do nothing;

end;
$$;


revoke all
on function
public.ensure_default_chart_of_accounts(uuid)
from public;


-- Seed all existing Nexus companies.
do $$
declare
  v_company record;
begin
  for v_company in
    select id
    from public.company
  loop
    perform
      public.ensure_default_chart_of_accounts(
        v_company.id
      );
  end loop;
end;
$$;


-- Automatically seed new companies.
create or replace function
public.seed_company_accounting_accounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  perform
    public.ensure_default_chart_of_accounts(
      new.id
    );

  return new;

end;
$$;


drop trigger if exists
company_seed_accounting_accounts
on public.company;

create trigger
company_seed_accounting_accounts
after insert
on public.company
for each row
execute function
public.seed_company_accounting_accounts();


-- ============================================================
-- 4. ACCOUNTING PERIOD GENERATOR
-- ============================================================

create or replace function
public.ensure_accounting_periods(
  p_company_id uuid,
  p_reference_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_month integer;
  v_start_year integer;
  v_financial_year_start date;

  v_period_start date;
  v_period_end date;

  i integer;
begin

  select
    financial_year_start_month
  into v_start_month
  from public.company_finance_settings
  where company_id =
    p_company_id;

  v_start_month :=
    coalesce(
      v_start_month,
      3
    );

  v_start_year :=
    extract(
      year from p_reference_date
    )::integer;

  if extract(
       month from p_reference_date
     )::integer <
     v_start_month then

    v_start_year :=
      v_start_year - 1;

  end if;

  v_financial_year_start :=
    make_date(
      v_start_year,
      v_start_month,
      1
    );

  for i in 0..11 loop

    v_period_start :=
      (
        v_financial_year_start +
        make_interval(
          months => i
        )
      )::date;

    v_period_end :=
      (
        v_period_start +
        interval '1 month' -
        interval '1 day'
      )::date;

    insert into
    public.accounting_period (
      company_id,
      name,
      start_date,
      end_date,
      status
    )
    values (
      p_company_id,
      to_char(
        v_period_start,
        'Mon YYYY'
      ),
      v_period_start,
      v_period_end,
      'open'
    )
    on conflict (
      company_id,
      start_date,
      end_date
    )
    do nothing;

  end loop;

end;
$$;


revoke all
on function
public.ensure_accounting_periods(
  uuid,
  date
)
from public;


-- Generate current periods for existing companies.
do $$
declare
  v_company record;
begin
  for v_company in
    select id
    from public.company
  loop
    perform
      public.ensure_accounting_periods(
        v_company.id,
        current_date
      );
  end loop;
end;
$$;


-- ============================================================
-- 5. STRENGTHEN JOURNAL LINE COMPANY VALIDATION
-- ============================================================

create or replace function
public.validate_journal_line_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_company uuid;
  v_account_company uuid;
  v_customer_company uuid;
begin

  select company_id
  into v_entry_company
  from public.journal_entry
  where id =
    new.journal_entry_id;

  if v_entry_company is null then
    raise exception
      'Journal entry could not be found.';
  end if;

  select company_id
  into v_account_company
  from public.accounting_account
  where id =
    new.account_id;

  if v_account_company is null then
    raise exception
      'Accounting account could not be found.';
  end if;

  if new.company_id <>
     v_entry_company then
    raise exception
      'Journal line company does not match journal entry company.';
  end if;

  if new.company_id <>
     v_account_company then
    raise exception
      'Journal line company does not match accounting account company.';
  end if;

  if new.customer_id is not null then

    select company_id
    into v_customer_company
    from public.customer
    where id =
      new.customer_id;

    if v_customer_company is null
       or v_customer_company <>
          new.company_id then

      raise exception
        'Journal customer does not belong to this company.';

    end if;

  end if;

  return new;

end;
$$;


-- ============================================================
-- 6. CREATE MANUAL JOURNAL DRAFT
-- Atomic header + lines.
-- ============================================================

create or replace function
public.create_manual_journal(
  p_entry_date date,
  p_description text,
  p_reference text,
  p_branch_id uuid,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_settings public.company_accounting_settings%rowtype;

  v_entry public.journal_entry%rowtype;

  v_item jsonb;
  v_line_number integer := 0;

  v_account_id uuid;
  v_customer_id uuid;

  v_debit numeric(14,2);
  v_credit numeric(14,2);

  v_account public.accounting_account%rowtype;

  v_lock_date date;
  v_line_count integer := 0;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;

  if not public.current_user_has_permission(
    'accounting.journal.create'
  ) then
    raise exception
      'Permission denied: accounting.journal.create';
  end if;

  v_company_id :=
    public.current_settings_company_id();

  if v_company_id is null then
    raise exception
      'Your account is not linked to a company.';
  end if;

  select *
  into v_settings
  from public.company_accounting_settings
  where company_id =
    v_company_id;

  if found
     and not v_settings.accounting_enabled then
    raise exception
      'Accounting is disabled for this company.';
  end if;

  if p_entry_date is null then
    raise exception
      'Journal date is required.';
  end if;

  select lock_accounting_before
  into v_lock_date
  from public.company_finance_settings
  where company_id =
    v_company_id;

  if v_lock_date is not null
     and p_entry_date <
         v_lock_date then
    raise exception
      'This date is inside a locked accounting period.';
  end if;

  if nullif(
       trim(p_description),
       ''
     ) is null then
    raise exception
      'Journal description is required.';
  end if;

  if jsonb_typeof(
       coalesce(
         p_lines,
         '[]'::jsonb
       )
     ) <> 'array' then
    raise exception
      'Journal lines must be an array.';
  end if;

  if jsonb_array_length(
       coalesce(
         p_lines,
         '[]'::jsonb
       )
     ) < 2 then
    raise exception
      'A journal requires at least two lines.';
  end if;

  if p_branch_id is not null
     and not exists (
       select 1
       from public.branch
       where id =
         p_branch_id
         and company_id =
           v_company_id
     ) then
    raise exception
      'Branch does not belong to this company.';
  end if;

  perform
    public.ensure_default_chart_of_accounts(
      v_company_id
    );

  perform
    public.ensure_accounting_periods(
      v_company_id,
      p_entry_date
    );

  insert into public.journal_entry (
    company_id,
    branch_id,
    entry_number,
    entry_date,
    description,
    reference,
    source_type,
    currency,
    status,
    approval_status,
    created_by
  )
  values (
    v_company_id,
    p_branch_id,
    public.next_journal_entry_number(
      v_company_id,
      p_entry_date
    ),
    p_entry_date,
    trim(p_description),
    nullif(
      trim(p_reference),
      ''
    ),
    'manual',
    coalesce(
      (
        select base_currency
        from public.company_finance_settings
        where company_id =
          v_company_id
      ),
      'ZAR'
    ),
    'draft',
    case
      when coalesce(
        v_settings.require_manual_journal_approval,
        true
      )
      then 'pending'
      else 'not_required'
    end,
    auth.uid()
  )
  returning *
  into v_entry;

  for v_item in
    select *
    from jsonb_array_elements(
      p_lines
    )
  loop

    v_line_number :=
      v_line_number + 1;

    v_account_id :=
      nullif(
        v_item ->> 'account_id',
        ''
      )::uuid;

    v_customer_id :=
      nullif(
        v_item ->> 'customer_id',
        ''
      )::uuid;

    v_debit :=
      round(
        coalesce(
          nullif(
            v_item ->> 'debit',
            ''
          )::numeric,
          0
        ),
        2
      );

    v_credit :=
      round(
        coalesce(
          nullif(
            v_item ->> 'credit',
            ''
          )::numeric,
          0
        ),
        2
      );

    if v_account_id is null then
      raise exception
        'Every journal line requires an account.';
    end if;

    select *
    into v_account
    from public.accounting_account
    where id =
      v_account_id
      and company_id =
        v_company_id
      and is_active = true;

    if not found then
      raise exception
        'Journal account could not be found or is inactive.';
    end if;

    if not v_account.allow_manual_posting then
      raise exception
        'Manual posting is not allowed to account %.',
        v_account.name;
    end if;

    if not (
      (
        v_debit > 0
        and v_credit = 0
      )
      or
      (
        v_credit > 0
        and v_debit = 0
      )
    ) then
      raise exception
        'Each journal line must contain either a debit or a credit.';
    end if;

    insert into public.journal_line (
      journal_entry_id,
      company_id,
      account_id,
      line_number,
      description,
      debit,
      credit,
      customer_id,
      metadata
    )
    values (
      v_entry.id,
      v_company_id,
      v_account_id,
      v_line_number,
      nullif(
        trim(
          v_item ->> 'description'
        ),
        ''
      ),
      v_debit,
      v_credit,
      v_customer_id,
      coalesce(
        v_item -> 'metadata',
        '{}'::jsonb
      )
    );

    v_line_count :=
      v_line_count + 1;

  end loop;

  perform
    public.refresh_journal_entry_totals(
      v_entry.id
    );

  select *
  into v_entry
  from public.journal_entry
  where id =
    v_entry.id;

  return jsonb_build_object(
    'ok', true,

    'journal', jsonb_build_object(
      'id',
        v_entry.id,
      'entry_number',
        v_entry.entry_number,
      'entry_date',
        v_entry.entry_date,
      'status',
        v_entry.status,
      'approval_status',
        v_entry.approval_status,
      'total_debit',
        v_entry.total_debit,
      'total_credit',
        v_entry.total_credit,
      'line_count',
        v_line_count
    )
  );

end;
$$;


revoke all
on function public.create_manual_journal(
  date,
  text,
  text,
  uuid,
  jsonb
)
from public;

grant execute
on function public.create_manual_journal(
  date,
  text,
  text,
  uuid,
  jsonb
)
to authenticated;


-- ============================================================
-- 7. APPROVE MANUAL JOURNAL
-- ============================================================

create or replace function
public.approve_journal_entry(
  p_journal_entry_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_entry public.journal_entry%rowtype;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;

  if not public.current_user_has_permission(
    'accounting.journal.approve'
  ) then
    raise exception
      'Permission denied: accounting.journal.approve';
  end if;

  v_company_id :=
    public.current_settings_company_id();

  select *
  into v_entry
  from public.journal_entry
  where id =
    p_journal_entry_id
    and company_id =
      v_company_id
  for update;

  if not found then
    raise exception
      'Journal entry could not be found.';
  end if;

  if v_entry.status <> 'draft' then
    raise exception
      'Only draft journals can be approved.';
  end if;

  if v_entry.approval_status =
     'not_required' then

    return jsonb_build_object(
      'ok', true,
      'journal_entry_id',
        v_entry.id,
      'approval_status',
        'not_required'
    );

  end if;

  update public.journal_entry
  set
    approval_status =
      'approved',
    approved_by =
      auth.uid(),
    approved_at =
      now()
  where id =
    v_entry.id;

  return jsonb_build_object(
    'ok', true,
    'journal_entry_id',
      v_entry.id,
    'approval_status',
      'approved'
  );

end;
$$;


revoke all
on function
public.approve_journal_entry(uuid)
from public;

grant execute
on function
public.approve_journal_entry(uuid)
to authenticated;


-- ============================================================
-- 8. POST JOURNAL
-- Critical accounting boundary.
-- ============================================================

create or replace function
public.post_journal_entry(
  p_journal_entry_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_entry public.journal_entry%rowtype;
  v_settings public.company_accounting_settings%rowtype;

  v_period public.accounting_period%rowtype;

  v_lock_date date;

  v_total_debit numeric(14,2);
  v_total_credit numeric(14,2);

  v_line_count integer;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;

  if not public.current_user_has_permission(
    'accounting.journal.post'
  ) then
    raise exception
      'Permission denied: accounting.journal.post';
  end if;

  v_company_id :=
    public.current_settings_company_id();

  select *
  into v_entry
  from public.journal_entry
  where id =
    p_journal_entry_id
    and company_id =
      v_company_id
  for update;

  if not found then
    raise exception
      'Journal entry could not be found.';
  end if;

  if v_entry.status <> 'draft' then
    raise exception
      'Only draft journals can be posted.';
  end if;

  select *
  into v_settings
  from public.company_accounting_settings
  where company_id =
    v_company_id;

  if found
     and not v_settings.accounting_enabled then
    raise exception
      'Accounting is disabled for this company.';
  end if;

  if v_entry.source_type = 'manual'
     and coalesce(
       v_settings.require_manual_journal_approval,
       true
     )
     and v_entry.approval_status <>
         'approved' then

    raise exception
      'This manual journal requires approval before posting.';

  end if;

  select lock_accounting_before
  into v_lock_date
  from public.company_finance_settings
  where company_id =
    v_company_id;

  if v_lock_date is not null
     and v_entry.entry_date <
         v_lock_date then
    raise exception
      'This journal date is inside a locked accounting period.';
  end if;

  perform
    public.ensure_accounting_periods(
      v_company_id,
      v_entry.entry_date
    );

  select *
  into v_period
  from public.accounting_period
  where company_id =
    v_company_id
    and v_entry.entry_date
        between start_date
        and end_date
  order by start_date desc
  limit 1
  for update;

  if not found then
    raise exception
      'No accounting period exists for this journal date.';
  end if;

  if v_period.status <> 'open' then
    raise exception
      'The accounting period is not open.';
  end if;

  select
    count(*),
    round(
      coalesce(
        sum(debit),
        0
      ),
      2
    ),
    round(
      coalesce(
        sum(credit),
        0
      ),
      2
    )
  into
    v_line_count,
    v_total_debit,
    v_total_credit
  from public.journal_line
  where journal_entry_id =
    v_entry.id;

  if v_line_count < 2 then
    raise exception
      'A journal requires at least two lines.';
  end if;

  if v_total_debit <= 0
     or v_total_credit <= 0 then
    raise exception
      'Journal totals must be greater than zero.';
  end if;

  if v_total_debit <>
     v_total_credit then
    raise exception
      'Journal is not balanced. Debit % does not equal Credit %.',
      v_total_debit,
      v_total_credit;
  end if;

  update public.journal_entry
  set
    accounting_period_id =
      v_period.id,
    total_debit =
      v_total_debit,
    total_credit =
      v_total_credit,
    status =
      'posted',
    posted_by =
      auth.uid(),
    posted_at =
      now()
  where id =
    v_entry.id;

  return jsonb_build_object(
    'ok', true,

    'journal', jsonb_build_object(
      'id',
        v_entry.id,
      'entry_number',
        v_entry.entry_number,
      'status',
        'posted',
      'total_debit',
        v_total_debit,
      'total_credit',
        v_total_credit,
      'accounting_period_id',
        v_period.id,
      'posted_at',
        now()
    )
  );

end;
$$;


revoke all
on function
public.post_journal_entry(uuid)
from public;

grant execute
on function
public.post_journal_entry(uuid)
to authenticated;


-- ============================================================
-- 9. REVERSAL ENGINE
-- Posted entries are never edited.
-- ============================================================

create or replace function
public.reverse_journal_entry(
  p_journal_entry_id uuid,
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

  v_original public.journal_entry%rowtype;
  v_reversal public.journal_entry%rowtype;

  v_line record;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;

  if not public.current_user_has_permission(
    'accounting.journal.post'
  ) then
    raise exception
      'Permission denied: accounting.journal.post';
  end if;

  v_company_id :=
    public.current_settings_company_id();

  select *
  into v_original
  from public.journal_entry
  where id =
    p_journal_entry_id
    and company_id =
      v_company_id
  for update;

  if not found then
    raise exception
      'Original journal entry could not be found.';
  end if;

  if v_original.status <> 'posted' then
    raise exception
      'Only posted journals can be reversed.';
  end if;

  if exists (
    select 1
    from public.journal_entry
    where company_id =
      v_company_id
      and reversal_of_entry_id =
        v_original.id
  ) then
    raise exception
      'This journal has already been reversed.';
  end if;

  if p_reversal_date is null then
    raise exception
      'Reversal date is required.';
  end if;

  perform
    public.ensure_accounting_periods(
      v_company_id,
      p_reversal_date
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
    approval_status,
    reversal_of_entry_id,
    created_by
  )
  values (
    v_company_id,
    v_original.branch_id,

    public.next_journal_entry_number(
      v_company_id,
      p_reversal_date
    ),

    p_reversal_date,

    'Reversal of ' ||
      v_original.entry_number ||
      ': ' ||
      coalesce(
        nullif(
          trim(p_reason),
          ''
        ),
        'Accounting correction'
      ),

    v_original.entry_number,

    'reversal',

    v_original.id,

    'reversal',

    v_original.currency,

    'draft',

    'not_required',

    v_original.id,

    auth.uid()
  )
  returning *
  into v_reversal;

  for v_line in
    select *
    from public.journal_line
    where journal_entry_id =
      v_original.id
    order by line_number
  loop

    insert into public.journal_line (
      journal_entry_id,
      company_id,
      account_id,
      line_number,
      description,
      debit,
      credit,
      customer_id,
      metadata
    )
    values (
      v_reversal.id,
      v_company_id,
      v_line.account_id,
      v_line.line_number,

      coalesce(
        v_line.description,
        'Reversal'
      ),

      v_line.credit,
      v_line.debit,

      v_line.customer_id,

      jsonb_build_object(
        'reversal_of_line_id',
        v_line.id
      )
    );

  end loop;

  perform
    public.post_journal_entry(
      v_reversal.id
    );

  return jsonb_build_object(
    'ok', true,

    'original_journal_id',
      v_original.id,

    'reversal_journal_id',
      v_reversal.id,

    'reversal_entry_number',
      v_reversal.entry_number
  );

end;
$$;


revoke all
on function public.reverse_journal_entry(
  uuid,
  date,
  text
)
from public;

grant execute
on function public.reverse_journal_entry(
  uuid,
  date,
  text
)
to authenticated;


-- ============================================================
-- 10. ACCOUNTING PERIOD STATUS CONTROL
-- ============================================================

create or replace function
public.set_accounting_period_status(
  p_period_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_period public.accounting_period%rowtype;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;

  if not public.current_user_has_permission(
    'accounting.period.manage'
  ) then
    raise exception
      'Permission denied: accounting.period.manage';
  end if;

  if p_status not in (
    'open',
    'closed',
    'locked'
  ) then
    raise exception
      'Invalid accounting period status.';
  end if;

  v_company_id :=
    public.current_settings_company_id();

  select *
  into v_period
  from public.accounting_period
  where id =
    p_period_id
    and company_id =
      v_company_id
  for update;

  if not found then
    raise exception
      'Accounting period could not be found.';
  end if;

  update public.accounting_period
  set
    status =
      p_status,

    closed_at =
      case
        when p_status in (
          'closed',
          'locked'
        )
        then now()
        else null
      end,

    closed_by =
      case
        when p_status in (
          'closed',
          'locked'
        )
        then auth.uid()
        else null
      end
  where id =
    v_period.id;

  return jsonb_build_object(
    'ok', true,
    'period_id',
      v_period.id,
    'status',
      p_status
  );

end;
$$;


revoke all
on function
public.set_accounting_period_status(
  uuid,
  text
)
from public;

grant execute
on function
public.set_accounting_period_status(
  uuid,
  text
)
to authenticated;


-- ============================================================
-- 11. ACCOUNTING APPROVAL PERMISSION
-- ============================================================

insert into public.permissions (
  permission_name
)
values
  (
    'accounting.journal.approve'
  )
on conflict (
  permission_name
)
do nothing;


-- Owner / Admin receive approval authority.
insert into public.role_permissions (
  role_id,
  permission_id
)
select
  r.id,
  p.id
from public.roles r
join public.permissions p
  on p.permission_name =
    'accounting.journal.approve'
where r.role_name in (
  'owner',
  'admin'
)
on conflict (
  role_id,
  permission_id
)
do nothing;


-- ============================================================
-- END ACCOUNTING POSTING ENGINE
-- ============================================================
