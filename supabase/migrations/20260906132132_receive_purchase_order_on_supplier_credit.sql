create or replace function public.receive_purchase_order_on_credit(
  target_purchase_order_id uuid,
  target_company_id uuid,
  supplier_delivery_reference text default null,
  receipt_notes text default null,
  received_items jsonb default '[]'::jsonb,
  supplier_invoice_number text default null,
  due_date date default null,
  liability_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_receipt jsonb;
  v_bill jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if target_company_id <> public.current_company_id() then raise exception 'Company mismatch.'; end if;
  if not public.current_user_has_permission('purchasing.receive') then raise exception 'Permission denied: purchasing.receive'; end if;
  if not public.current_user_has_permission('accounting.payables.manage') then raise exception 'Permission denied: accounting.payables.manage'; end if;

  v_receipt := public.receive_purchase_order(
    target_purchase_order_id,
    target_company_id,
    supplier_delivery_reference,
    receipt_notes,
    received_items
  );

  v_bill := public.create_supplier_bill_from_receipt(
    (v_receipt->>'receipt_id')::uuid,
    due_date,
    supplier_invoice_number,
    liability_notes
  );

  return jsonb_build_object(
    'ok',true,
    'receipt',v_receipt,
    'supplier_bill',v_bill,
    'simple_message','Stock received on supplier credit. Inventory increased and What We Owe increased automatically.'
  );
end;
$$;

grant execute on function public.receive_purchase_order_on_credit(uuid,uuid,text,text,jsonb,text,date,text) to authenticated;;
