create table if not exists public.company_ui_settings (
  company_id uuid primary key references public.company(id) on delete cascade,
  theme_key text not null default 'jinlab_blue',
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_ui_settings_theme_key_check check (
    theme_key in ('jinlab_blue','jinlab_blue_dark','system')
  )
);

alter table public.company_ui_settings enable row level security;
revoke all on public.company_ui_settings from anon, authenticated;

insert into public.company_ui_settings (company_id)
select c.id
from public.company c
on conflict (company_id) do nothing;

insert into public.permissions (permission_name)
values ('settings.appearance.manage')
on conflict (permission_name) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.role_name in ('owner','admin')
  and p.permission_name = 'settings.appearance.manage'
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );

create or replace function public.get_company_ui_settings()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_settings public.company_ui_settings%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  v_company_id := public.current_company_id();

  if v_company_id is null then
    raise exception 'Company could not be resolved.';
  end if;

  insert into public.company_ui_settings (company_id)
  values (v_company_id)
  on conflict (company_id) do nothing;

  select *
  into v_settings
  from public.company_ui_settings
  where company_id = v_company_id;

  return jsonb_build_object(
    'ok', true,
    'theme_key', v_settings.theme_key,
    'updated_at', v_settings.updated_at,
    'can_manage', public.current_user_has_permission('settings.appearance.manage')
  );
end;
$function$;

create or replace function public.save_company_ui_settings(
  p_theme_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  if v_theme not in ('jinlab_blue','jinlab_blue_dark','system') then
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
$function$;

grant execute on function public.get_company_ui_settings() to authenticated;
grant execute on function public.save_company_ui_settings(text) to authenticated;
;
