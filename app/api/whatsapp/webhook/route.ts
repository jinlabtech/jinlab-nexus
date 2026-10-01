import { timingSafeEqual } from "node:crypto";
import { parseWebhook, verifySignature } from "@/lib/whatsapp/protocol";
import { adminClient, dbError, failure, json, metaConfig, readBody, WhatsAppError } from "@/lib/whatsapp/server";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const token = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!token) throw new WhatsAppError("WhatsApp verification is not configured.", 503);
    const query = new URL(request.url).searchParams;
    const supplied = query.get("hub.verify_token") ?? "";
    const expectedBytes = Buffer.from(token);
    const suppliedBytes = Buffer.from(supplied);
    const challenge = query.get("hub.challenge");
    if (query.get("hub.mode") !== "subscribe" || suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes) || !challenge || !/^\d{1,100}$/.test(challenge)) throw new WhatsAppError("Verification failed.", 403);
    return new Response(challenge, { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const config = metaConfig();
    const raw = await readBody(request, 1_048_576);
    if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), config.appSecret)) throw new WhatsAppError("Signature verification failed.", 401);
    let parsed: ReturnType<typeof parseWebhook>;
    try { parsed = parseWebhook(JSON.parse(new TextDecoder().decode(raw))); } catch { throw new WhatsAppError("Webhook payload is invalid."); }
    if (parsed.messages.length + parsed.statuses.length > 200) throw new WhatsAppError("Webhook batch is too large.", 413);
    const db = adminClient();
    for (const message of parsed.messages) {
      if (message.phoneNumberId !== config.phoneId || message.businessAccountId !== config.businessId) continue;
      const { error } = await db.rpc("whatsapp_ingest_message", { p_phone_number_id: message.phoneNumberId, p_business_account_id: message.businessAccountId, p_wa_id: message.waId, p_contact_name: message.contactName, p_provider_message_id: message.providerMessageId, p_type: message.type, p_body: message.body, p_timestamp: message.timestamp, p_media_id: message.mediaId ?? null, p_media_mime_type: message.mediaMimeType ?? null, p_media_filename: message.mediaFilename ?? null });
      dbError(error);
    }
    for (const status of parsed.statuses) {
      if (status.phoneNumberId !== config.phoneId || status.businessAccountId !== config.businessId) continue;
      const { error } = await db.rpc("whatsapp_apply_status", { p_phone_number_id: status.phoneNumberId, p_business_account_id: status.businessAccountId, p_provider_message_id: status.providerMessageId, p_status: status.status, p_timestamp: status.timestamp, p_error_code: status.errorCode ?? null, p_client_request_id: status.clientRequestId ?? null });
      dbError(error);
    }
    // Acknowledge only after durable writes. Retried batches deduplicate inside Postgres.
    return json({ received: true });
  } catch (error) { return failure(error); }
}
