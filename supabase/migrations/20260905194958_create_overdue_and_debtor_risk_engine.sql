create table if not exists public.debtor_risk_snapshot (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  customer_id uuid not null references public.customer(id) on delete cascade,
  as_of_date date not null,
  outstanding numeric(14,2) not null default 0,
  overdue numeric(14,2) not null default 0,
  current_amount numeric(14,2) not null default 0,
  due_today numeric(14,2) not null default 0,
  days_1_30 numeric(14,2) not null default 0,
  days_31_60 numeric(14,2) not null default 0,
  days_61_90 numeric(14,2) not null default 0,
  days_90_plus numeric(14,2) not null default 0,
  oldest_due_date date,
  max_days_overdue integer not null default 0,
  open_invoice_count integer not null default 0,
  overdue_invoice_count integer not null default 0,
  risk_level text not null default 'current'
    check (risk_level in ('current','due_today','watch','elevated','high','critical')),
  ageing_bucket text not null default 'current'
    check (ageing_bucket in ('current','due_today','1_30','31_60','61_90','90_plus')),
  recommended_action text,
  evaluated_at timestamptz not null default now(),
  unique(company_id, customer_id)
);

alter table public.debtor_risk_snapshot enable row level security;

drop policy if exists debtor_risk_snapshot_select on public.debtor_risk_snapshot;
create policy debtor_risk_snapshot_select
on public.debtor_risk_snapshot
for select
to authenticated
using (
  company_id = public.current_company_id()
  and public.current_user_has_permission('accounting.view')
);

revoke insert, update, delete on public.debtor_risk_snapshot from authenticated;

grant select on public.debtor_risk_snapshot to authenticated;

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
  invoice_due_date date;
  current_status text;
begin
  select coalesce(sum(amount), 0)
  into paid_total
  from public.invoice_payment
  where invoice_id = target_invoice_id;

  select total_amount, due_date, status
  into invoice_total, invoice_due_date, current_status
  from public.invoice
  where id = target_invoice_id
  for update;

  if invoice_total is null then
    raise exception 'Invoice could not be found.';
  end if;

  if paid_total > invoice_total then
    raise exception 'Payments cannot exceed the invoice total.';
  end if;

  update public.invoice
  set
    amount_paid = paid_total,
    balance_due = greatest(invoice_total - paid_total, 0),
    status = case
      when current_status = 'cancelled' and paid_total = 0 then 'cancelled'
      when paid_total >= invoice_total then 'paid'
      when invoice_due_date is not null and invoice_due_date < current_date then 'overdue'
      when paid_total > 0 then 'partially_paid'
      else 'issued'
    end,
    updated_at = now()
  where id = target_invoice_id;
end;
$$;

create or replace function public.refresh_overdue_invoice_statuses(
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_marked_overdue integer := 0;
  v_restored_current integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('accounting.view') then
    raise exception 'Permission denied: accounting.view';
  end if;

  v_company_id := public.current_company_id();

  update public.invoice
  set status = 'overdue', updated_at = now()
  where company_id = v_company_id
    and status in ('issued','partially_paid')
    and balance_due > 0.009
    and due_date is not null
    and due_date < p_as_of_date;
  get diagnostics v_marked_overdue = row_count;

  update public.invoice
  set status = case when amount_paid > 0.009 then 'partially_paid' else 'issued' end,
      updated_at = now()
  where company_id = v_company_id
    and status = 'overdue'
    and balance_due > 0.009
    and due_date is not null
    and due_date >= p_as_of_date;
  get diagnostics v_restored_current = row_count;

  return jsonb_build_object(
    'ok', true,
    'as_of_date', p_as_of_date,
    'marked_overdue', v_marked_overdue,
    'restored_current', v_restored_current
  );
end;
$$;

grant execute on function public.refresh_overdue_invoice_statuses(date) to authenticated;

create or replace function public.refresh_debtor_risk_snapshots(
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('accounting.view') then
    raise exception 'Permission denied: accounting.view';
  end if;

  v_company_id := public.current_company_id();

  perform public.refresh_overdue_invoice_statuses(p_as_of_date);

  delete from public.debtor_risk_snapshot
  where company_id = v_company_id;

  insert into public.debtor_risk_snapshot (
    company_id,
    customer_id,
    as_of_date,
    outstanding,
    overdue,
    current_amount,
    due_today,
    days_1_30,
    days_31_60,
    days_61_90,
    days_90_plus,
    oldest_due_date,
    max_days_overdue,
    open_invoice_count,
    overdue_invoice_count,
    risk_level,
    ageing_bucket,
    recommended_action,
    evaluated_at
  )
  select
    i.company_id,
    i.customer_id,
    p_as_of_date,
    round(sum(greatest(i.total_amount - coalesce(p.paid_to_date,0),0)),2),
    round(sum(greatest(i.total_amount - coalesce(p.paid_to_date,0),0)) filter (
      where coalesce(i.due_date,i.invoice_date) < p_as_of_date
    ),2),
    round(coalesce(sum(greatest(i.total_amount - coalesce(p.paid_to_date,0),0)) filter (
      where coalesce(i.due_date,i.invoice_date) > p_as_of_date
    ),0),2),
    round(coalesce(sum(greatest(i.total_amount - coalesce(p.paid_to_date,0),0)) filter (
      where coalesce(i.due_date,i.invoice_date) = p_as_of_date
    ),0),2),
    round(coalesce(sum(greatest(i.total_amount - coalesce(p.paid_to_date,0),0)) filter (
      where p_as_of_date - coalesce(i.due_date,i.invoice_date) between 1 and 30
    ),0),2),
    round(coalesce(sum(greatest(i.total_amount - coalesce(p.paid_to_date,0),0)) filter (
      where p_as_of_date - coalesce(i.due_date,i.invoice_date) between 31 and 60
    ),0),2),
    round(coalesce(sum(greatest(i.total_amount - coalesce(p.paid_to_date,0),0)) filter (
      where p_as_of_date - coalesce(i.due_date,i.invoice_date) between 61 and 90
    ),0),2),
    round(coalesce(sum(greatest(i.total_amount - coalesce(p.paid_to_date,0),0)) filter (
      where p_as_of_date - coalesce(i.due_date,i.invoice_date) > 90
    ),0),2),
    min(coalesce(i.due_date,i.invoice_date)),
    greatest(max(p_as_of_date - coalesce(i.due_date,i.invoice_date)),0),
    count(*)::int,
    count(*) filter (where coalesce(i.due_date,i.invoice_date) < p_as_of_date)::int,
    case
      when max(p_as_of_date - coalesce(i.due_date,i.invoice_date)) > 90 then 'critical'
      when max(p_as_of_date - coalesce(i.due_date,i.invoice_date)) between 61 and 90 then 'high'
      when max(p_as_of_date - coalesce(i.due_date,i.invoice_date)) between 31 and 60 then 'elevated'
      when max(p_as_of_date - coalesce(i.due_date,i.invoice_date)) between 1 and 30 then 'watch'
      when bool_or(coalesce(i.due_date,i.invoice_date) = p_as_of_date) then 'due_today'
      else 'current'
    end,
    case
      when max(p_as_of_date - coalesce(i.due_date,i.invoice_date)) > 90 then '90_plus'
      when max(p_as_of_date - coalesce(i.due_date,i.invoice_date)) between 61 and 90 then '61_90'
      when max(p_as_of_date - coalesce(i.due_date,i.invoice_date)) between 31 and 60 then '31_60'
      when max(p_as_of_date - coalesce(i.due_date,i.invoice_date)) between 1 and 30 then '1_30'
      when bool_or(coalesce(i.due_date,i.invoice_date) = p_as_of_date) then 'due_today'
      else 'current'
    end,
    case
      when max(p_as_of_date - coalesce(i.due_date,i.invoice_date)) > 90 then 'Owner/accountant review; consider credit hold and formal escalation.'
      when max(p_as_of_date - coalesce(i.due_date,i.invoice_date)) between 61 and 90 then 'Escalate collection follow-up and review further credit.'
      when max(p_as_of_date - coalesce(i.due_date,i.invoice_date)) between 31 and 60 then 'Prioritise direct collection contact and payment commitment.'
      when max(p_as_of_date - coalesce(i.due_date,i.invoice_date)) between 1 and 30 then 'Send reminder and schedule follow-up.'
      when bool_or(coalesce(i.due_date,i.invoice_date) = p_as_of_date) then 'Payment is due today; send a courteous reminder.'
      else 'No collection action required.'
    end,
    now()
  from public.invoice i
  left join lateral (
    select sum(ip.amount) as paid_to_date
    from public.invoice_payment ip
    where ip.invoice_id=i.id
      and ip.company_id=i.company_id
      and ip.payment_date <= p_as_of_date
  ) p on true
  where i.company_id = v_company_id
    and i.invoice_date <= p_as_of_date
    and i.status not in ('draft','cancelled')
    and greatest(i.total_amount - coalesce(p.paid_to_date,0),0) > 0.009
  group by i.company_id,i.customer_id;

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'as_of_date', p_as_of_date,
    'customer_count', v_count
  );
end;
$$;

grant execute on function public.refresh_debtor_risk_snapshots(date) to authenticated;

create or replace function public.get_debtor_risk_summary(
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('accounting.view') then
    raise exception 'Permission denied: accounting.view';
  end if;

  v_company_id := public.current_company_id();
  perform public.refresh_debtor_risk_snapshots(p_as_of_date);

  select jsonb_build_object(
    'ok', true,
    'as_of_date', p_as_of_date,
    'summary', jsonb_build_object(
      'total_outstanding', round(coalesce(sum(r.outstanding),0),2),
      'total_overdue', round(coalesce(sum(r.overdue),0),2),
      'due_today', round(coalesce(sum(r.due_today),0),2),
      'current', round(coalesce(sum(r.current_amount),0),2),
      'days_1_30', round(coalesce(sum(r.days_1_30),0),2),
      'days_31_60', round(coalesce(sum(r.days_31_60),0),2),
      'days_61_90', round(coalesce(sum(r.days_61_90),0),2),
      'days_90_plus', round(coalesce(sum(r.days_90_plus),0),2),
      'critical_customers', count(*) filter (where r.risk_level='critical'),
      'high_customers', count(*) filter (where r.risk_level='high'),
      'elevated_customers', count(*) filter (where r.risk_level='elevated'),
      'watch_customers', count(*) filter (where r.risk_level='watch')
    ),
    'customers', coalesce(jsonb_agg(
      jsonb_build_object(
        'customer_id',r.customer_id,
        'customer_name',c.customer_name,
        'outstanding',r.outstanding,
        'overdue',r.overdue,
        'due_today',r.due_today,
        'ageing_bucket',r.ageing_bucket,
        'risk_level',r.risk_level,
        'oldest_due_date',r.oldest_due_date,
        'max_days_overdue',r.max_days_overdue,
        'open_invoice_count',r.open_invoice_count,
        'overdue_invoice_count',r.overdue_invoice_count,
        'recommended_action',r.recommended_action
      ) order by
        case r.risk_level
          when 'critical' then 1
          when 'high' then 2
          when 'elevated' then 3
          when 'watch' then 4
          when 'due_today' then 5
          else 6
        end,
        r.overdue desc,
        c.customer_name
    ),'[]'::jsonb)
  )
  into v_result
  from public.debtor_risk_snapshot r
  join public.customer c on c.id=r.customer_id and c.company_id=r.company_id
  where r.company_id=v_company_id;

  return v_result;
end;
$$;

grant execute on function public.get_debtor_risk_summary(date) to authenticated;
;
