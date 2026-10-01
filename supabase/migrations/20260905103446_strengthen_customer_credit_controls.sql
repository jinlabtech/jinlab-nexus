-- ============================================================
-- JINLAB Nexus
-- Sprint 19.3M1
-- Stronger customer credit controls
-- ============================================================

alter table public.sales_credit_hold_override
  add column if not exists override_scope text,
  add column if not exists approved_total_amount numeric(14,2),
  add column if not exists approved_exposure numeric(14,2),
  add column if not exists approved_credit_limit numeric(14,2),
  add column if not exists approved_order_signature text;

alter table public.sales_credit_hold_override
  drop constraint if exists sales_credit_hold_override_scope_check;

alter table public.sales_credit_hold_override
  add constraint sales_credit_hold_override_scope_check
  check (
    override_scope is null
    or override_scope in ('credit_hold','credit_limit','both')
  );

comment on column public.customer.credit_limit is
  'Customer credit limit. A value of 0 means no limit has been configured; positive values are actively enforced.';


-- ============================================================
-- Stable financial/control signature for a Sales Order.
-- Status is deliberately excluded because confirmation itself
-- changes status. Financial/control fields and items are signed.
-- ============================================================

create or replace function public.sales_order_control_signature(
  p_sales_order_id uuid
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select md5(
    concat_ws('|',
      so.company_id::text,
      so.branch_id::text,
      so.customer_id::text,
      coalesce(so.payment_basis,''),
      round(coalesce(so.total_amount,0),2)::text,
      coalesce(
        (
          select string_agg(
            concat_ws('~',
              soi.id::text,
              coalesce(soi.inventory_item_id::text,''),
              coalesce(soi.description,''),
              round(coalesce(soi.quantity,0)::numeric,4)::text,
              round(coalesce(soi.unit_price,0)::numeric,2)::text,
              coalesce(soi.discount_mode,''),
              round(coalesce(soi.discount_value,0)::numeric,2)::text,
              coalesce(soi.tax_mode,''),
              round(coalesce(soi.tax_rate,0)::numeric,2)::text,
              round(coalesce(soi.line_total,0)::numeric,2)::text
            ),
            '||' order by soi.id
          )
          from public.sales_order_item soi
          where soi.sales_order_id = so.id
        ),
        ''
      )
    )
  )
  from public.sales_order so
  where so.id = p_sales_order_id;
$$;

revoke all
on function public.sales_order_control_signature(uuid)
from public, authenticated;


-- ============================================================
-- Authoritative customer credit exposure.
--
-- Exposure = outstanding issued invoices
--          + open confirmed/delivered/invoiced credit orders
--            that have not yet become an active invoice.
--
-- Draft invoices do not replace the Sales Order commitment.
-- ============================================================

create or replace function public.calculate_customer_credit_exposure(
  p_company_id uuid,
  p_customer_id uuid,
  p_exclude_sales_order_id uuid default null,
  p_exclude_invoice_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_credit_limit numeric(14,2) := 0;
  v_receivables numeric(14,2) := 0;
  v_commitments numeric(14,2) := 0;
begin
  select coalesce(c.credit_limit,0)
  into v_credit_limit
  from public.customer c
  where c.id = p_customer_id
    and c.company_id = p_company_id;

  if not found then
    raise exception 'Customer could not be found.';
  end if;

  select round(
    coalesce(sum(
      greatest(
        i.total_amount - coalesce(payments.paid,0),
        0
      )
    ),0),
    2
  )
  into v_receivables
  from public.invoice i
  left join lateral (
    select sum(ip.amount) as paid
    from public.invoice_payment ip
    where ip.company_id = i.company_id
      and ip.invoice_id = i.id
  ) payments on true
  where i.company_id = p_company_id
    and i.customer_id = p_customer_id
    and i.status not in ('draft','cancelled')
    and i.id is distinct from p_exclude_invoice_id;

  select round(
    coalesce(sum(
      greatest(
        so.total_amount - coalesce(order_payments.paid,0),
        0
      )
    ),0),
    2
  )
  into v_commitments
  from public.sales_order so
  left join lateral (
    select sum(sop.amount) as paid
    from public.sales_order_payment sop
    where sop.company_id = so.company_id
      and sop.sales_order_id = so.id
  ) order_payments on true
  where so.company_id = p_company_id
    and so.customer_id = p_customer_id
    and so.payment_basis = 'credit'
    and so.status in ('confirmed','delivered','invoiced')
    and so.id is distinct from p_exclude_sales_order_id
    and not exists (
      select 1
      from public.invoice active_invoice
      where active_invoice.company_id = so.company_id
        and active_invoice.sales_order_id = so.id
        and active_invoice.status not in ('draft','cancelled')
        and active_invoice.id is distinct from p_exclude_invoice_id
    );

  return jsonb_build_object(
    'receivables', v_receivables,
    'open_credit_orders', v_commitments,
    'total_exposure', round(v_receivables + v_commitments,2),
    'credit_limit', round(v_credit_limit,2),
    'limit_configured', v_credit_limit > 0
  );
end;
$$;

revoke all
on function public.calculate_customer_credit_exposure(uuid,uuid,uuid,uuid)
from public, authenticated;


-- ============================================================
-- Broaden existing override workflow to cover either a credit
-- hold, a credit-limit breach, or both. The old RPC name is kept
-- so the existing frontend remains compatible.
-- ============================================================

create or replace function public.approve_sales_credit_hold_override(
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
  v_credit_limit numeric(14,2) := 0;
  v_credit_hold boolean := false;
  v_collection_status text;
  v_exposure jsonb;
  v_current_exposure numeric(14,2) := 0;
  v_projected_exposure numeric(14,2) := 0;
  v_limit_exceeded boolean := false;
  v_scope text;
  v_signature text;
  v_override_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission(
    'sales.credit_hold.override'
  ) then
    raise exception 'Permission denied: sales.credit_hold.override';
  end if;

  if nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'A reason is required for a credit override.';
  end if;

  v_company_id := public.current_company_id();

  select *
  into v_order
  from public.sales_order
  where id = p_sales_order_id
    and company_id = v_company_id
  for update;

  if not found then
    raise exception 'Sales order could not be found.';
  end if;

  if v_order.status not in ('draft','confirmed','delivered','invoiced') then
    raise exception 'This sales order cannot receive a credit override in its current status.';
  end if;

  if v_order.payment_basis <> 'credit' then
    raise exception 'A credit override is only valid for a credit sales order.';
  end if;

  if exists (
    select 1
    from public.invoice i
    where i.company_id = v_company_id
      and i.sales_order_id = v_order.id
      and i.status not in ('draft','cancelled')
  ) then
    raise exception 'The source invoice is already active. Credit approval must happen before the invoice is issued.';
  end if;

  select c.customer_name, coalesce(c.credit_limit,0)
  into v_customer_name, v_credit_limit
  from public.customer c
  where c.id = v_order.customer_id
    and c.company_id = v_company_id;

  select
    coalesce(d.credit_hold,false),
    d.collection_status
  into
    v_credit_hold,
    v_collection_status
  from public.debtor_collection_control d
  where d.company_id = v_company_id
    and d.customer_id = v_order.customer_id;

  v_credit_hold := coalesce(v_credit_hold,false)
    or coalesce(v_collection_status = 'credit_hold',false);

  v_exposure := public.calculate_customer_credit_exposure(
    v_company_id,
    v_order.customer_id,
    v_order.id,
    null
  );

  v_current_exposure := coalesce((v_exposure->>'total_exposure')::numeric,0);
  v_projected_exposure := round(v_current_exposure + v_order.total_amount,2);
  v_limit_exceeded := v_credit_limit > 0
    and v_projected_exposure > v_credit_limit + 0.009;

  if not v_credit_hold and not v_limit_exceeded then
    raise exception 'This order does not currently require a credit override.';
  end if;

  v_scope := case
    when v_credit_hold and v_limit_exceeded then 'both'
    when v_credit_hold then 'credit_hold'
    else 'credit_limit'
  end;

  v_signature := public.sales_order_control_signature(v_order.id);

  insert into public.sales_credit_hold_override (
    company_id,
    customer_id,
    sales_order_id,
    override_reason,
    approved_by,
    override_scope,
    approved_total_amount,
    approved_exposure,
    approved_credit_limit,
    approved_order_signature
  )
  values (
    v_company_id,
    v_order.customer_id,
    v_order.id,
    trim(p_reason),
    auth.uid(),
    v_scope,
    round(v_order.total_amount,2),
    v_projected_exposure,
    round(v_credit_limit,2),
    v_signature
  )
  on conflict (company_id, sales_order_id)
  do update set
    customer_id = excluded.customer_id,
    override_reason = excluded.override_reason,
    approved_by = auth.uid(),
    approved_at = now(),
    used_at = null,
    override_scope = excluded.override_scope,
    approved_total_amount = excluded.approved_total_amount,
    approved_exposure = excluded.approved_exposure,
    approved_credit_limit = excluded.approved_credit_limit,
    approved_order_signature = excluded.approved_order_signature
  returning id into v_override_id;

  return jsonb_build_object(
    'ok', true,
    'override_id', v_override_id,
    'sales_order_id', v_order.id,
    'customer_id', v_order.customer_id,
    'customer_name', v_customer_name,
    'reason', trim(p_reason),
    'scope', v_scope,
    'credit_limit', round(v_credit_limit,2),
    'current_exposure', v_current_exposure,
    'projected_exposure', v_projected_exposure,
    'order_total', round(v_order.total_amount,2)
  );
end;
$$;


-- ============================================================
-- Sales Order credit-control read model.
-- ============================================================

create or replace function public.get_sales_order_credit_control(
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
  v_credit_limit numeric(14,2) := 0;
  v_collection_status text := 'normal';
  v_credit_hold boolean := false;
  v_credit_hold_reason text;
  v_exposure jsonb;
  v_current_exposure numeric(14,2) := 0;
  v_projected_exposure numeric(14,2) := 0;
  v_increment numeric(14,2) := 0;
  v_limit_exceeded boolean := false;
  v_active_invoice_exists boolean := false;
  v_signature text;
  v_override_row public.sales_credit_hold_override%rowtype;
  v_override_valid boolean := false;
  v_override jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  v_company_id := public.current_company_id();

  select *
  into v_order
  from public.sales_order
  where id = p_sales_order_id
    and company_id = v_company_id;

  if not found then
    raise exception 'Sales order could not be found.';
  end if;

  select c.customer_name, coalesce(c.credit_limit,0)
  into v_customer_name, v_credit_limit
  from public.customer c
  where c.id = v_order.customer_id
    and c.company_id = v_company_id;

  select
    coalesce(d.collection_status,'normal'),
    coalesce(d.credit_hold,false),
    d.credit_hold_reason
  into
    v_collection_status,
    v_credit_hold,
    v_credit_hold_reason
  from public.debtor_collection_control d
  where d.company_id = v_company_id
    and d.customer_id = v_order.customer_id;

  v_collection_status := coalesce(v_collection_status,'normal');
  v_credit_hold := coalesce(v_credit_hold,false)
    or v_collection_status = 'credit_hold';

  select exists (
    select 1
    from public.invoice i
    where i.company_id = v_company_id
      and i.sales_order_id = v_order.id
      and i.status not in ('draft','cancelled')
  )
  into v_active_invoice_exists;

  v_exposure := public.calculate_customer_credit_exposure(
    v_company_id,
    v_order.customer_id,
    v_order.id,
    null
  );

  v_current_exposure := coalesce((v_exposure->>'total_exposure')::numeric,0);

  v_increment := case
    when v_order.payment_basis = 'credit'
         and not v_active_invoice_exists
    then round(v_order.total_amount,2)
    else 0
  end;

  v_projected_exposure := round(v_current_exposure + v_increment,2);
  v_limit_exceeded := v_order.payment_basis = 'credit'
    and v_credit_limit > 0
    and v_projected_exposure > v_credit_limit + 0.009;

  v_signature := public.sales_order_control_signature(v_order.id);

  select *
  into v_override_row
  from public.sales_credit_hold_override o
  where o.company_id = v_company_id
    and o.sales_order_id = v_order.id;

  if found then
    v_override_valid :=
      v_override_row.approved_order_signature is not null
      and v_override_row.approved_order_signature = v_signature
      and round(coalesce(v_override_row.approved_total_amount,-1),2)
          = round(v_order.total_amount,2)
      and v_projected_exposure
          <= coalesce(v_override_row.approved_exposure,-1) + 0.009
      and (
        not v_credit_hold
        or v_override_row.override_scope in ('credit_hold','both')
      )
      and (
        not v_limit_exceeded
        or (
          v_override_row.override_scope in ('credit_limit','both')
          and v_credit_limit + 0.009
              >= coalesce(v_override_row.approved_credit_limit,v_credit_limit)
        )
      );

    v_override := jsonb_build_object(
      'id', v_override_row.id,
      'reason', v_override_row.override_reason,
      'approved_by', v_override_row.approved_by,
      'approved_at', v_override_row.approved_at,
      'used_at', v_override_row.used_at,
      'scope', v_override_row.override_scope,
      'approved_total_amount', v_override_row.approved_total_amount,
      'approved_exposure', v_override_row.approved_exposure,
      'approved_credit_limit', v_override_row.approved_credit_limit,
      'signature_valid',
        v_override_row.approved_order_signature is not null
        and v_override_row.approved_order_signature = v_signature,
      'valid', v_override_valid
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'sales_order_id', v_order.id,
    'customer_id', v_order.customer_id,
    'customer_name', v_customer_name,
    'sales_order_status', v_order.status,
    'payment_basis', v_order.payment_basis,
    'collection_status', v_collection_status,
    'credit_hold', v_credit_hold,
    'credit_hold_reason', v_credit_hold_reason,
    'credit_limit', round(v_credit_limit,2),
    'limit_configured', v_credit_limit > 0,
    'receivables', coalesce((v_exposure->>'receivables')::numeric,0),
    'open_credit_orders', coalesce((v_exposure->>'open_credit_orders')::numeric,0),
    'current_exposure', v_current_exposure,
    'current_order_amount', v_increment,
    'projected_exposure', v_projected_exposure,
    'available_credit_before_order',
      case when v_credit_limit > 0
        then greatest(v_credit_limit - v_current_exposure,0)
        else null end,
    'available_credit_after_order',
      case when v_credit_limit > 0
        then greatest(v_credit_limit - v_projected_exposure,0)
        else null end,
    'credit_limit_exceeded', v_limit_exceeded,
    'credit_control_blocked',
      v_order.payment_basis = 'credit'
      and (v_credit_hold or v_limit_exceeded)
      and not v_override_valid,
    'override', v_override
  );
end;
$$;


-- ============================================================
-- Enforce credit hold + limit + immutable override snapshot when
-- a credit Sales Order becomes an authorised commitment.
-- ============================================================

create or replace function public.enforce_sales_order_credit_control()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credit_limit numeric(14,2) := 0;
  v_credit_hold boolean := false;
  v_collection_status text;
  v_exposure jsonb;
  v_current_exposure numeric(14,2) := 0;
  v_projected_exposure numeric(14,2) := 0;
  v_limit_exceeded boolean := false;
  v_signature text;
  v_override public.sales_credit_hold_override%rowtype;
  v_valid boolean := false;
begin
  if TG_OP = 'UPDATE'
     and old.status <> 'draft'
     and new.payment_basis is distinct from old.payment_basis then
    raise exception 'Payment basis cannot be changed after the sales order leaves draft status.';
  end if;

  if new.status in ('confirmed','delivered','invoiced')
     and (TG_OP = 'INSERT' or old.status = 'draft') then

    if new.payment_basis is null then
      raise exception 'Select a payment basis before confirming this sales order.';
    end if;

    if new.payment_basis = 'credit' then
      select coalesce(c.credit_limit,0)
      into v_credit_limit
      from public.customer c
      where c.id = new.customer_id
        and c.company_id = new.company_id;

      select
        coalesce(d.credit_hold,false),
        d.collection_status
      into
        v_credit_hold,
        v_collection_status
      from public.debtor_collection_control d
      where d.company_id = new.company_id
        and d.customer_id = new.customer_id;

      v_credit_hold := coalesce(v_credit_hold,false)
        or coalesce(v_collection_status = 'credit_hold',false);

      v_exposure := public.calculate_customer_credit_exposure(
        new.company_id,
        new.customer_id,
        new.id,
        null
      );

      v_current_exposure := coalesce((v_exposure->>'total_exposure')::numeric,0);
      v_projected_exposure := round(v_current_exposure + new.total_amount,2);
      v_limit_exceeded := v_credit_limit > 0
        and v_projected_exposure > v_credit_limit + 0.009;

      if v_credit_hold or v_limit_exceeded then
        select *
        into v_override
        from public.sales_credit_hold_override o
        where o.company_id = new.company_id
          and o.customer_id = new.customer_id
          and o.sales_order_id = new.id;

        if found then
          v_signature := public.sales_order_control_signature(new.id);

          v_valid :=
            v_override.approved_order_signature is not null
            and v_override.approved_order_signature = v_signature
            and round(coalesce(v_override.approved_total_amount,-1),2)
                = round(new.total_amount,2)
            and v_projected_exposure
                <= coalesce(v_override.approved_exposure,-1) + 0.009
            and (
              not v_credit_hold
              or v_override.override_scope in ('credit_hold','both')
            )
            and (
              not v_limit_exceeded
              or (
                v_override.override_scope in ('credit_limit','both')
                and v_credit_limit + 0.009
                    >= coalesce(v_override.approved_credit_limit,v_credit_limit)
              )
            );
        end if;

        if not v_valid then
          if v_credit_hold and v_limit_exceeded then
            raise exception
              'CREDIT CONTROL: Customer is on credit hold and this order would exceed the credit limit. Owner/admin reapproval is required.';
          elsif v_credit_hold then
            raise exception
              'CREDIT HOLD: This customer cannot receive additional credit. Owner/admin approval is required.';
          else
            raise exception
              'CREDIT LIMIT: Projected exposure R% exceeds the customer limit of R%. Owner/admin approval is required.',
              to_char(v_projected_exposure,'FM999999999990.00'),
              to_char(v_credit_limit,'FM999999999990.00');
          end if;
        end if;

        update public.sales_credit_hold_override
        set used_at = coalesce(used_at,now())
        where id = v_override.id;
      end if;
    end if;
  end if;

  return new;
end;
$$;


-- ============================================================
-- Invoice issue guard.
-- Direct invoices are treated as credit commitments because no
-- commercial payment basis exists to prove Pay Now/Prepaid.
-- Linked Pay Now/Prepaid invoices are not blocked by credit limit.
-- ============================================================

create or replace function public.enforce_invoice_credit_control()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.sales_order%rowtype;
  v_basis text := 'credit';
  v_credit_limit numeric(14,2) := 0;
  v_credit_hold boolean := false;
  v_collection_status text;
  v_exposure jsonb;
  v_current_exposure numeric(14,2) := 0;
  v_projected_exposure numeric(14,2) := 0;
  v_limit_exceeded boolean := false;
  v_signature text;
  v_override public.sales_credit_hold_override%rowtype;
  v_valid boolean := false;
begin
  if new.status <> 'issued'
     or old.status is not distinct from new.status then
    return new;
  end if;

  if new.sales_order_id is not null then
    select *
    into v_order
    from public.sales_order so
    where so.id = new.sales_order_id
      and so.company_id = new.company_id;

    if not found then
      raise exception 'Source Sales Order could not be found.';
    end if;

    v_basis := v_order.payment_basis;

    if v_basis <> 'credit' then
      return new;
    end if;

    if new.total_amount > v_order.total_amount + 0.009 then
      raise exception
        'CREDIT CONTROL: Invoice total exceeds the authorised Sales Order total. Amend and reapprove the Sales Order before issuing the invoice.';
    end if;
  end if;

  select coalesce(c.credit_limit,0)
  into v_credit_limit
  from public.customer c
  where c.id = new.customer_id
    and c.company_id = new.company_id;

  select
    coalesce(d.credit_hold,false),
    d.collection_status
  into
    v_credit_hold,
    v_collection_status
  from public.debtor_collection_control d
  where d.company_id = new.company_id
    and d.customer_id = new.customer_id;

  v_credit_hold := coalesce(v_credit_hold,false)
    or coalesce(v_collection_status = 'credit_hold',false);

  v_exposure := public.calculate_customer_credit_exposure(
    new.company_id,
    new.customer_id,
    new.sales_order_id,
    new.id
  );

  v_current_exposure := coalesce((v_exposure->>'total_exposure')::numeric,0);
  v_projected_exposure := round(v_current_exposure + new.total_amount,2);
  v_limit_exceeded := v_credit_limit > 0
    and v_projected_exposure > v_credit_limit + 0.009;

  if not v_credit_hold and not v_limit_exceeded then
    return new;
  end if;

  if new.sales_order_id is null then
    raise exception
      'DIRECT CREDIT INVOICE BLOCKED: This customer requires credit approval. Create/confirm a Sales Order so the owner/admin override is explicit and audited.';
  end if;

  select *
  into v_override
  from public.sales_credit_hold_override o
  where o.company_id = new.company_id
    and o.customer_id = new.customer_id
    and o.sales_order_id = new.sales_order_id;

  if found then
    v_signature := public.sales_order_control_signature(new.sales_order_id);

    v_valid :=
      v_override.approved_order_signature is not null
      and v_override.approved_order_signature = v_signature
      and new.total_amount <= coalesce(v_override.approved_total_amount,-1) + 0.009
      and v_projected_exposure
          <= coalesce(v_override.approved_exposure,-1) + 0.009
      and (
        not v_credit_hold
        or v_override.override_scope in ('credit_hold','both')
      )
      and (
        not v_limit_exceeded
        or (
          v_override.override_scope in ('credit_limit','both')
          and v_credit_limit + 0.009
              >= coalesce(v_override.approved_credit_limit,v_credit_limit)
        )
      );
  end if;

  if not v_valid then
    raise exception
      'CREDIT CONTROL: Customer credit conditions changed or the prior approval is no longer valid. Owner/admin reapproval is required before issuing this invoice.';
  end if;

  return new;
end;
$$;


drop trigger if exists enforce_invoice_credit_control_trigger
on public.invoice;

create trigger enforce_invoice_credit_control_trigger
before update of status
on public.invoice
for each row
execute function public.enforce_invoice_credit_control();


-- ============================================================
-- END
-- ============================================================
;
