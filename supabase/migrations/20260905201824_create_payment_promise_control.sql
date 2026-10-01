create table if not exists public.debtor_payment_promise (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  customer_id uuid not null references public.customer(id) on delete cascade,
  promised_amount numeric(14,2) not null check (promised_amount > 0),
  promised_payment_date date not null,
  promise_start_date date not null default current_date,
  status text not null default 'active' check (status in ('active','kept','partial','broken','cancelled')),
  paid_during_promise numeric(14,2) not null default 0 check (paid_during_promise >= 0),
  shortfall numeric(14,2) not null default 0 check (shortfall >= 0),
  fulfilled_at timestamptz,
  broken_at timestamptz,
  cancelled_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists debtor_payment_promise_company_customer_idx
  on public.debtor_payment_promise(company_id, customer_id, promised_payment_date desc);

create unique index if not exists debtor_payment_promise_one_active_per_customer
  on public.debtor_payment_promise(company_id, customer_id)
  where status = 'active';

alter table public.debtor_payment_promise enable row level security;

drop policy if exists debtor_payment_promise_select_policy on public.debtor_payment_promise;
create policy debtor_payment_promise_select_policy
on public.debtor_payment_promise
for select
using (
  company_id = public.current_company_id()
  and public.current_user_has_permission('accounting.view')
);

revoke insert, update, delete on public.debtor_payment_promise from authenticated, anon;

grant select on public.debtor_payment_promise to authenticated;

create or replace function public.evaluate_debtor_payment_promise(
  p_promise_id uuid,
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_company_id uuid;
  v_promise public.debtor_payment_promise%rowtype;
  v_paid numeric(14,2) := 0;
  v_status text;
  v_shortfall numeric(14,2) := 0;
  v_previous_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('accounting.view') then
    raise exception 'Permission denied: accounting.view';
  end if;

  v_company_id := public.current_company_id();

  select *
  into v_promise
  from public.debtor_payment_promise
  where id = p_promise_id
    and company_id = v_company_id
  for update;

  if not found then
    raise exception 'Payment promise could not be found.';
  end if;

  if v_promise.status = 'cancelled' then
    return jsonb_build_object(
      'ok', true,
      'promise_id', v_promise.id,
      'status', v_promise.status,
      'paid_during_promise', v_promise.paid_during_promise,
      'shortfall', v_promise.shortfall
    );
  end if;

  select round(coalesce(sum(ip.amount),0),2)
  into v_paid
  from public.invoice_payment ip
  where ip.company_id = v_company_id
    and ip.customer_id = v_promise.customer_id
    and ip.payment_date >= v_promise.promise_start_date
    and ip.payment_date <= least(p_as_of_date, v_promise.promised_payment_date);

  v_shortfall := round(greatest(v_promise.promised_amount - v_paid, 0),2);
  v_previous_status := v_promise.status;

  if v_paid + 0.009 >= v_promise.promised_amount then
    v_status := 'kept';
  elsif p_as_of_date > v_promise.promised_payment_date then
    if v_paid > 0 then
      v_status := 'partial';
    else
      v_status := 'broken';
    end if;
  else
    v_status := 'active';
  end if;

  update public.debtor_payment_promise
  set status = v_status,
      paid_during_promise = v_paid,
      shortfall = v_shortfall,
      fulfilled_at = case when v_status = 'kept' then coalesce(fulfilled_at, now()) else null end,
      broken_at = case when v_status in ('partial','broken') then coalesce(broken_at, now()) else null end,
      updated_at = now()
  where id = v_promise.id;

  if v_status is distinct from v_previous_status then
    insert into public.debtor_collection_activity(
      company_id,
      customer_id,
      activity_type,
      note,
      created_by
    )
    values (
      v_company_id,
      v_promise.customer_id,
      'promise',
      case
        when v_status = 'kept' then
          format('Payment promise kept. Promised R%s by %s; received R%s.',
            to_char(v_promise.promised_amount,'FM999999999990.00'),
            to_char(v_promise.promised_payment_date,'DD Mon YYYY'),
            to_char(v_paid,'FM999999999990.00'))
        when v_status = 'partial' then
          format('Payment promise partially kept. Promised R%s by %s; received R%s; shortfall R%s.',
            to_char(v_promise.promised_amount,'FM999999999990.00'),
            to_char(v_promise.promised_payment_date,'DD Mon YYYY'),
            to_char(v_paid,'FM999999999990.00'),
            to_char(v_shortfall,'FM999999999990.00'))
        when v_status = 'broken' then
          format('Payment promise broken. Promised R%s by %s; no qualifying payment was received.',
            to_char(v_promise.promised_amount,'FM999999999990.00'),
            to_char(v_promise.promised_payment_date,'DD Mon YYYY'))
        else
          format('Payment promise status changed to %s.', v_status)
      end,
      null
    );
  end if;

  if v_status = 'kept' then
    update public.debtor_collection_control
    set promised_payment_date = null,
        promised_amount = null,
        collection_status = case when collection_status = 'promise_to_pay' then 'normal' else collection_status end,
        next_follow_up_date = null,
        updated_at = now()
    where company_id = v_company_id
      and customer_id = v_promise.customer_id;
  elsif v_status in ('partial','broken') then
    update public.debtor_collection_control
    set collection_status = case
          when collection_status in ('disputed','credit_hold','legal') then collection_status
          else 'follow_up'
        end,
        next_follow_up_date = least(coalesce(next_follow_up_date, p_as_of_date), p_as_of_date),
        updated_at = now()
    where company_id = v_company_id
      and customer_id = v_promise.customer_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'promise_id', v_promise.id,
    'status', v_status,
    'promised_amount', v_promise.promised_amount,
    'promised_payment_date', v_promise.promised_payment_date,
    'paid_during_promise', v_paid,
    'shortfall', v_shortfall
  );
end;
$function$;

create or replace function public.create_debtor_payment_promise(
  p_customer_id uuid,
  p_promised_amount numeric,
  p_promised_payment_date date,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_company_id uuid;
  v_promise_id uuid;
  v_outstanding numeric(14,2) := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('accounting.debtors.manage') then
    raise exception 'Permission denied: accounting.debtors.manage';
  end if;

  if p_promised_amount is null or p_promised_amount <= 0 then
    raise exception 'Promised amount must be greater than zero.';
  end if;

  if p_promised_payment_date is null or p_promised_payment_date < current_date then
    raise exception 'Promised payment date cannot be in the past.';
  end if;

  v_company_id := public.current_company_id();

  if not exists (
    select 1 from public.customer
    where id = p_customer_id and company_id = v_company_id
  ) then
    raise exception 'Customer could not be found.';
  end if;

  select round(coalesce(sum(i.balance_due),0),2)
  into v_outstanding
  from public.invoice i
  where i.company_id = v_company_id
    and i.customer_id = p_customer_id
    and i.status not in ('draft','cancelled','paid')
    and i.balance_due > 0.009;

  if v_outstanding <= 0 then
    raise exception 'This customer has no outstanding invoice balance.';
  end if;

  if p_promised_amount > v_outstanding + 0.009 then
    raise exception 'Promised amount cannot exceed the current outstanding balance of R%.',
      to_char(v_outstanding,'FM999999999990.00');
  end if;

  update public.debtor_payment_promise
  set status = 'cancelled',
      cancelled_at = now(),
      updated_at = now()
  where company_id = v_company_id
    and customer_id = p_customer_id
    and status = 'active';

  insert into public.debtor_payment_promise(
    company_id,
    customer_id,
    promised_amount,
    promised_payment_date,
    promise_start_date,
    notes,
    created_by
  )
  values (
    v_company_id,
    p_customer_id,
    round(p_promised_amount,2),
    p_promised_payment_date,
    current_date,
    nullif(trim(coalesce(p_notes,'')),''),
    auth.uid()
  )
  returning id into v_promise_id;

  insert into public.debtor_collection_control(
    company_id,
    customer_id,
    collection_status,
    next_follow_up_date,
    promised_payment_date,
    promised_amount,
    created_by,
    updated_by
  )
  values (
    v_company_id,
    p_customer_id,
    'promise_to_pay',
    p_promised_payment_date,
    p_promised_payment_date,
    round(p_promised_amount,2),
    auth.uid(),
    auth.uid()
  )
  on conflict (company_id,customer_id)
  do update set
    collection_status = case
      when debtor_collection_control.collection_status in ('disputed','credit_hold','legal')
        then debtor_collection_control.collection_status
      else 'promise_to_pay'
    end,
    next_follow_up_date = excluded.next_follow_up_date,
    promised_payment_date = excluded.promised_payment_date,
    promised_amount = excluded.promised_amount,
    updated_by = auth.uid(),
    updated_at = now();

  insert into public.debtor_collection_activity(
    company_id,
    customer_id,
    activity_type,
    note,
    created_by
  )
  values (
    v_company_id,
    p_customer_id,
    'promise',
    format('Payment promise recorded: R%s due by %s.',
      to_char(round(p_promised_amount,2),'FM999999999990.00'),
      to_char(p_promised_payment_date,'DD Mon YYYY')),
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'promise_id', v_promise_id,
    'customer_id', p_customer_id,
    'promised_amount', round(p_promised_amount,2),
    'promised_payment_date', p_promised_payment_date,
    'outstanding_at_creation', v_outstanding,
    'status', 'active'
  );
end;
$function$;

create or replace function public.get_customer_payment_promises(
  p_customer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
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

  perform public.evaluate_debtor_payment_promise(id, current_date)
  from public.debtor_payment_promise
  where company_id = v_company_id
    and customer_id = p_customer_id
    and status = 'active';

  select jsonb_build_object(
    'ok', true,
    'customer_id', p_customer_id,
    'promises', coalesce(jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'promised_amount', p.promised_amount,
        'promised_payment_date', p.promised_payment_date,
        'promise_start_date', p.promise_start_date,
        'status', p.status,
        'paid_during_promise', p.paid_during_promise,
        'shortfall', p.shortfall,
        'fulfilled_at', p.fulfilled_at,
        'broken_at', p.broken_at,
        'cancelled_at', p.cancelled_at,
        'notes', p.notes,
        'created_at', p.created_at
      ) order by p.created_at desc
    ), '[]'::jsonb)
  )
  into v_result
  from public.debtor_payment_promise p
  where p.company_id = v_company_id
    and p.customer_id = p_customer_id;

  return v_result;
end;
$function$;

create or replace function public.refresh_payment_promises(
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_company_id uuid;
  v_id uuid;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('accounting.view') then
    raise exception 'Permission denied: accounting.view';
  end if;

  v_company_id := public.current_company_id();

  for v_id in
    select id
    from public.debtor_payment_promise
    where company_id = v_company_id
      and status = 'active'
  loop
    perform public.evaluate_debtor_payment_promise(v_id, p_as_of_date);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'as_of_date', p_as_of_date,
    'evaluated_count', v_count
  );
end;
$function$;

create or replace function public.handle_invoice_payment_promise_evaluation()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id uuid;
begin
  for v_id in
    select id
    from public.debtor_payment_promise
    where company_id = new.company_id
      and customer_id = new.customer_id
      and status = 'active'
  loop
    perform public.evaluate_debtor_payment_promise(v_id, new.payment_date);
  end loop;

  return new;
end;
$function$;

drop trigger if exists invoice_payment_promise_evaluation_trigger on public.invoice_payment;
create trigger invoice_payment_promise_evaluation_trigger
after insert on public.invoice_payment
for each row
execute function public.handle_invoice_payment_promise_evaluation();

-- Seed structured promise records for any currently active legacy promise-to-pay controls.
insert into public.debtor_payment_promise(
  company_id,
  customer_id,
  promised_amount,
  promised_payment_date,
  promise_start_date,
  notes,
  created_by
)
select
  d.company_id,
  d.customer_id,
  d.promised_amount,
  d.promised_payment_date,
  current_date,
  'Migrated from existing collection promise control.',
  d.created_by
from public.debtor_collection_control d
where d.collection_status = 'promise_to_pay'
  and d.promised_amount is not null
  and d.promised_amount > 0
  and d.promised_payment_date is not null
  and not exists (
    select 1
    from public.debtor_payment_promise p
    where p.company_id = d.company_id
      and p.customer_id = d.customer_id
      and p.status = 'active'
  );;
