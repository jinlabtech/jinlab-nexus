create or replace function public.get_nexus_manual_download_audit(
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_limit integer;
  v_rows jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('help.manual.manage') then
    raise exception 'Permission denied: help.manual.manage';
  end if;

  v_company_id := public.current_company_id();
  v_limit := greatest(1, least(coalesce(p_limit,50), 200));

  select coalesce(
    jsonb_agg(x.row_data order by x.downloaded_at desc),
    '[]'::jsonb
  )
  into v_rows
  from (
    select
      a.downloaded_at,
      jsonb_build_object(
        'id', a.id,
        'downloaded_at', a.downloaded_at,
        'manual_key', a.manual_key,
        'manual_title', m.title,
        'manual_role', m.audience_role,
        'sprint_version', a.sprint_version,
        'user_id', a.user_id,
        'user_name', coalesce(up.full_name, 'Unknown user'),
        'user_email', up.email,
        'role_at_download', a.role_at_download
      ) as row_data
    from public.nexus_manual_download_audit a
    join public.nexus_manual_release m on m.id = a.manual_release_id
    left join public.user_profile up
      on up.user_id = a.user_id
     and up.company_id = a.company_id
    where a.company_id = v_company_id
    order by a.downloaded_at desc
    limit v_limit
  ) x;

  return jsonb_build_object(
    'ok', true,
    'rows', v_rows
  );
end;
$$;

grant execute on function public.get_nexus_manual_download_audit(integer) to authenticated;
;
