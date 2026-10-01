import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class WhatsAppError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export const ACCOUNT_COLUMNS = "id,company_id,phone_number_id,business_account_id,display_phone_number,verified_name,active,created_at,updated_at";
export const CONVERSATION_COLUMNS = "id,company_id,account_id,wa_id,customer_id,contact_name,status,sales_stage,attention_state,assigned_to,follow_up_at,follow_up_note,sales_value,sales_stage_updated_at,opted_out,unread_count,last_inbound_at,last_message_at,created_at,updated_at";
export const MESSAGE_COLUMNS = "id,conversation_id,direction,message_type,body,provider_message_id,client_request_id,status,error_code,media_id,media_mime_type,media_filename,created_at,provider_timestamp,status_timestamp";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function uuid(value: unknown, name = "Record"): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new WhatsAppError(`${name} is invalid.`);
  return value;
}

function baseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new WhatsAppError("Nexus server configuration is incomplete.", 503);
  return { url, key };
}

export function adminClient() {
  const { url } = baseConfig();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new WhatsAppError("WhatsApp server configuration is incomplete.", 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type Actor = { db: SupabaseClient; userId: string; companyId: string; can: (permission: string) => Promise<boolean> };
export async function authenticate(request: Request, permissions: string[] = ["whatsapp.view"]): Promise<Actor> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ") || header.length > 10000) throw new WhatsAppError("Please sign in to Nexus.", 401);
  const token = header.slice(7);
  const { url, key } = baseConfig();
  const db = createClient(url, key, { global: { headers: { Authorization: header } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) throw new WhatsAppError("Your session has expired. Please sign in again.", 401);
  const { data: profile, error: profileError } = await db.from("user_profile").select("company_id").eq("user_id", user.id).single();
  if (profileError || !profile?.company_id) throw new WhatsAppError("Your company access could not be verified.", 403);
  const { data: currentCompany, error: companyError } = await db.rpc("current_company_id");
  if (companyError || currentCompany !== profile.company_id) throw new WhatsAppError("Your company access is ambiguous.", 403);
  const can = async (permission: string) => {
    const { data, error: permissionError } = await db.rpc("current_user_has_permission", { requested_permission: permission });
    if (permissionError) throw new WhatsAppError("Your permissions could not be checked.", 503);
    return data === true;
  };
  const allowed = await Promise.all(permissions.map(can));
  if (!allowed.some(Boolean)) throw new WhatsAppError("You do not have permission to use this WhatsApp feature.", 403);
  return { db, userId: user.id, companyId: profile.company_id, can };
}

export async function requirePermission(actor: Actor, permission: string) {
  if (!await actor.can(permission)) throw new WhatsAppError("You do not have permission for this action.", 403);
}

export async function readBody(request: Request, maximum = 65536): Promise<Uint8Array> {
  const length = request.headers.get("content-length");
  if (length && Number(length) > maximum) throw new WhatsAppError("Request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new WhatsAppError("Request is too large.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

export async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = JSON.parse(new TextDecoder().decode(await readBody(request)));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch (error) {
    if (error instanceof WhatsAppError) throw error;
    throw new WhatsAppError("Request must contain a valid JSON object.");
  }
}

const REQUIRED = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_BUSINESS_ACCOUNT_ID", "WHATSAPP_API_VERSION", "WHATSAPP_COMPANY_ID", "SUPABASE_SECRET_KEY"] as const;
export function missingConfig() { return REQUIRED.filter(key => !process.env[key]?.trim()); }
export function metaConfig() {
  if (missingConfig().length) throw new WhatsAppError("Connect the Meta WhatsApp account before using the inbox.", 503);
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const businessId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID!;
  const version = process.env.WHATSAPP_API_VERSION!;
  const companyId = process.env.WHATSAPP_COMPANY_ID!;
  if (!UUID.test(companyId) || !/^\d+$/.test(phoneId) || !/^\d+$/.test(businessId) || !/^v\d+\.\d+$/.test(version)) throw new WhatsAppError("Meta account configuration is invalid.", 503);
  return { phoneId, businessId, version, companyId, token: process.env.WHATSAPP_ACCESS_TOKEN!, appSecret: process.env.WHATSAPP_APP_SECRET!, verifyToken: process.env.WHATSAPP_VERIFY_TOKEN! };
}

export async function metaFetch(path: string, init: RequestInit = {}) {
  const config = metaConfig();
  // Paths come exclusively from server-validated identifiers, never arbitrary URLs.
  const response = await fetch(`https://graph.facebook.com/${config.version}/${path}`, {
    ...init, headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json", ...init.headers }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000),
  });
  return response;
}

export async function metaJson(path: string) {
  const response = await metaFetch(path);
  if (!response.ok) throw new WhatsAppError("Meta could not verify the WhatsApp account. Check its access and configuration.", 502);
  return response.json();
}

export async function accountFor(actor: Actor, connected = true) {
  const { data, error } = await actor.db.from("whatsapp_account").select(ACCOUNT_COLUMNS).eq("company_id", actor.companyId).maybeSingle();
  dbError(error);
  if (!data) throw new WhatsAppError("Connect your WhatsApp Business account first.", 409);
  if (connected) {
    const config = metaConfig();
    if (actor.companyId !== config.companyId || !data.active || data.phone_number_id !== config.phoneId || data.business_account_id !== config.businessId) throw new WhatsAppError("The WhatsApp connection is inactive or needs to be verified.", 409);
  }
  return data;
}

export async function conversationFor(actor: Actor, id: string) {
  const { data, error } = await actor.db.from("whatsapp_conversation").select(CONVERSATION_COLUMNS).eq("company_id", actor.companyId).eq("id", uuid(id, "Conversation")).maybeSingle();
  dbError(error);
  if (!data) throw new WhatsAppError("Conversation was not found.", 404);
  return data;
}

export function dbError(error: { code?: string } | null) {
  if (!error) return;
  if (["42P01", "PGRST205", "PGRST202"].includes(error.code ?? "")) throw new WhatsAppError("The WhatsApp database setup has not been installed yet.", 503);
  throw new WhatsAppError("Nexus could not save or load WhatsApp data. Please refresh and try again.", 503);
}

export function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
export function failure(error: unknown) {
  if (error instanceof WhatsAppError) return json({ error: error.message }, error.status);
  // Do not expose Meta payloads, tokens, message text, or database details.
  console.error("WhatsApp request failed", error instanceof Error ? error.name : "UnknownError");
  return json({ error: "WhatsApp is temporarily unavailable. Please refresh and try again." }, 503);
}
