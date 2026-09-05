-- JINLAB Nexus - Invoice Payment Plans / Lay-bys

create table if not exists public.invoice_payment_plan (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid not null references public.branch(id) on delete restrict,
  invoice_id uuid not null references public.invoice(id) on delete cascade,
  customer_id uuid not null references public.customer(id) on delete restrict,

  plan_type text not null default 'instalment'
    check (plan_type in ('layby','instalment','account')),

  status text not null default 'active'
    check (status in ('draft','active','completed','cancelled','defaulted')),

  total_amount numeric(14,2) not null check (total_amount > 0),
  deposit_amount numeric(14,2) not null default 0 check (deposit_amount >= 0),
  instalment_amount numeric(14,2) check (instalment_amount > 0),

  frequency text
    check (frequency is null or frequency in ('weekly','fortnightly','monthly','custom')),

  start_date date not null default current_date,
  next_payment_date date,
  expected_completion_date date,

  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoice_payment_plan_company_idx
  on public.invoice_payment_plan(company_id);

create index if not exists invoice_payment_plan_invoice_idx
  on public.invoice_payment_plan(invoice_id);

create index if not exists invoice_payment_plan_customer_idx
  on public.invoice_payment_plan(customer_id);

create unique index if not exists invoice_payment_plan_active_invoice_idx
  on public.invoice_payment_plan(invoice_id)
  where status in ('draft','active');

create table if not exists public.invoice_payment_plan_installment (
  id uuid primary key default gen_random_uuid(),
  payment_plan_id uuid not null references public.invoice_payment_plan(id) on delete cascade,
  company_id uuid not null references public.company(id) on delete cascade,
  invoice_id uuid not null references public.invoice(id) on delete cascade,

  installment_number integer not null check (installment_number > 0),
  due_date date not null,
  amount_due numeric(14,2) not null check (amount_due > 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),

  status text not null default 'pending'
    check (status in ('pending','partially_paid','paid','overdue','cancelled')),

  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(payment_plan_id, installment_number)
);

create index if not exists payment_plan_installment_plan_idx
  on public.invoice_payment_plan_installment(payment_plan_id);

create index if not exists payment_plan_installment_due_idx
  on public.invoice_payment_plan_installment(company_id, due_date);

alter table public.invoice_payment
  add column if not exists payment_plan_id uuid
    references public.invoice_payment_plan(id) on delete set null;

alter table public.invoice_payment
  add column if not exists installment_id uuid
    references public.invoice_payment_plan_installment(id) on delete set null;

alter table public.invoice_payment
  add column if not exists payment_source text not null default 'manual'
    check (payment_source in ('manual','payment_link','gateway','pos'));

create index if not exists invoice_payment_plan_link_idx
  on public.invoice_payment(payment_plan_id);

create index if not exists invoice_payment_installment_link_idx
  on public.invoice_payment(installment_id);

alter table public.invoice_payment_plan enable row level security;
alter table public.invoice_payment_plan_installment enable row level security;

create policy "payment_plan_company_read"
on public.invoice_payment_plan
for select to authenticated
using (
  company_id = (
    select up.company_id
    from public.user_profile up
    where up.user_id = auth.uid()
  )
);

create policy "payment_plan_company_write"
on public.invoice_payment_plan
for all to authenticated
using (
  company_id = (
    select up.company_id
    from public.user_profile up
    where up.user_id = auth.uid()
  )
)
with check (
  company_id = (
    select up.company_id
    from public.user_profile up
    where up.user_id = auth.uid()
  )
);

create policy "payment_installment_company_read"
on public.invoice_payment_plan_installment
for select to authenticated
using (
  company_id = (
    select up.company_id
    from public.user_profile up
    where up.user_id = auth.uid()
  )
);

create policy "payment_installment_company_write"
on public.invoice_payment_plan_installment
for all to authenticated
using (
  company_id = (
    select up.company_id
    from public.user_profile up
    where up.user_id = auth.uid()
  )
)
with check (
  company_id = (
    select up.company_id
    from public.user_profile up
    where up.user_id = auth.uid()
  )
);
