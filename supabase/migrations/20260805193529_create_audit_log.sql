-- JINLAB Nexus audit log foundation
-- Records important actions performed by authenticated users.

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),

  company_id uuid
    references public.company(id)
    on delete set null,

  user_id uuid
    references auth.users(id)
    on delete set null,

  action text not null,
  module text not null,

  record_id uuid,

  description text not null,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

-- Improve common audit-log searches.
create index if not exists audit_log_company_id_idx
  on public.audit_log(company_id);

create index if not exists audit_log_user_id_idx
  on public.audit_log(user_id);

create index if not exists audit_log_module_idx
  on public.audit_log(module);

create index if not exists audit_log_created_at_idx
  on public.audit_log(created_at desc);

-- Enable Row Level Security.
alter table public.audit_log enable row level security;

-- Users may view audit records belonging to their own company.
create policy "Users can view their company audit logs"
on public.audit_log
for select
to authenticated
using (
  company_id in (
    select user_profile.company_id
    from public.user_profile
    where user_profile.user_id = auth.uid()
  )
);

-- Users may create audit records only for their own company.
create policy "Users can create their company audit logs"
on public.audit_log
for insert
to authenticated
with check (
  user_id = auth.uid()
  and company_id in (
    select user_profile.company_id
    from public.user_profile
    where user_profile.user_id = auth.uid()
  )
);

-- Audit records are intentionally not editable or deletable
-- through the application.
