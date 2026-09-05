-- ============================================================
-- JINLAB Nexus
-- Accounting Sprint 19.1A
-- Core Double-Entry Ledger Foundation
-- ============================================================


-- ============================================================
-- 1. CHART OF ACCOUNTS
-- ============================================================

create table if not exists public.accounting_account (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  parent_account_id uuid
    references public.accounting_account(id)
    on delete restrict,

  code text not null,

  name text not null,

  description text,

  account_type text not null
    check (
      account_type in (
        'asset',
        'liability',
        'equity',
        'revenue',
        'expense'
      )
    ),

  account_subtype text,

  normal_balance text not null
    check (
      normal_balance in (
        'debit',
        'credit'
      )
    ),

  system_key text,

  is_system boolean
    not null default false,

  allow_manual_posting boolean
    not null default true,

  is_active boolean
    not null default true,

  created_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  unique (
    company_id,
    code
  )
);


create unique index if not exists
accounting_account_system_key_unique_idx
on public.accounting_account (
  company_id,
  system_key
)
where system_key is not null;


create index if not exists
accounting_account_company_idx
on public.accounting_account (
  company_id
);


create index if not exists
accounting_account_type_idx
on public.accounting_account (
  company_id,
  account_type
);


create index if not exists
accounting_account_active_idx
on public.accounting_account (
  company_id,
  is_active
);


drop trigger if exists
accounting_account_set_updated_at
on public.accounting_account;

create trigger
accounting_account_set_updated_at
before update
on public.accounting_account
for each row
execute function public.set_updated_at();


-- ============================================================
-- 2. ACCOUNTING PERIODS
-- ============================================================

create table if not exists public.accounting_period (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  name text not null,

  start_date date not null,

  end_date date not null,

  status text not null default 'open'
    check (
      status in (
        'open',
        'closed',
        'locked'
      )
    ),

  is_adjustment_period boolean
    not null default false,

  closed_at timestamptz,

  closed_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  check (
    end_date >= start_date
  ),

  unique (
    company_id,
    start_date,
    end_date
  )
);


create index if not exists
accounting_period_company_idx
on public.accounting_period (
  company_id
);


create index if not exists
accounting_period_dates_idx
on public.accounting_period (
  company_id,
  start_date,
  end_date
);


create index if not exists
accounting_period_status_idx
on public.accounting_period (
  company_id,
  status
);


drop trigger if exists
accounting_period_set_updated_at
on public.accounting_period;

create trigger
accounting_period_set_updated_at
before update
on public.accounting_period
for each row
execute function public.set_updated_at();


-- ============================================================
-- 3. JOURNAL ENTRY
-- One business transaction.
-- ============================================================

create table if not exists public.journal_entry (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  branch_id uuid
    references public.branch(id)
    on delete restrict,

  accounting_period_id uuid
    references public.accounting_period(id)
    on delete restrict,

  entry_number text not null,

  entry_date date not null
    default current_date,

  description text not null,

  reference text,

  source_type text not null
    default 'manual'
    check (
      source_type in (
        'manual',
        'invoice',
        'invoice_payment',
        'purchase',
        'supplier_payment',
        'expense',
        'bank_transaction',
        'pos_sale',
        'opening_balance',
        'adjustment',
        'reversal'
      )
    ),

  source_id uuid,

  source_event text,

  currency text not null
    default 'ZAR',

  status text not null
    default 'draft'
    check (
      status in (
        'draft',
        'posted'
      )
    ),

  total_debit numeric(14,2)
    not null default 0
    check (
      total_debit >= 0
    ),

  total_credit numeric(14,2)
    not null default 0
    check (
      total_credit >= 0
    ),

  reversal_of_entry_id uuid
    references public.journal_entry(id)
    on delete restrict,

  created_by uuid
    references auth.users(id)
    on delete set null,

  posted_by uuid
    references auth.users(id)
    on delete set null,

  posted_at timestamptz,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  unique (
    company_id,
    entry_number
  )
);


create unique index if not exists
journal_entry_source_event_unique_idx
on public.journal_entry (
  company_id,
  source_type,
  source_id,
  source_event
)
where
  source_id is not null
  and source_event is not null;


create index if not exists
journal_entry_company_idx
on public.journal_entry (
  company_id
);


create index if not exists
journal_entry_date_idx
on public.journal_entry (
  company_id,
  entry_date desc
);


create index if not exists
journal_entry_status_idx
on public.journal_entry (
  company_id,
  status
);


create index if not exists
journal_entry_source_idx
on public.journal_entry (
  company_id,
  source_type,
  source_id
);


drop trigger if exists
journal_entry_set_updated_at
on public.journal_entry;

create trigger
journal_entry_set_updated_at
before update
on public.journal_entry
for each row
execute function public.set_updated_at();


-- ============================================================
-- 4. JOURNAL LINES
-- Every posted journal must balance:
-- Total Debit = Total Credit.
-- ============================================================

create table if not exists public.journal_line (
  id uuid primary key default gen_random_uuid(),

  journal_entry_id uuid not null
    references public.journal_entry(id)
    on delete cascade,

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  account_id uuid not null
    references public.accounting_account(id)
    on delete restrict,

  line_number integer not null
    check (
      line_number > 0
    ),

  description text,

  debit numeric(14,2)
    not null default 0
    check (
      debit >= 0
    ),

  credit numeric(14,2)
    not null default 0
    check (
      credit >= 0
    ),

  customer_id uuid
    references public.customer(id)
    on delete restrict,

  metadata jsonb
    not null default '{}'::jsonb,

  created_at timestamptz
    not null default now(),

  check (
    (
      debit > 0
      and credit = 0
    )
    or
    (
      credit > 0
      and debit = 0
    )
  ),

  unique (
    journal_entry_id,
    line_number
  )
);


create index if not exists
journal_line_entry_idx
on public.journal_line (
  journal_entry_id
);


create index if not exists
journal_line_company_idx
on public.journal_line (
  company_id
);


create index if not exists
journal_line_account_idx
on public.journal_line (
  company_id,
  account_id
);


-- ============================================================
-- 5. VALIDATE JOURNAL LINE OWNERSHIP
-- Prevent cross-company account / journal mixing.
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

  return new;

end;
$$;


drop trigger if exists
journal_line_validate_company
on public.journal_line;

create trigger
journal_line_validate_company
before insert or update
on public.journal_line
for each row
execute function
public.validate_journal_line_company();


-- ============================================================
-- 6. JOURNAL TOTALS
-- Database is authoritative.
-- ============================================================

create or replace function
public.refresh_journal_entry_totals(
  p_journal_entry_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_debit numeric(14,2);
  v_total_credit numeric(14,2);
begin

  select
    coalesce(
      sum(debit),
      0
    ),
    coalesce(
      sum(credit),
      0
    )
  into
    v_total_debit,
    v_total_credit
  from public.journal_line
  where journal_entry_id =
    p_journal_entry_id;

  update public.journal_entry
  set
    total_debit =
      v_total_debit,
    total_credit =
      v_total_credit
  where id =
    p_journal_entry_id;

end;
$$;


create or replace function
public.journal_line_refresh_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  if tg_op = 'DELETE' then

    perform
      public.refresh_journal_entry_totals(
        old.journal_entry_id
      );

    return old;

  end if;

  perform
    public.refresh_journal_entry_totals(
      new.journal_entry_id
    );

  if tg_op = 'UPDATE'
     and old.journal_entry_id <>
         new.journal_entry_id then

    perform
      public.refresh_journal_entry_totals(
        old.journal_entry_id
      );

  end if;

  return new;

end;
$$;


drop trigger if exists
journal_line_refresh_parent
on public.journal_line;

create trigger
journal_line_refresh_parent
after insert or update or delete
on public.journal_line
for each row
execute function
public.journal_line_refresh_parent();


-- ============================================================
-- 7. IMMUTABILITY
-- Posted financial history cannot be edited or deleted.
-- Corrections will use reversal journals.
-- ============================================================

create or replace function
public.prevent_posted_journal_entry_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  if old.status = 'posted' then
    raise exception
      'Posted journal entries are immutable. Create a reversal instead.';
  end if;

  return new;

end;
$$;


drop trigger if exists
journal_entry_prevent_posted_update
on public.journal_entry;

create trigger
journal_entry_prevent_posted_update
before update
on public.journal_entry
for each row
execute function
public.prevent_posted_journal_entry_mutation();


drop trigger if exists
journal_entry_prevent_posted_delete
on public.journal_entry;

create trigger
journal_entry_prevent_posted_delete
before delete
on public.journal_entry
for each row
execute function
public.prevent_posted_journal_entry_mutation();


create or replace function
public.prevent_posted_journal_line_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_status text;
begin

  v_entry_id :=
    case
      when tg_op = 'DELETE'
      then old.journal_entry_id
      else new.journal_entry_id
    end;

  select status
  into v_status
  from public.journal_entry
  where id =
    v_entry_id;

  if v_status = 'posted' then
    raise exception
      'Lines belonging to a posted journal are immutable.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;

end;
$$;


drop trigger if exists
journal_line_prevent_posted_insert
on public.journal_line;

create trigger
journal_line_prevent_posted_insert
before insert
on public.journal_line
for each row
execute function
public.prevent_posted_journal_line_mutation();


drop trigger if exists
journal_line_prevent_posted_update
on public.journal_line;

create trigger
journal_line_prevent_posted_update
before update
on public.journal_line
for each row
execute function
public.prevent_posted_journal_line_mutation();


drop trigger if exists
journal_line_prevent_posted_delete
on public.journal_line;

create trigger
journal_line_prevent_posted_delete
before delete
on public.journal_line
for each row
execute function
public.prevent_posted_journal_line_mutation();


-- ============================================================
-- 8. ROW LEVEL SECURITY
-- Financial writes will go through controlled RPCs.
-- ============================================================

alter table
public.accounting_account
enable row level security;

alter table
public.accounting_period
enable row level security;

alter table
public.journal_entry
enable row level security;

alter table
public.journal_line
enable row level security;


create policy
"company members read accounting accounts"
on public.accounting_account
for select
to authenticated
using (
  company_id in (
    select company_id
    from public.user_profile
    where user_id =
      auth.uid()
  )
);


create policy
"company members read accounting periods"
on public.accounting_period
for select
to authenticated
using (
  company_id in (
    select company_id
    from public.user_profile
    where user_id =
      auth.uid()
  )
);


create policy
"company members read journal entries"
on public.journal_entry
for select
to authenticated
using (
  company_id in (
    select company_id
    from public.user_profile
    where user_id =
      auth.uid()
  )
);


create policy
"company members read journal lines"
on public.journal_line
for select
to authenticated
using (
  company_id in (
    select company_id
    from public.user_profile
    where user_id =
      auth.uid()
  )
);


revoke insert, update, delete
on public.accounting_account
from authenticated;

revoke insert, update, delete
on public.accounting_period
from authenticated;

revoke insert, update, delete
on public.journal_entry
from authenticated;

revoke insert, update, delete
on public.journal_line
from authenticated;


grant select
on public.accounting_account
to authenticated;

grant select
on public.accounting_period
to authenticated;

grant select
on public.journal_entry
to authenticated;

grant select
on public.journal_line
to authenticated;


-- ============================================================
-- 9. ACCOUNTING RBAC
-- ============================================================

insert into public.permissions (
  permission_name
)
values
  ('accounting.view'),
  ('accounting.accounts.manage'),
  ('accounting.journal.create'),
  ('accounting.journal.post'),
  ('accounting.period.manage')
on conflict (
  permission_name
)
do nothing;


-- OWNER / ADMIN
insert into public.role_permissions (
  role_id,
  permission_id
)
select
  r.id,
  p.id
from public.roles r
cross join public.permissions p
where
  r.role_name in (
    'owner',
    'admin'
  )
  and p.permission_name like
    'accounting.%'
on conflict (
  role_id,
  permission_id
)
do nothing;


-- MANAGER
-- Can inspect accounting and prepare journals,
-- but posting / period control is not automatic.
insert into public.role_permissions (
  role_id,
  permission_id
)
select
  r.id,
  p.id
from public.roles r
join public.permissions p
  on p.permission_name in (
    'accounting.view',
    'accounting.journal.create'
  )
where
  r.role_name = 'manager'
on conflict (
  role_id,
  permission_id
)
do nothing;


-- ============================================================
-- END ACCOUNTING LEDGER FOUNDATION
-- ============================================================
