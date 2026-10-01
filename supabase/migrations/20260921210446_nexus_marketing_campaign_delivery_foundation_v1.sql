
-- JINLAB Nexus Communications
-- Marketing campaign + shared delivery pipeline foundation v1

-- =========================================================
-- 1. Audiences
-- =========================================================
create table public.marketing_audience (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  description text,
  audience_type text not null default 'static'
    check (audience_type in ('static','dynamic')),
  filter_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(filter_config) = 'object'),
  status text not null default 'active'
    check (status in ('active','archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint marketing_audience_company_id_id_key unique (company_id, id),
  constraint marketing_audience_company_branch_fkey
    foreign key (company_id, branch_id)
    references public.branch(company_id, id)
    on delete restrict
);

create index marketing_audience_company_idx
  on public.marketing_audience(company_id, status, updated_at desc);

create table public.marketing_audience_member (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  audience_id uuid not null,
  customer_id uuid,
  email_address text not null check (char_length(btrim(email_address)) between 3 and 320),
  display_name text,
  member_status text not null default 'active'
    check (member_status in ('active','excluded')),
  source text not null default 'manual'
    check (source in ('manual','customer','import','segment','system')),
  variables jsonb not null default '{}'::jsonb
    check (jsonb_typeof(variables) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint marketing_audience_member_company_id_id_key unique (company_id, id),
  constraint marketing_audience_member_audience_fkey
    foreign key (company_id, audience_id)
    references public.marketing_audience(company_id, id)
    on delete cascade,
  constraint marketing_audience_member_customer_fkey
    foreign key (company_id, customer_id)
    references public.customer(company_id, id)
    on delete set null
);

create unique index marketing_audience_member_email_uidx
  on public.marketing_audience_member(company_id, audience_id, lower(email_address));

create index marketing_audience_member_customer_idx
  on public.marketing_audience_member(company_id, customer_id);

-- =========================================================
-- 2. Campaigns
-- =========================================================
create table public.email_campaign (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  description text,

  email_account_id uuid not null,
  template_id uuid not null,
  template_version_id uuid not null,
  audience_id uuid not null,

  status text not null default 'draft'
    check (status in (
      'draft','ready','scheduled','processing','paused',
      'completed','cancelled','failed'
    )),

  subject_override text,
  preheader_override text,

  scheduled_at timestamptz,
  timezone text not null default 'UTC',
  requires_approval boolean not null default false,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,

  track_opens boolean not null default true,
  track_clicks boolean not null default true,
  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object'),

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint email_campaign_company_id_id_key unique (company_id, id),
  constraint email_campaign_company_branch_fkey
    foreign key (company_id, branch_id)
    references public.branch(company_id, id)
    on delete restrict,
  constraint email_campaign_email_account_fkey
    foreign key (company_id, email_account_id)
    references public.email_account(company_id, id)
    on delete restrict,
  constraint email_campaign_template_fkey
    foreign key (company_id, template_id)
    references public.communication_template(company_id, id)
    on delete restrict,
  constraint email_campaign_template_version_fkey
    foreign key (company_id, template_version_id)
    references public.communication_template_version(company_id, id)
    on delete restrict,
  constraint email_campaign_audience_fkey
    foreign key (company_id, audience_id)
    references public.marketing_audience(company_id, id)
    on delete restrict
);

create index email_campaign_company_status_idx
  on public.email_campaign(company_id, status, scheduled_at);

create index email_campaign_audience_idx
  on public.email_campaign(company_id, audience_id);

create table public.email_campaign_recipient (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  campaign_id uuid not null,
  customer_id uuid,

  email_address text not null check (char_length(btrim(email_address)) between 3 and 320),
  display_name text,
  variables jsonb not null default '{}'::jsonb
    check (jsonb_typeof(variables) = 'object'),

  consent_status text not null default 'unknown'
    check (consent_status in ('granted','denied','withdrawn','unknown','not_required')),
  suppression_reason text,

  send_status text not null default 'pending'
    check (send_status in (
      'pending','queued','sending','sent','delivered','bounced',
      'failed','skipped','unsubscribed','reconciliation_required'
    )),

  send_attempt_id uuid,
  provider_message_id text,
  provider_thread_id text,
  last_error text,

  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  bounced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint email_campaign_recipient_company_id_id_key unique (company_id, id),
  constraint email_campaign_recipient_campaign_fkey
    foreign key (company_id, campaign_id)
    references public.email_campaign(company_id, id)
    on delete cascade,
  constraint email_campaign_recipient_customer_fkey
    foreign key (company_id, customer_id)
    references public.customer(company_id, id)
    on delete set null
);

create unique index email_campaign_recipient_email_uidx
  on public.email_campaign_recipient(company_id, campaign_id, lower(email_address));

create unique index email_campaign_recipient_attempt_uidx
  on public.email_campaign_recipient(company_id, send_attempt_id)
  where send_attempt_id is not null;

create index email_campaign_recipient_status_idx
  on public.email_campaign_recipient(company_id, campaign_id, send_status);

-- =========================================================
-- 3. Shared communication outbox
-- =========================================================
create table public.communication_send_job (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid,

  channel text not null
    check (channel in ('email','whatsapp','sms','push','internal')),
  purpose text not null
    check (purpose in ('transactional','marketing','notification','internal')),

  source_type text not null,
  source_id uuid,

  email_account_id uuid,
  template_version_id uuid,

  recipient_address text not null,
  recipient_display_name text,

  subject text,
  rendered_html text,
  rendered_text text,
  variables jsonb not null default '{}'::jsonb
    check (jsonb_typeof(variables) = 'object'),

  idempotency_key text,

  status text not null default 'queued'
    check (status in (
      'queued','processing','sending','sent','failed',
      'reconciliation_required','cancelled','suppressed'
    )),

  priority integer not null default 100,
  scheduled_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),

  provider text,
  provider_message_id text,
  provider_thread_id text,
  last_error text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint communication_send_job_company_id_id_key unique (company_id, id),
  constraint communication_send_job_company_branch_fkey
    foreign key (company_id, branch_id)
    references public.branch(company_id, id)
    on delete restrict,
  constraint communication_send_job_email_account_fkey
    foreign key (company_id, email_account_id)
    references public.email_account(company_id, id)
    on delete restrict,
  constraint communication_send_job_template_version_fkey
    foreign key (company_id, template_version_id)
    references public.communication_template_version(company_id, id)
    on delete restrict
);

create unique index communication_send_job_idempotency_uidx
  on public.communication_send_job(company_id, idempotency_key)
  where idempotency_key is not null;

create index communication_send_job_queue_idx
  on public.communication_send_job(company_id, status, scheduled_at, priority);

create index communication_send_job_source_idx
  on public.communication_send_job(company_id, source_type, source_id);

create table public.communication_delivery_attempt (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  send_job_id uuid not null,
  attempt_no integer not null check (attempt_no > 0),

  provider text,
  status text not null
    check (status in ('started','accepted','rejected','uncertain','failed','reconciled')),

  provider_message_id text,
  error_code text,
  error_message text,
  request_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(request_metadata) = 'object'),
  response_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(response_metadata) = 'object'),

  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),

  constraint communication_delivery_attempt_company_id_id_key unique (company_id, id),
  constraint communication_delivery_attempt_send_job_fkey
    foreign key (company_id, send_job_id)
    references public.communication_send_job(company_id, id)
    on delete cascade,
  constraint communication_delivery_attempt_number_key
    unique (company_id, send_job_id, attempt_no)
);

create index communication_delivery_attempt_job_idx
  on public.communication_delivery_attempt(company_id, send_job_id, attempt_no desc);

-- =========================================================
-- 4. Updated-at triggers
-- =========================================================
create trigger marketing_audience_set_updated_at
before update on public.marketing_audience
for each row execute function public.set_updated_at();

create trigger marketing_audience_member_set_updated_at
before update on public.marketing_audience_member
for each row execute function public.set_updated_at();

create trigger email_campaign_set_updated_at
before update on public.email_campaign
for each row execute function public.set_updated_at();

create trigger email_campaign_recipient_set_updated_at
before update on public.email_campaign_recipient
for each row execute function public.set_updated_at();

create trigger communication_send_job_set_updated_at
before update on public.communication_send_job
for each row execute function public.set_updated_at();

-- =========================================================
-- 5. RLS
-- =========================================================
alter table public.marketing_audience enable row level security;
alter table public.marketing_audience_member enable row level security;
alter table public.email_campaign enable row level security;
alter table public.email_campaign_recipient enable row level security;
alter table public.communication_send_job enable row level security;
alter table public.communication_delivery_attempt enable row level security;

create policy marketing_audience_select_policy
on public.marketing_audience
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.current_user_has_permission('marketing.view')
    or public.current_user_has_permission('marketing.manage')
    or public.current_user_has_permission('marketing.analytics')
  )
);

create policy marketing_audience_member_select_policy
on public.marketing_audience_member
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.current_user_has_permission('marketing.view')
    or public.current_user_has_permission('marketing.manage')
    or public.current_user_has_permission('marketing.analytics')
  )
);

create policy email_campaign_select_policy
on public.email_campaign
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.current_user_has_permission('marketing.view')
    or public.current_user_has_permission('marketing.manage')
    or public.current_user_has_permission('marketing.analytics')
  )
);

create policy email_campaign_recipient_select_policy
on public.email_campaign_recipient
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.current_user_has_permission('marketing.view')
    or public.current_user_has_permission('marketing.manage')
    or public.current_user_has_permission('marketing.analytics')
  )
);

create policy communication_send_job_select_policy
on public.communication_send_job
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.current_user_has_permission('email.view')
    or public.current_user_has_permission('marketing.view')
    or public.current_user_has_permission('marketing.analytics')
    or public.current_user_has_permission('automation.view')
  )
);

create policy communication_delivery_attempt_select_policy
on public.communication_delivery_attempt
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.current_user_has_permission('email.view')
    or public.current_user_has_permission('marketing.view')
    or public.current_user_has_permission('marketing.analytics')
    or public.current_user_has_permission('automation.view')
  )
);

-- =========================================================
-- 6. Grants: read through RLS; writes remain controlled
-- =========================================================
revoke all on public.marketing_audience from anon;
revoke all on public.marketing_audience_member from anon;
revoke all on public.email_campaign from anon;
revoke all on public.email_campaign_recipient from anon;
revoke all on public.communication_send_job from anon;
revoke all on public.communication_delivery_attempt from anon;

revoke insert, update, delete on public.marketing_audience from authenticated;
revoke insert, update, delete on public.marketing_audience_member from authenticated;
revoke insert, update, delete on public.email_campaign from authenticated;
revoke insert, update, delete on public.email_campaign_recipient from authenticated;
revoke insert, update, delete on public.communication_send_job from authenticated;
revoke insert, update, delete on public.communication_delivery_attempt from authenticated;

grant select on public.marketing_audience to authenticated;
grant select on public.marketing_audience_member to authenticated;
grant select on public.email_campaign to authenticated;
grant select on public.email_campaign_recipient to authenticated;
grant select on public.communication_send_job to authenticated;
grant select on public.communication_delivery_attempt to authenticated;
;
