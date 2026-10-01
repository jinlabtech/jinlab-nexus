
-- JINLAB Nexus Communications Foundation v1

-- =========================================================
-- 1. Permissions
-- =========================================================
insert into public.permissions (permission_name)
values
  ('templates.view'),
  ('templates.manage'),
  ('marketing.view'),
  ('marketing.manage'),
  ('marketing.send'),
  ('marketing.analytics'),
  ('automation.view'),
  ('automation.manage')
on conflict (permission_name) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.permission_name in (
    'templates.view',
    'templates.manage',
    'marketing.view',
    'marketing.manage',
    'marketing.send',
    'marketing.analytics',
    'automation.view',
    'automation.manage'
  )
where r.role_name in ('owner','admin')
and not exists (
  select 1
  from public.role_permissions rp
  where rp.role_id = r.id
    and rp.permission_id = p.id
);

-- =========================================================
-- 2. Reusable communication templates
-- =========================================================
create table if not exists public.communication_template (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  description text,
  purpose text not null default 'transactional'
    check (purpose in ('transactional','marketing','notification','internal')),
  category text not null default 'custom',
  channel text not null default 'email'
    check (channel in ('email','whatsapp','sms','push','internal')),
  status text not null default 'draft'
    check (status in ('draft','active','archived')),
  published_version_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_template_company_id_id_key unique (company_id, id),
  constraint communication_template_company_branch_fkey
    foreign key (company_id, branch_id)
    references public.branch(company_id, id)
    on delete restrict
);

create index if not exists communication_template_company_status_idx
  on public.communication_template(company_id, status, updated_at desc);

create index if not exists communication_template_company_category_idx
  on public.communication_template(company_id, category);

create table if not exists public.communication_template_version (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  template_id uuid not null,
  version_no integer not null check (version_no > 0),
  subject_template text,
  preheader_template text,
  content_schema_version integer not null default 1 check (content_schema_version > 0),
  content_blocks jsonb not null default '{"blocks":[]}'::jsonb,
  rendered_html text,
  rendered_text text,
  status text not null default 'draft'
    check (status in ('draft','published','superseded')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint communication_template_version_company_id_id_key unique (company_id, id),
  constraint communication_template_version_company_template_version_key
    unique (company_id, template_id, version_no),
  constraint communication_template_version_template_fkey
    foreign key (company_id, template_id)
    references public.communication_template(company_id, id)
    on delete cascade,
  constraint communication_template_version_content_blocks_check
    check (jsonb_typeof(content_blocks) in ('object','array'))
);

alter table public.communication_template
  add constraint communication_template_published_version_fkey
  foreign key (company_id, published_version_id)
  references public.communication_template_version(company_id, id)
  on delete set null;

create index if not exists communication_template_version_template_idx
  on public.communication_template_version(company_id, template_id, version_no desc);

-- =========================================================
-- 3. Communication consent
-- =========================================================
create table if not exists public.communication_consent (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  customer_id uuid references public.customer(id) on delete set null,
  channel text not null check (channel in ('email','whatsapp','sms','push')),
  address text not null check (char_length(btrim(address)) between 3 and 320),
  purpose text not null default 'marketing',
  status text not null
    check (status in ('granted','denied','withdrawn','pending')),
  source text not null default 'manual',
  legal_basis text,
  consented_at timestamptz,
  withdrawn_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_consent_company_id_id_key unique (company_id, id)
);

create index if not exists communication_consent_company_customer_idx
  on public.communication_consent(company_id, customer_id, channel);

create unique index if not exists communication_consent_identity_uidx
  on public.communication_consent(company_id, channel, lower(address), purpose);

-- =========================================================
-- 4. Suppression / do-not-contact
-- =========================================================
create table if not exists public.communication_suppression (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  customer_id uuid references public.customer(id) on delete set null,
  channel text not null check (channel in ('email','whatsapp','sms','push')),
  address text not null check (char_length(btrim(address)) between 3 and 320),
  scope text not null default 'marketing'
    check (scope in ('marketing','all')),
  reason text not null
    check (reason in ('unsubscribed','hard_bounce','complaint','invalid_address','manual_block')),
  active boolean not null default true,
  source text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  lifted_by uuid references auth.users(id) on delete set null,
  lifted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_suppression_company_id_id_key unique (company_id, id)
);

create index if not exists communication_suppression_lookup_idx
  on public.communication_suppression(company_id, channel, lower(address), active);

create unique index if not exists communication_suppression_active_identity_uidx
  on public.communication_suppression(company_id, channel, lower(address), scope)
  where active = true;

-- =========================================================
-- 5. Business event ledger
-- =========================================================
create table if not exists public.business_event (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid,
  event_key text not null check (char_length(btrim(event_key)) between 3 and 160),
  source_module text not null check (char_length(btrim(source_module)) between 1 and 80),
  aggregate_type text,
  aggregate_id uuid,
  correlation_id uuid not null default gen_random_uuid(),
  causation_id uuid,
  idempotency_key text,
  actor_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'pending'
    check (processing_status in ('pending','processing','processed','failed','ignored')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  constraint business_event_company_id_id_key unique (company_id, id),
  constraint business_event_company_branch_fkey
    foreign key (company_id, branch_id)
    references public.branch(company_id, id)
    on delete restrict
);

create unique index if not exists business_event_idempotency_uidx
  on public.business_event(company_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists business_event_processing_idx
  on public.business_event(company_id, processing_status, next_attempt_at, occurred_at);

create index if not exists business_event_aggregate_idx
  on public.business_event(company_id, aggregate_type, aggregate_id, occurred_at desc);

-- =========================================================
-- 6. Event -> communication rules
-- =========================================================
create table if not exists public.communication_rule (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  description text,
  event_key text not null check (char_length(btrim(event_key)) between 3 and 160),
  channel text not null check (channel in ('email','whatsapp','sms','push','internal')),
  template_id uuid,
  email_account_id uuid,
  recipient_strategy text not null default 'customer'
    check (recipient_strategy in ('customer','event_address','assigned_user','custom')),
  condition_config jsonb not null default '{}'::jsonb,
  action_config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  requires_approval boolean not null default false,
  priority integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_rule_company_id_id_key unique (company_id, id),
  constraint communication_rule_company_branch_fkey
    foreign key (company_id, branch_id)
    references public.branch(company_id, id)
    on delete restrict,
  constraint communication_rule_template_fkey
    foreign key (company_id, template_id)
    references public.communication_template(company_id, id)
    on delete restrict,
  constraint communication_rule_email_account_fkey
    foreign key (company_id, email_account_id)
    references public.email_account(company_id, id)
    on delete restrict
);

create index if not exists communication_rule_event_idx
  on public.communication_rule(company_id, event_key, enabled, priority);

-- =========================================================
-- 7. Updated-at triggers
-- =========================================================
drop trigger if exists communication_template_set_updated_at
  on public.communication_template;
create trigger communication_template_set_updated_at
before update on public.communication_template
for each row execute function public.set_updated_at();

drop trigger if exists communication_consent_set_updated_at
  on public.communication_consent;
create trigger communication_consent_set_updated_at
before update on public.communication_consent
for each row execute function public.set_updated_at();

drop trigger if exists communication_suppression_set_updated_at
  on public.communication_suppression;
create trigger communication_suppression_set_updated_at
before update on public.communication_suppression
for each row execute function public.set_updated_at();

drop trigger if exists communication_rule_set_updated_at
  on public.communication_rule;
create trigger communication_rule_set_updated_at
before update on public.communication_rule
for each row execute function public.set_updated_at();

-- =========================================================
-- 8. RLS
-- =========================================================
alter table public.communication_template enable row level security;
alter table public.communication_template_version enable row level security;
alter table public.communication_consent enable row level security;
alter table public.communication_suppression enable row level security;
alter table public.business_event enable row level security;
alter table public.communication_rule enable row level security;

create policy communication_template_select_policy
on public.communication_template
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.current_user_has_permission('templates.view')
    or public.current_user_has_permission('templates.manage')
  )
);

create policy communication_template_version_select_policy
on public.communication_template_version
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.current_user_has_permission('templates.view')
    or public.current_user_has_permission('templates.manage')
  )
);

create policy communication_consent_select_policy
on public.communication_consent
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.current_user_has_permission('marketing.view')
    or public.current_user_has_permission('marketing.manage')
  )
);

create policy communication_suppression_select_policy
on public.communication_suppression
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.current_user_has_permission('marketing.view')
    or public.current_user_has_permission('marketing.manage')
  )
);

create policy business_event_select_policy
on public.business_event
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.current_user_has_permission('automation.view')
    or public.current_user_has_permission('automation.manage')
  )
);

create policy communication_rule_select_policy
on public.communication_rule
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.current_user_has_permission('automation.view')
    or public.current_user_has_permission('automation.manage')
  )
);

-- =========================================================
-- 9. Table grants
-- =========================================================
revoke all on public.communication_template from anon;
revoke all on public.communication_template_version from anon;
revoke all on public.communication_consent from anon;
revoke all on public.communication_suppression from anon;
revoke all on public.business_event from anon;
revoke all on public.communication_rule from anon;

revoke insert, update, delete on public.communication_template from authenticated;
revoke insert, update, delete on public.communication_template_version from authenticated;
revoke insert, update, delete on public.communication_consent from authenticated;
revoke insert, update, delete on public.communication_suppression from authenticated;
revoke insert, update, delete on public.business_event from authenticated;
revoke insert, update, delete on public.communication_rule from authenticated;

grant select on public.communication_template to authenticated;
grant select on public.communication_template_version to authenticated;
grant select on public.communication_consent to authenticated;
grant select on public.communication_suppression to authenticated;
grant select on public.business_event to authenticated;
grant select on public.communication_rule to authenticated;
;
