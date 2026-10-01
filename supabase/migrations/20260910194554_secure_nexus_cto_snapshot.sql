revoke all on function public.get_nexus_cto_snapshot() from public;
revoke all on function public.get_nexus_cto_snapshot() from anon;
grant execute on function public.get_nexus_cto_snapshot() to authenticated;;
