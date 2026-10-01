import { buildWhatsAppUrl } from "@/lib/whatsapp/phone";
import { supabase } from "@/lib/supabase";
import type {
  WhatsAppConnection, WhatsAppConversation, WhatsAppConversationDetail,
  WhatsAppConversationUpdate, WhatsAppMessage,
  WhatsAppSalesContextUpdate,
  WhatsAppAssignableUser,
} from "@/types/whatsapp";

export class WhatsAppRequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "WhatsAppRequestError";
  }
}

async function authenticatedFetch(path: string, init: RequestInit = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new WhatsAppRequestError("Your session has expired. Sign in again to use WhatsApp.", 401);
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`/api/whatsapp${path}`, { ...init, headers, cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new WhatsAppRequestError(body?.error || `WhatsApp request failed (${response.status}).`, response.status);
  }
  return response;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(path, init);
  return response.json() as Promise<T>;
}

export const whatsappService = {
  assignableUsers: async () => {
    const { data, error } =
      await supabase.rpc(
        "list_whatsapp_assignable_users"
      );

    if (error) {
      throw new WhatsAppRequestError(
        error.message ||
          "WhatsApp team members could not be loaded.",
        400
      );
    }

    return (
      data ?? []
    ) as WhatsAppAssignableUser[];
  },
  account: (signal?: AbortSignal) => request<WhatsAppConnection>("/account", { signal }),
  connect: (active = true) => request<WhatsAppConnection>("/account", { method: "POST", body: JSON.stringify({ active }) }),
  conversations: (search: string, signal?: AbortSignal) =>
    request<{ conversations: WhatsAppConversation[] }>(`/conversations?search=${encodeURIComponent(search)}`, { signal }),
  createConversation: (input: { phone: string; customerId?: string; contactName?: string }) =>
    request<{ conversation: WhatsAppConversation }>("/conversations", { method: "POST", body: JSON.stringify(input) }),
  conversation: (id: string, signal?: AbortSignal, before?: string) =>
    request<WhatsAppConversationDetail>(`/conversations/${encodeURIComponent(id)}${before ? `?before=${encodeURIComponent(before)}` : ""}`, { signal }),
  updateConversation: (id: string, input: WhatsAppConversationUpdate) =>
    request<{ conversation: WhatsAppConversation }>(`/conversations/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }),
  updateSalesContext: async (
    id: string,
    input: WhatsAppSalesContextUpdate
  ) => {
    const { data, error } =
      await supabase.rpc(
        "whatsapp_update_sales_context",
        {
          p_conversation_id: id,
          p_sales_stage:
            input.salesStage ?? null,
          p_attention_state:
            input.attentionState ?? null,
          p_assigned_to:
            input.assignedTo ?? null,
          p_clear_assignee:
            input.clearAssignee ?? false,
          p_follow_up_at:
            input.followUpAt ?? null,
          p_clear_follow_up:
            input.clearFollowUp ?? false,
          p_follow_up_note:
            input.followUpNote ?? null,
          p_sales_value:
            input.salesValue ?? null,
        }
      );

    if (error || !data) {
      throw new WhatsAppRequestError(
        error?.message ||
          "Sales context could not be updated.",
        400
      );
    }

    return {
      conversation:
        data as WhatsAppConversation,
    };
  },
  send: (input: { conversationId: string; requestId: string; type: "text"; text: string }) =>
    request<{ message: WhatsAppMessage }>("/messages", { method: "POST", body: JSON.stringify(input) }),
  quotationDraft: (conversationId: string, quotationId: string) =>
    request<{ text: string }>("/documents", { method: "POST", body: JSON.stringify({ conversationId, quotationId }) }),
  media: async (id: string, signal?: AbortSignal) => {
    const response = await authenticatedFetch(`/media/${encodeURIComponent(id)}`, { signal });
    return response.blob();
  },
};

export function whatsappError(error: unknown) {
  return error instanceof Error ? error.message : "WhatsApp could not complete this action. Please try again.";
}

export function isAbort(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function whatsappAppUrl(phone: string, text?: string) {
  try { return buildWhatsAppUrl(phone, text ?? ""); } catch { return null; }
}
