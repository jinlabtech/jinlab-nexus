create table if not exists public.invoice_payment_link (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null,
  branch_id uuid not null,
  invoice_id uuid not null references public.invoice(id) on delete cascade,
  customer_id uuid not null,

  payment_plan_id uuid null references public.invoice_payment_plan(id) on delete set null,
  installment_id uuid null references public.invoice_payment_plan_installment(id) on delete set null,

  link_type text not null check (
    link_type in (
      'full_balance',
      'fixed_amount',
      'next_installment',
      'customer_entered'
    )
  ),

  token text not null unique,

  amount numeric(14,2) null check (amount is null or amount > 0),
  minimum_amount numeric(14,2) null check (minimum_amount is null or minimum_amount >= 0),
  maximum_amount numeric(14,2) null check (maximum_amount is null or maximum_amount > 0),

  currency text not null default 'ZAR',

  status text not null default 'active' check (
    status in (
      'active',
      'paid',
      'expired',
      'cancelled'
    )
  ),

  expires_at timestamptz null,

  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoice_payment_link_company_idx
  on public.invoice_payment_link(company_id);

create index if not exists invoice_payment_link_invoice_idx
  on public.invoice_payment_link(invoice_id);

create index if not exists invoice_payment_link_plan_idx
  on public.invoice_payment_link(payment_plan_id);

create index if not exists invoice_payment_link_status_idx
  on public.invoice_payment_link(status);

create table if not exists public.payment_gateway_transaction (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null,
  branch_id uuid not null,
  invoice_id uuid not null references public.invoice(id) on delete cascade,
  customer_id uuid not null,

  payment_link_id uuid null references public.invoice_payment_link(id) on delete set null,
  payment_plan_id uuid null references public.invoice_payment_plan(id) on delete set null,
  installment_id uuid null references public.invoice_payment_plan_installment(id) on delete set null,

  provider text not null,
  provider_transaction_id text null,
  provider_reference text null,

  payment_method text null,

  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'ZAR',

  status text not null default 'pending' check (
    status in (
      'pending',
      'processing',
      'paid',
      'failed',
      'expired',
      'cancelled',
      'refunded'
    )
  ),

  gateway_fee numeric(14,2) null check (
    gateway_fee is null or gateway_fee >= 0
  ),

  failure_reason text null,

  idempotency_key text not null unique,

  provider_payload jsonb null,

  paid_at timestamptz null,
  verified_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payment_gateway_provider_transaction_idx
  on public.payment_gateway_transaction(
    provider,
    provider_transaction_id
  )
  where provider_transaction_id is not null;

create index if not exists payment_gateway_company_idx
  on public.payment_gateway_transaction(company_id);

create index if not exists payment_gateway_invoice_idx
  on public.payment_gateway_transaction(invoice_id);

create index if not exists payment_gateway_link_idx
  on public.payment_gateway_transaction(payment_link_id);

create index if not exists payment_gateway_status_idx
  on public.payment_gateway_transaction(status);

alter table public.invoice_payment
  add column if not exists gateway_transaction_id uuid null
  references public.payment_gateway_transaction(id)
  on delete set null;

alter table public.invoice_payment
  add column if not exists gateway_provider text null;

create index if not exists invoice_payment_gateway_transaction_idx
  on public.invoice_payment(gateway_transaction_id);

alter table public.invoice_payment_link enable row level security;
alter table public.payment_gateway_transaction enable row level security;

drop policy if exists "invoice_payment_link_select_company"
on public.invoice_payment_link;

create policy "invoice_payment_link_select_company"
on public.invoice_payment_link
for select
using (
  company_id in (
    select up.company_id
    from public.user_profile up
    where up.user_id = auth.uid()
  )
);

drop policy if exists "invoice_payment_link_insert_company"
on public.invoice_payment_link;

create policy "invoice_payment_link_insert_company"
on public.invoice_payment_link
for insert
with check (
  company_id in (
    select up.company_id
    from public.user_profile up
    where up.user_id = auth.uid()
  )
);

drop policy if exists "invoice_payment_link_update_company"
on public.invoice_payment_link;

create policy "invoice_payment_link_update_company"
on public.invoice_payment_link
for update
using (
  company_id in (
    select up.company_id
    from public.user_profile up
    where up.user_id = auth.uid()
  )
)
with check (
  company_id in (
    select up.company_id
    from public.user_profile up
    where up.user_id = auth.uid()
  )
);

drop policy if exists "payment_gateway_transaction_select_company"
on public.payment_gateway_transaction;

create policy "payment_gateway_transaction_select_company"
on public.payment_gateway_transaction
for select
using (
  company_id in (
    select up.company_id
    from public.user_profile up
    where up.user_id = auth.uid()
  )
);
