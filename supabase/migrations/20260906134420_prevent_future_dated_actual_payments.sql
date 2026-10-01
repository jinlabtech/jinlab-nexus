create or replace function public.validate_invoice_payment()
returns trigger
language plpgsql
set search_path=public
as $function$
declare
  target_invoice public.invoice%rowtype;
  source_payment public.sales_order_payment%rowtype;
  existing_paid numeric(14,2);
begin
  if new.payment_date is null then
    raise exception 'Actual payment date is required.';
  end if;

  if new.payment_date>current_date then
    raise exception 'Actual payments cannot be dated in the future. Use a payment plan or promise for future payments.';
  end if;

  select * into target_invoice
  from public.invoice
  where id=new.invoice_id and company_id=new.company_id
  for update;

  if not found then raise exception 'Invoice could not be found.'; end if;

  if target_invoice.status not in ('issued','partially_paid','overdue') then
    raise exception 'Only issued invoices can receive payments.';
  end if;

  if target_invoice.customer_id<>new.customer_id then raise exception 'Payment customer does not match invoice customer.'; end if;
  if target_invoice.branch_id<>new.branch_id then raise exception 'Payment branch does not match invoice branch.'; end if;

  if new.payment_source='sales_order_deposit' then
    if new.source_sales_order_payment_id is null then raise exception 'Sales Order deposit source is required.'; end if;
    if target_invoice.sales_order_id is null then raise exception 'A Sales Order deposit can only be applied to an invoice created from a Sales Order.'; end if;

    select * into source_payment
    from public.sales_order_payment
    where id=new.source_sales_order_payment_id and company_id=new.company_id;
    if not found then raise exception 'Source Sales Order payment could not be found.'; end if;

    if source_payment.sales_order_id<>target_invoice.sales_order_id then raise exception 'Sales Order deposit belongs to a different Sales Order.'; end if;
    if source_payment.customer_id<>new.customer_id then raise exception 'Sales Order deposit customer does not match invoice customer.'; end if;
    if source_payment.branch_id<>new.branch_id then raise exception 'Sales Order deposit branch does not match invoice branch.'; end if;
    if round(source_payment.amount,2)<>round(new.amount,2) then raise exception 'Applied Sales Order deposit amount must equal the original receipt amount.'; end if;
    if source_payment.payment_date<>new.payment_date then raise exception 'Applied Sales Order deposit must retain the original payment date.'; end if;
    if source_payment.payment_method<>new.payment_method then raise exception 'Applied Sales Order deposit must retain the original payment method.'; end if;
  elsif new.source_sales_order_payment_id is not null then
    raise exception 'Only Sales Order deposit payments may reference a Sales Order payment.';
  end if;

  select coalesce(sum(amount),0) into existing_paid
  from public.invoice_payment
  where invoice_id=new.invoice_id and id is distinct from new.id;

  if existing_paid+new.amount>target_invoice.total_amount then
    raise exception 'Payment amount exceeds the remaining invoice balance.';
  end if;

  return new;
end;
$function$;

create or replace function public.record_sales_order_payment(
  p_sales_order_id uuid,
  p_payment_date date,
  p_payment_method text,
  p_reference text,
  p_amount numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_company_id uuid;
  v_order public.sales_order%rowtype;
  v_paid numeric(14,2):=0;
  v_balance numeric(14,2):=0;
  v_payment_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('sales.payment.record') then raise exception 'Permission denied: sales.payment.record'; end if;

  v_company_id:=public.current_company_id();
  if v_company_id is null then raise exception 'Your account is not linked to a company.'; end if;

  if p_payment_method not in ('cash','eft','card','other') then raise exception 'Payment method must be cash, EFT, card or other.'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Payment amount must be greater than zero.'; end if;
  if p_payment_date is null then raise exception 'Actual payment date is required.'; end if;
  if p_payment_date>current_date then raise exception 'Actual payments cannot be dated in the future. Use a payment plan or promise for future payments.'; end if;

  select * into v_order from public.sales_order
  where id=p_sales_order_id and company_id=v_company_id
  for update;
  if not found then raise exception 'Sales order could not be found.'; end if;

  if v_order.status in ('cancelled','invoiced') then raise exception 'Payments cannot be recorded against a cancelled or already invoiced sales order.'; end if;
  if v_order.payment_basis is null then raise exception 'Select the sales order payment basis before recording payment.'; end if;
  if v_order.total_amount<=0 then raise exception 'The sales order must contain billable items before payment can be recorded.'; end if;

  select round(coalesce(sum(p.amount),0),2) into v_paid
  from public.sales_order_payment p
  where p.company_id=v_company_id and p.sales_order_id=v_order.id;

  v_balance:=round(v_order.total_amount-v_paid,2);
  if p_amount>v_balance then raise exception 'Payment exceeds the remaining sales order balance of R%.',to_char(v_balance,'FM999999999990.00'); end if;

  insert into public.sales_order_payment(
    company_id,branch_id,sales_order_id,customer_id,payment_date,payment_method,reference,amount,notes,received_by
  ) values (
    v_company_id,v_order.branch_id,v_order.id,v_order.customer_id,p_payment_date,p_payment_method,
    nullif(trim(coalesce(p_reference,'')),''),round(p_amount,2),nullif(trim(coalesce(p_notes,'')),''),auth.uid()
  ) returning id into v_payment_id;

  return v_payment_id;
end;
$function$;

create or replace function public.pay_accounting_expense(
  p_expense_id uuid,
  p_payment_method text,
  p_payment_date date default current_date,
  p_payment_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_company_id uuid;
  v_expense public.accounting_expense%rowtype;
  v_payment_account_id uuid;
  v_currency text:='ZAR';
  v_lines jsonb;
  v_journal_id uuid;
  v_method text:=lower(trim(coalesce(p_payment_method,'')));
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('accounting.expense.manage') then raise exception 'Permission denied: accounting.expense.manage'; end if;

  v_company_id:=public.current_company_id();

  select * into v_expense from public.accounting_expense
  where id=p_expense_id and company_id=v_company_id
  for update;
  if not found then raise exception 'Expense could not be found.'; end if;
  if v_expense.status<>'posted' then raise exception 'Only posted expenses can be paid.'; end if;
  if v_expense.payment_status='paid' then raise exception 'This expense is already paid.'; end if;
  if v_expense.liability_account_id is null then raise exception 'Expense liability account is missing.'; end if;
  if p_payment_date is null then raise exception 'Payment date is required.'; end if;
  if p_payment_date<v_expense.expense_date then raise exception 'Payment date cannot be before the expense date.'; end if;
  if p_payment_date>current_date then raise exception 'Actual expense payments cannot be dated in the future.'; end if;

  v_payment_account_id:=public.get_accounting_payment_account(v_company_id,v_method);
  select coalesce(base_currency,'ZAR') into v_currency from public.company_finance_settings where company_id=v_company_id;

  v_lines:=jsonb_build_array(
    jsonb_build_object('account_id',v_expense.liability_account_id,'description','Settle expense payable · '||v_expense.expense_number,'debit',v_expense.total_amount,'credit',0,'metadata',jsonb_build_object('role','expense_payable_settlement','expense_number',v_expense.expense_number)),
    jsonb_build_object('account_id',v_payment_account_id,'description','Expense payment · '||v_expense.expense_number,'debit',0,'credit',v_expense.total_amount,'metadata',jsonb_build_object('role','payment','payment_method',v_method,'expense_number',v_expense.expense_number))
  );

  v_journal_id:=public.create_automatic_accounting_journal(
    v_company_id,v_expense.branch_id,p_payment_date,'Pay '||v_expense.expense_number,
    coalesce(nullif(trim(coalesce(p_payment_reference,'')),''),v_expense.reference,v_expense.expense_number),
    'expense',v_expense.id,'paid',v_currency,auth.uid(),v_lines,null
  );

  update public.accounting_expense
  set payment_status='paid',payment_method=v_method,payment_date=p_payment_date,
      payment_reference=nullif(trim(coalesce(p_payment_reference,'')),''),payment_account_id=v_payment_account_id,
      payment_journal_entry_id=v_journal_id,updated_by=auth.uid(),updated_at=now()
  where id=v_expense.id;

  return jsonb_build_object('ok',true,'expense_id',v_expense.id,'expense_number',v_expense.expense_number,'payment_status','paid','amount',v_expense.total_amount,'payment_method',v_method,'payment_journal_entry_id',v_journal_id,'simple_message','Expense paid. What We Owe has been reduced and the payment account has been reduced.');
end;
$function$;

create or replace function public.pay_supplier_bill(
  p_supplier_bill_id uuid,
  p_amount numeric default null,
  p_payment_method text default 'eft',
  p_payment_date date default current_date,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_company_id uuid;
  v_bill public.supplier_bill%rowtype;
  v_amount numeric(14,2);
  v_payment_id uuid;
  v_ap_id uuid;
  v_credit_account_id uuid;
  v_journal_id uuid;
  v_new_paid numeric(14,2);
  v_new_balance numeric(14,2);
  v_new_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not public.current_user_has_permission('accounting.payables.manage') then raise exception 'Permission denied: accounting.payables.manage'; end if;
  if p_payment_method not in ('eft','cash','card','other') then raise exception 'Invalid payment method.'; end if;
  if p_payment_date is null then raise exception 'Payment date is required.'; end if;
  if p_payment_date>current_date then raise exception 'Actual supplier payments cannot be dated in the future.'; end if;

  v_company_id:=public.current_company_id();

  select * into v_bill from public.supplier_bill
  where id=p_supplier_bill_id and company_id=v_company_id
  for update;
  if not found then raise exception 'Supplier bill could not be found.'; end if;
  if v_bill.status in ('paid','cancelled') then raise exception 'This supplier bill cannot receive another payment.'; end if;
  if p_payment_date<v_bill.bill_date then raise exception 'Supplier payment date cannot be before the bill date.'; end if;

  v_amount:=round(coalesce(p_amount,v_bill.balance_due),2);
  if v_amount<=0 then raise exception 'Payment amount must be greater than zero.'; end if;
  if v_amount>v_bill.balance_due then raise exception 'Payment exceeds the supplier bill balance.'; end if;

  select id into v_ap_id from public.accounting_account where company_id=v_company_id and system_key='accounts_payable' and is_active=true limit 1;
  select id into v_credit_account_id from public.accounting_account
  where company_id=v_company_id and is_active=true
    and system_key=case when p_payment_method='eft' then 'bank' when p_payment_method='cash' then 'cash_on_hand' else 'payment_clearing' end
  limit 1;

  if v_ap_id is null or v_credit_account_id is null then raise exception 'Supplier payment accounting accounts are not configured.'; end if;

  insert into public.supplier_bill_payment(company_id,supplier_bill_id,amount,payment_method,payment_date,reference,created_by)
  values(v_company_id,v_bill.id,v_amount,p_payment_method,p_payment_date,nullif(trim(coalesce(p_reference,'')),''),auth.uid())
  returning id into v_payment_id;

  v_journal_id:=public.create_automatic_accounting_journal(
    v_company_id,v_bill.branch_id,p_payment_date,'Supplier payment · '||v_bill.bill_number,
    nullif(trim(coalesce(p_reference,'')),''),'supplier_payment',v_payment_id,'paid','ZAR',auth.uid(),
    jsonb_build_array(
      jsonb_build_object('account_id',v_ap_id,'debit',v_amount,'credit',0,'description','Reduce amount owed to supplier'),
      jsonb_build_object('account_id',v_credit_account_id,'debit',0,'credit',v_amount,'description','Supplier payment')
    ),null
  );

  update public.supplier_bill_payment set journal_entry_id=v_journal_id where id=v_payment_id;
  v_new_paid:=round(v_bill.amount_paid+v_amount,2);
  v_new_balance:=round(v_bill.total_amount-v_new_paid,2);
  v_new_status:=case when v_new_balance=0 then 'paid' else 'partially_paid' end;

  update public.supplier_bill
  set amount_paid=v_new_paid,balance_due=v_new_balance,status=v_new_status,updated_at=now()
  where id=v_bill.id;

  return jsonb_build_object('ok',true,'bill_id',v_bill.id,'bill_number',v_bill.bill_number,'payment_id',v_payment_id,'amount_paid_now',v_amount,'amount_paid_total',v_new_paid,'balance_due',v_new_balance,'status',v_new_status,'journal_entry_id',v_journal_id,'simple_message',case when v_new_balance=0 then 'Supplier bill paid in full. What We Owe has been reduced.' else 'Part payment recorded. What We Owe has been reduced by the payment amount.' end);
end;
$function$;;
