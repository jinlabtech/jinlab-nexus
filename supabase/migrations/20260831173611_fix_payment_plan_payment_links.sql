-- ============================================================
-- JINLAB Nexus
-- Reusable Payment Plan Payment Links
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
    return jsonb_build_object(
      'ok', false,
      'reason', 'not_found'
    );
  end if;


  select *
  into v_invoice
  from public.invoice
  where id = v_link.invoice_id
    and company_id = v_link.company_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'reason', 'invoice_not_found'
    );
  end if;


  -- ----------------------------------------------------------
  -- Actual invoice balance is the authority.
  -- A consumed instalment link does NOT mean invoice paid.
  -- ----------------------------------------------------------

  if coalesce(v_invoice.balance_due, 0) <= 0 then
    return jsonb_build_object(
      'ok', false,
      'reason', 'invoice_paid',
      'invoice',
        jsonb_build_object(
          'invoice_number',
            v_invoice.invoice_number,
          'total_amount',
            v_invoice.total_amount,
          'balance_due',
            v_invoice.balance_due
        )
    );
  end if;


  if v_invoice.status = 'cancelled' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'invoice_cancelled'
    );
  end if;


  if (
    v_link.expires_at is not null
    and v_link.expires_at <= now()
  ) then
    return jsonb_build_object(
      'ok', false,
      'reason', 'expired'
    );
  end if;


  if v_link.status = 'cancelled' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'cancelled'
    );
  end if;


  -- ----------------------------------------------------------
  -- PAYMENT PLAN
  --
  -- Find the current plan and its next outstanding instalment.
  -- ----------------------------------------------------------

  if v_link.payment_plan_id is not null then

    select *
    into v_plan
    from public.invoice_payment_plan
    where id = v_link.payment_plan_id
      and invoice_id = v_invoice.id;

    if found
       and v_plan.status in (
         'draft',
         'active'
       )
    then

      select *
      into v_installment
      from public.invoice_payment_plan_installment
      where payment_plan_id = v_plan.id
        and status in (
          'pending',
          'partially_paid',
          'overdue'
        )
        and amount_paid < amount_due
      order by
        due_date asc,
        installment_number asc
      limit 1;

      if found then

        v_effective_amount :=
          least(
            greatest(
              v_installment.amount_due -
              v_installment.amount_paid,
              0
            ),
            v_invoice.balance_due
          );

        v_effective_link_type :=
          'next_installment';

        -- Reactivate a previously consumed plan link.
        if v_link.status = 'paid' then
          update public.invoice_payment_link
          set
            status = 'active',
            updated_at = now()
          where id = v_link.id;

          v_link.status := 'active';
        end if;

      end if;

    end if;

  end if;


  -- ----------------------------------------------------------
  -- Normal non-plan link
  -- ----------------------------------------------------------

  if v_effective_amount is null then

    if v_link.status <> 'active' then
      return jsonb_build_object(
        'ok', false,
        'reason', v_link.status
      );
    end if;

    v_effective_link_type :=
      v_link.link_type;

    if v_link.link_type = 'full_balance' then

      v_effective_amount :=
        v_invoice.balance_due;

    elsif v_link.link_type in (
      'fixed_amount',
      'next_installment'
    ) then

      v_effective_amount :=
        least(
          coalesce(
            v_link.amount,
            v_invoice.balance_due
          ),
          v_invoice.balance_due
        );

    end if;

  end if;


  -- ----------------------------------------------------------
  -- Display information
  -- ----------------------------------------------------------

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

    'payment_link',
      jsonb_build_object(
        'id',
          v_link.id,

        'link_type',
          v_effective_link_type,

        'amount',
          v_effective_amount,

        'minimum_amount',
          v_link.minimum_amount,

        'maximum_amount',
          least(
            coalesce(
              v_link.maximum_amount,
              v_invoice.balance_due
            ),
            v_invoice.balance_due
          ),

        'currency',
          coalesce(
            v_link.currency,
            'ZAR'
          ),

        'expires_at',
          v_link.expires_at,

        'payment_plan_id',
          v_link.payment_plan_id,

        'installment_id',
          case
            when v_installment.id is not null
              then v_installment.id
            else v_link.installment_id
          end,

        'installment_number',
          v_installment.installment_number,

        'installment_due_date',
          v_installment.due_date
      ),

    'invoice',
      jsonb_build_object(
        'invoice_number',
          v_invoice.invoice_number,

        'invoice_date',
          v_invoice.invoice_date,

        'due_date',
          v_invoice.due_date,

        'total_amount',
          v_invoice.total_amount,

        'amount_paid',
          v_invoice.amount_paid,

        'balance_due',
          v_invoice.balance_due,

        'status',
          v_invoice.status
      ),

    'company',
      jsonb_build_object(
        'name',
          v_company_name,

        'branch_name',
          v_branch_name
      ),

    'customer',
      jsonb_build_object(
        'name',
          v_customer_name
      )
  );

end;
$$;


revoke all
on function public.get_public_payment_link(text)
from public;

grant execute
on function public.get_public_payment_link(text)
to anon, authenticated;


-- ============================================================
-- Payment-plan aware gateway transaction initiation
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

  if p_token is null
     or trim(p_token) = '' then
    raise exception
      'Payment token is required.';
  end if;

  if p_provider is null
     or trim(p_provider) = '' then
    raise exception
      'Payment provider is required.';
  end if;

  if p_payment_method is null
     or trim(p_payment_method) = '' then
    raise exception
      'Payment method is required.';
  end if;

  if p_idempotency_key is null
     or trim(p_idempotency_key) = '' then
    raise exception
      'Idempotency key is required.';
  end if;

  if p_amount is null
     or p_amount <= 0 then
    raise exception
      'Payment amount must be greater than zero.';
  end if;


  select *
  into v_link
  from public.invoice_payment_link
  where token = p_token
  for update;

  if not found then
    raise exception
      'Payment link not found.';
  end if;


  select *
  into v_invoice
  from public.invoice
  where id = v_link.invoice_id
    and company_id = v_link.company_id
  for update;

  if not found then
    raise exception
      'Invoice not found.';
  end if;


  if v_invoice.status = 'cancelled' then
    raise exception
      'Invoice is cancelled.';
  end if;


  if coalesce(
    v_invoice.balance_due,
    0
  ) <= 0 then
    raise exception
      'Invoice is already fully paid.';
  end if;


  if (
    v_link.expires_at is not null
    and v_link.expires_at <= now()
  ) then
    raise exception
      'Payment link has expired.';
  end if;


  if v_link.status = 'cancelled' then
    raise exception
      'Payment link is cancelled.';
  end if;


  -- ----------------------------------------------------------
  -- Resolve current payment-plan instalment
  -- ----------------------------------------------------------

  if v_link.payment_plan_id is not null then

    select *
    into v_plan
    from public.invoice_payment_plan
    where id = v_link.payment_plan_id
      and invoice_id = v_invoice.id
    for update;

    if found
       and v_plan.status in (
         'draft',
         'active'
       )
    then

      select *
      into v_installment
      from public.invoice_payment_plan_installment
      where payment_plan_id = v_plan.id
        and status in (
          'pending',
          'partially_paid',
          'overdue'
        )
        and amount_paid < amount_due
      order by
        due_date asc,
        installment_number asc
      limit 1
      for update;

      if found then

        v_expected_amount :=
          least(
            v_installment.amount_due -
              v_installment.amount_paid,
            v_invoice.balance_due
          );

        v_effective_installment_id :=
          v_installment.id;

      end if;

    end if;

  end if;


  -- ----------------------------------------------------------
  -- Normal payment-link amount rules
  -- ----------------------------------------------------------

  if v_expected_amount is null then

    if v_link.status <> 'active' then
      raise exception
        'Payment link is not active.';
    end if;


    if v_link.link_type =
      'customer_entered'
    then

      if (
        v_link.minimum_amount
          is not null
        and p_amount <
          v_link.minimum_amount
      ) then
        raise exception
          'Payment amount is below the minimum allowed.';
      end if;


      if (
        v_link.maximum_amount
          is not null
        and p_amount >
          v_link.maximum_amount
      ) then
        raise exception
          'Payment amount exceeds the maximum allowed.';
      end if;


      if p_amount >
        v_invoice.balance_due
      then
        raise exception
          'Payment amount exceeds the invoice balance.';
      end if;

      v_expected_amount :=
        p_amount;

    elsif v_link.link_type =
      'full_balance'
    then

      v_expected_amount :=
        v_invoice.balance_due;

    else

      v_expected_amount :=
        least(
          coalesce(
            v_link.amount,
            v_invoice.balance_due
          ),
          v_invoice.balance_due
        );

    end if;

  end if;


  if round(p_amount, 2) <>
     round(v_expected_amount, 2)
  then
    raise exception
      'Payment amount does not match the current amount due.';
  end if;


  -- ----------------------------------------------------------
  -- Idempotency
  -- ----------------------------------------------------------

  select *
  into v_transaction
  from public.payment_gateway_transaction
  where idempotency_key =
    p_idempotency_key
  limit 1;

  if found then

    if v_transaction.payment_link_id
      <> v_link.id
    then
      raise exception
        'Idempotency key is already in use.';
    end if;


    return jsonb_build_object(
      'ok', true,
      'duplicate', true,

      'transaction',
        jsonb_build_object(
          'id',
            v_transaction.id,

          'status',
            v_transaction.status,

          'provider',
            v_transaction.provider,

          'payment_method',
            v_transaction.payment_method,

          'amount',
            v_transaction.amount,

          'currency',
            v_transaction.currency,

          'created_at',
            v_transaction.created_at
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
    coalesce(
      v_effective_installment_id,
      v_link.installment_id
    ),

    lower(
      trim(p_provider)
    ),

    lower(
      trim(p_payment_method)
    ),

    round(
      v_expected_amount,
      2
    ),

    coalesce(
      v_link.currency,
      'ZAR'
    ),

    'pending',

    trim(
      p_idempotency_key
    )
  )
  returning *
  into v_transaction;


  -- Ensure reusable plan links stay active.
  if v_link.payment_plan_id
    is not null
  then

    update public.invoice_payment_link
    set
      status = 'active',
      updated_at = now()
    where id = v_link.id;

  end if;


  return jsonb_build_object(
    'ok', true,
    'duplicate', false,

    'transaction',
      jsonb_build_object(
        'id',
          v_transaction.id,

        'status',
          v_transaction.status,

        'provider',
          v_transaction.provider,

        'payment_method',
          v_transaction.payment_method,

        'amount',
          v_transaction.amount,

        'currency',
          v_transaction.currency,

        'created_at',
          v_transaction.created_at
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
