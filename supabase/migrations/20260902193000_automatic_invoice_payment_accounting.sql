-- ============================================================
-- JINLAB Nexus
-- Accounting Sprint 19.2B
-- Automatic Invoice + Payment Accounting
-- PART 1
-- ============================================================


-- ============================================================
-- 1. AUTOMATIC JOURNAL SEQUENCE
--
-- Manual journals:
-- JE-2026-000001
--
-- Automatic journals:
-- JE-A-2026-000001
--
-- Separate numbering prevents collisions while remaining
-- recognisable to accountants.
-- ============================================================

create table if not exists
public.accounting_automatic_journal_sequence (
  company_id uuid not null
    references public.company(id)
    on delete cascade,

  sequence_year integer not null,

  last_number bigint not null
    default 0,

  primary key (
    company_id,
    sequence_year
  )
);


revoke all
on public.accounting_automatic_journal_sequence
from public, authenticated;


create or replace function
public.next_automatic_journal_number(
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
  v_next bigint;
begin

  v_year :=
    extract(
      year from p_entry_date
    )::integer;


  insert into
  public.accounting_automatic_journal_sequence (
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
      public.accounting_automatic_journal_sequence
        .last_number + 1

  returning last_number
  into v_next;


  return
    'JE-A-' ||
    v_year::text ||
    '-' ||
    lpad(
      v_next::text,
      6,
      '0'
    );

end;
$$;


revoke all
on function
public.next_automatic_journal_number(
  uuid,
  date
)
from public, authenticated;


-- ============================================================
-- 2. ACCOUNTING AUTOMATION EXCEPTIONS
--
-- Nexus must never silently lose an accounting event.
--
-- If an operational transaction succeeds but accounting
-- automation cannot post it, the event appears here for
-- accountant/owner review.
-- ============================================================

create table if not exists
public.accounting_posting_exception (
  id uuid primary key
    default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  branch_id uuid
    references public.branch(id)
    on delete set null,

  source_type text not null
    check (
      source_type in (
        'invoice',
        'invoice_payment'
      )
    ),

  source_id uuid not null,

  source_event text not null,

  event_date date not null,

  reason_code text not null,

  message text not null,

  status text not null
    default 'open'
    check (
      status in (
        'open',
        'resolved'
      )
    ),

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  resolved_at timestamptz,

  resolved_by uuid
    references auth.users(id)
    on delete set null,

  unique (
    company_id,
    source_type,
    source_id,
    source_event
  )
);


create index if not exists
accounting_posting_exception_company_idx
on public.accounting_posting_exception (
  company_id,
  status
);


drop trigger if exists
accounting_posting_exception_updated_at
on public.accounting_posting_exception;

create trigger
accounting_posting_exception_updated_at
before update
on public.accounting_posting_exception
for each row
execute function public.set_updated_at();


alter table
public.accounting_posting_exception
enable row level security;


drop policy if exists
"permitted users read accounting posting exceptions"
on public.accounting_posting_exception;


create policy
"permitted users read accounting posting exceptions"
on public.accounting_posting_exception
for select
to authenticated
using (
  company_id =
    public.current_settings_company_id()

  and public.current_user_has_permission(
    'accounting.view'
  )
);


grant select
on public.accounting_posting_exception
to authenticated;


revoke insert, update, delete
on public.accounting_posting_exception
from authenticated;


create or replace function
public.record_accounting_posting_exception(
  p_company_id uuid,
  p_branch_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_source_event text,
  p_event_date date,
  p_reason_code text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin

  insert into
  public.accounting_posting_exception (
    company_id,
    branch_id,
    source_type,
    source_id,
    source_event,
    event_date,
    reason_code,
    message,
    status
  )
  values (
    p_company_id,
    p_branch_id,
    p_source_type,
    p_source_id,
    p_source_event,
    p_event_date,
    p_reason_code,
    p_message,
    'open'
  )

  on conflict (
    company_id,
    source_type,
    source_id,
    source_event
  )

  do update set
    branch_id =
      excluded.branch_id,

    event_date =
      excluded.event_date,

    reason_code =
      excluded.reason_code,

    message =
      excluded.message,

    status =
      'open',

    resolved_at =
      null,

    resolved_by =
      null;

end;
$$;


revoke all
on function
public.record_accounting_posting_exception(
  uuid,
  uuid,
  text,
  uuid,
  text,
  date,
  text,
  text
)
from public, authenticated;


-- ============================================================
-- 3. ENSURE POSTING PROFILE EXISTS
-- ============================================================

create or replace function
public.ensure_accounting_posting_profile(
  p_company_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin

  if exists (
    select 1
    from public.accounting_posting_profile
    where company_id =
      p_company_id
  ) then
    return;
  end if;


  insert into
  public.accounting_posting_profile (
    company_id,

    accounts_receivable_account_id,
    accounts_payable_account_id,

    sales_revenue_account_id,
    service_revenue_account_id,

    vat_output_account_id,
    vat_input_account_id,

    bank_account_id,
    cash_account_id,

    inventory_account_id,
    cost_of_sales_account_id,

    customer_deposits_account_id,
    rounding_account_id
  )

  select
    p_company_id,

    (
      select id
      from public.accounting_account
      where company_id =
        p_company_id
        and (
          system_key =
            'accounts_receivable'
          or code =
            '1100'
        )
      order by
        case
          when system_key =
            'accounts_receivable'
          then 0
          else 1
        end
      limit 1
    ),

    (
      select id
      from public.accounting_account
      where company_id =
        p_company_id
        and (
          system_key =
            'accounts_payable'
          or code =
            '2000'
        )
      limit 1
    ),

    (
      select id
      from public.accounting_account
      where company_id =
        p_company_id
        and (
          system_key =
            'sales_revenue'
          or code =
            '4000'
        )
      limit 1
    ),

    (
      select id
      from public.accounting_account
      where company_id =
        p_company_id
        and (
          system_key =
            'service_revenue'
          or code =
            '4100'
        )
      limit 1
    ),

    (
      select id
      from public.accounting_account
      where company_id =
        p_company_id
        and (
          system_key =
            'vat_output'
          or code =
            '2100'
        )
      limit 1
    ),

    (
      select id
      from public.accounting_account
      where company_id =
        p_company_id
        and (
          system_key =
            'vat_input'
          or code =
            '1300'
        )
      limit 1
    ),

    (
      select id
      from public.accounting_account
      where company_id =
        p_company_id
        and (
          system_key =
            'bank'
          or code =
            '1000'
        )
      limit 1
    ),

    (
      select id
      from public.accounting_account
      where company_id =
        p_company_id
        and (
          system_key =
            'cash_on_hand'
          or code =
            '1010'
        )
      limit 1
    ),

    (
      select id
      from public.accounting_account
      where company_id =
        p_company_id
        and (
          system_key =
            'inventory'
          or code =
            '1200'
        )
      limit 1
    ),

    (
      select id
      from public.accounting_account
      where company_id =
        p_company_id
        and (
          system_key =
            'cost_of_sales'
          or code =
            '5000'
        )
      limit 1
    ),

    (
      select id
      from public.accounting_account
      where company_id =
        p_company_id
        and (
          system_key =
            'customer_deposits'
          or code =
            '2200'
        )
      limit 1
    ),

    (
      select id
      from public.accounting_account
      where company_id =
        p_company_id
        and (
          system_key =
            'rounding'
          or code =
            '6800'
        )
      limit 1
    )

  on conflict (
    company_id
  )
  do nothing;


  if not exists (
    select 1
    from public.accounting_posting_profile
    where company_id =
      p_company_id
  ) then
    raise exception
      'Accounting posting profile could not be created.';
  end if;

end;
$$;


revoke all
on function
public.ensure_accounting_posting_profile(uuid)
from public, authenticated;


-- ============================================================
-- 4. GENERIC AUTOMATIC JOURNAL CREATOR
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


  if jsonb_typeof(
       p_lines
     ) is distinct from
     'array'
     or jsonb_array_length(
       p_lines
     ) < 2 then

    raise exception
      'Automatic journal requires at least two lines.';
  end if;


  -- ----------------------------------------------------------
  -- Accounting lock date
  -- ----------------------------------------------------------

  select
    lock_accounting_before
  into
    v_lock_date
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
  -- Branch ownership
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
  -- Financial year + accounting period
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


  -- ----------------------------------------------------------
  -- Journal number
  -- ----------------------------------------------------------

  v_entry_number :=
    public.next_automatic_journal_number(
      p_company_id,
      p_entry_date
    );


  -- ----------------------------------------------------------
  -- Header
  -- ----------------------------------------------------------

  insert into
  public.journal_entry (
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

    v_account_id :=
      (
        v_line ->
        'account_id'
      )::text::uuid;

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


    insert into
    public.journal_line (
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
  -- Authoritative validation
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
on function
public.create_automatic_accounting_journal(
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


-- ============================================================
-- END PART 1
-- ============================================================


-- ============================================================
-- JINLAB Nexus
-- Accounting Sprint 19.2B
-- PART 2
-- ============================================================


-- ============================================================
-- 5. POST ISSUED INVOICE
--
-- ACCRUAL BASIS
--
-- DR Trade Debtors
--    CR Sales Revenue
--    CR Service Revenue
--    CR VAT Output
--
-- Cash-basis automation is intentionally NOT guessed here.
-- It will receive its own posting model together with the
-- SARS VAT recognition-basis controls.
-- ============================================================

create or replace function
public.post_invoice_issue_to_ledger(
  p_invoice_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoice%rowtype;
  v_profile public.accounting_posting_profile%rowtype;

  v_accounting_enabled boolean := false;
  v_automatic_journals boolean := false;
  v_automatic_invoice_posting boolean := false;

  v_accounting_basis text := 'accrual';

  v_vat_registered boolean := false;
  v_currency text := 'ZAR';

  v_product_revenue numeric(14,2) := 0;
  v_service_revenue numeric(14,2) := 0;

  v_rounding numeric(14,2) := 0;

  v_lines jsonb :=
    '[]'::jsonb;

  v_journal_id uuid;
begin

  select *
  into v_invoice
  from public.invoice
  where id =
    p_invoice_id
  for update;


  if not found then
    raise exception
      'Invoice could not be found.';
  end if;


  -- ----------------------------------------------------------
  -- Existing posting = idempotent
  -- ----------------------------------------------------------

  select id
  into v_journal_id
  from public.journal_entry
  where company_id =
    v_invoice.company_id

    and source_type =
      'invoice'

    and source_id =
      v_invoice.id

    and source_event =
      'issued'

  limit 1;


  if found then
    return
      v_journal_id;
  end if;


  -- ----------------------------------------------------------
  -- Automation settings
  -- ----------------------------------------------------------

  select
    accounting_enabled,
    automatic_journals,
    automatic_invoice_posting

  into
    v_accounting_enabled,
    v_automatic_journals,
    v_automatic_invoice_posting

  from public.company_accounting_settings
  where company_id =
    v_invoice.company_id;


  if not coalesce(
       v_accounting_enabled,
       false
     )
     or not coalesce(
       v_automatic_journals,
       false
     )
     or not coalesce(
       v_automatic_invoice_posting,
       false
     ) then

    return null;

  end if;


  select
    coalesce(
      accounting_basis,
      'accrual'
    ),
    coalesce(
      vat_registered,
      false
    ),
    coalesce(
      base_currency,
      'ZAR'
    )

  into
    v_accounting_basis,
    v_vat_registered,
    v_currency

  from public.company_finance_settings
  where company_id =
    v_invoice.company_id;


  -- ----------------------------------------------------------
  -- Cash basis will use its own revenue/VAT timing rules.
  -- Never guess SARS treatment.
  -- ----------------------------------------------------------

  if v_accounting_basis <>
     'accrual' then

    perform
      public.record_accounting_posting_exception(
        v_invoice.company_id,
        v_invoice.branch_id,
        'invoice',
        v_invoice.id,
        'issued',
        v_invoice.invoice_date,
        'cash_basis_pending_engine',
        'Invoice was issued but automatic ledger posting requires the dedicated cash-basis and VAT recognition engine.'
      );

    return null;

  end if;


  if v_invoice.status in (
    'draft',
    'cancelled'
  ) then
    raise exception
      'Only active issued invoices may be posted.';
  end if;


  if v_invoice.total_amount <= 0 then
    raise exception
      'Invoice total must be greater than zero.';
  end if;


  if v_invoice.tax_amount > 0
     and not v_vat_registered then

    raise exception
      'Invoice contains VAT but the company is not marked VAT registered.';

  end if;


  perform
    public.ensure_accounting_posting_profile(
      v_invoice.company_id
    );


  select *
  into v_profile
  from public.accounting_posting_profile
  where company_id =
    v_invoice.company_id;


  -- ----------------------------------------------------------
  -- Revenue classification
  --
  -- Inventory-linked item = Product Sales
  -- Non-inventory item     = Service Revenue
  -- ----------------------------------------------------------

  select
    coalesce(
      sum(
        case
          when inventory_item_id
               is not null
          then
            line_subtotal -
            line_discount
          else 0
        end
      ),
      0
    ),

    coalesce(
      sum(
        case
          when inventory_item_id
               is null
          then
            line_subtotal -
            line_discount
          else 0
        end
      ),
      0
    )

  into
    v_product_revenue,
    v_service_revenue

  from public.invoice_item
  where invoice_id =
    v_invoice.id

    and company_id =
      v_invoice.company_id;


  v_product_revenue :=
    round(
      v_product_revenue,
      2
    );

  v_service_revenue :=
    round(
      v_service_revenue,
      2
    );


  if v_profile.accounts_receivable_account_id
     is null then
    raise exception
      'Trade Debtors account is not configured.';
  end if;


  if v_product_revenue > 0
     and v_profile.sales_revenue_account_id
       is null then
    raise exception
      'Sales Revenue account is not configured.';
  end if;


  if v_service_revenue > 0
     and v_profile.service_revenue_account_id
       is null then
    raise exception
      'Service Revenue account is not configured.';
  end if;


  if v_invoice.tax_amount > 0
     and v_profile.vat_output_account_id
       is null then
    raise exception
      'VAT Output account is not configured.';
  end if;


  -- ----------------------------------------------------------
  -- DR Trade Debtors
  -- ----------------------------------------------------------

  v_lines :=
    v_lines ||
    jsonb_build_array(
      jsonb_build_object(
        'account_id',
          v_profile.accounts_receivable_account_id,
        'description',
          'Trade Debtors · ' ||
          v_invoice.invoice_number,
        'debit',
          v_invoice.total_amount,
        'credit',
          0,
        'customer_id',
          v_invoice.customer_id,
        'metadata',
          jsonb_build_object(
            'invoice_number',
              v_invoice.invoice_number,
            'role',
              'accounts_receivable'
          )
      )
    );


  -- ----------------------------------------------------------
  -- CR Product Revenue
  -- ----------------------------------------------------------

  if v_product_revenue > 0 then

    v_lines :=
      v_lines ||
      jsonb_build_array(
        jsonb_build_object(
          'account_id',
            v_profile.sales_revenue_account_id,
          'description',
            'Product sales · ' ||
            v_invoice.invoice_number,
          'debit',
            0,
          'credit',
            v_product_revenue,
          'metadata',
            jsonb_build_object(
              'invoice_number',
                v_invoice.invoice_number,
              'role',
                'product_revenue'
            )
        )
      );

  end if;


  -- ----------------------------------------------------------
  -- CR Service Revenue
  -- ----------------------------------------------------------

  if v_service_revenue > 0 then

    v_lines :=
      v_lines ||
      jsonb_build_array(
        jsonb_build_object(
          'account_id',
            v_profile.service_revenue_account_id,
          'description',
            'Service revenue · ' ||
            v_invoice.invoice_number,
          'debit',
            0,
          'credit',
            v_service_revenue,
          'metadata',
            jsonb_build_object(
              'invoice_number',
                v_invoice.invoice_number,
              'role',
                'service_revenue'
            )
        )
      );

  end if;


  -- ----------------------------------------------------------
  -- CR VAT Output
  -- ----------------------------------------------------------

  if v_invoice.tax_amount > 0 then

    v_lines :=
      v_lines ||
      jsonb_build_array(
        jsonb_build_object(
          'account_id',
            v_profile.vat_output_account_id,
          'description',
            'VAT Output · ' ||
            v_invoice.invoice_number,
          'debit',
            0,
          'credit',
            v_invoice.tax_amount,
          'metadata',
            jsonb_build_object(
              'invoice_number',
                v_invoice.invoice_number,
              'role',
                'vat_output'
            )
        )
      );

  end if;


  -- ----------------------------------------------------------
  -- Rounding control
  -- ----------------------------------------------------------

  v_rounding :=
    round(
      v_invoice.total_amount -
      (
        v_product_revenue +
        v_service_revenue +
        v_invoice.tax_amount
      ),
      2
    );


  if v_rounding <> 0 then

    if v_profile.rounding_account_id
       is null then
      raise exception
        'Rounding account is not configured.';
    end if;


    if v_rounding > 0 then

      v_lines :=
        v_lines ||
        jsonb_build_array(
          jsonb_build_object(
            'account_id',
              v_profile.rounding_account_id,
            'description',
              'Invoice rounding · ' ||
              v_invoice.invoice_number,
            'debit',
              0,
            'credit',
              v_rounding,
            'metadata',
              jsonb_build_object(
                'role',
                  'rounding'
              )
          )
        );

    else

      v_lines :=
        v_lines ||
        jsonb_build_array(
          jsonb_build_object(
            'account_id',
              v_profile.rounding_account_id,
            'description',
              'Invoice rounding · ' ||
              v_invoice.invoice_number,
            'debit',
              abs(
                v_rounding
              ),
            'credit',
              0,
            'metadata',
              jsonb_build_object(
                'role',
                  'rounding'
              )
          )
        );

    end if;

  end if;


  v_journal_id :=
    public.create_automatic_accounting_journal(
      v_invoice.company_id,
      v_invoice.branch_id,
      v_invoice.invoice_date,

      'Invoice ' ||
      v_invoice.invoice_number,

      coalesce(
        v_invoice.customer_reference,
        v_invoice.invoice_number
      ),

      'invoice',
      v_invoice.id,
      'issued',

      v_currency,

      coalesce(
        v_invoice.created_by,
        auth.uid()
      ),

      v_lines,

      null
    );


  return
    v_journal_id;

end;
$$;


revoke all
on function
public.post_invoice_issue_to_ledger(uuid)
from public, authenticated;


-- ============================================================
-- 6. CANCEL / REVERSE ISSUED INVOICE
-- ============================================================

create or replace function
public.post_invoice_cancellation_to_ledger(
  p_invoice_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoice%rowtype;

  v_original_id uuid;
  v_existing_reversal uuid;

  v_currency text;

  v_lines jsonb;
  v_journal_id uuid;
begin

  select *
  into v_invoice
  from public.invoice
  where id =
    p_invoice_id
  for update;


  if not found then
    raise exception
      'Invoice could not be found.';
  end if;


  select
    id,
    currency

  into
    v_original_id,
    v_currency

  from public.journal_entry
  where company_id =
    v_invoice.company_id

    and source_type =
      'invoice'

    and source_id =
      v_invoice.id

    and source_event =
      'issued'

    and status =
      'posted'

  limit 1;


  -- Invoice was never ledger-posted.
  if v_original_id is null then
    return null;
  end if;


  -- ----------------------------------------------------------
  -- Paid invoices cannot simply be cancelled.
  -- Refund/payment reversal workflow comes later.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from public.invoice_payment
    where invoice_id =
      v_invoice.id

      and company_id =
        v_invoice.company_id
  ) then

    raise exception
      'This invoice has payments and cannot be cancelled. Reverse or refund its payments first.';

  end if;


  -- Already reversed.
  select id
  into v_existing_reversal
  from public.journal_entry
  where reversal_of_entry_id =
    v_original_id
  limit 1;


  if found then
    return
      v_existing_reversal;
  end if;


  select
    jsonb_agg(
      jsonb_build_object(
        'account_id',
          jl.account_id,

        'description',
          'Invoice cancellation · ' ||
          v_invoice.invoice_number,

        'debit',
          jl.credit,

        'credit',
          jl.debit,

        'customer_id',
          jl.customer_id,

        'metadata',
          coalesce(
            jl.metadata,
            '{}'::jsonb
          ) ||
          jsonb_build_object(
            'reversal_of',
              v_original_id,
            'invoice_number',
              v_invoice.invoice_number
          )
      )
      order by
        jl.line_number
    )

  into v_lines

  from public.journal_line jl
  where jl.journal_entry_id =
    v_original_id;


  v_journal_id :=
    public.create_automatic_accounting_journal(
      v_invoice.company_id,
      v_invoice.branch_id,
      current_date,

      'Cancellation of invoice ' ||
      v_invoice.invoice_number,

      v_invoice.invoice_number,

      'invoice',
      v_invoice.id,
      'cancelled',

      v_currency,

      auth.uid(),

      v_lines,

      v_original_id
    );


  return
    v_journal_id;

end;
$$;


revoke all
on function
public.post_invoice_cancellation_to_ledger(uuid)
from public, authenticated;


-- ============================================================
-- 7. POST CUSTOMER PAYMENT
--
-- ACCRUAL BASIS
--
-- Cash:
-- DR Cash on Hand
--    CR Trade Debtors
--
-- EFT / Card / Other:
-- DR Bank
--    CR Trade Debtors
-- ============================================================

create or replace function
public.post_invoice_payment_to_ledger(
  p_payment_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.invoice_payment%rowtype;
  v_invoice public.invoice%rowtype;

  v_profile public.accounting_posting_profile%rowtype;

  v_accounting_enabled boolean := false;
  v_automatic_journals boolean := false;
  v_automatic_payment_posting boolean := false;

  v_accounting_basis text := 'accrual';

  v_currency text := 'ZAR';

  v_receipt_account_id uuid;

  v_issue_journal_id uuid;
  v_journal_id uuid;

  v_lines jsonb :=
    '[]'::jsonb;
begin

  select *
  into v_payment
  from public.invoice_payment
  where id =
    p_payment_id;


  if not found then
    raise exception
      'Invoice payment could not be found.';
  end if;


  select *
  into v_invoice
  from public.invoice
  where id =
    v_payment.invoice_id

    and company_id =
      v_payment.company_id;


  if not found then
    raise exception
      'Payment invoice could not be found.';
  end if;


  -- Existing posting = idempotent.
  select id
  into v_journal_id
  from public.journal_entry
  where company_id =
    v_payment.company_id

    and source_type =
      'invoice_payment'

    and source_id =
      v_payment.id

    and source_event =
      'received'

  limit 1;


  if found then
    return
      v_journal_id;
  end if;


  select
    accounting_enabled,
    automatic_journals,
    automatic_payment_posting

  into
    v_accounting_enabled,
    v_automatic_journals,
    v_automatic_payment_posting

  from public.company_accounting_settings
  where company_id =
    v_payment.company_id;


  if not coalesce(
       v_accounting_enabled,
       false
     )
     or not coalesce(
       v_automatic_journals,
       false
     )
     or not coalesce(
       v_automatic_payment_posting,
       false
     ) then

    return null;

  end if;


  select
    coalesce(
      accounting_basis,
      'accrual'
    ),
    coalesce(
      base_currency,
      'ZAR'
    )

  into
    v_accounting_basis,
    v_currency

  from public.company_finance_settings
  where company_id =
    v_payment.company_id;


  if v_accounting_basis <>
     'accrual' then

    perform
      public.record_accounting_posting_exception(
        v_payment.company_id,
        v_payment.branch_id,
        'invoice_payment',
        v_payment.id,
        'received',
        v_payment.payment_date,
        'cash_basis_pending_engine',
        'Payment was received but automatic ledger posting requires the dedicated cash-basis and VAT recognition engine.'
      );

    return null;

  end if;


  -- ----------------------------------------------------------
  -- The invoice must already exist in Trade Debtors.
  -- Otherwise payment posting would create a negative debtor.
  -- ----------------------------------------------------------

  select id
  into v_issue_journal_id
  from public.journal_entry
  where company_id =
    v_payment.company_id

    and source_type =
      'invoice'

    and source_id =
      v_invoice.id

    and source_event =
      'issued'

    and status =
      'posted'

  limit 1;


  if v_issue_journal_id is null then

    raise exception
      'Invoice has not yet been posted to the accounting ledger.';

  end if;


  perform
    public.ensure_accounting_posting_profile(
      v_payment.company_id
    );


  select *
  into v_profile
  from public.accounting_posting_profile
  where company_id =
    v_payment.company_id;


  if v_profile.accounts_receivable_account_id
     is null then
    raise exception
      'Trade Debtors account is not configured.';
  end if;


  if v_payment.payment_method =
     'cash' then

    v_receipt_account_id :=
      v_profile.cash_account_id;

  else

    v_receipt_account_id :=
      v_profile.bank_account_id;

  end if;


  if v_receipt_account_id
     is null then
    raise exception
      'Receipt bank/cash account is not configured.';
  end if;


  -- DR Cash / Bank
  v_lines :=
    v_lines ||
    jsonb_build_array(
      jsonb_build_object(
        'account_id',
          v_receipt_account_id,

        'description',
          'Customer payment · ' ||
          v_invoice.invoice_number,

        'debit',
          v_payment.amount,

        'credit',
          0,

        'customer_id',
          v_payment.customer_id,

        'metadata',
          jsonb_build_object(
            'invoice_number',
              v_invoice.invoice_number,
            'payment_method',
              v_payment.payment_method,
            'payment_reference',
              v_payment.reference,
            'role',
              'receipt'
          )
      )
    );


  -- CR Trade Debtors
  v_lines :=
    v_lines ||
    jsonb_build_array(
      jsonb_build_object(
        'account_id',
          v_profile.accounts_receivable_account_id,

        'description',
          'Settle debtor · ' ||
          v_invoice.invoice_number,

        'debit',
          0,

        'credit',
          v_payment.amount,

        'customer_id',
          v_payment.customer_id,

        'metadata',
          jsonb_build_object(
            'invoice_number',
              v_invoice.invoice_number,
            'payment_method',
              v_payment.payment_method,
            'role',
              'accounts_receivable'
          )
      )
    );


  v_journal_id :=
    public.create_automatic_accounting_journal(
      v_payment.company_id,
      v_payment.branch_id,
      v_payment.payment_date,

      'Payment received · ' ||
      v_invoice.invoice_number,

      coalesce(
        v_payment.reference,
        v_invoice.invoice_number
      ),

      'invoice_payment',
      v_payment.id,
      'received',

      v_currency,

      coalesce(
        v_payment.received_by,
        auth.uid()
      ),

      v_lines,

      null
    );


  return
    v_journal_id;

end;
$$;


revoke all
on function
public.post_invoice_payment_to_ledger(uuid)
from public, authenticated;


-- ============================================================
-- 8. VAT COMPLIANCE GUARD BEFORE ISSUE
-- ============================================================

create or replace function
public.invoice_accounting_compliance_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vat_registered boolean := false;
begin

  if new.status =
       'issued'
     and old.status is distinct from
       new.status
     and new.tax_amount > 0 then

    select
      coalesce(
        vat_registered,
        false
      )

    into v_vat_registered

    from public.company_finance_settings
    where company_id =
      new.company_id;


    if not v_vat_registered then
      raise exception
        'This invoice contains VAT, but the company is not configured as VAT registered.';
    end if;

  end if;


  return new;

end;
$$;


drop trigger if exists
invoice_accounting_compliance_guard
on public.invoice;


create trigger
invoice_accounting_compliance_guard
before update of status
on public.invoice
for each row
execute function
public.invoice_accounting_compliance_guard();


-- ============================================================
-- 9. INVOICE ACCOUNTING EVENT TRIGGER
-- ============================================================

create or replace function
public.invoice_accounting_event_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  -- Issue
  if new.status =
       'issued'
     and old.status is distinct from
       new.status then

    begin

      perform
        public.post_invoice_issue_to_ledger(
          new.id
        );

    exception
      when others then

        perform
          public.record_accounting_posting_exception(
            new.company_id,
            new.branch_id,
            'invoice',
            new.id,
            'issued',
            new.invoice_date,
            sqlstate,
            sqlerrm
          );

    end;

  end if;


  -- Cancellation of a ledger-posted invoice must reverse.
  if new.status =
       'cancelled'
     and old.status is distinct from
       new.status then

    perform
      public.post_invoice_cancellation_to_ledger(
        new.id
      );

  end if;


  return new;

end;
$$;


drop trigger if exists
invoice_accounting_event_sync
on public.invoice;


create trigger
invoice_accounting_event_sync
after update of status
on public.invoice
for each row
execute function
public.invoice_accounting_event_sync();


-- ============================================================
-- 10. PAYMENT ACCOUNTING EVENT TRIGGER
--
-- Every invoice_payment row receives its own journal.
--
-- Therefore instalments such as:
--
-- 02 Sep  R2,000
-- 15 Sep  R3,000
-- 30 Sep  R5,000
--
-- become THREE independent accounting entries using their
-- actual payment dates.
-- ============================================================

create or replace function
public.invoice_payment_accounting_event_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  begin

    perform
      public.post_invoice_payment_to_ledger(
        new.id
      );

  exception
    when others then

      perform
        public.record_accounting_posting_exception(
          new.company_id,
          new.branch_id,
          'invoice_payment',
          new.id,
          'received',
          new.payment_date,
          sqlstate,
          sqlerrm
        );

  end;


  return new;

end;
$$;


drop trigger if exists
invoice_payment_accounting_event_sync
on public.invoice_payment;


create trigger
invoice_payment_accounting_event_sync
after insert
on public.invoice_payment
for each row
execute function
public.invoice_payment_accounting_event_sync();


-- ============================================================
-- 11. PAYMENT IMMUTABILITY
--
-- A receipt is financial evidence.
-- Do not rewrite amount/date/customer/invoice after recording.
-- Future corrections use reversal/refund workflows.
-- ============================================================

create or replace function
public.protect_invoice_payment_financial_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin

  if new.company_id
       is distinct from
       old.company_id

     or new.branch_id
       is distinct from
       old.branch_id

     or new.invoice_id
       is distinct from
       old.invoice_id

     or new.customer_id
       is distinct from
       old.customer_id

     or new.payment_date
       is distinct from
       old.payment_date

     or new.payment_method
       is distinct from
       old.payment_method

     or new.amount
       is distinct from
       old.amount then

    raise exception
      'Posted payment financial details are immutable. Use a reversal/refund workflow instead.';

  end if;


  return new;

end;
$$;


drop trigger if exists
invoice_payment_protect_financial_fields
on public.invoice_payment;


create trigger
invoice_payment_protect_financial_fields
before update
on public.invoice_payment
for each row
execute function
public.protect_invoice_payment_financial_fields();


create or replace function
public.prevent_invoice_payment_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin

  raise exception
    'Invoice payments cannot be deleted. Use a reversal/refund workflow instead.';

end;
$$;


drop trigger if exists
invoice_payment_prevent_delete
on public.invoice_payment;


create trigger
invoice_payment_prevent_delete
before delete
on public.invoice_payment
for each row
execute function
public.prevent_invoice_payment_delete();


-- ============================================================
-- END
-- ============================================================
