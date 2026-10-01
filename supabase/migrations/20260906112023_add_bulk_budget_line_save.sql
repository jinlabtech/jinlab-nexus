create or replace function public.save_accounting_budget_lines(
  p_budget_id uuid,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company_id uuid;
  v_budget public.accounting_budget%rowtype;
  v_item jsonb;
  v_account_id uuid;
  v_period_id uuid;
  v_amount numeric;
  v_saved integer:=0;
  v_deleted integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('accounting.budget.manage') then
    raise exception 'Permission denied: accounting.budget.manage';
  end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' then
    raise exception 'Budget lines must be supplied as an array.';
  end if;

  v_company_id:=public.current_company_id();
  select * into v_budget
  from public.accounting_budget
  where id=p_budget_id and company_id=v_company_id
  for update;
  if not found then raise exception 'Budget could not be found.'; end if;
  if v_budget.status<>'draft' then raise exception 'Only draft budgets can be edited.'; end if;

  for v_item in select value from jsonb_array_elements(p_lines)
  loop
    begin
      v_account_id:=(v_item->>'account_id')::uuid;
      v_period_id:=(v_item->>'accounting_period_id')::uuid;
      v_amount:=coalesce((v_item->>'amount')::numeric,0);
    exception when others then
      raise exception 'One or more budget lines are invalid.';
    end;

    if v_amount<0 then raise exception 'Budget amounts cannot be negative.'; end if;

    if not exists (
      select 1 from public.accounting_account a
      where a.id=v_account_id and a.company_id=v_company_id
        and a.is_active=true and a.account_type in ('revenue','expense')
    ) then raise exception 'Budget account is invalid.'; end if;

    if not exists (
      select 1 from public.accounting_period p
      where p.id=v_period_id and p.company_id=v_company_id
        and p.financial_year_id=v_budget.financial_year_id
        and coalesce(p.is_adjustment_period,false)=false
    ) then raise exception 'Budget period is invalid.'; end if;

    if v_amount=0 then
      delete from public.accounting_budget_line
      where budget_id=v_budget.id
        and account_id=v_account_id
        and accounting_period_id=v_period_id;
      if found then v_deleted:=v_deleted+1; end if;
    else
      insert into public.accounting_budget_line(
        budget_id,company_id,account_id,accounting_period_id,amount,created_by,updated_by
      ) values (
        v_budget.id,v_company_id,v_account_id,v_period_id,round(v_amount,2),auth.uid(),auth.uid()
      )
      on conflict (budget_id,account_id,accounting_period_id)
      do update set amount=excluded.amount,updated_by=auth.uid(),updated_at=now();
      v_saved:=v_saved+1;
    end if;
  end loop;

  update public.accounting_budget
  set updated_by=auth.uid(),updated_at=now()
  where id=v_budget.id;

  return jsonb_build_object('ok',true,'budget_id',v_budget.id,'saved',v_saved,'deleted',v_deleted);
end;
$$;

grant execute on function public.save_accounting_budget_lines(uuid,jsonb) to authenticated;;
