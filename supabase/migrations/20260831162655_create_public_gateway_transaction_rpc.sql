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
  v_link public.invoice_payment_link;
  v_invoice public.invoice;
  v_transaction public.payment_gateway_transaction;
  v_expected_amount numeric(14,2);
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

  if v_link.status <> 'active' then
    raise exception 'Payment link is not active.';
  end if;

  if (
    v_link.expires_at is not null
    and v_link.expires_at <= now()
  ) then
    raise exception 'Payment link has expired.';
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

  /*
   * Determine the amount the link is allowed
   * to request.
   */
  if v_link.link_type in (
    'full_balance',
    'next_installment',
    'fixed_amount'
  ) then
    v_expected_amount :=
      least(
        coalesce(
          v_link.amount,
          v_invoice.balance_due
        ),
        v_invoice.balance_due
      );

    if round(p_amount, 2) <>
       round(v_expected_amount, 2) then
      raise exception
        'Payment amount does not match the payment link.';
    end if;

  elsif v_link.link_type = 'customer_entered' then

    if (
      v_link.minimum_amount is not null
      and p_amount < v_link.minimum_amount
    ) then
      raise exception
        'Payment amount is below the minimum allowed.';
    end if;

    if (
      v_link.maximum_amount is not null
      and p_amount > v_link.maximum_amount
    ) then
      raise exception
        'Payment amount exceeds the maximum allowed.';
    end if;

    if p_amount > v_invoice.balance_due then
      raise exception
        'Payment amount exceeds the invoice balance.';
    end if;

  else
    raise exception 'Unsupported payment link type.';
  end if;

  /*
   * Idempotency protection:
   * if this exact request already created
   * a transaction, return it instead.
   */
  select *
  into v_transaction
  from public.payment_gateway_transaction
  where idempotency_key = p_idempotency_key
  limit 1;

  if found then
    if v_transaction.payment_link_id <> v_link.id then
      raise exception
        'Idempotency key is already in use.';
    end if;

    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'transaction',
      jsonb_build_object(
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
    v_link.installment_id,

    lower(trim(p_provider)),
    lower(trim(p_payment_method)),

    round(p_amount, 2),
    coalesce(v_link.currency, 'ZAR'),

    'pending',
    trim(p_idempotency_key)
  )
  returning *
  into v_transaction;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'transaction',
    jsonb_build_object(
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

revoke all
on function public.create_public_gateway_transaction(
  text,
  text,
  text,
  numeric,
  text
)
from public;

grant execute
on function public.create_public_gateway_transaction(
  text,
  text,
  text,
  numeric,
  text
)
to anon, authenticated;
