import type { CoreAnalysis, CoreAnswer, CoreFinding, CoreMatch, CoreMetric, CoreModule, CoreSnapshot, CoreTopic, Coverage } from "./types";

const MODULES: CoreModule[] = ["inventory", "receivables", "quotations", "purchasing", "repairs", "controls", "whatsapp"];
const LABELS: Record<CoreModule, string> = { inventory: "Inventory", receivables: "Receivables", quotations: "Quotations", purchasing: "Purchasing", repairs: "Repairs", controls: "Accounting controls", whatsapp: "WhatsApp Sales" };
const ROUTES: Record<CoreModule, string> = { inventory: "/inventory", receivables: "/accounting/debtors", quotations: "/quotations", purchasing: "/purchasing", repairs: "/repairs/scanner", controls: "/accounting/exceptions", whatsapp: "/whatsapp" };
const SEVERITY = { high: 0, medium: 1, low: 2 };
const ANALYSIS_LIMIT = 30;
const ANSWER_LIMIT = 5;
const NUMBER = new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 2 });
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const number = (value: number) => NUMBER.format(value);
const clean = (value: string) => String(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
const status = (value: string) => value.toLowerCase().trim().replace(/[ -]+/g, "_");
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

function formatMoney(value: number, currency: string | null): string {
  if (!currency || !/^[A-Z]{3}$/.test(currency)) return `${number(value)} (currency unavailable)`;
  try { return new Intl.NumberFormat("en-ZA", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return `${number(value)} (currency unavailable)`; }
}

function day(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}

function daysPast(date: string | null, asOf: string): number | null {
  const end = day(asOf);
  const start = day(date);
  return end === null || start === null ? null : Math.floor((end - start) / 86400000);
}

function coverageFor(snapshot: CoreSnapshot): Coverage[] {
  return MODULES.map((module) => {
    const entries = snapshot.coverage.filter((item) => item.module === module);
    // Conflicting permissions must never expose a module through the local engine.
    const entry = entries.find((item) => item.state === "forbidden")
      || entries.find((item) => item.state === "unavailable") || entries[0];
    if (!entry) return { module, label: LABELS[module], state: "unavailable", detail: "No verified data coverage was supplied.", records: null };
    if ((entry.state === "ready" || entry.state === "partial") && snapshot[module] === null) {
      return { ...entry, state: "unavailable", detail: "The data source returned no usable snapshot.", records: null };
    }
    if (module === "controls" && snapshot.controls && (!finite(snapshot.controls.openCount) || snapshot.controls.openCount < 0)) {
      return { ...entry, state: "unavailable", detail: "The exception count is unavailable.", records: null };
    }
    return { ...entry };
  });
}

function unique<T extends { id: string }>(records: T[] | null): T[] {
  const seen = new Set<string>();
  return (records || []).filter((record) => {
    if (!record.id || seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  }).sort((a, b) => compare(a.id, b.id));
}

function inspect(snapshot: CoreSnapshot) {
  const money = (value: number) => formatMoney(value, snapshot.currency);
  const coverage = coverageFor(snapshot);
  const usable = (module: CoreModule) => coverage.some((item) => item.module === module && (item.state === "ready" || item.state === "partial"));
  const partial = (module: CoreModule) => coverage.some((item) => item.module === module && item.state === "partial");
  const findings: CoreFinding[] = [];
  const metrics: CoreMetric[] = [];
  const add = (finding: CoreFinding) => findings.push({ ...finding, evidence: [...finding.evidence, ...(partial(finding.module) ? ["Coverage is partial; this finding concerns the available records only."] : [])] });
  const metric = (module: CoreModule, id: string, label: string, value: string, detail: string) => metrics.push({ module, id, label, value, detail: `${detail}${partial(module) ? " Partial coverage: available records only, not a company-wide total." : ""}` });

  if (usable("inventory")) {
    const items = unique(snapshot.inventory).filter((item) => finite(item.quantity) && finite(item.minimumStock) && item.minimumStock >= 0);
    const low = items.filter((item) => item.minimumStock > 0 && item.quantity >= 0 && item.quantity <= item.minimumStock);
    metric("inventory", "inventory.at-minimum", "Items at or below minimum", number(low.length), "Compares company stock quantities with configured minimums greater than zero; zero minimums are excluded and negative balances are reported separately.");
    for (const item of items) {
      const name = clean(item.name) || clean(item.sku) || "Inventory item";
      if (item.quantity < 0) {
        add({ id: `inventory:negative:${item.id}`, module: "inventory", severity: "high", title: `${name}: negative stock balance`, summary: `Recorded company stock is ${number(item.quantity)} units. Reconcile movements and a physical count before deciding what to buy.`, evidence: [`SKU: ${clean(item.sku) || "Not supplied"}`, `Recorded quantity: ${number(item.quantity)} units`], rule: "Recorded company quantity < 0. This is a stock discrepancy, not a purchase recommendation.", actionLabel: "Review inventory", href: ROUTES.inventory, recordId: item.id });
      } else if (item.minimumStock > 0 && item.quantity <= item.minimumStock) {
        const shortfall = Math.max(0, item.minimumStock - item.quantity);
        const knownOrder = finite(item.onOrder) && item.onOrder >= 0;
        const orderNote = knownOrder
          ? `${number(item.onOrder!)} units are recorded on order; the minimum shortfall after those units would be ${number(Math.max(0, shortfall - item.onOrder!))}. Confirm delivery timing before ordering.`
          : "Units already on order are unknown; check purchasing before ordering.";
        add({ id: `inventory:minimum:${item.id}`, module: "inventory", severity: item.quantity === 0 ? "medium" : "low", title: `${name}: ${shortfall > 0 ? "below" : "at"} minimum stock`, summary: `${number(item.quantity)} units on hand against a minimum of ${number(item.minimumStock)}; current minimum shortfall ${number(shortfall)}. ${orderNote}`, evidence: [`Company quantity: ${number(item.quantity)} units`, `Configured minimum: ${number(item.minimumStock)} units`, `On order: ${knownOrder ? `${number(item.onOrder!)} units` : "Unknown"}`], rule: "Configured minimum > 0 AND non-negative company quantity <= that minimum. Shortfall is max(minimum − quantity, 0); it is not a demand forecast or an automatic order quantity.", actionLabel: "Review stock and purchasing", href: ROUTES.inventory, recordId: item.id });
      }
    }
  }

  if (usable("receivables")) {
    const invoices = unique(snapshot.receivables).filter((item) => finite(item.outstanding) && finite(item.daysOverdue));
    const outstanding = invoices.filter((item) => item.outstanding > 0);
    const overdue = outstanding.filter((item) => item.daysOverdue > 0 && (daysPast(item.dueDate, snapshot.asOf) ?? 0) > 0);
    metric("receivables", "receivables.outstanding", "Outstanding receivables", money(outstanding.reduce((sum, item) => sum + item.outstanding, 0)), "Recorded positive invoice balances after allocated payments; these figures do not certify accounting reconciliation.");
    metric("receivables", "receivables.overdue", "Overdue receivables", money(overdue.reduce((sum, item) => sum + item.outstanding, 0)), `${number(overdue.length)} invoice(s) with a positive outstanding balance, positive ageing days and a due date before ${snapshot.asOf}.`);
    for (const item of overdue) add({ id: `receivables:overdue:${item.id}`, module: "receivables", severity: item.daysOverdue >= 30 ? "high" : "medium", title: `${clean(item.number)}: payment overdue`, summary: `${clean(item.customerName)} has ${money(item.outstanding)} outstanding on this invoice, ${number(item.daysOverdue)} days overdue. Review recorded payments and contact history before following up.`, evidence: [`Invoice: ${clean(item.number)}`, `Outstanding: ${money(item.outstanding)}`, `Due: ${item.dueDate}; ageing: ${number(item.daysOverdue)} days`], rule: "Outstanding balance > 0 and days overdue > 0, with a due date before the as-of date. High priority starts at 30 days overdue.", actionLabel: "Review invoice", href: `/invoices/${encodeURIComponent(item.id)}`, recordId: item.id });
  }

  if (usable("quotations")) {
    const quotes = unique(snapshot.quotations);
    const expired = quotes.filter((item) => status(item.status) === "sent" && (daysPast(item.validUntil, snapshot.asOf) ?? 0) > 0 && item.converted !== true);
    const accepted = quotes.filter((item) => status(item.status) === "accepted" && item.converted === false);
    const unknown = quotes.filter((item) => status(item.status) === "accepted" && item.converted === null);
    metric("quotations", "quotations.followup", "Accepted quotes awaiting conversion", number(accepted.length), `${number(unknown.length)} accepted quote(s) have unknown conversion status and are excluded. Quote value is not revenue.`);
    for (const item of expired) add({ id: `quotations:expired:${item.id}`, module: "quotations", severity: "low", title: `${clean(item.number)}: sent quote has expired`, summary: `The sent quotation was valid until ${item.validUntil}. Confirm the customer's interest and current pricing before renewing it.${item.converted === null ? " Conversion status is unknown; check linked sales orders and invoices first." : ""}`, evidence: [`Status: sent`, `Valid until: ${item.validUntil}`, `Quoted value: ${finite(item.total) ? money(item.total) : "Unknown"} (not revenue)`], rule: "Status is sent; valid-until date is strictly before the as-of date; no confirmed linked sales order or invoice. Expiry on the as-of date is not yet overdue.", actionLabel: "Review quotation", href: `/quotations/${encodeURIComponent(item.id)}`, recordId: item.id });
    for (const item of accepted) add({ id: `quotations:accepted:${item.id}`, module: "quotations", severity: "medium", title: `${clean(item.number)}: accepted quote awaits conversion`, summary: "Acceptance is recorded and no linked sales order or invoice was found in the available conversion data. Review fulfilment and conversion before creating another document.", evidence: [`Status: accepted`, `Converted: No`, `Quoted value: ${finite(item.total) ? money(item.total) : "Unknown"} (not revenue)`], rule: "Status is accepted AND converted is explicitly false after checking for a linked sales order or invoice. Unknown conversion status never counts as unconverted.", actionLabel: "Review accepted quotation", href: `/quotations/${encodeURIComponent(item.id)}`, recordId: item.id });
  }

  if (usable("purchasing")) {
    const overdue = unique(snapshot.purchasing).filter((item) => ["approved", "partially_received"].includes(status(item.status)) && (daysPast(item.expectedDate, snapshot.asOf) ?? 0) > 0 && (item.outstandingUnits === null || (finite(item.outstandingUnits) && item.outstandingUnits > 0)));
    metric("purchasing", "purchasing.overdue", "Purchase orders past expected date", number(overdue.length), "Approved or partially received orders with an expected date before the as-of date; known zero outstanding units are excluded.");
    for (const item of overdue) add({ id: `purchasing:overdue:${item.id}`, module: "purchasing", severity: "medium", title: `${clean(item.number)}: expected delivery date passed`, summary: `Expected ${item.expectedDate}, ${daysPast(item.expectedDate, snapshot.asOf)} days ago. ${item.outstandingUnits === null ? "Outstanding quantity is unknown; check receipts before contacting the supplier." : `${number(item.outstandingUnits)} units remain outstanding. Confirm receipt records and the supplier's delivery date.`}`, evidence: [`Status: ${clean(item.status)}`, `Expected date: ${item.expectedDate}`, `Outstanding units: ${item.outstandingUnits === null ? "Unknown" : number(item.outstandingUnits)}`], rule: "Status is approved or partially_received AND expected date < as-of date. Confirmed zero outstanding units are excluded; unknown quantities require manual receipt review.", actionLabel: "Review purchase order", href: `/purchasing/${encodeURIComponent(item.id)}`, recordId: item.id });
  }

  if (usable("repairs")) {
    const jobs = unique(snapshot.repairs).filter((item) => !["collected", "cancelled", "canceled", "closed"].includes(status(item.status)));
    metric("repairs", "repairs.open", "Open repair jobs", number(jobs.length), "Available repair jobs excluding collected, cancelled and closed statuses; technical completion alone does not prove collection clearance.");
    for (const item of jobs) {
      const state = status(item.status);
      const evidence = [`Job: ${clean(item.number)}`, `Status: ${clean(item.status)}`, `Assigned: ${item.assigned ? "Yes" : "No"}`];
      if (!item.assigned) add({ id: `repairs:unassigned:${item.id}`, module: "repairs", severity: "medium", title: `${clean(item.number)}: no technician assigned`, summary: "This open job has no recorded assignee. Review workload and assign responsibility through the repair workflow.", evidence, rule: "Repair is not closed, cancelled or collected AND assigned is false. This is an allocation check, not an employee-performance conclusion.", actionLabel: "Review repair queue", href: ROUTES.repairs, recordId: item.id });
      if (state === "awaiting_approval") add({ id: `repairs:approval:${item.id}`, module: "repairs", severity: "low", title: `${clean(item.number)}: awaiting approval`, summary: "Check the proposed work and recorded customer approval before proceeding. The snapshot does not establish why approval is outstanding.", evidence, rule: "Repair status is awaiting_approval. Manual approval review is required; no customer approval is inferred.", actionLabel: "Review repair approval", href: ROUTES.repairs, recordId: item.id });
      if (["technical_complete", "ready_for_collection", "awaiting_collection"].includes(state)) add({ id: `repairs:collection:${item.id}`, module: "repairs", severity: "low", title: `${clean(item.number)}: review collection readiness`, summary: "Check quality assurance, invoice, payment balance and handover requirements before arranging collection. Technical status alone does not clear the device for release.", evidence, rule: "Status is technical_complete, ready_for_collection or awaiting_collection. This prompts a manual readiness review; it does not confirm payment or authorise release.", actionLabel: "Review repair handover", href: ROUTES.repairs, recordId: item.id });
    }
  }

  if (usable("whatsapp")) {
    const conversations = unique(snapshot.whatsapp);
    const open = conversations.filter((item) => status(item.status) === "open");
    const now = Date.parse(snapshot.checkedAt);
    const due = open.filter(
      (item) =>
        status(item.attentionState) === "follow_up_due" ||
        Boolean(item.followUpAt && Date.parse(item.followUpAt) <= now),
    );
    const unassigned = open.filter((item) => !item.assigned);
    const unread = open.filter((item) => finite(item.unreadCount) && item.unreadCount > 0);
    const waiting = open.filter((item) => status(item.attentionState) === "waiting_customer");
    const won = open.filter((item) => status(item.salesStage) === "won");

    metric("whatsapp", "whatsapp.open", "Open WhatsApp sales conversations", number(open.length), "Open WhatsApp conversations available to Nexus Intelligence.");
    metric("whatsapp", "whatsapp.followup", "WhatsApp follow-ups due", number(due.length), "Open conversations explicitly marked follow-up due or with a recorded follow-up time at or before the review time.");
    metric("whatsapp", "whatsapp.unassigned", "Unassigned WhatsApp conversations", number(unassigned.length), "Open conversations without a recorded salesperson owner.");
    metric("whatsapp", "whatsapp.waiting", "Waiting on customer", number(waiting.length), "Open WhatsApp conversations explicitly marked as waiting for the customer.");

    for (const item of due) add({ id: `whatsapp:followup:${item.id}`, module: "whatsapp", severity: "medium", title: `${clean(item.contactName) || "+" + clean(item.waId)}: follow-up is due`, summary: "A recorded WhatsApp sales follow-up has reached its scheduled time. Review the conversation before contacting the customer.", evidence: [`Sales stage: ${clean(item.salesStage)}`, `Follow-up: ${item.followUpAt}`], rule: "Conversation is open AND follow-up timestamp is at or before the review time.", actionLabel: "Open WhatsApp Sales", href: "/whatsapp?filter=follow_up", recordId: item.id });

    for (const item of unassigned) add({ id: `whatsapp:unassigned:${item.id}`, module: "whatsapp", severity: "low", title: `${clean(item.contactName) || "+" + clean(item.waId)}: no salesperson assigned`, summary: "This open WhatsApp conversation has no recorded owner. Review the conversation and assign responsibility if it represents an active sales opportunity.", evidence: [`Sales stage: ${clean(item.salesStage)}`, `Unread messages: ${number(item.unreadCount)}`], rule: "Conversation is open AND assigned salesperson is missing.", actionLabel: "Review WhatsApp Sales", href: "/whatsapp?filter=unassigned", recordId: item.id });

    if (unread.length > 0) add({ id: "whatsapp:unread", module: "whatsapp", severity: "low", title: "WhatsApp conversations have unread messages", summary: `${number(unread.length)} open conversation(s) contain unread customer messages. Review them before changing sales stages or scheduling further follow-up.`, evidence: [`Unread conversations: ${number(unread.length)}`, `Waiting on customer: ${number(waiting.length)}`], rule: "Open WhatsApp conversation has unread_count > 0.", actionLabel: "Open WhatsApp inbox", href: "/whatsapp?filter=unread" });

    if (waiting.length > 0) add({ id: "whatsapp:waiting", module: "whatsapp", severity: "low", title: "WhatsApp conversations are waiting on customers", summary: `${number(waiting.length)} open conversation(s) are marked as waiting for customer response. Keep them visible without treating them as overdue unless a follow-up date has also passed.`, evidence: [`Waiting conversations: ${number(waiting.length)}`], rule: "Conversation is open AND attention state is waiting_customer. Waiting alone is not treated as overdue.", actionLabel: "View waiting conversations", href: "/whatsapp?filter=waiting" });

    if (won.length > 0) add({ id: "whatsapp:won-unpaid", module: "whatsapp", severity: "medium", title: "Won WhatsApp sales still await payment completion", summary: `${number(won.length)} open conversation(s) are marked won but not yet marked paid. Verify the invoice and recorded payment before closing the sales journey.`, evidence: [`Won conversations: ${number(won.length)}`], rule: "Conversation is open AND sales stage is won. Nexus does not infer that payment is outstanding from accounting records.", actionLabel: "Review WhatsApp Sales", href: "/whatsapp?filter=won" });
  }

  if (usable("controls") && snapshot.controls) {
    metric("controls", "controls.open", "Open accounting exceptions", number(snapshot.controls.openCount), "Open exceptions reported by the accounting control source; a zero count does not certify all accounting records.");
    if (snapshot.controls.openCount > 0) add({ id: "controls:open", module: "controls", severity: "high", title: "Accounting exceptions need review", summary: `${number(snapshot.controls.openCount)} open accounting exception(s) require review before relying on affected reports.`, evidence: [`Open exceptions: ${number(snapshot.controls.openCount)}`, `Oldest open date: ${day(snapshot.controls.oldestOpenDate) !== null ? snapshot.controls.oldestOpenDate : "Unknown"}`], rule: "Reported open exception count > 0. The engine does not infer the cause or perform corrective postings.", actionLabel: "Review accounting exceptions", href: ROUTES.controls });
  }
  findings.sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity] || MODULES.indexOf(a.module) - MODULES.indexOf(b.module) || compare(a.id, b.id));
  return { coverage, findings, metrics, usable };
}

export function analyzeCore(snapshot: CoreSnapshot): CoreAnalysis {
  const inspected = inspect(snapshot);
  const unavailable = inspected.coverage.filter((item) => item.state === "unavailable" || item.state === "forbidden").length;
  const partial = inspected.coverage.filter((item) => item.state === "partial").length;
  const count = inspected.findings.length;
  const headline = count
    ? `${count} rule-based finding${count === 1 ? "" : "s"} for review.${count > ANALYSIS_LIMIT ? ` Showing the first ${ANALYSIS_LIMIT} by priority.` : ""}`
    : "No configured rule flagged the available records.";
  return { engine: "nexus-core", version: "1.0", companyName: snapshot.companyName, currency: snapshot.currency, asOf: snapshot.asOf, checkedAt: snapshot.checkedAt, headline: `${headline}${unavailable || partial ? ` Coverage: ${unavailable} unavailable or restricted; ${partial} partial. This is not an all-clear.` : ""}`, metrics: inspected.metrics, findings: inspected.findings.slice(0, ANALYSIS_LIMIT), coverage: inspected.coverage };
}

function topicFor(question: string): CoreModule | null {
  // The destination document must not override the workflow being requested.
  if (/\b(quote|quotes|quotation|quotations)\b/i.test(question) && /\b(convert|converted|converting|conversion|turn)\b/i.test(question)) return "quotations";
  if (/\b(stock|inventory|sku|barcode|reorder|replenish)\b/i.test(question)) return "inventory";
  if (/\b(invoice|invoices|receivable|receivables|debtor|debtors|owed|owing|overdue payment|customer balances)\b/i.test(question)) return "receivables";
  if (/\b(quote|quotes|quotation|quotations)\b/i.test(question)) return "quotations";
  if (/\b(purchasing|purchase|supplier|suppliers|delivery|deliveries|purchase order|po)\b/i.test(question)) return "purchasing";
  if (/\b(repair|repairs|technician|job card|jobcard|collection|handover)\b/i.test(question)) return "repairs";
  if (/\b(whatsapp|chat|message|messages|conversation|conversations|follow-up|followup|sales lead|sales leads)\b/i.test(question)) return "whatsapp";
  if (/\b(accounting|control|controls|exception|exceptions|posting|journal|journals|reconciliation)\b/i.test(question)) return "controls";
  return null;
}

function routeTopic(route?: string): CoreModule | null {
  if (!route) return null;
  if (/^\/accounting\/debtors(?:\/|$)/.test(route) || /^\/invoices(?:\/|$)/.test(route)) return "receivables";
  for (const topic of MODULES) if (route === ROUTES[topic] || route.startsWith(`${ROUTES[topic]}/`)) return topic;
  if (/^\/repairs(?:\/|$)/.test(route)) return "repairs";
  if (/^\/whatsapp(?:\/|$)/.test(route)) return "whatsapp";
  if (/^\/accounting(?:\/|$)/.test(route)) return "controls";
  return null;
}

const HELP: Record<CoreModule, string> = {
  inventory: "Open Inventory and review the item, recorded quantity and minimum stock. For a negative balance, reconcile movements with a physical count first. Check existing purchase orders before deciding on replenishment; a minimum shortfall is not a demand forecast.",
  receivables: "Open Accounting → Debtors, review the customer's recorded invoice balances, then open the invoice. Verify allocated payments, due date and contact history before following up. Record payments through the existing controlled workflow.",
  quotations: "Open Quotations and review the customer's quote, validity and status. Confirm acceptance and check linked sales orders or invoices before using the available conversion action. An accepted quotation is not recorded revenue.",
  purchasing: "Open Purchasing and select the order. Review approval, expected date and outstanding lines; check Purchasing → Receipts before recording received goods. Verify quantities and supplier documents through the existing receipt workflow.",
  repairs: "Open Repairs → Scanner and locate the Job Card. Review the assignee, approval and technical status. Before collection, check quality assurance, invoice, payment and handover requirements; this assistant cannot authorise device release.",
  controls: "Open Accounting → Exceptions and inspect each exception and its source records. Verify the underlying cause before using the controlled correction workflow. The assistant does not create journals or change posted records.",
  whatsapp: "Open WhatsApp Sales and review the conversation stage, owner, follow-up, unread messages and linked customer records. Confirm context before contacting the customer or changing the sales stage.",
};

function searchRecords(question: string, snapshot: CoreSnapshot, usable: (module: CoreModule) => boolean) {
  const money = (value: number) => formatMoney(value, snapshot.currency);
  const target = topicFor(question);
  const query = question.replace(/^\s*(?:please\s+)?(?:search(?:\s+for)?|find|look\s*up|locate)\b/i, "").replace(/\b(?:the|a|an|for|invoice|invoices|stock|inventory|item|sku|quote|quotation|purchase|order|repair|job|card|customer)\b/gi, " ").replace(/["']/g, "").trim().toLowerCase();
  const tokens = query.split(/\s+/).filter(Boolean).slice(0, 12);
  if (!tokens.length) return { matches: [], count: 0, query: "" };
  const candidates: Array<CoreMatch & { searchable: string }> = [];
  const add = (module: CoreModule, label: string, detail: string, href: string, extras = "") => {
    if (usable(module) && (!target || module === target)) candidates.push({ module, label: clean(label), detail: clean(detail), href, searchable: `${label} ${detail} ${extras}`.toLowerCase() });
  };
  if (usable("inventory")) for (const item of unique(snapshot.inventory)) add("inventory", item.name, `SKU ${item.sku}; quantity ${finite(item.quantity) ? number(item.quantity) : "unknown"}`, ROUTES.inventory, item.id);
  if (usable("receivables")) for (const item of unique(snapshot.receivables)) add("receivables", item.number, `${item.customerName}; outstanding ${finite(item.outstanding) ? money(item.outstanding) : "unknown"}`, `/invoices/${encodeURIComponent(item.id)}`, item.id);
  if (usable("quotations")) for (const item of unique(snapshot.quotations)) add("quotations", item.number, `Status ${item.status}; quoted value ${finite(item.total) ? money(item.total) : "unknown"} (not revenue)`, `/quotations/${encodeURIComponent(item.id)}`, item.id);
  if (usable("purchasing")) for (const item of unique(snapshot.purchasing)) add("purchasing", item.number, `Status ${item.status}; expected ${item.expectedDate || "unknown"}`, `/purchasing/${encodeURIComponent(item.id)}`, item.id);
  if (usable("repairs")) for (const item of unique(snapshot.repairs)) add("repairs", item.number, `Status ${item.status}; ${item.assigned ? "assigned" : "unassigned"}`, ROUTES.repairs, item.id);
  if (usable("whatsapp")) for (const item of unique(snapshot.whatsapp)) add("whatsapp", item.contactName || item.waId, `WhatsApp ${item.waId}; stage ${item.salesStage}; ${item.assigned ? "assigned" : "unassigned"}; unread ${number(item.unreadCount)}; follow-up ${item.followUpAt || "none"}`, ROUTES.whatsapp, `${item.id} ${item.waId} ${item.salesStage} ${item.attentionState}`);
  const matches = candidates.filter((item) => tokens.every((token) => item.searchable.includes(token))).sort((a, b) => compare(a.label, b.label) || compare(a.href, b.href));
  return { matches: matches.slice(0, 8).map(({ label, detail, href, module }) => ({ label, detail, href, module })), count: matches.length, query };
}

/** Answers use supplied facts only. Record text is never interpreted as commands. */
export function answerCore(question: string, snapshot: CoreSnapshot, previousTopic?: CoreTopic, route?: string): CoreAnswer {
  const q = question.trim().slice(0, 6000);
  const inspected = inspect(snapshot);
  const suggestions = ["What needs attention?", "Check stock levels", "Show overdue invoices", "Review accepted quotations"];
  const topicSuggestions = (value?: CoreModule | null) => value === "whatsapp" ? ["Which WhatsApp follow-ups are due?", "Show unassigned WhatsApp leads", "Show unread WhatsApp sales chats", "Which won WhatsApp deals need review?"] : value ? [`How do I review ${LABELS[value].toLowerCase()}?`, "What needs attention?", "Find a record"] : suggestions;
  const coverageNote = (module?: CoreModule) => {
    const incomplete = inspected.coverage.filter((item) => (!module || item.module === module) && item.state !== "ready");
    return incomplete.length ? ` Coverage limits: ${incomplete.map((item) => `${item.label} ${item.state}`).join("; ")}. Unavailable data cannot establish that everything is clear.` : "";
  };
  const supplierBalances = /\b(payables?|creditors?)\b/i.test(q)
    || (/\b(suppliers?|vendors?)\b/i.test(q) && /\b(owe|owed|owing|pay|paying|paid|payments?|balances?|bills?|invoices?|debts?|outstanding|amounts?|due|how much)\b/i.test(q));
  if (supplierBalances) {
    return { topic: "help", text: "Supplier invoice balances and payments are not included in this snapshot, so I cannot determine which suppliers you owe or how much is due. Review Accounting → Payables for those balances. I can check purchase-order expected dates and outstanding delivery quantities; these do not establish money owed.", findings: [], matches: [], suggestions: ["Which purchase orders are overdue?", "How do I review purchasing?"] };
  }
  if (/^\s*(?:please\s+)?(?:search|find|look\s*up|locate)\b/i.test(q)) {
    const found = searchRecords(q, snapshot, inspected.usable);
    return { topic: "search", findings: [], matches: found.matches, suggestions: ["Find invoice INV-123", "Find quotation QUO-123", "Find stock by SKU"], text: !found.query ? "Enter a record number, SKU or customer name to search the available records." : `${found.count ? `${found.count} matching record(s) in this snapshot.${found.count > 8 ? " Showing the first 8." : ""}\n${found.matches.map((item) => `${item.label}: ${item.detail}`).join("\n")}` : "No matching record was found in the available snapshot; this does not prove the record does not exist."}${coverageNote()}` };
  }
  const explicitTopic = topicFor(q);
  const contextual = /^(?:why\??|why is that\??|what next\??|what should i do next\??|explain(?: that| this)?\??|tell me more|show(?: me)? more|and then\??|how\??)$/i.test(q);
  const moduleRequest = /\b(this module|this page|current module|current page)\b/i.test(q);
  const inherited = previousTopic && MODULES.includes(previousTopic as CoreModule) ? previousTopic as CoreModule : null;
  const topic = explicitTopic || (moduleRequest ? routeTopic(route) : null) || (contextual ? inherited || routeTopic(route) : null);
  if (/\b(how (?:do|can|should) i|how to|help me (?:use|create|record|convert|receive)|workflow|steps to)\b/i.test(q) || q.toLowerCase() === "help") {
    return { topic: topic || "help", text: topic ? `${HELP[topic]} No business records were changed.${coverageNote(topic)}` : "I can explain the Inventory, Debtors, Quotations, Purchasing, Repairs, WhatsApp Sales and Accounting Exceptions workflows. Name the workflow you want help with.", findings: [], matches: [], suggestions: topicSuggestions(topic) };
  }
  const overview = !q || /\b(overview|business summary|business performance|priorities|priority|what needs (?:my )?attention|company summary|whole business|dashboard|how is (?:the )?business|what should i focus)\b/i.test(q) || (contextual && previousTopic === "overview");
  if (!topic && !overview) return { topic: "help", text: "I can assess the available inventory, receivables, quotations, purchasing, repairs, WhatsApp sales and accounting exceptions, search those records, and explain their workflows. I do not have verified information or a supported rule for that question. Name a supported module or ask what needs attention.", findings: [], matches: [], suggestions };
  let relevant = inspected.findings.filter((item) => !topic || item.module === topic);
  if (topic === "whatsapp") {
    if (/\b(unassigned|no salesperson|without (?:an )?(?:owner|assignee))\b/i.test(q)) relevant = relevant.filter((item) => item.id.startsWith("whatsapp:unassigned:"));
    else if (/\b(follow[- ]?up|followup|due)\b/i.test(q)) relevant = relevant.filter((item) => item.id.startsWith("whatsapp:followup:"));
    else if (/\b(unread|new messages?)\b/i.test(q)) relevant = relevant.filter((item) => item.id === "whatsapp:unread");
    else if (/\b(waiting|waiting customer|waiting on customer)\b/i.test(q)) relevant = relevant.filter((item) => item.id === "whatsapp:waiting");
    else if (/\b(won|payment|paid|awaiting payment)\b/i.test(q)) relevant = relevant.filter((item) => item.id === "whatsapp:won-unpaid");
  }
  const findings = relevant.slice(0, ANSWER_LIMIT);
  const metrics = inspected.metrics.filter((item) => !topic || item.module === topic).slice(0, topic ? 3 : 4);
  const label = topic ? LABELS[topic] : clean(snapshot.companyName) || "Business";
  let text = `${label} review as of ${snapshot.asOf}.`;
  if (topic && !inspected.usable(topic)) {
    text += " I cannot assess this module because its data is unavailable or access is restricted.";
  } else if (relevant.length) {
    text += ` ${relevant.length} finding(s) need review.${relevant.length > ANSWER_LIMIT ? ` Showing the first ${ANSWER_LIMIT} by priority; ${relevant.length - ANSWER_LIMIT} more are omitted.` : ""}\n`;
    text += findings.map((item, index) => `${index + 1}. ${item.title}. ${item.summary}${contextual || /\b(rule|threshold|evidence)\b/i.test(q) ? ` Rule: ${item.rule}` : ""}`).join("\n");
  } else {
    text += " No configured rule flagged the available records. This does not certify that every record or process is correct.";
  }
  if (metrics.length) text += `\n${metrics.map((item) => `${item.label}: ${item.value}. ${item.detail}`).join("\n")}`;
  text += coverageNote(topic || undefined);
  return { topic: topic || "overview", text, findings, matches: [], suggestions: topicSuggestions(topic) };
}
