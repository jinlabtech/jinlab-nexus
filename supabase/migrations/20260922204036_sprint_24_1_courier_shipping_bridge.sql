-- ============================================================
-- JINLAB Nexus — Sprint 24.1
-- Provider-neutral courier shipping bridge
-- ============================================================

create table if not exists public.courier_provider_connection (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  provider_code text not null,
  display_name text not null,
  connection_mode text not null default 'external_portal'
    check (connection_mode in ('external_portal', 'api')),
  account_reference text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courier_provider_code_format
    check (provider_code ~ '^[a-z0-9_]{2,40}$'),
  unique (company_id, provider_code)
);

create table if not exists public.courier_shipment_sequence (
  company_id uuid primary key references public.company(id) on delete cascade,
  last_number bigint not null default 0 check (last_number >= 0)
);

create table if not exists public.courier_shipment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  provider_connection_id uuid references public.courier_provider_connection(id) on delete set null,
  provider_code text not null,
  shipment_number text not null,
  source_type text not null default 'manual'
    check (source_type in ('invoice', 'sales_order', 'service_job', 'manual')),
  source_id uuid,
  source_reference text,
  recipient_name text not null,
  recipient_company text,
  recipient_phone text not null,
  recipient_email text,
  address_line_1 text not null,
  address_line_2 text,
  suburb text,
  city text not null,
  province text,
  postal_code text not null,
  country_code text not null default 'ZA',
  parcel_count integer not null default 1 check (parcel_count between 1 and 100),
  total_weight_kg numeric(12,3) not null check (total_weight_kg > 0),
  length_cm numeric(12,2) check (length_cm is null or length_cm > 0),
  width_cm numeric(12,2) check (width_cm is null or width_cm > 0),
  height_cm numeric(12,2) check (height_cm is null or height_cm > 0),
  contents_description text,
  service_code text,
  service_name text,
  status text not null default 'draft'
    check (status in (
      'draft', 'booked', 'collected', 'in_transit',
      'out_for_delivery', 'delivered', 'exception', 'cancelled'
    )),
  tracking_number text,
  tracking_url text,
  external_shipment_id text,
  cost_excluding_vat numeric(14,2) check (cost_excluding_vat is null or cost_excluding_vat >= 0),
  vat_amount numeric(14,2) check (vat_amount is null or vat_amount >= 0),
  cost_including_vat numeric(14,2) check (cost_including_vat is null or cost_including_vat >= 0),
  currency text not null default 'ZAR' check (currency ~ '^[A-Z]{3}$'),
  notes text,
  booked_at timestamptz,
  collected_at timestamptz,
  delivered_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, shipment_number),
  constraint courier_tracking_unique
    unique nulls not distinct (company_id, provider_code, tracking_number),
  constraint courier_source_consistency
    check (
      (source_type = 'manual' and source_id is null)
      or source_type <> 'manual'
    )
);

create table if not exists public.courier_shipment_event (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  shipment_id uuid not null references public.courier_shipment(id) on delete cascade,
  status text not null
    check (status in (
      'draft', 'booked', 'collected', 'in_transit',
      'out_for_delivery', 'delivered', 'exception', 'cancelled'
    )),
  event_at timestamptz not null default now(),
  location text,
  description text,
  provider_event_id text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists courier_shipment_company_status_idx
  on public.courier_shipment(company_id, status, updated_at desc);
create index if not exists courier_shipment_source_idx
  on public.courier_shipment(company_id, source_type, source_id);
create index if not exists courier_shipment_tracking_idx
  on public.courier_shipment(company_id, tracking_number)
  where tracking_number is not null;
create index if not exists courier_event_shipment_time_idx
  on public.courier_shipment_event(shipment_id, event_at desc);

alter table public.courier_provider_connection enable row level security;
alter table public.courier_shipment_sequence enable row level security;
alter table public.courier_shipment enable row level security;
alter table public.courier_shipment_event enable row level security;

drop policy if exists courier_provider_company_isolation on public.courier_provider_connection;
create policy courier_provider_company_isolation
  on public.courier_provider_connection
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists courier_shipment_company_isolation on public.courier_shipment;
create policy courier_shipment_company_isolation
  on public.courier_shipment
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists courier_event_company_isolation on public.courier_shipment_event;
create policy courier_event_company_isolation
  on public.courier_shipment_event
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

revoke all on public.courier_provider_connection from public, anon, authenticated;
revoke all on public.courier_shipment_sequence from public, anon, authenticated;
revoke all on public.courier_shipment from public, anon, authenticated;
revoke all on public.courier_shipment_event from public, anon, authenticated;
grant all on public.courier_provider_connection to service_role;
grant all on public.courier_shipment_sequence to service_role;
grant all on public.courier_shipment to service_role;
grant all on public.courier_shipment_event to service_role;

insert into public.permissions (permission_name)
values ('shipping.view'), ('shipping.manage'), ('shipping.dispatch')
on conflict (permission_name) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.role_name in ('owner', 'admin', 'manager')
  and p.permission_name in ('shipping.view', 'shipping.manage', 'shipping.dispatch')
on conflict (role_id, permission_id) do nothing;

create or replace function public.next_courier_shipment_number(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_number bigint;
begin
  insert into public.courier_shipment_sequence (company_id, last_number)
  values (p_company_id, 1)
  on conflict (company_id) do update
    set last_number = public.courier_shipment_sequence.last_number + 1
  returning last_number into v_number;

  return 'SHP-' || to_char(now(), 'YYYYMM') || '-' || lpad(v_number::text, 6, '0');
end;
$function$;

revoke all on function public.next_courier_shipment_number(uuid) from public, anon, authenticated;
grant execute on function public.next_courier_shipment_number(uuid) to service_role;

create or replace function public.save_courier_provider_connection(
  p_provider_code text,
  p_display_name text,
  p_account_reference text default null,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company_id uuid;
  v_connection public.courier_provider_connection%rowtype;
  v_provider_code text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('shipping.manage') then
    raise exception 'Permission denied: shipping.manage';
  end if;

  v_company_id := public.current_company_id();
  if v_company_id is null then raise exception 'A company context is required.'; end if;

  v_provider_code := lower(btrim(coalesce(p_provider_code, '')));
  if v_provider_code !~ '^[a-z0-9_]{2,40}$' then
    raise exception 'Invalid courier provider code.';
  end if;
  if nullif(btrim(coalesce(p_display_name, '')), '') is null then
    raise exception 'Courier display name is required.';
  end if;

  insert into public.courier_provider_connection (
    company_id, provider_code, display_name, connection_mode,
    account_reference, is_active, created_by, updated_at
  ) values (
    v_company_id, v_provider_code, btrim(p_display_name), 'external_portal',
    nullif(btrim(coalesce(p_account_reference, '')), ''), coalesce(p_is_active, true),
    auth.uid(), now()
  )
  on conflict (company_id, provider_code) do update set
    display_name = excluded.display_name,
    account_reference = excluded.account_reference,
    is_active = excluded.is_active,
    updated_at = now()
  returning * into v_connection;

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  ) values (
    v_company_id, auth.uid(), 'courier_provider_connected', 'shipping',
    v_connection.id, 'Courier provider connection saved.',
    jsonb_build_object('provider_code', v_provider_code, 'mode', 'external_portal')
  );

  return jsonb_build_object('ok', true, 'connection_id', v_connection.id,
    'provider_code', v_connection.provider_code, 'is_active', v_connection.is_active);
end;
$function$;

create or replace function public.save_courier_shipment(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company_id uuid;
  v_id uuid;
  v_source_id uuid;
  v_source_type text;
  v_provider_code text;
  v_connection_id uuid;
  v_shipment public.courier_shipment%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('shipping.manage') then
    raise exception 'Permission denied: shipping.manage';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Shipment payload must be a JSON object.';
  end if;

  v_company_id := public.current_company_id();
  if v_company_id is null then raise exception 'A company context is required.'; end if;

  v_id := nullif(p_payload->>'id', '')::uuid;
  v_source_id := nullif(p_payload->>'source_id', '')::uuid;
  v_source_type := lower(btrim(coalesce(p_payload->>'source_type', 'manual')));
  v_provider_code := lower(btrim(coalesce(p_payload->>'provider_code', 'courier_guy')));

  if v_source_type not in ('invoice', 'sales_order', 'service_job', 'manual') then
    raise exception 'Unsupported shipment source type.';
  end if;
  if v_source_type = 'manual' then v_source_id := null; end if;
  if v_provider_code !~ '^[a-z0-9_]{2,40}$' then raise exception 'Invalid courier provider code.'; end if;
  if nullif(btrim(coalesce(p_payload->>'recipient_name', '')), '') is null then raise exception 'Recipient name is required.'; end if;
  if nullif(btrim(coalesce(p_payload->>'recipient_phone', '')), '') is null then raise exception 'Recipient phone is required.'; end if;
  if nullif(btrim(coalesce(p_payload->>'address_line_1', '')), '') is null then raise exception 'Delivery address is required.'; end if;
  if nullif(btrim(coalesce(p_payload->>'city', '')), '') is null then raise exception 'Delivery city is required.'; end if;
  if nullif(btrim(coalesce(p_payload->>'postal_code', '')), '') is null then raise exception 'Postal code is required.'; end if;
  if coalesce((p_payload->>'total_weight_kg')::numeric, 0) <= 0 then raise exception 'Parcel weight must be greater than zero.'; end if;

  if v_source_id is not null then
    if v_source_type = 'invoice' and not exists (
      select 1 from public.invoice where id = v_source_id and company_id = v_company_id
    ) then raise exception 'Invoice source was not found for this company.';
    elsif v_source_type = 'sales_order' and not exists (
      select 1 from public.sales_order where id = v_source_id and company_id = v_company_id
    ) then raise exception 'Sales order source was not found for this company.';
    elsif v_source_type = 'service_job' and not exists (
      select 1 from public.service_job where id = v_source_id and company_id = v_company_id
    ) then raise exception 'Service job source was not found for this company.';
    end if;
  end if;

  select id into v_connection_id
  from public.courier_provider_connection
  where company_id = v_company_id and provider_code = v_provider_code and is_active
  limit 1;

  if v_id is null then
    insert into public.courier_shipment (
      company_id, provider_connection_id, provider_code, shipment_number,
      source_type, source_id, source_reference,
      recipient_name, recipient_company, recipient_phone, recipient_email,
      address_line_1, address_line_2, suburb, city, province, postal_code, country_code,
      parcel_count, total_weight_kg, length_cm, width_cm, height_cm,
      contents_description, service_code, service_name, notes, created_by, updated_by
    ) values (
      v_company_id, v_connection_id, v_provider_code,
      public.next_courier_shipment_number(v_company_id),
      v_source_type, v_source_id, nullif(btrim(coalesce(p_payload->>'source_reference', '')), ''),
      btrim(p_payload->>'recipient_name'), nullif(btrim(coalesce(p_payload->>'recipient_company', '')), ''),
      btrim(p_payload->>'recipient_phone'), nullif(btrim(coalesce(p_payload->>'recipient_email', '')), ''),
      btrim(p_payload->>'address_line_1'), nullif(btrim(coalesce(p_payload->>'address_line_2', '')), ''),
      nullif(btrim(coalesce(p_payload->>'suburb', '')), ''), btrim(p_payload->>'city'),
      nullif(btrim(coalesce(p_payload->>'province', '')), ''), btrim(p_payload->>'postal_code'),
      upper(coalesce(nullif(btrim(p_payload->>'country_code'), ''), 'ZA')),
      coalesce((p_payload->>'parcel_count')::integer, 1), (p_payload->>'total_weight_kg')::numeric,
      nullif(p_payload->>'length_cm', '')::numeric, nullif(p_payload->>'width_cm', '')::numeric,
      nullif(p_payload->>'height_cm', '')::numeric,
      nullif(btrim(coalesce(p_payload->>'contents_description', '')), ''),
      nullif(btrim(coalesce(p_payload->>'service_code', '')), ''),
      nullif(btrim(coalesce(p_payload->>'service_name', '')), ''),
      nullif(btrim(coalesce(p_payload->>'notes', '')), ''), auth.uid(), auth.uid()
    ) returning * into v_shipment;

    insert into public.courier_shipment_event (
      company_id, shipment_id, status, description, recorded_by
    ) values (v_company_id, v_shipment.id, 'draft', 'Shipment draft created in Nexus.', auth.uid());
  else
    select * into v_shipment from public.courier_shipment
    where id = v_id and company_id = v_company_id for update;
    if v_shipment.id is null then raise exception 'Shipment was not found.'; end if;
    if v_shipment.status <> 'draft' then raise exception 'Only draft shipments can be edited.'; end if;

    update public.courier_shipment set
      provider_connection_id = v_connection_id, provider_code = v_provider_code,
      source_type = v_source_type, source_id = v_source_id,
      source_reference = nullif(btrim(coalesce(p_payload->>'source_reference', '')), ''),
      recipient_name = btrim(p_payload->>'recipient_name'),
      recipient_company = nullif(btrim(coalesce(p_payload->>'recipient_company', '')), ''),
      recipient_phone = btrim(p_payload->>'recipient_phone'),
      recipient_email = nullif(btrim(coalesce(p_payload->>'recipient_email', '')), ''),
      address_line_1 = btrim(p_payload->>'address_line_1'),
      address_line_2 = nullif(btrim(coalesce(p_payload->>'address_line_2', '')), ''),
      suburb = nullif(btrim(coalesce(p_payload->>'suburb', '')), ''),
      city = btrim(p_payload->>'city'), province = nullif(btrim(coalesce(p_payload->>'province', '')), ''),
      postal_code = btrim(p_payload->>'postal_code'),
      country_code = upper(coalesce(nullif(btrim(p_payload->>'country_code'), ''), 'ZA')),
      parcel_count = coalesce((p_payload->>'parcel_count')::integer, 1),
      total_weight_kg = (p_payload->>'total_weight_kg')::numeric,
      length_cm = nullif(p_payload->>'length_cm', '')::numeric,
      width_cm = nullif(p_payload->>'width_cm', '')::numeric,
      height_cm = nullif(p_payload->>'height_cm', '')::numeric,
      contents_description = nullif(btrim(coalesce(p_payload->>'contents_description', '')), ''),
      service_code = nullif(btrim(coalesce(p_payload->>'service_code', '')), ''),
      service_name = nullif(btrim(coalesce(p_payload->>'service_name', '')), ''),
      notes = nullif(btrim(coalesce(p_payload->>'notes', '')), ''),
      updated_by = auth.uid(), updated_at = now()
    where id = v_id returning * into v_shipment;
  end if;

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  ) values (
    v_company_id, auth.uid(), case when v_id is null then 'courier_shipment_created' else 'courier_shipment_updated' end,
    'shipping', v_shipment.id, 'Courier shipment saved.',
    jsonb_build_object('shipment_number', v_shipment.shipment_number, 'provider_code', v_provider_code,
      'source_type', v_source_type, 'source_id', v_source_id)
  );

  return jsonb_build_object('ok', true, 'shipment_id', v_shipment.id,
    'shipment_number', v_shipment.shipment_number, 'status', v_shipment.status);
end;
$function$;

create or replace function public.book_courier_shipment(
  p_shipment_id uuid,
  p_tracking_number text,
  p_tracking_url text default null,
  p_external_shipment_id text default null,
  p_service_code text default null,
  p_service_name text default null,
  p_cost_including_vat numeric default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company_id uuid;
  v_shipment public.courier_shipment%rowtype;
  v_tracking_url text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('shipping.dispatch') then
    raise exception 'Permission denied: shipping.dispatch';
  end if;
  if nullif(btrim(coalesce(p_tracking_number, '')), '') is null then
    raise exception 'A courier tracking or waybill number is required.';
  end if;

  v_company_id := public.current_company_id();
  select * into v_shipment from public.courier_shipment
  where id = p_shipment_id and company_id = v_company_id for update;
  if v_shipment.id is null then raise exception 'Shipment was not found.'; end if;
  if v_shipment.status not in ('draft', 'booked') then
    raise exception 'Only draft or booked shipments can be booked.';
  end if;

  v_tracking_url := nullif(btrim(coalesce(p_tracking_url, '')), '');
  if v_tracking_url is null then
    v_tracking_url := case v_shipment.provider_code
      when 'courier_guy' then 'https://thecourierguy.co.za/tracking/'
      when 'ram' then 'https://www.ram.co.za/t/' || replace(btrim(p_tracking_number), ' ', '')
      when 'fastway' then 'https://www.fastway.co.za/our-services/track-your-parcel?l=' || replace(btrim(p_tracking_number), ' ', '')
      else null
    end;
  end if;
  if v_tracking_url is not null and v_tracking_url !~* '^https://[^[:space:]]+$' then
    raise exception 'Tracking URL must use HTTPS.';
  end if;

  update public.courier_shipment set
    status = 'booked', tracking_number = btrim(p_tracking_number), tracking_url = v_tracking_url,
    external_shipment_id = nullif(btrim(coalesce(p_external_shipment_id, '')), ''),
    service_code = coalesce(nullif(btrim(coalesce(p_service_code, '')), ''), service_code),
    service_name = coalesce(nullif(btrim(coalesce(p_service_name, '')), ''), service_name),
    cost_including_vat = p_cost_including_vat,
    notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), notes),
    booked_at = coalesce(booked_at, now()), updated_by = auth.uid(), updated_at = now()
  where id = p_shipment_id returning * into v_shipment;

  insert into public.courier_shipment_event (
    company_id, shipment_id, status, event_at, description, recorded_by
  ) values (v_company_id, v_shipment.id, 'booked', now(),
    'Courier booking linked to Nexus. Waybill ' || v_shipment.tracking_number || '.', auth.uid());

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  ) values (v_company_id, auth.uid(), 'courier_shipment_booked', 'shipping', v_shipment.id,
    'Courier shipment booked and waybill linked.',
    jsonb_build_object('shipment_number', v_shipment.shipment_number,
      'provider_code', v_shipment.provider_code, 'tracking_number', v_shipment.tracking_number));

  return jsonb_build_object('ok', true, 'shipment_id', v_shipment.id,
    'shipment_number', v_shipment.shipment_number, 'status', v_shipment.status,
    'tracking_number', v_shipment.tracking_number, 'tracking_url', v_shipment.tracking_url);
end;
$function$;

create or replace function public.record_courier_tracking_event(
  p_shipment_id uuid,
  p_status text,
  p_event_at timestamptz default now(),
  p_location text default null,
  p_description text default null,
  p_provider_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company_id uuid;
  v_status text;
  v_shipment public.courier_shipment%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('shipping.dispatch') then
    raise exception 'Permission denied: shipping.dispatch';
  end if;
  v_status := lower(btrim(coalesce(p_status, '')));
  if v_status not in ('booked', 'collected', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'cancelled') then
    raise exception 'Unsupported courier status.';
  end if;

  v_company_id := public.current_company_id();
  select * into v_shipment from public.courier_shipment
  where id = p_shipment_id and company_id = v_company_id for update;
  if v_shipment.id is null then raise exception 'Shipment was not found.'; end if;
  if v_shipment.status in ('delivered', 'cancelled') and v_shipment.status <> v_status then
    raise exception 'A delivered or cancelled shipment cannot move to another status.';
  end if;

  insert into public.courier_shipment_event (
    company_id, shipment_id, status, event_at, location, description, provider_event_id, recorded_by
  ) values (
    v_company_id, v_shipment.id, v_status, coalesce(p_event_at, now()),
    nullif(btrim(coalesce(p_location, '')), ''), nullif(btrim(coalesce(p_description, '')), ''),
    nullif(btrim(coalesce(p_provider_event_id, '')), ''), auth.uid()
  );

  update public.courier_shipment set
    status = v_status,
    collected_at = case when v_status = 'collected' then coalesce(collected_at, p_event_at, now()) else collected_at end,
    delivered_at = case when v_status = 'delivered' then coalesce(delivered_at, p_event_at, now()) else delivered_at end,
    updated_by = auth.uid(), updated_at = now()
  where id = v_shipment.id returning * into v_shipment;

  insert into public.audit_log (
    company_id, user_id, action, module, record_id, description, metadata
  ) values (v_company_id, auth.uid(), 'courier_tracking_updated', 'shipping', v_shipment.id,
    'Courier shipment status updated to ' || v_status || '.',
    jsonb_build_object('shipment_number', v_shipment.shipment_number, 'status', v_status));

  return jsonb_build_object('ok', true, 'shipment_id', v_shipment.id,
    'shipment_number', v_shipment.shipment_number, 'status', v_shipment.status,
    'updated_at', v_shipment.updated_at);
end;
$function$;

create or replace function public.get_courier_shipping_workspace(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company_id uuid;
  v_limit integer;
  v_shipments jsonb;
  v_providers jsonb;
  v_stats jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('shipping.view') then
    raise exception 'Permission denied: shipping.view';
  end if;
  v_company_id := public.current_company_id();
  v_limit := greatest(1, least(coalesce(p_limit, 100), 250));

  select coalesce(jsonb_agg(jsonb_build_object(
    'provider_code', p.provider_code, 'display_name', p.display_name,
    'portal_url', p.portal_url, 'tracking_url', p.tracking_url,
    'connected', c.id is not null, 'connection_id', c.id,
    'account_reference', c.account_reference, 'is_active', coalesce(c.is_active, false)
  ) order by p.sort_order), '[]'::jsonb)
  into v_providers
  from (values
    ('courier_guy', 'The Courier Guy', 'https://portal.thecourierguy.co.za/login', 'https://thecourierguy.co.za/tracking/', 1),
    ('ram', 'RAM Hand-to-Hand', 'https://portal.ram.co.za/', 'https://www.ram.co.za/', 2),
    ('fastway', 'Fastway Couriers', 'https://www.fastway.co.za/', 'https://www.fastway.co.za/our-services/track-your-parcel', 3),
    ('custom', 'Other courier', null, null, 9)
  ) as p(provider_code, display_name, portal_url, tracking_url, sort_order)
  left join public.courier_provider_connection c
    on c.company_id = v_company_id and c.provider_code = p.provider_code;

  select jsonb_build_object(
    'total', count(*),
    'draft', count(*) filter (where status = 'draft'),
    'active', count(*) filter (where status in ('booked','collected','in_transit','out_for_delivery','exception')),
    'delivered', count(*) filter (where status = 'delivered'),
    'exceptions', count(*) filter (where status = 'exception')
  ) into v_stats
  from public.courier_shipment where company_id = v_company_id;

  select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object(
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.event_at desc)
      from public.courier_shipment_event e where e.shipment_id = s.id), '[]'::jsonb)
  ) order by s.updated_at desc), '[]'::jsonb)
  into v_shipments
  from (
    select * from public.courier_shipment
    where company_id = v_company_id
    order by updated_at desc
    limit v_limit
  ) s;

  return jsonb_build_object('ok', true, 'providers', v_providers,
    'stats', v_stats, 'shipments', v_shipments,
    'manual_bridge_ready', true, 'api_credentials_stored_client_side', false);
end;
$function$;

revoke all on function public.save_courier_provider_connection(text, text, text, boolean) from public, anon;
revoke all on function public.save_courier_shipment(jsonb) from public, anon;
revoke all on function public.book_courier_shipment(uuid, text, text, text, text, text, numeric, text) from public, anon;
revoke all on function public.record_courier_tracking_event(uuid, text, timestamptz, text, text, text) from public, anon;
revoke all on function public.get_courier_shipping_workspace(integer) from public, anon;

grant execute on function public.save_courier_provider_connection(text, text, text, boolean) to authenticated, service_role;
grant execute on function public.save_courier_shipment(jsonb) to authenticated, service_role;
grant execute on function public.book_courier_shipment(uuid, text, text, text, text, text, numeric, text) to authenticated, service_role;
grant execute on function public.record_courier_tracking_event(uuid, text, timestamptz, text, text, text) to authenticated, service_role;
grant execute on function public.get_courier_shipping_workspace(integer) to authenticated, service_role;

-- ============================================================
-- END SPRINT 24.1
-- ============================================================
;
