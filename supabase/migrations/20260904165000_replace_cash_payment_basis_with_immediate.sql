-- ============================================================
-- JINLAB Nexus
-- Sales Payment Basis Clarification
--
-- "cash" was ambiguous because cash is also an actual
-- payment method.
--
-- Sales commercial basis is now:
--   credit
--   immediate
--   prepaid
--
-- Actual payment method remains separately:
--   cash / eft / card / other / gateways
-- ============================================================


-- ============================================================
-- 1. REMOVE OLD CHECK TEMPORARILY
-- ============================================================

alter table public.sales_order
drop constraint if exists
sales_order_payment_basis_check;


-- ============================================================
-- 2. MIGRATE EXISTING SALES ORDERS
--
-- This changes terminology only.
-- It does not change totals, accounting or customer balances.
-- ============================================================

-- Temporarily suspend the commercial immutability trigger
-- while migrating the terminology from cash -> immediate.
alter table public.sales_order
disable trigger
enforce_sales_order_credit_control_trigger;


update public.sales_order
set payment_basis = 'immediate'
where payment_basis = 'cash';


-- Restore normal protection immediately after migration.
alter table public.sales_order
enable trigger
enforce_sales_order_credit_control_trigger;


-- ============================================================
-- 3. INSTALL CORRECT PAYMENT BASIS CHECK
-- ============================================================

alter table public.sales_order
add constraint
sales_order_payment_basis_check
check (
  payment_basis is null
  or payment_basis in (
    'credit',
    'immediate',
    'prepaid'
  )
);


comment on column
public.sales_order.payment_basis
is
'Commercial payment basis: credit, immediate or prepaid. This is separate from the actual payment method such as cash, EFT or card.';


-- ============================================================
-- 4. REPLACE PAYMENT BASIS SETTER
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
