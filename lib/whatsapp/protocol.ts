import { createHmac, timingSafeEqual } from "node:crypto";
export { normalizePhone, buildWhatsAppUrl } from "./phone";

const MAX_BODY_LENGTH = 4096;
const REPLY_WINDOW_MS = (23 * 60 + 55) * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WhatsAppInboundType =
  | "text" | "image" | "document" | "audio" | "video" | "sticker"
  | "location" | "contacts" | "interactive" | "unsupported";

export type ParsedWhatsAppMessage = {
  phoneNumberId: string;
  businessAccountId: string;
  waId: string;
  contactName: string;
  providerMessageId: string;
  type: WhatsAppInboundType;
  body: string;
  timestamp: string;
  mediaId?: string;
  mediaMimeType?: string;
  mediaFilename?: string;
};

export type ParsedWhatsAppStatus = {
  phoneNumberId: string;
  businessAccountId: string;
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  errorCode?: string;
  clientRequestId?: string;
};

export type ParsedWhatsAppWebhook = {
  messages: ParsedWhatsAppMessage[];
  statuses: ParsedWhatsAppStatus[];
};

/** Verify the original request bytes, before JSON parsing or reserializing. */
export function verifySignature(
  rawBody: Uint8Array,
  signature: string | null,
  appSecret: string,
): boolean {
  if (!appSecret.trim() || !signature || !/^sha256=[0-9a-fA-F]{64}$/.test(signature)) {
    return false;
  }
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const received = Buffer.from(signature.slice(7), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Five minutes of margin prevents sends at Meta's 24-hour boundary. */
export function isReplyWindowOpen(lastInboundAt: string | null, now = Date.now()): boolean {
  if (!lastInboundAt || !Number.isFinite(now)) return false;
  const inboundAt = Date.parse(lastInboundAt);
  const age = now - inboundAt;
  return Number.isFinite(inboundAt) && age >= 0 && age < REPLY_WINDOW_MS;
}

type JsonObject = Record<string, unknown>;

function invalid(path: string): never {
  // Do not include customer content or credentials in errors/logs.
  throw new Error(`Invalid WhatsApp webhook: ${path}.`);
}

function object(value: unknown, path: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid(path);
  return value as JsonObject;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value) || value.length > 1000) invalid(path);
  return value;
}

function string(value: unknown, path: string, max = MAX_BODY_LENGTH, allowEmpty = false): string {
  if (typeof value !== "string" || value.length > max || (!allowEmpty && !value.length) || value.includes("\u0000")) {
    invalid(path);
  }
  return value;
}

function optionalString(value: unknown, path: string, max = MAX_BODY_LENGTH): string {
  return value === undefined ? "" : string(value, path, max, true);
}

function numericId(value: unknown, path: string): string {
  const id = string(value, path, 32);
  if (!/^[0-9]+$/.test(id)) invalid(path);
  return id;
}

function messageId(value: unknown, path: string): string {
  const id = string(value, path, 512);
  if (/\s|[\u0000-\u001f\u007f]/.test(id)) invalid(path);
  return id;
}

function waId(value: unknown, path: string): string {
  const id = string(value, path, 15);
  if (!/^[1-9][0-9]{7,14}$/.test(id)) invalid(path);
  return id;
}

function timestamp(value: unknown, path: string): string {
  const seconds = string(value, path, 12);
  if (!/^[0-9]+$/.test(seconds)) invalid(path);
  const milliseconds = Number(seconds) * 1000;
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0 || milliseconds > 253402300799000) invalid(path);
  return new Date(milliseconds).toISOString();
}

function coordinate(value: unknown, path: string, limit: number): number {
  if (typeof value !== "number" && !(typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value))) invalid(path);
  const result = Number(value);
  if (!Number.isFinite(result) || Math.abs(result) > limit) invalid(path);
  return result;
}

function inboundBody(message: JsonObject, rawType: string): Pick<ParsedWhatsAppMessage, "type" | "body" | "mediaId" | "mediaMimeType" | "mediaFilename"> {
  if (rawType === "text") {
    const content = object(message.text, "message.text");
    return { type: "text", body: string(content.body, "message.text.body") };
  }
  if (["image", "document", "audio", "video", "sticker"].includes(rawType)) {
    const media = object(message[rawType], `message.${rawType}`);
    const mediaId = numericId(media.id, "message.media.id");
    const mediaMimeType = string(media.mime_type, "message.media.mime_type", 128);
    if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:;[a-z0-9 =._+-]+)?$/i.test(mediaMimeType)) invalid("message.media.mime_type");
    const mediaFilename = optionalString(media.filename, "message.media.filename", 255);
    if (/[\u0000-\u001f\u007f]/.test(mediaFilename)) invalid("message.media.filename");
    return {
      type: rawType as WhatsAppInboundType,
      body: optionalString(media.caption, "message.media.caption"),
      mediaId,
      mediaMimeType,
      ...(mediaFilename ? { mediaFilename: mediaFilename.split(/[\\/]/).pop() || "attachment" } : {}),
    };
  }
  if (rawType === "location") {
    const location = object(message.location, "message.location");
    const latitude = coordinate(location.latitude, "message.location.latitude", 90);
    const longitude = coordinate(location.longitude, "message.location.longitude", 180);
    const name = optionalString(location.name, "message.location.name");
    const address = optionalString(location.address, "message.location.address");
    return { type: "location", body: [name, address, `${latitude}, ${longitude}`].filter(Boolean).join("\n").slice(0, MAX_BODY_LENGTH) };
  }
  if (rawType === "contacts") {
    const contacts = array(message.contacts, "message.contacts");
    if (!contacts.length) invalid("message.contacts");
    const bodies = contacts.map((rawContact) => {
      const contact = object(rawContact, "message.contacts.item");
      const name = object(contact.name, "message.contacts.name");
      const formattedName = string(name.formatted_name, "message.contacts.formatted_name", 256);
      const phones = contact.phones === undefined ? [] : array(contact.phones, "message.contacts.phones").map((rawPhone) => {
        const phone = object(rawPhone, "message.contacts.phone");
        return optionalString(phone.phone, "message.contacts.phone.phone", 128);
      });
      return [formattedName, ...phones].filter(Boolean).join("\n");
    });
    return { type: "contacts", body: bodies.join("\n\n").slice(0, MAX_BODY_LENGTH) };
  }
  if (rawType === "button") {
    const button = object(message.button, "message.button");
    string(button.payload, "message.button.payload", 1024, true);
    return { type: "interactive", body: string(button.text, "message.button.text") };
  }
  if (rawType === "interactive") {
    const interactive = object(message.interactive, "message.interactive");
    const replyType = string(interactive.type, "message.interactive.type", 64);
    if (replyType === "button_reply" || replyType === "list_reply") {
      const reply = object(interactive[replyType], "message.interactive.reply");
      string(reply.id, "message.interactive.reply.id", 1024);
      const title = string(reply.title, "message.interactive.reply.title");
      const description = optionalString(reply.description, "message.interactive.reply.description");
      return { type: "interactive", body: [title, description].filter(Boolean).join("\n").slice(0, MAX_BODY_LENGTH) };
    }
    return { type: "unsupported", body: "[Interactive message not supported in this inbox]" };
  }
  return { type: "unsupported", body: "[Message type not supported in this inbox]" };
}

/** Parse the entire batch before persisting: malformed recognized events must retry. */
export function parseWebhook(payload: unknown): ParsedWhatsAppWebhook {
  const root = object(payload, "payload");
  if (root.object !== "whatsapp_business_account") invalid("object");
  const result: ParsedWhatsAppWebhook = { messages: [], statuses: [] };
  for (const rawEntry of array(root.entry, "entry")) {
    const entry = object(rawEntry, "entry.item");
    const businessAccountId = numericId(entry.id, "entry.id");
    for (const rawChange of array(entry.changes, "entry.changes")) {
      const change = object(rawChange, "change");
      const field = string(change.field, "change.field", 128);
      const value = object(change.value, "change.value");
      if (field !== "messages") continue;
      if (value.messaging_product !== "whatsapp") invalid("value.messaging_product");
      // Valid errors/notification-only changes have no conversation to persist.
      if (value.messages === undefined && value.statuses === undefined) continue;
      const metadata = object(value.metadata, "value.metadata");
      const phoneNumberId = numericId(metadata.phone_number_id, "metadata.phone_number_id");
      const contactNames = new Map<string, string>();
      if (value.contacts !== undefined) {
        for (const rawContact of array(value.contacts, "value.contacts")) {
          const contact = object(rawContact, "contact");
          const id = waId(contact.wa_id, "contact.wa_id");
          const profile = object(contact.profile, "contact.profile");
          contactNames.set(id, string(profile.name, "contact.profile.name", 256, true));
        }
      }
      if (value.messages !== undefined) {
        for (const rawMessage of array(value.messages, "value.messages")) {
          const message = object(rawMessage, "message");
          const sender = waId(message.from, "message.from");
          const providerMessageId = messageId(message.id, "message.id");
          const receivedAt = timestamp(message.timestamp, "message.timestamp");
          const rawType = string(message.type, "message.type", 64);
          result.messages.push({
            phoneNumberId, businessAccountId, waId: sender,
            contactName: contactNames.get(sender) || "",
            providerMessageId, timestamp: receivedAt, ...inboundBody(message, rawType),
          });
        }
      }
      if (value.statuses !== undefined) {
        for (const rawStatus of array(value.statuses, "value.statuses")) {
          const status = object(rawStatus, "status");
          const providerMessageId = messageId(status.id, "status.id");
          const eventTimestamp = timestamp(status.timestamp, "status.timestamp");
          const state = string(status.status, "status.status", 64);
          // Deletion and future provider statuses must not regress delivery state.
          if (!["sent", "delivered", "read", "failed"].includes(state)) continue;
          const errors = status.errors === undefined ? [] : array(status.errors, "status.errors");
          let errorCode: string | undefined;
          for (const rawError of errors) {
            const error = object(rawError, "status.error");
            if (!(typeof error.code === "number" && Number.isSafeInteger(error.code) && error.code >= 0)
              && !(typeof error.code === "string" && /^[0-9]{1,12}$/.test(error.code))) invalid("status.error.code");
            errorCode ??= String(error.code);
          }
          let clientRequestId: string | undefined;
          if (status.biz_opaque_callback_data !== undefined) {
            const callback = string(status.biz_opaque_callback_data, "status.biz_opaque_callback_data", 512, true);
            // Other approved senders may use arbitrary callback text; never cast it to UUID.
            if (UUID.test(callback)) clientRequestId = callback.toLowerCase();
          }
          result.statuses.push({
            phoneNumberId, businessAccountId, providerMessageId,
            status: state as ParsedWhatsAppStatus["status"], timestamp: eventTimestamp,
            ...(errorCode ? { errorCode } : {}), ...(clientRequestId ? { clientRequestId } : {}),
          });
        }
      }
    }
  }
  return result;
}
