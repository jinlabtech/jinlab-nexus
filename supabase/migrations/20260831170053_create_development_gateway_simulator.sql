-- ============================================================
-- JINLAB Nexus
-- Development Gateway Simulator
--
-- IMPORTANT:
-- This RPC exists only for local / development testing.
-- It must NOT be exposed in production.
-- ============================================================

create or replace function public.simulate_gateway_payment_success(
  p_transaction_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.payment_gateway_transaction%rowtype;
  v_provider_transaction_id text;
  v_provider_reference text;
begin

  if p_transaction_id is null then
    raise exception
      'Transaction ID is required.';
  end if;

  select *
  into v_transaction
  from public.payment_gateway_transaction
  where id = p_transaction_id
  for update;

  if not found then
    raise exception
      'Gateway transaction could not be found.';
  end if;

  if v_transaction.status = 'paid' then
    return jsonb_build_object(
      'ok', true,
      'already_paid', true,
      'transaction_id',
        v_transaction.id
    );
  end if;

  if v_transaction.status not in (
    'pending',
    'processing'
  ) then
    raise exception
      'Only pending or processing transactions can be simulated.';
  end if;

  v_provider_transaction_id :=
    'DEV-' ||
    upper(
      replace(
        gen_random_uuid()::text,
        '-',
        ''
      )
    );

  v_provider_reference :=
    'NEXUS-DEV-' ||
    substr(
      v_provider_transaction_id,
      5,
      12
    );

  return public.post_verified_gateway_payment(
    v_transaction.id,
    v_provider_transaction_id,
    v_provider_reference,
    now(),
    0,
    jsonb_build_object(
      'environment',
        'development',
      'simulated',
        true,
      'provider',
        v_transaction.provider,
      'payment_method',
        v_transaction.payment_method
    )
  );

end;
$$;


-- Development simulator must NEVER be public.
revoke all
on function public.simulate_gateway_payment_success(uuid)
from public;

revoke all
on function public.simulate_gateway_payment_success(uuid)
from anon;

revoke all
on function public.simulate_gateway_payment_success(uuid)
from authenticated;

grant execute
on function public.simulate_gateway_payment_success(uuid)
to service_role;
