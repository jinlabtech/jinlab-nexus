-- ============================================================
-- JINLAB Nexus
-- Accounting Sprint 19.2C
-- Automatic Journal Parser Fix
-- ============================================================

create or replace function
public.create_automatic_accounting_journal(
  p_company_id uuid,
  p_branch_id uuid,
  p_entry_date date,
  p_description text,
  p_reference text,
  p_source_type text,
  p_source_id uuid,
  p_source_event text,
  p_currency text,
  p_created_by uuid,
  p_lines jsonb,
  p_reversal_of_entry_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_period_id uuid;

  v_period_status text;
  v_year_status text;

  v_lock_date date;

  v_journal_id uuid;
  v_entry_number text;

  v_line jsonb;

  v_account_id uuid;
  v_customer_id uuid;

  v_debit numeric(14,2);
  v_credit numeric(14,2);

  v_line_number integer := 1;

  v_total_debit numeric(14,2);
  v_total_credit numeric(14,2);

  v_line_count integer;
begin

  -- ----------------------------------------------------------
  -- Idempotency
  -- ----------------------------------------------------------

  select id
  into v_existing_id
  from public.journal_entry
  where company_id =
    p_company_id
    and source_type =
      p_source_type
    and source_id =
      p_source_id
    and source_event =
      p_source_event
  limit 1;

  if found then
    return
      v_existing_id;
  end if;


  if p_entry_date is null then
    raise exception
      'Accounting event date is required.';
  end if;


  if jsonb_typeof(p_lines)
       is distinct from 'array'
     or jsonb_array_length(
       p_lines
     ) < 2 then

    raise exception
      'Automatic journal requires at least two lines.';
  end if;


  -- ----------------------------------------------------------
  -- Accounting lock
  -- ----------------------------------------------------------

  select
    lock_accounting_before
  into v_lock_date
  from public.company_finance_settings
  where company_id =
    p_company_id;


  if v_lock_date is not null
     and p_entry_date <
       v_lock_date then

    raise exception
      'Accounting date is before the company accounting lock date.';
  end if;


  -- ----------------------------------------------------------
  -- Branch
  -- ----------------------------------------------------------

  if p_branch_id is not null
     and not exists (
       select 1
       from public.branch
       where id =
         p_branch_id
         and company_id =
           p_company_id
     ) then

    raise exception
      'Accounting branch does not belong to this company.';
  end if;


  -- ----------------------------------------------------------
  -- Financial period
  -- ----------------------------------------------------------

  perform
    public.ensure_accounting_periods(
      p_company_id,
      p_entry_date
    );


  select
    ap.id,
    ap.status,
    fy.status
  into
    v_period_id,
    v_period_status,
    v_year_status

  from public.accounting_period ap

  join public.accounting_financial_year fy
    on fy.id =
      ap.financial_year_id

  where
    ap.company_id =
      p_company_id
    and p_entry_date between
      ap.start_date
      and ap.end_date

  order by
    ap.start_date desc
  limit 1;


  if v_period_id is null then
    raise exception
      'No accounting period exists for this transaction date.';
  end if;


  if v_period_status <>
     'open' then
    raise exception
      'Accounting period is not open.';
  end if;


  if v_year_status <>
     'open' then
    raise exception
      'Financial year is not open.';
  end if;


  v_entry_number :=
    public.next_automatic_journal_number(
      p_company_id,
      p_entry_date
    );


  -- ----------------------------------------------------------
  -- Header
  -- ----------------------------------------------------------

  insert into public.journal_entry (
    company_id,
    branch_id,
    accounting_period_id,
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
    p_company_id,
    p_branch_id,
    v_period_id,
    v_entry_number,
    p_entry_date,
    trim(p_description),

    nullif(
      trim(
        coalesce(
          p_reference,
          ''
        )
      ),
      ''
    ),

    p_source_type,
    p_source_id,
    p_source_event,

    coalesce(
      nullif(
        trim(p_currency),
        ''
      ),
      'ZAR'
    ),

    'draft',
    'not_required',
    p_reversal_of_entry_id,
    p_created_by
  )

  returning id
  into v_journal_id;


  -- ----------------------------------------------------------
  -- Lines
  -- ----------------------------------------------------------

  for v_line in
    select value
    from jsonb_array_elements(
      p_lines
    )
  loop

    -- IMPORTANT:
    -- ->> extracts raw text.
    -- -> would retain JSON quotation marks.
    v_account_id :=
      nullif(
        v_line ->>
        'account_id',
        ''
      )::uuid;


    v_customer_id :=
      nullif(
        v_line ->>
        'customer_id',
        ''
      )::uuid;


    v_debit :=
      coalesce(
        nullif(
          v_line ->>
          'debit',
          ''
        )::numeric,
        0
      );


    v_credit :=
      coalesce(
        nullif(
          v_line ->>
          'credit',
          ''
        )::numeric,
        0
      );


    if v_account_id is null then
      raise exception
        'Automatic journal line account is required.';
    end if;


    if not exists (
      select 1
      from public.accounting_account
      where id =
        v_account_id
        and company_id =
          p_company_id
        and is_active =
          true
    ) then

      raise exception
        'Automatic journal contains an invalid or inactive account.';
    end if;


    if v_customer_id is not null
       and not exists (
         select 1
         from public.customer
         where id =
           v_customer_id
           and company_id =
             p_company_id
       ) then

      raise exception
        'Automatic journal customer belongs to another company.';
    end if;


    if (
      v_debit <= 0
      and v_credit <= 0
    )
    or (
      v_debit > 0
      and v_credit > 0
    ) then

      raise exception
        'Every automatic journal line must contain either a debit or a credit.';
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
      v_journal_id,
      p_company_id,
      v_account_id,
      v_line_number,

      nullif(
        trim(
          coalesce(
            v_line ->>
            'description',
            ''
          )
        ),
        ''
      ),

      round(
        v_debit,
        2
      ),

      round(
        v_credit,
        2
      ),

      v_customer_id,

      coalesce(
        v_line ->
        'metadata',
        '{}'::jsonb
      )
    );


    v_line_number :=
      v_line_number + 1;

  end loop;


  -- ----------------------------------------------------------
  -- Authoritative totals
  -- ----------------------------------------------------------

  select
    total_debit,
    total_credit
  into
    v_total_debit,
    v_total_credit
  from public.journal_entry
  where id =
    v_journal_id;


  select count(*)
  into v_line_count
  from public.journal_line
  where journal_entry_id =
    v_journal_id;


  if v_line_count < 2 then
    raise exception
      'Automatic journal requires at least two lines.';
  end if;


  if v_total_debit <= 0
     or round(
          v_total_debit,
          2
        ) <>
        round(
          v_total_credit,
          2
        ) then

    raise exception
      'Automatic journal is not balanced. Debit %, Credit %.',
      v_total_debit,
      v_total_credit;
  end if;


  -- ----------------------------------------------------------
  -- Post
  -- ----------------------------------------------------------

  update public.journal_entry
  set
    status =
      'posted',

    posted_by =
      p_created_by,

    posted_at =
      now()

  where id =
    v_journal_id;


  return
    v_journal_id;

end;
$$;


revoke all
on function public.create_automatic_accounting_journal(
  uuid,
  uuid,
  date,
  text,
  text,
  text,
  uuid,
  text,
  text,
  uuid,
  jsonb,
  uuid
)
from public, authenticated;
