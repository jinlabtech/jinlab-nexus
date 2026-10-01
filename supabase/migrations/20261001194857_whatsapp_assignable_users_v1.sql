create or replace function public.list_whatsapp_assignable_users()
returns table(
  user_id uuid,
  employee_id uuid,
  employee_number text,
  display_name text,
  role text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.'
      using errcode = '42501';
  end if;

  v_company_id := public.current_company_id();

  if v_company_id is null
     or not public.current_user_has_permission('whatsapp.send') then
    raise exception 'WhatsApp sales access denied.'
      using errcode = '42501';
  end if;

  return query
  select
    up.user_id,
    e.id as employee_id,
    e.employee_number,
    coalesce(
      nullif(
        btrim(
          concat_ws(
            ' ',
            e.first_name,
            e.last_name
          )
        ),
        ''
      ),
      nullif(btrim(up.full_name), ''),
      nullif(btrim(up.email), ''),
      'Team member'
    )::text as display_name,
    up.role::text
  from public.user_profile up
  left join public.hr_employee e
    on e.company_id = up.company_id
   and e.user_id = up.user_id
   and e.status = 'active'
  where up.company_id = v_company_id
    and public.user_has_effective_permission(
      up.user_id,
      v_company_id,
      'whatsapp.send'
    )
  order by
    coalesce(
      nullif(
        btrim(
          concat_ws(
            ' ',
            e.first_name,
            e.last_name
          )
        ),
        ''
      ),
      nullif(btrim(up.full_name), ''),
      nullif(btrim(up.email), ''),
      'Team member'
    );
end;
$$;

revoke all
on function public.list_whatsapp_assignable_users()
from public, anon, authenticated, service_role;

grant execute
on function public.list_whatsapp_assignable_users()
to authenticated;

comment on function public.list_whatsapp_assignable_users()
is 'Returns company users eligible for WhatsApp conversation assignment.';
