
alter table public.company_ui_settings
  drop constraint if exists company_ui_settings_theme_key_check;

alter table public.company_ui_settings
  add constraint company_ui_settings_theme_key_check
  check (
    theme_key in (
      'jinlab_blue',
      'jinlab_blue_dark',
      'jinlab_frost',
      'jinlab_graphite',
      'jinlab_glass',
      'system'
    )
  );

create or replace function public.save_company_ui_settings(p_theme_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_previous_theme text;
  v_theme text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('settings.appearance.manage') then
    raise exception 'Permission denied: settings.appearance.manage';
  end if;

  v_theme := lower(trim(coalesce(p_theme_key,'')));

  if v_theme not in (
    'jinlab_blue',
    'jinlab_blue_dark',
    'jinlab_frost',
    'jinlab_graphite',
    'jinlab_glass',
    'system'
  ) then
    raise exception 'Invalid Nexus theme.';
  end if;

  v_company_id := public.current_company_id();

  if v_company_id is null then
    raise exception 'Company could not be resolved.';
  end if;

  insert into public.company_ui_settings (company_id)
  values (v_company_id)
  on conflict (company_id) do nothing;

  select theme_key
  into v_previous_theme
  from public.company_ui_settings
  where company_id = v_company_id;

  update public.company_ui_settings
  set theme_key = v_theme,
      updated_by = auth.uid(),
      updated_at = now()
  where company_id = v_company_id;

  perform public.log_settings_change(
    v_company_id,
    'appearance',
    'theme_updated',
    jsonb_build_object(
      'previous_theme', v_previous_theme,
      'new_theme', v_theme
    )
  );

  return jsonb_build_object(
    'ok', true,
    'theme_key', v_theme,
    'message', 'Nexus appearance updated.'
  );
end;
$$;
;
