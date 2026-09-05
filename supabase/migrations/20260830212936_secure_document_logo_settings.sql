create or replace function public.update_company_document_logo(p_logo_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if not public.current_user_has_permission('settings.branding.manage') then
    raise exception 'Permission denied: settings.branding.manage';
  end if;
  v_company_id := public.current_settings_company_id();
  if v_company_id is null then
    raise exception 'No company is assigned to this user';
  end if;
  insert into public.company_document_settings (
    company_id, logo_path, updated_by
  ) values (
    v_company_id, nullif(trim(p_logo_path), ''), auth.uid()
  )
  on conflict (company_id) do update set
    logo_path = excluded.logo_path,
    updated_by = auth.uid(),
    updated_at = now();
  perform public.log_settings_change(
    'branding',
    'document_logo_updated',
    jsonb_build_object('logo_configured', p_logo_path is not null)
  );
end;
$$;
revoke all on function public.update_company_document_logo(text) from public;
grant execute on function public.update_company_document_logo(text) to authenticated;
