create or replace function public.get_debtor_collection_queue(
  p_as_of_date date default current_date,
  p_status text default 'pending'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
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

  if p_status not in ('pending','approved','dismissed','completed','all') then
    raise exception 'Invalid queue status filter.';
  end if;

  v_company_id := public.current_company_id();

  -- Serialize queue refreshes per company. This prevents React development
  -- double-renders or simultaneous clients from racing on the active unique key.
  perform pg_advisory_xact_lock(
    hashtextextended('debtor_collection_queue:' || v_company_id::text, 0)
  );

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
$function$;;
