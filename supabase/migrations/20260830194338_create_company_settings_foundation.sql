-- ============================================================
-- JINLAB NEXUS
-- Sprint 18.14
-- Company Settings Foundation
-- ============================================================


-- ============================================================
-- 1. COMPANY PROFILE SETTINGS
-- Legal / operational company identity.
-- ============================================================

create table if not exists public.company_profile_settings (
  company_id uuid primary key
    references public.company(id) on delete cascade,

  legal_name text,
  trading_name text,
  registration_number text,

  business_type text,
  industry text,

  email text,
  phone text,
  website text,

  physical_address text,
  postal_address text,

  country_code text not null default 'ZA',
  province text,
  city text,

  timezone text not null default 'Africa/Johannesburg',

  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);


-- ============================================================
-- 2. DOCUMENT / BRANDING SETTINGS
-- This is DIFFERENT from company profile.
-- Controls how Nexus-generated documents look.
-- ============================================================

create table if not exists public.company_document_settings (
  company_id uuid primary key
    references public.company(id) on delete cascade,

  logo_path text,

  document_display_name text,

  show_registration_number boolean not null default true,
  show_vat_number boolean not null default true,
  show_company_address boolean not null default true,
  show_company_phone boolean not null default true,
  show_company_email boolean not null default true,
  show_company_website boolean not null default false,

  document_footer text,

  invoice_footer text,
  quotation_footer text,

  default_invoice_template text
    not null default 'jinlab-signature',

  default_quotation_template text
    not null default 'jinlab-signature',

  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);


-- ============================================================
-- 3. FINANCE SETTINGS
-- Company-wide financial behaviour.
-- ============================================================

create table if not exists public.company_finance_settings (
  company_id uuid primary key
    references public.company(id) on delete cascade,

  base_currency text not null default 'ZAR',

  financial_year_start_month integer
    not null default 3
    check (
      financial_year_start_month between 1 and 12
    ),

  accounting_basis text
    not null default 'accrual'
    check (
      accounting_basis in ('accrual', 'cash')
    ),

  vat_registered boolean not null default false,

  vat_number text,

  default_vat_rate numeric(5,2)
    not null default 15.00
    check (
      default_vat_rate >= 0
      and default_vat_rate <= 100
    ),

  prices_include_vat boolean not null default true,

  default_customer_payment_days integer
    not null default 30
    check (
      default_customer_payment_days >= 0
    ),

  default_supplier_payment_days integer
    not null default 30
    check (
      default_supplier_payment_days >= 0
    ),

  allow_customer_credit boolean not null default true,

  default_customer_credit_limit numeric(14,2)
    not null default 0
    check (
      default_customer_credit_limit >= 0
    ),

  rounding_method text
    not null default 'standard'
    check (
      rounding_method in (
        'standard',
        'up',
        'down',
        'none'
      )
    ),

  lock_accounting_before date,

  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);


-- ============================================================
-- 4. ACCOUNTING AUTOMATION SETTINGS
-- Foundation for Nexus Accountant.
-- ============================================================

create table if not exists public.company_accounting_settings (
  company_id uuid primary key
    references public.company(id) on delete cascade,

  accounting_enabled boolean not null default true,

  automatic_journals boolean not null default true,

  automatic_invoice_posting boolean not null default true,

  automatic_payment_posting boolean not null default true,

  automatic_purchase_posting boolean not null default true,

  automatic_expense_classification boolean not null default false,

  automatic_bank_matching boolean not null default false,

  nexus_accountant_enabled boolean not null default false,

  ai_explanations_enabled boolean not null default true,

  ai_recommendations_enabled boolean not null default true,

  ai_auto_classify_enabled boolean not null default false,

  ai_auto_post_enabled boolean not null default false,

  ai_confidence_threshold numeric(5,2)
    not null default 95.00
    check (
      ai_confidence_threshold >= 0
      and ai_confidence_threshold <= 100
    ),

  transaction_approval_threshold numeric(14,2)
    not null default 10000.00
    check (
      transaction_approval_threshold >= 0
    ),

  require_manual_journal_approval boolean
    not null default true,

  require_vat_adjustment_approval boolean
    not null default true,

  require_period_reopen_approval boolean
    not null default true,

  require_tax_submission_approval boolean
    not null default true,

  uncertain_transaction_action text
    not null default 'ask'
    check (
      uncertain_transaction_action in (
        'ask',
        'hold',
        'manual_review'
      )
    ),

  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);


-- ============================================================
-- 5. BRANCH POLICY SETTINGS
-- Company-wide rules governing branch behaviour.
-- ============================================================

create table if not exists public.company_branch_settings (
  company_id uuid primary key
    references public.company(id) on delete cascade,

  isolate_stock_by_branch boolean not null default true,

  isolate_sales_by_branch boolean not null default true,

  customer_visibility text
    not null default 'company'
    check (
      customer_visibility in (
        'company',
        'branch'
      )
    ),

  require_branch_on_sales boolean not null default true,

  require_branch_on_purchases boolean not null default true,

  use_branch_address_on_invoice boolean not null default true,

  use_branch_contact_on_documents boolean not null default true,

  branch_document_numbering text
    not null default 'company'
    check (
      branch_document_numbering in (
        'company',
        'branch'
      )
    ),

  cross_branch_stock_transfer_enabled boolean
    not null default true,

  cross_branch_transfer_requires_approval boolean
    not null default true,

  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);


-- ============================================================
-- 6. SECURITY / GOVERNANCE SETTINGS
-- ============================================================

create table if not exists public.company_security_settings (
  company_id uuid primary key
    references public.company(id) on delete cascade,

  require_sensitive_action_confirmation boolean
    not null default true,

  require_stock_adjustment_approval boolean
    not null default true,

  require_invoice_cancellation_approval boolean
    not null default true,

  require_financial_delete_approval boolean
    not null default true,

  prevent_role_escalation boolean
    not null default true,

  audit_admin_changes boolean
    not null default true,

  session_timeout_minutes integer
    not null default 480
    check (
      session_timeout_minutes between 15 and 10080
    ),

  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);


-- ============================================================
-- 7. BANK ACCOUNTS
-- Multiple real bank accounts per company.
-- ============================================================

create table if not exists public.company_bank_account (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id) on delete cascade,

  bank_name text not null,

  account_name text not null,

  account_number text not null,

  account_type text,

  branch_code text,

  swift_code text,

  currency text not null default 'ZAR',

  is_default boolean not null default false,

  show_on_documents boolean not null default true,

  is_active boolean not null default true,

  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


create index if not exists
company_bank_account_company_id_idx
on public.company_bank_account(company_id);


-- ============================================================
-- 8. SETTINGS CHANGE LOG
-- Administrative configuration audit history.
-- ============================================================

create table if not exists public.settings_change_log (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id) on delete cascade,

  setting_area text not null,

  action text not null,

  changed_by uuid references auth.users(id),

  changed_at timestamptz not null default now(),

  details jsonb not null default '{}'::jsonb
);


create index if not exists
settings_change_log_company_id_idx
on public.settings_change_log(
  company_id,
  changed_at desc
);


-- ============================================================
-- 9. AUTOMATIC updated_at
-- ============================================================

create or replace function public.touch_company_setting()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;


drop trigger if exists
company_profile_settings_touch
on public.company_profile_settings;

create trigger company_profile_settings_touch
before update on public.company_profile_settings
for each row
execute function public.touch_company_setting();


drop trigger if exists
company_document_settings_touch
on public.company_document_settings;

create trigger company_document_settings_touch
before update on public.company_document_settings
for each row
execute function public.touch_company_setting();


drop trigger if exists
company_finance_settings_touch
on public.company_finance_settings;

create trigger company_finance_settings_touch
before update on public.company_finance_settings
for each row
execute function public.touch_company_setting();


drop trigger if exists
company_accounting_settings_touch
on public.company_accounting_settings;

create trigger company_accounting_settings_touch
before update on public.company_accounting_settings
for each row
execute function public.touch_company_setting();


drop trigger if exists
company_branch_settings_touch
on public.company_branch_settings;

create trigger company_branch_settings_touch
before update on public.company_branch_settings
for each row
execute function public.touch_company_setting();


drop trigger if exists
company_security_settings_touch
on public.company_security_settings;

create trigger company_security_settings_touch
before update on public.company_security_settings
for each row
execute function public.touch_company_setting();


-- ============================================================
-- 10. DEFAULT SETTINGS FOR EXISTING COMPANIES
-- ============================================================

insert into public.company_profile_settings (
  company_id,
  legal_name
)
select
  id,
  company_name
from public.company
on conflict (company_id) do nothing;


insert into public.company_document_settings (
  company_id,
  logo_path,
  document_display_name,
  document_footer
)
select
  id,
  logo_path,
  coalesce(trading_name, company_name),
  document_footer
from public.company
on conflict (company_id) do nothing;


insert into public.company_finance_settings (
  company_id,
  vat_registered,
  vat_number
)
select
  id,
  coalesce(vat_registered, false),
  vat_number
from public.company
on conflict (company_id) do nothing;


insert into public.company_accounting_settings (
  company_id
)
select id
from public.company
on conflict (company_id) do nothing;


insert into public.company_branch_settings (
  company_id
)
select id
from public.company
on conflict (company_id) do nothing;


insert into public.company_security_settings (
  company_id
)
select id
from public.company
on conflict (company_id) do nothing;


-- ============================================================
-- 11. ROW LEVEL SECURITY
-- READ: settings.view
-- We use the existing company membership relationship.
-- Writes are further protected by frontend/service permissions
-- now, with RPC-based authoritative writes coming next.
-- ============================================================

alter table public.company_profile_settings
enable row level security;

alter table public.company_document_settings
enable row level security;

alter table public.company_finance_settings
enable row level security;

alter table public.company_accounting_settings
enable row level security;

alter table public.company_branch_settings
enable row level security;

alter table public.company_security_settings
enable row level security;

alter table public.company_bank_account
enable row level security;

alter table public.settings_change_log
enable row level security;


-- ============================================================
-- COMPANY MEMBERSHIP READ POLICIES
-- ============================================================

create policy "company members read profile settings"
on public.company_profile_settings
for select
using (
  company_id in (
    select up.company_id
    from public.user_profile up
    where up.user_id = auth.uid()
  )
);


create policy "company members read document settings"
on public.company_document_settings
for select
using (
  company_id in (
    select up.company_id
    from public.user_profile up
    where up.user_id = auth.uid()
  )
);


create policy "company members read finance settings"
on public.company_finance_settings
for select
using (
  company_id in (
    select up.company_id
    from public.user_profile up
    where up.user_id = auth.uid()
  )
);


create policy "company members read accounting settings"
on public.company_accounting_settings
for select
using (
  company_id in (
    select up.company_id
    from public.user_profile up
    where up.user_id = auth.uid()
  )
);


create policy "company members read branch settings"
on public.company_branch_settings
for select
using (
  company_id in (
    select up.company_id
    from public.user_profile up
    where up.user_id = auth.uid()
  )
);


create policy "company members read security settings"
on public.company_security_settings
for select
using (
  company_id in (
    select up.company_id
    from public.user_profile up
    where up.user_id = auth.uid()
  )
);


create policy "company members read bank accounts"
on public.company_bank_account
for select
using (
  company_id in (
    select up.company_id
    from public.user_profile up
    where up.user_id = auth.uid()
  )
);


create policy "company members read settings history"
on public.settings_change_log
for select
using (
  company_id in (
    select up.company_id
    from public.user_profile up
    where up.user_id = auth.uid()
  )
);

