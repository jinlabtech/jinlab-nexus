import { createHash } from "node:crypto";
import { isReplyWindowOpen } from "@/lib/whatsapp/protocol";
import { accountFor, adminClient, authenticate, body, conversationFor, dbError, failure, json, MESSAGE_COLUMNS, metaFetch, requirePermission, uuid, WhatsAppError } from "@/lib/whatsapp/server";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    await requirePermission(actor, "whatsapp.send");
    const input = await body(request);
    const requestId = uuid(input.requestId, "Message reference");
    if (input.type !== "text") throw new WhatsAppError("Only free service replies are enabled. Paid templates are disabled.");
    if (typeof input.text !== "string" || !input.text.trim() || Array.from(input.text).length > 4096) throw new WhatsAppError("Write a message between 1 and 4,096 characters.");
    const text = input.text.trim();
    const conversation = await conversationFor(actor, uuid(input.conversationId, "Conversation"));
    const account = await accountFor(actor);
    if (conversation.account_id !== account.id) throw new WhatsAppError("Conversation belongs to a different connection.", 409);
    const fingerprint = createHash("sha256").update(JSON.stringify({ conversationId: conversation.id, text })).digest("hex");
    const admin = adminClient();
    const existing = async () => {
      const { data, error } = await admin.from("whatsapp_message").select(`${MESSAGE_COLUMNS},payload_fingerprint`).eq("company_id", actor.companyId).eq("client_request_id", requestId).maybeSingle();
      dbError(error);
      if (data && data.payload_fingerprint !== fingerprint) throw new WhatsAppError("This message reference was already used for a different message.", 409);
      if (data) {
        const { payload_fingerprint: _fingerprint, ...message } = data;
        void _fingerprint;
        return message;
      }
      return null;
    };
    const previous = await existing();
    if (previous) return json({ message: previous, duplicate: true });
    if (conversation.status !== "open") throw new WhatsAppError("Reopen this conversation before replying.", 409);
    if (conversation.opted_out) throw new WhatsAppError("This contact has opted out. Do not send further messages.", 409);
    if (!isReplyWindowOpen(conversation.last_inbound_at)) throw new WhatsAppError("Free replies are closed. Ask the customer to message your business to reopen replies, or open your WhatsApp Business app.", 409);
    // Reserve a durable, unique request before the network call. Never retry ambiguous sends.
    const { data: reserved, error: reserveError } = await admin.from("whatsapp_message").insert({ company_id: actor.companyId, account_id: account.id, conversation_id: conversation.id, direction: "outbound", message_type: "text", body: text, client_request_id: requestId, payload_fingerprint: fingerprint, status: "sending", created_by: actor.userId }).select(MESSAGE_COLUMNS).single();
    if (reserveError?.code === "23505") {
      const duplicate = await existing();
      if (!duplicate) throw new WhatsAppError("Message is being processed. Refresh to see its status.", 409);
      return json({ message: duplicate, duplicate: true });
    }
    dbError(reserveError);
    if (!reserved) throw new WhatsAppError("Message could not be queued.", 503);
    // Recheck preferences/window after reservation to close races with inbound STOP or disconnect.
    const fresh = await conversationFor(actor, conversation.id);
    const freshAccount = await accountFor(actor, false);
    if (fresh.status !== "open" || fresh.opted_out || !freshAccount.active || !isReplyWindowOpen(fresh.last_inbound_at)) {
      const { error } = await admin.from("whatsapp_message").update({ status: "failed", error_code: "reply_not_allowed" }).eq("id", reserved.id).eq("company_id", actor.companyId).eq("status", "sending");
      dbError(error);
      throw new WhatsAppError("The reply window or contact preference changed. Refresh before sending.", 409);
    }
    let status: "sent" | "failed" | "unknown" = "unknown";
    let providerMessageId: string | null = null;
    let errorCode: string | null = null;
    try {
      const response = await metaFetch(`${account.phone_number_id}/messages`, { method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: conversation.wa_id, type: "text", text: { preview_url: false, body: text }, biz_opaque_callback_data: requestId }) });
      const result = await response.json();
      if (response.ok && typeof result.messages?.[0]?.id === "string") {
        status = "sent"; providerMessageId = result.messages[0].id;
      } else if (!response.ok && response.status < 500 && result.error) {
        status = "failed"; errorCode = String(result.error.code ?? "meta_rejected").slice(0, 80);
      } else { errorCode = "delivery_unconfirmed"; }
    } catch { errorCode = "delivery_unconfirmed"; }
    // Webhook may already have advanced delivery/read status; update only our reservation state.
    const patch: Record<string, unknown> = { status, error_code: errorCode, status_timestamp: new Date().toISOString() };
    if (providerMessageId) patch.provider_message_id = providerMessageId;
    const { error: saveError } = await admin.from("whatsapp_message").update(patch).eq("id", reserved.id).eq("company_id", actor.companyId).eq("status", "sending");
    if (saveError) throw new WhatsAppError("Meta may have accepted this message, but Nexus could not confirm its status. Refresh; do not resend it.", 503);
    const { data: message, error: readError } = await actor.db.from("whatsapp_message").select(MESSAGE_COLUMNS).eq("id", reserved.id).eq("company_id", actor.companyId).single();
    dbError(readError);
    return json({ message });
  } catch (error) { return failure(error); }
}
