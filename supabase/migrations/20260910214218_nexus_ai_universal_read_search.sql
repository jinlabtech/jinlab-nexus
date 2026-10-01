create or replace function public.nexus_ai_search(
  p_query text,
  p_limit integer default 8
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_q text;
  v_limit integer := least(greatest(coalesce(p_limit,8),1),20);
  v_customers jsonb := '[]'::jsonb;
  v_repairs jsonb := '[]'::jsonb;
  v_inventory jsonb := '[]'::jsonb;
  v_invoices jsonb := '[]'::jsonb;
  v_employees jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  v_company_id := public.current_company_id();
  v_q := nullif(trim(p_query),'');
  if v_q is null then raise exception 'Search query required.'; end if;

  if public.current_user_has_permission('customer.view') then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_customers
    from (
      select c.id, c.customer_number, c.customer_name, c.email, c.phone, c.city, c.is_active
      from public.customer c
      where c.company_id=v_company_id
        and concat_ws(' ',c.customer_number,c.customer_name,c.email,c.phone,c.city) ilike '%'||v_q||'%'
      order by c.updated_at desc nulls last
      limit v_limit
    ) x;
  end if;

  if public.current_user_has_permission('repair.view') then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_repairs
    from (
      select j.id, j.job_number, j.status, j.device_type, j.brand, j.model,
             j.serial_number, j.imei, j.reported_fault, j.created_at,
             c.customer_name,
             concat_ws(' ',e.first_name,e.last_name) as assigned_employee
      from public.service_job j
      left join public.customer c on c.id=j.customer_id and c.company_id=j.company_id
      left join public.hr_employee e on e.id=j.assigned_employee_id and e.company_id=j.company_id
      where j.company_id=v_company_id
        and concat_ws(' ',j.job_number,j.status,j.device_type,j.brand,j.model,j.serial_number,j.imei,j.reported_fault,c.customer_name) ilike '%'||v_q||'%'
      order by case when j.status in ('closed','cancelled') then 1 else 0 end, j.updated_at desc
      limit v_limit
    ) x;
  end if;

  if public.current_user_has_permission('inventory.view') then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_inventory
    from (
      select i.id, i.item_name, i.sku, i.barcode, i.description, i.cost_price, i.selling_price, i.minimum_stock, i.is_active
      from public.inventory_item i
      where i.company_id=v_company_id
        and concat_ws(' ',i.item_name,i.sku,i.barcode,i.description) ilike '%'||v_q||'%'
      order by i.is_active desc, i.updated_at desc
      limit v_limit
    ) x;
  end if;

  if public.current_user_has_permission('invoice.view') then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_invoices
    from (
      select i.id, i.invoice_number, i.status, i.invoice_date, i.due_date,
             i.total_amount, i.amount_paid, i.balance_due, c.customer_name
      from public.invoice i
      left join public.customer c on c.id=i.customer_id and c.company_id=i.company_id
      where i.company_id=v_company_id
        and concat_ws(' ',i.invoice_number,i.status,c.customer_name,i.customer_reference) ilike '%'||v_q||'%'
      order by i.invoice_date desc, i.created_at desc
      limit v_limit
    ) x;
  end if;

  if public.current_user_has_permission('hr.view') then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_employees
    from (
      select e.id, e.employee_number, e.first_name, e.last_name, e.preferred_name, e.employment_type, e.status
      from public.hr_employee e
      where e.company_id=v_company_id
        and concat_ws(' ',e.employee_number,e.first_name,e.last_name,e.preferred_name,e.employment_type,e.status) ilike '%'||v_q||'%'
      order by e.status='active' desc, e.updated_at desc
      limit v_limit
    ) x;
  end if;

  return jsonb_build_object(
    'query',v_q,
    'customers',v_customers,
    'repairs',v_repairs,
    'inventory',v_inventory,
    'invoices',v_invoices,
    'employees',v_employees
  );
end;
$$;

revoke all on function public.nexus_ai_search(text,integer) from public, anon;
grant execute on function public.nexus_ai_search(text,integer) to authenticated;;
