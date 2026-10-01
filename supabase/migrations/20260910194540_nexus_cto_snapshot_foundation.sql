create or replace function public.get_nexus_cto_snapshot()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_company_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  v_company_id := public.current_company_id();
  if not exists (
    select 1 from public.user_profile up
    where up.user_id=auth.uid() and up.company_id=v_company_id and up.role='owner'
  ) then raise exception 'Owner access required.'; end if;
  select c.company_name into v_company_name from public.company c where c.id=v_company_id;
  return jsonb_build_object(
    'generated_at', now(),
    'company', jsonb_build_object('id',v_company_id,'name',v_company_name),
    'sales', jsonb_build_object(
      'invoices_30d',(select count(*) from public.invoice i where i.company_id=v_company_id and i.invoice_date>=current_date-30),
      'invoice_value_30d',(select coalesce(sum(i.total_amount),0) from public.invoice i where i.company_id=v_company_id and i.invoice_date>=current_date-30),
      'payments_30d',(select coalesce(sum(ip.amount),0) from public.invoice_payment ip where ip.company_id=v_company_id and ip.payment_date>=current_date-30),
      'outstanding_receivables',(select coalesce(sum(i.balance_due),0) from public.invoice i where i.company_id=v_company_id and coalesce(i.balance_due,0)>0),
      'overdue_invoice_count',(select count(*) from public.invoice i where i.company_id=v_company_id and coalesce(i.balance_due,0)>0 and i.due_date is not null and i.due_date<current_date),
      'pos_sales_30d',(select coalesce(sum(ps.total_amount),0) from public.pos_sale ps where ps.company_id=v_company_id and ps.created_at>=now()-interval '30 days' and coalesce(ps.status,'')<>'cancelled')
    ),
    'repairs', jsonb_build_object(
      'active_total',(select count(*) from public.service_job j where j.company_id=v_company_id and j.status not in ('closed','cancelled')),
      'received',(select count(*) from public.service_job j where j.company_id=v_company_id and j.status='received'),
      'awaiting_approval',(select count(*) from public.service_job j where j.company_id=v_company_id and j.status='awaiting_approval'),
      'approved',(select count(*) from public.service_job j where j.company_id=v_company_id and j.status='approved'),
      'in_progress',(select count(*) from public.service_job j where j.company_id=v_company_id and j.status='in_progress'),
      'ready_for_collection',(select count(*) from public.service_job j where j.company_id=v_company_id and j.status='ready_for_collection'),
      'unassigned_active',(select count(*) from public.service_job j where j.company_id=v_company_id and j.status not in ('closed','cancelled') and j.assigned_employee_id is null),
      'open_over_7_days',(select count(*) from public.service_job j where j.company_id=v_company_id and j.status not in ('closed','cancelled') and j.created_at<now()-interval '7 days')
    ),
    'inventory', jsonb_build_object(
      'active_items',(select count(*) from public.inventory_item ii where ii.company_id=v_company_id and ii.is_active=true),
      'costed_stock_value',(select coalesce(sum(icb.total_cost),0) from public.inventory_cost_balance icb where icb.company_id=v_company_id)
    ),
    'people', jsonb_build_object(
      'active_employees',(select count(*) from public.hr_employee e where e.company_id=v_company_id and e.status='active'),
      'unresolved_attendance_exceptions_30d',(select count(*) from public.hr_attendance_exception ax where ax.company_id=v_company_id and ax.created_at>=now()-interval '30 days' and ax.resolved_at is null)
    ),
    'finance_control', jsonb_build_object(
      'unbalanced_journals',(select count(*) from public.journal_entry je where je.company_id=v_company_id and abs(coalesce(je.total_debit,0)-coalesce(je.total_credit,0))>0.005),
      'open_posting_exceptions',(select count(*) from public.accounting_posting_exception ape where ape.company_id=v_company_id and ape.resolved_at is null),
      'expenses_30d',(select coalesce(sum(ae.total_amount),0) from public.accounting_expense ae where ae.company_id=v_company_id and ae.expense_date>=current_date-30 and coalesce(ae.status,'')<>'cancelled')
    )
  );
end;
$function$;;
