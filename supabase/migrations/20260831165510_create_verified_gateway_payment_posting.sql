-- ============================================================
-- JINLAB Nexus
-- Verified Gateway Payment Posting
-- ============================================================

-- One gateway transaction may create only one real payment.
create unique index if not exists
invoice_payment_gateway_transaction_unique_idx
on public.invoice_payment(gateway_transaction_id)
where gateway_transaction_id is not null;


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
  -- Payment link lifecycle
  -- ----------------------------------------------------------

  if v_transaction.payment_link_id
     is not null then

    update public.invoice_payment_link
    set
      status =
        case

          -- Customer-entered links may remain reusable
          -- while the invoice still has money outstanding.
          when link_type =
            'customer_entered'
            and coalesce(
              v_remaining_balance,
              0
            ) > 0
            then 'active'

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
