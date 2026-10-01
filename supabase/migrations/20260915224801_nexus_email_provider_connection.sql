-- Nexus Email Provider Connection Foundation
-- Provider-independent connection metadata.
-- OAuth secrets/tokens are intentionally NOT stored in this table.

create table if not exists public.email_provider_connection (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  account_id uuid not null,

  provider text not null
    check (provider in ('google', 'microsoft', 'smtp_imap')),

  provider_account_id text,
  provider_email text,

  connection_status text not null default 'disconnected'
    check (
      connection_status in (
        'disconnected',
        'connecting',
        'connected',
        'error',
        'revoked'
      )
    ),

  scopes text[] not null default '{}'::text[],

  connected_by uuid
    references auth.users(id)
    on delete set null,

  connected_at timestamptz,
  disconnected_at timestamptz,

  last_verified_at timestamptz,
  last_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, account_id, provider),

  foreign key (company_id, account_id)
    references public.email_account(company_id, id)
    on delete cascade
);
create index if not exists
  email_provider_connection_company_idx
on public.email_provider_connection(company_id);
create index if not exists
  email_provider_connection_account_idx
on public.email_provider_connection(company_id, account_id);
alter table public.email_provider_connection enable row level security;
revoke all on table public.email_provider_connection from public;
revoke all on table public.email_provider_connection from anon;
revoke all on table public.email_provider_connection from authenticated;
grant select on table public.email_provider_connection to authenticated;
grant all on table public.email_provider_connection to service_role;
drop policy if exists
  email_provider_connection_select
on public.email_provider_connection;
create policy email_provider_connection_select
on public.email_provider_connection
for select
to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.current_user_has_permission('email.manage')
    or public.email_user_can_access_account(account_id, 'read')
  )
);
drop trigger if exists
  email_provider_connection_set_updated_at
on public.email_provider_connection;
create trigger email_provider_connection_set_updated_at
before update on public.email_provider_connection
for each row
execute function public.email_set_updated_at();
comment on table public.email_provider_connection is
  'Provider connection metadata for Nexus Email. OAuth credentials and refresh tokens must not be stored in this table.';
comment on column public.email_provider_connection.scopes is
  'OAuth scopes granted to the provider connection.';
comment on column public.email_provider_connection.connection_status is
  'Nexus-visible provider connection state; contains no provider secret.';
