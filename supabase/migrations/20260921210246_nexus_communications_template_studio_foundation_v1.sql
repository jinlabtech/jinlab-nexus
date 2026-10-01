
-- JINLAB Nexus Communications
-- Template Studio foundation v1

-- =========================================================
-- 1. Enrich template versions for visual editing/rendering
-- =========================================================
alter table public.communication_template_version
  add column if not exists design_settings jsonb not null
    default '{"contentWidth":640,"backgroundColor":"#f5f7fb","contentBackgroundColor":"#ffffff","fontFamily":"Arial, Helvetica, sans-serif","textColor":"#111827","linkColor":"#2563eb","buttonRadius":8}'::jsonb,
  add column if not exists variable_schema jsonb not null default '[]'::jsonb,
  add column if not exists editor_version integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'communication_template_version_design_settings_check'
      and conrelid = 'public.communication_template_version'::regclass
  ) then
    alter table public.communication_template_version
      add constraint communication_template_version_design_settings_check
      check (jsonb_typeof(design_settings) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'communication_template_version_variable_schema_check'
      and conrelid = 'public.communication_template_version'::regclass
  ) then
    alter table public.communication_template_version
      add constraint communication_template_version_variable_schema_check
      check (jsonb_typeof(variable_schema) in ('array','object'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'communication_template_version_editor_version_check'
      and conrelid = 'public.communication_template_version'::regclass
  ) then
    alter table public.communication_template_version
      add constraint communication_template_version_editor_version_check
      check (editor_version > 0);
  end if;
end $$;

-- =========================================================
-- 2. Company / branch communication branding
-- =========================================================
create table if not exists public.communication_brand_profile (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  is_default boolean not null default false,
  is_active boolean not null default true,

  display_name text,
  logo_path text,

  primary_color text not null default '#0F4C81'
    check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#111827'
    check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text not null default '#2563EB'
    check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  background_color text not null default '#F5F7FB'
    check (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  content_background_color text not null default '#FFFFFF'
    check (content_background_color ~ '^#[0-9A-Fa-f]{6}$'),
  text_color text not null default '#111827'
    check (text_color ~ '^#[0-9A-Fa-f]{6}$'),

  font_family text not null default 'Arial, Helvetica, sans-serif',
  button_radius integer not null default 8 check (button_radius between 0 and 40),

  footer_text text,
  website text,
  contact_email text,
  contact_phone text,
  address_text text,
  social_links jsonb not null default '{}'::jsonb
    check (jsonb_typeof(social_links) = 'object'),
  extra_settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(extra_settings) = 'object'),

  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint communication_brand_profile_company_id_id_key unique (company_id, id),
  constraint communication_brand_profile_company_branch_fkey
    foreign key (company_id, branch_id)
    references public.branch(company_id, id)
    on delete restrict
);

create index if not exists communication_brand_profile_company_idx
  on public.communication_brand_profile(company_id, is_active, name);

create unique index if not exists communication_brand_profile_company_default_uidx
  on public.communication_brand_profile(company_id)
  where branch_id is null and is_default = true and is_active = true;

create unique index if not exists communication_brand_profile_branch_default_uidx
  on public.communication_brand_profile(company_id, branch_id)
  where branch_id is not null and is_default = true and is_active = true;

-- =========================================================
-- 3. Public-safe image asset registry for email templates
-- =========================================================
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'communication-assets',
  'communication-assets',
  true,
  10485760,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.communication_template_asset (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  template_id uuid,
  brand_profile_id uuid,
  asset_type text not null default 'image'
    check (asset_type in ('image','logo','banner','product_image','icon','background')),
  storage_bucket text not null default 'communication-assets',
  storage_path text not null,
  original_filename text,
  mime_type text not null
    check (mime_type in ('image/png','image/jpeg','image/webp','image/gif')),
  byte_size bigint check (byte_size is null or byte_size >= 0),
  width_px integer check (width_px is null or width_px > 0),
  height_px integer check (height_px is null or height_px > 0),
  alt_text text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint communication_template_asset_company_id_id_key unique (company_id, id),
  constraint communication_template_asset_storage_key
    unique (company_id, storage_bucket, storage_path),
  constraint communication_template_asset_template_fkey
    foreign key (company_id, template_id)
    references public.communication_template(company_id, id)
    on delete set null,
  constraint communication_template_asset_brand_fkey
    foreign key (company_id, brand_profile_id)
    references public.communication_brand_profile(company_id, id)
    on delete set null
);

create index if not exists communication_template_asset_template_idx
  on public.communication_template_asset(company_id, template_id, created_at desc);

create index if not exists communication_template_asset_brand_idx
  on public.communication_template_asset(company_id, brand_profile_id, created_at desc);

-- =========================================================
-- 4. Updated-at trigger
-- =========================================================
drop trigger if exists communication_brand_profile_set_updated_at
  on public.communication_brand_profile;

create trigger communication_brand_profile_set_updated_at
before update on public.communication_brand_profile
for each row execute function public.set_updated_at();

-- =========================================================
-- 5. RLS
-- =========================================================
alter table public.communication_brand_profile enable row level security;
alter table public.communication_template_asset enable row level security;

drop policy if exists communication_brand_profile_select_policy
  on public.communication_brand_profile;

create policy communication_brand_profile_select_policy
on public.communication_brand_profile
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.current_user_has_permission('templates.view')
    or public.current_user_has_permission('templates.manage')
  )
);

drop policy if exists communication_template_asset_select_policy
  on public.communication_template_asset;

create policy communication_template_asset_select_policy
on public.communication_template_asset
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.current_user_has_permission('templates.view')
    or public.current_user_has_permission('templates.manage')
  )
);

revoke all on public.communication_brand_profile from anon;
revoke all on public.communication_template_asset from anon;

revoke insert, update, delete on public.communication_brand_profile from authenticated;
revoke insert, update, delete on public.communication_template_asset from authenticated;

grant select on public.communication_brand_profile to authenticated;
grant select on public.communication_template_asset to authenticated;

-- No authenticated direct INSERT policy is created on storage.objects.
-- Template assets are intentionally uploaded through a controlled server route.

-- =========================================================
-- 6. Controlled brand-profile write RPC
-- =========================================================
create or replace function public.communication_save_brand_profile(
  p_profile_id uuid default null,
  p_branch_id uuid default null,
  p_name text default 'Default Brand',
  p_is_default boolean default false,
  p_display_name text default null,
  p_logo_path text default null,
  p_primary_color text default '#0F4C81',
  p_secondary_color text default '#111827',
  p_accent_color text default '#2563EB',
  p_background_color text default '#F5F7FB',
  p_content_background_color text default '#FFFFFF',
  p_text_color text default '#111827',
  p_font_family text default 'Arial, Helvetica, sans-serif',
  p_button_radius integer default 8,
  p_footer_text text default null,
  p_website text default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_address_text text default null,
  p_social_links jsonb default '{}'::jsonb,
  p_extra_settings jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
  v_profile public.communication_brand_profile;
begin
  if v_user_id is null or v_company_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.current_user_has_permission('templates.manage') then
    raise exception 'Permission denied';
  end if;

  if p_branch_id is not null and not exists (
    select 1
    from public.branch b
    where b.company_id = v_company_id
      and b.id = p_branch_id
  ) then
    raise exception 'Invalid branch';
  end if;

  if p_social_links is null or jsonb_typeof(p_social_links) <> 'object' then
    raise exception 'social_links must be a JSON object';
  end if;

  if p_extra_settings is null or jsonb_typeof(p_extra_settings) <> 'object' then
    raise exception 'extra_settings must be a JSON object';
  end if;

  if p_is_default then
    update public.communication_brand_profile
    set is_default = false,
        updated_by = v_user_id
    where company_id = v_company_id
      and branch_id is not distinct from p_branch_id
      and is_default = true
      and (p_profile_id is null or id <> p_profile_id);
  end if;

  if p_profile_id is null then
    insert into public.communication_brand_profile (
      company_id, branch_id, name, is_default, display_name, logo_path,
      primary_color, secondary_color, accent_color, background_color,
      content_background_color, text_color, font_family, button_radius,
      footer_text, website, contact_email, contact_phone, address_text,
      social_links, extra_settings, created_by, updated_by
    )
    values (
      v_company_id, p_branch_id, btrim(p_name), p_is_default,
      p_display_name, p_logo_path,
      p_primary_color, p_secondary_color, p_accent_color, p_background_color,
      p_content_background_color, p_text_color, p_font_family, p_button_radius,
      p_footer_text, p_website, p_contact_email, p_contact_phone, p_address_text,
      p_social_links, p_extra_settings, v_user_id, v_user_id
    )
    returning * into v_profile;
  else
    update public.communication_brand_profile
    set
      branch_id = p_branch_id,
      name = btrim(p_name),
      is_default = p_is_default,
      display_name = p_display_name,
      logo_path = p_logo_path,
      primary_color = p_primary_color,
      secondary_color = p_secondary_color,
      accent_color = p_accent_color,
      background_color = p_background_color,
      content_background_color = p_content_background_color,
      text_color = p_text_color,
      font_family = p_font_family,
      button_radius = p_button_radius,
      footer_text = p_footer_text,
      website = p_website,
      contact_email = p_contact_email,
      contact_phone = p_contact_phone,
      address_text = p_address_text,
      social_links = p_social_links,
      extra_settings = p_extra_settings,
      updated_by = v_user_id,
      is_active = true
    where id = p_profile_id
      and company_id = v_company_id
    returning * into v_profile;

    if v_profile.id is null then
      raise exception 'Brand profile not found';
    end if;
  end if;

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  )
  values (
    v_company_id,
    v_user_id,
    case when p_profile_id is null then 'create' else 'update' end,
    'communications',
    v_profile.id,
    'Communication brand profile saved',
    jsonb_build_object(
      'brand_profile_id', v_profile.id,
      'branch_id', v_profile.branch_id,
      'is_default', v_profile.is_default
    )
  );

  return jsonb_build_object(
    'ok', true,
    'brand_profile_id', v_profile.id,
    'is_default', v_profile.is_default
  );
end;
$$;

revoke all on function public.communication_save_brand_profile(
  uuid,uuid,text,boolean,text,text,text,text,text,text,text,text,text,integer,
  text,text,text,text,text,jsonb,jsonb
) from public, anon;

grant execute on function public.communication_save_brand_profile(
  uuid,uuid,text,boolean,text,text,text,text,text,text,text,text,text,integer,
  text,text,text,text,text,jsonb,jsonb
) to authenticated;
;
