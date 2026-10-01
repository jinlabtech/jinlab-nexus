import { parseHistoryCursor } from "../lib/whatsapp/history";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

// Node 24 strips TypeScript directly; a dynamic path keeps Next's TS config unchanged.
const protocolPath = "../lib/whatsapp/protocol.ts";
const {
  normalizePhone, verifySignature, isReplyWindowOpen, parseWebhook, buildWhatsAppUrl,
}: typeof import("../lib/whatsapp/protocol") = await import(protocolPath);

const PHONE = "27821234567";
const REQUEST_ID = "88f30c46-242c-4d41-b064-c7bf8a2c44dd";

function incoming(overrides: Record<string, unknown> = {}) {
  return {
    from: PHONE, id: "wamid.inbound-1", timestamp: "1789477200",
    type: "text", text: { body: "Hello\nCan you send my quotation?" }, ...overrides,
  };
}

function envelope(value: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "123456789012345",
      changes: [{ field: "messages", value: {
        messaging_product: "whatsapp",
        metadata: { phone_number_id: "987654321012345", display_phone_number: "+27 11 555 0100" },
        contacts: [{ wa_id: PHONE, profile: { name: "Nandi Khumalo" } }],
        ...value,
      } }],
    }],
  };
}

test("normalizes ZA local and explicit international numbers without changing their country", () => {
  for (const input of ["0821234567", "082 123 4567", "(082) 123-4567", "27 82 123 4567", "+27 82 123 4567", "0027821234567"]) {
    assert.equal(normalizePhone(input), PHONE, input);
  }
  assert.equal(normalizePhone("+44 (20) 7946 0958"), "442079460958");
  assert.equal(normalizePhone("0044 20 7946 0958"), "442079460958");
  assert.equal(normalizePhone("+1 (202) 555-0123"), "12025550123");
  assert.equal(normalizePhone("+12345678"), "12345678");
  assert.equal(normalizePhone("+123456789012345"), "123456789012345");
});

test("rejects malformed numbers, extensions, Unicode digits, and invalid ZA lengths", () => {
  for (const input of [
    "", "   ", "++27821234567", "27+821234567", "+0821234567", "000821234567", "01234",
    "+27 082 123 4567", "2782123456", "278212345678", "27021234567", "08212345678",
    "0821234567 ext 42", "0821234567x42", "0821234567#42", "0821234567;42",
    "０８２１２３４５６７", "+1234567", "+1234567890123456", "082\n1234567",
  ]) assert.throws(() => normalizePhone(input), Error, input);
});

test("app handoff preserves newlines and encodes all message text into one parameter", () => {
  const message = "Hello Nandi 👋\nQuotation & invoice?\nhttps://nexus.jinlab.co.za/q/abc?a=1&b=2#copy";
  const url = new URL(buildWhatsAppUrl("0821234567", message));
  assert.equal(url.origin, "https://wa.me");
  assert.equal(url.pathname, `/${PHONE}`);
  assert.equal(url.searchParams.get("text"), message);
  assert.equal([...url.searchParams].length, 1);
  assert.equal(url.hash, "");
  assert.match(url.href, /%0A/);
  assert.equal(buildWhatsAppUrl(PHONE, ""), `https://wa.me/${PHONE}`);
  assert.throws(() => buildWhatsAppUrl(PHONE, "x".repeat(4097)));
});

test("signature verification authenticates the exact raw bytes and rejects modified content", () => {
  const secret = "test-app-secret";
  const bytes = Buffer.from('{ "text": "Nandi 👋" }\n', "utf8");
  const signature = `sha256=${createHmac("sha256", secret).update(bytes).digest("hex")}`;
  assert.equal(verifySignature(bytes, signature, secret), true);
  assert.equal(verifySignature(Buffer.from('{"text":"Nandi 👋"}'), signature, secret), false);
  assert.equal(verifySignature(bytes, signature, "different-secret"), false);
  const altered = Buffer.from(bytes);
  altered[4] ^= 1;
  assert.equal(verifySignature(altered, signature, secret), false);
});

test("signature verification rejects absent, malformed, truncated, or duplicated headers", () => {
  const body = Buffer.from("{}");
  const valid = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
  for (const header of [null, "", "sha1=" + "a".repeat(40), "sha256=" + "g".repeat(64), "sha256=" + "a".repeat(63), ` ${valid}`, `${valid}\n`, `${valid},${valid}`]) {
    assert.equal(verifySignature(body, header, "secret"), false, String(header));
  }
  assert.equal(verifySignature(body, valid, ""), false);
  assert.equal(verifySignature(body, valid, "   "), false);
});

test("reply window closes at the conservative boundary and fails closed on bad/future timestamps", () => {
  const now = Date.parse("2026-09-15T12:00:00Z");
  const margin = (23 * 60 + 55) * 60000;
  assert.equal(isReplyWindowOpen(new Date(now).toISOString(), now), true);
  assert.equal(isReplyWindowOpen(new Date(now - margin + 1).toISOString(), now), true);
  assert.equal(isReplyWindowOpen(new Date(now - margin).toISOString(), now), false);
  assert.equal(isReplyWindowOpen(new Date(now - 24 * 3600000).toISOString(), now), false);
  assert.equal(isReplyWindowOpen(new Date(now + 1).toISOString(), now), false);
  for (const timestamp of [null, "", "not-a-date"]) assert.equal(isReplyWindowOpen(timestamp, now), false);
  assert.equal(isReplyWindowOpen(new Date(now).toISOString(), NaN), false);
});

test("text webhook preserves routing, sender identity, content, and provider timestamp", () => {
  const parsed = parseWebhook(envelope({ messages: [incoming()] }));
  assert.deepEqual(parsed, {
    messages: [{
      phoneNumberId: "987654321012345", businessAccountId: "123456789012345", waId: PHONE,
      contactName: "Nandi Khumalo", providerMessageId: "wamid.inbound-1", type: "text",
      body: "Hello\nCan you send my quotation?", timestamp: new Date(1789477200000).toISOString(),
    }], statuses: [],
  });
});

test("contact names are matched by wa_id and do not leak from another contact in a batch", () => {
  const parsed = parseWebhook(envelope({ messages: [incoming(), incoming({ from: "447911123456", id: "wamid.uk" })] }));
  assert.equal(parsed.messages[0].contactName, "Nandi Khumalo");
  assert.equal(parsed.messages[1].contactName, "");
});

test("media persists safe identifiers and metadata while discarding provider URLs", () => {
  for (const [type, mime] of [["image", "image/jpeg"], ["document", "application/pdf"], ["audio", "audio/ogg; codecs=opus"], ["video", "video/mp4"], ["sticker", "image/webp"]]) {
    const media = { id: "111222333444", mime_type: mime, caption: "Proof of payment", filename: "../../receipt.pdf", url: "http://169.254.169.254/latest/meta-data/" };
    const parsed = parseWebhook(envelope({ messages: [incoming({ type, [type]: media })] })).messages[0];
    assert.equal(parsed.type, type);
    assert.equal(parsed.mediaId, media.id);
    assert.equal(parsed.mediaMimeType, mime);
    assert.equal(parsed.mediaFilename, "receipt.pdf");
    assert.equal(parsed.body, "Proof of payment");
    assert.equal(JSON.stringify(parsed).includes("169.254"), false);
    assert.equal("url" in parsed, false);
  }
});

test("malformed recognized messages reject the entire batch before it can be persisted", () => {
  const malformed = [
    incoming({ text: null }), incoming({ text: { body: 42 } }), incoming({ text: { body: "" } }),
    incoming({ text: { body: "x".repeat(4097) } }), incoming({ text: { body: "bad\u0000body" } }),
    incoming({ from: "0821234567" }), incoming({ id: "has whitespace" }),
    incoming({ timestamp: "yesterday" }), incoming({ timestamp: "999999999999" }), incoming({ timestamp: "0" }),
    incoming({ type: "image", image: {} }), incoming({ type: "document", document: { id: "123", mime_type: "application/pdf\r\nX-Test: injected" } }),
    incoming({ type: "audio", audio: { id: "https://bad.example", mime_type: "audio/ogg" } }),
    incoming({ type: "location", location: { latitude: 91, longitude: 1 } }),
    incoming({ type: "interactive", interactive: { type: "button_reply", button_reply: { id: "a" } } }),
  ];
  for (const message of malformed) {
    assert.throws(() => parseWebhook(envelope({ messages: [incoming(), message] })), /Invalid WhatsApp webhook/);
  }
});

test("known location, contact, and interactive payloads become bounded readable messages", () => {
  const parsed = parseWebhook(envelope({ messages: [
    incoming({ type: "location", location: { latitude: "-26.2041", longitude: 28.0473, name: "Office", address: "Johannesburg", url: "javascript:alert(1)" } }),
    incoming({ type: "contacts", contacts: [{ name: { formatted_name: "Nandi" }, phones: [{ phone: "+27 82 123 4567" }] }] }),
    incoming({ type: "interactive", interactive: { type: "list_reply", list_reply: { id: "quotation", title: "Quotation", description: "Please send it" } } }),
    incoming({ type: "button", button: { payload: "yes", text: "Yes please" } }),
  ] })).messages;
  assert.equal(parsed[0].body, "Office\nJohannesburg\n-26.2041, 28.0473");
  assert.equal(parsed[1].body, "Nandi\n+27 82 123 4567");
  assert.equal(parsed[2].body, "Quotation\nPlease send it");
  assert.equal(parsed[3].type, "interactive");
  assert.equal(parsed[3].body, "Yes please");
});

test("unsupported message types remain visible without storing arbitrary payload contents", () => {
  const parsed = parseWebhook(envelope({ messages: [incoming({ type: "order", order: { token: "private-value" } }), incoming({ type: "unknown", errors: [{ code: 131051 }] })] }));
  assert.equal(parsed.messages.length, 2);
  assert.equal(parsed.messages.every((message) => message.type === "unsupported"), true);
  assert.equal(JSON.stringify(parsed).includes("private-value"), false);
});

test("status webhooks carry account scope, failure code and a valid request UUID", () => {
  const parsed = parseWebhook(envelope({ statuses: [{
    id: "wamid.outbound", timestamp: "1789477200", status: "failed", recipient_id: PHONE,
    errors: [{ code: 131047, title: "Re-engagement message", error_data: { details: "private diagnostic" } }],
    biz_opaque_callback_data: REQUEST_ID,
  }] }));
  assert.deepEqual(parsed.statuses[0], {
    phoneNumberId: "987654321012345", businessAccountId: "123456789012345",
    providerMessageId: "wamid.outbound", timestamp: new Date(1789477200000).toISOString(),
    status: "failed", errorCode: "131047", clientRequestId: REQUEST_ID,
  });
  assert.equal(JSON.stringify(parsed).includes("private diagnostic"), false);
});

test("non-UUID opaque callbacks never reach the database UUID parameter", () => {
  for (const callback of ["", "arbitrary-provider-data", "{\"id\":\"123\"}", "00000000-0000-0000-0000-000000000000"]) {
    const parsed = parseWebhook(envelope({ statuses: [{ id: "wamid.outbound", timestamp: "1789477200", status: "delivered", biz_opaque_callback_data: callback }] }));
    assert.equal(parsed.statuses.length, 1);
    assert.equal(parsed.statuses[0].clientRequestId, undefined);
  }
});

test("unknown status events and other valid change fields cannot overwrite delivery state", () => {
  const payload = envelope({ statuses: [{ id: "wamid.outbound", timestamp: "1789477200", status: "deleted" }] });
  payload.entry[0].changes.push({ field: "account_update", value: { event: "VERIFIED_ACCOUNT" } } as unknown as typeof payload.entry[0]["changes"][number]);
  assert.deepEqual(parseWebhook(payload), { messages: [], statuses: [] });
  assert.deepEqual(parseWebhook(envelope({ errors: [{ code: 131000 }] })), { messages: [], statuses: [] });
});

test("deep envelope validation rejects malformed recognized routing and event arrays", () => {
  for (const payload of [
    null, [], {}, { object: "page", entry: [] },
    { object: "whatsapp_business_account", entry: null },
    { object: "whatsapp_business_account", entry: [{ id: "123", changes: null }] },
    envelope({ messages: "not-an-array" }), envelope({ messages: [incoming()], metadata: {} }),
    envelope({ messages: [incoming()], messaging_product: "messenger" }),
    envelope({ messages: [incoming()], contacts: [{ wa_id: PHONE, profile: null }] }),
    envelope({ statuses: [{ id: "wamid.outbound", timestamp: "1789477200", status: "failed", errors: [{ code: {} }] }] }),
  ]) assert.throws(() => parseWebhook(payload), /Invalid WhatsApp webhook/);
});

test("batched entries retain their own business and phone scope", () => {
  const first = envelope({ messages: [incoming()] });
  const second = envelope({ messages: [incoming({ id: "wamid.second" })] }).entry[0];
  second.id = "555666777";
  second.changes[0].value.metadata.phone_number_id = "999888777";
  first.entry.push(second);
  const parsed = parseWebhook(first);
  assert.equal(parsed.messages.length, 2);
  assert.equal(parsed.messages[0].businessAccountId, "123456789012345");
  assert.equal(parsed.messages[1].businessAccountId, "555666777");
  assert.equal(parsed.messages[1].phoneNumberId, "999888777");
});


test("history cursors preserve PostgreSQL timezone format and microsecond ordering", () => {
  for (const createdAt of ["2026-09-15T12:34:56.123456+00:00", "2026-09-15T12:34:56.123455+00:00", "2026-09-15T12:34:56.123Z", "2026-09-15T14:34:56+02:00"]) {
    const cursor = { id: REQUEST_ID, createdAt };
    assert.deepEqual(parseHistoryCursor(Buffer.from(JSON.stringify(cursor)).toString("base64url")), cursor);
  }
});

test("history cursors reject filter injection, impossible dates and malformed identifiers", () => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  for (const createdAt of ["2026-09-15T12:34:56Z,id.gt.0", "2026-02-30T12:00:00Z", "2026-09-15T24:00:00Z", "2026-09-15T12:00:00.1234567Z", "2026-09-15", null]) {
    assert.throws(() => parseHistoryCursor(encode({ id: REQUEST_ID, createdAt })));
  }
  for (const value of [null, [], {}, { id: "bad,id.eq.1", createdAt: "2026-09-15T12:34:56Z" }]) assert.throws(() => parseHistoryCursor(encode(value)));
  assert.throws(() => parseHistoryCursor("a".repeat(301)));
  assert.throws(() => parseHistoryCursor("a,b"));
});
