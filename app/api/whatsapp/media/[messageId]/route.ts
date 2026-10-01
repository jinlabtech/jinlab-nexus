import { accountFor, authenticate, dbError, failure, metaConfig, metaJson, readBody, uuid, WhatsAppError } from "@/lib/whatsapp/server";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request, context: { params: Promise<{ messageId: string }> }) {
  try {
    const actor = await authenticate(request);
    const { messageId } = await context.params;
    const { data: message, error } = await actor.db.from("whatsapp_message").select("account_id,media_id,media_mime_type,media_filename").eq("id", uuid(messageId, "Attachment")).eq("company_id", actor.companyId).maybeSingle();
    dbError(error);
    if (!message?.media_id || !/^\d+$/.test(message.media_id)) throw new WhatsAppError("This attachment is unavailable.", 404);
    const account = await accountFor(actor);
    if (message.account_id !== account.id) throw new WhatsAppError("Attachment belongs to a different connection.", 403);
    const details = await metaJson(`${message.media_id}?phone_number_id=${account.phone_number_id}`);
    if (typeof details.url !== "string" || typeof details.file_size !== "number" || details.file_size > 20_000_000) throw new WhatsAppError("This attachment is unavailable or exceeds the 20 MB download limit.", 413);
    const url = new URL(details.url);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !(url.hostname === "lookaside.fbsbx.com" || url.hostname.endsWith(".fbcdn.net"))) throw new WhatsAppError("The attachment address could not be verified.", 502);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${metaConfig().token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new WhatsAppError("Meta could not load this attachment. It may have expired.", 502);
    const mime = typeof details.mime_type === "string" && /^(image\/(jpeg|png|webp)|audio\/(aac|amr|mpeg|mp4|ogg)|video\/(mp4|3gpp)|application\/(pdf|octet-stream))$/.test(details.mime_type) ? details.mime_type : "application/octet-stream";
    const filename = String(message.media_filename || "whatsapp-attachment").replace(/[^\w. -]/g, "_").slice(0, 120);
    const data = await readBody(new Request("https://localhost/attachment", { method: "POST", body: response.body, headers: response.headers, duplex: "half" } as RequestInit), 20_000_000);
    return new Response(Buffer.from(data), { headers: { "Content-Type": mime, "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch (error) { return failure(error); }
}
