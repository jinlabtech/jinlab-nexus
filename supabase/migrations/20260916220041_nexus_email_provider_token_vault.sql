-- JINLAB Nexus Email
-- Encrypted provider token vault.
--
-- IMPORTANT:
-- Encryption/decryption happens server-side in Nexus.
-- EMAIL_TOKEN_ENCRYPTION_KEY is NEVER stored in PostgreSQL.

-- Composite tenant-safe key required by the vault foreign key.
alter table public.email_provider_connection
  drop constraint if exists email_provider_connection_company_id_id_key;
alter table public.email_provider_connection
  add constraint email_provider_connection_company_id_id_key
  unique (company_id, id);
create table if not exists public.email_provider_token_vault (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  connection_id uuid not null,

  encrypted_refresh_token text not null,
  encryption_iv text not null,
  encryption_auth_tag text not null,

  token_version integer not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, connection_id),

  foreign key (company_id, connection_id)
    references public.email_provider_connection(company_id, id)
    on delete cascade
);
create index if not exists
  email_provider_token_vault_company_idx
on public.email_provider_token_vault(company_id);
alter table public.email_provider_token_vault enable row level security;
-- No browser/user access whatsoever.
revoke all on table public.email_provider_token_vault from public;
revoke all on table public.email_provider_token_vault from anon;
revoke all on table public.email_provider_token_vault from authenticated;
-- Only trusted server-side service role may access ciphertext.
grant select, insert, update, delete
on table public.email_provider_token_vault
to service_role;
drop trigger if exists
  email_provider_token_vault_set_updated_at
on public.email_provider_token_vault;
create trigger email_provider_token_vault_set_updated_at
before update on public.email_provider_token_vault
for each row
execute function public.email_set_updated_at();
comment on table public.email_provider_token_vault is
  'Server-only encrypted OAuth token vault for Nexus Email providers. Never exposed to authenticated browser clients.';
comment on column public.email_provider_token_vault.encrypted_refresh_token is
  'AES-encrypted provider refresh token ciphertext. Encryption key is held outside PostgreSQL.';
comment on column public.email_provider_token_vault.encryption_iv is
  'Initialization vector required for authenticated server-side decryption.';
comment on column public.email_provider_token_vault.encryption_auth_tag is
  'Authentication tag used to detect ciphertext tampering.';
