import { ACCOUNT_COLUMNS, accountFor, adminClient, authenticate, body, dbError, failure, json, metaConfig, metaJson, missingConfig, WhatsAppError } from "@/lib/whatsapp/server";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request, ["whatsapp.view", "settings.integrations.manage"]);
    const [canManage, canSend] = await Promise.all([actor.can("settings.integrations.manage"), actor.can("whatsapp.send")]);
    const { data: account, error } = await actor.db.from("whatsapp_account").select(ACCOUNT_COLUMNS).eq("company_id", actor.companyId).maybeSingle();
    const setupRequired = !!error && ["42P01", "PGRST205"].includes(error.code);
    if (!setupRequired) dbError(error);
    const missing = missingConfig();
    let ready = false;
    if (!missing.length && account?.active) {
      const config = metaConfig();
      ready = actor.companyId === config.companyId && account.phone_number_id === config.phoneId && account.business_account_id === config.businessId;
    }
    return json({ account, ready, missing: canManage ? missing : [], canManage, canSend, setupRequired, mode: "service_replies_only" });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await authenticate(request, ["settings.integrations.manage"]);
    const input = await body(request);
    const admin = adminClient();
    if (input.active === false) {
      const account = await accountFor(actor, false);
      const { error } = await admin.from("whatsapp_account").update({ active: false, updated_at: new Date().toISOString() }).eq("id", account.id).eq("company_id", actor.companyId);
      dbError(error);
      return json({ disconnected: true });
    }
    const config = metaConfig();
    if (config.companyId !== actor.companyId) throw new WhatsAppError("The configured WhatsApp account belongs to a different company.", 403);
    const phones = await metaJson(`${config.businessId}/phone_numbers?fields=id,display_phone_number,verified_name&limit=100`);
    const phone = Array.isArray(phones.data) ? phones.data.find((item: { id?: string }) => item.id === config.phoneId) : null;
    if (!phone) throw new WhatsAppError("The configured phone number does not belong to this Meta business account.", 409);
    const { data: claimed, error: claimedError } = await admin.from("whatsapp_account").select("id,company_id").eq("phone_number_id", config.phoneId).maybeSingle();
    dbError(claimedError);
    if (claimed && claimed.company_id !== actor.companyId) throw new WhatsAppError("This WhatsApp number is already connected to another company.", 409);
    const { data: current, error: currentError } = await admin.from("whatsapp_account").select("id,phone_number_id,business_account_id").eq("company_id", actor.companyId).maybeSingle();
    dbError(currentError);
    if (current && (current.phone_number_id !== config.phoneId || current.business_account_id !== config.businessId)) throw new WhatsAppError("An existing number is linked to this company's message history. Contact support before changing numbers.", 409);
    const { data: account, error } = await admin.from("whatsapp_account").upsert({ company_id: actor.companyId, phone_number_id: config.phoneId, business_account_id: config.businessId, display_phone_number: String(phone.display_phone_number ?? ""), verified_name: String(phone.verified_name ?? ""), active: true, updated_at: new Date().toISOString() }, { onConflict: "company_id" }).select(ACCOUNT_COLUMNS).single();
    dbError(error);
    return json({ account });
  } catch (error) { return failure(error); }
}
