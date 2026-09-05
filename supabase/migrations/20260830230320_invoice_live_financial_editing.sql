-- ============================================================
-- JINLAB NEXUS
-- Controlled live invoice financial editing
-- ============================================================

create table if not exists public.invoice_change_log (
    id uuid primary key default gen_random_uuid(),

    company_id uuid not null,
    invoice_id uuid not null
        references public.invoice(id)
        on delete cascade,

    invoice_item_id uuid null
        references public.invoice_item(id)
        on delete set null,

    change_type text not null,

    field_name text not null,

    old_value text null,
    new_value text null,

    reason text null,

    changed_by uuid null
        references auth.users(id)
        on delete set null,

    created_at timestamptz not null
        default now()
);

create index if not exists
invoice_change_log_invoice_idx
on public.invoice_change_log(invoice_id);

create index if not exists
invoice_change_log_company_idx
on public.invoice_change_log(company_id);

alter table public.invoice_change_log
enable row level security;


-- ============================================================
-- READ POLICY
-- ============================================================

drop policy if exists
"invoice_change_log_company_read"
on public.invoice_change_log;

create policy
"invoice_change_log_company_read"
on public.invoice_change_log
for select
to authenticated
using (
    company_id in (
        select up.company_id
        from public.user_profile up
        where up.user_id = auth.uid()
    )
);


-- ============================================================
-- DO NOT ALLOW DIRECT CLIENT INSERT/UPDATE/DELETE
-- Writes happen through RPC only.
-- ============================================================

revoke insert, update, delete
on public.invoice_change_log
from authenticated;


-- ============================================================
-- CONTROLLED FINANCIAL EDIT RPC
-- ============================================================

create or replace function public.update_invoice_item_financials(
    p_invoice_item_id uuid,
    p_unit_price numeric,
    p_discount_mode text,
    p_discount_value numeric,
    p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
    v_company_id uuid;

    v_item public.invoice_item%rowtype;
    v_invoice public.invoice%rowtype;

    v_new_total numeric(14,2);
    v_paid numeric(14,2);
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception
            'You must be logged in.';
    end if;

    select up.company_id
    into v_company_id
    from public.user_profile up
    where up.user_id = v_user_id
    limit 1;

    if v_company_id is null then
        raise exception
            'Company could not be resolved.';
    end if;

    select *
    into v_item
    from public.invoice_item
    where id = p_invoice_item_id
      and company_id = v_company_id
    for update;

    if not found then
        raise exception
            'Invoice item could not be found.';
    end if;

    select *
    into v_invoice
    from public.invoice
    where id = v_item.invoice_id
      and company_id = v_company_id
    for update;

    if not found then
        raise exception
            'Invoice could not be found.';
    end if;

    if v_invoice.status = 'cancelled' then
        raise exception
            'Cancelled invoices cannot be edited.';
    end if;

    if p_unit_price < 0 then
        raise exception
            'Price cannot be negative.';
    end if;

    if p_discount_mode not in (
        'percentage',
        'fixed'
    ) then
        raise exception
            'Invalid discount mode.';
    end if;

    if p_discount_value < 0 then
        raise exception
            'Discount cannot be negative.';
    end if;

    if p_discount_mode = 'percentage'
       and p_discount_value > 100 then
        raise exception
            'Percentage discount cannot exceed 100%%.';
    end if;


    -- --------------------------------------------------------
    -- PRICE CHANGE LOG
    -- --------------------------------------------------------

    if v_item.unit_price
       is distinct from p_unit_price then

        insert into public.invoice_change_log (
            company_id,
            invoice_id,
            invoice_item_id,
            change_type,
            field_name,
            old_value,
            new_value,
            reason,
            changed_by
        )
        values (
            v_company_id,
            v_invoice.id,
            v_item.id,
            'financial_adjustment',
            'unit_price',
            v_item.unit_price::text,
            p_unit_price::text,
            nullif(trim(p_reason), ''),
            v_user_id
        );

    end if;


    -- --------------------------------------------------------
    -- DISCOUNT MODE CHANGE LOG
    -- --------------------------------------------------------

    if v_item.discount_mode
       is distinct from p_discount_mode then

        insert into public.invoice_change_log (
            company_id,
            invoice_id,
            invoice_item_id,
            change_type,
            field_name,
            old_value,
            new_value,
            reason,
            changed_by
        )
        values (
            v_company_id,
            v_invoice.id,
            v_item.id,
            'financial_adjustment',
            'discount_mode',
            v_item.discount_mode,
            p_discount_mode,
            nullif(trim(p_reason), ''),
            v_user_id
        );

    end if;


    -- --------------------------------------------------------
    -- DISCOUNT VALUE CHANGE LOG
    -- --------------------------------------------------------

    if v_item.discount_value
       is distinct from p_discount_value then

        insert into public.invoice_change_log (
            company_id,
            invoice_id,
            invoice_item_id,
            change_type,
            field_name,
            old_value,
            new_value,
            reason,
            changed_by
        )
        values (
            v_company_id,
            v_invoice.id,
            v_item.id,
            'financial_adjustment',
            'discount_value',
            v_item.discount_value::text,
            p_discount_value::text,
            nullif(trim(p_reason), ''),
            v_user_id
        );

    end if;


    -- --------------------------------------------------------
    -- UPDATE ITEM
    -- Existing BEFORE trigger recalculates line totals.
    -- Existing AFTER trigger recalculates invoice totals.
    -- --------------------------------------------------------

    update public.invoice_item
    set
        unit_price =
            round(p_unit_price, 2),

        discount_mode =
            p_discount_mode,

        discount_value =
            round(p_discount_value, 2)

    where id = v_item.id;


    -- Existing invoice_item trigger has now recalculated invoice.

    select
        total_amount,
        amount_paid
    into
        v_new_total,
        v_paid
    from public.invoice
    where id = v_invoice.id;


    -- --------------------------------------------------------
    -- SAFETY:
    -- Do not allow editing invoice below money already received.
    -- Raising here rolls back BOTH edit and logs.
    -- --------------------------------------------------------

    if v_paid > v_new_total then
        raise exception
            'This edit would reduce the invoice total below the amount already paid.';
    end if;


    -- --------------------------------------------------------
    -- Refresh payment-derived status/balance.
    -- --------------------------------------------------------

    perform public.refresh_invoice_payment_status(
        v_invoice.id
    );

end;
$$;


revoke all
on function public.update_invoice_item_financials(
    uuid,
    numeric,
    text,
    numeric,
    text
)
from public;

grant execute
on function public.update_invoice_item_financials(
    uuid,
    numeric,
    text,
    numeric,
    text
)
to authenticated;
