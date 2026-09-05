-- ============================================================
-- JINLAB Nexus
-- Professional paid payment-link receipt state
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
  v_paid_at date;

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

  -- Load safe receipt identity before checking the terminal state.
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

  select max(payment_date)
  into v_paid_at
  from public.invoice_payment
  where invoice_id = v_invoice.id
    and company_id = v_invoice.company_id;

  -- A paid invoice is a successful terminal state.
  -- It remains non-payable, but safe receipt information is returned.
  if coalesce(v_invoice.balance_due, 0) <= 0 then
    return jsonb_build_object(
      'ok', false,
      'reason', 'invoice_paid',

      'payment_link', jsonb_build_object(
        'id', v_link.id,
        'link_type', v_link.link_type,
        'amount', v_link.amount,
        'minimum_amount', v_link.minimum_amount,
        'maximum_amount', v_link.maximum_amount,
        'currency', coalesce(v_link.currency, 'ZAR'),
        'expires_at', v_link.expires_at
      ),

      'invoice', jsonb_build_object(
        'invoice_number', v_invoice.invoice_number,
        'invoice_date', v_invoice.invoice_date,
        'due_date', v_invoice.due_date,
        'total_amount', v_invoice.total_amount,
        'amount_paid', v_invoice.amount_paid,
        'balance_due', v_invoice.balance_due,
        'status', v_invoice.status,
        'paid_at', v_paid_at
      ),

      'company', jsonb_build_object(
        'name', v_company_name,
        'branch_name', v_branch_name
      ),

      'customer', jsonb_build_object(
        'name', v_customer_name
      )
    );
  end if;

  if v_invoice.status = 'cancelled' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'invoice_cancelled'
    );
  end if;

  if v_link.expires_at is not null
     and v_link.expires_at <= now() then
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

  -- Only next_installment links dynamically follow the plan.
  if v_link.link_type = 'next_installment' then

    if v_link.payment_plan_id is null then
      return jsonb_build_object(
        'ok', false,
        'reason', 'payment_plan_required'
      );
    end if;

    select *
    into v_plan
    from public.invoice_payment_plan
    where id = v_link.payment_plan_id
      and invoice_id = v_invoice.id;

    if not found
       or v_plan.status not in ('draft', 'active') then
      return jsonb_build_object(
        'ok', false,
        'reason', 'payment_plan_unavailable'
      );
    end if;

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

    if not found then
      return jsonb_build_object(
        'ok', false,
        'reason', 'no_outstanding_installment'
      );
    end if;

    v_effective_amount := least(
      greatest(
        v_installment.amount_due -
        v_installment.amount_paid,
        0
      ),
      v_invoice.balance_due
    );

    v_effective_link_type := 'next_installment';

    if v_link.status = 'paid' then
      update public.invoice_payment_link
      set
        status = 'active',
        updated_at = now()
      where id = v_link.id;

      v_link.status := 'active';
    end if;

  else

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

    elsif v_link.link_type = 'fixed_amount' then
      v_effective_amount := least(
        coalesce(
          v_link.amount,
          v_invoice.balance_due
        ),
        v_invoice.balance_due
      );

    elsif v_link.link_type = 'customer_entered' then
      v_effective_amount := null;

    else
      return jsonb_build_object(
        'ok', false,
        'reason', 'unsupported_link_type'
      );
    end if;

  end if;

  return jsonb_build_object(
    'ok', true,

    'payment_link', jsonb_build_object(
      'id', v_link.id,
      'link_type', v_effective_link_type,
      'amount', v_effective_amount,
      'minimum_amount', v_link.minimum_amount,
      'maximum_amount', least(
        coalesce(
          v_link.maximum_amount,
          v_invoice.balance_due
        ),
        v_invoice.balance_due
      ),
      'currency',
        coalesce(v_link.currency, 'ZAR'),
      'expires_at', v_link.expires_at,
      'payment_plan_id',
        v_link.payment_plan_id,

      'installment_id',
        case
          when v_link.link_type =
            'next_installment'
          then v_installment.id
          else v_link.installment_id
        end,

      'installment_number',
        case
          when v_link.link_type =
            'next_installment'
          then v_installment.installment_number
          else null
        end,

      'installment_due_date',
        case
          when v_link.link_type =
            'next_installment'
          then v_installment.due_date
          else null
        end
    ),

    'invoice', jsonb_build_object(
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
        v_invoice.status,
      'paid_at',
        v_paid_at
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

revoke all
on function public.get_public_payment_link(text)
from public;

grant execute
on function public.get_public_payment_link(text)
to anon, authenticated;
