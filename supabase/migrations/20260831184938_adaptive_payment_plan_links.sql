-- ============================================================
-- JINLAB Nexus
-- Adaptive Payment Plan Links
-- ============================================================

create or replace function public.get_public_payment_link(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.invoice_payment_link%rowtype;
  v_invoice public.invoice%rowtype;
  v_plan public.invoice_payment_plan%rowtype;
  v_installment public.invoice_payment_plan_installment%rowtype;

  v_customer_name text;
  v_company_name text;
  v_branch_name text;

  v_effective_amount numeric(14,2);
  v_effective_link_type text;
begin

  select *
  into v_link
  from public.invoice_payment_link
  where token = p_token;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select *
  into v_invoice
  from public.invoice
  where id = v_link.invoice_id
    and company_id = v_link.company_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invoice_not_found');
  end if;

  if coalesce(v_invoice.balance_due, 0) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invoice_paid');
  end if;

  if v_invoice.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'invoice_cancelled');
  end if;

  if v_link.expires_at is not null and v_link.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  if v_link.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'cancelled');
  end if;

  -- Only next_installment links dynamically follow the plan.
  if v_link.link_type = 'next_installment' then

    if v_link.payment_plan_id is null then
      return jsonb_build_object('ok', false, 'reason', 'payment_plan_required');
    end if;

    select *
    into v_plan
    from public.invoice_payment_plan
    where id = v_link.payment_plan_id
      and invoice_id = v_invoice.id;

    if not found or v_plan.status not in ('draft', 'active') then
      return jsonb_build_object('ok', false, 'reason', 'payment_plan_unavailable');
    end if;

    select *
    into v_installment
    from public.invoice_payment_plan_installment
    where payment_plan_id = v_plan.id
      and status in ('pending', 'partially_paid', 'overdue')
      and amount_paid < amount_due
    order by due_date asc, installment_number asc
    limit 1;

    if not found then
      return jsonb_build_object('ok', false, 'reason', 'no_outstanding_installment');
    end if;

    v_effective_amount := least(
      greatest(v_installment.amount_due - v_installment.amount_paid, 0),
      v_invoice.balance_due
    );

    v_effective_link_type := 'next_installment';

    -- A reusable instalment link may have been marked paid by an older function.
    if v_link.status = 'paid' then
      update public.invoice_payment_link
      set status = 'active',
          updated_at = now()
      where id = v_link.id;

      v_link.status := 'active';
    end if;

  else

    -- All other link types obey their own meaning, even when attached to a plan.
    if v_link.status <> 'active' then
      return jsonb_build_object('ok', false, 'reason', v_link.status);
    end if;

    v_effective_link_type := v_link.link_type;

    if v_link.link_type = 'full_balance' then
      v_effective_amount := v_invoice.balance_due;

    elsif v_link.link_type = 'fixed_amount' then
      v_effective_amount := least(
        coalesce(v_link.amount, v_invoice.balance_due),
        v_invoice.balance_due
      );

    elsif v_link.link_type = 'customer_entered' then
      v_effective_amount := null;

    else
      return jsonb_build_object('ok', false, 'reason', 'unsupported_link_type');
    end if;

  end if;

  select customer_name
  into v_customer_name
  from public.customer
  where id = v_invoice.customer_id;

  select company_name
  into v_company_name
  from public.company
  where id = v_invoice.company_id;

  select branch_name
  into v_branch_name
  from public.branch
  where id = v_invoice.branch_id;

  return jsonb_build_object(
    'ok', true,
    'payment_link', jsonb_build_object(
      'id', v_link.id,
      'link_type', v_effective_link_type,
      'amount', v_effective_amount,
      'minimum_amount', v_link.minimum_amount,
      'maximum_amount', least(
        coalesce(v_link.maximum_amount, v_invoice.balance_due),
        v_invoice.balance_due
      ),
      'currency', coalesce(v_link.currency, 'ZAR'),
      'expires_at', v_link.expires_at,
      'payment_plan_id', v_link.payment_plan_id,
      'installment_id', case
        when v_link.link_type = 'next_installment' then v_installment.id
        else v_link.installment_id
      end,
      'installment_number', case
        when v_link.link_type = 'next_installment' then v_installment.installment_number
        else null
      end,
      'installment_due_date', case
        when v_link.link_type = 'next_installment' then v_installment.due_date
        else null
      end
    ),
    'invoice', jsonb_build_object(
      'invoice_number', v_invoice.invoice_number,
      'invoice_date', v_invoice.invoice_date,
      'due_date', v_invoice.due_date,
      'total_amount', v_invoice.total_amount,
      'amount_paid', v_invoice.amount_paid,
      'balance_due', v_invoice.balance_due,
      'status', v_invoice.status
    ),
    'company', jsonb_build_object(
      'name', v_company_name,
      'branch_name', v_branch_name
    ),
    'customer', jsonb_build_object(
      'name', v_customer_name
    )
  );

end;
$$;

revoke all on function public.get_public_payment_link(text) from public;
grant execute on function public.get_public_payment_link(text) to anon, authenticated;

-- ============================================================
-- Adaptive gateway transaction initiation
-- ============================================================

create or replace function public.create_public_gateway_transaction(
  p_token text,
  p_provider text,
  p_payment_method text,
  p_amount numeric,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.invoice_payment_link%rowtype;
  v_invoice public.invoice%rowtype;
  v_plan public.invoice_payment_plan%rowtype;
  v_installment public.invoice_payment_plan_installment%rowtype;
  v_transaction public.payment_gateway_transaction%rowtype;

  v_expected_amount numeric(14,2);
  v_effective_installment_id uuid;
begin

  if p_token is null or trim(p_token) = '' then
    raise exception 'Payment token is required.';
  end if;

  if p_provider is null or trim(p_provider) = '' then
    raise exception 'Payment provider is required.';
  end if;

  if p_payment_method is null or trim(p_payment_method) = '' then
    raise exception 'Payment method is required.';
  end if;

  if p_idempotency_key is null or trim(p_idempotency_key) = '' then
    raise exception 'Idempotency key is required.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  select *
  into v_link
  from public.invoice_payment_link
  where token = p_token
  for update;

  if not found then
    raise exception 'Payment link not found.';
  end if;

  select *
  into v_invoice
  from public.invoice
  where id = v_link.invoice_id
    and company_id = v_link.company_id
  for update;

  if not found then
    raise exception 'Invoice not found.';
  end if;

  if v_invoice.status = 'cancelled' then
    raise exception 'Invoice is cancelled.';
  end if;

  if coalesce(v_invoice.balance_due, 0) <= 0 then
    raise exception 'Invoice is already fully paid.';
  end if;

  if v_link.expires_at is not null and v_link.expires_at <= now() then
    raise exception 'Payment link has expired.';
  end if;

  if v_link.status = 'cancelled' then
    raise exception 'Payment link is cancelled.';
  end if;

  -- ----------------------------------------------------------
  -- Resolve amount by link type
  -- ----------------------------------------------------------

  if v_link.link_type = 'next_installment' then

    if v_link.payment_plan_id is null then
      raise exception 'Payment plan is required for next instalment links.';
    end if;

    select *
    into v_plan
    from public.invoice_payment_plan
    where id = v_link.payment_plan_id
      and invoice_id = v_invoice.id
    for update;

    if not found or v_plan.status not in ('draft', 'active') then
      raise exception 'Payment plan is not available.';
    end if;

    select *
    into v_installment
    from public.invoice_payment_plan_installment
    where payment_plan_id = v_plan.id
      and status in ('pending', 'partially_paid', 'overdue')
      and amount_paid < amount_due
    order by due_date asc, installment_number asc
    limit 1
    for update;

    if not found then
      raise exception 'There is no outstanding instalment.';
    end if;

    v_expected_amount := least(
      v_installment.amount_due - v_installment.amount_paid,
      v_invoice.balance_due
    );

    v_effective_installment_id := v_installment.id;

  elsif v_link.link_type = 'full_balance' then

    if v_link.status <> 'active' then
      raise exception 'Payment link is not active.';
    end if;

    v_expected_amount := v_invoice.balance_due;

  elsif v_link.link_type = 'fixed_amount' then

    if v_link.status <> 'active' then
      raise exception 'Payment link is not active.';
    end if;

    v_expected_amount := least(
      coalesce(v_link.amount, v_invoice.balance_due),
      v_invoice.balance_due
    );

  elsif v_link.link_type = 'customer_entered' then

    if v_link.status <> 'active' then
      raise exception 'Payment link is not active.';
    end if;

    if v_link.minimum_amount is not null
       and p_amount < v_link.minimum_amount then
      raise exception 'Payment amount is below the minimum allowed.';
    end if;

    if v_link.maximum_amount is not null
       and p_amount > v_link.maximum_amount then
      raise exception 'Payment amount exceeds the maximum allowed.';
    end if;

    if p_amount > v_invoice.balance_due then
      raise exception 'Payment amount exceeds the invoice balance.';
    end if;

    v_expected_amount := p_amount;

  else
    raise exception 'Unsupported payment link type.';
  end if;

  if round(p_amount, 2) <> round(v_expected_amount, 2) then
    raise exception 'Payment amount does not match the current amount due.';
  end if;

  -- ----------------------------------------------------------
  -- Idempotency
  -- ----------------------------------------------------------

  select *
  into v_transaction
  from public.payment_gateway_transaction
  where idempotency_key = p_idempotency_key
  limit 1;

  if found then

    if v_transaction.payment_link_id <> v_link.id then
      raise exception 'Idempotency key is already in use.';
    end if;

    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'transaction', jsonb_build_object(
        'id', v_transaction.id,
        'status', v_transaction.status,
        'provider', v_transaction.provider,
        'payment_method', v_transaction.payment_method,
        'amount', v_transaction.amount,
        'currency', v_transaction.currency,
        'created_at', v_transaction.created_at
      )
    );

  end if;

  insert into public.payment_gateway_transaction (
    company_id,
    branch_id,
    invoice_id,
    customer_id,
    payment_link_id,
    payment_plan_id,
    installment_id,
    provider,
    payment_method,
    amount,
    currency,
    status,
    idempotency_key
  )
  values (
    v_link.company_id,
    v_link.branch_id,
    v_link.invoice_id,
    v_link.customer_id,
    v_link.id,
    v_link.payment_plan_id,
    case
      when v_link.link_type = 'next_installment'
        then v_effective_installment_id
      else null
    end,
    lower(trim(p_provider)),
    lower(trim(p_payment_method)),
    round(v_expected_amount, 2),
    coalesce(v_link.currency, 'ZAR'),
    'pending',
    trim(p_idempotency_key)
  )
  returning *
  into v_transaction;

  -- A next-instalment link is reusable.
  -- It will dynamically point to the next outstanding instalment.
  if v_link.link_type = 'next_installment' then
    update public.invoice_payment_link
    set status = 'active',
        updated_at = now()
    where id = v_link.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'transaction', jsonb_build_object(
      'id', v_transaction.id,
      'status', v_transaction.status,
      'provider', v_transaction.provider,
      'payment_method', v_transaction.payment_method,
      'amount', v_transaction.amount,
      'currency', v_transaction.currency,
      'created_at', v_transaction.created_at
    )
  );

end;
$$;

revoke all on function public.create_public_gateway_transaction(
  text, text, text, numeric, text
) from public;

grant execute on function public.create_public_gateway_transaction(
  text, text, text, numeric, text
) to anon, authenticated;



-- ============================================================
-- Adaptive verified gateway payment posting
-- ============================================================

create or replace function public.post_verified_gateway_payment(
  p_transaction_id uuid,
  p_provider_transaction_id text,
  p_provider_reference text default null,
  p_paid_at timestamptz default now(),
  p_gateway_fee numeric default 0,
  p_provider_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.payment_gateway_transaction%rowtype;
  v_invoice public.invoice%rowtype;

  v_payment_id uuid;
  v_payment_method text;
  v_payment_date date;

  v_existing_payment_id uuid;
  v_remaining_balance numeric(14,2);
begin

  -- ----------------------------------------------------------
  -- Validate provider confirmation
  -- ----------------------------------------------------------

  if p_transaction_id is null then
    raise exception
      'Gateway transaction ID is required.';
  end if;

  if p_provider_transaction_id is null
     or trim(p_provider_transaction_id) = '' then
    raise exception
      'Provider transaction ID is required.';
  end if;

  if p_gateway_fee is null
     or p_gateway_fee < 0 then
    raise exception
      'Gateway fee cannot be negative.';
  end if;


  -- ----------------------------------------------------------
  -- Lock the gateway transaction
  -- ----------------------------------------------------------

  select *
  into v_transaction
  from public.payment_gateway_transaction
  where id = p_transaction_id
  for update;

  if not found then
    raise exception
      'Gateway transaction could not be found.';
  end if;


  -- ----------------------------------------------------------
  -- Idempotency
  --
  -- If this transaction has already created an invoice payment,
  -- return the existing payment instead of inserting twice.
  -- ----------------------------------------------------------

  select id
  into v_existing_payment_id
  from public.invoice_payment
  where gateway_transaction_id =
    v_transaction.id
  limit 1;

  if found then

    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'payment_id',
        v_existing_payment_id,
      'transaction_id',
        v_transaction.id,
      'invoice_id',
        v_transaction.invoice_id
    );

  end if;


  -- ----------------------------------------------------------
  -- Validate transaction state
  -- ----------------------------------------------------------

  if v_transaction.status = 'paid' then

    raise exception
      'Gateway transaction is marked paid but has no linked payment record. Manual review required.';

  end if;

  if v_transaction.status in (
    'failed',
    'expired',
    'cancelled',
    'refunded'
  ) then

    raise exception
      'Gateway transaction cannot be posted from status %.',
      v_transaction.status;

  end if;


  if v_transaction.amount is null
     or v_transaction.amount <= 0 then
    raise exception
      'Gateway transaction amount is invalid.';
  end if;


  -- ----------------------------------------------------------
  -- Lock invoice
  -- ----------------------------------------------------------

  select *
  into v_invoice
  from public.invoice
  where id = v_transaction.invoice_id
    and company_id =
      v_transaction.company_id
  for update;

  if not found then
    raise exception
      'Invoice could not be found.';
  end if;

  if v_invoice.status = 'cancelled' then
    raise exception
      'Cancelled invoices cannot receive gateway payments.';
  end if;

  if coalesce(v_invoice.balance_due, 0) <= 0 then
    raise exception
      'Invoice is already fully paid.';
  end if;

  if v_transaction.amount >
     v_invoice.balance_due then
    raise exception
      'Verified payment exceeds the current invoice balance.';
  end if;

  -- ----------------------------------------------------------
  -- Translate gateway payment method into invoice method
  -- ----------------------------------------------------------

  v_payment_method :=
    case

      when lower(
        coalesce(
          v_transaction.payment_method,
          ''
        )
      ) = 'card'
        then 'card'

      when lower(
        coalesce(
          v_transaction.payment_method,
          ''
        )
      ) in (
        'capitec_pay',
        'pay_by_bank',
        'instant_eft',
        'eft',
        'bank'
      )
        then 'eft'

      else 'other'

    end;


  v_payment_date :=
    coalesce(
      p_paid_at,
      now()
    )::date;


  -- ----------------------------------------------------------
  -- Mark gateway transaction as verified
  -- ----------------------------------------------------------

  update public.payment_gateway_transaction
  set
    provider_transaction_id =
      trim(p_provider_transaction_id),

    provider_reference =
      nullif(
        trim(
          coalesce(
            p_provider_reference,
            ''
          )
        ),
        ''
      ),

    status = 'paid',

    gateway_fee =
      coalesce(
        p_gateway_fee,
        0
      ),

    provider_payload =
      coalesce(
        p_provider_payload,
        '{}'::jsonb
      ),

    paid_at =
      coalesce(
        p_paid_at,
        now()
      ),

    verified_at =
      now(),

    updated_at =
      now()

  where id =
    v_transaction.id;


  -- ----------------------------------------------------------
  -- Create authoritative invoice payment
  --
  -- Existing invoice payment triggers will:
  --   1. refresh invoice totals/status
  --   2. rebuild payment-plan allocation
  -- ----------------------------------------------------------

  insert into public.invoice_payment (
    company_id,
    branch_id,
    invoice_id,
    customer_id,

    payment_date,
    payment_method,
    reference,
    amount,
    notes,

    received_by,

    payment_plan_id,
    installment_id,
    payment_source,

    gateway_transaction_id,
    gateway_provider
  )
  values (
    v_transaction.company_id,
    v_transaction.branch_id,
    v_transaction.invoice_id,
    v_transaction.customer_id,

    v_payment_date,
    v_payment_method,

    coalesce(
      nullif(
        trim(
          coalesce(
            p_provider_reference,
            ''
          )
        ),
        ''
      ),
      p_provider_transaction_id
    ),

    v_transaction.amount,

    'Verified online payment via ' ||
      coalesce(
        v_transaction.provider,
        'gateway'
      ),

    null,

    v_transaction.payment_plan_id,
    v_transaction.installment_id,
    'gateway',

    v_transaction.id,
    v_transaction.provider
  )
  returning id
  into v_payment_id;


  -- ----------------------------------------------------------
  -- Read refreshed balance after invoice payment triggers
  -- ----------------------------------------------------------

  select balance_due
  into v_remaining_balance
  from public.invoice
  where id =
    v_transaction.invoice_id;


  -- ----------------------------------------------------------
  -- Adaptive payment link lifecycle
  -- ----------------------------------------------------------

  if v_transaction.payment_link_id
     is not null then

    update public.invoice_payment_link
    set
      status =
        case

          -- Once the invoice is fully settled,
          -- every payment link is finished.
          when coalesce(
            v_remaining_balance,
            0
          ) <= 0
            then 'paid'

          -- Next-instalment links remain reusable.
          -- The next checkout dynamically resolves
          -- the next outstanding instalment.
          when link_type =
            'next_installment'
            then 'active'

          -- Customer-entered links may be reused
          -- while an invoice balance remains.
          when link_type =
            'customer_entered'
            then 'active'

          -- Full-balance and fixed-amount links
          -- are consumed after one verified payment.
          else 'paid'

        end,

      updated_at = now()

    where id =
      v_transaction.payment_link_id;

  end if;


  -- ----------------------------------------------------------
  -- Return authoritative result
  -- ----------------------------------------------------------

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,

    'payment_id',
      v_payment_id,

    'transaction_id',
      v_transaction.id,

    'invoice_id',
      v_transaction.invoice_id,

    'amount',
      v_transaction.amount,

    'payment_method',
      v_payment_method,

    'payment_date',
      v_payment_date,

    'balance_due',
      v_remaining_balance
  );

end;
$$;


-- This function represents confirmed money.
-- Browser users must NEVER be allowed to call it directly.

revoke all
on function public.post_verified_gateway_payment(
  uuid,
  text,
  text,
  timestamptz,
  numeric,
  jsonb
)
from public;

revoke all
on function public.post_verified_gateway_payment(
  uuid,
  text,
  text,
  timestamptz,
  numeric,
  jsonb
)
from anon;

revoke all
on function public.post_verified_gateway_payment(
  uuid,
  text,
  text,
  timestamptz,
  numeric,
  jsonb
)
from authenticated;

grant execute
on function public.post_verified_gateway_payment(
  uuid,
  text,
  text,
  timestamptz,
  numeric,
  jsonb
)
to service_role;
