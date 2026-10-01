-- ============================================================
-- JINLAB Nexus
-- Sprint 20.9 - Thermal POS receipts and print audit
-- ============================================================

create table if not exists public.pos_receipt_print_event (
    id uuid primary key default gen_random_uuid(),

    company_id uuid not null
        references public.company(id)
        on delete cascade,

    pos_sale_id uuid not null
        references public.pos_sale(id)
        on delete cascade,

    printed_by uuid
        references auth.users(id)
        on delete set null,

    print_type text not null
        check (
            print_type in (
                'initial',
                'reprint'
            )
        ),

    metadata jsonb not null
        default '{}'::jsonb,

    printed_at timestamptz not null
        default now()
);
create index if not exists
pos_receipt_print_event_company_idx
on public.pos_receipt_print_event(company_id);
create index if not exists
pos_receipt_print_event_sale_idx
on public.pos_receipt_print_event(pos_sale_id);
create index if not exists
pos_receipt_print_event_printed_at_idx
on public.pos_receipt_print_event(printed_at desc);
alter table public.pos_receipt_print_event
enable row level security;
revoke all
on public.pos_receipt_print_event
from anon, authenticated;
-- ============================================================
-- Secure receipt workspace
-- ============================================================

create or replace function public.get_pos_receipt(
    p_pos_sale_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_company_id uuid;
    v_sale public.pos_sale%rowtype;
    v_invoice public.invoice%rowtype;

    v_automatic_savings numeric := 0;
    v_print_count integer := 0;
begin

    if auth.uid() is null then
        raise exception 'Authentication required.';
    end if;

    if not public.current_user_has_permission('pos.view') then
        raise exception 'Permission denied: pos.view';
    end if;


    v_company_id :=
        public.current_company_id();


    select *
    into v_sale
    from public.pos_sale
    where id = p_pos_sale_id
      and company_id = v_company_id;


    if not found then
        raise exception 'POS sale could not be found.';
    end if;


    select *
    into v_invoice
    from public.invoice
    where id = v_sale.invoice_id
      and company_id = v_company_id;


    if not found then
        raise exception 'POS invoice could not be found.';
    end if;


    select
        coalesce(
            sum(
                greatest(
                    (
                        psi.catalogue_unit_price
                        -
                        coalesce(
                            psi.automatic_unit_price,
                            psi.invoice_unit_price
                        )
                    )
                    *
                    psi.quantity,
                    0
                )
            ),
            0
        )
    into v_automatic_savings
    from public.pos_sale_item psi
    where psi.pos_sale_id = v_sale.id
      and psi.company_id = v_company_id;


    select count(*)
    into v_print_count
    from public.pos_receipt_print_event
    where company_id = v_company_id
      and pos_sale_id = v_sale.id;


    return jsonb_build_object(

        'ok',
        true,

        'receipt_options',
        coalesce(
            (
                select cps.receipt_options
                from public.company_pos_settings cps
                where cps.company_id = v_company_id
            ),
            jsonb_build_object(
                'paper_size',
                '80mm',
                'auto_print',
                false,
                'show_cashier',
                true,
                'show_branch',
                true
            )
        ),

        'company',
        (
            select jsonb_build_object(
                'id',
                c.id,

                'name',
                c.company_name,

                'trading_name',
                c.trading_name,

                'registration_number',
                c.registration_number,

                'vat_registered',
                c.vat_registered,

                'vat_number',
                c.vat_number,

                'phone',
                c.phone,

                'email',
                c.email,

                'website',
                c.website,

                'address',
                coalesce(
                    c.physical_address,
                    c.address
                ),

                'footer',
                c.document_footer
            )
            from public.company c
            where c.id = v_company_id
        ),

        'branch',
        (
            select jsonb_build_object(
                'id',
                b.id,

                'name',
                b.branch_name,

                'address',
                b.address
            )
            from public.branch b
            where b.id = v_sale.branch_id
              and b.company_id = v_company_id
        ),

        'customer',
        (
            select jsonb_build_object(
                'id',
                c.id,

                'name',
                c.customer_name,

                'number',
                c.customer_number,

                'phone',
                c.phone,

                'vat_number',
                c.vat_number
            )
            from public.customer c
            where c.id = v_sale.customer_id
              and c.company_id = v_company_id
        ),

        'cashier',
        (
            select jsonb_build_object(
                'user_id',
                up.user_id,

                'name',
                up.full_name,

                'email',
                up.email
            )
            from public.user_profile up
            where up.user_id = v_sale.cashier_user_id
              and up.company_id = v_company_id
            limit 1
        ),

        'finance',
        coalesce(
            (
                select jsonb_build_object(
                    'currency',
                    coalesce(
                        cfs.base_currency,
                        'ZAR'
                    ),

                    'vat_registered',
                    coalesce(
                        cfs.vat_registered,
                        false
                    ),

                    'vat_rate',
                    coalesce(
                        cfs.default_vat_rate,
                        0
                    ),

                    'prices_include_vat',
                    coalesce(
                        cfs.prices_include_vat,
                        false
                    )
                )
                from public.company_finance_settings cfs
                where cfs.company_id = v_company_id
            ),
            jsonb_build_object(
                'currency',
                'ZAR',
                'vat_registered',
                false,
                'vat_rate',
                0,
                'prices_include_vat',
                false
            )
        ),

        'sale',
        jsonb_build_object(
            'id',
            v_sale.id,

            'sale_number',
            v_sale.sale_number,

            'invoice_id',
            v_sale.invoice_id,

            'payment_method',
            v_sale.payment_method,

            'amount_tendered',
            v_sale.amount_tendered,

            'total',
            v_sale.total_amount,

            'change_due',
            v_sale.change_due,

            'reference',
            v_sale.reference,

            'status',
            v_sale.status,

            'created_at',
            v_sale.created_at
        ),

        'invoice',
        jsonb_build_object(
            'id',
            v_invoice.id,

            'number',
            v_invoice.invoice_number,

            'subtotal',
            v_invoice.subtotal,

            'discount',
            v_invoice.discount_amount,

            'tax',
            v_invoice.tax_amount,

            'total',
            v_invoice.total_amount,

            'amount_paid',
            v_invoice.amount_paid,

            'balance_due',
            v_invoice.balance_due
        ),

        'items',
        coalesce(
            (
                select jsonb_agg(
                    jsonb_build_object(
                        'id',
                        psi.id,

                        'description',
                        psi.description,

                        'quantity',
                        psi.quantity,

                        'catalogue_unit_price',
                        psi.catalogue_unit_price,

                        'automatic_unit_price',
                        psi.automatic_unit_price,

                        'unit_price',
                        psi.invoice_unit_price,

                        'discount_mode',
                        psi.discount_mode,

                        'discount_value',
                        psi.discount_value,

                        'line_total',
                        psi.line_total,

                        'price_source',
                        psi.price_source,

                        'price_book_name',
                        psi.price_book_name,

                        'promotion_name',
                        psi.promotion_name,

                        'tax_rate',
                        ii.tax_rate,

                        'line_tax',
                        ii.line_tax
                    )
                    order by psi.created_at
                )
                from public.pos_sale_item psi

                left join public.invoice_item ii
                    on ii.id =
                       psi.invoice_item_id

                where psi.pos_sale_id =
                      v_sale.id

                  and psi.company_id =
                      v_company_id
            ),
            '[]'::jsonb
        ),

        'tenders',
        case
            when exists (
                select 1
                from public.pos_sale_tender pst
                where pst.pos_sale_id =
                      v_sale.id
                  and pst.company_id =
                      v_company_id
            )
            then (
                select jsonb_agg(
                    jsonb_build_object(
                        'id',
                        pst.id,

                        'payment_method',
                        pst.payment_method,

                        'amount',
                        pst.amount,

                        'amount_tendered',
                        pst.amount_tendered,

                        'change_due',
                        pst.change_due,

                        'reference',
                        pst.reference
                    )
                    order by pst.created_at
                )
                from public.pos_sale_tender pst
                where pst.pos_sale_id =
                      v_sale.id
                  and pst.company_id =
                      v_company_id
            )

            else
                jsonb_build_array(
                    jsonb_build_object(
                        'payment_method',
                        v_sale.payment_method,

                        'amount',
                        v_sale.total_amount,

                        'amount_tendered',
                        v_sale.amount_tendered,

                        'change_due',
                        v_sale.change_due,

                        'reference',
                        v_sale.reference
                    )
                )
        end,

        'automatic_savings',
        round(
            v_automatic_savings,
            2
        ),

        'manual_discount',
        round(
            coalesce(
                v_invoice.discount_amount,
                0
            ),
            2
        ),

        'total_savings',
        round(
            v_automatic_savings
            +
            coalesce(
                v_invoice.discount_amount,
                0
            ),
            2
        ),

        'print_count',
        v_print_count
    );
end;
$$;
-- ============================================================
-- Secure print / reprint recorder
-- ============================================================

create or replace function public.record_pos_receipt_print(
    p_pos_sale_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_company_id uuid;
    v_sale public.pos_sale%rowtype;

    v_previous_prints integer := 0;
    v_print_type text;
    v_event_id uuid;
begin

    if auth.uid() is null then
        raise exception 'Authentication required.';
    end if;


    if not public.current_user_has_permission(
        'pos.view'
    ) then
        raise exception
            'Permission denied: pos.view';
    end if;


    v_company_id :=
        public.current_company_id();


    select *
    into v_sale
    from public.pos_sale
    where id = p_pos_sale_id
      and company_id = v_company_id;


    if not found then
        raise exception
            'POS sale could not be found.';
    end if;


    select count(*)
    into v_previous_prints
    from public.pos_receipt_print_event
    where company_id = v_company_id
      and pos_sale_id = v_sale.id;


    if v_previous_prints = 0 then

        v_print_type :=
            'initial';

    else

        v_print_type :=
            'reprint';

    end if;


    insert into public.pos_receipt_print_event (
        company_id,
        pos_sale_id,
        printed_by,
        print_type,
        metadata
    )
    values (
        v_company_id,
        v_sale.id,
        auth.uid(),
        v_print_type,
        jsonb_build_object(
            'sale_number',
            v_sale.sale_number,

            'previous_print_count',
            v_previous_prints
        )
    )
    returning id
    into v_event_id;


    if v_print_type = 'reprint' then

        insert into public.audit_log (
            company_id,
            user_id,
            action,
            module,
            record_id,
            description,
            metadata
        )
        values (
            v_company_id,
            auth.uid(),
            'pos_receipt_reprint',
            'pos',
            v_sale.id,
            'POS receipt reprinted',
            jsonb_build_object(
                'sale_number',
                v_sale.sale_number,

                'print_number',
                v_previous_prints + 1,

                'print_event_id',
                v_event_id
            )
        );

    end if;


    return jsonb_build_object(
        'ok',
        true,

        'print_type',
        v_print_type,

        'print_count',
        v_previous_prints + 1,

        'event_id',
        v_event_id
    );
end;
$$;
revoke execute
on function public.get_pos_receipt(uuid)
from public, anon;
grant execute
on function public.get_pos_receipt(uuid)
to authenticated;
revoke execute
on function public.record_pos_receipt_print(uuid)
from public, anon;
grant execute
on function public.record_pos_receipt_print(uuid)
to authenticated;
