create or replace function public.get_budget_print_html(
  p_budget_id uuid,
  p_as_of_date date default current_date
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r jsonb;
  k jsonb;
  m jsonb;
  a jsonb;
  html text := '';
  scenario text;
  confidence text;
  warning text;
  draft_notice text;
  methodology_html text := '';
  item jsonb;

  annual_revenue numeric := 0;
  annual_expense numeric := 0;
  annual_cogs numeric := 0;
  annual_profit numeric := 0;
  annual_opex numeric := 0;
  actual_revenue numeric := 0;
  actual_expense numeric := 0;
  actual_profit numeric := 0;

  cash_bank numeric := 0;
  debtors numeric := 0;
  creditors numeric := 0;

  cogs_pct numeric := 0;
  opex_pct numeric := 0;
  profit_pct numeric := 0;
  money_total numeric := 0;
  cash_pct numeric := 0;
  debtors_pct numeric := 0;

  max_month_value numeric := 1;
  plan_width numeric := 0;
  actual_width numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('accounting.view') then
    raise exception 'Permission denied: accounting.view';
  end if;

  r := public.get_budget_print_report(
    p_budget_id,
    coalesce(p_as_of_date,current_date)
  );

  k := public.get_accounting_kpi_dashboard(
    coalesce(p_as_of_date,current_date),
    (r->'budget'->>'branch_id')::uuid
  );

  scenario := coalesce(r->'budget'->'generation_metadata'->>'scenario','Manual');
  confidence := coalesce(r->'budget'->'generation_metadata'->>'confidence','n/a');
  warning := coalesce(r->>'quality_warning','');
  draft_notice := coalesce(r->'document'->>'draft_notice','');

  annual_revenue := coalesce((r->'summary'->>'annual_revenue_budget')::numeric,0);
  annual_expense := coalesce((r->'summary'->>'annual_expense_budget')::numeric,0);
  annual_cogs := coalesce((r->'summary'->>'annual_cogs_budget')::numeric,0);
  annual_profit := coalesce((r->'summary'->>'annual_net_profit_budget')::numeric,0);
  annual_opex := greatest(annual_expense-annual_cogs,0);

  actual_revenue := coalesce((r->'summary'->>'actual_revenue_to_date')::numeric,0);
  actual_expense := coalesce((r->'summary'->>'actual_expense_to_date')::numeric,0);
  actual_profit := coalesce((r->'summary'->>'actual_net_profit_to_date')::numeric,0);

  cash_bank := coalesce((k->'kpis'->>'cash_and_bank')::numeric,0);
  debtors := coalesce((k->'kpis'->>'trade_debtors')::numeric,0);
  creditors := coalesce((k->'kpis'->>'trade_creditors')::numeric,0);

  if annual_revenue > 0 then
    cogs_pct := least(100,greatest(0,round((annual_cogs/annual_revenue)*100,2)));
    opex_pct := least(100,greatest(0,round((annual_opex/annual_revenue)*100,2)));
    profit_pct := least(100,greatest(0,round((annual_profit/annual_revenue)*100,2)));
  end if;

  money_total := greatest(cash_bank,0)+greatest(debtors,0);
  if money_total > 0 then
    cash_pct := round((greatest(cash_bank,0)/money_total)*100,2);
    debtors_pct := 100-cash_pct;
  end if;

  select greatest(
    coalesce(max(greatest(
      coalesce((x->>'revenue_budget')::numeric,0),
      coalesce((x->>'revenue_actual')::numeric,0)
    )),0),
    1
  )
  into max_month_value
  from jsonb_array_elements(coalesce(r->'monthly_plan','[]'::jsonb)) x;

  for item in
    select value
    from jsonb_array_elements(coalesce(r->'methodology','[]'::jsonb))
  loop
    methodology_html := methodology_html ||
      '<li>' || public.budget_html_escape(item#>>'{}') || '</li>';
  end loop;

  html := '<!doctype html><html><head><meta charset="utf-8"><title>' ||
    public.budget_html_escape(r->'budget'->>'name') ||
    '</title><style>
      @page{size:A4;margin:12mm}
      *{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;font-size:11px;line-height:1.4;background:#fff}
      .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #111;padding-bottom:10px;margin-bottom:14px}
      .brand{font-size:22px;font-weight:800;letter-spacing:.2px}
      .muted{color:#667085}
      .right{text-align:right}
      h1{font-size:19px;margin:3px 0 2px}
      h2{font-size:14px;margin:18px 0 8px;border-bottom:1px solid #d0d5dd;padding-bottom:5px}
      h3{font-size:12px;margin:0 0 5px}
      .badge{display:inline-block;border:1px solid #111;border-radius:999px;padding:3px 8px;font-size:9px;font-weight:700;text-transform:uppercase;margin-left:5px}
      .draft{border:2px solid #111;padding:7px 9px;font-weight:700;margin:10px 0}
      .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}
      .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:10px 0}
      .grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:10px 0}
      .card{border:1px solid #d0d5dd;border-radius:8px;padding:10px;min-height:62px;background:#fff}
      .card .label{font-size:9px;text-transform:uppercase;color:#667085}
      .card .value{font-size:17px;font-weight:800;margin-top:4px}
      .plain{font-size:10px;color:#475467;margin-top:4px}
      .explain{background:#f8fafc;border:1px solid #e4e7ec;border-radius:8px;padding:10px}
      .simple-row{display:grid;grid-template-columns:130px 1fr;gap:8px;margin:6px 0}
      .simple-row strong{font-size:10px}
      .chart-card{border:1px solid #d0d5dd;border-radius:8px;padding:12px;break-inside:avoid}
      .donut{width:122px;height:122px;border-radius:50%;margin:8px auto;position:relative}
      .donut:after{content:"";position:absolute;inset:24px;background:#fff;border-radius:50%}
      .legend{display:grid;gap:5px;margin-top:8px}
      .legend-row{display:flex;justify-content:space-between;gap:8px;font-size:10px}
      .legend-left{display:flex;align-items:center;gap:6px}
      .dot{width:9px;height:9px;border-radius:2px;display:inline-block;background:#111}
      .dot.mid{background:#667085}.dot.light{background:#d0d5dd}
      .bars{display:grid;gap:8px;margin-top:10px}
      .bar-row{display:grid;grid-template-columns:72px 1fr 105px;gap:8px;align-items:center}
      .bar-area{display:grid;gap:3px}
      .bar{height:8px;border-radius:999px;background:#111;min-width:1px}
      .bar.actual{background:#98a2b3}
      .bar-label{font-size:9px;color:#667085;text-align:right}
      table{width:100%;border-collapse:collapse;margin-top:6px}
      th,td{border-bottom:1px solid #eaecf0;padding:5px 6px;text-align:right;vertical-align:top}
      th{background:#f8fafc;font-size:9px;text-transform:uppercase;color:#475467}
      th:first-child,td:first-child{text-align:left}
      .section-note{background:#f8fafc;border-left:3px solid #111;padding:9px 10px;margin:8px 0}
      .warning{border:1px solid #111;padding:8px 10px;margin:8px 0;font-weight:600}
      ul{margin:6px 0 0 18px;padding:0} li{margin:3px 0}
      .signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:28px}
      .signature{border-top:1px solid #111;padding-top:5px}
      .footer{margin-top:18px;border-top:1px solid #d7dce3;padding-top:7px;display:flex;justify-content:space-between;color:#6b7280;font-size:9px}
      .no-print{margin:0 0 12px;text-align:right}
      .print-btn{border:0;background:#111;color:#fff;padding:8px 14px;border-radius:6px;font-weight:700;cursor:pointer}
      .page-break{break-before:page}
      @media print{.no-print{display:none}.page-break{break-before:page}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    </style></head><body>';

  html := html || '<div class="no-print"><button class="print-btn" onclick="window.print()">Print / Save PDF</button></div>';

  html := html || '<div class="top"><div><div class="brand">' ||
    public.budget_html_escape(r->'company'->>'name') ||
    '</div><div class="muted">Simple Business Budget &amp; Performance</div></div><div class="right"><strong>' ||
    public.budget_html_escape(r->'financial_year'->>'name') ||
    '</strong><br><span class="muted">As at ' ||
    public.budget_html_escape(r->'document'->>'as_of_date') ||
    '</span></div></div>';

  html := html || '<h1>' || public.budget_html_escape(r->'budget'->>'name') ||
    '<span class="badge">' || public.budget_html_escape(r->'budget'->>'status') || '</span></h1>';

  html := html || '<div class="muted">' ||
    case when nullif(r->'company'->>'branch_name','') is null then 'Whole company' else public.budget_html_escape(r->'company'->>'branch_name') end ||
    ' · Plan: ' || public.budget_html_escape(initcap(scenario)) ||
    ' · Data confidence: ' || public.budget_html_escape(initcap(confidence)) || '</div>';

  if draft_notice <> '' then
    html := html || '<div class="draft">' || public.budget_html_escape(draft_notice) || '</div>';
  end if;

  html := html || '<div class="grid4">' ||
    '<div class="card"><div class="label">Money In Target</div><div class="value">R ' || to_char(annual_revenue,'FM999G999G999G990D00') || '</div><div class="plain">How much the business plans to earn.</div></div>' ||
    '<div class="card"><div class="label">Money Out Target</div><div class="value">R ' || to_char(annual_expense,'FM999G999G999G990D00') || '</div><div class="plain">Stock costs and running costs planned.</div></div>' ||
    '<div class="card"><div class="label">Profit Target</div><div class="value">R ' || to_char(annual_profit,'FM999G999G999G990D00') || '</div><div class="plain">What should remain after costs.</div></div>' ||
    '<div class="card"><div class="label">Target Profit Margin</div><div class="value">' || coalesce(to_char((r->'summary'->>'annual_net_margin_budget_pct')::numeric,'FM990D00'),'—') || '%</div><div class="plain">Profit kept from every R100 earned.</div></div>' ||
    '</div>';

  html := html || '<h2>Business Position — Plain English</h2><div class="grid3">' ||
    '<div class="card"><div class="label">Cash &amp; Bank</div><div class="value">R ' || to_char(cash_bank,'FM999G999G999G990D00') || '</div><div class="plain">Money currently available to the business.</div></div>' ||
    '<div class="card"><div class="label">Customers Owe Us</div><div class="value">R ' || to_char(debtors,'FM999G999G999G990D00') || '</div><div class="plain">Sales already made but cash not yet collected.</div></div>' ||
    '<div class="card"><div class="label">We Owe Suppliers / Others</div><div class="value">R ' || to_char(creditors,'FM999G999G999G990D00') || '</div><div class="plain">Amounts the business still needs to pay.</div></div>' ||
    '</div>';

  html := html || '<div class="explain">' ||
    '<div class="simple-row"><strong>Assets</strong><span>Value the business owns or controls. They help the business hold or create value.</span></div>' ||
    '<div class="simple-row"><strong>Liabilities</strong><span>Amounts the business owes. They can require money to leave the business later.</span></div>' ||
    '<div class="simple-row"><strong>Revenue</strong><span>Money earned from sales and services.</span></div>' ||
    '<div class="simple-row"><strong>Expenses</strong><span>Money used to buy stock and run the business.</span></div>' ||
    '<div class="simple-row"><strong>Profit</strong><span>What remains after expenses are taken away from revenue.</span></div>' ||
    '</div>';

  html := html || '<h2>See the Plan</h2><div class="grid2">';

  html := html || '<div class="chart-card"><h3>Where every planned rand goes</h3><div class="muted">Stock cost + running costs + profit</div>' ||
    '<div class="donut" style="background:conic-gradient(#111 0 ' || cogs_pct || '%,#667085 ' || cogs_pct || '% ' || (cogs_pct+opex_pct) || '%,#d0d5dd ' || (cogs_pct+opex_pct) || '% 100%)"></div>' ||
    '<div class="legend">' ||
    '<div class="legend-row"><span class="legend-left"><span class="dot"></span>Stock / Cost of Sales</span><strong>' || to_char(cogs_pct,'FM990D0') || '%</strong></div>' ||
    '<div class="legend-row"><span class="legend-left"><span class="dot mid"></span>Running Costs</span><strong>' || to_char(opex_pct,'FM990D0') || '%</strong></div>' ||
    '<div class="legend-row"><span class="legend-left"><span class="dot light"></span>Profit Kept</span><strong>' || to_char(profit_pct,'FM990D0') || '%</strong></div>' ||
    '</div></div>';

  html := html || '<div class="chart-card"><h3>Money position today</h3><div class="muted">Cash available vs money customers still owe</div>' ||
    '<div class="donut" style="background:conic-gradient(#111 0 ' || cash_pct || '%,#d0d5dd ' || cash_pct || '% 100%)"></div>' ||
    '<div class="legend">' ||
    '<div class="legend-row"><span class="legend-left"><span class="dot"></span>Cash &amp; Bank</span><strong>R ' || to_char(cash_bank,'FM999G999G990D00') || '</strong></div>' ||
    '<div class="legend-row"><span class="legend-left"><span class="dot light"></span>Customers Owe Us</span><strong>R ' || to_char(debtors,'FM999G999G990D00') || '</strong></div>' ||
    '</div></div></div>';

  html := html || '<h2>Month by Month</h2><div class="section-note"><strong>How to read this:</strong> Black bar = plan. Grey bar = what actually happened. Longer is better for money in. Profit below tells you what the business kept.</div><div class="bars">';

  for m in select value from jsonb_array_elements(coalesce(r->'monthly_plan','[]'::jsonb))
  loop
    plan_width := least(100,greatest(0,round((coalesce((m->>'revenue_budget')::numeric,0)/max_month_value)*100,2)));
    actual_width := least(100,greatest(0,round((coalesce((m->>'revenue_actual')::numeric,0)/max_month_value)*100,2)));

    html := html || '<div class="bar-row"><strong>' || public.budget_html_escape(m->>'period_name') || '</strong><div class="bar-area">' ||
      '<div class="bar" style="width:' || plan_width || '%"></div>' ||
      '<div class="bar actual" style="width:' || actual_width || '%"></div>' ||
      '</div><div class="bar-label">Plan R ' || to_char(coalesce((m->>'revenue_budget')::numeric,0),'FM999G999G990') || '<br>Actual R ' || to_char(coalesce((m->>'revenue_actual')::numeric,0),'FM999G999G990') || '<br>Profit R ' || to_char(coalesce((m->>'net_profit_actual')::numeric,0),'FM999G999G990') || '</div></div>';
  end loop;

  html := html || '</div>';

  html := html || '<h2>Plan vs What Actually Happened</h2><div class="grid3">' ||
    '<div class="card"><div class="label">Money In So Far</div><div class="value">R ' || to_char(actual_revenue,'FM999G999G999G990D00') || '</div><div class="plain">Annual target: R ' || to_char(annual_revenue,'FM999G999G999G990D00') || '</div></div>' ||
    '<div class="card"><div class="label">Money Out So Far</div><div class="value">R ' || to_char(actual_expense,'FM999G999G999G990D00') || '</div><div class="plain">Annual plan: R ' || to_char(annual_expense,'FM999G999G999G990D00') || '</div></div>' ||
    '<div class="card"><div class="label">Profit So Far</div><div class="value">R ' || to_char(actual_profit,'FM999G999G999G990D00') || '</div><div class="plain">Annual target: R ' || to_char(annual_profit,'FM999G999G999G990D00') || '</div></div>' ||
    '</div>';

  if warning <> '' then
    html := html || '<div class="warning">Important planning note: ' || public.budget_html_escape(warning) || '</div>';
  end if;

  html := html || '<div class="page-break"></div><h2>Detailed Monthly Plan</h2><table><thead><tr><th>Month</th><th>Money In Plan</th><th>Stock Cost Plan</th><th>Running Cost Plan</th><th>Profit Plan</th><th>Money In Actual</th><th>Profit Actual</th></tr></thead><tbody>';

  for m in select value from jsonb_array_elements(coalesce(r->'monthly_plan','[]'::jsonb))
  loop
    html := html || '<tr><td>' || public.budget_html_escape(m->>'period_name') || '</td>' ||
      '<td>R ' || to_char(coalesce((m->>'revenue_budget')::numeric,0),'FM999G999G990D00') || '</td>' ||
      '<td>R ' || to_char(coalesce((m->>'cogs_budget')::numeric,0),'FM999G999G990D00') || '</td>' ||
      '<td>R ' || to_char(coalesce((m->>'operating_expenses_budget')::numeric,0),'FM999G999G990D00') || '</td>' ||
      '<td>R ' || to_char(coalesce((m->>'net_profit_budget')::numeric,0),'FM999G999G990D00') || '</td>' ||
      '<td>R ' || to_char(coalesce((m->>'revenue_actual')::numeric,0),'FM999G999G990D00') || '</td>' ||
      '<td>R ' || to_char(coalesce((m->>'net_profit_actual')::numeric,0),'FM999G999G990D00') || '</td></tr>';
  end loop;

  html := html || '</tbody></table>';

  html := html || '<h2>Detailed Account Targets</h2><div class="section-note">This section is mainly for accountants and managers. The simple summary above is enough for everyday business decisions.</div><table><thead><tr><th>Account</th><th>Type</th><th>Annual Plan</th><th>Actual So Far</th></tr></thead><tbody>';

  for a in select value from jsonb_array_elements(coalesce(r->'accounts','[]'::jsonb))
  loop
    html := html || '<tr><td>' || public.budget_html_escape((a->>'code') || ' · ' || (a->>'name')) || '</td>' ||
      '<td>' || public.budget_html_escape(initcap(a->>'account_type')) || '</td>' ||
      '<td>R ' || to_char(coalesce((a->>'annual_budget')::numeric,0),'FM999G999G990D00') || '</td>' ||
      '<td>R ' || to_char(coalesce((a->>'actual_to_date')::numeric,0),'FM999G999G990D00') || '</td></tr>';
  end loop;

  html := html || '</tbody></table>';

  if methodology_html <> '' then
    html := html || '<h2>How Nexus Built This Plan</h2><ul>' || methodology_html || '</ul>';
  end if;

  html := html || '<div class="signatures"><div class="signature">Prepared by<br><span class="muted">Name / Date</span></div><div class="signature">Reviewed by<br><span class="muted">Name / Date</span></div><div class="signature">Approved by<br><span class="muted">Name / Date</span></div></div>';

  html := html || '<div class="footer"><span>Generated by JINLAB Nexus</span><span>' || public.budget_html_escape(r->'document'->>'generated_at') || '</span></div>';
  html := html || '</body></html>';

  return html;
end;
$function$;;
