-- ============================================================
-- JINLAB Nexus
-- Accounting Sprint 19.1G
-- Chart of Accounts Workspace
-- ============================================================


-- ============================================================
-- 1. READ CHART OF ACCOUNTS WITH LIVE POSTED BALANCES
-- ============================================================

create or replace function
public.get_chart_of_accounts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_accounts jsonb;
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

  if v_company_id is null then
    raise exception
      'Your account is not linked to a company.';
  end if;


  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',
          aa.id,
        'company_id',
          aa.company_id,
        'parent_account_id',
          aa.parent_account_id,
        'code',
          aa.code,
        'name',
          aa.name,
        'description',
          aa.description,
        'account_type',
          aa.account_type,
        'account_subtype',
          aa.account_subtype,
        'normal_balance',
          aa.normal_balance,
        'system_key',
          aa.system_key,
        'is_system',
          aa.is_system,
        'allow_manual_posting',
          aa.allow_manual_posting,
        'is_active',
          aa.is_active,
        'balance',
          case
            when aa.normal_balance = 'debit'
            then
              round(
                coalesce(
                  totals.debit,
                  0
                ) -
                coalesce(
                  totals.credit,
                  0
                ),
                2
              )
            else
              round(
                coalesce(
                  totals.credit,
                  0
                ) -
                coalesce(
                  totals.debit,
                  0
                ),
                2
              )
          end,
        'posted_debit',
          round(
            coalesce(
              totals.debit,
              0
            ),
            2
          ),
        'posted_credit',
          round(
            coalesce(
              totals.credit,
              0
            ),
            2
          ),
        'posted_line_count',
          coalesce(
            totals.line_count,
            0
          ),
        'created_at',
          aa.created_at,
        'updated_at',
          aa.updated_at
      )
      order by aa.code
    ),
    '[]'::jsonb
  )
  into v_accounts

  from public.accounting_account aa

  left join lateral (
    select
      sum(jl.debit) as debit,
      sum(jl.credit) as credit,
      count(*) as line_count

    from public.journal_line jl

    join public.journal_entry je
      on je.id =
        jl.journal_entry_id
      and je.status =
        'posted'

    where
      jl.company_id =
        v_company_id
      and jl.account_id =
        aa.id
  ) totals
    on true

  where
    aa.company_id =
      v_company_id;


  return jsonb_build_object(
    'ok',
      true,
    'accounts',
      v_accounts
  );

end;
$$;


revoke all
on function
public.get_chart_of_accounts()
from public;

grant execute
on function
public.get_chart_of_accounts()
to authenticated;


-- ============================================================
-- 2. CREATE CUSTOM ACCOUNT
-- Normal balance is derived automatically.
-- ============================================================

create or replace function
public.create_accounting_account(
  p_code text,
  p_name text,
  p_account_type text,
  p_account_subtype text default null,
  p_description text default null,
  p_parent_account_id uuid default null,
  p_allow_manual_posting boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_parent public.accounting_account%rowtype;

  v_account public.accounting_account%rowtype;

  v_normal_balance text;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;


  if not public.current_user_has_permission(
    'accounting.accounts.manage'
  ) then
    raise exception
      'Permission denied: accounting.accounts.manage';
  end if;


  v_company_id :=
    public.current_settings_company_id();


  if nullif(
       trim(p_code),
       ''
     ) is null then
    raise exception
      'Account code is required.';
  end if;


  if nullif(
       trim(p_name),
       ''
     ) is null then
    raise exception
      'Account name is required.';
  end if;


  if p_account_type not in (
    'asset',
    'liability',
    'equity',
    'revenue',
    'expense'
  ) then
    raise exception
      'Invalid account type.';
  end if;


  if exists (
    select 1
    from public.accounting_account
    where company_id =
      v_company_id
      and lower(code) =
        lower(trim(p_code))
  ) then
    raise exception
      'An account with this code already exists.';
  end if;


  if p_parent_account_id
     is not null then

    select *
    into v_parent
    from public.accounting_account
    where id =
      p_parent_account_id
      and company_id =
        v_company_id;

    if not found then
      raise exception
        'Parent account could not be found.';
    end if;


    if v_parent.account_type <>
       p_account_type then
      raise exception
        'Parent and child accounts must use the same account type.';
    end if;

  end if;


  v_normal_balance :=
    case
      when p_account_type in (
        'asset',
        'expense'
      )
      then 'debit'
      else 'credit'
    end;


  insert into
  public.accounting_account (
    company_id,
    parent_account_id,
    code,
    name,
    description,
    account_type,
    account_subtype,
    normal_balance,
    system_key,
    is_system,
    allow_manual_posting,
    is_active,
    created_by
  )
  values (
    v_company_id,
    p_parent_account_id,
    trim(p_code),
    trim(p_name),
    nullif(
      trim(p_description),
      ''
    ),
    p_account_type,
    nullif(
      trim(p_account_subtype),
      ''
    ),
    v_normal_balance,
    null,
    false,
    coalesce(
      p_allow_manual_posting,
      true
    ),
    true,
    auth.uid()
  )
  returning *
  into v_account;


  return jsonb_build_object(
    'ok',
      true,

    'account',
      jsonb_build_object(
        'id',
          v_account.id,
        'code',
          v_account.code,
        'name',
          v_account.name,
        'account_type',
          v_account.account_type,
        'normal_balance',
          v_account.normal_balance,
        'is_active',
          v_account.is_active
      )
  );

end;
$$;


revoke all
on function public.create_accounting_account(
  text,
  text,
  text,
  text,
  text,
  uuid,
  boolean
)
from public;

grant execute
on function public.create_accounting_account(
  text,
  text,
  text,
  text,
  text,
  uuid,
  boolean
)
to authenticated;


-- ============================================================
-- 3. UPDATE ACCOUNT
--
-- Account type and normal balance are intentionally immutable
-- here. Reclassification is a separate accounting operation.
-- ============================================================

create or replace function
public.update_accounting_account(
  p_account_id uuid,
  p_code text,
  p_name text,
  p_account_subtype text,
  p_description text,
  p_parent_account_id uuid,
  p_allow_manual_posting boolean,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_account public.accounting_account%rowtype;
  v_parent public.accounting_account%rowtype;
begin

  if auth.uid() is null then
    raise exception
      'Authentication required.';
  end if;


  if not public.current_user_has_permission(
    'accounting.accounts.manage'
  ) then
    raise exception
      'Permission denied: accounting.accounts.manage';
  end if;


  v_company_id :=
    public.current_settings_company_id();


  select *
  into v_account
  from public.accounting_account
  where id =
    p_account_id
    and company_id =
      v_company_id
  for update;


  if not found then
    raise exception
      'Accounting account could not be found.';
  end if;


  if nullif(
       trim(p_code),
       ''
     ) is null then
    raise exception
      'Account code is required.';
  end if;


  if nullif(
       trim(p_name),
       ''
     ) is null then
    raise exception
      'Account name is required.';
  end if;


  if exists (
    select 1
    from public.accounting_account
    where company_id =
      v_company_id
      and lower(code) =
        lower(trim(p_code))
      and id <>
        v_account.id
  ) then
    raise exception
      'An account with this code already exists.';
  end if;


  if v_account.is_system
     and p_is_active = false then
    raise exception
      'System accounts cannot be deactivated.';
  end if;


  if p_parent_account_id =
     v_account.id then
    raise exception
      'An account cannot be its own parent.';
  end if;


  if p_parent_account_id
     is not null then

    select *
    into v_parent
    from public.accounting_account
    where id =
      p_parent_account_id
      and company_id =
        v_company_id;

    if not found then
      raise exception
        'Parent account could not be found.';
    end if;


    if v_parent.account_type <>
       v_account.account_type then
      raise exception
        'Parent and child accounts must use the same account type.';
    end if;

  end if;


  update public.accounting_account
  set
    code =
      trim(p_code),

    name =
      trim(p_name),

    account_subtype =
      nullif(
        trim(p_account_subtype),
        ''
      ),

    description =
      nullif(
        trim(p_description),
        ''
      ),

    parent_account_id =
      p_parent_account_id,

    allow_manual_posting =
      case
        when is_system
             and system_key in (
               'accounts_receivable',
               'accounts_payable',
               'inventory',
               'vat_input',
               'vat_output',
               'customer_deposits'
             )
        then false

        else coalesce(
          p_allow_manual_posting,
          allow_manual_posting
        )
      end,

    is_active =
      case
        when is_system
        then true
        else coalesce(
          p_is_active,
          is_active
        )
      end

  where id =
    v_account.id

  returning *
  into v_account;


  return jsonb_build_object(
    'ok',
      true,

    'account',
      jsonb_build_object(
        'id',
          v_account.id,
        'code',
          v_account.code,
        'name',
          v_account.name,
        'account_type',
          v_account.account_type,
        'is_system',
          v_account.is_system,
        'is_active',
          v_account.is_active
      )
  );

end;
$$;


revoke all
on function public.update_accounting_account(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  boolean,
  boolean
)
from public;

grant execute
on function public.update_accounting_account(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  boolean,
  boolean
)
to authenticated;


-- ============================================================
-- END
-- ============================================================
