-- ============================================================
-- JINLAB Nexus
-- Quotation Delivery Foundation
-- ============================================================


-- ============================================================
-- 1. QUOTATION SHARE LINKS
-- ============================================================

create table if not exists public.quotation_share_link (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  branch_id uuid not null
    references public.branch(id)
    on delete restrict,

  quotation_id uuid not null
    references public.quotation(id)
    on delete cascade,

  customer_id uuid not null
    references public.customer(id)
    on delete restrict,

  token text not null unique
    default encode(
      extensions.gen_random_bytes(32),
      'hex'
    ),

  status text not null default 'active'
    check (
      status in (
        'active',
        'expired',
        'cancelled'
      )
    ),

  expires_at timestamptz,

  created_by uuid
    references auth.users(id)
    on delete set null,

  first_viewed_at timestamptz,

  last_viewed_at timestamptz,

  view_count integer not null default 0
    check (view_count >= 0),

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()
);


-- Only one active customer link per quotation.
create unique index if not exists
quotation_share_link_active_unique_idx
on public.quotation_share_link (
  quotation_id
)
where status = 'active';


create index if not exists
quotation_share_link_company_idx
on public.quotation_share_link (
  company_id
);


create index if not exists
quotation_share_link_quotation_idx
on public.quotation_share_link (
  quotation_id
);


create index if not exists
quotation_share_link_token_idx
on public.quotation_share_link (
  token
);


create index if not exists
quotation_share_link_customer_idx
on public.quotation_share_link (
  customer_id
);


drop trigger if exists
quotation_share_link_set_updated_at
on public.quotation_share_link;

create trigger
quotation_share_link_set_updated_at
before update
on public.quotation_share_link
for each row
execute function public.set_updated_at();


-- ============================================================
-- 2. QUOTATION DELIVERY HISTORY
-- ============================================================

create table if not exists public.quotation_delivery (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  quotation_id uuid not null
    references public.quotation(id)
    on delete cascade,

  share_link_id uuid
    references public.quotation_share_link(id)
    on delete set null,

  customer_id uuid not null
    references public.customer(id)
    on delete restrict,

  delivery_method text not null
    check (
      delivery_method in (
        'email',
        'whatsapp',
        'copied_link',
        'download_pdf',
        'print',
        'manual'
      )
    ),

  destination text,

  status text not null default 'prepared'
    check (
      status in (
        'prepared',
        'sent',
        'delivered',
        'viewed',
        'failed'
      )
    ),

  provider text,

  provider_message_id text,

  failure_reason text,

  metadata jsonb not null default '{}'::jsonb,

  prepared_at timestamptz not null default now(),

  sent_at timestamptz,

  delivered_at timestamptz,

  viewed_at timestamptz,

  created_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now()
);


create index if not exists
quotation_delivery_company_idx
on public.quotation_delivery (
  company_id
);


create index if not exists
quotation_delivery_quotation_idx
on public.quotation_delivery (
  quotation_id,
  created_at desc
);


create index if not exists
quotation_delivery_share_link_idx
on public.quotation_delivery (
  share_link_id
);


-- ============================================================
-- 3. CUSTOMER ACTION HISTORY
-- ============================================================

create table if not exists public.quotation_customer_action (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  quotation_id uuid not null
    references public.quotation(id)
    on delete cascade,

  share_link_id uuid
    references public.quotation_share_link(id)
    on delete set null,

  customer_id uuid not null
    references public.customer(id)
    on delete restrict,

  action text not null
    check (
      action in (
        'viewed',
        'accepted',
        'declined',
        'requested_changes'
      )
    ),

  message text,

  metadata jsonb not null default '{}'::jsonb,

  occurred_at timestamptz not null default now(),

  created_at timestamptz not null default now()
);


create index if not exists
quotation_customer_action_company_idx
on public.quotation_customer_action (
  company_id
);


create index if not exists
quotation_customer_action_quotation_idx
on public.quotation_customer_action (
  quotation_id,
  occurred_at desc
);


create index if not exists
quotation_customer_action_link_idx
on public.quotation_customer_action (
  share_link_id
);


-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================

alter table public.quotation_share_link
enable row level security;

alter table public.quotation_delivery
enable row level security;

alter table public.quotation_customer_action
enable row level security;


drop policy if exists
"Users can view company quotation share links"
on public.quotation_share_link;

create policy
"Users can view company quotation share links"
on public.quotation_share_link
for select
to authenticated
using (
  company_id in (
    select company_id
    from public.user_profile
    where user_id = auth.uid()
  )
);


drop policy if exists
"Users can view company quotation deliveries"
on public.quotation_delivery;

create policy
"Users can view company quotation deliveries"
on public.quotation_delivery
for select
to authenticated
using (
  company_id in (
    select company_id
    from public.user_profile
    where user_id = auth.uid()
  )
);


drop policy if exists
"Users can view company quotation customer actions"
on public.quotation_customer_action;

create policy
"Users can view company quotation customer actions"
on public.quotation_customer_action
for select
to authenticated
using (
  company_id in (
    select company_id
    from public.user_profile
    where user_id = auth.uid()
  )
);


-- Anonymous users never receive direct table access.
revoke all
on public.quotation_share_link
from anon;

revoke all
on public.quotation_delivery
from anon;

revoke all
on public.quotation_customer_action
from anon;


-- Authenticated users may inspect history,
-- but writes go through controlled RPCs.
revoke insert, update, delete
on public.quotation_share_link
from authenticated;

revoke insert, update, delete
on public.quotation_delivery
from authenticated;

revoke insert, update, delete
on public.quotation_customer_action
from authenticated;

grant select
on public.quotation_share_link
to authenticated;

grant select
on public.quotation_delivery
to authenticated;

grant select
on public.quotation_customer_action
to authenticated;


-- ============================================================
-- 5. CREATE / REUSE SECURE SHARE LINK
-- ============================================================

create or replace function public.create_quotation_share_link(
  p_quotation_id uuid,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_quotation public.quotation%rowtype;
  v_link public.quotation_share_link%rowtype;
  v_expires_at timestamptz;
begin

  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission(
    'quotation.send'
  ) then
    raise exception
      'You do not have permission to send quotations.';
  end if;

  v_company_id :=
    public.current_settings_company_id();

  if v_company_id is null then
    raise exception
      'Your account is not linked to a company.';
  end if;

  select *
  into v_quotation
  from public.quotation
  where id = p_quotation_id
    and company_id = v_company_id;

  if not found then
    raise exception
      'Quotation could not be found.';
  end if;

  if v_quotation.status not in (
    'draft',
    'sent'
  ) then
    raise exception
      'Only draft or sent quotations can create a customer link.';
  end if;

  v_expires_at :=
    coalesce(
      p_expires_at,
      now() + interval '30 days'
    );

  if v_expires_at <= now() then
    raise exception
      'Quotation link expiry must be in the future.';
  end if;

  -- Expire stale active links before creating another.
  update public.quotation_share_link
  set status = 'expired'
  where quotation_id = v_quotation.id
    and company_id = v_company_id
    and status = 'active'
    and expires_at is not null
    and expires_at <= now();

  -- Reuse the existing valid link when possible.
  select *
  into v_link
  from public.quotation_share_link
  where quotation_id = v_quotation.id
    and company_id = v_company_id
    and status = 'active'
    and (
      expires_at is null
      or expires_at > now()
    )
  order by created_at desc
  limit 1;

  if not found then

    insert into public.quotation_share_link (
      company_id,
      branch_id,
      quotation_id,
      customer_id,
      expires_at,
      created_by
    )
    values (
      v_quotation.company_id,
      v_quotation.branch_id,
      v_quotation.id,
      v_quotation.customer_id,
      v_expires_at,
      auth.uid()
    )
    returning *
    into v_link;

  end if;

  return jsonb_build_object(
    'ok', true,
    'share_link', jsonb_build_object(
      'id', v_link.id,
      'token', v_link.token,
      'status', v_link.status,
      'expires_at', v_link.expires_at,
      'quotation_id', v_link.quotation_id
    )
  );

end;
$$;


revoke all
on function public.create_quotation_share_link(
  uuid,
  timestamptz
)
from public;

grant execute
on function public.create_quotation_share_link(
  uuid,
  timestamptz
)
to authenticated;


-- ============================================================
-- 6. RECORD QUOTATION DELIVERY
-- ============================================================

create or replace function public.record_quotation_delivery(
  p_quotation_id uuid,
  p_share_link_id uuid,
  p_delivery_method text,
  p_destination text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_quotation public.quotation%rowtype;
  v_link public.quotation_share_link%rowtype;
  v_delivery public.quotation_delivery%rowtype;
begin

  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission(
    'quotation.send'
  ) then
    raise exception
      'You do not have permission to send quotations.';
  end if;

  if p_delivery_method not in (
    'email',
    'whatsapp',
    'copied_link',
    'download_pdf',
    'print',
    'manual'
  ) then
    raise exception
      'Unsupported quotation delivery method.';
  end if;

  v_company_id :=
    public.current_settings_company_id();

  select *
  into v_quotation
  from public.quotation
  where id = p_quotation_id
    and company_id = v_company_id;

  if not found then
    raise exception
      'Quotation could not be found.';
  end if;

  if v_quotation.status not in (
    'draft',
    'sent'
  ) then
    raise exception
      'This quotation can no longer be sent.';
  end if;

  select *
  into v_link
  from public.quotation_share_link
  where id = p_share_link_id
    and quotation_id = v_quotation.id
    and company_id = v_company_id
    and status = 'active';

  if not found then
    raise exception
      'Active quotation share link could not be found.';
  end if;

  if v_link.expires_at is not null
     and v_link.expires_at <= now() then

    update public.quotation_share_link
    set status = 'expired'
    where id = v_link.id;

    raise exception
      'Quotation share link has expired.';
  end if;

  insert into public.quotation_delivery (
    company_id,
    quotation_id,
    share_link_id,
    customer_id,
    delivery_method,
    destination,
    status,
    metadata,
    sent_at,
    created_by
  )
  values (
    v_quotation.company_id,
    v_quotation.id,
    v_link.id,
    v_quotation.customer_id,
    p_delivery_method,
    nullif(trim(p_destination), ''),
    'sent',
    coalesce(
      p_metadata,
      '{}'::jsonb
    ),
    now(),
    auth.uid()
  )
  returning *
  into v_delivery;

  if v_quotation.status = 'draft' then
    update public.quotation
    set status = 'sent'
    where id = v_quotation.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'delivery', jsonb_build_object(
      'id', v_delivery.id,
      'delivery_method',
        v_delivery.delivery_method,
      'destination',
        v_delivery.destination,
      'status',
        v_delivery.status,
      'sent_at',
        v_delivery.sent_at
    )
  );

end;
$$;


revoke all
on function public.record_quotation_delivery(
  uuid,
  uuid,
  text,
  text,
  jsonb
)
from public;

grant execute
on function public.record_quotation_delivery(
  uuid,
  uuid,
  text,
  text,
  jsonb
)
to authenticated;


-- ============================================================
-- 7. CANCEL SHARE LINK
-- ============================================================

create or replace function public.cancel_quotation_share_link(
  p_share_link_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_link public.quotation_share_link%rowtype;
begin

  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission(
    'quotation.send'
  ) then
    raise exception
      'You do not have permission to manage quotation links.';
  end if;

  v_company_id :=
    public.current_settings_company_id();

  update public.quotation_share_link
  set status = 'cancelled'
  where id = p_share_link_id
    and company_id = v_company_id
    and status = 'active'
  returning *
  into v_link;

  if not found then
    raise exception
      'Active quotation share link could not be found.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'share_link_id', v_link.id,
    'status', v_link.status
  );

end;
$$;


revoke all
on function public.cancel_quotation_share_link(uuid)
from public;

grant execute
on function public.cancel_quotation_share_link(uuid)
to authenticated;


-- ============================================================
-- END
-- ============================================================
