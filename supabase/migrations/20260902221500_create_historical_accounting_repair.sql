-- ============================================================
-- JINLAB Nexus
-- Accounting Sprint 19.3E
-- Historical Invoice Accounting Repair
-- ============================================================


-- ============================================================
-- 1. REPAIR AUDIT LOG
-- ============================================================

create table if not exists
public.accounting_historical_repair_log (
  id uuid primary key
    default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  invoice_id uuid not null
    references public.invoice(id)
    on delete restrict,

  invoice_number text not null,

  invoice_journal_created boolean
    not null default false,

  payment_journals_created integer
    not null default 0
    check (
      payment_journals_created >= 0
    ),

  total_journals_created integer
    not null default 0
    check (
      total_journals_created >= 0
    ),

  repaired_by uuid
    references auth.users(id)
    on delete set null,

  repaired_at timestamptz
    not null default now(),

  details jsonb
    not null default '{}'::jsonb
);


create index if not exists
accounting_historical_repair_company_idx
on public.accounting_historical_repair_log (
  company_id,
  repaired_at desc
);


create index if not exists
accounting_historical_repair_invoice_idx
on public.accounting_historical_repair_log (
  invoice_id
);


alter table
public.accounting_historical_repair_log
enable row level security;


drop policy if exists
"accounting users view historical repair log"
on public.accounting_historical_repair_log;


create policy
"accounting users view historical repair log"
on public.accounting_historical_repair_log
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
on public.accounting_historical_repair_log
to authenticated;


revoke insert, update, delete
on public.accounting_historical_repair_log
from authenticated;


-- ============================================================
-- 2. PREVIEW ONE INVOICE REPAIR
-- ============================================================

create or replace function
public.preview_invoice_accounting_repair(
  p_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_invoice public.invoice%rowtype;

  v_customer_name text;

  v_accounting_enabled boolean := false;
  v_automatic_journals boolean := false;
  v_automatic_invoice_posting boolean := false;
  v_automatic_payment_posting boolean := false;

  v_accounting_basis text := 'accrual';

  v_invoice_journal_posted boolean := false;

  v_payment_count bigint := 0;
  v_posted_payment_count bigint := 0;
  v_missing_payment_count bigint := 0;

  v_payments jsonb :=
    '[]'::jsonb;

  v_repairable boolean := true;
  v_reason text := null;
begin

  -- ----------------------------------------------------------
  -- Security
  -- ----------------------------------------------------------

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;


  if not public.current_user_has_permission(
    'accounting.view'
  ) then
    raise exception
      'Permission denied: accounting.view';
  end if;


  v_company_id :=
    public.current_settings_company_id();


  if v_company_id is null then
    raise exception
      'Your account is not linked to a company.';
  end if;


  -- ----------------------------------------------------------
  -- Invoice
  -- ----------------------------------------------------------

  select *
  into v_invoice
  from public.invoice
  where id =
    p_invoice_id
    and company_id =
      v_company_id;


  if not found then
    raise exception
      'Invoice could not be found.';
  end if;


  select
    customer_name
  into
    v_customer_name
  from public.customer
  where id =
    v_invoice.customer_id
    and company_id =
      v_company_id;


  -- ----------------------------------------------------------
  -- Settings
  -- ----------------------------------------------------------

  select
    coalesce(
      accounting_enabled,
      false
    ),
    coalesce(
      automatic_journals,
      false
    ),
    coalesce(
      automatic_invoice_posting,
      false
    ),
    coalesce(
      automatic_payment_posting,
      false
    )

  into
    v_accounting_enabled,
    v_automatic_journals,
    v_automatic_invoice_posting,
    v_automatic_payment_posting

  from public.company_accounting_settings
  where company_id =
    v_company_id;


  select
    coalesce(
      accounting_basis,
      'accrual'
    )

  into
    v_accounting_basis

  from public.company_finance_settings
  where company_id =
    v_company_id;


  -- ----------------------------------------------------------
  -- Invoice journal state
  -- ----------------------------------------------------------

  v_invoice_journal_posted :=
    exists (
      select 1
      from public.journal_entry je

      where je.company_id =
        v_company_id

        and je.source_type =
          'invoice'

        and je.source_id =
          v_invoice.id

        and je.source_event =
          'issued'

        and je.status =
          'posted'
    );


  -- ----------------------------------------------------------
  -- Payment state
  -- ----------------------------------------------------------

  select
    count(*),

    count(*) filter (
      where payment_journal_posted
    ),

    count(*) filter (
      where not payment_journal_posted
    ),

    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'payment_id',
            payment_id,

          'payment_date',
            payment_date,

          'payment_method',
            payment_method,

          'reference',
            reference,

          'amount',
            amount,

          'journal_posted',
            payment_journal_posted
        )

        order by
          payment_date asc,
          created_at asc
      ),
      '[]'::jsonb
    )

  into
    v_payment_count,
    v_posted_payment_count,
    v_missing_payment_count,
    v_payments

  from (
    select
      ip.id as
        payment_id,

      ip.payment_date,
      ip.payment_method,
      ip.reference,
      ip.amount,
      ip.created_at,

      exists (
        select 1

        from public.journal_entry je

        where je.company_id =
          v_company_id

          and je.source_type =
            'invoice_payment'

          and je.source_id =
            ip.id

          and je.source_event =
            'received'

          and je.status =
            'posted'
      ) as
        payment_journal_posted

    from public.invoice_payment ip

    where
      ip.company_id =
        v_company_id

      and ip.invoice_id =
        v_invoice.id
  ) payment_state;


  -- ----------------------------------------------------------
  -- Repair eligibility
  -- ----------------------------------------------------------

  if v_invoice.status in (
    'draft',
    'cancelled'
  ) then

    v_repairable :=
      false;

    v_reason :=
      'Draft or cancelled invoices cannot be historically posted.';


  elsif not v_accounting_enabled then

    v_repairable :=
      false;

    v_reason :=
      'Accounting is disabled for this company.';


  elsif v_accounting_basis <>
        'accrual' then

    v_repairable :=
      false;

    v_reason :=
      'Historical repair currently supports accrual accounting only.';


  elsif not v_automatic_journals then

    v_repairable :=
      false;

    v_reason :=
      'Automatic journal generation is disabled.';


  elsif (
    not v_invoice_journal_posted
    and
    not v_automatic_invoice_posting
  ) then

    v_repairable :=
      false;

    v_reason :=
      'Automatic invoice posting is disabled.';


  elsif (
    v_missing_payment_count > 0
    and
    not v_automatic_payment_posting
  ) then

    v_repairable :=
      false;

    v_reason :=
      'Automatic payment posting is disabled.';

  end if;


  return jsonb_build_object(
    'ok',
      true,

    'invoice_id',
      v_invoice.id,

    'invoice_number',
      v_invoice.invoice_number,

    'customer_id',
      v_invoice.customer_id,

    'customer_name',
      v_customer_name,

    'invoice_date',
      v_invoice.invoice_date,

    'invoice_status',
      v_invoice.status,

    'invoice_total',
      v_invoice.total_amount,

    'invoice_journal_posted',
      v_invoice_journal_posted,

    'payment_count',
      v_payment_count,

    'posted_payment_count',
      v_posted_payment_count,

    'missing_payment_count',
      v_missing_payment_count,

    'missing_invoice_journal',
      not v_invoice_journal_posted,

    'entries_to_create',
      (
        case
          when v_invoice_journal_posted
          then 0
          else 1
        end
        +
        v_missing_payment_count
      ),

    'repairable',
      v_repairable,

    'reason',
      v_reason,

    'payments',
      v_payments
  );

end;
$$;


revoke all
on function
public.preview_invoice_accounting_repair(uuid)
from public;

grant execute
on function
public.preview_invoice_accounting_repair(uuid)
to authenticated;


-- ============================================================
-- 3. REPAIR ONE INVOICE
--
-- IMPORTANT:
--
-- - Requires accounting.journal.post
-- - One invoice per transaction
-- - Uses original invoice date
-- - Uses original payment dates
-- - Uses original payment methods
-- - Existing posting functions provide idempotency
-- - Failure rolls the entire repair back
-- ============================================================

create or replace function
public.repair_invoice_accounting_history(
  p_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_invoice public.invoice%rowtype;

  v_accounting_enabled boolean := false;
  v_automatic_journals boolean := false;
  v_automatic_invoice_posting boolean := false;
  v_automatic_payment_posting boolean := false;

  v_accounting_basis text := 'accrual';

  v_invoice_journal_before boolean := false;

  v_invoice_journal_id uuid;
  v_payment_journal_id uuid;

  v_payment record;

  v_invoice_created boolean := false;

  v_payment_created integer := 0;
  v_total_created integer := 0;

  v_created_journals jsonb :=
    '[]'::jsonb;
begin

  -- ----------------------------------------------------------
  -- Security
  -- ----------------------------------------------------------

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


  if v_company_id is null then
    raise exception
      'Your account is not linked to a company.';
  end if;


  -- Prevent two repair processes touching the same invoice.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'jinlab-accounting-repair-' ||
      p_invoice_id::text,
      0
    )
  );


  -- ----------------------------------------------------------
  -- Lock invoice
  -- ----------------------------------------------------------

  select *
  into v_invoice
  from public.invoice
  where id =
    p_invoice_id
    and company_id =
      v_company_id
  for update;


  if not found then
    raise exception
      'Invoice could not be found.';
  end if;


  if v_invoice.status in (
    'draft',
    'cancelled'
  ) then
    raise exception
      'Draft or cancelled invoices cannot be historically posted.';
  end if;


  -- ----------------------------------------------------------
  -- Accounting settings
  -- ----------------------------------------------------------

  select
    coalesce(
      accounting_enabled,
      false
    ),
    coalesce(
      automatic_journals,
      false
    ),
    coalesce(
      automatic_invoice_posting,
      false
    ),
    coalesce(
      automatic_payment_posting,
      false
    )

  into
    v_accounting_enabled,
    v_automatic_journals,
    v_automatic_invoice_posting,
    v_automatic_payment_posting

  from public.company_accounting_settings
  where company_id =
    v_company_id;


  select
    coalesce(
      accounting_basis,
      'accrual'
    )
  into
    v_accounting_basis
  from public.company_finance_settings
  where company_id =
    v_company_id;


  if not v_accounting_enabled then
    raise exception
      'Accounting is disabled for this company.';
  end if;


  if v_accounting_basis <>
     'accrual' then
    raise exception
      'Historical accounting repair currently supports accrual accounting only.';
  end if;


  if not v_automatic_journals then
    raise exception
      'Automatic journal generation is disabled.';
  end if;


  -- ----------------------------------------------------------
  -- Invoice journal
  -- ----------------------------------------------------------

  v_invoice_journal_before :=
    exists (
      select 1

      from public.journal_entry je

      where je.company_id =
        v_company_id

        and je.source_type =
          'invoice'

        and je.source_id =
          v_invoice.id

        and je.source_event =
          'issued'

        and je.status =
          'posted'
    );


  if not v_invoice_journal_before then

    if not v_automatic_invoice_posting then
      raise exception
        'Automatic invoice posting is disabled.';
    end if;


    v_invoice_journal_id :=
      public.post_invoice_issue_to_ledger(
        v_invoice.id
      );


    if v_invoice_journal_id is null then
      raise exception
        'Invoice journal could not be created.';
    end if;


    v_invoice_created :=
      true;

    v_total_created :=
      v_total_created + 1;


    v_created_journals :=
      v_created_journals ||
      jsonb_build_array(
        jsonb_build_object(
          'type',
            'invoice',

          'journal_id',
            v_invoice_journal_id,

          'date',
            v_invoice.invoice_date
        )
      );

  end if;


  -- ----------------------------------------------------------
  -- Missing payment journals
  -- ----------------------------------------------------------

  for v_payment in

    select
      ip.*

    from public.invoice_payment ip

    where
      ip.company_id =
        v_company_id

      and ip.invoice_id =
        v_invoice.id

      and not exists (
        select 1

        from public.journal_entry je

        where je.company_id =
          v_company_id

          and je.source_type =
            'invoice_payment'

          and je.source_id =
            ip.id

          and je.source_event =
            'received'

          and je.status =
            'posted'
      )

    order by
      ip.payment_date asc,
      ip.created_at asc,
      ip.id asc

  loop

    if not v_automatic_payment_posting then
      raise exception
        'Automatic payment posting is disabled.';
    end if;


    v_payment_journal_id :=
      public.post_invoice_payment_to_ledger(
        v_payment.id
      );


    if v_payment_journal_id is null then
      raise exception
        'Payment journal could not be created for payment %.',
        v_payment.id;
    end if;


    v_payment_created :=
      v_payment_created + 1;

    v_total_created :=
      v_total_created + 1;


    v_created_journals :=
      v_created_journals ||
      jsonb_build_array(
        jsonb_build_object(
          'type',
            'payment',

          'payment_id',
            v_payment.id,

          'journal_id',
            v_payment_journal_id,

          'payment_date',
            v_payment.payment_date,

          'payment_method',
            v_payment.payment_method,

          'amount',
            v_payment.amount
        )
      );

  end loop;


  -- ----------------------------------------------------------
  -- Immutable repair audit
  -- ----------------------------------------------------------

  insert into
  public.accounting_historical_repair_log (
    company_id,
    invoice_id,
    invoice_number,

    invoice_journal_created,
    payment_journals_created,
    total_journals_created,

    repaired_by,

    details
  )
  values (
    v_company_id,
    v_invoice.id,
    v_invoice.invoice_number,

    v_invoice_created,
    v_payment_created,
    v_total_created,

    auth.uid(),

    jsonb_build_object(
      'invoice_date',
        v_invoice.invoice_date,

      'invoice_status',
        v_invoice.status,

      'journals',
        v_created_journals
    )
  );


  return jsonb_build_object(
    'ok',
      true,

    'invoice_id',
      v_invoice.id,

    'invoice_number',
      v_invoice.invoice_number,

    'invoice_journal_created',
      v_invoice_created,

    'payment_journals_created',
      v_payment_created,

    'total_journals_created',
      v_total_created,

    'already_reconciled',
      v_total_created = 0,

    'journals',
      v_created_journals
  );

end;
$$;


revoke all
on function
public.repair_invoice_accounting_history(uuid)
from public;

grant execute
on function
public.repair_invoice_accounting_history(uuid)
to authenticated;


-- ============================================================
-- END
-- ============================================================
