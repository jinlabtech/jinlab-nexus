create table if not exists public.external_migration_reference (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.company(id) on delete cascade,
    source_system text not null,
    entity_type text not null,
    external_id text not null,
    nexus_id uuid not null,
    imported_at timestamptz not null default now(),
    metadata jsonb not null default '{}'::jsonb,
    unique (company_id, source_system, entity_type, external_id)
);

create index if not exists external_migration_reference_company_idx
    on public.external_migration_reference(company_id);

create index if not exists external_migration_reference_lookup_idx
    on public.external_migration_reference(company_id, source_system, entity_type, external_id);

alter table public.external_migration_reference enable row level security;

create policy "Company users can view migration references"
on public.external_migration_reference
for select
to authenticated
using (
  company_id in (
    select company_id from public.user_profile where user_id = auth.uid()
  )
);;
