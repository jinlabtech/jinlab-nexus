create or replace function public.budget_html_escape(p_value text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select replace(replace(replace(replace(replace(coalesce(p_value,''),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#39;');
$function$;

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
  m jsonb;
  a jsonb;
  html text := '';
  scenario text;
  confidence text;
  warning text;
  draft_notice text;
  methodology_html text := '';
  item jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not public.current_user_has_permission('accounting.view') then
    raise exception 'Permission denied: accounting.view';
  end if;

  r := public.get_budget_print_report(p_budget_id,coalesce(p_as_of_date,current_date));

  scenario := coalesce(r->'budget'->'generation_metadata'->>'scenario','Manual');
  confidence := coalesce(r->'budget'->'generation_metadata'->>'confidence','n/a');
  warning := coalesce(r->>'quality_warning','');
  draft_notice := coalesce(r->'document'->>'draft_notice','');

  for item in select value from jsonb_array_elements(coalesce(r->'methodology','[]'::jsonb))
  loop
    methodology_html := methodology_html || '<li>' || public.budget_html_escape(item#>>'{}') || '</li>';
  end loop;

  html := '<!doctype html><html><head><meta charset="utf-8"><title>' ||
    public.budget_html_escape(r->'budget'->>'name') ||
    '</title><style>
      @page{size:A4;margin:13mm}
      *{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;font-size:11px;line-height:1.35}
      .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #111;padding-bottom:10px;margin-bottom:14px}
      .brand{font-size:22px;font-weight:800;letter-spacing:.2px}
      .muted{color:#5c6470}
      .right{text-align:right}
      h1{font-size:19px;margin:3px 0 2px}
      h2{font-size:14px;margin:18px 0 8px;border-bottom:1px solid #ccd3dc;padding-bottom:5px}
      .badge{display:inline-block;border:1px solid #111;border-radius:999px;padding:3px 8px;font-size:9px;font-weight:700;text-transform:uppercase;margin-left:5px}
      .draft{border:2px solid #111;padding:7px 9px;font-weight:700;margin:10px 0}
      .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}
      .card{border:1px solid #cfd5dd;border-radius:7px;padding:9px;min-height:58px}
      .card .label{font-size:9px;text-transform:uppercase;color:#5c6470}
      .card .value{font-size:16px;font-weight:800;margin-top:4px}
      table{width:100%;border-collapse:collapse;margin-top:6px}
      th,td{border-bottom:1px solid #d7dce3;padding:5px 6px;text-align:right;vertical-align:top}
      th{background:#f2f4f7;font-size:9px;text-transform:uppercase}
      th:first-child,td:first-child{text-align:left}
      .section-note{background:#f6f7f9;border-left:3px solid #111;padding:8px 10px;margin:8px 0}
      .warning{border:1px solid #111;padding:8px 10px;margin:8px 0;font-weight:600}
      ul{margin:6px 0 0 18px;padding:0}
      li{margin:3px 0}
      .signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:28px}
      .signature{border-top:1px solid #111;padding-top:5px}
      .footer{margin-top:18px;border-top:1px solid #d7dce3;padding-top:7px;display:flex;justify-content:space-between;color:#6b7280;font-size:9px}
      .no-print{margin:0 0 12px;text-align:right}
      .print-btn{border:0;background:#111;color:#fff;padding:8px 14px;border-radius:6px;font-weight:700;cursor:pointer}
      @media print{.no-print{display:none}.page-break{break-before:page}}
    </style></head><body>';

  html := html || '<div class="no-print"><button class="print-btn" onclick="window.print()">Print / Save PDF</button></div>';

  html := html || '<div class="top"><div><div class="brand">' ||
    public.budget_html_escape(r->'company'->>'name') ||
    '</div><div class="muted">Budget &amp; Performance Plan</div></div><div class="right"><strong>' ||
    public.budget_html_escape(r->'financial_year'->>'name') ||
    '</strong><br><span class="muted">As at ' ||
    public.budget_html_escape(r->'document'->>'as_of_date') ||
    '</span></div></div>';

  html := html || '<h1>' || public.budget_html_escape(r->'budget'->>'name') ||
    '<span class="badge">' || public.budget_html_escape(r->'budget'->>'status') || '</span></h1>';

  html := html || '<div class="muted">Scope: ' ||
    case when nullif(r->'company'->>'branch_name','') is null then 'Whole company' else public.budget_html_escape(r->'company'->>'branch_name') end ||
    ' · Scenario: ' || public.budget_html_escape(initcap(scenario)) ||
    ' · Data confidence: ' || public.budget_html_escape(initcap(confidence)) || '</div>';

  if draft_notice <> '' then
    html := html || '<div class="draft">' || public.budget_html_escape(draft_notice) || '</div>';
  end if;

  html := html || '<div class="grid">' ||
    '<div class="card"><div class="label">Annual Revenue Target</div><div class="value">R ' || to_char(coalesce((r->'summary'->>'annual_revenue_budget')::numeric,0),'FM999G999G999G990D00') || '</div></div>' ||
    '<div class="card"><div class="label">Annual Expense Target</div><div class="value">R ' || to_char(coalesce((r->'summary'->>'annual_expense_budget')::numeric,0),'FM999G999G999G990D00') || '</div></div>' ||
    '<div class="card"><div class="label">Annual Profit Target</div><div class="value">R ' || to_char(coalesce((r->'summary'->>'annual_net_profit_budget')::numeric,0),'FM999G999G999G990D00') || '</div></div>' ||
    '<div class="card"><div class="label">Target Net Margin</div><div class="value">' || coalesce(to_char((r->'summary'->>'annual_net_margin_budget_pct')::numeric,'FM990D00'),'—') || '%</div></div>' ||
    '</div>';

  html := html || '<div class="section-note"><strong>Current performance:</strong> Revenue to date R ' ||
    to_char(coalesce((r->'summary'->>'actual_revenue_to_date')::numeric,0),'FM999G999G999G990D00') ||
    ' · Profit to date R ' || to_char(coalesce((r->'summary'->>'actual_net_profit_to_date')::numeric,0),'FM999G999G999G990D00') ||
    ' · Revenue progress ' || coalesce(to_char((r->'summary'->>'revenue_progress_pct')::numeric,'FM990D00'),'—') || '%</div>';

  if warning <> '' then
    html := html || '<div class="warning">Planning note: ' || public.budget_html_escape(warning) || '</div>';
  end if;

  html := html || '<h2>Monthly Plan</h2><table><thead><tr><th>Month</th><th>Revenue</th><th>COGS</th><th>Operating Exp.</th><th>Net Profit</th><th>Actual Revenue</th><th>Actual Profit</th></tr></thead><tbody>';

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

  html := html || '<h2>Account Targets</h2><table><thead><tr><th>Account</th><th>Type</th><th>Annual Budget</th><th>Actual to Date</th><th>Variance to Annual</th></tr></thead><tbody>';

  for a in select value from jsonb_array_elements(coalesce(r->'accounts','[]'::jsonb))
  loop
    html := html || '<tr><td>' || public.budget_html_escape((a->>'code') || ' · ' || (a->>'name')) || '</td>' ||
      '<td>' || public.budget_html_escape(initcap(a->>'account_type')) || '</td>' ||
      '<td>R ' || to_char(coalesce((a->>'annual_budget')::numeric,0),'FM999G999G990D00') || '</td>' ||
      '<td>R ' || to_char(coalesce((a->>'actual_to_date')::numeric,0),'FM999G999G990D00') || '</td>' ||
      '<td>R ' || to_char(coalesce((a->>'variance_to_annual_budget')::numeric,0),'FM999G999G990D00') || '</td></tr>';
  end loop;

  html := html || '</tbody></table>';

  if methodology_html <> '' then
    html := html || '<h2>Generation Methodology</h2><ul>' || methodology_html || '</ul>';
  end if;

  html := html || '<div class="signatures"><div class="signature">Prepared by<br><span class="muted">Name / Date</span></div><div class="signature">Reviewed by<br><span class="muted">Name / Date</span></div><div class="signature">Approved by<br><span class="muted">Name / Date</span></div></div>';

  html := html || '<div class="footer"><span>Generated by JINLAB Nexus</span><span>' || public.budget_html_escape(r->'document'->>'generated_at') || '</span></div>';

  html := html || '</body></html>';

  return html;
end;
$function$;

grant execute on function public.get_budget_print_html(uuid,date) to authenticated;;
