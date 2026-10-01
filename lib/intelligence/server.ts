import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CoreModule, CoreSnapshot, Coverage, InventoryFact, PurchaseFact, QuotationFact, ReceivableFact, RepairFact, WhatsAppFact } from "./types";

export class CoreError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
type Row = Record<string, unknown>;
type Rows = { rows: Row[]; complete: boolean };
type Actor = { db: SupabaseClient; companyId: string; permissions: Set<string> };
const PERMISSIONS = ["inventory.view", "accounting.view", "quotation.view", "sales.view", "invoice.view", "purchasing.view", "repair.view", "company.view", "settings.finance.view", "whatsapp.view"];
const PAGE_SIZE = 500;
const MAX_ROWS = 10000;
const LABELS: Record<CoreModule, string> = { inventory: "Stock", receivables: "Unpaid invoices", quotations: "Quotations", purchasing: "Purchasing", repairs: "Repairs", controls: "Accounting checks", whatsapp: "WhatsApp Sales" };
const MODULE_PERMISSION: Record<CoreModule, string> = { inventory: "inventory.view", receivables: "accounting.view", quotations: "quotation.view", purchasing: "purchasing.view", repairs: "repair.view", controls: "accounting.view", whatsapp: "whatsapp.view" };

function row(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid source response");
  return value as Row;
}
function str(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid source text");
  return value;
}
function num(value: unknown): number {
  if ((typeof value !== "number" && typeof value !== "string") || value === "" || !Number.isFinite(Number(value))) throw new Error("Invalid source number");
  return Number(value);
}
function optionalText(value: unknown): string | null { return value == null ? null : str(value); }
function validCurrency(value: unknown): string | null { return typeof value === "string" && /^[A-Z]{3}$/.test(value) ? value : null; }

export async function authenticateCore(request: Request): Promise<Actor> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length > 10000) throw new CoreError("Please sign in to Nexus.", 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new CoreError("The Nexus data connection is not configured.", 503);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(25000)]);
  // Every query uses the verified user's token; the core never uses an admin key.
  const db = createClient(url, key, {
    global: { headers: { Authorization: authorization }, fetch: (input, init) => fetch(input, { ...init, signal }) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await db.auth.getUser(authorization.slice(7));
  if (error || !user) throw new CoreError("Your session has expired. Please sign in again.", 401);
  const { data: profile, error: profileError } = await db.from("user_profile").select("company_id,role").eq("user_id", user.id).single();
  if (profileError || !profile?.company_id) throw new CoreError("Your company access could not be verified.", 403);
  if (profile.role !== "owner") throw new CoreError("Nexus Intelligence is currently available to the company owner.", 403);
  const { data: companyId, error: companyError } = await db.rpc("current_company_id");
  if (companyError || companyId !== profile.company_id) throw new CoreError("Your company access is ambiguous.", 403);
  const checked = await Promise.all(PERMISSIONS.map(async permission => {
    const { data, error: permissionError } = await db.rpc("current_user_has_permission", { requested_permission: permission });
    if (permissionError) throw new CoreError("Your permissions could not be verified.", 503);
    return data === true ? permission : null;
  }));
  return { db, companyId, permissions: new Set(checked.filter((value): value is string => value !== null)) };
}

async function readAll(actor: Actor, table: string, columns: string, equals: Record<string, string | boolean> = {}): Promise<Rows> {
  const rows: Row[] = [];
  let expected: number | null = null;
  for (let start = 0; start <= MAX_ROWS; start += PAGE_SIZE) {
    let query = actor.db.from(table).select(columns, start === 0 ? { count: "exact" } : undefined).eq("company_id", actor.companyId).order("id").range(start, Math.min(start + PAGE_SIZE - 1, MAX_ROWS));
    for (const [key, value] of Object.entries(equals)) query = query.eq(key, value);
    const { data, error, count } = await query;
    if (error || !Array.isArray(data)) throw new Error("Source read failed");
    if (start === 0) {
      if (count === null || !Number.isInteger(count) || count < 0) throw new Error("Source count unavailable");
      expected = count;
    }
    if (start === MAX_ROWS) return { rows, complete: data.length === 0 && expected === rows.length };
    rows.push(...data.map(row));
    if (new Set(rows.map(entry => entry.id)).size !== rows.length) return { rows: Array.from(new Map(rows.map(entry => [entry.id, entry])).values()), complete: false };
    if (data.length < PAGE_SIZE) return { rows, complete: expected === rows.length };
  }
  return { rows, complete: false };
}

export function johannesburgDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
}

export async function loadCoreSnapshot(actor: Actor, now = new Date()): Promise<CoreSnapshot> {
  const snapshot: CoreSnapshot = { companyId: actor.companyId, companyName: "Your company", currency: null, asOf: johannesburgDate(now), checkedAt: now.toISOString(), coverage: [], inventory: null, receivables: null, quotations: null, purchasing: null, repairs: null, whatsapp: null, controls: null };
  let settingsCurrency: string | null = null;
  let ageingCurrency: string | null = null;
  const coverage = new Map<CoreModule, Coverage>();
  function mark(module: CoreModule, state: Coverage["state"], records: number | null, detail: string) { coverage.set(module, { module, label: LABELS[module], state, records, detail }); }
  async function source<T>(module: CoreModule, task: () => Promise<{ value: T; records: number; complete: boolean; detail?: string }>): Promise<T | null> {
    if (!actor.permissions.has(MODULE_PERMISSION[module])) { mark(module, "forbidden", null, "This area is outside your current permissions."); return null; }
    try {
      const result = await task();
      mark(module, result.complete ? "ready" : "partial", result.records, result.detail || (result.complete ? "Current permitted records checked." : "Only part of this area was available; totals may be incomplete."));
      return result.value;
    } catch {
      mark(module, "unavailable", null, "This area could not be checked. Refresh or open its Nexus module.");
      return null;
    }
  }
  // Shared read results prevent duplicate requests. No business-record refresh/mutation RPCs.
  const purchaseInputs = actor.permissions.has("purchasing.view") ? Promise.all([
    readAll(actor, "purchase_order", "id,purchase_order_number,status,expected_date"),
    readAll(actor, "purchase_order_item", "id,purchase_order_id,inventory_item_id,quantity_ordered,quantity_received"),
  ]).catch(() => null) : Promise.resolve(null);
  const financialCompany = actor.permissions.has("accounting.view") ? Promise.resolve(actor.db.rpc("current_settings_company_id")).then(({ data, error }) => !error && data === actor.companyId).catch(() => false) : Promise.resolve(false);
  await Promise.all([
    (async () => { if (actor.permissions.has("company.view")) { const { data, error } = await actor.db.from("company").select("company_name").eq("id", actor.companyId).maybeSingle(); if (!error && typeof data?.company_name === "string") snapshot.companyName = data.company_name; } })().catch(() => {}),
    (async () => { if (actor.permissions.has("settings.finance.view")) { const { data, error } = await actor.db.from("company_finance_settings").select("base_currency").eq("company_id", actor.companyId).maybeSingle(); if (!error) settingsCurrency = validCurrency(data?.base_currency); } })().catch(() => {}),
    (async () => { snapshot.inventory = await source<InventoryFact[] | null>("inventory", async () => {
      const [items, stock, purchase] = await Promise.all([readAll(actor, "inventory_item", "id,item_name,sku,minimum_stock", { is_active: true }), readAll(actor, "branch_stock", "id,inventory_item_id,quantity"), purchaseInputs]);
      // Partial branch totals could manufacture stock shortages. Withhold them entirely.
      if (!stock.complete) return { value: null, records: items.rows.length, complete: false, detail: "The stock read reached its limit. Stock levels and shortage conclusions are withheld." };
      const quantities = new Map<string, number>();
      for (const entry of stock.rows) { const id = str(entry.inventory_item_id); quantities.set(id, (quantities.get(id) ?? 0) + num(entry.quantity)); }
      const inbound = new Map<string, number>();
      const approvedOrders = purchase?.[0].rows.filter(order => ["approved", "partially_received"].includes(str(order.status))) ?? [];
      const ordersWithLines = new Set(purchase?.[1].rows.map(item => str(item.purchase_order_id)) ?? []);
      const onOrderKnown = purchase !== null && purchase.every(input => input.complete) && approvedOrders.every(order => ordersWithLines.has(str(order.id)));
      if (onOrderKnown) {
        const approved = new Set(approvedOrders.map(order => str(order.id)));
        for (const item of purchase[1].rows) if (approved.has(str(item.purchase_order_id))) { const id = str(item.inventory_item_id); inbound.set(id, (inbound.get(id) ?? 0) + Math.max(num(item.quantity_ordered) - num(item.quantity_received), 0)); }
      }
      return { value: items.rows.map(item => ({ id: str(item.id), name: str(item.item_name), sku: str(item.sku), minimumStock: num(item.minimum_stock), quantity: quantities.get(str(item.id)) ?? 0, onOrder: onOrderKnown ? inbound.get(str(item.id)) ?? 0 : null })), records: items.rows.length, complete: items.complete, detail: `${items.complete ? "Active items and company-wide stock checked." : "Only the first 10,000 active items were checked."}${onOrderKnown ? " Approved incoming orders included." : " Incoming order quantities were not verified."}` };
    }); })(),
    (async () => { snapshot.purchasing = await source<PurchaseFact[]>("purchasing", async () => {
      const purchase = await purchaseInputs;
      if (!purchase) throw new Error("Purchasing unavailable");
      const outstanding = new Map<string, number>();
      for (const item of purchase[1].rows) { const id = str(item.purchase_order_id); outstanding.set(id, (outstanding.get(id) ?? 0) + Math.max(num(item.quantity_ordered) - num(item.quantity_received), 0)); }
      const orders = purchase[0].rows.filter(order => ["approved", "partially_received"].includes(str(order.status)));
      const complete = purchase.every(input => input.complete) && orders.every(order => outstanding.has(str(order.id)));
      return { value: orders.map(order => ({ id: str(order.id), number: str(order.purchase_order_number), status: str(order.status), expectedDate: optionalText(order.expected_date), outstandingUnits: purchase[1].complete ? outstanding.get(str(order.id)) ?? null : null })), records: orders.length, complete };
    }); })(),
    (async () => { snapshot.receivables = await source<ReceivableFact[]>("receivables", async () => {
      if (!await financialCompany) throw new Error("Finance company mismatch");
      const { data, error } = await actor.db.rpc("get_debtor_ageing", { p_as_of_date: snapshot.asOf });
      const result = row(data);
      if (error || result.ok !== true || !Array.isArray(result.invoices)) throw new Error("Ageing unavailable");
      const summary = row(result.summary);
      const invoices = result.invoices.map(row);
      if (num(summary.open_invoice_count) !== invoices.length) throw new Error("Incomplete ageing result");
      const currency = validCurrency(result.currency);
      if (currency) ageingCurrency = currency;
      return { value: invoices.map(invoice => ({ id: str(invoice.invoice_id), number: str(invoice.invoice_number), customerName: str(invoice.customer_name), outstanding: num(invoice.outstanding), daysOverdue: num(invoice.days_overdue), dueDate: str(invoice.due_date) })), records: invoices.length, complete: true, detail: "Open invoice balances recalculated from recorded payments as of the shown date. This is operational debt, not a cash forecast." };
    }); })(),
    (async () => { snapshot.quotations = await source<QuotationFact[]>("quotations", async () => {
      const [quotes, orders, invoices] = await Promise.all([
        readAll(actor, "quotation", "id,quotation_number,status,quotation_date,valid_until,total_amount"),
        actor.permissions.has("sales.view") ? readAll(actor, "sales_order", "id,quotation_id,status").catch(() => null) : Promise.resolve(null),
        actor.permissions.has("invoice.view") ? readAll(actor, "invoice", "id,quotation_id,status").catch(() => null) : Promise.resolve(null),
      ]);
      const conversionKnown = orders !== null && orders.complete && invoices !== null && invoices.complete;
      // A draft linked document also means conversion has started; do not suggest duplicating it.
      const converted = new Set([...(orders?.rows ?? []), ...(invoices?.rows ?? [])].filter(document => str(document.status) !== "cancelled").map(document => optionalText(document.quotation_id)));
      return { value: quotes.rows.map(quote => ({ id: str(quote.id), number: str(quote.quotation_number), status: str(quote.status), date: str(quote.quotation_date), validUntil: optionalText(quote.valid_until), total: num(quote.total_amount), converted: converted.has(str(quote.id)) ? true : conversionKnown ? false : null })), records: quotes.rows.length, complete: quotes.complete, detail: `${quotes.complete ? "Quotation records checked." : "Only part of the quotation list was available."}${conversionKnown ? " Linked sales orders and invoices checked." : " Sales-order and invoice conversion could not be fully checked."}` };
    }); })(),
    (async () => { snapshot.repairs = await source<RepairFact[]>("repairs", async () => {
      const jobs = await readAll(actor, "service_job", "id,job_number,status,assigned_employee_id,created_at,updated_at");
      return { value: jobs.rows.map(job => ({ id: str(job.id), number: str(job.job_number), status: str(job.status), assigned: job.assigned_employee_id !== null, createdAt: str(job.created_at), updatedAt: str(job.updated_at) })), records: jobs.rows.length, complete: jobs.complete };
    }); })(),
    (async () => { snapshot.whatsapp = await source<WhatsAppFact[]>("whatsapp", async () => {
      const conversations = await readAll(actor, "whatsapp_conversation", "id,contact_name,wa_id,status,sales_stage,attention_state,assigned_to,customer_id,unread_count,follow_up_at,last_inbound_at,last_message_at,sales_value");
      return { value: conversations.rows.map(item => ({ id: str(item.id), contactName: str(item.contact_name), waId: str(item.wa_id), status: str(item.status), salesStage: str(item.sales_stage), attentionState: str(item.attention_state), assigned: item.assigned_to !== null, customerLinked: item.customer_id !== null, unreadCount: num(item.unread_count), followUpAt: optionalText(item.follow_up_at), lastInboundAt: optionalText(item.last_inbound_at), lastMessageAt: optionalText(item.last_message_at), salesValue: item.sales_value === null ? null : num(item.sales_value) })), records: conversations.rows.length, complete: conversations.complete, detail: conversations.complete ? "WhatsApp sales conversations checked." : "Only part of the WhatsApp conversation list was available." };
    }); })(),
    (async () => { snapshot.controls = await source("controls", async () => {
      if (!await financialCompany) throw new Error("Finance company mismatch");
      const { data, error } = await actor.db.rpc("get_accounting_exception_summary");
      const result = row(data);
      if (error || result.ok !== true) throw new Error("Accounting checks unavailable");
      const count = num(result.open_count);
      if (!Number.isInteger(count) || count < 0) throw new Error("Invalid exception count");
      return { value: { openCount: count, oldestOpenDate: optionalText(result.oldest_open_date) }, records: count, complete: true };
    }); })(),
  ]);
  snapshot.currency = ageingCurrency || settingsCurrency;
  snapshot.coverage = (Object.keys(LABELS) as CoreModule[]).map(module => coverage.get(module)!);
  return snapshot;
}
