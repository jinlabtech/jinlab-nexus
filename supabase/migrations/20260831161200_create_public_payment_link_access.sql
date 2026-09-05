create or replace function public.get_public_payment_link(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.invoice_payment_link;
  v_invoice public.invoice;
  v_customer_name text;
  v_company_name text;
  v_branch_name text;
begin
  select *
  into v_link
  from public.invoice_payment_link
  where token = p_token
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'reason', 'not_found'
    );
  end if;

  if v_link.status <> 'active' then
    return jsonb_build_object(
      'ok', false,
      'reason', v_link.status
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

  select *
  into v_invoice
  from public.invoice
  where id = v_link.invoice_id
    and company_id = v_link.company_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'reason', 'invoice_not_found'
    );
  end if;

  if v_invoice.status = 'cancelled' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'invoice_cancelled'
    );
  end if;

  if coalesce(v_invoice.balance_due, 0) <= 0 then
    return jsonb_build_object(
      'ok', false,
      'reason', 'already_paid'
    );
  end if;

  select
    coalesce(
      nullif(trim(customer_name), ''),
      'Customer'
    )
  into v_customer_name
  from public.customer
  where id = v_link.customer_id
    and company_id = v_link.company_id
  limit 1;

  select
    coalesce(
      nullif(trim(company_name), ''),
      'Company'
    )
  into v_company_name
  from public.company
  where id = v_link.company_id
  limit 1;

  select
    coalesce(
      nullif(trim(branch_name), ''),
      ''
    )
  into v_branch_name
  from public.branch
  where id = v_link.branch_id
    and company_id = v_link.company_id
  limit 1;

  return jsonb_build_object(
    'ok', true,

    'payment_link',
    jsonb_build_object(
      'id', v_link.id,
      'link_type', v_link.link_type,
      'amount', v_link.amount,
      'minimum_amount', v_link.minimum_amount,
      'maximum_amount', v_link.maximum_amount,
      'currency', v_link.currency,
      'expires_at', v_link.expires_at
    ),

    'invoice',
    jsonb_build_object(
      'invoice_number', v_invoice.invoice_number,
      'invoice_date', v_invoice.invoice_date,
      'due_date', v_invoice.due_date,
      'total_amount', v_invoice.total_amount,
      'balance_due', v_invoice.balance_due
    ),

    'company',
    jsonb_build_object(
      'name', coalesce(v_company_name, 'Company'),
      'branch_name', coalesce(v_branch_name, '')
    ),

    'customer',
    jsonb_build_object(
      'name', coalesce(v_customer_name, 'Customer')
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
