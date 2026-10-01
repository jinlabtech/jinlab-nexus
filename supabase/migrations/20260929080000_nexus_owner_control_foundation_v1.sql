-- ============================================================
-- JINLAB Nexus
-- Owner Control Foundation v1
--
-- Foundation for owner-level Edit / Archive / Trash / Restore.
-- Existing records are NOT deleted or changed by this migration.
-- ============================================================

create or replace function public.current_user_is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profile up
    where up.user_id = auth.uid()
      and up.company_id = public.current_company_id()
      and up.role = 'owner'
  );
$$;

revoke all
on function public.current_user_is_owner()
from public, anon;

grant execute
on function public.current_user_is_owner()
to authenticated;


-- ============================================================
-- EMAIL TEMPLATES
-- ============================================================

alter table public.communication_template
  add column if not exists deleted_at timestamptz;

alter table public.communication_template
  add column if not exists deleted_by uuid;

create index if not exists
  communication_template_company_deleted_idx
on public.communication_template (
  company_id,
  deleted_at
);


-- ============================================================
-- EMAIL MARKETING CAMPAIGNS
-- ============================================================

alter table public.email_campaign
  add column if not exists deleted_at timestamptz;

alter table public.email_campaign
  add column if not exists deleted_by uuid;

create index if not exists
  email_campaign_company_deleted_idx
on public.email_campaign (
  company_id,
  deleted_at
);


-- ============================================================
-- RECURRING MARKETING CAMPAIGNS
-- ============================================================

alter table public.marketing_campaign_series
  add column if not exists deleted_at timestamptz;

alter table public.marketing_campaign_series
  add column if not exists deleted_by uuid;

create index if not exists
  marketing_campaign_series_company_deleted_idx
on public.marketing_campaign_series (
  company_id,
  deleted_at
);


-- ============================================================
-- BULK EMAIL BATCHES
-- ============================================================

alter table public.email_bulk_batch
  add column if not exists deleted_at timestamptz;

alter table public.email_bulk_batch
  add column if not exists deleted_by uuid;

create index if not exists
  email_bulk_batch_company_deleted_idx
on public.email_bulk_batch (
  company_id,
  deleted_at
);
