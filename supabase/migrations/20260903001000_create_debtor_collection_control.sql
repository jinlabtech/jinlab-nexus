-- ============================================================
-- JINLAB Nexus
-- Accounting Sprint 19.3I
-- Debtor Collection & Credit Control
-- ============================================================


-- ============================================================
-- 1. PERMISSION
-- ============================================================

insert into public.permissions (
  permission_name
)
values (
  'accounting.debtors.manage'
)
on conflict (
  permission_name
)
do nothing;


-- OWNER
insert into public.role_permissions (
  role_id,
  permission_id
)
select
  r.id,
  p.id
from public.roles r
join public.permissions p
  on p.permission_name =
    'accounting.debtors.manage'
where r.role_name =
  'owner'
on conflict (
  role_id,
  permission_id
)
do nothing;


-- ADMIN
insert into public.role_permissions (
  role_id,
  permission_id
)
select
  r.id,
  p.id
from public.roles r
join public.permissions p
  on p.permission_name =
    'accounting.debtors.manage'
where r.role_name =
  'admin'
on conflict (
  role_id,
  permission_id
)
do nothing;


-- MANAGER
insert into public.role_permissions (
  role_id,
  permission_id
)
select
  r.id,
  p.id
from public.roles r
join public.permissions p
  on p.permission_name =
    'accounting.debtors.manage'
where r.role_name =
  'manager'
on conflict (
  role_id,
  permission_id
)
do nothing;


-- ============================================================
-- 2. CUSTOMER COLLECTION CONTROL
-- ============================================================

create table if not exists
public.debtor_collection_control (
  id uuid primary key
    default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  customer_id uuid not null
    references public.customer(id)
    on delete cascade,

  collection_status text not null
    default 'normal'
    check (
      collection_status in (
        'normal',
        'follow_up',
        'promise_to_pay',
        'disputed',
        'credit_hold',
        'legal'
      )
    ),

  next_follow_up_date date,

  promised_payment_date date,

  promised_amount numeric(14,2)
    check (
      promised_amount is null
      or promised_amount > 0
    ),

  credit_hold boolean
    not null default false,

  credit_hold_reason text,

  assigned_to uuid
    references auth.users(id)
    on delete set null,

  last_contacted_at timestamptz,

  last_contacted_by uuid
    references auth.users(id)
    on delete set null,

  created_by uuid
    references auth.users(id)
    on delete set null,

  updated_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now(),

  unique (
    company_id,
    customer_id
  )
);


create index if not exists
debtor_collection_control_company_idx
on public.debtor_collection_control (
  company_id,
  collection_status,
  next_follow_up_date
);


drop trigger if exists
debtor_collection_control_updated_at
on public.debtor_collection_control;


create trigger
debtor_collection_control_updated_at
before update
on public.debtor_collection_control
for each row
execute function
public.set_updated_at();


-- ============================================================
-- 3. COLLECTION ACTIVITY LOG
--
-- Append-only history.
-- ============================================================

create table if not exists
public.debtor_collection_activity (
  id uuid primary key
    default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  customer_id uuid not null
    references public.customer(id)
    on delete cascade,

  activity_type text not null
    check (
      activity_type in (
        'note',
        'call',
        'email',
        'whatsapp',
        'promise',
        'reminder',
        'credit_hold',
        'credit_hold_removed',
        'dispute',
        'legal'
      )
    ),

  activity_date timestamptz
    not null default now(),

  note text not null,

  created_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz
    not null default now()
);


create index if not exists
debtor_collection_activity_customer_idx
on public.debtor_collection_activity (
  company_id,
  customer_id,
  activity_date desc
);


-- ============================================================
-- 4. RLS
-- ============================================================

alter table
public.debtor_collection_control
enable row level security;


alter table
public.debtor_collection_activity
enable row level security;


drop policy if exists
"accounting users view debtor controls"
on public.debtor_collection_control;


create policy
"accounting users view debtor controls"
on public.debtor_collection_control
for select
to authenticated
using (
  company_id =
    public.current_settings_company_id()

  and public.current_user_has_permission(
    'accounting.view'
  )
);


drop policy if exists
"accounting users view debtor activities"
on public.debtor_collection_activity;


create policy
"accounting users view debtor activities"
on public.debtor_collection_activity
for select
to authenticated
using (
  company_id =
    public.current_settings_company_id()

  and public.current_user_has_permission(
    'accounting.view'
  )
);


grant select
on public.debtor_collection_control
to authenticated;


grant select
on public.debtor_collection_activity
to authenticated;


revoke insert, update, delete
on public.debtor_collection_control
from authenticated;


revoke insert, update, delete
on public.debtor_collection_activity
from authenticated;


-- ============================================================
-- 5. READ CUSTOMER COLLECTION CONTROL
-- ============================================================

create or replace function
public.get_customer_collection_control(
  p_customer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_customer_name text;

  v_control jsonb;
  v_activity jsonb;
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


  select customer_name
  into v_customer_name
  from public.customer
  where id =
    p_customer_id
    and company_id =
      v_company_id;


  if not found then
    raise exception
      'Customer could not be found.';
  end if;


  select
    to_jsonb(c)
  into
    v_control
  from public.debtor_collection_control c
  where c.company_id =
    v_company_id
    and c.customer_id =
      p_customer_id;


  if v_control is null then

    v_control :=
      jsonb_build_object(
        'collection_status',
          'normal',

        'next_follow_up_date',
          null,

        'promised_payment_date',
          null,

        'promised_amount',
          null,

        'credit_hold',
          false,

        'credit_hold_reason',
          null,

        'assigned_to',
          null,

        'last_contacted_at',
          null,

        'last_contacted_by',
          null
      );

  end if;


  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',
            a.id,

          'activity_type',
            a.activity_type,

          'activity_date',
            a.activity_date,

          'note',
            a.note,

          'created_by',
            a.created_by
        )
        order by
          a.activity_date desc
      ),
      '[]'::jsonb
    )
  into
    v_activity
  from public.debtor_collection_activity a
  where a.company_id =
    v_company_id
    and a.customer_id =
      p_customer_id;


  return jsonb_build_object(
    'ok',
      true,

    'customer_id',
      p_customer_id,

    'customer_name',
      v_customer_name,

    'control',
      v_control,

    'activity',
      v_activity
  );

end;
$$;


revoke all
on function
public.get_customer_collection_control(uuid)
from public;


grant execute
on function
public.get_customer_collection_control(uuid)
to authenticated;


-- ============================================================
-- 6. UPDATE CONTROL
-- ============================================================

create or replace function
public.update_customer_collection_control(
  p_customer_id uuid,

  p_collection_status text,

  p_next_follow_up_date date default null,

  p_promised_payment_date date default null,

  p_promised_amount numeric default null,

  p_credit_hold boolean default false,

  p_credit_hold_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_previous_hold boolean := false;

  v_control_id uuid;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;


  if not public.current_user_has_permission(
    'accounting.debtors.manage'
  ) then
    raise exception
      'Permission denied: accounting.debtors.manage';
  end if;


  v_company_id :=
    public.current_settings_company_id();


  if not exists (
    select 1
    from public.customer
    where id =
      p_customer_id
      and company_id =
        v_company_id
  ) then

    raise exception
      'Customer could not be found.';

  end if;


  if p_collection_status not in (
    'normal',
    'follow_up',
    'promise_to_pay',
    'disputed',
    'credit_hold',
    'legal'
  ) then

    raise exception
      'Invalid collection status.';

  end if;


  if p_promised_amount is not null
     and p_promised_amount <= 0 then

    raise exception
      'Promised payment amount must be greater than zero.';

  end if;


  select
    credit_hold
  into
    v_previous_hold
  from public.debtor_collection_control
  where company_id =
    v_company_id
    and customer_id =
      p_customer_id;


  v_previous_hold :=
    coalesce(
      v_previous_hold,
      false
    );


  insert into
  public.debtor_collection_control (
    company_id,
    customer_id,

    collection_status,

    next_follow_up_date,

    promised_payment_date,
    promised_amount,

    credit_hold,
    credit_hold_reason,

    created_by,
    updated_by
  )
  values (
    v_company_id,
    p_customer_id,

    p_collection_status,

    p_next_follow_up_date,

    p_promised_payment_date,
    p_promised_amount,

    p_credit_hold,

    nullif(
      trim(
        coalesce(
          p_credit_hold_reason,
          ''
        )
      ),
      ''
    ),

    auth.uid(),
    auth.uid()
  )

  on conflict (
    company_id,
    customer_id
  )

  do update set
    collection_status =
      excluded.collection_status,

    next_follow_up_date =
      excluded.next_follow_up_date,

    promised_payment_date =
      excluded.promised_payment_date,

    promised_amount =
      excluded.promised_amount,

    credit_hold =
      excluded.credit_hold,

    credit_hold_reason =
      excluded.credit_hold_reason,

    updated_by =
      auth.uid()

  returning id
  into v_control_id;


  -- ----------------------------------------------------------
  -- Automatically audit credit hold changes
  -- ----------------------------------------------------------

  if p_credit_hold
     and not v_previous_hold then

    insert into
    public.debtor_collection_activity (
      company_id,
      customer_id,
      activity_type,
      note,
      created_by
    )
    values (
      v_company_id,
      p_customer_id,
      'credit_hold',

      coalesce(
        nullif(
          trim(
            p_credit_hold_reason
          ),
          ''
        ),
        'Customer account placed on credit hold.'
      ),

      auth.uid()
    );


  elsif not p_credit_hold
        and v_previous_hold then

    insert into
    public.debtor_collection_activity (
      company_id,
      customer_id,
      activity_type,
      note,
      created_by
    )
    values (
      v_company_id,
      p_customer_id,
      'credit_hold_removed',
      'Customer credit hold removed.',
      auth.uid()
    );

  end if;


  return jsonb_build_object(
    'ok',
      true,

    'control_id',
      v_control_id
  );

end;
$$;


revoke all
on function
public.update_customer_collection_control(
  uuid,
  text,
  date,
  date,
  numeric,
  boolean,
  text
)
from public;


grant execute
on function
public.update_customer_collection_control(
  uuid,
  text,
  date,
  date,
  numeric,
  boolean,
  text
)
to authenticated;


-- ============================================================
-- 7. ADD COLLECTION ACTIVITY
-- ============================================================

create or replace function
public.add_customer_collection_activity(
  p_customer_id uuid,
  p_activity_type text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_activity_id uuid;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;


  if not public.current_user_has_permission(
    'accounting.debtors.manage'
  ) then
    raise exception
      'Permission denied: accounting.debtors.manage';
  end if;


  v_company_id :=
    public.current_settings_company_id();


  if not exists (
    select 1
    from public.customer
    where id =
      p_customer_id
      and company_id =
        v_company_id
  ) then

    raise exception
      'Customer could not be found.';

  end if;


  if p_activity_type not in (
    'note',
    'call',
    'email',
    'whatsapp',
    'promise',
    'reminder',
    'credit_hold',
    'credit_hold_removed',
    'dispute',
    'legal'
  ) then

    raise exception
      'Invalid collection activity type.';

  end if;


  if nullif(
       trim(
         coalesce(
           p_note,
           ''
         )
       ),
       ''
     ) is null then

    raise exception
      'Collection activity note is required.';

  end if;


  insert into
  public.debtor_collection_activity (
    company_id,
    customer_id,
    activity_type,
    note,
    created_by
  )
  values (
    v_company_id,
    p_customer_id,
    p_activity_type,
    trim(
      p_note
    ),
    auth.uid()
  )

  returning id
  into
    v_activity_id;


  -- Contact activities update latest contact.
  if p_activity_type in (
    'call',
    'email',
    'whatsapp',
    'reminder'
  ) then

    insert into
    public.debtor_collection_control (
      company_id,
      customer_id,
      last_contacted_at,
      last_contacted_by,
      created_by,
      updated_by
    )
    values (
      v_company_id,
      p_customer_id,
      now(),
      auth.uid(),
      auth.uid(),
      auth.uid()
    )

    on conflict (
      company_id,
      customer_id
    )

    do update set
      last_contacted_at =
        now(),

      last_contacted_by =
        auth.uid(),

      updated_by =
        auth.uid();

  end if;


  return
    v_activity_id;

end;
$$;


revoke all
on function
public.add_customer_collection_activity(
  uuid,
  text,
  text
)
from public;


grant execute
on function
public.add_customer_collection_activity(
  uuid,
  text,
  text
)
to authenticated;


-- ============================================================
-- 8. PROTECT ACTIVITY HISTORY
--
-- Collection activity is evidence.
-- Correction = new activity, not rewriting history.
-- ============================================================

revoke update, delete
on public.debtor_collection_activity
from authenticated;


-- ============================================================
-- END
-- ============================================================
