-- ============================================================
-- JINLAB Nexus
-- Sprint 17.3A - Quotation Foundation
-- ============================================================


-- ============================================================
-- 1. QUOTATION
-- ============================================================

create table if not exists public.quotation (
    id uuid primary key default gen_random_uuid(),

    company_id uuid not null
        references public.company(id)
        on delete cascade,

    customer_id uuid not null
        references public.customer(id)
        on delete restrict,

    branch_id uuid not null
        references public.branch(id)
        on delete restrict,

    created_by uuid
        references auth.users(id)
        on delete set null,

    quotation_number text not null,

    status text not null default 'draft'
        check (
            status in (
                'draft',
                'sent',
                'accepted',
                'declined',
                'expired',
                'cancelled'
            )
        ),

    quotation_date date not null default current_date,

    valid_until date,

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

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    unique (
        company_id,
        quotation_number
    )
);


-- ============================================================
-- 2. QUOTATION ITEMS
-- ============================================================

create table if not exists public.quotation_item (
    id uuid primary key default gen_random_uuid(),

    quotation_id uuid not null
        references public.quotation(id)
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

    discount_rate numeric(6,3) not null default 0
        check (
            discount_rate >= 0
            and discount_rate <= 100
        ),

    tax_rate numeric(6,3) not null default 15
        check (
            tax_rate >= 0
            and tax_rate <= 100
        ),

    line_subtotal numeric(14,2) not null default 0
        check (line_subtotal >= 0),

    line_discount numeric(14,2) not null default 0
        check (line_discount >= 0),

    line_tax numeric(14,2) not null default 0
        check (line_tax >= 0),

    line_total numeric(14,2) not null default 0
        check (line_total >= 0),

    created_at timestamptz not null default now()
);


-- ============================================================
-- 3. INDEXES
-- ============================================================

create index if not exists quotation_company_idx
    on public.quotation(company_id);

create index if not exists quotation_customer_idx
    on public.quotation(customer_id);

create index if not exists quotation_branch_idx
    on public.quotation(branch_id);

create index if not exists quotation_status_idx
    on public.quotation(status);

create index if not exists quotation_date_idx
    on public.quotation(quotation_date desc);

create index if not exists quotation_item_quotation_idx
    on public.quotation_item(quotation_id);

create index if not exists quotation_item_company_idx
    on public.quotation_item(company_id);

create index if not exists quotation_item_inventory_idx
    on public.quotation_item(inventory_item_id);


-- ============================================================
-- 4. UPDATED_AT TRIGGER
-- ============================================================

drop trigger if exists quotation_set_updated_at
on public.quotation;

create trigger quotation_set_updated_at
before update
on public.quotation
for each row
execute function public.set_updated_at();


-- ============================================================
-- 5. LINE TOTAL CALCULATION
-- ============================================================

create or replace function public.calculate_quotation_item_totals()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.line_subtotal :=
        round(
            new.quantity *
            new.unit_price,
            2
        );

    new.line_discount :=
        round(
            new.line_subtotal *
            (new.discount_rate / 100),
            2
        );

    new.line_tax :=
        round(
            (
                new.line_subtotal -
                new.line_discount
            ) *
            (new.tax_rate / 100),
            2
        );

    new.line_total :=
        new.line_subtotal -
        new.line_discount +
        new.line_tax;

    return new;
end;
$$;


drop trigger if exists quotation_item_calculate_totals
on public.quotation_item;

create trigger quotation_item_calculate_totals
before insert or update
on public.quotation_item
for each row
execute function public.calculate_quotation_item_totals();


-- ============================================================
-- 6. HEADER TOTAL RECALCULATION
-- ============================================================

create or replace function public.recalculate_quotation_totals(
    target_quotation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    calculated_subtotal numeric(14,2);
    calculated_discount numeric(14,2);
    calculated_tax numeric(14,2);
    calculated_total numeric(14,2);
begin
    select
        coalesce(sum(line_subtotal), 0),
        coalesce(sum(line_discount), 0),
        coalesce(sum(line_tax), 0),
        coalesce(sum(line_total), 0)
    into
        calculated_subtotal,
        calculated_discount,
        calculated_tax,
        calculated_total
    from public.quotation_item
    where quotation_id =
        target_quotation_id;

    update public.quotation
    set
        subtotal =
            calculated_subtotal,

        discount_amount =
            calculated_discount,

        tax_amount =
            calculated_tax,

        total_amount =
            calculated_total,

        updated_at =
            now()

    where id =
        target_quotation_id;
end;
$$;


create or replace function public.quotation_item_recalculate_parent()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if tg_op = 'DELETE' then
        perform public.recalculate_quotation_totals(
            old.quotation_id
        );

        return old;
    end if;

    perform public.recalculate_quotation_totals(
        new.quotation_id
    );

    if (
        tg_op = 'UPDATE'
        and old.quotation_id
            is distinct from
            new.quotation_id
    ) then
        perform public.recalculate_quotation_totals(
            old.quotation_id
        );
    end if;

    return new;
end;
$$;


drop trigger if exists quotation_item_recalculate_after_change
on public.quotation_item;

create trigger quotation_item_recalculate_after_change
after insert or update or delete
on public.quotation_item
for each row
execute function public.quotation_item_recalculate_parent();


-- ============================================================
-- 7. QUOTATION NUMBER GENERATOR
-- ============================================================

create or replace function public.generate_quotation_number(
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
            'jinlab-quotation-' ||
            target_company_id::text,
            0
        )
    );

    select count(*) + 1
    into next_number
    from public.quotation
    where company_id =
        target_company_id;

    return
        'QT-' ||
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
-- 8. ROW LEVEL SECURITY
-- ============================================================

alter table public.quotation
enable row level security;

alter table public.quotation_item
enable row level security;


create policy "Users can view company quotations"
on public.quotation
for select
to authenticated
using (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);


create policy "Users can create company quotations"
on public.quotation
for insert
to authenticated
with check (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);


create policy "Users can update company quotations"
on public.quotation
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


create policy "Users can delete company quotations"
on public.quotation
for delete
to authenticated
using (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);


create policy "Users can view company quotation items"
on public.quotation_item
for select
to authenticated
using (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);


create policy "Users can create company quotation items"
on public.quotation_item
for insert
to authenticated
with check (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);


create policy "Users can update company quotation items"
on public.quotation_item
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


create policy "Users can delete company quotation items"
on public.quotation_item
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
-- 9. QUOTATION PERMISSIONS
-- ============================================================

insert into public.permissions (
    permission_name
)
values
    ('quotation.view'),
    ('quotation.create'),
    ('quotation.update'),
    ('quotation.delete'),
    ('quotation.send'),
    ('quotation.accept')
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
        'quotation.%'
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
        'quotation.view',
        'quotation.create',
        'quotation.update',
        'quotation.delete',
        'quotation.send',
        'quotation.accept'
    )
where r.role_name =
    'admin'
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
        'quotation.view',
        'quotation.create',
        'quotation.update',
        'quotation.send',
        'quotation.accept'
    )
where r.role_name =
    'manager'
on conflict (
    role_id,
    permission_id
)
do nothing;


-- EMPLOYEE / CASHIER
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
        'quotation.view',
        'quotation.create',
        'quotation.update'
    )
where r.role_name in (
    'employee',
    'cashier'
)
on conflict (
    role_id,
    permission_id
)
do nothing;


-- TECHNICIAN / VIEWER
insert into public.role_permissions (
    role_id,
    permission_id
)
select
    r.id,
    p.id
from public.roles r
join public.permissions p
    on p.permission_name =
        'quotation.view'
where r.role_name in (
    'technician',
    'viewer'
)
on conflict (
    role_id,
    permission_id
)
do nothing;


-- ============================================================
-- END QUOTATION FOUNDATION
-- ============================================================
