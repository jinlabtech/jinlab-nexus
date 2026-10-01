create table if not exists public.debtor_collection_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  customer_id uuid not null references public.customer(id) on delete cascade,
  source_as_of_date date not null,
  risk_level text not null,
  ageing_bucket text not null,
  action_type text not null check (action_type in (
    'reminder','follow_up','escalation','credit_review','legal_review','manual_review','promise_monitor','broken_promise'
  )),
  priority text not null check (priority in ('low','normal','high','urgent')),
  recommended_channel text not null check (recommended_channel in ('email','whatsapp','phone','internal')),
  outstanding numeric(14,2) not null default 0,
  overdue numeric(14,2) not null default 0,
  max_days_overdue integer not null default 0,
  due_on date not null default current_date,
  reason text not null,
  draft_subject text,
  draft_message text,
  status text not null default 'pending' check (status in ('pending','approved','dismissed','completed')),
  decision_note text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists debtor_collection_queue_company_status_idx
  on public.debtor_collection_queue(company_id,status,due_on,priority);

create index if not exists debtor_collection_queue_customer_idx
  on public.debtor_collection_queue(company_id,customer_id,created_at desc);

create unique index if not exists debtor_collection_queue_active_unique
  on public.debtor_collection_queue(company_id,customer_id,action_type)
  where status in ('pending','approved');

alter table public.debtor_collection_queue enable row level security;

drop policy if exists debtor_collection_queue_select on public.debtor_collection_queue;
create policy debtor_collection_queue_select
  on public.debtor_collection_queue
  for select
  using (
    company_id = public.current_company_id()
    and public.current_user_has_permission('accounting.view')
  );

revoke insert, update, delete on public.debtor_collection_queue from authenticated;
grant select on public.debtor_collection_queue to authenticated;

create or replace function public.refresh_debtor_collection_queue(
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_customer record;
  v_control public.debtor_collection_control%rowtype;
  v_action text;
  v_priority text;
  v_channel text;
  v_reason text;
  v_subject text;
  v_message text;
  v_due_on date;
  v_existing_id uuid;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('accounting.view') then
    raise exception 'Permission denied: accounting.view';
  end if;

  if p_as_of_date is null then
    raise exception 'As-of date is required.';
  end if;

  v_company_id := public.current_company_id();

  perform public.refresh_debtor_risk_snapshots(p_as_of_date);

  update public.debtor_collection_queue q
  set status = 'completed',
      decision_note = coalesce(q.decision_note,'Automatically closed because the customer no longer has an actionable debtor risk.'),
      completed_at = coalesce(q.completed_at,now()),
      updated_at = now()
  where q.company_id = v_company_id
    and q.status = 'pending'
    and not exists (
      select 1
      from public.debtor_risk_snapshot r
      where r.company_id = q.company_id
        and r.customer_id = q.customer_id
        and r.outstanding > 0
        and r.risk_level <> 'current'
    );

  for v_customer in
    select
      r.*,
      c.customer_name,
      c.email,
      c.phone,
      c.alternative_phone
    from public.debtor_risk_snapshot r
    join public.customer c
      on c.id = r.customer_id
     and c.company_id = r.company_id
    where r.company_id = v_company_id
      and r.outstanding > 0
      and r.risk_level <> 'current'
  loop
    select *
    into v_control
    from public.debtor_collection_control d
    where d.company_id = v_company_id
      and d.customer_id = v_customer.customer_id;

    v_action := null;
    v_priority := 'normal';
    v_due_on := p_as_of_date;

    if coalesce(v_control.collection_status,'normal') = 'disputed' then
      v_action := 'manual_review';
      v_priority := 'high';
      v_reason := 'Customer account is disputed. Automatic collection messaging should remain paused until the dispute is reviewed.';

    elsif coalesce(v_control.collection_status,'normal') = 'legal' then
      v_action := 'legal_review';
      v_priority := 'urgent';
      v_reason := 'Customer account is already in legal collection status. Review legal next steps instead of sending a routine reminder.';

    elsif coalesce(v_control.collection_status,'normal') = 'promise_to_pay'
          and v_control.promised_payment_date is not null
          and v_control.promised_payment_date >= p_as_of_date then
      v_action := 'promise_monitor';
      v_priority := case when v_control.promised_payment_date = p_as_of_date then 'high' else 'normal' end;
      v_due_on := v_control.promised_payment_date;
      v_reason := format('Customer has an active promise to pay on %s. Monitor the promise before escalating.',to_char(v_control.promised_payment_date,'DD Mon YYYY'));

    elsif coalesce(v_control.collection_status,'normal') = 'promise_to_pay'
          and v_control.promised_payment_date is not null
          and v_control.promised_payment_date < p_as_of_date then
      v_action := 'broken_promise';
      v_priority := 'urgent';
      v_reason := format('Customer missed the promised payment date of %s. Immediate follow-up is recommended.',to_char(v_control.promised_payment_date,'DD Mon YYYY'));

    else
      case v_customer.risk_level
        when 'due_today' then
          v_action := 'reminder';
          v_priority := 'low';
          v_reason := 'Balance is due today. Send a courteous payment reminder.';
        when 'watch' then
          v_action := 'reminder';
          v_priority := 'normal';
          v_reason := format('Account is %s day(s) overdue. Send a payment reminder and confirm receipt.',v_customer.max_days_overdue);
        when 'elevated' then
          v_action := 'follow_up';
          v_priority := 'high';
          v_reason := format('Account is %s day(s) overdue. Direct follow-up is recommended.',v_customer.max_days_overdue);
        when 'high' then
          v_action := 'escalation';
          v_priority := 'high';
          v_reason := format('Account is %s day(s) overdue. Escalate collection activity and review future credit.',v_customer.max_days_overdue);
        when 'critical' then
          if coalesce(v_control.credit_hold,false) then
            v_action := 'legal_review';
            v_reason := format('Account is %s day(s) overdue and already on credit hold. Review legal or recovery action.',v_customer.max_days_overdue);
          else
            v_action := 'credit_review';
            v_reason := format('Account is %s day(s) overdue. Review immediate credit hold and senior collection escalation.',v_customer.max_days_overdue);
          end if;
          v_priority := 'urgent';
        else
          v_action := null;
      end case;
    end if;

    if v_action is null then
      continue;
    end if;

    v_channel := case
      when v_action in ('manual_review','legal_review','credit_review','promise_monitor') then 'internal'
      when nullif(trim(coalesce(v_customer.email,'')),'') is not null then 'email'
      when nullif(trim(coalesce(v_customer.phone,'')),'') is not null
        or nullif(trim(coalesce(v_customer.alternative_phone,'')),'') is not null then 'whatsapp'
      else 'phone'
    end;

    if v_action in ('reminder','follow_up','escalation','broken_promise') then
      v_subject := format('Payment reminder - %s',v_customer.customer_name);
      v_message := format(
        'Dear %s, our records show an outstanding balance of R%s, of which R%s is overdue. Please arrange payment or contact us if you need to discuss the account. Thank you.',
        v_customer.customer_name,
        to_char(v_customer.outstanding,'FM999999990.00'),
        to_char(v_customer.overdue,'FM999999990.00')
      );
    else
      v_subject := null;
      v_message := null;
    end if;

    select q.id
    into v_existing_id
    from public.debtor_collection_queue q
    where q.company_id = v_company_id
      and q.customer_id = v_customer.customer_id
      and q.action_type = v_action
      and q.status in ('pending','approved')
    order by q.created_at desc
    limit 1;

    if v_existing_id is null then
      insert into public.debtor_collection_queue(
        company_id,customer_id,source_as_of_date,risk_level,ageing_bucket,
        action_type,priority,recommended_channel,outstanding,overdue,
        max_days_overdue,due_on,reason,draft_subject,draft_message
      ) values (
        v_company_id,v_customer.customer_id,p_as_of_date,v_customer.risk_level,v_customer.ageing_bucket,
        v_action,v_priority,v_channel,round(v_customer.outstanding,2),round(v_customer.overdue,2),
        v_customer.max_days_overdue,v_due_on,v_reason,v_subject,v_message
      );
      v_count := v_count + 1;
    else
      update public.debtor_collection_queue
      set source_as_of_date = p_as_of_date,
          risk_level = v_customer.risk_level,
          ageing_bucket = v_customer.ageing_bucket,
          priority = v_priority,
          recommended_channel = v_channel,
          outstanding = round(v_customer.outstanding,2),
          overdue = round(v_customer.overdue,2),
          max_days_overdue = v_customer.max_days_overdue,
          due_on = v_due_on,
          reason = v_reason,
          draft_subject = v_subject,
          draft_message = v_message,
          updated_at = now()
      where id = v_existing_id;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'as_of_date',p_as_of_date,
    'new_recommendations',v_count,
    'pending',(
      select count(*) from public.debtor_collection_queue q
      where q.company_id=v_company_id and q.status='pending'
    ),
    'approved',(
      select count(*) from public.debtor_collection_queue q
      where q.company_id=v_company_id and q.status='approved'
    )
  );
end;
$$;

grant execute on function public.refresh_debtor_collection_queue(date) to authenticated;

create or replace function public.get_debtor_collection_queue(
  p_as_of_date date default current_date,
  p_status text default 'pending'
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

  if p_status not in ('pending','approved','dismissed','completed','all') then
    raise exception 'Invalid queue status filter.';
  end if;

  v_company_id := public.current_company_id();
  perform public.refresh_debtor_collection_queue(p_as_of_date);

  select jsonb_build_object(
    'ok',true,
    'as_of_date',p_as_of_date,
    'summary',jsonb_build_object(
      'pending',count(*) filter (where q.status='pending'),
      'approved',count(*) filter (where q.status='approved'),
      'urgent',count(*) filter (where q.status='pending' and q.priority='urgent'),
      'high',count(*) filter (where q.status='pending' and q.priority='high')
    ),
    'items',coalesce(jsonb_agg(
      jsonb_build_object(
        'id',q.id,
        'customer_id',q.customer_id,
        'customer_name',c.customer_name,
        'status',q.status,
        'priority',q.priority,
        'risk_level',q.risk_level,
        'ageing_bucket',q.ageing_bucket,
        'action_type',q.action_type,
        'recommended_channel',q.recommended_channel,
        'outstanding',q.outstanding,
        'overdue',q.overdue,
        'max_days_overdue',q.max_days_overdue,
        'due_on',q.due_on,
        'reason',q.reason,
        'draft_subject',q.draft_subject,
        'draft_message',q.draft_message,
        'decision_note',q.decision_note,
        'created_at',q.created_at,
        'updated_at',q.updated_at
      ) order by
        case q.priority when 'urgent' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,
        q.due_on,
        q.overdue desc,
        c.customer_name
    ) filter (where q.id is not null),'[]'::jsonb)
  )
  into v_result
  from public.debtor_collection_queue q
  join public.customer c on c.id=q.customer_id and c.company_id=q.company_id
  where q.company_id=v_company_id
    and (p_status='all' or q.status=p_status);

  return v_result;
end;
$$;

grant execute on function public.get_debtor_collection_queue(date,text) to authenticated;

create or replace function public.decide_debtor_collection_queue_item(
  p_queue_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_item public.debtor_collection_queue%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('accounting.debtors.manage') then
    raise exception 'Permission denied: accounting.debtors.manage';
  end if;

  if p_decision not in ('approved','dismissed','completed') then
    raise exception 'Decision must be approved, dismissed or completed.';
  end if;

  v_company_id := public.current_company_id();

  select * into v_item
  from public.debtor_collection_queue
  where id=p_queue_id and company_id=v_company_id
  for update;

  if not found then
    raise exception 'Collection recommendation could not be found.';
  end if;

  if v_item.status in ('dismissed','completed') then
    raise exception 'This recommendation is already closed.';
  end if;

  update public.debtor_collection_queue
  set status=p_decision,
      decision_note=nullif(trim(coalesce(p_note,'')),''),
      approved_by=case when p_decision='approved' then auth.uid() else approved_by end,
      approved_at=case when p_decision='approved' then now() else approved_at end,
      completed_by=case when p_decision='completed' then auth.uid() else completed_by end,
      completed_at=case when p_decision='completed' then now() else completed_at end,
      updated_at=now()
  where id=p_queue_id;

  if p_decision='completed' and v_item.action_type in ('reminder','follow_up','escalation','broken_promise') then
    insert into public.debtor_collection_activity(
      company_id,customer_id,activity_type,note,created_by
    ) values (
      v_company_id,
      v_item.customer_id,
      'reminder',
      coalesce(nullif(trim(coalesce(p_note,'')),''),format('Collection recommendation completed: %s',v_item.reason)),
      auth.uid()
    );

    insert into public.debtor_collection_control(
      company_id,customer_id,last_contacted_at,last_contacted_by,created_by,updated_by
    ) values (
      v_company_id,v_item.customer_id,now(),auth.uid(),auth.uid(),auth.uid()
    )
    on conflict (company_id,customer_id)
    do update set
      last_contacted_at=now(),
      last_contacted_by=auth.uid(),
      updated_by=auth.uid();
  end if;

  return jsonb_build_object(
    'ok',true,
    'queue_id',p_queue_id,
    'status',p_decision
  );
end;
$$;

grant execute on function public.decide_debtor_collection_queue_item(uuid,text,text) to authenticated;;
