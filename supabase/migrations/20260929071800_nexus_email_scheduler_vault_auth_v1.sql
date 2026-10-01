
do $$
declare
  v_secret text;
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'nexus_email_scheduler_secret'
  ) then
    v_secret :=
      replace(pg_catalog.gen_random_uuid()::text, '-', '') ||
      replace(pg_catalog.gen_random_uuid()::text, '-', '');

    perform vault.create_secret(
      v_secret,
      'nexus_email_scheduler_secret',
      'Server-only secret used by Supabase Cron to invoke the Nexus email worker'
    );
  end if;
end;
$$;

create or replace function public.email_scheduler_verify_secret(
  p_secret text
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from vault.decrypted_secrets s
    where s.name = 'nexus_email_scheduler_secret'
      and s.decrypted_secret = p_secret
  );
$$;

revoke all on function public.email_scheduler_verify_secret(text)
from public, anon, authenticated;

grant execute on function public.email_scheduler_verify_secret(text)
to service_role;
;
