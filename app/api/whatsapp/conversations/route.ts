import { normalizePhone } from "@/lib/whatsapp/protocol";
import { CONVERSATION_COLUMNS, accountFor, adminClient, authenticate, body, dbError, failure, json, requirePermission, uuid, WhatsAppError } from "@/lib/whatsapp/server";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    const search = new URL(request.url).searchParams.get("search")?.trim().slice(0, 120) ?? "";
    let query = actor.db.from("whatsapp_conversation").select(CONVERSATION_COLUMNS).eq("company_id", actor.companyId).order("last_message_at", { ascending: false }).order("id").limit(100);
    if (search) {
      const term = search.replace(/[^\p{L}\p{N} +@._-]/gu, "").replace(/[%_]/g, "");
      if (term) query = query.or(`contact_name.ilike.%${term}%,wa_id.ilike.%${term}%`);
    }
    const { data, error } = await query;
    dbError(error);
    return json({ conversations: data ?? [] });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    await requirePermission(actor, "whatsapp.send");
    const account = await accountFor(actor);
    const input = await body(request);
    if (typeof input.phone !== "string") throw new WhatsAppError("Enter a WhatsApp phone number.");
    let phone: string;
    try { phone = normalizePhone(input.phone); } catch { throw new WhatsAppError("Enter a valid phone number, including its country code."); }
    let name = typeof input.contactName === "string" ? input.contactName.trim().slice(0, 160) : phone;
    const customerId = input.customerId ? uuid(input.customerId, "Customer") : null;
    if (customerId) {
      await requirePermission(actor, "customer.view");
      const { data: customer, error } = await actor.db.from("customer").select("id,customer_name,phone,alternative_phone").eq("id", customerId).eq("company_id", actor.companyId).maybeSingle();
      dbError(error);
      if (!customer) throw new WhatsAppError("Customer was not found.", 404);
      const numbers = [customer.phone, customer.alternative_phone].flatMap(value => { try { return value ? [normalizePhone(value)] : []; } catch { return []; } });
      if (!numbers.includes(phone)) throw new WhatsAppError("This number does not match the customer's saved phone numbers.");
      name = customer.customer_name;
    }
    const admin = adminClient();
    const { error } = await admin.from("whatsapp_conversation").upsert({ company_id: actor.companyId, account_id: account.id, wa_id: phone, customer_id: customerId, contact_name: name }, { onConflict: "account_id,wa_id", ignoreDuplicates: true });
    dbError(error);
    const { data: conversation, error: readError } = await actor.db.from("whatsapp_conversation").select(CONVERSATION_COLUMNS).eq("account_id", account.id).eq("company_id", actor.companyId).eq("wa_id", phone).single();
    dbError(readError);
    return json({ conversation });
  } catch (error) { return failure(error); }
}
