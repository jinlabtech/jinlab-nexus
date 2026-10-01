import { authenticate, body, conversationFor, dbError, failure, json, requirePermission, uuid, WhatsAppError } from "@/lib/whatsapp/server";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    await requirePermission(actor, "whatsapp.send");
    await requirePermission(actor, "quotation.send");
    const input = await body(request);
    const conversation = await conversationFor(actor, uuid(input.conversationId, "Conversation"));
    if (!conversation.customer_id) throw new WhatsAppError("Link this conversation to its customer first.");
    const { data: quote, error } = await actor.db.from("quotation").select("id,customer_id,quotation_number,total_amount,status").eq("id", uuid(input.quotationId, "Quotation")).eq("company_id", actor.companyId).eq("customer_id", conversation.customer_id).maybeSingle();
    dbError(error);
    if (!quote) throw new WhatsAppError("This quotation does not belong to the linked customer.", 404);
    if (!["draft", "sent"].includes(quote.status)) throw new WhatsAppError("This quotation can no longer be shared.", 409);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) throw new WhatsAppError("The public Nexus address is not configured.", 503);
    const origin = new URL(appUrl);
    if (origin.protocol !== "https:") throw new WhatsAppError("A secure public Nexus address is required for quotation sharing.", 503);
    const { data: result, error: linkError } = await actor.db.rpc("create_quotation_share_link", { p_quotation_id: quote.id, p_expires_at: null });
    dbError(linkError);
    const token = result?.share_link?.token;
    if (typeof token !== "string" || !token) throw new WhatsAppError("The quotation link could not be prepared.", 503);
    const link = new URL(`/quote/${encodeURIComponent(token)}`, origin).toString();
    const amount = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(Number(quote.total_amount));
    return json({ text: `Good day,\n\nYour quotation ${quote.quotation_number} is ready.\nTotal: ${amount}\n\nView and respond securely:\n${link}` });
  } catch (error) { return failure(error); }
}
