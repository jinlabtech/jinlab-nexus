-- ============================================================
-- JINLAB Nexus
-- Accounting Sprint 19.2E
-- Accounting Exception Summary
-- ============================================================

create or replace function
public.get_accounting_exception_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_open bigint := 0;
  v_resolved bigint := 0;

  v_oldest_open_date date;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;


  if not public.current_user_has_permission(
    'accounting.view'
  ) then
    raise exception
      'Permission denied: accounting.view';
  end if;


  v_company_id :=
    public.current_settings_company_id();


  if v_company_id is null then
    raise exception
      'Your account is not linked to a company.';
  end if;


  select
    count(*) filter (
      where status = 'open'
    ),

    count(*) filter (
      where status = 'resolved'
    ),

    min(event_date) filter (
      where status = 'open'
    )

  into
    v_open,
    v_resolved,
    v_oldest_open_date

  from public.accounting_posting_exception

  where company_id =
    v_company_id;


  return jsonb_build_object(
    'ok',
      true,

    'open_count',
      v_open,

    'resolved_count',
      v_resolved,

    'oldest_open_date',
      v_oldest_open_date,

    'healthy',
      v_open = 0
  );

end;
$$;


revoke all
on function
public.get_accounting_exception_summary()
from public;

grant execute
on function
public.get_accounting_exception_summary()
to authenticated;
