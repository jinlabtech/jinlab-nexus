-- ============================================================
-- JINLAB Nexus
-- Sprint 18.10 - Invoice Payment Foundation
-- ============================================================

create table if not exists public.invoice_payment (
    id uuid primary key default gen_random_uuid(),

    company_id uuid not null
        references public.company(id)
        on delete cascade,

    branch_id uuid not null
        references public.branch(id)
        on delete restrict,

    invoice_id uuid not null
        references public.invoice(id)
        on delete restrict,

    customer_id uuid not null
        references public.customer(id)
        on delete restrict,

    payment_date date not null default current_date,

    payment_method text not null
        check (
            payment_method in (
                'cash',
                'eft',
                'card',
                'other'
            )
        ),

    reference text,

    amount numeric(14,2) not null
        check (amount > 0),

    notes text,

    received_by uuid
        references auth.users(id)
        on delete set null,

    created_at timestamptz not null default now()
);

create index if not exists invoice_payment_company_idx
    on public.invoice_payment(company_id);

create index if not exists invoice_payment_invoice_idx
    on public.invoice_payment(invoice_id);

create index if not exists invoice_payment_customer_idx
    on public.invoice_payment(customer_id);

create index if not exists invoice_payment_date_idx
    on public.invoice_payment(payment_date desc);


-- ============================================================
-- PAYMENT TOTAL REFRESH
-- ============================================================

create or replace function public.refresh_invoice_payment_status(
    target_invoice_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
declare
    paid_total numeric(14,2);
    invoice_total numeric(14,2);
begin
    select
        coalesce(sum(amount), 0)
    into paid_total
    from public.invoice_payment
    where invoice_id =
        target_invoice_id;

    select
        total_amount
    into invoice_total
    from public.invoice
    where id =
        target_invoice_id
    for update;

    if invoice_total is null then
        raise exception
            'Invoice could not be found.';
    end if;

    if paid_total > invoice_total then
        raise exception
            'Payments cannot exceed the invoice total.';
    end if;

    update public.invoice
    set
        amount_paid =
            paid_total,

        balance_due =
            greatest(
                invoice_total -
                paid_total,
                0
            ),

        status =
            case
                when paid_total = 0 then
                    case
                        when status = 'cancelled'
                            then 'cancelled'
                        else 'issued'
                    end

                when paid_total < invoice_total
                    then 'partially_paid'

                else 'paid'
            end,

        updated_at = now()

    where id =
        target_invoice_id;
end;
$$;


create or replace function public.invoice_payment_refresh_parent()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if tg_op = 'DELETE' then
        perform public.refresh_invoice_payment_status(
            old.invoice_id
        );

        return old;
    end if;

    perform public.refresh_invoice_payment_status(
        new.invoice_id
    );

    if (
        tg_op = 'UPDATE'
        and old.invoice_id
            is distinct from
            new.invoice_id
    ) then
        perform public.refresh_invoice_payment_status(
            old.invoice_id
        );
    end if;

    return new;
end;
$$;


drop trigger if exists invoice_payment_refresh_invoice
on public.invoice_payment;

create trigger invoice_payment_refresh_invoice
after insert or update or delete
on public.invoice_payment
for each row
execute function public.invoice_payment_refresh_parent();


-- ============================================================
-- PREVENT PAYMENT ON INVALID INVOICE
-- ============================================================

create or replace function public.validate_invoice_payment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    target_invoice public.invoice%rowtype;
    existing_paid numeric(14,2);
begin
    select *
    into target_invoice
    from public.invoice
    where id = new.invoice_id
      and company_id = new.company_id
    for update;

    if not found then
        raise exception
            'Invoice could not be found.';
    end if;

    if target_invoice.status not in (
        'issued',
        'partially_paid',
        'overdue'
    ) then
        raise exception
            'Only issued invoices can receive payments.';
    end if;

    if target_invoice.customer_id
        <> new.customer_id then
        raise exception
            'Payment customer does not match invoice customer.';
    end if;

    if target_invoice.branch_id
        <> new.branch_id then
        raise exception
            'Payment branch does not match invoice branch.';
    end if;

    select
        coalesce(sum(amount), 0)
    into existing_paid
    from public.invoice_payment
    where invoice_id =
        new.invoice_id
      and id is distinct from new.id;

    if existing_paid + new.amount
        > target_invoice.total_amount then
        raise exception
            'Payment amount exceeds the remaining invoice balance.';
    end if;

    return new;
end;
$$;


drop trigger if exists invoice_payment_validate
on public.invoice_payment;

create trigger invoice_payment_validate
before insert or update
on public.invoice_payment
for each row
execute function public.validate_invoice_payment();


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.invoice_payment
enable row level security;

create policy "Users can view company invoice payments"
on public.invoice_payment
for select
to authenticated
using (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);

create policy "Users can create company invoice payments"
on public.invoice_payment
for insert
to authenticated
with check (
    company_id in (
        select company_id
        from public.user_profile
        where user_id = auth.uid()
    )
);

create policy "Users can update company invoice payments"
on public.invoice_payment
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

create policy "Users can delete company invoice payments"
on public.invoice_payment
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
-- PERMISSIONS
-- ============================================================

insert into public.permissions (
    permission_name
)
values
    ('payment.view'),
    ('payment.create'),
    ('payment.update'),
    ('payment.delete')
on conflict (
    permission_name
)
do nothing;

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
        'payment.%'
on conflict (
    role_id,
    permission_id
)
do nothing;

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
        'payment.view',
        'payment.create',
        'payment.update'
    )
where r.role_name in (
    'admin',
    'manager'
)
on conflict (
    role_id,
    permission_id
)
do nothing;

-- ============================================================
-- END PAYMENT FOUNDATION
-- ============================================================
