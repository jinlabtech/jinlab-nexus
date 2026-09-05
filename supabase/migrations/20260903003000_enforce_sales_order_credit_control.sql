-- ============================================================
-- JINLAB Nexus
-- Accounting Sprint 19.3K
-- Sales Order Payment Basis + Credit Hold Enforcement
-- ============================================================


-- ============================================================
-- 1. PAYMENT BASIS
--
-- Existing historical orders remain NULL.
-- New / draft orders must select a basis before confirmation.
-- ============================================================

alter table public.sales_order
add column if not exists
payment_basis text;


do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname =
      'sales_order_payment_basis_check'
  ) then

    alter table public.sales_order
    add constraint
      sales_order_payment_basis_check
    check (
      payment_basis is null
      or payment_basis in (
        'credit',
        'cash',
        'prepaid'
      )
    );

  end if;
end;
$$;


comment on column
public.sales_order.payment_basis
is
'Commercial payment basis: credit, cash or prepaid. Historical records may be null.';


-- ============================================================
-- 2. OVERRIDE PERMISSION
-- ============================================================

insert into public.permissions (
  permission_name
)
values (
  'sales.credit_hold.override'
)
on conflict (
  permission_name
)
do nothing;


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
    'sales.credit_hold.override'
where r.role_name in (
  'owner',
  'admin'
)
on conflict (
  role_id,
  permission_id
)
do nothing;


-- ============================================================
-- 3. CREDIT HOLD OVERRIDE AUDIT TABLE
--
-- One controlled override belongs to ONE sales order.
-- It never removes the customer's actual credit hold.
-- ============================================================

create table if not exists
public.sales_credit_hold_override (
  id uuid primary key
    default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  customer_id uuid not null
    references public.customer(id),

  sales_order_id uuid not null
    references public.sales_order(id)
    on delete cascade,

  override_reason text not null,

  approved_by uuid not null
    references auth.users(id),

  approved_at timestamptz
    not null default now(),

  used_at timestamptz,

  created_at timestamptz
    not null default now(),

  unique (
    company_id,
    sales_order_id
  )
);


create index if not exists
sales_credit_hold_override_customer_idx
on public.sales_credit_hold_override (
  company_id,
  customer_id,
  approved_at desc
);


alter table
public.sales_credit_hold_override
enable row level security;


drop policy if exists
"company users view sales credit overrides"
on public.sales_credit_hold_override;


create policy
"company users view sales credit overrides"
on public.sales_credit_hold_override
for select
to authenticated
using (
  company_id =
    public.current_company_id()
);


grant select
on public.sales_credit_hold_override
to authenticated;


revoke insert, update, delete
on public.sales_credit_hold_override
from authenticated;


-- ============================================================
-- 4. SET SALES ORDER PAYMENT BASIS
--
-- Only editable while order is draft.
-- ============================================================

create or replace function
public.set_sales_order_payment_basis(
  p_sales_order_id uuid,
  p_payment_basis text
)
returns public.sales_order
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_order public.sales_order%rowtype;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;


  v_company_id :=
    public.current_company_id();


  if v_company_id is null then
    raise exception
      'Your account is not linked to a company.';
  end if;


  if p_payment_basis not in (
    'credit',
    'cash',
    'prepaid'
  ) then
    raise exception
      'Payment basis must be credit, cash or prepaid.';
  end if;


  select *
  into v_order
  from public.sales_order
  where id =
    p_sales_order_id
    and company_id =
      v_company_id
  for update;


  if not found then
    raise exception
      'Sales order could not be found.';
  end if;


  if v_order.status <> 'draft' then
    raise exception
      'Payment basis can only be changed while the sales order is a draft.';
  end if;


  update public.sales_order
  set payment_basis =
    p_payment_basis
  where id =
    p_sales_order_id
    and company_id =
      v_company_id
  returning *
  into v_order;


  return v_order;

end;
$$;


revoke all
on function
public.set_sales_order_payment_basis(
  uuid,
  text
)
from public;


grant execute
on function
public.set_sales_order_payment_basis(
  uuid,
  text
)
to authenticated;


-- ============================================================
-- 5. APPROVE CREDIT HOLD OVERRIDE
-- ============================================================

create or replace function
public.approve_sales_credit_hold_override(
  p_sales_order_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_order public.sales_order%rowtype;

  v_customer_name text;

  v_credit_hold boolean := false;

  v_collection_status text;

  v_override_id uuid;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;


  if not public.current_user_has_permission(
    'sales.credit_hold.override'
  ) then
    raise exception
      'Permission denied: sales.credit_hold.override';
  end if;


  if nullif(
       trim(
         coalesce(
           p_reason,
           ''
         )
       ),
       ''
     ) is null then

    raise exception
      'A reason is required for a credit hold override.';

  end if;


  v_company_id :=
    public.current_company_id();


  select *
  into v_order
  from public.sales_order
  where id =
    p_sales_order_id
    and company_id =
      v_company_id
  for update;


  if not found then
    raise exception
      'Sales order could not be found.';
  end if;


  if v_order.status <> 'draft' then
    raise exception
      'Credit hold overrides can only be approved for draft sales orders.';
  end if;


  if v_order.payment_basis is null then
    raise exception
      'Select the sales order payment basis before requesting an override.';
  end if;


  if v_order.payment_basis <> 'credit' then
    raise exception
      'A credit hold override is only required for a credit sales order.';
  end if;


  select
    c.customer_name
  into
    v_customer_name
  from public.customer c
  where c.id =
    v_order.customer_id
    and c.company_id =
      v_company_id;


  select
    coalesce(
      d.credit_hold,
      false
    ),
    d.collection_status
  into
    v_credit_hold,
    v_collection_status
  from public.debtor_collection_control d
  where d.company_id =
    v_company_id
    and d.customer_id =
      v_order.customer_id;


  v_credit_hold :=
    coalesce(
      v_credit_hold,
      false
    )
    or coalesce(
      v_collection_status =
        'credit_hold',
      false
    );


  if not v_credit_hold then
    raise exception
      'This customer is not currently on credit hold.';
  end if;


  insert into
  public.sales_credit_hold_override (
    company_id,
    customer_id,
    sales_order_id,
    override_reason,
    approved_by
  )
  values (
    v_company_id,
    v_order.customer_id,
    v_order.id,
    trim(
      p_reason
    ),
    auth.uid()
  )

  on conflict (
    company_id,
    sales_order_id
  )
  do update set
    customer_id =
      excluded.customer_id,

    override_reason =
      excluded.override_reason,

    approved_by =
      auth.uid(),

    approved_at =
      now(),

    used_at =
      null

  returning id
  into
    v_override_id;


  return jsonb_build_object(
    'ok',
      true,

    'override_id',
      v_override_id,

    'sales_order_id',
      v_order.id,

    'customer_id',
      v_order.customer_id,

    'customer_name',
      v_customer_name,

    'reason',
      trim(
        p_reason
      )
  );

end;
$$;


revoke all
on function
public.approve_sales_credit_hold_override(
  uuid,
  text
)
from public;


grant execute
on function
public.approve_sales_credit_hold_override(
  uuid,
  text
)
to authenticated;


-- ============================================================
-- 6. SALES ORDER CREDIT CONTROL TRIGGER
--
-- Drafts are allowed.
--
-- Before a draft becomes an active commitment:
--   payment basis MUST exist.
--
-- CREDIT + credit hold:
--   requires authorised override.
--
-- CASH / PREPAID:
--   allowed by this credit-hold rule.
--
-- Future payment-proof controls can separately verify that
-- cash/prepaid money was actually received.
-- ============================================================

create or replace function
public.enforce_sales_order_credit_control()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credit_hold boolean := false;

  v_collection_status text;

  v_override_id uuid;
begin

  -- ----------------------------------------------------------
  -- Payment basis becomes immutable after draft stage.
  -- ----------------------------------------------------------

  if TG_OP = 'UPDATE'
     and old.status <> 'draft'
     and new.payment_basis
         is distinct from
         old.payment_basis then

    raise exception
      'Payment basis cannot be changed after the sales order leaves draft status.';

  end if;


  -- ----------------------------------------------------------
  -- Only check when a new commitment leaves draft.
  -- Historical active records are not rewritten/reclassified.
  -- ----------------------------------------------------------

  if new.status in (
       'confirmed',
       'delivered',
       'invoiced'
     )
     and (
       TG_OP = 'INSERT'
       or old.status = 'draft'
     ) then


    if new.payment_basis is null then
      raise exception
        'Select a payment basis before confirming this sales order.';
    end if;


    if new.payment_basis = 'credit' then

      select
        coalesce(
          d.credit_hold,
          false
        ),
        d.collection_status
      into
        v_credit_hold,
        v_collection_status
      from public.debtor_collection_control d
      where d.company_id =
        new.company_id
        and d.customer_id =
          new.customer_id;


      v_credit_hold :=
        coalesce(
          v_credit_hold,
          false
        )
        or coalesce(
          v_collection_status =
            'credit_hold',
          false
        );


      if v_credit_hold then

        select
          o.id
        into
          v_override_id
        from public.sales_credit_hold_override o
        where o.company_id =
          new.company_id
          and o.customer_id =
            new.customer_id
          and o.sales_order_id =
            new.id;


        if v_override_id is null then

          raise exception
            'CREDIT HOLD: This customer cannot receive additional credit. An authorised override is required before this sales order can be confirmed.';

        end if;


        update public.sales_credit_hold_override
        set used_at =
          coalesce(
            used_at,
            now()
          )
        where id =
          v_override_id;

      end if;

    end if;

  end if;


  return new;

end;
$$;


drop trigger if exists
enforce_sales_order_credit_control_trigger
on public.sales_order;


create trigger
enforce_sales_order_credit_control_trigger
before insert or update
on public.sales_order
for each row
execute function
public.enforce_sales_order_credit_control();


-- ============================================================
-- 7. READ CREDIT CONTROL STATUS FOR UI
-- ============================================================

create or replace function
public.get_sales_order_credit_control(
  p_sales_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_order public.sales_order%rowtype;

  v_customer_name text;

  v_collection_status text :=
    'normal';

  v_credit_hold boolean :=
    false;

  v_credit_hold_reason text;

  v_override jsonb;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;


  v_company_id :=
    public.current_company_id();


  select *
  into v_order
  from public.sales_order
  where id =
    p_sales_order_id
    and company_id =
      v_company_id;


  if not found then
    raise exception
      'Sales order could not be found.';
  end if;


  select
    c.customer_name
  into
    v_customer_name
  from public.customer c
  where c.id =
    v_order.customer_id
    and c.company_id =
      v_company_id;


  select
    coalesce(
      d.collection_status,
      'normal'
    ),
    coalesce(
      d.credit_hold,
      false
    ),
    d.credit_hold_reason
  into
    v_collection_status,
    v_credit_hold,
    v_credit_hold_reason
  from public.debtor_collection_control d
  where d.company_id =
    v_company_id
    and d.customer_id =
      v_order.customer_id;


  v_collection_status :=
    coalesce(
      v_collection_status,
      'normal'
    );


  v_credit_hold :=
    coalesce(
      v_credit_hold,
      false
    )
    or (
      v_collection_status =
      'credit_hold'
    );


  select
    jsonb_build_object(
      'id',
        o.id,

      'reason',
        o.override_reason,

      'approved_by',
        o.approved_by,

      'approved_at',
        o.approved_at,

      'used_at',
        o.used_at
    )
  into
    v_override
  from public.sales_credit_hold_override o
  where o.company_id =
    v_company_id
    and o.sales_order_id =
      v_order.id;


  return jsonb_build_object(
    'ok',
      true,

    'sales_order_id',
      v_order.id,

    'customer_id',
      v_order.customer_id,

    'customer_name',
      v_customer_name,

    'sales_order_status',
      v_order.status,

    'payment_basis',
      v_order.payment_basis,

    'collection_status',
      v_collection_status,

    'credit_hold',
      v_credit_hold,

    'credit_hold_reason',
      v_credit_hold_reason,

    'override',
      v_override
  );

end;
$$;


revoke all
on function
public.get_sales_order_credit_control(uuid)
from public;


grant execute
on function
public.get_sales_order_credit_control(uuid)
to authenticated;


-- ============================================================
-- END
-- ============================================================
