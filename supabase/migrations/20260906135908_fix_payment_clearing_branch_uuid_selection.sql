create or replace function public.create_payment_clearing_settlement(
  p_clearing_line_ids uuid[],
  p_settlement_date date default current_date,
  p_destination text default 'bank',
  p_fee_amount numeric default 0,
  p_reference text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company_id uuid;
  v_clearing_id uuid;
  v_destination_id uuid;
  v_fee_account_id uuid;
  v_branch_id uuid;
  v_branch_count int;
  v_requested_count int;
  v_found_count int;
  v_gross numeric(14,2);
  v_fee numeric(14,2);
  v_net numeric(14,2);
  v_number text;
  v_settlement_id uuid;
  v_journal_id uuid;
  v_lines jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('accounting.bank_reconcile') then
    raise exception 'Permission denied: accounting.bank_reconcile';
  end if;

  if p_clearing_line_ids is null or coalesce(array_length(p_clearing_line_ids,1),0)=0 then
    raise exception 'Select at least one clearing receipt.';
  end if;

  if p_settlement_date is null then raise exception 'Settlement date is required.'; end if;
  if p_settlement_date>current_date then raise exception 'Actual bank settlement cannot be future-dated.'; end if;
  if lower(trim(coalesce(p_destination,''))) not in ('bank','cash') then
    raise exception 'Destination must be bank or cash.';
  end if;

  v_company_id := public.current_company_id();
  v_fee := round(coalesce(p_fee_amount,0),2);
  if v_fee<0 then raise exception 'Settlement fee cannot be negative.'; end if;

  select id into v_clearing_id from public.accounting_account
  where company_id=v_company_id and system_key='payment_clearing' and is_active=true limit 1;

  select id into v_destination_id from public.accounting_account
  where company_id=v_company_id
    and system_key=case when lower(trim(p_destination))='bank' then 'bank' else 'cash_on_hand' end
    and is_active=true limit 1;

  select id into v_fee_account_id from public.accounting_account
  where company_id=v_company_id and system_key='bank_fees' and is_active=true limit 1;

  if v_clearing_id is null or v_destination_id is null then
    raise exception 'Payment Clearing or destination account is not configured.';
  end if;
  if v_fee>0 and v_fee_account_id is null then raise exception 'Bank Charges account is not configured.'; end if;

  select count(*) into v_requested_count
  from (select distinct unnest(p_clearing_line_ids) as id) x;
  if v_requested_count<>array_length(p_clearing_line_ids,1) then
    raise exception 'Duplicate clearing receipts were selected.';
  end if;

  select
    count(*),
    count(distinct je.branch_id),
    (array_agg(distinct je.branch_id))[1],
    round(sum(jl.debit-jl.credit),2)
  into v_found_count,v_branch_count,v_branch_id,v_gross
  from public.journal_line jl
  join public.journal_entry je
    on je.id=jl.journal_entry_id and je.company_id=jl.company_id and je.status='posted'
  where jl.company_id=v_company_id
    and jl.id=any(p_clearing_line_ids)
    and jl.account_id=v_clearing_id
    and (jl.debit-jl.credit)>0.009
    and je.entry_date<=p_settlement_date
    and not exists (
      select 1
      from public.payment_clearing_settlement_item si
      join public.payment_clearing_settlement s on s.id=si.settlement_id and s.company_id=si.company_id
      where si.company_id=v_company_id
        and si.clearing_journal_line_id=jl.id
        and s.status='posted'
    );

  if v_found_count<>v_requested_count then
    raise exception 'One or more selected receipts are invalid, already settled, or dated after the settlement date.';
  end if;
  if v_branch_count<>1 or v_branch_id is null then
    raise exception 'A settlement batch must contain receipts from one branch only.';
  end if;
  if coalesce(v_gross,0)<=0 then raise exception 'Settlement gross amount must be greater than zero.'; end if;
  if v_fee>v_gross then raise exception 'Settlement fee cannot exceed the gross clearing amount.'; end if;

  v_net := round(v_gross-v_fee,2);
  v_number := public.generate_payment_settlement_number(v_company_id);

  insert into public.payment_clearing_settlement(
    company_id,branch_id,settlement_number,settlement_date,destination_account_id,
    gross_amount,fee_amount,net_amount,reference,notes,status,created_by
  ) values (
    v_company_id,v_branch_id,v_number,p_settlement_date,v_destination_id,
    v_gross,v_fee,v_net,nullif(trim(coalesce(p_reference,'')),''),
    nullif(trim(coalesce(p_notes,'')),''),'posted',auth.uid()
  ) returning id into v_settlement_id;

  insert into public.payment_clearing_settlement_item(
    settlement_id,company_id,clearing_journal_line_id,source_type,source_id,source_event,amount
  )
  select
    v_settlement_id,v_company_id,jl.id,je.source_type,je.source_id,je.source_event,
    round(jl.debit-jl.credit,2)
  from public.journal_line jl
  join public.journal_entry je on je.id=jl.journal_entry_id and je.company_id=jl.company_id
  where jl.company_id=v_company_id and jl.id=any(p_clearing_line_ids);

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_id',v_destination_id,
      'description','Payment settlement · '||v_number,
      'debit',v_net,'credit',0,
      'metadata',jsonb_build_object('role','settlement_destination','settlement_number',v_number)
    )
  );

  if v_fee>0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_id',v_fee_account_id,
        'description','Payment processing fee · '||v_number,
        'debit',v_fee,'credit',0,
        'metadata',jsonb_build_object('role','processing_fee','settlement_number',v_number)
      )
    );
  end if;

  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object(
      'account_id',v_clearing_id,
      'description','Clear received payments · '||v_number,
      'debit',0,'credit',v_gross,
      'metadata',jsonb_build_object('role','payment_clearing_settlement','settlement_number',v_number)
    )
  );

  v_journal_id := public.create_automatic_accounting_journal(
    v_company_id,v_branch_id,p_settlement_date,
    'Payment Clearing settlement · '||v_number,
    coalesce(nullif(trim(coalesce(p_reference,'')),''),v_number),
    'payment_settlement',v_settlement_id,'posted','ZAR',auth.uid(),v_lines,null
  );

  update public.payment_clearing_settlement
  set journal_entry_id=v_journal_id,updated_at=now()
  where id=v_settlement_id;

  return jsonb_build_object(
    'ok',true,
    'settlement_id',v_settlement_id,
    'settlement_number',v_number,
    'gross_amount',v_gross,
    'fee_amount',v_fee,
    'net_amount',v_net,
    'journal_entry_id',v_journal_id,
    'message','Payment Clearing settled. Bank/cash and any processing fee were posted automatically.'
  );
end;
$$;

grant execute on function public.create_payment_clearing_settlement(uuid[],date,text,numeric,text,text) to authenticated;;
