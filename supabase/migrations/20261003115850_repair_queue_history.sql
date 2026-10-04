create or replace function public.get_service_job_queue(
  p_search text default null,
  p_status text default null,
  p_limit integer default 100
)
returns table(
  id uuid,
  job_number text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  customer_id uuid,
  customer_name text,
  device_type text,
  brand text,
  model text,
  serial_number text,
  imei text,
  reported_fault text,
  assigned_employee_id uuid,
  assigned_employee text,
  approved_amount numeric,
  invoice_id uuid,
  invoice_number text,
  balance_due numeric,
  intake_confirmed boolean,
  repair_started boolean,
  technical_complete boolean,
  collection_confirmed boolean
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_company_id uuid;
  v_search text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('repair.view') then
    raise exception 'Permission denied: repair.view';
  end if;

  v_company_id := public.current_company_id();
  v_search := nullif(btrim(coalesce(p_search,'')), '');

  if p_status is not null and p_status not in (
    'received','diagnosing','awaiting_approval','approved','in_progress',
    'technical_complete','ready_for_collection','collected','closed','cancelled',
    'active','archived'
  ) then
    raise exception 'Invalid repair status filter.';
  end if;

  return query
  select
    j.id,
    j.job_number,
    j.status,
    j.created_at,
    j.updated_at,
    j.customer_id,
    c.customer_name,
    j.device_type,
    j.brand,
    j.model,
    j.serial_number,
    j.imei,
    j.reported_fault,
    j.assigned_employee_id,
    nullif(btrim(concat_ws(' ', e.first_name, e.last_name)), ''),
    j.approved_amount,
    j.invoice_id,
    i.invoice_number,
    i.balance_due,
    (j.intake_confirmed_at is not null),
    (j.repair_started_at is not null),
    (j.technical_completed_at is not null),
    (j.collection_confirmed_at is not null)
  from public.service_job j
  join public.customer c
    on c.id = j.customer_id
   and c.company_id = j.company_id
  left join public.hr_employee e
    on e.id = j.assigned_employee_id
   and e.company_id = j.company_id
  left join public.invoice i
    on i.id = j.invoice_id
   and i.company_id = j.company_id
  where j.company_id = v_company_id
    and (
      p_status is null
      or j.status = p_status
      or (p_status = 'active' and j.status not in ('collected','closed','cancelled'))
      or (p_status = 'archived' and j.status in ('collected','closed','cancelled'))
    )
    and (
      v_search is null
      or j.job_number ilike '%' || v_search || '%'
      or c.customer_name ilike '%' || v_search || '%'
      or coalesce(j.device_type,'') ilike '%' || v_search || '%'
      or coalesce(j.brand,'') ilike '%' || v_search || '%'
      or coalesce(j.model,'') ilike '%' || v_search || '%'
      or coalesce(j.serial_number,'') ilike '%' || v_search || '%'
      or coalesce(j.imei,'') ilike '%' || v_search || '%'
      or coalesce(j.reported_fault,'') ilike '%' || v_search || '%'
    )
  order by
    case j.status
      when 'received' then 1
      when 'diagnosing' then 2
      when 'awaiting_approval' then 3
      when 'approved' then 4
      when 'in_progress' then 5
      when 'technical_complete' then 6
      when 'ready_for_collection' then 7
      when 'collected' then 8
      when 'closed' then 9
      when 'cancelled' then 10
      else 99
    end,
    j.updated_at desc,
    j.created_at desc
  limit greatest(1, least(coalesce(p_limit,100), 250));
end;
$function$;

revoke all on function public.get_service_job_queue(text,text,integer) from public;
revoke all on function public.get_service_job_queue(text,text,integer) from anon;
grant execute on function public.get_service_job_queue(text,text,integer) to authenticated;;
