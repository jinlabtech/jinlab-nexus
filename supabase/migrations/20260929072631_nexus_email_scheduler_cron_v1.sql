create or replace function public.nexus_email_scheduler_tick()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  select s.decrypted_secret
  into v_secret
  from vault.decrypted_secrets s
  where s.name = 'nexus_email_scheduler_secret'
  limit 1;

  if nullif(v_secret, '') is null then
    raise exception 'Nexus email scheduler secret is missing';
  end if;

  select net.http_get(
    url := 'https://nexus.jinlab.co.za/api/email/scheduler',
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || v_secret
    ),
    timeout_milliseconds := 120000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.nexus_email_scheduler_tick()
from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'nexus-email-scheduler-5m'
  ) then
    perform cron.unschedule('nexus-email-scheduler-5m');
  end if;
end;
$$;

select cron.schedule(
  'nexus-email-scheduler-5m',
  '*/5 * * * *',
  'select public.nexus_email_scheduler_tick();'
);
