-- ============================================================
-- JINLAB Nexus
-- Nexus Email — Provider-independent communication foundation
-- ============================================================
--
-- Nexus owns the communication record.
-- External providers transport and synchronise email.
--
-- Security principles:
--   * company isolation
--   * RLS enabled
--   * authenticated users receive SELECT only
--   * service_role handles provider synchronisation
--   * future controlled RPC/API actions handle staff mutations
-- ============================================================

-- ------------------------------------------------------------
-- 1. PERMISSIONS
-- ------------------------------------------------------------

insert into public.permissions (permission_name)
values
  ('email.view'),
  ('email.send'),
  ('email.manage')
on conflict (permission_name) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.role_name in ('owner', 'admin')
  and p.permission_name in (
    'email.view',
    'email.send',
    'email.manage'
  )
on conflict (role_id, permission_id) do nothing;
-- ------------------------------------------------------------
-- 2. TENANT-SAFE REFERENCE SUPPORT
-- ------------------------------------------------------------

create unique index if not exists
  email_customer_company_id_uidx
on public.customer (company_id, id);
create unique index if not exists
  email_branch_company_id_uidx
on public.branch (company_id, id);
-- ------------------------------------------------------------
-- 3. EMAIL ACCOUNT
-- ------------------------------------------------------------

create table public.email_account (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  branch_id uuid,

  provider text not null default 'custom'
    check (
      provider in (
        'custom',
        'google',
        'microsoft',
        'smtp_imap'
      )
    ),

  email_address text not null,
  display_name text,

  account_type text not null default 'shared'
    check (
      account_type in (
        'shared',
        'personal',
        'department'
      )
    ),

  department text,

  active boolean not null default true,

  sync_enabled boolean not null default false,

  last_synced_at timestamptz,

  created_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, email_address),
  unique (company_id, id),

  foreign key (company_id, branch_id)
    references public.branch(company_id, id)
    on delete set null (branch_id)
);
create index email_account_company_idx
  on public.email_account(company_id);
create index email_account_active_idx
  on public.email_account(company_id, active);
-- ------------------------------------------------------------
-- 4. EMAIL THREAD
-- ------------------------------------------------------------

create table public.email_thread (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  account_id uuid not null,

  customer_id uuid,

  subject text not null default '(No subject)',

  status text not null default 'open'
    check (
      status in (
        'open',
        'closed',
        'archived'
      )
    ),

  priority text not null default 'normal'
    check (
      priority in (
        'low',
        'normal',
        'high',
        'urgent'
      )
    ),

  assigned_to uuid
    references auth.users(id)
    on delete set null,

  unread_count integer not null default 0
    check (unread_count >= 0),

  last_message_at timestamptz not null default now(),

  last_inbound_at timestamptz,
  last_outbound_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (company_id, account_id, id),

  foreign key (company_id, account_id)
    references public.email_account(company_id, id)
    on delete cascade,

  foreign key (company_id, customer_id)
    references public.customer(company_id, id)
    on delete set null (customer_id)
);
create index email_thread_company_recent_idx
  on public.email_thread(
    company_id,
    last_message_at desc,
    id
  );
create index email_thread_account_idx
  on public.email_thread(
    company_id,
    account_id,
    last_message_at desc
  );
create index email_thread_customer_idx
  on public.email_thread(
    company_id,
    customer_id
  )
  where customer_id is not null;
create index email_thread_assigned_idx
  on public.email_thread(
    company_id,
    assigned_to
  )
  where assigned_to is not null;
-- ------------------------------------------------------------
-- 5. EMAIL MESSAGE
-- ------------------------------------------------------------

create table public.email_message (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  account_id uuid not null,
  thread_id uuid not null,

  direction text not null
    check (
      direction in (
        'inbound',
        'outbound'
      )
    ),

  message_state text not null default 'received'
    check (
      message_state in (
        'draft',
        'queued',
        'sending',
        'sent',
        'received',
        'failed'
      )
    ),

  provider_message_id text,

  internet_message_id text,

  in_reply_to text,

  subject text not null default '(No subject)',

  from_address text not null,

  reply_to_address text,

  body_text text not null default '',

  body_html text,

  preview_text text,

  sent_at timestamptz,
  received_at timestamptz,

  created_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null
    default clock_timestamp(),

  updated_at timestamptz not null
    default clock_timestamp(),

  unique (company_id, id),

  foreign key (
    company_id,
    account_id
  )
    references public.email_account(
      company_id,
      id
    )
    on delete cascade,

  foreign key (
    company_id,
    account_id,
    thread_id
  )
    references public.email_thread(
      company_id,
      account_id,
      id
    )
    on delete cascade,

  check (
    length(subject) <= 998
  ),

  check (
    length(body_text) <= 1000000
  )
);
create unique index email_message_provider_uidx
  on public.email_message(
    account_id,
    provider_message_id
  )
  where provider_message_id is not null;
create unique index email_message_internet_id_uidx
  on public.email_message(
    account_id,
    internet_message_id
  )
  where internet_message_id is not null;
create index email_message_thread_recent_idx
  on public.email_message(
    company_id,
    thread_id,
    created_at desc,
    id
  );
create index email_message_account_idx
  on public.email_message(
    company_id,
    account_id,
    created_at desc
  );
-- ------------------------------------------------------------
-- 6. EMAIL RECIPIENT
-- ------------------------------------------------------------

create table public.email_recipient (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  message_id uuid not null,

  recipient_type text not null
    check (
      recipient_type in (
        'to',
        'cc',
        'bcc'
      )
    ),

  email_address text not null,

  display_name text,

  created_at timestamptz not null default now(),

  foreign key (
    company_id,
    message_id
  )
    references public.email_message(
      company_id,
      id
    )
    on delete cascade
);
create index email_recipient_message_idx
  on public.email_recipient(
    company_id,
    message_id
  );
create index email_recipient_address_idx
  on public.email_recipient(
    company_id,
    email_address
  );
-- ------------------------------------------------------------
-- 7. UPDATED_AT
-- ------------------------------------------------------------

create function public.email_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all
on function public.email_set_updated_at()
from public, anon, authenticated;
create trigger email_account_updated_at
before update on public.email_account
for each row
execute function public.email_set_updated_at();
create trigger email_thread_updated_at
before update on public.email_thread
for each row
execute function public.email_set_updated_at();
create trigger email_message_updated_at
before update on public.email_message
for each row
execute function public.email_set_updated_at();
-- ------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- ------------------------------------------------------------

alter table public.email_account
  enable row level security;
alter table public.email_thread
  enable row level security;
alter table public.email_message
  enable row level security;
alter table public.email_recipient
  enable row level security;
-- ------------------------------------------------------------
-- 9. TABLE PRIVILEGES
-- ------------------------------------------------------------

revoke all
on
  public.email_account,
  public.email_thread,
  public.email_message,
  public.email_recipient
from public, anon, authenticated;
grant select
on
  public.email_account,
  public.email_thread,
  public.email_message,
  public.email_recipient
to authenticated;
grant
  select,
  insert,
  update,
  delete
on
  public.email_account,
  public.email_thread,
  public.email_message,
  public.email_recipient
to service_role;
-- ------------------------------------------------------------
-- 10. READ POLICIES
-- ------------------------------------------------------------

create policy email_account_read
on public.email_account
for select
to authenticated
using (
  company_id =
    (select public.current_company_id())
  and (
    (select public.current_user_has_permission(
      'email.view'
    ))
    or
    (select public.current_user_has_permission(
      'settings.integrations.manage'
    ))
  )
);
create policy email_thread_read
on public.email_thread
for select
to authenticated
using (
  company_id =
    (select public.current_company_id())
  and
    (select public.current_user_has_permission(
      'email.view'
    ))
);
create policy email_message_read
on public.email_message
for select
to authenticated
using (
  company_id =
    (select public.current_company_id())
  and
    (select public.current_user_has_permission(
      'email.view'
    ))
);
create policy email_recipient_read
on public.email_recipient
for select
to authenticated
using (
  company_id =
    (select public.current_company_id())
  and
    (select public.current_user_has_permission(
      'email.view'
    ))
);
-- ------------------------------------------------------------
-- 11. COMMENTS
-- ------------------------------------------------------------

comment on table public.email_account is
  'Company-controlled Nexus email mailbox identity. Provider credentials are never stored here in plaintext.';
comment on table public.email_thread is
  'Provider-independent Nexus email conversation thread.';
comment on table public.email_message is
  'Immutable-oriented provider-independent Nexus email message record.';
comment on table public.email_recipient is
  'TO, CC and BCC recipients belonging to a Nexus email message.';
comment on column public.email_account.provider is
  'Transport/synchronisation provider only. Nexus remains the communication system of record.';
comment on column public.email_message.provider_message_id is
  'Provider-specific remote message identifier used for synchronisation and deduplication.';
-- ============================================================
-- END — NEXUS EMAIL FOUNDATION
-- ============================================================;
