create or replace function public.refresh_debtor_risk_snapshots(
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
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

  -- Serialize snapshot refreshes per company. In development, React Strict Mode
  -- can invoke the same read twice concurrently; without a transaction lock,
  -- two delete/insert refreshes can race on the company/customer unique key.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'debtor-risk:' || v_company_id::text,
      0
    )
  );

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
    round(coalesce(sum(greatest(i.total_amount - coalesce(p.paid_to_date,0),0)) filter (
      where coalesce(i.due_date,i.invoice_date) < p_as_of_date
    ),0),2),
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
    where ip.invoice_id = i.id
      and ip.company_id = i.company_id
      and ip.payment_date <= p_as_of_date
  ) p on true
  where i.company_id = v_company_id
    and i.invoice_date <= p_as_of_date
    and i.status not in ('draft','cancelled')
    and greatest(i.total_amount - coalesce(p.paid_to_date,0),0) > 0.009
  group by i.company_id, i.customer_id;

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'as_of_date', p_as_of_date,
    'customer_count', v_count
  );
end;
$function$;;
