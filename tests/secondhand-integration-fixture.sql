-- ISOLATED LOCAL DATABASE ONLY. Apply after secondhand-local-fixture.sql, before
-- the new integration migration. These are interfaces verified against production.
create table public.customer (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  customer_name text not null,
  customer_number text not null,
  is_active boolean not null default true,
  phone text
);
alter table public.service_job add column job_number text not null default 'TEST-JOB';
alter table public.user_profile add column full_name text;
alter table auth.users add column email_confirmed_at timestamptz;
grant all on public.customer to anon,authenticated;
