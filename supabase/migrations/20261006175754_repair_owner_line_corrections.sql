create or replace function public.correct_service_job_line(
  p_line_id uuid,
  p_line_type text,
  p_description text,
  p_quantity numeric,
  p_unit_price numeric,
  p_inventory_item_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_line public.service_job_line%rowtype;
  v_job public.service_job%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_existing_total numeric;
  v_new_total numeric;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_is_owner() then
    raise exception 'Only the company owner may correct recorded repair work.';
  end if;

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A correction reason is required.';
  end if;

  if p_line_type is null or p_line_type not in (
    'labour',
    'service',
    'software',
    'part',
    'other'
  ) then
    raise exception 'Invalid repair line type.';
  end if;

  if nullif(btrim(coalesce(p_description, '')), '') is null then
    raise exception 'Work or part description is required.';
  end if;

  if p_quantity is null or p_quantity <= 0 or p_quantity::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Quantity must be greater than zero.';
  end if;

  if p_unit_price is null or p_unit_price < 0 or p_unit_price::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Unit price cannot be negative.';
  end if;

  v_company_id := public.current_company_id();

  select *
  into v_line
  from public.service_job_line
  where id = p_line_id
    and company_id = v_company_id;

  if not found then
    raise exception 'Recorded repair line could not be found.';
  end if;

  select *
  into v_job
  from public.service_job
  where id = v_line.service_job_id
    and company_id = v_company_id
  for update;

  if not found then
    raise exception 'Job card could not be found.';
  end if;

  -- Match the job-first lock order of the existing repair workflow.
  select * into v_line from public.service_job_line
  where id = p_line_id and company_id = v_company_id and service_job_id = v_job.id
  for update;
  if not found then raise exception 'Recorded repair line could not be found.'; end if;

  if v_job.invoice_id is not null then
    raise exception
      'This work is already linked to an invoice. Correct the invoice through the controlled financial workflow.';
  end if;

  if v_job.status in (
    'collected',
    'closed',
    'cancelled'
  ) then
    raise exception
      'Recorded work on a collected, closed or cancelled repair cannot be changed.';
  end if;

  if p_line_type = 'part' and p_inventory_item_id is null then
    raise exception 'Select the inventory part used.';
  end if;

  if p_inventory_item_id is not null and not exists (
    select 1
    from public.inventory_item i
    where i.id = p_inventory_item_id
      and i.company_id = v_company_id
      and i.is_active = true
  ) then
    raise exception 'Inventory item could not be found.';
  end if;

  select
    coalesce(
      sum(line_total),
      0
    )
  into v_existing_total
  from public.service_job_line
  where company_id = v_company_id
    and service_job_id = v_job.id
    and id <> v_line.id;

  v_new_total :=
    round(
      v_existing_total +
      (
        p_quantity *
        p_unit_price
      ),
      2
    );

  if
    v_job.approved_amount is not null
    and v_job.status in (
      'approved',
      'in_progress',
      'technical_complete',
      'ready_for_collection'
    )
    and v_new_total >
      v_job.approved_amount + 0.01
  then
    raise exception
      'Recorded job lines cannot exceed the customer-approved amount.';
  end if;

  v_before := jsonb_build_object(
    'line_type', v_line.line_type,
    'description', v_line.description,
    'quantity', v_line.quantity,
    'unit_price', v_line.unit_price,
    'inventory_item_id', v_line.inventory_item_id,
    'line_total', v_line.line_total
  );

  update public.service_job_line
  set
    line_type = p_line_type,
    description = btrim(p_description),
    quantity = p_quantity,
    unit_price = p_unit_price,
    inventory_item_id =
      case
        when p_line_type = 'part'
          then p_inventory_item_id
        else null
      end
  where id = v_line.id
    and company_id = v_company_id;

  select jsonb_build_object(
    'line_type', l.line_type,
    'description', l.description,
    'quantity', l.quantity,
    'unit_price', l.unit_price,
    'inventory_item_id', l.inventory_item_id,
    'line_total', l.line_total
  )
  into v_after
  from public.service_job_line l
  where l.id = v_line.id;

  update public.service_job
  set updated_at = now()
  where id = v_job.id
    and company_id = v_company_id;

  insert into public.service_job_event(
    company_id,
    service_job_id,
    event_type,
    description,
    metadata,
    user_id
  )
  values(
    v_company_id,
    v_job.id,
    'owner_line_correction',
    'Owner corrected recorded repair work: ' || btrim(p_reason),
    jsonb_build_object(
      'line_id', v_line.id,
      'before', v_before,
      'after', v_after,
      'reason', btrim(p_reason),
      'stage', v_job.status
    ),
    auth.uid()
  );

  insert into public.audit_log(
    company_id,
    user_id,
    action,
    module,
    record_id,
    description,
    metadata
  )
  values(
    v_company_id,
    auth.uid(),
    'service_job_line_owner_correction',
    'repairs',
    v_job.id,
    'Owner corrected recorded repair work or parts.',
    jsonb_build_object(
      'line_id', v_line.id,
      'before', v_before,
      'after', v_after,
      'reason', btrim(p_reason),
      'stage', v_job.status
    )
  );

  return jsonb_build_object(
    'ok', true,
    'job_id', v_job.id,
    'line_id', v_line.id
  );
end;
$$;

revoke all on function public.correct_service_job_line(
  uuid,
  text,
  text,
  numeric,
  numeric,
  uuid,
  text
) from public, anon;

grant execute on function public.correct_service_job_line(
  uuid,
  text,
  text,
  numeric,
  numeric,
  uuid,
  text
) to authenticated;
