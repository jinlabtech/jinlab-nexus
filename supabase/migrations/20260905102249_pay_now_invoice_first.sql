create or replace function public.enforce_sales_order_payment_before_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_basis text;
  v_order_total numeric(14,2);
  v_paid numeric(14,2) := 0;
  v_balance numeric(14,2) := 0;
begin
  if new.sales_order_id is null then
    return new;
  end if;

  select so.payment_basis, so.total_amount
  into v_basis, v_order_total
  from public.sales_order so
  where so.id = new.sales_order_id
    and so.company_id = new.company_id;

  if not found then
    raise exception 'Source sales order could not be found.';
  end if;

  -- Pay Now invoices may be created before payment. The invoice
  -- becomes the payment request and must be settled immediately
  -- according to the commercial terms. Only true Prepaid orders
  -- still require actual advance payment evidence before invoice.
  if v_basis = 'prepaid' then
    select round(coalesce(sum(p.amount), 0), 2)
    into v_paid
    from public.sales_order_payment p
    where p.company_id = new.company_id
      and p.sales_order_id = new.sales_order_id;

    v_balance := round(
      greatest(v_order_total - v_paid, 0),
      2
    );

    if v_balance > 0.009 then
      raise exception
        'PAYMENT REQUIRED: This Prepaid sales order still has R% outstanding. Record the required advance payment before creating the invoice.',
        to_char(v_balance, 'FM999999999990.00');
    end if;
  end if;

  return new;
end;
$$;
;
