-- ============================================================
-- JINLAB Nexus
-- Sprint 17.1 - Customer Management Foundation
-- ============================================================


-- ============================================================
-- 1. CUSTOMER
-- ============================================================

create table if not exists public.customer (
    id uuid primary key default gen_random_uuid(),

    company_id uuid not null
        references public.company(id)
        on delete cascade,

    customer_number text not null,

    customer_type text not null default 'individual'
        check (
            customer_type in (
                'individual',
                'business',
                'school',
                'government',
                'organisation'
            )
        ),

    customer_name text not null,

    contact_person text,

    email text,

    phone text,

    alternative_phone text,

    registration_number text,

    vat_number text,

    address_line_1 text,

    address_line_2 text,

    city text,

    province text,

    postal_code text,

    country text not null default 'South Africa',

    credit_limit numeric(14,2) not null default 0
        check (credit_limit >= 0),

    payment_terms_days integer not null default 0
        check (payment_terms_days >= 0),

    notes text,

    is_active boolean not null default true,

    created_by uuid
        references auth.users(id)
        on delete set null,

    created_at timestamptz not null default now(),

    updated_at timestamptz not null default now(),

    unique (
        company_id,
        customer_number
    )
);


-- ============================================================
-- 2. INDEXES
-- ============================================================

create index if not exists customer_company_idx
    on public.customer(company_id);

create index if not exists customer_name_idx
    on public.customer(customer_name);

create index if not exists customer_phone_idx
    on public.customer(phone);

create index if not exists customer_email_idx
    on public.customer(email);

create index if not exists customer_active_idx
    on public.customer(
        company_id,
        is_active
    );


-- ============================================================
-- 3. UPDATED_AT TRIGGER
-- ============================================================

drop trigger if exists customer_set_updated_at
on public.customer;

create trigger customer_set_updated_at
before update
on public.customer
for each row
execute function public.set_updated_at();


-- ============================================================
-- 4. CUSTOMER NUMBER GENERATOR
-- ============================================================

create or replace function public.generate_customer_number(
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
            'jinlab-customer-' ||
            target_company_id::text,
            0
        )
    );

    select count(*) + 1
    into next_number
    from public.customer
    where company_id =
        target_company_id;

    return
        'CUS-' ||
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
-- 5. ROW LEVEL SECURITY
-- ============================================================

alter table public.customer
enable row level security;


create policy "Users can view company customers"
on public.customer
for select
to authenticated
using (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);


create policy "Users can create company customers"
on public.customer
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
        or created_by =
            auth.uid()
    )
);


create policy "Users can update company customers"
on public.customer
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


create policy "Users can delete company customers"
on public.customer
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
-- 6. CUSTOMER PERMISSIONS
-- ============================================================

insert into public.permissions (
    permission_name
)
values
    ('customer.view'),
    ('customer.create'),
    ('customer.update'),
    ('customer.delete')
on conflict (
    permission_name
)
do nothing;


-- ============================================================
-- 7. OWNER
-- ============================================================

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
        'customer.%'
on conflict (
    role_id,
    permission_id
)
do nothing;


-- ============================================================
-- 8. ADMIN
-- ============================================================

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
        'customer.view',
        'customer.create',
        'customer.update',
        'customer.delete'
    )
where r.role_name = 'admin'
on conflict (
    role_id,
    permission_id
)
do nothing;


-- ============================================================
-- 9. MANAGER
-- ============================================================

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
        'customer.view',
        'customer.create',
        'customer.update'
    )
where r.role_name = 'manager'
on conflict (
    role_id,
    permission_id
)
do nothing;


-- ============================================================
-- 10. EMPLOYEE / CASHIER
-- ============================================================

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
        'customer.view',
        'customer.create'
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


-- ============================================================
-- 11. TECHNICIAN / VIEWER
-- ============================================================

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
        'customer.view'
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
-- END CUSTOMER FOUNDATION
-- ============================================================
