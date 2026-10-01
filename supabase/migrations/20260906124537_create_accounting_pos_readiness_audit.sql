create or replace function public.get_accounting_pos_readiness_audit()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_ledger_debits numeric := 0;
  v_ledger_credits numeric := 0;
  v_unbalanced_journals int := 0;
  v_open_exceptions int := 0;
  v_issued_without_journal int := 0;
  v_payments_without_journal int := 0;
  v_invoice_balance_mismatches int := 0;
  v_product_revenue numeric := 0;
  v_cogs numeric := 0;
  v_inventory_ledger numeric := 0;
  v_inventory_physical_estimate numeric := 0;
  v_sales_stock_out_count int := 0;
  v_zero_price_inventory_lines int := 0;
  v_payment_clearing numeric := 0;
  v_trade_debtors numeric := 0;
  v_subledger_receivables numeric := 0;
  v_purchase_receipt_count int := 0;
  v_purchase_receipt_value numeric := 0;
  v_purchase_journal_count int := 0;
  v_accounting_enabled boolean := false;
  v_automatic_journals boolean := false;
  v_automatic_invoice_posting boolean := false;
  v_vat_registered boolean := false;
  v_financial_year_status text;
  v_period_status text;
  v_blockers int := 0;
  v_warnings int := 0;
  v_checks jsonb := '[]'::jsonb;
  v_margin numeric;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('accounting.view') then
    raise exception 'Permission denied: accounting.view';
  end if;

  v_company_id := public.current_company_id();

  select
    coalesce(acs.accounting_enabled,false),
    coalesce(acs.automatic_journals,false),
    coalesce(acs.automatic_invoice_posting,false),
    coalesce(cfs.vat_registered,false)
  into
    v_accounting_enabled,
    v_automatic_journals,
    v_automatic_invoice_posting,
    v_vat_registered
  from public.company_accounting_settings acs
  left join public.company_finance_settings cfs on cfs.company_id=acs.company_id
  where acs.company_id=v_company_id;

  select fy.status,ap.status
  into v_financial_year_status,v_period_status
  from public.accounting_financial_year fy
  left join public.accounting_period ap
    on ap.company_id=fy.company_id
   and ap.financial_year_id=fy.id
   and current_date between ap.start_date and ap.end_date
  where fy.company_id=v_company_id
    and current_date between fy.start_date and fy.end_date
  order by fy.start_date desc
  limit 1;

  select
    coalesce(sum(je.total_debit),0),
    coalesce(sum(je.total_credit),0),
    count(*) filter (where abs(je.total_debit-je.total_credit)>0.009)
  into v_ledger_debits,v_ledger_credits,v_unbalanced_journals
  from public.journal_entry je
  where je.company_id=v_company_id
    and je.status='posted';

  select count(*)
  into v_open_exceptions
  from public.accounting_posting_exception e
  where e.company_id=v_company_id
    and e.status='open';

  select count(*)
  into v_issued_without_journal
  from public.invoice i
  where i.company_id=v_company_id
    and i.status not in ('draft','cancelled')
    and not exists (
      select 1
      from public.journal_entry je
      where je.company_id=i.company_id
        and je.source_type='invoice'
        and je.source_id=i.id
        and je.source_event='issued'
        and je.status='posted'
    );

  select count(*)
  into v_payments_without_journal
  from public.invoice_payment ip
  where ip.company_id=v_company_id
    and not exists (
      select 1
      from public.journal_entry je
      where je.company_id=ip.company_id
        and je.source_type='invoice_payment'
        and je.source_id=ip.id
        and je.source_event='received'
        and je.status='posted'
    );

  select count(*)
  into v_invoice_balance_mismatches
  from public.invoice i
  where i.company_id=v_company_id
    and i.status not in ('draft','cancelled')
    and abs(
      coalesce(i.balance_due,0) -
      (
        coalesce(i.total_amount,0) -
        coalesce((
          select sum(ip.amount)
          from public.invoice_payment ip
          where ip.company_id=i.company_id
            and ip.invoice_id=i.id
        ),0)
      )
    ) > 0.009;

  select
    coalesce(sum(case when a.system_key='sales_revenue' then jl.credit-jl.debit else 0 end),0),
    coalesce(sum(case when a.system_key='cost_of_sales' or a.account_subtype='cost_of_sales' then jl.debit-jl.credit else 0 end),0),
    coalesce(sum(case when a.system_key='inventory' then jl.debit-jl.credit else 0 end),0),
    coalesce(sum(case when a.system_key='payment_clearing' then jl.debit-jl.credit else 0 end),0),
    coalesce(sum(case when a.system_key='accounts_receivable' then jl.debit-jl.credit else 0 end),0)
  into
    v_product_revenue,
    v_cogs,
    v_inventory_ledger,
    v_payment_clearing,
    v_trade_debtors
  from public.journal_line jl
  join public.journal_entry je
    on je.id=jl.journal_entry_id
   and je.company_id=jl.company_id
   and je.status='posted'
  join public.accounting_account a
    on a.id=jl.account_id
   and a.company_id=jl.company_id
  where jl.company_id=v_company_id;

  select coalesce(sum(greatest(i.total_amount-coalesce((
      select sum(ip.amount)
      from public.invoice_payment ip
      where ip.company_id=i.company_id
        and ip.invoice_id=i.id
    ),0),0)),0)
  into v_subledger_receivables
  from public.invoice i
  where i.company_id=v_company_id
    and i.status not in ('draft','cancelled');

  select coalesce(sum(bs.quantity * coalesce(ii.cost_price,0)),0)
  into v_inventory_physical_estimate
  from public.branch_stock bs
  join public.inventory_item ii
    on ii.id=bs.inventory_item_id
   and ii.company_id=bs.company_id
  where bs.company_id=v_company_id;

  select count(*)
  into v_sales_stock_out_count
  from public.stock_movement sm
  where sm.company_id=v_company_id
    and sm.movement_type in ('stock_out','sale','sold');

  select count(*)
  into v_zero_price_inventory_lines
  from public.invoice_item ii
  join public.invoice i
    on i.id=ii.invoice_id
   and i.company_id=ii.company_id
  where ii.company_id=v_company_id
    and i.status not in ('draft','cancelled')
    and ii.inventory_item_id is not null
    and coalesce(ii.unit_price,0)<=0;

  select
    count(distinct pr.id),
    coalesce(sum(pri.quantity_received * pri.unit_cost),0)
  into v_purchase_receipt_count,v_purchase_receipt_value
  from public.purchase_receipt pr
  left join public.purchase_receipt_item pri
    on pri.purchase_receipt_id=pr.id
   and pri.company_id=pr.company_id
  where pr.company_id=v_company_id;

  select count(*)
  into v_purchase_journal_count
  from public.journal_entry je
  where je.company_id=v_company_id
    and je.status='posted'
    and je.source_type in ('purchase_receipt','purchase_order','supplier_bill','purchase');

  if v_product_revenue>0 then
    v_margin := round(((v_product_revenue-v_cogs)/v_product_revenue)*100,2);
  else
    v_margin := null;
  end if;

  -- Core controls
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'key','ledger_balanced','status',case when abs(v_ledger_debits-v_ledger_credits)<=0.009 and v_unbalanced_journals=0 then 'pass' else 'blocker' end,
    'title','Ledger balances','detail',case when abs(v_ledger_debits-v_ledger_credits)<=0.009 and v_unbalanced_journals=0 then 'Posted journals balance correctly.' else 'One or more posted journals do not balance.' end
  ));
  if abs(v_ledger_debits-v_ledger_credits)>0.009 or v_unbalanced_journals>0 then v_blockers:=v_blockers+1; end if;

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'key','posting_exceptions','status',case when v_open_exceptions=0 then 'pass' else 'warning' end,
    'title','Posting exceptions','detail',format('%s open accounting posting exception(s).',v_open_exceptions)
  ));
  if v_open_exceptions>0 then v_warnings:=v_warnings+1; end if;

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'key','invoice_posting','status',case when v_issued_without_journal=0 then 'pass' else 'blocker' end,
    'title','Invoice posting','detail',format('%s active issued invoice(s) are missing a posted journal.',v_issued_without_journal)
  ));
  if v_issued_without_journal>0 then v_blockers:=v_blockers+1; end if;

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'key','payment_posting','status',case when v_payments_without_journal=0 then 'pass' else 'blocker' end,
    'title','Payment posting','detail',format('%s payment(s) are missing a posted journal.',v_payments_without_journal)
  ));
  if v_payments_without_journal>0 then v_blockers:=v_blockers+1; end if;

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'key','receivables_reconcile','status',case when abs(v_trade_debtors-v_subledger_receivables)<=0.009 and v_invoice_balance_mismatches=0 then 'pass' else 'blocker' end,
    'title','Customer balances reconcile','detail',format('Ledger receivables R%s vs invoice subledger R%s. %s invoice balance mismatch(es).',round(v_trade_debtors,2),round(v_subledger_receivables,2),v_invoice_balance_mismatches)
  ));
  if abs(v_trade_debtors-v_subledger_receivables)>0.009 or v_invoice_balance_mismatches>0 then v_blockers:=v_blockers+1; end if;

  -- POS / inventory controls
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'key','cogs_posting','status',case when v_product_revenue>0 and v_cogs=0 then 'blocker' else 'pass' end,
    'title','Cost of Sales posting','detail',case when v_product_revenue>0 and v_cogs=0 then 'Product sales exist, but Cost of Sales has not been posted. Profit margin is overstated.' else 'Cost of Sales is present for product revenue.' end
  ));
  if v_product_revenue>0 and v_cogs=0 then v_blockers:=v_blockers+1; end if;

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'key','stock_out','status',case when v_product_revenue>0 and v_sales_stock_out_count=0 then 'blocker' else 'pass' end,
    'title','Sales reduce stock','detail',case when v_product_revenue>0 and v_sales_stock_out_count=0 then 'Product sales exist, but there are no sales stock-out movements.' else format('%s sales stock-out movement(s) found.',v_sales_stock_out_count) end
  ));
  if v_product_revenue>0 and v_sales_stock_out_count=0 then v_blockers:=v_blockers+1; end if;

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'key','inventory_ledger','status',case when abs(v_inventory_ledger-v_inventory_physical_estimate)<=1 then 'pass' else 'blocker' end,
    'title','Inventory value reconciles','detail',format('Inventory ledger R%s vs current stock estimate R%s. The estimate uses current item cost prices until a full valuation layer is implemented.',round(v_inventory_ledger,2),round(v_inventory_physical_estimate,2))
  ));
  if abs(v_inventory_ledger-v_inventory_physical_estimate)>1 then v_blockers:=v_blockers+1; end if;

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'key','zero_price_inventory','status',case when v_zero_price_inventory_lines=0 then 'pass' else 'warning' end,
    'title','Inventory sale pricing','detail',format('%s active inventory invoice line(s) have zero selling price.',v_zero_price_inventory_lines)
  ));
  if v_zero_price_inventory_lines>0 then v_warnings:=v_warnings+1; end if;

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'key','purchase_accounting','status',case when v_purchase_receipt_count=0 or v_purchase_journal_count>0 then 'pass' else 'warning' end,
    'title','Purchase / stock receipt accounting','detail',case when v_purchase_receipt_count=0 then 'No purchase receipts require posting yet.' when v_purchase_journal_count>0 then 'Purchase accounting journals are present.' else format('%s purchase receipt(s), valued at about R%s, exist without a purchase accounting journal.',v_purchase_receipt_count,round(v_purchase_receipt_value,2)) end
  ));
  if v_purchase_receipt_count>0 and v_purchase_journal_count=0 then v_warnings:=v_warnings+1; end if;

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'key','payment_clearing','status',case when abs(v_payment_clearing)<=0.009 then 'pass' else 'warning' end,
    'title','Payment clearing','detail',case when abs(v_payment_clearing)<=0.009 then 'No unsettled payment-clearing balance.' else format('R%s remains in Payment Clearing and still needs settlement/reconciliation.',round(v_payment_clearing,2)) end
  ));
  if abs(v_payment_clearing)>0.009 then v_warnings:=v_warnings+1; end if;

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'key','accounting_automation','status',case when v_accounting_enabled and v_automatic_journals and v_automatic_invoice_posting then 'pass' else 'blocker' end,
    'title','Accounting automation','detail',case when v_accounting_enabled and v_automatic_journals and v_automatic_invoice_posting then 'Accounting and automatic invoice journals are enabled.' else 'Required automatic accounting settings are not fully enabled.' end
  ));
  if not (v_accounting_enabled and v_automatic_journals and v_automatic_invoice_posting) then v_blockers:=v_blockers+1; end if;

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'key','open_period','status',case when v_financial_year_status='open' and v_period_status='open' then 'pass' else 'blocker' end,
    'title','Financial period open','detail',format('Financial year: %s · current period: %s.',coalesce(v_financial_year_status,'missing'),coalesce(v_period_status,'missing'))
  ));
  if not (v_financial_year_status='open' and v_period_status='open') then v_blockers:=v_blockers+1; end if;

  return jsonb_build_object(
    'ok',true,
    'company_id',v_company_id,
    'pos_ready',v_blockers=0,
    'summary',jsonb_build_object(
      'blockers',v_blockers,
      'warnings',v_warnings,
      'posted_debits',round(v_ledger_debits,2),
      'posted_credits',round(v_ledger_credits,2),
      'product_revenue',round(v_product_revenue,2),
      'cost_of_sales',round(v_cogs,2),
      'reported_product_gross_margin_pct',v_margin,
      'trade_debtors_ledger',round(v_trade_debtors,2),
      'trade_debtors_subledger',round(v_subledger_receivables,2),
      'payment_clearing',round(v_payment_clearing,2),
      'inventory_ledger',round(v_inventory_ledger,2),
      'inventory_physical_estimate',round(v_inventory_physical_estimate,2)
    ),
    'checks',v_checks,
    'conclusion',case when v_blockers=0 then 'Accounting core is ready for POS integration.' else 'Do not make POS financially authoritative yet. Resolve the accounting blockers first.' end
  );
end;
$function$;

grant execute on function public.get_accounting_pos_readiness_audit() to authenticated;;
