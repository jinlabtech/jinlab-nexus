-- ============================================================
-- JINLAB Nexus
-- Sprint 16.1 - Purchasing Foundation
-- PART 1: Core purchasing tables
-- ============================================================

create table if not exists public.purchase_order (
    id uuid primary key default gen_random_uuid(),

    company_id uuid not null
        references public.company(id)
        on delete cascade,

    supplier_id uuid not null
        references public.supplier(id)
        on delete restrict,

    branch_id uuid not null
        references public.branch(id)
        on delete restrict,

    created_by uuid
        references auth.users(id)
        on delete set null,

    purchase_order_number text not null,

    status text not null default 'draft'
        check (
            status in (
                'draft',
                'submitted',
                'approved',
                'partially_received',
                'received',
                'cancelled'
            )
        ),

    order_date date not null default current_date,
    expected_date date,
    supplier_reference text,
    notes text,

    subtotal numeric(14,2) not null default 0
        check (subtotal >= 0),

    tax_amount numeric(14,2) not null default 0
        check (tax_amount >= 0),

    total_amount numeric(14,2) not null default 0
        check (total_amount >= 0),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (company_id, purchase_order_number)
);

create table if not exists public.purchase_order_item (
    id uuid primary key default gen_random_uuid(),

    purchase_order_id uuid not null
        references public.purchase_order(id)
        on delete cascade,

    company_id uuid not null
        references public.company(id)
        on delete cascade,

    inventory_item_id uuid not null
        references public.inventory_item(id)
        on delete restrict,

    quantity_ordered integer not null
        check (quantity_ordered > 0),

    quantity_received integer not null default 0
        check (quantity_received >= 0),

    unit_cost numeric(14,2) not null
        check (unit_cost >= 0),

    tax_rate numeric(6,3) not null default 0
        check (tax_rate >= 0 and tax_rate <= 100),

    line_subtotal numeric(14,2) not null default 0
        check (line_subtotal >= 0),

    line_tax numeric(14,2) not null default 0
        check (line_tax >= 0),

    line_total numeric(14,2) not null default 0
        check (line_total >= 0),

    created_at timestamptz not null default now(),

    unique (purchase_order_id, inventory_item_id),

    check (quantity_received <= quantity_ordered)
);

create table if not exists public.purchase_receipt (
    id uuid primary key default gen_random_uuid(),

    company_id uuid not null
        references public.company(id)
        on delete cascade,

    purchase_order_id uuid not null
        references public.purchase_order(id)
        on delete restrict,

    branch_id uuid not null
        references public.branch(id)
        on delete restrict,

    received_by uuid
        references auth.users(id)
        on delete set null,

    receipt_number text not null,
    supplier_delivery_reference text,
    notes text,

    received_at timestamptz not null default now(),
    created_at timestamptz not null default now(),

    unique (company_id, receipt_number)
);

create table if not exists public.purchase_receipt_item (
    id uuid primary key default gen_random_uuid(),

    purchase_receipt_id uuid not null
        references public.purchase_receipt(id)
        on delete cascade,

    purchase_order_item_id uuid not null
        references public.purchase_order_item(id)
        on delete restrict,

    company_id uuid not null
        references public.company(id)
        on delete cascade,

    inventory_item_id uuid not null
        references public.inventory_item(id)
        on delete restrict,

    quantity_received integer not null
        check (quantity_received > 0),

    unit_cost numeric(14,2) not null
        check (unit_cost >= 0),

    created_at timestamptz not null default now()
);

-- ===========================================================
-- JINLAB Nexus
-- Sprint 16.1 - Purchasing Foundation
-- PART 2: Indexes, totals, numbering, RLS and RBAC
-- ============================================================


-- ============================================================
-- 5. INDEXES
-- ============================================================

create index if not exists purchase_order_company_idx
    on public.purchase_order(company_id);

create index if not exists purchase_order_supplier_idx
    on public.purchase_order(supplier_id);

create index if not exists purchase_order_branch_idx
    on public.purchase_order(branch_id);

create index if not exists purchase_order_status_idx
    on public.purchase_order(status);

create index if not exists purchase_order_date_idx
    on public.purchase_order(order_date desc);

create index if not exists purchase_order_item_po_idx
    on public.purchase_order_item(purchase_order_id);

create index if not exists purchase_order_item_company_idx
    on public.purchase_order_item(company_id);

create index if not exists purchase_order_item_inventory_idx
    on public.purchase_order_item(inventory_item_id);

create index if not exists purchase_receipt_company_idx
    on public.purchase_receipt(company_id);

create index if not exists purchase_receipt_po_idx
    on public.purchase_receipt(purchase_order_id);

create index if not exists purchase_receipt_branch_idx
    on public.purchase_receipt(branch_id);

create index if not exists purchase_receipt_item_receipt_idx
    on public.purchase_receipt_item(purchase_receipt_id);

create index if not exists purchase_receipt_item_po_item_idx
    on public.purchase_receipt_item(purchase_order_item_id);

create index if not exists purchase_receipt_item_inventory_idx
    on public.purchase_receipt_item(inventory_item_id);


-- ===========================================================
-- 6. UPDATED_AT TRIGGER
-- ============================================================

drop trigger if exists purchase_order_set_updated_at
on public.purchase_order;

create trigger purchase_order_set_updated_at
before update on public.purchase_order
for each row
execute function public.set_updated_at();


-- ============================================================
-- 7. PURCHASE ORDERINE TOTALS
-- ===========================================================

create or replace function public.calculate_purchase_order_item_totals()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.line_subtotal :=
        round(
            new.quantity_ordered * new.unit_cost,
            2
        );

    new.line_tax :=
        round(
            new.line_subtotal *
            (new.tax_rate / 100),
            2
        );

    new.line_total :=
        new.line_subtotal +
        new.line_tax;

    return new;
end;
$$;

drop trigger if exists purchase_order_item_calculate_totals
on public.purchase_order_item;

create trigger purchase_order_item_calculate_totals
before insert or update
on public.purchase_order_item
for each row
execute function public.calculate_purchase_order_item_totals();


-- ============================================================
-- 8. PURCHASE ORDER HEADER TOTALS

create or replace function public.recalculate_purchase_order_totals(
    target_purchase_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    calculated_subtotal numeric(14,2);
    calculated_tax numeric(14,2);
    calculated_total numeric(14,2);
begin
    select
        coalesce(sum(line_subtotal), 0),
        coalesce(sum(line_tax), 0),
        coalesce(sum(line_total), 0)
    into
        calculated_subtotal,
        calculated_tax,
        calculated_total
    from public.purchase_order_item
    where purchase_order_id =
        target_purchase_order_id;

    update public.purchase_order
    set
        subtotal = calculated_subtotal,
        tax_amount = calculated_tax,
        total_amount = calculated_total,
        updated_at = now()
    where id =
        target_purchase_order_id;
end;
$$;

create or replace function public.purchase_order_item_recalculate_parent()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if tg_op = 'DELETE' then
        perform public.recalculate_purchase_order_totals(
            old.purchase_order_id
        );
        return old;
    end if;

    perform public.recalculate_purchase_order_totals(
        new.purchase_order_id
    );

    if tg_op = 'UPDATE'
       and old.purchase_order_id is distinct from new.purchase_order_id then
        perform public.recalculate_purchase_order_totals(
            old.purchase_order_id
        );
    end if;

    return new;
end;
$$;

drop trigger if exists purchase_order_item_recalculate_after_change
on public.purchase_order_item;

create trigger purchase_order_item_recalculate_after_change
after insert or update or delete
on public.purchase_order_item
for each row
execute function public.purchase_order_item_recalculate_parent();


-- ===========================================================
-- 9. PURCHASE ORDER NUMBER GENERATOR
-- ============================================================

create or replace function public.generate_purchase_order_number(
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
    perform pg_advisory_xact_lock(
        hashtextextended(
            'jinlab-po-' || target_company_id::text,
            0
        )
    );

    select count(*) + 1
    into next_number
    from public.purchase_order
    where company_id =
        target_company_id;

    return
        'PO-' ||
        to_char(current_date, 'YYYYMM') ||
        '-' ||
        lpad(next_number::text, 5, '0');
end;
$$;


-- ===========================================================
-- 10. GOODS RECEIPT NUMBER GENERATOR
-- ============================================================

create or replace function public.generate_purchase_receipt_number(
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
    perform pg_advisory_xact_lock(
        hashtextextended(
            'jinlab-grn-' || target_company_id::text,
            0
        )
    );

    select count(*) + 1
    into next_number
    from public.purchase_receipt
    where company_id =
        target_company_id;

    return
        'GRN-' ||
        to_char(current_date, 'YYYYMM') ||
        '-' ||
        lpad(next_number::text, 5, '0');
end;
$$;

-- ===========================================================
-- 11. ENABLE ROW LEVEL SECURITY
-- ===========================================================

alter table public.purchase_order
enable row level security;

alter table public.purchase_order_item
enable row level security;

alter table public.purchase_receipt
enable row level security;

alter table public.purchase_receipt_item
enable row level security;


-- ===========================================================
-- 12. PURCHASE ORDER RLS
-- ============================================================

create policy "Users can view company purchase orders"
on public.purchase_order
for select
to authenticated
using (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);

create policy "Users can create company purchase orders"
on public.purchase_order
for insert
to authenticated
with check (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
    and (
        created_by is null
        or created_by = auth.uid()
    )
);

create policy "Users can update company purchase orders"
on public.purchase_order
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

create policy "Users can delete draft company purchase orders"
on public.purchase_order
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


-- ============================================================
-- 13. PURCHASE ORDER ITEM RLS
-- ============================================================

-- RLS for purchase_order_item created in final migration.

-- ===========================================================
-- 14. PURCHASE RECEIPT RLS
-- ============================================================

-- RLS for purchase_receipt and purchase_receipt_item created in final migration.

-- ============================================================

-- ============================================================
-- 13. PURCHASE ORDER ITEM RLS
-- =============================================================

create policy "Users can view company purchase order items"
on public.purchase_order_item
for select
to authenticated
using (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);

create policy "Users can create company purchase order items"
on public.purchase_order_item
for insert
to authenticated
with check (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);

create policy "Users can update company purchase order items"
on public.purchase_order_item
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

create policy "Users can delete company purchase order items"
on public.purchase_order_item
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
-- 14. PURCHASE RECEIPT RLS
-- =============================================================

create policy "Users can view company purchase receipts"
on public.purchase_receipt
for select
to authenticated
using (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);

create policy "Users can create company purchase receipts"
on public.purchase_receipt
for insert
to authenticated
with check (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
    and (
        received_by is null
        or received_by = auth.uid()
    )
);


-- =============================================================
-- 15. PURCHASE RECEIPT ITEM RLS
-- ==============================================================

create policy "Users can view company purchase receipt items"
on public.purchase_receipt_item
for select
to authenticated
using (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);

create policy "Users can create company purchase receipt items"
on public.purchase_receipt_item
for insert
to authenticated
with check (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);

-- 15. PURCHASING RBAC PERMISSIONS
-- ============================================================

insert into public.permissions (permission_name)
values
    ('purchasing.view'),
    ('purchasing.create'),
    ('purchasing.update'),
    ('purchasing.delete'),
    ('purchasing.submit'),
    ('purchasing.approve'),
    ('purchasing.receive')
on conflict (permission_name)
do nothing;

-- OWNER
insert into public.role_permissions (role_id, permission_id)
select
    r.id,
    p.id
from public.roles r
cross join public.permissions p
where r.role_name = 'owner'
  and p.permission_name like 'purchasing.%'
on conflict (role_id, permission_id) do nothing;

-- ADMIN
insert into public.role_permissions (role_id, permission_id)
select
    r.id,
    p.id
from public.roles r
join public.permissions p
    on p.permission_name in (
        'purchasing.view',
        'purchasing.create',
        'purchasing.update',
        'purchasing.delete',
        'purchasing.submit',
        'purchasing.approve',
        'purchasing.receive'
    )
where r.role_name = 'admin'
on conflict (role_id, permission_id) do nothing;

-- MANAGER
insert into public.role_permissions (role_id, permission_id)
select
    r.id,
    p.id
from public.roles r
join public.permissions p
    on p.permission_name in (
        'purchasing.view',
        'purchasing.create',
        'purchasing.update',
        'purchasing.submit',
        'purchasing.receive'
    )
where r.role_name = 'manager'
on conflict (role_id, permission_id) do nothing;

-- READ-ONLY ROLES
insert into public.role_permissions (
    role_id,
    permission_id
)
select
    r.id,
    p.id
from public.roles r
join public.permissions p
    on p.permission_name = 'purchasing.view'
where r.role_name in (
    'employee',
    'technician',
    'cashier',
    'viewer'
)
on conflict (
    role_id,
    permission_id
)
do nothing;


-- ============================================================
-- END PURCHASE ORDER FOUNDATION
-- ============================================================
