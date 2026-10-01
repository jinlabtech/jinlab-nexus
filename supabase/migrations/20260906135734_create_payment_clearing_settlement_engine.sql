insert into public.permissions(permission_name)
select 'accounting.bank_reconcile'
where not exists (
  select 1 from public.permissions where permission_name='accounting.bank_reconcile'
);

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.permission_name='accounting.bank_reconcile'
where lower(r.role_name) in ('owner','admin')
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id=r.id and rp.permission_id=p.id
  );

create table if not exists public.payment_clearing_settlement (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  branch_id uuid not null references public.branch(id),
  settlement_number text not null,
  settlement_date date not null default current_date,
  destination_account_id uuid not null references public.accounting_account(id),
  gross_amount numeric(14,2) not null check (gross_amount > 0),
  fee_amount numeric(14,2) not null default 0 check (fee_amount >= 0),
  net_amount numeric(14,2) not null check (net_amount >= 0),
  reference text,
  notes text,
  status text not null default 'posted' check (status in ('posted','reversed')),
  journal_entry_id uuid references public.journal_entry(id),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,settlement_number)
);

create table if not exists public.payment_clearing_settlement_item (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.payment_clearing_settlement(id) on delete cascade,
  company_id uuid not null references public.company(id) on delete cascade,
  clearing_journal_line_id uuid not null references public.journal_line(id),
  source_type text not null,
  source_id uuid,
  source_event text,
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique(company_id,clearing_journal_line_id)
);

create index if not exists payment_clearing_settlement_company_date_idx
  on public.payment_clearing_settlement(company_id,settlement_date desc);
create index if not exists payment_clearing_settlement_branch_idx
  on public.payment_clearing_settlement(company_id,branch_id,settlement_date desc);
create index if not exists payment_clearing_settlement_item_settlement_idx
  on public.payment_clearing_settlement_item(settlement_id);

alter table public.payment_clearing_settlement enable row level security;
alter table public.payment_clearing_settlement_item enable row level security;

drop policy if exists payment_clearing_settlement_select on public.payment_clearing_settlement;
create policy payment_clearing_settlement_select
on public.payment_clearing_settlement
for select
to authenticated
using (
  company_id=public.current_company_id()
  and public.current_user_has_permission('accounting.view')
);

drop policy if exists payment_clearing_settlement_item_select on public.payment_clearing_settlement_item;
create policy payment_clearing_settlement_item_select
on public.payment_clearing_settlement_item
for select
to authenticated
using (
  company_id=public.current_company_id()
  and public.current_user_has_permission('accounting.view')
);

revoke insert,update,delete on public.payment_clearing_settlement from authenticated;
revoke insert,update,delete on public.payment_clearing_settlement_item from authenticated;
grant select on public.payment_clearing_settlement to authenticated;
grant select on public.payment_clearing_settlement_item to authenticated;

create or replace function public.generate_payment_settlement_number(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_prefix text := 'SET-' || to_char(current_date,'YYYYMM') || '-';
  v_next int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':payment_settlement',0));

  select coalesce(max(nullif(regexp_replace(settlement_number,'^.*-',''),'')::int),0)+1
  into v_next
  from public.payment_clearing_settlement
  where company_id=p_company_id
    and settlement_number like v_prefix || '%';

  return v_prefix || lpad(v_next::text,5,'0');
end;
$$;

create or replace function public.get_payment_clearing_workspace(
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company_id uuid;
  v_clearing_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('accounting.view') then
    raise exception 'Permission denied: accounting.view';
  end if;
  if p_as_of_date is null then raise exception 'As-of date is required.'; end if;

  v_company_id := public.current_company_id();

  select id into v_clearing_id
  from public.accounting_account
  where company_id=v_company_id and system_key='payment_clearing' and is_active=true
  limit 1;

  if v_clearing_id is null then raise exception 'Payment Clearing account is not configured.'; end if;

  with outstanding as (
    select
      jl.id as clearing_line_id,
      je.id as journal_id,
      je.entry_number,
      je.entry_date,
      je.branch_id,
      b.branch_name,
      je.description,
      je.source_type,
      je.source_id,
      je.source_event,
      round(jl.debit-jl.credit,2) as amount,
      coalesce(jl.metadata->>'payment_method','other') as payment_method,
      nullif(jl.metadata->>'payment_reference','') as payment_reference,
      nullif(jl.metadata->>'invoice_number','') as invoice_number
    from public.journal_line jl
    join public.journal_entry je
      on je.id=jl.journal_entry_id and je.company_id=jl.company_id and je.status='posted'
    left join public.branch b on b.id=je.branch_id and b.company_id=je.company_id
    where jl.company_id=v_company_id
      and jl.account_id=v_clearing_id
      and je.entry_date<=p_as_of_date
      and (jl.debit-jl.credit)>0.009
      and not exists (
        select 1
        from public.payment_clearing_settlement_item si
        join public.payment_clearing_settlement s on s.id=si.settlement_id and s.company_id=si.company_id
        where si.company_id=v_company_id
          and si.clearing_journal_line_id=jl.id
          and s.status='posted'
      )
  ),
  future_receipts as (
    select count(*)::int as count,
           coalesce(round(sum(jl.debit-jl.credit),2),0) as amount
    from public.journal_line jl
    join public.journal_entry je
      on je.id=jl.journal_entry_id and je.company_id=jl.company_id and je.status='posted'
    where jl.company_id=v_company_id
      and jl.account_id=v_clearing_id
      and je.entry_date>p_as_of_date
      and (jl.debit-jl.credit)>0.009
  ),
  recent_settlements as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',s.id,
      'settlement_number',s.settlement_number,
      'settlement_date',s.settlement_date,
      'branch_id',s.branch_id,
      'branch_name',b.branch_name,
      'gross_amount',s.gross_amount,
      'fee_amount',s.fee_amount,
      'net_amount',s.net_amount,
      'reference',s.reference,
      'status',s.status
    ) order by s.settlement_date desc,s.created_at desc),'[]'::jsonb) as rows
    from (
      select * from public.payment_clearing_settlement
      where company_id=v_company_id
      order by settlement_date desc,created_at desc
      limit 20
    ) s
    left join public.branch b on b.id=s.branch_id and b.company_id=s.company_id
  )
  select jsonb_build_object(
    'ok',true,
    'as_of_date',p_as_of_date,
    'summary',jsonb_build_object(
      'outstanding_total',coalesce((select round(sum(amount),2) from outstanding),0),
      'outstanding_count',coalesce((select count(*)::int from outstanding),0),
      'future_dated_receipt_count',(select count from future_receipts),
      'future_dated_receipt_amount',(select amount from future_receipts)
    ),
    'outstanding',coalesce((select jsonb_agg(jsonb_build_object(
      'clearing_line_id',clearing_line_id,
      'journal_id',journal_id,
      'entry_number',entry_number,
      'entry_date',entry_date,
      'branch_id',branch_id,
      'branch_name',branch_name,
      'description',description,
      'source_type',source_type,
      'source_id',source_id,
      'source_event',source_event,
      'amount',amount,
      'payment_method',payment_method,
      'payment_reference',payment_reference,
      'invoice_number',invoice_number
    ) order by entry_date,entry_number) from outstanding),'[]'::jsonb),
    'recent_settlements',(select rows from recent_settlements)
  ) into v_result;

  return v_result;
end;
$$;

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
    min(je.branch_id),
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

grant execute on function public.get_payment_clearing_workspace(date) to authenticated;
grant execute on function public.create_payment_clearing_settlement(uuid[],date,text,numeric,text,text) to authenticated;;
