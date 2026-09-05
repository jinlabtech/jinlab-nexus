-- ============================================================
-- JINLAB Nexus
-- Sprint 19.3L1
-- Sales Order Payment Evidence
--
-- Commercial basis:
--   credit      = customer may pay later
--   immediate   = full payment required
--   prepaid     = full payment required before fulfilment
--
-- Actual payment method is separate:
--   cash / eft / card / other
-- ============================================================


-- ============================================================
-- 1. PERMISSION
-- ============================================================

insert into public.permissions (
  permission_name
)
values (
  'sales.payment.record'
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
    'sales.payment.record'
where r.role_name in (
  'owner',
  'admin',
  'manager'
)
on conflict (
  role_id,
  permission_id
)
do nothing;


-- ============================================================
-- 2. SALES ORDER PAYMENT
-- ============================================================

create table if not exists
public.sales_order_payment (
  id uuid primary key
    default gen_random_uuid(),

  company_id uuid not null
    references public.company(id)
    on delete cascade,

  branch_id uuid not null
    references public.branch(id),

  sales_order_id uuid not null
    references public.sales_order(id)
    on delete restrict,

  customer_id uuid not null
    references public.customer(id),

  payment_date date not null
    default current_date,

  payment_method text not null
    check (
      payment_method in (
        'cash',
        'eft',
        'card',
        'other'
      )
    ),

  reference text,

  amount numeric(14,2) not null
    check (
      amount > 0
    ),

  notes text,

  received_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null
    default now()
);


create index if not exists
sales_order_payment_order_idx
on public.sales_order_payment (
  company_id,
  sales_order_id,
  payment_date,
  created_at
);


create index if not exists
sales_order_payment_customer_idx
on public.sales_order_payment (
  company_id,
  customer_id,
  payment_date
);


-- ============================================================
-- 3. RLS
-- ============================================================

alter table
public.sales_order_payment
enable row level security;


drop policy if exists
"company users view sales order payments"
on public.sales_order_payment;


create policy
"company users view sales order payments"
on public.sales_order_payment
for select
to authenticated
using (
  company_id =
    public.current_company_id()
);


grant select
on public.sales_order_payment
to authenticated;


revoke insert, update, delete
on public.sales_order_payment
from authenticated;


-- ============================================================
-- 4. RECORD ACTUAL PAYMENT
--
-- This RPC is the only supported insert path.
-- ============================================================

create or replace function
public.record_sales_order_payment(
  p_sales_order_id uuid,
  p_payment_date date,
  p_payment_method text,
  p_reference text,
  p_amount numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_order public.sales_order%rowtype;

  v_paid numeric(14,2) := 0;

  v_balance numeric(14,2) := 0;

  v_payment_id uuid;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;


  if not public.current_user_has_permission(
    'sales.payment.record'
  ) then
    raise exception
      'Permission denied: sales.payment.record';
  end if;


  v_company_id :=
    public.current_company_id();


  if v_company_id is null then
    raise exception
      'Your account is not linked to a company.';
  end if;


  if p_payment_method not in (
    'cash',
    'eft',
    'card',
    'other'
  ) then
    raise exception
      'Payment method must be cash, EFT, card or other.';
  end if;


  if p_amount is null
     or p_amount <= 0 then

    raise exception
      'Payment amount must be greater than zero.';

  end if;


  if p_payment_date is null then
    raise exception
      'Actual payment date is required.';
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


  if v_order.status in (
    'cancelled',
    'invoiced'
  ) then

    raise exception
      'Payments cannot be recorded against a cancelled or already invoiced sales order.';

  end if;


  if v_order.payment_basis is null then
    raise exception
      'Select the sales order payment basis before recording payment.';
  end if;


  if v_order.total_amount <= 0 then
    raise exception
      'The sales order must contain billable items before payment can be recorded.';
  end if;


  select
    round(
      coalesce(
        sum(p.amount),
        0
      ),
      2
    )
  into
    v_paid
  from public.sales_order_payment p
  where p.company_id =
    v_company_id
    and p.sales_order_id =
      v_order.id;


  v_balance :=
    round(
      v_order.total_amount -
      v_paid,
      2
    );


  if p_amount >
     v_balance then

    raise exception
      'Payment exceeds the remaining sales order balance of R%.',
      to_char(
        v_balance,
        'FM999999999990.00'
      );

  end if;


  insert into
  public.sales_order_payment (
    company_id,
    branch_id,
    sales_order_id,
    customer_id,

    payment_date,
    payment_method,

    reference,
    amount,
    notes,

    received_by
  )
  values (
    v_company_id,
    v_order.branch_id,
    v_order.id,
    v_order.customer_id,

    p_payment_date,
    p_payment_method,

    nullif(
      trim(
        coalesce(
          p_reference,
          ''
        )
      ),
      ''
    ),

    round(
      p_amount,
      2
    ),

    nullif(
      trim(
        coalesce(
          p_notes,
          ''
        )
      ),
      ''
    ),

    auth.uid()
  )
  returning id
  into
    v_payment_id;


  return
    v_payment_id;

end;
$$;


revoke all
on function
public.record_sales_order_payment(
  uuid,
  date,
  text,
  text,
  numeric,
  text
)
from public;


grant execute
on function
public.record_sales_order_payment(
  uuid,
  date,
  text,
  text,
  numeric,
  text
)
to authenticated;


-- ============================================================
-- 5. PAYMENT SUMMARY
-- ============================================================

create or replace function
public.get_sales_order_payment_summary(
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

  v_paid numeric(14,2) := 0;

  v_balance numeric(14,2) := 0;

  v_payments jsonb :=
    '[]'::jsonb;
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
    round(
      coalesce(
        sum(p.amount),
        0
      ),
      2
    )
  into
    v_paid
  from public.sales_order_payment p
  where p.company_id =
    v_company_id
    and p.sales_order_id =
      v_order.id;


  v_balance :=
    round(
      greatest(
        v_order.total_amount -
        v_paid,
        0
      ),
      2
    );


  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',
            p.id,

          'payment_date',
            p.payment_date,

          'payment_method',
            p.payment_method,

          'reference',
            p.reference,

          'amount',
            p.amount,

          'notes',
            p.notes,

          'received_by',
            p.received_by,

          'created_at',
            p.created_at
        )
        order by
          p.payment_date,
          p.created_at,
          p.id
      ),
      '[]'::jsonb
    )
  into
    v_payments
  from public.sales_order_payment p
  where p.company_id =
    v_company_id
    and p.sales_order_id =
      v_order.id;


  return jsonb_build_object(
    'ok',
      true,

    'sales_order_id',
      v_order.id,

    'payment_basis',
      v_order.payment_basis,

    'order_total',
      round(
        v_order.total_amount,
        2
      ),

    'amount_paid',
      v_paid,

    'balance_due',
      v_balance,

    'fully_paid',
      abs(
        v_balance
      ) < 0.01,

    'payment_count',
      jsonb_array_length(
        v_payments
      ),

    'payments',
      v_payments
  );

end;
$$;


revoke all
on function
public.get_sales_order_payment_summary(uuid)
from public;


grant execute
on function
public.get_sales_order_payment_summary(uuid)
to authenticated;


-- ============================================================
-- 6. PROTECT PAYMENT EVIDENCE
--
-- Actual money records are immutable.
-- Corrections/refunds will use explicit reversal workflows later.
-- ============================================================

create or replace function
public.protect_sales_order_payment()
returns trigger
language plpgsql
set search_path = public
as $$
begin

  if TG_OP = 'UPDATE' then
    raise exception
      'Sales order payment records are immutable. Use a payment correction or reversal workflow.';

  end if;


  if TG_OP = 'DELETE' then
    raise exception
      'Sales order payment records cannot be deleted. Use a payment reversal workflow.';

  end if;


  return old;

end;
$$;


drop trigger if exists
protect_sales_order_payment_trigger
on public.sales_order_payment;


create trigger
protect_sales_order_payment_trigger
before update or delete
on public.sales_order_payment
for each row
execute function
public.protect_sales_order_payment();


-- ============================================================
-- 7. LOCK COMMERCIAL DETAILS AFTER PAYMENT BEGINS
--
-- Once money exists, ordinary users must not change:
--   customer
--   branch
--   payment basis
--
-- ============================================================

create or replace function
public.protect_paid_sales_order_header()
returns trigger
language plpgsql
set search_path = public
as $$
begin

  if exists (
    select 1
    from public.sales_order_payment p
    where p.company_id =
      old.company_id
      and p.sales_order_id =
        old.id
  ) then

    if new.customer_id
       is distinct from
       old.customer_id then

      raise exception
        'Customer cannot be changed after payment has been recorded.';

    end if;


    if new.branch_id
       is distinct from
       old.branch_id then

      raise exception
        'Branch cannot be changed after payment has been recorded.';

    end if;


    if new.payment_basis
       is distinct from
       old.payment_basis then

      raise exception
        'Payment basis cannot be changed after payment has been recorded.';

    end if;

  end if;


  return new;

end;
$$;


drop trigger if exists
protect_paid_sales_order_header_trigger
on public.sales_order;


create trigger
protect_paid_sales_order_header_trigger
before update
on public.sales_order
for each row
execute function
public.protect_paid_sales_order_header();


-- ============================================================
-- 8. LOCK ITEMS AFTER PAYMENT BEGINS
--
-- This prevents:
--   receive R4,500
--   then staff silently change order to R6,000.
-- ============================================================

create or replace function
public.protect_paid_sales_order_items()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_sales_order_id uuid;

  v_company_id uuid;
begin

  v_sales_order_id :=
    case
      when TG_OP = 'DELETE'
      then old.sales_order_id
      else new.sales_order_id
    end;


  select
    so.company_id
  into
    v_company_id
  from public.sales_order so
  where so.id =
    v_sales_order_id;


  if exists (
    select 1
    from public.sales_order_payment p
    where p.company_id =
      v_company_id
      and p.sales_order_id =
        v_sales_order_id
  ) then

    raise exception
      'Sales order items cannot be changed after payment begins. Use a controlled adjustment workflow.';

  end if;


  if TG_OP = 'DELETE' then
    return old;
  end if;


  return new;

end;
$$;


drop trigger if exists
protect_paid_sales_order_items_trigger
on public.sales_order_item;


create trigger
protect_paid_sales_order_items_trigger
before insert or update or delete
on public.sales_order_item
for each row
execute function
public.protect_paid_sales_order_items();


-- ============================================================
-- 9. PREVENT PAY-NOW / PREPAID INVOICE CONVERSION
--    UNTIL FULL PAYMENT EVIDENCE EXISTS
--
-- Enforcement is BEFORE invoice insertion, avoiding an orphan
-- draft invoice if payment is incomplete.
-- ============================================================

create or replace function
public.enforce_sales_order_payment_before_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_basis text;

  v_order_total numeric(14,2);

  v_paid numeric(14,2) := 0;

  v_balance numeric(14,2) := 0;
begin

  if new.sales_order_id is null then
    return new;
  end if;


  select
    so.payment_basis,
    so.total_amount
  into
    v_basis,
    v_order_total
  from public.sales_order so
  where so.id =
    new.sales_order_id
    and so.company_id =
      new.company_id;


  if not found then
    raise exception
      'Source sales order could not be found.';
  end if;


  if v_basis in (
    'immediate',
    'prepaid'
  ) then

    select
      round(
        coalesce(
          sum(p.amount),
          0
        ),
        2
      )
    into
      v_paid
    from public.sales_order_payment p
    where p.company_id =
      new.company_id
      and p.sales_order_id =
        new.sales_order_id;


    v_balance :=
      round(
        greatest(
          v_order_total -
          v_paid,
          0
        ),
        2
      );


    if v_balance > 0.009 then

      raise exception
        'PAYMENT REQUIRED: This % sales order still has R% outstanding. Record full actual payment before creating the invoice.',
        case
          when v_basis =
            'immediate'
          then 'Pay Now'
          else 'Prepaid'
        end,
        to_char(
          v_balance,
          'FM999999999990.00'
        );

    end if;

  end if;


  return new;

end;
$$;


drop trigger if exists
enforce_sales_order_payment_before_invoice_trigger
on public.invoice;


create trigger
enforce_sales_order_payment_before_invoice_trigger
before insert
on public.invoice
for each row
execute function
public.enforce_sales_order_payment_before_invoice();


-- ============================================================
-- 10. UPDATE PAYMENT BASIS SETTER
--
-- Payment basis cannot be changed once actual money exists.
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
    'immediate',
    'prepaid'
  ) then

    raise exception
      'Payment basis must be credit, immediate or prepaid.';

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


  if exists (
    select 1
    from public.sales_order_payment p
    where p.company_id =
      v_company_id
      and p.sales_order_id =
        v_order.id
  ) then

    raise exception
      'Payment basis cannot be changed after payment has been recorded.';

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
-- END
-- ============================================================
