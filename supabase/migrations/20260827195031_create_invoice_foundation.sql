-- ============================================================
-- JINLAB Nexus
-- Sprint 18.6 - Invoice Foundation
-- ============================================================


-- ============================================================
-- 1. INVOICE
-- ============================================================

create table if not exists public.invoice (
    id uuid primary key default gen_random_uuid(),

    company_id uuid not null
        references public.company(id)
        on delete cascade,

    branch_id uuid not null
        references public.branch(id)
        on delete restrict,

    customer_id uuid not null
        references public.customer(id)
        on delete restrict,

    sales_order_id uuid
        references public.sales_order(id)
        on delete restrict,

    quotation_id uuid
        references public.quotation(id)
        on delete restrict,

    invoice_number text not null,

    status text not null default 'draft'
        check (
            status in (
                'draft',
                'issued',
                'partially_paid',
                'paid',
                'overdue',
                'cancelled'
            )
        ),

    invoice_date date not null default current_date,

    due_date date,

    customer_reference text,

    notes text,

    terms text,

    subtotal numeric(14,2) not null default 0
        check (subtotal >= 0),

    discount_amount numeric(14,2) not null default 0
        check (discount_amount >= 0),

    tax_amount numeric(14,2) not null default 0
        check (tax_amount >= 0),

    total_amount numeric(14,2) not null default 0
        check (total_amount >= 0),

    amount_paid numeric(14,2) not null default 0
        check (amount_paid >= 0),

    balance_due numeric(14,2) not null default 0
        check (balance_due >= 0),

    created_by uuid
        references auth.users(id)
        on delete set null,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    unique (
        company_id,
        invoice_number
    )
);


-- ============================================================
-- 2. INVOICE ITEMS
-- ============================================================

create table if not exists public.invoice_item (
    id uuid primary key default gen_random_uuid(),

    invoice_id uuid not null
        references public.invoice(id)
        on delete cascade,

    company_id uuid not null
        references public.company(id)
        on delete cascade,

    inventory_item_id uuid
        references public.inventory_item(id)
        on delete restrict,

    description text not null,

    quantity numeric(14,3) not null
        check (quantity > 0),

    unit_price numeric(14,2) not null
        check (unit_price >= 0),

    discount_mode text not null default 'percentage'
        check (
            discount_mode in (
                'percentage',
                'fixed'
            )
        ),

    discount_value numeric(14,2) not null default 0
        check (discount_value >= 0),

    tax_mode text not null default 'none'
        check (
            tax_mode in (
                'none',
                'vat'
            )
        ),

    tax_rate numeric(6,3) not null default 0
        check (
            tax_rate >= 0
            and tax_rate <= 100
        ),

    line_subtotal numeric(14,2) not null default 0,

    line_discount numeric(14,2) not null default 0,

    line_tax numeric(14,2) not null default 0,

    line_total numeric(14,2) not null default 0,

    created_at timestamptz not null default now()
);


-- ============================================================
-- 3. INDEXES
-- ============================================================

create index if not exists invoice_company_idx
    on public.invoice(company_id);

create index if not exists invoice_customer_idx
    on public.invoice(customer_id);

create index if not exists invoice_sales_order_idx
    on public.invoice(sales_order_id);

create index if not exists invoice_status_idx
    on public.invoice(status);

create index if not exists invoice_date_idx
    on public.invoice(invoice_date desc);

create index if not exists invoice_item_invoice_idx
    on public.invoice_item(invoice_id);

create index if not exists invoice_item_company_idx
    on public.invoice_item(company_id);


-- ============================================================
-- 4. INVOICE NUMBER GENERATOR
-- ============================================================

create or replace function public.generate_invoice_number(
    target_company_id uuid
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
    next_number integer;
begin
    perform pg_advisory_xact_lock(
        hashtextextended(
            'jinlab-invoice-' ||
            target_company_id::text,
            0
        )
    );

    select
        coalesce(
            max(
                substring(
                    invoice_number
                    from '[0-9]+$'
                )::integer
            ),
            0
        ) + 1
    into next_number
    from public.invoice
    where company_id =
        target_company_id;

    return
        'INV-' ||
        to_char(
            current_date,
            'YYYYMM'
        ) ||
        '-' ||
        lpad(
            next_number::text,
            5,
            '0'
        );
end;
$$;


-- ============================================================
-- 5. ITEM CALCULATIONS
-- ============================================================

create or replace function public.calculate_invoice_item_totals()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    calculated_discount numeric(14,2);
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
                'Percentage discount cannot exceed 100%%';
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
        new.line_tax :=
            round(
                taxable_amount *
                (
                    new.tax_rate /
                    100
                ),
                2
            );
    else
        new.line_tax := 0;
        new.tax_rate := 0;
    end if;

    new.line_total :=
        taxable_amount +
        new.line_tax;

    return new;
end;
$$;


drop trigger if exists invoice_item_calculate_totals
on public.invoice_item;

create trigger invoice_item_calculate_totals
before insert or update
on public.invoice_item
for each row
execute function public.calculate_invoice_item_totals();


-- ============================================================
-- 6. HEADER TOTALS
-- ============================================================

create or replace function public.refresh_invoice_totals(
    target_invoice_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
begin
    update public.invoice
    set
        subtotal = coalesce(
            (
                select sum(line_subtotal)
                from public.invoice_item
                where invoice_id =
                    target_invoice_id
            ),
            0
        ),

        discount_amount = coalesce(
            (
                select sum(line_discount)
                from public.invoice_item
                where invoice_id =
                    target_invoice_id
            ),
            0
        ),

        tax_amount = coalesce(
            (
                select sum(line_tax)
                from public.invoice_item
                where invoice_id =
                    target_invoice_id
            ),
            0
        ),

        total_amount = coalesce(
            (
                select sum(line_total)
                from public.invoice_item
                where invoice_id =
                    target_invoice_id
            ),
            0
        ),

        balance_due =
            greatest(
                coalesce(
                    (
                        select sum(line_total)
                        from public.invoice_item
                        where invoice_id =
                            target_invoice_id
                    ),
                    0
                ) -
                amount_paid,
                0
            ),

        updated_at = now()

    where id =
        target_invoice_id;
end;
$$;


create or replace function public.invoice_item_refresh_parent()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if tg_op = 'DELETE' then

        perform public.refresh_invoice_totals(
            old.invoice_id
        );

        return old;
    end if;

    perform public.refresh_invoice_totals(
        new.invoice_id
    );

    return new;
end;
$$;


drop trigger if exists invoice_item_refresh_totals
on public.invoice_item;

create trigger invoice_item_refresh_totals
after insert or update or delete
on public.invoice_item
for each row
execute function public.invoice_item_refresh_parent();


-- ============================================================
-- 7. ROW LEVEL SECURITY
-- No helper dependency: direct user_profile lookup
-- ============================================================

alter table public.invoice
enable row level security;

alter table public.invoice_item
enable row level security;


create policy "Users can view company invoices"
on public.invoice
for select
to authenticated
using (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);


create policy "Users can create company invoices"
on public.invoice
for insert
to authenticated
with check (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);


create policy "Users can update company invoices"
on public.invoice
for update
to authenticated
using (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
)
with check (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);


create policy "Users can delete draft company invoices"
on public.invoice
for delete
to authenticated
using (
    status = 'draft'
    and company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);


create policy "Users can view company invoice items"
on public.invoice_item
for select
to authenticated
using (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);


create policy "Users can create company invoice items"
on public.invoice_item
for insert
to authenticated
with check (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);


create policy "Users can update company invoice items"
on public.invoice_item
for update
to authenticated
using (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
)
with check (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);


create policy "Users can delete company invoice items"
on public.invoice_item
for delete
to authenticated
using (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);


-- ============================================================
-- 8. PERMISSIONS
-- ============================================================

insert into public.permissions (
    permission_name
)
values
    ('invoice.view'),
    ('invoice.create'),
    ('invoice.update'),
    ('invoice.delete'),
    ('invoice.issue'),
    ('invoice.payment')
on conflict (
    permission_name
)
do nothing;


-- OWNER
insert into public.role_permissions (
    role_id,
    permission_id
)
select
    r.id,
    p.id
from public.roles r
cross join public.permissions p
where
    r.role_name = 'owner'
    and p.permission_name like
        'invoice.%'
on conflict (
    role_id,
    permission_id
)
do nothing;


-- ADMIN
insert into public.role_permissions (
    role_id,
    permission_id
)
select
    r.id,
    p.id
from public.roles r
join public.permissions p
    on p.permission_name in (
        'invoice.view',
        'invoice.create',
        'invoice.update',
        'invoice.delete',
        'invoice.issue',
        'invoice.payment'
    )
where r.role_name = 'admin'
on conflict (
    role_id,
    permission_id
)
do nothing;


-- MANAGER
insert into public.role_permissions (
    role_id,
    permission_id
)
select
    r.id,
    p.id
from public.roles r
join public.permissions p
    on p.permission_name in (
        'invoice.view',
        'invoice.create',
        'invoice.update',
        'invoice.issue',
        'invoice.payment'
    )
where r.role_name = 'manager'
on conflict (
    role_id,
    permission_id
)
do nothing;


-- ============================================================
-- END INVOICE FOUNDATION
-- ============================================================
