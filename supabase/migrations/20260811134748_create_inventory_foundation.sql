-- ============================================================
-- JINLAB Nexus
-- Sprint 15.1 - Inventory Management Foundation
-- ============================================================


-- ============================================================
-- 1. INVENTORY CATEGORIES
-- ============================================================

create table if not exists public.inventory_category (
    id uuid primary key default gen_random_uuid(),

    company_id uuid not null
        references public.company(id)
        on delete cascade,

    category_name text not null,

    description text,

    created_at timestamptz not null default now(),

    unique (company_id, category_name)
);


-- ============================================================
-- 2. SUPPLIERS
-- ============================================================

create table if not exists public.supplier (
    id uuid primary key default gen_random_uuid(),

    company_id uuid not null
        references public.company(id)
        on delete cascade,

    supplier_name text not null,

    contact_person text,

    email text,

    phone text,

    address text,

    created_at timestamptz not null default now(),

    unique (company_id, supplier_name)
);


-- ============================================================
-- 3. INVENTORY ITEMS
-- ============================================================

create table if not exists public.inventory_item (
    id uuid primary key default gen_random_uuid(),

    company_id uuid not null
        references public.company(id)
        on delete cascade,

    category_id uuid
        references public.inventory_category(id)
        on delete set null,

    supplier_id uuid
        references public.supplier(id)
        on delete set null,

    item_name text not null,

    sku text not null,

    barcode text,

    description text,

    cost_price numeric(12,2) not null default 0
        check (cost_price >= 0),

    selling_price numeric(12,2) not null default 0
        check (selling_price >= 0),

    minimum_stock integer not null default 0
        check (minimum_stock >= 0),

    is_active boolean not null default true,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    unique (company_id, sku)
);


-- ============================================================
-- 4. BRANCH STOCK
-- ============================================================

create table if not exists public.branch_stock (
    id uuid primary key default gen_random_uuid(),

    company_id uuid not null
        references public.company(id)
        on delete cascade,

    branch_id uuid not null
        references public.branch(id)
        on delete cascade,

    inventory_item_id uuid not null
        references public.inventory_item(id)
        on delete cascade,

    quantity integer not null default 0
        check (quantity >= 0),

    updated_at timestamptz not null default now(),

    unique (branch_id, inventory_item_id)
);


-- ============================================================
-- 5. STOCK MOVEMENTS
-- ============================================================

create table if not exists public.stock_movement (
    id uuid primary key default gen_random_uuid(),

    company_id uuid not null
        references public.company(id)
        on delete cascade,

    branch_id uuid not null
        references public.branch(id)
        on delete cascade,

    inventory_item_id uuid not null
        references public.inventory_item(id)
        on delete cascade,

    user_id uuid
        references auth.users(id)
        on delete set null,

    movement_type text not null
        check (
            movement_type in (
                'stock_in',
                'stock_out',
                'adjustment_in',
                'adjustment_out',
                'transfer_in',
                'transfer_out',
                'sale',
                'repair_usage',
                'return'
            )
        ),

    quantity integer not null
        check (quantity > 0),

    reference text,

    notes text,

    created_at timestamptz not null default now()
);


-- ============================================================
-- 6. INDEXES
-- ============================================================

create index if not exists inventory_category_company_idx
    on public.inventory_category(company_id);

create index if not exists supplier_company_idx
    on public.supplier(company_id);

create index if not exists inventory_item_company_idx
    on public.inventory_item(company_id);

create index if not exists inventory_item_category_idx
    on public.inventory_item(category_id);

create index if not exists inventory_item_supplier_idx
    on public.inventory_item(supplier_id);

create index if not exists inventory_item_sku_idx
    on public.inventory_item(sku);

create index if not exists inventory_item_barcode_idx
    on public.inventory_item(barcode);

create index if not exists branch_stock_company_idx
    on public.branch_stock(company_id);

create index if not exists branch_stock_branch_idx
    on public.branch_stock(branch_id);

create index if not exists branch_stock_item_idx
    on public.branch_stock(inventory_item_id);

create index if not exists stock_movement_company_idx
    on public.stock_movement(company_id);

create index if not exists stock_movement_branch_idx
    on public.stock_movement(branch_id);

create index if not exists stock_movement_item_idx
    on public.stock_movement(inventory_item_id);

create index if not exists stock_movement_created_idx
    on public.stock_movement(created_at desc);


-- ============================================================
-- 7. UPDATED_AT FUNCTION
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;


drop trigger if exists inventory_item_set_updated_at
on public.inventory_item;

create trigger inventory_item_set_updated_at
before update on public.inventory_item
for each row
execute function public.set_updated_at();


drop trigger if exists branch_stock_set_updated_at
on public.branch_stock;

create trigger branch_stock_set_updated_at
before update on public.branch_stock
for each row
execute function public.set_updated_at();


-- ============================================================
-- 8. ENABLE ROW LEVEL SECURITY
-- ============================================================

alter table public.inventory_category
enable row level security;

alter table public.supplier
enable row level security;

alter table public.inventory_item
enable row level security;

alter table public.branch_stock
enable row level security;

alter table public.stock_movement
enable row level security;


-- ============================================================
-- 9. INVENTORY CATEGORY RLS
-- ============================================================

create policy "Users can view company inventory categories"
on public.inventory_category
for select
to authenticated
using (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);

create policy "Users can create company inventory categories"
on public.inventory_category
for insert
to authenticated
with check (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);

create policy "Users can update company inventory categories"
on public.inventory_category
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

create policy "Users can delete company inventory categories"
on public.inventory_category
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
-- 10. SUPPLIER RLS
-- ============================================================

create policy "Users can view company suppliers"
on public.supplier
for select
to authenticated
using (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);

create policy "Users can create company suppliers"
on public.supplier
for insert
to authenticated
with check (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);

create policy "Users can update company suppliers"
on public.supplier
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

create policy "Users can delete company suppliers"
on public.supplier
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
-- 11. INVENTORY ITEM RLS
-- ============================================================

create policy "Users can view company inventory items"
on public.inventory_item
for select
to authenticated
using (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);

create policy "Users can create company inventory items"
on public.inventory_item
for insert
to authenticated
with check (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);

create policy "Users can update company inventory items"
on public.inventory_item
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

create policy "Users can delete company inventory items"
on public.inventory_item
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
-- 12. BRANCH STOCK RLS
-- ============================================================

create policy "Users can view company branch stock"
on public.branch_stock
for select
to authenticated
using (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);

create policy "Users can create company branch stock"
on public.branch_stock
for insert
to authenticated
with check (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);

create policy "Users can update company branch stock"
on public.branch_stock
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


-- ============================================================
-- 13. STOCK MOVEMENT RLS
-- ============================================================

create policy "Users can view company stock movements"
on public.stock_movement
for select
to authenticated
using (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);

create policy "Users can create company stock movements"
on public.stock_movement
for insert
to authenticated
with check (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
    and (
        user_id is null
        or user_id = auth.uid()
    )
);


-- ============================================================
-- 14. INVENTORY PERMISSIONS
-- ============================================================

insert into public.permissions (permission_name)
values
    ('inventory.view'),
    ('inventory.create'),
    ('inventory.update'),
    ('inventory.delete'),
    ('inventory.stock.adjust'),
    ('supplier.view'),
    ('supplier.create'),
    ('supplier.update'),
    ('supplier.delete')
on conflict (permission_name) do nothing;


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
where r.role_name = 'owner'
  and (
      p.permission_name like 'inventory.%'
      or p.permission_name like 'supplier.%'
  )
on conflict (role_id, permission_id) do nothing;


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
        'inventory.view',
        'inventory.create',
        'inventory.update',
        'inventory.delete',
        'inventory.stock.adjust',
        'supplier.view',
        'supplier.create',
        'supplier.update',
        'supplier.delete'
    )
where r.role_name = 'admin'
on conflict (role_id, permission_id) do nothing;


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
        'inventory.view',
        'inventory.create',
        'inventory.update',
        'inventory.stock.adjust',
        'supplier.view',
        'supplier.create',
        'supplier.update'
    )
where r.role_name = 'manager'
on conflict (role_id, permission_id) do nothing;


-- TECHNICIAN

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
        'inventory.view',
        'inventory.stock.adjust',
        'supplier.view'
    )
where r.role_name = 'technician'
on conflict (role_id, permission_id) do nothing;


-- CASHIER

insert into public.role_permissions (
    role_id,
    permission_id
)
select
    r.id,
    p.id
from public.roles r
join public.permissions p
    on p.permission_name = 'inventory.view'
where r.role_name = 'cashier'
on conflict (role_id, permission_id) do nothing;


-- EMPLOYEE

insert into public.role_permissions (
    role_id,
    permission_id
)
select
    r.id,
    p.id
from public.roles r
join public.permissions p
    on p.permission_name = 'inventory.view'
where r.role_name = 'employee'
on conflict (role_id, permission_id) do nothing;


-- VIEWER

insert into public.role_permissions (
    role_id,
    permission_id
)
select
    r.id,
    p.id
from public.roles r
join public.permissions p
    on p.permission_name = 'inventory.view'
where r.role_name = 'viewer'
on conflict (role_id, permission_id) do nothing;


-- ============================================================
-- END INVENTORY FOUNDATION
-- ============================================================
