-- ============================================================
-- JINLAB Nexus
-- Accounting Sprint 19.1C
-- Accounting Overview RPC
-- ============================================================

create or replace function
public.get_accounting_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;

  v_assets numeric(14,2) := 0;
  v_liabilities numeric(14,2) := 0;
  v_equity numeric(14,2) := 0;
  v_revenue numeric(14,2) := 0;
  v_expenses numeric(14,2) := 0;

  v_posted_count bigint := 0;
  v_draft_count bigint := 0;
  v_pending_count bigint := 0;

  v_accounting_enabled boolean := true;
  v_base_currency text := 'ZAR';
  v_accounting_basis text := 'accrual';
  v_vat_registered boolean := false;

  v_current_period jsonb := null;
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


  -- ----------------------------------------------------------
  -- Finance configuration
  -- ----------------------------------------------------------

  select
    coalesce(
      base_currency,
      'ZAR'
    ),
    coalesce(
      accounting_basis,
      'accrual'
    ),
    coalesce(
      vat_registered,
      false
    )
  into
    v_base_currency,
    v_accounting_basis,
    v_vat_registered
  from public.company_finance_settings
  where company_id =
    v_company_id;

  select
    coalesce(
      accounting_enabled,
      true
    )
  into v_accounting_enabled
  from public.company_accounting_settings
  where company_id =
    v_company_id;


  -- ----------------------------------------------------------
  -- Ledger balances
  --
  -- Assets / Expenses:
  -- Debit - Credit
  --
  -- Liabilities / Equity / Revenue:
  -- Credit - Debit
  -- ----------------------------------------------------------

  select
    coalesce(
      sum(
        case
          when aa.account_type = 'asset'
          then jl.debit - jl.credit
          else 0
        end
      ),
      0
    ),

    coalesce(
      sum(
        case
          when aa.account_type = 'liability'
          then jl.credit - jl.debit
          else 0
        end
      ),
      0
    ),

    coalesce(
      sum(
        case
          when aa.account_type = 'equity'
          then jl.credit - jl.debit
          else 0
        end
      ),
      0
    ),

    coalesce(
      sum(
        case
          when aa.account_type = 'revenue'
          then jl.credit - jl.debit
          else 0
        end
      ),
      0
    ),

    coalesce(
      sum(
        case
          when aa.account_type = 'expense'
          then jl.debit - jl.credit
          else 0
        end
      ),
      0
    )

  into
    v_assets,
    v_liabilities,
    v_equity,
    v_revenue,
    v_expenses

  from public.journal_line jl

  join public.journal_entry je
    on je.id =
      jl.journal_entry_id
    and je.company_id =
      v_company_id
    and je.status =
      'posted'

  join public.accounting_account aa
    on aa.id =
      jl.account_id
    and aa.company_id =
      v_company_id

  where jl.company_id =
    v_company_id;


  -- ----------------------------------------------------------
  -- Journal health
  -- ----------------------------------------------------------

  select
    count(*) filter (
      where status = 'posted'
    ),

    count(*) filter (
      where status = 'draft'
    ),

    count(*) filter (
      where status = 'draft'
      and approval_status = 'pending'
    )

  into
    v_posted_count,
    v_draft_count,
    v_pending_count

  from public.journal_entry
  where company_id =
    v_company_id;


  -- ----------------------------------------------------------
  -- Current accounting period
  -- ----------------------------------------------------------

  perform
    public.ensure_accounting_periods(
      v_company_id,
      current_date
    );

  select
    jsonb_build_object(
      'id',
        ap.id,
      'name',
        ap.name,
      'start_date',
        ap.start_date,
      'end_date',
        ap.end_date,
      'status',
        ap.status
    )
  into v_current_period
  from public.accounting_period ap
  where
    ap.company_id =
      v_company_id
    and current_date between
      ap.start_date
      and ap.end_date
  order by ap.start_date desc
  limit 1;


  -- ----------------------------------------------------------
  -- Result
  -- ----------------------------------------------------------

  return jsonb_build_object(
    'ok',
      true,

    'company_id',
      v_company_id,

    'settings',
      jsonb_build_object(
        'accounting_enabled',
          coalesce(
            v_accounting_enabled,
            true
          ),
        'base_currency',
          coalesce(
            v_base_currency,
            'ZAR'
          ),
        'accounting_basis',
          coalesce(
            v_accounting_basis,
            'accrual'
          ),
        'vat_registered',
          coalesce(
            v_vat_registered,
            false
          )
      ),

    'balances',
      jsonb_build_object(
        'assets',
          round(v_assets, 2),
        'liabilities',
          round(v_liabilities, 2),
        'equity',
          round(v_equity, 2),
        'revenue',
          round(v_revenue, 2),
        'expenses',
          round(v_expenses, 2),
        'net_profit',
          round(
            v_revenue -
            v_expenses,
            2
          )
      ),

    'journals',
      jsonb_build_object(
        'posted',
          v_posted_count,
        'draft',
          v_draft_count,
        'pending_approval',
          v_pending_count
      ),

    'current_period',
      v_current_period
  );

end;
$$;


revoke all
on function
public.get_accounting_overview()
from public;

grant execute
on function
public.get_accounting_overview()
to authenticated;


-- ============================================================
-- END
-- ============================================================
