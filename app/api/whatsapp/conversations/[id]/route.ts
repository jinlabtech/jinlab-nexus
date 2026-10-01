import { authenticate, body, conversationFor, dbError, failure, json, MESSAGE_COLUMNS, requirePermission, uuid, WhatsAppError } from "@/lib/whatsapp/server";
import { parseHistoryCursor } from "@/lib/whatsapp/history";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const actor = await authenticate(request);
    const { id } = await context.params;
    const conversation = await conversationFor(actor, id);
    const readThrough = new Date().toISOString();
    let messagesQuery = actor.db.from("whatsapp_message").select(MESSAGE_COLUMNS).eq("company_id", actor.companyId).eq("conversation_id", conversation.id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(101);
    const before = new URL(request.url).searchParams.get("before");
    if (before) {
      try {
        const { id: cursorId, createdAt } = parseHistoryCursor(before);
        messagesQuery = messagesQuery.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${cursorId})`);
      } catch { throw new WhatsAppError("Message history cursor is invalid."); }
    }
    const [messagesResult, canCustomers, canQuotes, canInvoices] = await Promise.all([messagesQuery, actor.can("customer.view"), actor.can("quotation.view"), actor.can("invoice.view")]);
    dbError(messagesResult.error);
    const rows = messagesResult.data ?? [];
    const hasMore = rows.length > 100;
    const page = rows.slice(0, 100);
    const last = page.at(-1);
    const nextCursor = hasMore && last ? Buffer.from(JSON.stringify({ createdAt: last.created_at, id: last.id })).toString("base64url") : null;
    const customerResult = canCustomers ? await actor.db.from("customer").select("id,customer_name,phone").eq("company_id", actor.companyId).eq("is_active", true).order("customer_name").limit(500) : { data: [], error: null };
    dbError(customerResult.error);
    const quotesResult = conversation.customer_id && canQuotes ? await actor.db.from("quotation").select("id,quotation_number,status,total_amount").eq("company_id", actor.companyId).eq("customer_id", conversation.customer_id).order("created_at", { ascending: false }).limit(20) : { data: [], error: null };
    const invoicesResult = conversation.customer_id && canInvoices ? await actor.db.from("invoice").select("id,invoice_number,status,balance_due,total_amount").eq("company_id", actor.companyId).eq("customer_id", conversation.customer_id).order("created_at", { ascending: false }).limit(20) : { data: [], error: null };
    dbError(quotesResult.error); dbError(invoicesResult.error);
    return json({ conversation, messages: page.reverse(), customers: (customerResult.data ?? []).map(c => ({ id: c.id, display_name: c.customer_name, phone: c.phone })), documents: { quotations: quotesResult.data ?? [], invoices: invoicesResult.data ?? [] }, hasMore, nextCursor, readThrough });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await authenticate(request);
    const { id } = await context.params;
    await conversationFor(actor, id);
    const input = await body(request);
    const customerId = input.customerId == null ? null : uuid(input.customerId, "Customer");
    if (customerId) await requirePermission(actor, "customer.view");
    if (input.status != null && input.status !== "open" && input.status !== "closed") throw new WhatsAppError("Choose open or closed.");
    if (input.optedOut != null && typeof input.optedOut !== "boolean") throw new WhatsAppError("Contact preference is invalid.");
    let readThrough: string | null = null;
    if (input.readThrough != null) {
      if (typeof input.readThrough !== "string" || !Number.isFinite(Date.parse(input.readThrough)) || Date.parse(input.readThrough) > Date.now()) throw new WhatsAppError("Read marker is invalid.");
      readThrough = new Date(input.readThrough).toISOString();
    }
    const { error } = await actor.db.rpc("whatsapp_update_conversation", { p_conversation_id: id, p_customer_id: customerId, p_status: input.status ?? null, p_mark_read: input.markRead === true, p_opted_out: input.optedOut ?? null, p_read_through: readThrough });
    dbError(error);
    return json({ conversation: await conversationFor(actor, id) });
  } catch (error) { return failure(error); }
}
