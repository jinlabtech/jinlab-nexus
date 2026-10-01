-- JINLAB Nexus Sprint 19.3M2

insert into public.permissions (permission_name)
select 'customer.credit.manage'
where not exists (
  select 1 from public.permissions
  where permission_name = 'customer.credit.manage'
);

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.role_name in ('owner','admin')
  and p.permission_name = 'customer.credit.manage'
  and not exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = r.id
      and rp.permission_id = p.id
  );

create table if not exists public.customer_credit_policy_change (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  customer_id uuid not null references public.customer(id) on delete cascade,
  field_name text not null check (field_name in ('credit_limit','payment_terms_days')),
  old_value text,
  new_value text,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index if not exists customer_credit_policy_change_company_customer_idx
  on public.customer_credit_policy_change(company_id, customer_id, changed_at desc);

alter table public.customer_credit_policy_change enable row level security;

drop policy if exists customer_credit_policy_change_select on public.customer_credit_policy_change;
create policy customer_credit_policy_change_select
on public.customer_credit_policy_change
for select
to authenticated
using (
  company_id = public.current_company_id()
  and public.current_user_has_permission('customer.view')
);

revoke insert, update, delete on public.customer_credit_policy_change from authenticated;

create or replace function public.protect_customer_credit_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if v_actor is not null
       and (
         coalesce(new.credit_limit,0) > 0
         or coalesce(new.payment_terms_days,0) <> 0
       )
       and not public.current_user_has_permission('customer.credit.manage') then
      raise exception
        'Permission denied: customer.credit.manage is required to set customer credit limits or custom payment terms.';
    end if;
    return new;
  end if;

  if new.credit_limit is distinct from old.credit_limit
     or new.payment_terms_days is distinct from old.payment_terms_days then

    if v_actor is not null
       and not public.current_user_has_permission('customer.credit.manage') then
      raise exception
        'Permission denied: customer.credit.manage is required to change customer credit limits or payment terms.';
    end if;

    if new.credit_limit is distinct from old.credit_limit then
      insert into public.customer_credit_policy_change (
        company_id, customer_id, field_name, old_value, new_value, changed_by
      ) values (
        new.company_id, new.id, 'credit_limit', old.credit_limit::text, new.credit_limit::text, v_actor
      );
    end if;

    if new.payment_terms_days is distinct from old.payment_terms_days then
      insert into public.customer_credit_policy_change (
        company_id, customer_id, field_name, old_value, new_value, changed_by
      ) values (
        new.company_id, new.id, 'payment_terms_days', old.payment_terms_days::text, new.payment_terms_days::text, v_actor
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_customer_credit_policy() from public, authenticated;

drop trigger if exists protect_customer_credit_policy_trigger on public.customer;
create trigger protect_customer_credit_policy_trigger
before insert or update of credit_limit, payment_terms_days
on public.customer
for each row
execute function public.protect_customer_credit_policy();

create or replace function public.apply_invoice_due_date()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_basis text;
  v_customer_terms integer := 0;
  v_company_terms integer := 30;
  v_effective_terms integer := 0;
begin
  if new.invoice_date is null then
    new.invoice_date := current_date;
  end if;

  if new.due_date is not null then
    if new.due_date < new.invoice_date then
      raise exception 'Invoice due date cannot be before the invoice date.';
    end if;
    return new;
  end if;

  if new.sales_order_id is not null then
    select so.payment_basis
    into v_basis
    from public.sales_order so
    where so.id = new.sales_order_id
      and so.company_id = new.company_id;
  end if;

  if v_basis in ('immediate','prepaid') then
    new.due_date := new.invoice_date;
    return new;
  end if;

  select coalesce(c.payment_terms_days,0)
  into v_customer_terms
  from public.customer c
  where c.id = new.customer_id
    and c.company_id = new.company_id;

  select coalesce(fs.default_customer_payment_days,30)
  into v_company_terms
  from public.company_finance_settings fs
  where fs.company_id = new.company_id;

  v_effective_terms := case
    when coalesce(v_customer_terms,0) > 0 then v_customer_terms
    else greatest(coalesce(v_company_terms,30),0)
  end;

  new.due_date := new.invoice_date + v_effective_terms;
  return new;
end;
$$;

revoke all on function public.apply_invoice_due_date() from public, authenticated;

drop trigger if exists apply_invoice_due_date_trigger on public.invoice;
create trigger apply_invoice_due_date_trigger
before insert or update of invoice_date, customer_id, sales_order_id, due_date
on public.invoice
for each row
when (new.status = 'draft')
execute function public.apply_invoice_due_date();

update public.invoice i
set due_date = case
  when (
    select so.payment_basis
    from public.sales_order so
    where so.id = i.sales_order_id
      and so.company_id = i.company_id
  ) in ('immediate','prepaid')
  then i.invoice_date
  else i.invoice_date + (
    case
      when coalesce((
        select c.payment_terms_days
        from public.customer c
        where c.id = i.customer_id
          and c.company_id = i.company_id
      ),0) > 0
      then (
        select c.payment_terms_days
        from public.customer c
        where c.id = i.customer_id
          and c.company_id = i.company_id
      )
      else greatest(coalesce((
        select fs.default_customer_payment_days
        from public.company_finance_settings fs
        where fs.company_id = i.company_id
      ),30),0)
    end
  )
end
where i.status = 'draft'
  and i.due_date is null;;
