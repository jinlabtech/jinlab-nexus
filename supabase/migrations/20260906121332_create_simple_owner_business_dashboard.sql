create or replace function public.get_owner_business_dashboard(
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_overview jsonb;
  v_kpi jsonb;
  v_pnl jsonb;
  v_company_id uuid;
  v_company_name text;
  v_money_in numeric := 0;
  v_money_out numeric := 0;
  v_profit numeric := 0;
  v_assets numeric := 0;
  v_liabilities numeric := 0;
  v_cash numeric := 0;
  v_customers_owe numeric := 0;
  v_overdue numeric := 0;
  v_we_owe numeric := 0;
  v_health text := 'Getting started';
  v_health_message text := 'Nexus is building a clearer picture as transactions are posted.';
  v_budget jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('accounting.view') then
    raise exception 'Permission denied: accounting.view';
  end if;

  v_company_id := public.current_company_id();
  if v_company_id is null then
    raise exception 'Your account is not linked to a company.';
  end if;

  select company_name
  into v_company_name
  from public.company
  where id = v_company_id;

  v_overview := public.get_accounting_overview();
  v_kpi := public.get_accounting_kpi_dashboard(coalesce(p_as_of_date,current_date), null);
  v_pnl := public.get_profit_and_loss_report(null, coalesce(p_as_of_date,current_date), null);

  v_money_in := coalesce((v_kpi->'kpis'->>'revenue_ytd')::numeric,0);
  v_money_out := coalesce((v_kpi->'kpis'->>'cost_of_sales_ytd')::numeric,0)
                 + coalesce((v_kpi->'kpis'->>'operating_expenses_ytd')::numeric,0);
  v_profit := coalesce((v_kpi->'kpis'->>'net_profit_ytd')::numeric,0);
  v_assets := coalesce((v_overview->'balances'->>'assets')::numeric,0);
  v_liabilities := coalesce((v_overview->'balances'->>'liabilities')::numeric,0);
  v_cash := coalesce((v_kpi->'kpis'->>'cash_and_bank')::numeric,0);
  v_customers_owe := coalesce((v_kpi->'kpis'->>'trade_debtors')::numeric,0);
  v_overdue := coalesce((v_kpi->'kpis'->>'overdue_receivables')::numeric,0);
  v_we_owe := coalesce((v_kpi->'kpis'->>'trade_creditors')::numeric,0);
  v_budget := coalesce(v_kpi->'budget','{}'::jsonb);

  if v_money_in = 0 and v_money_out = 0 then
    v_health := 'Getting started';
    v_health_message := 'There is not enough financial activity yet for a strong trend.';
  elsif v_profit > 0 and (v_money_in = 0 or v_overdue <= v_money_in * 0.20) then
    v_health := 'Strong';
    v_health_message := 'The business is profitable and overdue customer money is within a manageable range.';
  elsif v_profit > 0 then
    v_health := 'Watch cash';
    v_health_message := 'The business is profitable, but too much customer money is still outstanding or overdue.';
  else
    v_health := 'Needs attention';
    v_health_message := 'Money going out is currently equal to or higher than money coming in.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'as_of_date', coalesce(p_as_of_date,current_date),
    'company', jsonb_build_object(
      'id', v_company_id,
      'name', v_company_name
    ),
    'simple', jsonb_build_object(
      'money_in', round(v_money_in,2),
      'money_out', round(v_money_out,2),
      'profit_kept', round(v_profit,2),
      'cash_available', round(v_cash,2),
      'customers_owe_us', round(v_customers_owe,2),
      'customer_money_overdue', round(v_overdue,2),
      'we_owe', round(v_we_owe,2),
      'assets', round(v_assets,2),
      'liabilities', round(v_liabilities,2),
      'net_position', round(v_assets-v_liabilities,2),
      'health', v_health,
      'health_message', v_health_message
    ),
    'explain', jsonb_build_object(
      'money_in', 'Money the business earned from sales and services.',
      'money_out', 'Costs and expenses used to run the business.',
      'profit', 'What remains after business costs and expenses.',
      'assets', 'Things and money the business owns or controls that can create value.',
      'liabilities', 'Money the business owes to other people or organisations.',
      'cash', 'Money currently available in cash and bank accounts.',
      'customers_owe', 'Sales already made but customers have not fully paid yet.'
    ),
    'budget', v_budget,
    'monthly', coalesce(v_pnl->'monthly','[]'::jsonb),
    'quality', jsonb_build_object(
      'healthy', coalesce((v_kpi->'quality'->>'healthy')::boolean,false),
      'open_posting_exceptions', coalesce((v_kpi->'kpis'->>'open_posting_exceptions')::int,0),
      'warning', v_pnl->'quality'->>'warning',
      'ledger_source', 'posted_journals'
    ),
    'technical', jsonb_build_object(
      'overview', v_overview,
      'kpi', v_kpi,
      'pnl', v_pnl
    )
  );
end;
$$;

grant execute on function public.get_owner_business_dashboard(date) to authenticated;

create or replace function public.get_business_performance_print_html(
  p_as_of_date date default current_date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  m jsonb;
  html text := '';
  s jsonb;
  b jsonb;
  max_value numeric := 1;
  revenue numeric;
  expense numeric;
  profit numeric;
  revenue_width numeric;
  expense_width numeric;
  profit_width numeric;
  in_total numeric;
  out_total numeric;
  money_in_pct numeric := 0;
  asset_total numeric;
  liability_total numeric;
  assets_pct numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('accounting.view') then
    raise exception 'Permission denied: accounting.view';
  end if;

  r := public.get_owner_business_dashboard(coalesce(p_as_of_date,current_date));
  s := r->'simple';
  b := r->'budget';

  in_total := greatest(coalesce((s->>'money_in')::numeric,0),0);
  out_total := greatest(coalesce((s->>'money_out')::numeric,0),0);
  if in_total + out_total > 0 then
    money_in_pct := round((in_total/(in_total+out_total))*100,1);
  end if;

  asset_total := greatest(coalesce((s->>'assets')::numeric,0),0);
  liability_total := greatest(coalesce((s->>'liabilities')::numeric,0),0);
  if asset_total + liability_total > 0 then
    assets_pct := round((asset_total/(asset_total+liability_total))*100,1);
  end if;

  select greatest(
    coalesce(max(greatest(
      abs((x->>'revenue_actual')::numeric),
      abs((x->>'cogs_actual')::numeric + (x->>'operating_expenses_actual')::numeric),
      abs((x->>'net_profit_actual')::numeric)
    )),0),
    1
  )
  into max_value
  from jsonb_array_elements(coalesce(r->'monthly','[]'::jsonb)) x;

  html := '<!doctype html><html><head><meta charset="utf-8"><title>Business Performance · ' ||
    public.budget_html_escape(r->'company'->>'name') ||
    '</title><style>
    @page{size:A4;margin:12mm}
    *{box-sizing:border-box}
    body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#101828;background:#fff;font-size:11px;line-height:1.4}
    .toolbar{display:flex;justify-content:flex-end;margin-bottom:12px}.btn{background:#111827;color:#fff;border:0;border-radius:8px;padding:9px 14px;font-weight:700;cursor:pointer}
    .header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:3px solid #111827;padding-bottom:12px;margin-bottom:15px}
    .brand{font-size:22px;font-weight:800}.muted{color:#667085}.right{text-align:right}
    .hero{padding:14px;border:1px solid #d0d5dd;border-radius:12px;background:#f8fafc;margin-bottom:14px}.hero h1{font-size:22px;margin:0 0 4px}.health{display:inline-block;margin-top:8px;border-radius:999px;padding:5px 9px;background:#ecfdf3;color:#027a48;font-weight:700}
    .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.card{border:1px solid #d0d5dd;border-radius:10px;padding:10px}.label{font-size:9px;color:#667085;text-transform:uppercase}.value{font-size:17px;font-weight:800;margin-top:4px}.help{font-size:9px;color:#667085;margin-top:4px}
    .visuals{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}.panel{border:1px solid #d0d5dd;border-radius:12px;padding:12px}.panel h2{font-size:14px;margin:0 0 10px}.pie-row{display:flex;align-items:center;gap:14px}.pie{width:110px;height:110px;border-radius:50%;position:relative;flex:none}.pie:after{content:"";position:absolute;inset:22px;border-radius:50%;background:#fff}.legend{display:grid;gap:8px}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}
    h2.section{font-size:15px;margin:18px 0 8px;border-bottom:1px solid #e4e7ec;padding-bottom:6px}.month{display:grid;grid-template-columns:70px 1fr 95px;gap:8px;align-items:center;margin:7px 0}.bars{display:grid;gap:3px}.bar{height:7px;border-radius:99px;min-width:1px}.green{background:#16a34a}.red{background:#ef4444}.blue{background:#2563eb}.purple{background:#7c3aed}.amber{background:#f59e0b}
    .summary-box{border-left:4px solid #2563eb;background:#eff6ff;padding:10px 12px;margin:10px 0}.warning{border-left:4px solid #f59e0b;background:#fffbeb;padding:10px 12px;margin:10px 0}
    .budget{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.budget .card{background:#f8fafc}
    .footer{margin-top:18px;border-top:1px solid #e4e7ec;padding-top:8px;display:flex;justify-content:space-between;color:#667085;font-size:9px}
    @media print{.toolbar{display:none}.panel,.card,.hero{break-inside:avoid}}
    </style></head><body>';

  html := html || '<div class="toolbar"><button class="btn" onclick="window.print()">Print / Save PDF</button></div>';
  html := html || '<div class="header"><div><div class="brand">' || public.budget_html_escape(r->'company'->>'name') || '</div><div class="muted">Simple Business Performance Report</div></div><div class="right"><strong>As at ' || public.budget_html_escape(r->>'as_of_date') || '</strong><br><span class="muted">Generated by JINLAB Nexus</span></div></div>';

  html := html || '<div class="hero"><h1>How is the business doing?</h1><div>' || public.budget_html_escape(s->>'health_message') || '</div><span class="health">' || public.budget_html_escape(s->>'health') || '</span></div>';

  html := html || '<div class="cards">' ||
    '<div class="card"><div class="label">Money In</div><div class="value">R ' || to_char((s->>'money_in')::numeric,'FM999G999G999G990D00') || '</div><div class="help">Sales and services earned</div></div>' ||
    '<div class="card"><div class="label">Money Out</div><div class="value">R ' || to_char((s->>'money_out')::numeric,'FM999G999G999G990D00') || '</div><div class="help">Costs and running expenses</div></div>' ||
    '<div class="card"><div class="label">Profit Kept</div><div class="value">R ' || to_char((s->>'profit_kept')::numeric,'FM999G999G999G990D00') || '</div><div class="help">What remains after costs</div></div>' ||
    '<div class="card"><div class="label">Cash Available</div><div class="value">R ' || to_char((s->>'cash_available')::numeric,'FM999G999G999G990D00') || '</div><div class="help">Cash and bank balance</div></div></div>';

  html := html || '<div class="visuals">' ||
    '<div class="panel"><h2>Money In vs Money Out</h2><div class="pie-row"><div class="pie" style="background:conic-gradient(#16a34a 0 ' || money_in_pct || '%,#ef4444 ' || money_in_pct || '% 100%)"></div><div class="legend"><div><span class="dot green"></span>Money In · R ' || to_char(in_total,'FM999G999G990D00') || '</div><div><span class="dot red"></span>Money Out · R ' || to_char(out_total,'FM999G999G990D00') || '</div><div class="muted">Green is value coming in. Red is business cost going out.</div></div></div></div>' ||
    '<div class="panel"><h2>What We Own vs What We Owe</h2><div class="pie-row"><div class="pie" style="background:conic-gradient(#2563eb 0 ' || assets_pct || '%,#f59e0b ' || assets_pct || '% 100%)"></div><div class="legend"><div><span class="dot blue"></span>Assets · R ' || to_char(asset_total,'FM999G999G990D00') || '</div><div><span class="dot amber"></span>Liabilities · R ' || to_char(liability_total,'FM999G999G990D00') || '</div><div class="muted">Assets create or hold value. Liabilities are amounts the business owes.</div></div></div></div></div>';

  html := html || '<div class="cards">' ||
    '<div class="card"><div class="label">Customers Owe Us</div><div class="value">R ' || to_char((s->>'customers_owe_us')::numeric,'FM999G999G999G990D00') || '</div></div>' ||
    '<div class="card"><div class="label">Customer Money Overdue</div><div class="value">R ' || to_char((s->>'customer_money_overdue')::numeric,'FM999G999G999G990D00') || '</div></div>' ||
    '<div class="card"><div class="label">We Owe</div><div class="value">R ' || to_char((s->>'we_owe')::numeric,'FM999G999G999G990D00') || '</div></div>' ||
    '<div class="card"><div class="label">Net Position</div><div class="value">R ' || to_char((s->>'net_position')::numeric,'FM999G999G999G990D00') || '</div></div></div>';

  html := html || '<h2 class="section">Month by Month</h2><div class="muted">Green = money in · Red = money out · Blue = profit kept</div>';

  for m in select value from jsonb_array_elements(coalesce(r->'monthly','[]'::jsonb))
  loop
    revenue := coalesce((m->>'revenue_actual')::numeric,0);
    expense := coalesce((m->>'cogs_actual')::numeric,0) + coalesce((m->>'operating_expenses_actual')::numeric,0);
    profit := coalesce((m->>'net_profit_actual')::numeric,0);
    revenue_width := least(100,round(abs(revenue)/max_value*100,1));
    expense_width := least(100,round(abs(expense)/max_value*100,1));
    profit_width := least(100,round(abs(profit)/max_value*100,1));

    html := html || '<div class="month"><strong>' || public.budget_html_escape(m->>'month_name') || '</strong><div class="bars"><div class="bar green" style="width:' || revenue_width || '%"></div><div class="bar red" style="width:' || expense_width || '%"></div><div class="bar blue" style="width:' || profit_width || '%"></div></div><div class="right">R ' || to_char(profit,'FM999G999G990D00') || '</div></div>';
  end loop;

  if coalesce((b->>'available')::boolean,false) then
    html := html || '<h2 class="section">Budget Check</h2><div class="budget">' ||
      '<div class="card"><div class="label">Money In Plan to Date</div><div class="value">R ' || to_char(coalesce((b->>'revenue_budget_ytd')::numeric,0),'FM999G999G999G990D00') || '</div></div>' ||
      '<div class="card"><div class="label">Money Out Plan to Date</div><div class="value">R ' || to_char(coalesce((b->>'expense_budget_ytd')::numeric,0),'FM999G999G999G990D00') || '</div></div>' ||
      '<div class="card"><div class="label">Profit Plan to Date</div><div class="value">R ' || to_char(coalesce((b->>'profit_budget_ytd')::numeric,0),'FM999G999G999G990D00') || '</div></div></div>';
  end if;

  html := html || '<h2 class="section">Simple Guide</h2><div class="summary-box"><strong>Assets:</strong> things and money the business owns or controls that can create value.<br><strong>Liabilities:</strong> money the business owes.<br><strong>Profit:</strong> what remains after costs and expenses.<br><strong>Customers owe us:</strong> money already earned but not yet collected.</div>';

  if nullif(r->'quality'->>'warning','') is not null then
    html := html || '<div class="warning"><strong>Data note:</strong> ' || public.budget_html_escape(r->'quality'->>'warning') || '</div>';
  end if;

  html := html || '<div class="footer"><span>Simple reporting for owners · detailed accounting stays in the background</span><span>JINLAB Nexus</span></div></body></html>';

  return html;
end;
$$;

grant execute on function public.get_business_performance_print_html(date) to authenticated;;
