-- ============================================================
-- JINLAB Nexus
-- Accounting Sprint 19.2A
-- Automatic Posting Profile
-- ============================================================


-- ============================================================
-- 1. COMPANY ACCOUNTING POSTING PROFILE
-- ============================================================

create table if not exists
public.accounting_posting_profile (
  company_id uuid primary key
    references public.company(id)
    on delete cascade,

  accounts_receivable_account_id uuid
    references public.accounting_account(id)
    on delete restrict,

  accounts_payable_account_id uuid
    references public.accounting_account(id)
    on delete restrict,

  sales_revenue_account_id uuid
    references public.accounting_account(id)
    on delete restrict,

  service_revenue_account_id uuid
    references public.accounting_account(id)
    on delete restrict,

  vat_output_account_id uuid
    references public.accounting_account(id)
    on delete restrict,

  vat_input_account_id uuid
    references public.accounting_account(id)
    on delete restrict,

  bank_account_id uuid
    references public.accounting_account(id)
    on delete restrict,

  cash_account_id uuid
    references public.accounting_account(id)
    on delete restrict,

  inventory_account_id uuid
    references public.accounting_account(id)
    on delete restrict,

  cost_of_sales_account_id uuid
    references public.accounting_account(id)
    on delete restrict,

  customer_deposits_account_id uuid
    references public.accounting_account(id)
    on delete restrict,

  rounding_account_id uuid
    references public.accounting_account(id)
    on delete restrict,

  updated_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now()
);


drop trigger if exists
accounting_posting_profile_set_updated_at
on public.accounting_posting_profile;

create trigger
accounting_posting_profile_set_updated_at
before update
on public.accounting_posting_profile
for each row
execute function public.set_updated_at();


-- ============================================================
-- 2. VALIDATE ACCOUNT OWNERSHIP + ACCOUNT TYPES
-- ============================================================

create or replace function
public.validate_accounting_posting_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
begin

  foreach v_account_id in array array[
    new.accounts_receivable_account_id,
    new.accounts_payable_account_id,
    new.sales_revenue_account_id,
    new.service_revenue_account_id,
    new.vat_output_account_id,
    new.vat_input_account_id,
    new.bank_account_id,
    new.cash_account_id,
    new.inventory_account_id,
    new.cost_of_sales_account_id,
    new.customer_deposits_account_id,
    new.rounding_account_id
  ]
  loop

    if v_account_id is not null then

      if not exists (
        select 1
        from public.accounting_account aa
        where aa.id =
          v_account_id
          and aa.company_id =
            new.company_id
          and aa.is_active =
            true
      ) then
        raise exception
          'Posting profile account is invalid, inactive, or belongs to another company.';
      end if;

    end if;

  end loop;


  -- Accounts Receivable = Asset
  if new.accounts_receivable_account_id
     is not null
     and not exists (
       select 1
       from public.accounting_account
       where id =
         new.accounts_receivable_account_id
         and account_type =
           'asset'
     ) then
    raise exception
      'Accounts Receivable must be an asset account.';
  end if;


  -- Accounts Payable = Liability
  if new.accounts_payable_account_id
     is not null
     and not exists (
       select 1
       from public.accounting_account
       where id =
         new.accounts_payable_account_id
         and account_type =
           'liability'
     ) then
    raise exception
      'Accounts Payable must be a liability account.';
  end if;


  -- Sales Revenue
  if new.sales_revenue_account_id
     is not null
     and not exists (
       select 1
       from public.accounting_account
       where id =
         new.sales_revenue_account_id
         and account_type =
           'revenue'
     ) then
    raise exception
      'Sales Revenue must be a revenue account.';
  end if;


  -- Service Revenue
  if new.service_revenue_account_id
     is not null
     and not exists (
       select 1
       from public.accounting_account
       where id =
         new.service_revenue_account_id
         and account_type =
           'revenue'
     ) then
    raise exception
      'Service Revenue must be a revenue account.';
  end if;


  -- VAT Output = Liability
  if new.vat_output_account_id
     is not null
     and not exists (
       select 1
       from public.accounting_account
       where id =
         new.vat_output_account_id
         and account_type =
           'liability'
     ) then
    raise exception
      'VAT Output must be a liability account.';
  end if;


  -- VAT Input = Asset
  if new.vat_input_account_id
     is not null
     and not exists (
       select 1
       from public.accounting_account
       where id =
         new.vat_input_account_id
         and account_type =
           'asset'
     ) then
    raise exception
      'VAT Input must be an asset account.';
  end if;


  -- Bank
  if new.bank_account_id
     is not null
     and not exists (
       select 1
       from public.accounting_account
       where id =
         new.bank_account_id
         and account_type =
           'asset'
     ) then
    raise exception
      'Bank must be an asset account.';
  end if;


  -- Cash
  if new.cash_account_id
     is not null
     and not exists (
       select 1
       from public.accounting_account
       where id =
         new.cash_account_id
         and account_type =
           'asset'
     ) then
    raise exception
      'Cash must be an asset account.';
  end if;


  -- Inventory
  if new.inventory_account_id
     is not null
     and not exists (
       select 1
       from public.accounting_account
       where id =
         new.inventory_account_id
         and account_type =
           'asset'
     ) then
    raise exception
      'Inventory must be an asset account.';
  end if;


  -- Cost of Sales
  if new.cost_of_sales_account_id
     is not null
     and not exists (
       select 1
       from public.accounting_account
       where id =
         new.cost_of_sales_account_id
         and account_type =
           'expense'
     ) then
    raise exception
      'Cost of Sales must be an expense account.';
  end if;


  return new;

end;
$$;


drop trigger if exists
accounting_posting_profile_validate
on public.accounting_posting_profile;

create trigger
accounting_posting_profile_validate
before insert or update
on public.accounting_posting_profile
for each row
execute function
public.validate_accounting_posting_profile();


-- ============================================================
-- 3. SEED POSTING PROFILE FROM DEFAULT CHART
-- ============================================================

insert into
public.accounting_posting_profile (
  company_id,

  accounts_receivable_account_id,
  accounts_payable_account_id,

  sales_revenue_account_id,
  service_revenue_account_id,

  vat_output_account_id,
  vat_input_account_id,

  bank_account_id,
  cash_account_id,

  inventory_account_id,
  cost_of_sales_account_id,

  customer_deposits_account_id,
  rounding_account_id
)

select
  c.id,

  (
    select aa.id
    from public.accounting_account aa
    where aa.company_id =
      c.id
      and (
        aa.system_key =
          'accounts_receivable'
        or aa.code =
          '1100'
      )
    order by
      case
        when aa.system_key =
          'accounts_receivable'
        then 0
        else 1
      end
    limit 1
  ),

  (
    select aa.id
    from public.accounting_account aa
    where aa.company_id =
      c.id
      and (
        aa.system_key =
          'accounts_payable'
        or aa.code =
          '2000'
      )
    limit 1
  ),

  (
    select aa.id
    from public.accounting_account aa
    where aa.company_id =
      c.id
      and (
        aa.system_key =
          'sales_revenue'
        or aa.code =
          '4000'
      )
    limit 1
  ),

  (
    select aa.id
    from public.accounting_account aa
    where aa.company_id =
      c.id
      and (
        aa.system_key =
          'service_revenue'
        or aa.code =
          '4100'
      )
    limit 1
  ),

  (
    select aa.id
    from public.accounting_account aa
    where aa.company_id =
      c.id
      and (
        aa.system_key =
          'vat_output'
        or aa.code =
          '2100'
      )
    limit 1
  ),

  (
    select aa.id
    from public.accounting_account aa
    where aa.company_id =
      c.id
      and (
        aa.system_key =
          'vat_input'
        or aa.code =
          '1300'
      )
    limit 1
  ),

  (
    select aa.id
    from public.accounting_account aa
    where aa.company_id =
      c.id
      and (
        aa.system_key =
          'bank'
        or aa.code =
          '1000'
      )
    limit 1
  ),

  (
    select aa.id
    from public.accounting_account aa
    where aa.company_id =
      c.id
      and (
        aa.system_key =
          'cash_on_hand'
        or aa.code =
          '1010'
      )
    limit 1
  ),

  (
    select aa.id
    from public.accounting_account aa
    where aa.company_id =
      c.id
      and (
        aa.system_key =
          'inventory'
        or aa.code =
          '1200'
      )
    limit 1
  ),

  (
    select aa.id
    from public.accounting_account aa
    where aa.company_id =
      c.id
      and (
        aa.system_key =
          'cost_of_sales'
        or aa.code =
          '5000'
      )
    limit 1
  ),

  (
    select aa.id
    from public.accounting_account aa
    where aa.company_id =
      c.id
      and (
        aa.system_key =
          'customer_deposits'
        or aa.code =
          '2200'
      )
    limit 1
  ),

  (
    select aa.id
    from public.accounting_account aa
    where aa.company_id =
      c.id
      and (
        aa.system_key =
          'rounding'
        or aa.code =
          '6800'
      )
    limit 1
  )

from public.company c

on conflict (
  company_id
)
do nothing;


-- ============================================================
-- 4. READ PROFILE
-- ============================================================

create or replace function
public.get_accounting_posting_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_profile public.accounting_posting_profile%rowtype;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;


  if not public.current_user_has_permission(
    'accounting.view'
  ) then
    raise exception
      'Permission denied: accounting.view';
  end if;


  v_company_id :=
    public.current_settings_company_id();


  select *
  into v_profile
  from public.accounting_posting_profile
  where company_id =
    v_company_id;


  if not found then
    raise exception
      'Accounting posting profile has not been configured.';
  end if;


  return to_jsonb(
    v_profile
  );

end;
$$;


revoke all
on function
public.get_accounting_posting_profile()
from public;

grant execute
on function
public.get_accounting_posting_profile()
to authenticated;


-- ============================================================
-- 5. RLS
-- ============================================================

alter table
public.accounting_posting_profile
enable row level security;


drop policy if exists
"permitted users read accounting posting profile"
on public.accounting_posting_profile;

create policy
"permitted users read accounting posting profile"
on public.accounting_posting_profile
for select
to authenticated
using (
  company_id =
    public.current_settings_company_id()

  and public.current_user_has_permission(
    'accounting.view'
  )
);


revoke insert, update, delete
on public.accounting_posting_profile
from authenticated;

grant select
on public.accounting_posting_profile
to authenticated;


-- ============================================================
-- END
-- ============================================================
