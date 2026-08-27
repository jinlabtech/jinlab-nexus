-- ============================================================
-- JINLAB Nexus
-- Flexible Tax and Discount Modes
-- ============================================================

alter table public.quotation_item
add column if not exists tax_mode text
not null default 'none'
check (
    tax_mode in (
        'none',
        'vat'
    )
);

alter table public.quotation_item
add column if not exists discount_mode text
not null default 'percentage'
check (
    discount_mode in (
        'percentage',
        'fixed'
    )
);

alter table public.quotation_item
add column if not exists discount_value numeric(14,2)
not null default 0
check (
    discount_value >= 0
);

-- Keep old discount_rate temporarily for compatibility.
-- New calculations will use discount_mode + discount_value.

create or replace function public.calculate_quotation_item_totals()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    calculated_discount numeric(14,2);
    calculated_tax numeric(14,2);
    taxable_amount numeric(14,2);
begin
    new.line_subtotal :=
        round(
            new.quantity *
            new.unit_price,
            2
        );

    if new.discount_mode = 'percentage' then
        if new.discount_value > 100 then
            raise exception
                'Percentage discount cannot exceed 100%%.';
        end if;

        calculated_discount :=
            round(
                new.line_subtotal *
                (
                    new.discount_value /
                    100
                ),
                2
            );
    else
        calculated_discount :=
            round(
                least(
                    new.discount_value,
                    new.line_subtotal
                ),
                2
            );
    end if;

    new.line_discount :=
        calculated_discount;

    taxable_amount :=
        new.line_subtotal -
        calculated_discount;

    if new.tax_mode = 'vat' then
        calculated_tax :=
            round(
                taxable_amount *
                (
                    new.tax_rate /
                    100
                ),
                2
            );
    else
        calculated_tax := 0;
    end if;

    new.line_tax :=
        calculated_tax;

    new.line_total :=
        taxable_amount +
        calculated_tax;

    -- Keep legacy discount_rate aligned.
    if new.discount_mode = 'percentage' then
        new.discount_rate :=
            new.discount_value;
    else
        new.discount_rate := 0;
    end if;

    return new;
end;
$$;
