-- ============================================================
-- JINLAB Nexus
-- Sprint 16.5A - Transactional Goods Receiving
-- ============================================================

create or replace function public.receive_purchase_order(
    target_purchase_order_id uuid,
    target_company_id uuid,
    supplier_delivery_reference text default null,
    receipt_notes text default null,
    received_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    current_user_id uuid := auth.uid();
    purchase_order_row public.purchase_order%rowtype;
    receipt_row public.purchase_receipt%rowtype;
    purchase_order_item_row public.purchase_order_item%rowtype;
    received_item jsonb;
    received_quantity integer;
    generated_receipt_number text;
    all_received boolean;
    any_received boolean;
begin
    if current_user_id is null then
        raise exception 'Authentication required.';
    end if;

    if jsonb_typeof(received_items) <> 'array'
       or jsonb_array_length(received_items) = 0 then
        raise exception 'At least one received item is required.';
    end if;

    select *
    into purchase_order_row
    from public.purchase_order
    where id = target_purchase_order_id
      and company_id = target_company_id
    for update;

    if not found then
        raise exception 'Purchase order could not be found.';
    end if;

    if purchase_order_row.status not in (
        'approved',
        'partially_received'
    ) then
        raise exception
            'Only approved or partially received purchase orders can receive stock.';
    end if;

    generated_receipt_number :=
        public.generate_purchase_receipt_number(
            target_company_id
        );

    insert into public.purchase_receipt (
        company_id,
        purchase_order_id,
        branch_id,
        received_by,
        receipt_number,
        supplier_delivery_reference,
        notes
    )
    values (
        target_company_id,
        target_purchase_order_id,
        purchase_order_row.branch_id,
        current_user_id,
        generated_receipt_number,
        nullif(trim(supplier_delivery_reference), ''),
        nullif(trim(receipt_notes), '')
    )
    returning *
    into receipt_row;

    for received_item in
        select value
        from jsonb_array_elements(received_items)
    loop
        begin
            received_quantity :=
                (received_item ->> 'quantity_received')::integer;
        exception
            when others then
                raise exception 'Received quantity must be a whole number.';
        end;

        if received_quantity <= 0 then
            raise exception 'Received quantity must be greater than 0.';
        end if;

        select *
        into purchase_order_item_row
        from public.purchase_order_item
        where id =
            (received_item ->> 'purchase_order_item_id')::uuid
          and purchase_order_id =
            target_purchase_order_id
          and company_id =
            target_company_id
        for update;

        if not found then
            raise exception 'Purchase order item could not be found.';
        end if;

        if purchase_order_item_row.quantity_received
             + received_quantity
           > purchase_order_item_row.quantity_ordered then
            raise exception
                'Received quantity exceeds the remaining quantity for item %.',
                purchase_order_item_row.inventory_item_id;
        end if;

        insert into public.purchase_receipt_item (
            purchase_receipt_id,
            purchase_order_item_id,
            company_id,
            inventory_item_id,
            quantity_received,
            unit_cost
        )
        values (
            receipt_row.id,
            purchase_order_item_row.id,
            target_company_id,
            purchase_order_item_row.inventory_item_id,
            received_quantity,
            purchase_order_item_row.unit_cost
        );

        update public.purchase_order_item
        set quantity_received =
            quantity_received + received_quantity
        where id = purchase_order_item_row.id
          and company_id = target_company_id;

        update public.branch_stock
        set
            quantity = quantity + received_quantity,
            updated_at = now()
        where company_id = target_company_id
          and branch_id = purchase_order_row.branch_id
          and inventory_item_id =
              purchase_order_item_row.inventory_item_id;

        if not found then
            insert into public.branch_stock (
                company_id,
                branch_id,
                inventory_item_id,
                quantity
            )
            values (
                target_company_id,
                purchase_order_row.branch_id,
                purchase_order_item_row.inventory_item_id,
                received_quantity
            );
        end if;

        insert into public.stock_movement (
            company_id,
            branch_id,
            inventory_item_id,
            user_id,
            movement_type,
            quantity,
            reference,
            notes
        )
        values (
            target_company_id,
            purchase_order_row.branch_id,
            purchase_order_item_row.inventory_item_id,
            current_user_id,
            'stock_in',
            received_quantity,
            receipt_row.receipt_number,
            'Received against purchase order '
                || purchase_order_row.purchase_order_number
        );
    end loop;

    select
        coalesce(
            bool_and(
                quantity_received >= quantity_ordered
            ),
            false
        ),
        coalesce(
            bool_or(
                quantity_received > 0
            ),
            false
        )
    into
        all_received,
        any_received
    from public.purchase_order_item
    where purchase_order_id =
        target_purchase_order_id
      and company_id =
        target_company_id;

    update public.purchase_order
    set status =
        case
            when all_received then 'received'
            when any_received then 'partially_received'
            else 'approved'
        end
    where id = target_purchase_order_id
      and company_id = target_company_id;

    return jsonb_build_object(
        'receipt_id',
        receipt_row.id,
        'receipt_number',
        receipt_row.receipt_number,
        'purchase_order_id',
        target_purchase_order_id,
        'status',
        case
            when all_received then 'received'
            when any_received then 'partially_received'
            else 'approved'
        end
    );
end;
$$;

revoke all
on function public.receive_purchase_order(
    uuid,
    uuid,
    text,
    text,
    jsonb
)
from public;

grant execute
on function public.receive_purchase_order(
    uuid,
    uuid,
    text,
    text,
    jsonb
)
to authenticated;

-- ============================================================
-- END TRANSACTIONAL GOODS RECEIVING
-- ============================================================
