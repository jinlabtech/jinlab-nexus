-- ============================================================
-- JINLAB Nexus
-- Accounting Sprint 19.1H-A
-- Trial Balance
-- ============================================================

create or replace function
public.get_trial_balance(
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_currency text := 'ZAR';

  v_rows jsonb;

  v_total_debit numeric(14,2) := 0;
  v_total_credit numeric(14,2) := 0;
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


  select
    coalesce(
      base_currency,
      'ZAR'
    )
  into v_currency
  from public.company_finance_settings
  where company_id =
    v_company_id;


  with balances as (
    select
      aa.id,
      aa.code,
      aa.name,
      aa.account_type,
      aa.account_subtype,
      aa.normal_balance,
      aa.is_system,

      round(
        coalesce(
          sum(jl.debit),
          0
        ),
        2
      ) as total_debit,

      round(
        coalesce(
          sum(jl.credit),
          0
        ),
        2
      ) as total_credit

    from public.accounting_account aa

    left join public.journal_line jl
      on jl.account_id =
        aa.id
      and jl.company_id =
        v_company_id

    left join public.journal_entry je
      on je.id =
        jl.journal_entry_id
      and je.company_id =
        v_company_id
      and je.status =
        'posted'
      and je.entry_date <=
        coalesce(
          p_as_of_date,
          current_date
        )

    where
      aa.company_id =
        v_company_id

    group by
      aa.id,
      aa.code,
      aa.name,
      aa.account_type,
      aa.account_subtype,
      aa.normal_balance,
      aa.is_system
  ),

  calculated as (
    select
      *,

      case
        when normal_balance =
          'debit'
        then
          greatest(
            total_debit -
            total_credit,
            0
          )
        else
          greatest(
            total_credit -
            total_debit,
            0
          )
      end
      as balance,

      case
        when total_debit >
             total_credit
        then
          total_debit -
          total_credit
        else 0
      end
      as trial_debit,

      case
        when total_credit >
             total_debit
        then
          total_credit -
          total_debit
        else 0
      end
      as trial_credit

    from balances
  )

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'account_id',
            id,
          'code',
            code,
          'name',
            name,
          'account_type',
            account_type,
          'account_subtype',
            account_subtype,
          'normal_balance',
            normal_balance,
          'is_system',
            is_system,
          'total_debit',
            total_debit,
          'total_credit',
            total_credit,
          'trial_debit',
            trial_debit,
          'trial_credit',
            trial_credit,
          'balance',
            balance
        )
        order by code
      ),
      '[]'::jsonb
    ),

    coalesce(
      sum(trial_debit),
      0
    ),

    coalesce(
      sum(trial_credit),
      0
    )

  into
    v_rows,
    v_total_debit,
    v_total_credit

  from calculated;


  return jsonb_build_object(
    'ok',
      true,

    'company_id',
      v_company_id,

    'as_of_date',
      coalesce(
        p_as_of_date,
        current_date
      ),

    'currency',
      v_currency,

    'total_debit',
      round(
        v_total_debit,
        2
      ),

    'total_credit',
      round(
        v_total_credit,
        2
      ),

    'balanced',
      round(
        v_total_debit,
        2
      ) =
      round(
        v_total_credit,
        2
      ),

    'rows',
      v_rows
  );

end;
$$;


revoke all
on function
public.get_trial_balance(date)
from public;

grant execute
on function
public.get_trial_balance(date)
to authenticated;
