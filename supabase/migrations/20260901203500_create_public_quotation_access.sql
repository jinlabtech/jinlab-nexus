-- ============================================================
-- JINLAB Nexus
-- Public Quotation Access + Customer Response
-- ============================================================


-- ============================================================
-- 1. READ PUBLIC QUOTATION
-- ============================================================

create or replace function public.get_public_quotation(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.quotation_share_link%rowtype;
  v_quotation public.quotation%rowtype;

  v_company_name text;
  v_branch_name text;
  v_customer_name text;

  v_items jsonb;
  v_already_viewed boolean;
begin

  select *
  into v_link
  from public.quotation_share_link
  where token = p_token;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'reason', 'not_found'
    );
  end if;

  if v_link.status = 'cancelled' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'cancelled'
    );
  end if;

  if v_link.status = 'expired' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'expired'
    );
  end if;

  if v_link.expires_at is not null
     and v_link.expires_at <= now() then

    update public.quotation_share_link
    set status = 'expired'
    where id = v_link.id;

    return jsonb_build_object(
      'ok', false,
      'reason', 'expired'
    );
  end if;

  select *
  into v_quotation
  from public.quotation
  where id = v_link.quotation_id
    and company_id = v_link.company_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'reason', 'quotation_not_found'
    );
  end if;

  if v_quotation.status = 'cancelled' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'quotation_cancelled'
    );
  end if;

  if v_quotation.status = 'draft' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'quotation_not_sent'
    );
  end if;

  -- Automatically expire quotations whose validity date has passed.
  if v_quotation.valid_until is not null
     and v_quotation.valid_until < current_date
     and v_quotation.status = 'sent' then

    update public.quotation
    set status = 'expired'
    where id = v_quotation.id;

    v_quotation.status := 'expired';
  end if;

  select company_name
  into v_company_name
  from public.company
  where id = v_quotation.company_id;

  select branch_name
  into v_branch_name
  from public.branch
  where id = v_quotation.branch_id;

  select customer_name
  into v_customer_name
  from public.customer
  where id = v_quotation.customer_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', qi.id,
        'description', qi.description,
        'quantity', qi.quantity,
        'unit_price', qi.unit_price,
        'discount_rate', qi.discount_rate,
        'discount_mode', qi.discount_mode,
        'discount_value', qi.discount_value,
        'tax_mode', qi.tax_mode,
        'tax_rate', qi.tax_rate,
        'line_subtotal', qi.line_subtotal,
        'line_discount', qi.line_discount,
        'line_tax', qi.line_tax,
        'line_total', qi.line_total
      )
      order by qi.created_at asc
    ),
    '[]'::jsonb
  )
  into v_items
  from public.quotation_item qi
  where qi.quotation_id = v_quotation.id
    and qi.company_id = v_quotation.company_id;

  -- Track every view count, but create only one first-view audit event.
  select exists (
    select 1
    from public.quotation_customer_action
    where share_link_id = v_link.id
      and action = 'viewed'
  )
  into v_already_viewed;

  update public.quotation_share_link
  set
    first_viewed_at = coalesce(
      first_viewed_at,
      now()
    ),
    last_viewed_at = now(),
    view_count = view_count + 1
  where id = v_link.id;

  if not v_already_viewed then
    insert into public.quotation_customer_action (
      company_id,
      quotation_id,
      share_link_id,
      customer_id,
      action,
      occurred_at
    )
    values (
      v_quotation.company_id,
      v_quotation.id,
      v_link.id,
      v_quotation.customer_id,
      'viewed',
      now()
    );
  end if;

  update public.quotation_delivery
  set
    status = 'viewed',
    viewed_at = coalesce(
      viewed_at,
      now()
    )
  where share_link_id = v_link.id
    and status in (
      'prepared',
      'sent',
      'delivered'
    );

  return jsonb_build_object(
    'ok', true,

    'share_link', jsonb_build_object(
      'id', v_link.id,
      'expires_at', v_link.expires_at,
      'first_viewed_at', coalesce(
        v_link.first_viewed_at,
        now()
      )
    ),

    'quotation', jsonb_build_object(
      'id', v_quotation.id,
      'quotation_number',
        v_quotation.quotation_number,
      'status',
        v_quotation.status,
      'quotation_date',
        v_quotation.quotation_date,
      'valid_until',
        v_quotation.valid_until,
      'customer_reference',
        v_quotation.customer_reference,
      'notes',
        v_quotation.notes,
      'terms',
        v_quotation.terms,
      'subtotal',
        v_quotation.subtotal,
      'discount_amount',
        v_quotation.discount_amount,
      'tax_amount',
        v_quotation.tax_amount,
      'total_amount',
        v_quotation.total_amount
    ),

    'company', jsonb_build_object(
      'name', v_company_name,
      'branch_name', v_branch_name
    ),

    'customer', jsonb_build_object(
      'name', v_customer_name
    ),

    'items', v_items
  );

end;
$$;


revoke all
on function public.get_public_quotation(text)
from public;

grant execute
on function public.get_public_quotation(text)
to anon, authenticated;


-- ============================================================
-- 2. CUSTOMER RESPONSE
-- ============================================================

create or replace function public.respond_to_public_quotation(
  p_token text,
  p_action text,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.quotation_share_link%rowtype;
  v_quotation public.quotation%rowtype;
  v_action public.quotation_customer_action%rowtype;
begin

  if p_action not in (
    'accepted',
    'declined',
    'requested_changes'
  ) then
    return jsonb_build_object(
      'ok', false,
      'reason', 'unsupported_action'
    );
  end if;

  select *
  into v_link
  from public.quotation_share_link
  where token = p_token
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'reason', 'not_found'
    );
  end if;

  if v_link.status = 'cancelled' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'cancelled'
    );
  end if;

  if v_link.status = 'expired'
     or (
       v_link.expires_at is not null
       and v_link.expires_at <= now()
     ) then

    update public.quotation_share_link
    set status = 'expired'
    where id = v_link.id;

    return jsonb_build_object(
      'ok', false,
      'reason', 'expired'
    );
  end if;

  select *
  into v_quotation
  from public.quotation
  where id = v_link.quotation_id
    and company_id = v_link.company_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'reason', 'quotation_not_found'
    );
  end if;

  if v_quotation.status = 'draft' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'quotation_not_sent'
    );
  end if;

  if v_quotation.valid_until is not null
     and v_quotation.valid_until < current_date
     and v_quotation.status = 'sent' then

    update public.quotation
    set status = 'expired'
    where id = v_quotation.id;

    return jsonb_build_object(
      'ok', false,
      'reason', 'quotation_expired'
    );
  end if;

  -- Accepted / declined / expired / cancelled are terminal.
  if v_quotation.status in (
    'accepted',
    'declined',
    'expired',
    'cancelled'
  ) then
    return jsonb_build_object(
      'ok', false,
      'reason',
        'quotation_' || v_quotation.status,
      'quotation_status',
        v_quotation.status
    );
  end if;

  if v_quotation.status <> 'sent' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'quotation_unavailable'
    );
  end if;

  insert into public.quotation_customer_action (
    company_id,
    quotation_id,
    share_link_id,
    customer_id,
    action,
    message,
    occurred_at
  )
  values (
    v_quotation.company_id,
    v_quotation.id,
    v_link.id,
    v_quotation.customer_id,
    p_action,
    nullif(
      trim(p_message),
      ''
    ),
    now()
  )
  returning *
  into v_action;

  if p_action = 'accepted' then

    update public.quotation
    set status = 'accepted'
    where id = v_quotation.id;

    v_quotation.status := 'accepted';

  elsif p_action = 'declined' then

    update public.quotation
    set status = 'declined'
    where id = v_quotation.id;

    v_quotation.status := 'declined';

  else

    -- Requesting changes keeps the quotation open.
    -- Staff can revise/respond through the internal workflow.
    v_quotation.status := 'sent';

  end if;

  return jsonb_build_object(
    'ok', true,

    'action', jsonb_build_object(
      'id', v_action.id,
      'action', v_action.action,
      'message', v_action.message,
      'occurred_at', v_action.occurred_at
    ),

    'quotation', jsonb_build_object(
      'id', v_quotation.id,
      'quotation_number',
        v_quotation.quotation_number,
      'status',
        v_quotation.status
    )
  );

end;
$$;


revoke all
on function public.respond_to_public_quotation(
  text,
  text,
  text
)
from public;

grant execute
on function public.respond_to_public_quotation(
  text,
  text,
  text
)
to anon, authenticated;


-- ============================================================
-- END
-- ============================================================
