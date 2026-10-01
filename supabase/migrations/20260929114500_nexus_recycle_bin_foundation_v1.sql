-- =========================================================
-- JINLAB Nexus
-- Central Recycle Bin Foundation
-- =========================================================

create or replace function public.owner_recycle_bin_items()
returns table (
  item_type text,
  record_id uuid,
  item_name text,
  module_name text,
  record_status text,
  deleted_at timestamptz,
  deleted_by uuid,
  deleted_by_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_company_id := public.current_company_id();

  if v_company_id is null then
    raise exception 'Company context not found';
  end if;

  if not public.current_user_is_owner() then
    raise exception 'Owner access required';
  end if;

  return query

  select
    'email_template'::text,
    t.id,
    t.name,
    'Email Templates'::text,
    t.status,
    t.deleted_at,
    t.deleted_by,
    coalesce(
      nullif(btrim(up.full_name), ''),
      nullif(btrim(up.email), ''),
      'Unknown user'
    )
  from public.communication_template t
  left join public.user_profile up
    on up.company_id = t.company_id
   and up.user_id = t.deleted_by
  where t.company_id = v_company_id
    and t.deleted_at is not null

  union all

  select
    'marketing_campaign'::text,
    c.id,
    c.name,
    'Email Marketing'::text,
    c.status,
    c.deleted_at,
    c.deleted_by,
    coalesce(
      nullif(btrim(up.full_name), ''),
      nullif(btrim(up.email), ''),
      'Unknown user'
    )
  from public.email_campaign c
  left join public.user_profile up
    on up.company_id = c.company_id
   and up.user_id = c.deleted_by
  where c.company_id = v_company_id
    and c.deleted_at is not null

  union all

  select
    'recurring_campaign'::text,
    s.id,
    s.name,
    'Email Schedules'::text,
    s.status,
    s.deleted_at,
    s.deleted_by,
    coalesce(
      nullif(btrim(up.full_name), ''),
      nullif(btrim(up.email), ''),
      'Unknown user'
    )
  from public.marketing_campaign_series s
  left join public.user_profile up
    on up.company_id = s.company_id
   and up.user_id = s.deleted_by
  where s.company_id = v_company_id
    and s.deleted_at is not null

  union all

  select
    'bulk_email'::text,
    b.id,
    b.name,
    'Bulk Email'::text,
    b.status,
    b.deleted_at,
    b.deleted_by,
    coalesce(
      nullif(btrim(up.full_name), ''),
      nullif(btrim(up.email), ''),
      'Unknown user'
    )
  from public.email_bulk_batch b
  left join public.user_profile up
    on up.company_id = b.company_id
   and up.user_id = b.deleted_by
  where b.company_id = v_company_id
    and b.deleted_at is not null

  order by deleted_at desc;
end;
$$;


revoke all
on function public.owner_recycle_bin_items()
from public, anon, authenticated;

grant execute
on function public.owner_recycle_bin_items()
to authenticated;


comment on function public.owner_recycle_bin_items()
is
'Owner-only unified recycle bin list for soft-deleted Nexus communication records.';
