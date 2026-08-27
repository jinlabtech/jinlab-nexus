
-- ============================================================
-- SHARED RLS HELPER
-- ============================================================

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select company_id
    from public.user_profile
    where user_id = auth.uid()
    limit 1;
$$;

grant execute
on function public.current_company_id()
to authenticated;


-- ============================================================
-- JINLAB Nexus
-- Sales Order Foundation
-- Sprint 18.1
-- ============================================================

---------------------------------------------------------------
-- SALES ORDER
---------------------------------------------------------------

create table if not exists public.sales_order (

    id uuid primary key default gen_random_uuid(),

    company_id uuid not null
        references public.company(id) on delete cascade,

    branch_id uuid not null
        references public.branch(id),

    customer_id uuid not null
        references public.customer(id),

    quotation_id uuid
        references public.quotation(id),

    sales_order_number text not null unique,

    status text not null default 'draft'
    check (
        status in (
            'draft',
            'confirmed',
            'delivered',
            'invoiced',
            'cancelled'
        )
    ),

    order_date date not null default current_date,

    expected_delivery date,

    notes text,

    subtotal numeric(14,2) default 0,
    discount_amount numeric(14,2) default 0,
    tax_amount numeric(14,2) default 0,
    total_amount numeric(14,2) default 0,

    created_by uuid
        references auth.users(id),

    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

---------------------------------------------------------------
-- SALES ORDER ITEM
---------------------------------------------------------------

create table if not exists public.sales_order_item (

    id uuid primary key default gen_random_uuid(),

    sales_order_id uuid not null
        references public.sales_order(id)
        on delete cascade,

    inventory_item_id uuid
        references public.inventory_item(id),

    description text not null,

    quantity numeric(14,3) not null,

    unit_price numeric(14,2) not null,

    discount_mode text default 'percentage',

    discount_value numeric(14,2) default 0,

    tax_mode text default 'none',

    tax_rate numeric(5,2) default 0,

    line_subtotal numeric(14,2) default 0,

    line_discount numeric(14,2) default 0,

    line_tax numeric(14,2) default 0,

    line_total numeric(14,2) default 0,

    created_at timestamptz default now()
);

create index if not exists idx_sales_order_company
on public.sales_order(company_id);

create index if not exists idx_sales_order_customer
on public.sales_order(customer_id);

create index if not exists idx_sales_order_item_order
on public.sales_order_item(sales_order_id);


-- ============================================================
-- SALES ORDER NUMBER GENERATOR
-- ============================================================

create or replace function public.generate_sales_order_number(
    target_company_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    next_number integer;
begin

    select
        coalesce(
            max(
                substring(
                    sales_order_number
                    from '[0-9]+$'
                )::integer
            ),
            0
        ) + 1
    into next_number
    from public.sales_order
    where company_id = target_company_id;

    return
        'SO-' ||
        to_char(current_date,'YYYYMM') ||
        '-' ||
        lpad(next_number::text,5,'0');

end;
$$;

-- ============================================================
-- SALES ORDER ITEM TOTALS
-- ============================================================

create or replace function public.calculate_sales_order_item_totals()
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

    if new.discount_mode='percentage' then

        calculated_discount :=
            round(
                new.line_subtotal *
                (new.discount_value/100),
                2
            );

    else

        calculated_discount :=
            least(
                new.discount_value,
                new.line_subtotal
            );

    end if;

    new.line_discount :=
        calculated_discount;

    taxable_amount :=
        new.line_subtotal -
        calculated_discount;

    if new.tax_mode='vat' then

        calculated_tax :=
            round(
                taxable_amount *
                (new.tax_rate/100),
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

    return new;

end;
$$;

drop trigger if exists
sales_order_item_totals_trigger
on public.sales_order_item;

create trigger
sales_order_item_totals_trigger
before insert or update
on public.sales_order_item
for each row
execute function
public.calculate_sales_order_item_totals();


-- ============================================================
-- SALES ORDER TOTALS
-- ============================================================

create or replace function public.refresh_sales_order_totals(
    target_sales_order_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
begin

    update public.sales_order
    set

        subtotal =
            coalesce((
                select sum(line_subtotal)
                from public.sales_order_item
                where sales_order_id = target_sales_order_id
            ),0),

        discount_amount =
            coalesce((
                select sum(line_discount)
                from public.sales_order_item
                where sales_order_id = target_sales_order_id
            ),0),

        tax_amount =
            coalesce((
                select sum(line_tax)
                from public.sales_order_item
                where sales_order_id = target_sales_order_id
            ),0),

        total_amount =
            coalesce((
                select sum(line_total)
                from public.sales_order_item
                where sales_order_id = target_sales_order_id
            ),0),

        updated_at = now()

    where id = target_sales_order_id;

end;
$$;

-- ============================================================
-- TRIGGER
-- ============================================================

create or replace function public.sales_order_totals_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
begin

    if tg_op='DELETE' then

        perform public.refresh_sales_order_totals(
            old.sales_order_id
        );

        return old;

    end if;

    perform public.refresh_sales_order_totals(
        new.sales_order_id
    );

    return new;

end;
$$;

drop trigger if exists
sales_order_refresh_totals
on public.sales_order_item;

create trigger
sales_order_refresh_totals

after insert
or update
or delete

on public.sales_order_item

for each row

execute function
public.sales_order_totals_trigger();


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.sales_order
enable row level security;

alter table public.sales_order_item
enable row level security;

---------------------------------------------------------------
-- SALES ORDER
---------------------------------------------------------------

create policy "Users can view company sales orders"
on public.sales_order
for select
using (
    company_id = public.current_company_id()
);

create policy "Users can create company sales orders"
on public.sales_order
for insert
with check (
    company_id = public.current_company_id()
);

create policy "Users can update company sales orders"
on public.sales_order
for update
using (
    company_id = public.current_company_id()
);

create policy "Users can delete draft company sales orders"
on public.sales_order
for delete
using (
    company_id = public.current_company_id()
    and status='draft'
);

---------------------------------------------------------------
-- SALES ORDER ITEMS
---------------------------------------------------------------

create policy "Users can view company sales order items"
on public.sales_order_item
for select
using (
    exists (
        select 1
        from public.sales_order so
        where so.id = sales_order_item.sales_order_id
        and so.company_id = public.current_company_id()
    )
);

create policy "Users can create company sales order items"
on public.sales_order_item
for insert
with check (
    exists (
        select 1
        from public.sales_order so
        where so.id = sales_order_item.sales_order_id
        and so.company_id = public.current_company_id()
    )
);

create policy "Users can update company sales order items"
on public.sales_order_item
for update
using (
    exists (
        select 1
        from public.sales_order so
        where so.id = sales_order_item.sales_order_id
        and so.company_id = public.current_company_id()
    )
);

create policy "Users can delete company sales order items"
on public.sales_order_item
for delete
using (
    exists (
        select 1
        from public.sales_order so
        where so.id = sales_order_item.sales_order_id
        and so.company_id = public.current_company_id()
    )
);


-- ============================================================
-- PERMISSIONS
-- ============================================================

insert into public.permissions (permission_name)
values
('sales.view'),
('sales.create'),
('sales.update'),
('sales.delete'),
('sales.confirm'),
('sales.invoice')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select
    r.id,
    p.id
from public.roles r
join public.permissions p
on p.permission_name in (
    'sales.view',
    'sales.create',
    'sales.update',
    'sales.delete',
    'sales.confirm',
    'sales.invoice'
)
where r.role_name='owner'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select
    r.id,
    p.id
from public.roles r
join public.permissions p
on p.permission_name in (
    'sales.view',
    'sales.create',
    'sales.update',
    'sales.confirm'
)
where r.role_name='manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select
    r.id,
    p.id
from public.roles r
join public.permissions p
on p.permission_name='sales.view'
where r.role_name='staff'
on conflict do nothing;

