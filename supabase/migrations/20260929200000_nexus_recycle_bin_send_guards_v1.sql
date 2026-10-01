-- =========================================================
-- JINLAB Nexus
-- Recycle Bin send-safety guards
-- =========================================================

create or replace function public.nexus_communication_soft_delete_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin

  -- Only intervene when a record is newly moved into Trash.
  if new.deleted_at is not null
     and old.deleted_at is null
  then

    if tg_table_name = 'email_campaign' then

      if new.status not in (
        'completed',
        'failed',
        'cancelled'
      ) then
        new.status := 'cancelled';
      end if;


    elsif tg_table_name = 'email_bulk_batch' then

      if new.status not in (
        'completed',
        'failed',
        'cancelled'
      ) then
        new.status := 'cancelled';
      end if;


    elsif tg_table_name = 'marketing_campaign_series' then

      new.enabled := false;

      if new.status = 'active' then
        new.status := 'paused';
      end if;

    end if;

  end if;

  return new;
end;
$$;


drop trigger if exists
  email_campaign_soft_delete_guard
on public.email_campaign;

create trigger
  email_campaign_soft_delete_guard
before update of deleted_at
on public.email_campaign
for each row
execute function
  public.nexus_communication_soft_delete_guard();


drop trigger if exists
  email_bulk_batch_soft_delete_guard
on public.email_bulk_batch;

create trigger
  email_bulk_batch_soft_delete_guard
before update of deleted_at
on public.email_bulk_batch
for each row
execute function
  public.nexus_communication_soft_delete_guard();


drop trigger if exists
  marketing_campaign_series_soft_delete_guard
on public.marketing_campaign_series;

create trigger
  marketing_campaign_series_soft_delete_guard
before update of deleted_at
on public.marketing_campaign_series
for each row
execute function
  public.nexus_communication_soft_delete_guard();


revoke all
on function public.nexus_communication_soft_delete_guard()
from public, anon, authenticated;
