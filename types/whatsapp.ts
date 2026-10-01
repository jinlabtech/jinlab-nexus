export type WhatsAppAccount = {
  id: string;
  company_id: string;
  phone_number_id: string;
  business_account_id: string | null;
  display_phone_number: string | null;
  verified_name: string | null;
  active: boolean;
};

export type WhatsAppConnection = {
  account: WhatsAppAccount | null;
  ready: boolean;
  missing: string[];
  canManage: boolean;
  canSend: boolean;
  setupRequired?: boolean;
};

export type WhatsAppSalesStage =
  | "enquiry"
  | "qualified"
  | "quoted"
  | "negotiating"
  | "won"
  | "paid"
  | "lost";

export type WhatsAppAttentionState =
  | "none"
  | "waiting_customer"
  | "follow_up_due";

export type WhatsAppSalesContextUpdate = {
  salesStage?: WhatsAppSalesStage;
  attentionState?: WhatsAppAttentionState;
  assignedTo?: string;
  clearAssignee?: boolean;
  followUpAt?: string;
  clearFollowUp?: boolean;
  followUpNote?: string;
  salesValue?: number;
};

export type WhatsAppConversation = {
  id: string;
  company_id: string;
  account_id: string;
  wa_id: string;
  customer_id: string | null;
  contact_name: string | null;
  status: "open" | "closed";

  sales_stage: WhatsAppSalesStage;
  attention_state: WhatsAppAttentionState;
  assigned_to: string | null;
  follow_up_at: string | null;
  follow_up_note: string | null;
  sales_value: number | null;
  sales_stage_updated_at: string;

  opted_out: boolean;
  unread_count: number;
  last_inbound_at: string | null;
  last_message_at: string | null;
  created_at: string;
};

export type WhatsAppMessage = {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  message_type: string;
  body: string | null;
  status: "received" | "sending" | "sent" | "delivered" | "read" | "failed" | "unknown";
  error_code: string | null;
  client_request_id: string | null;
  media_id: string | null;
  media_mime_type: string | null;
  media_filename: string | null;
  created_at: string;
  provider_timestamp: string | null;
};

export type WhatsAppAssignableUser = {
  user_id: string;
  employee_id: string | null;
  employee_number: string | null;
  display_name: string;
  role: string | null;
};

export type WhatsAppCustomerSummary = {
  id: string;
  display_name: string;
  phone: string | null;
};

export type WhatsAppConversationDetail = {
  conversation: WhatsAppConversation;
  messages: WhatsAppMessage[];
  customers: WhatsAppCustomerSummary[];
  documents: {
    quotations: { id: string; quotation_number: string; status: string; total_amount: number }[];
    invoices: { id: string; invoice_number: string; status: string; balance_due: number; total_amount: number }[];
  };
  hasMore: boolean;
  nextCursor: string | null;
  readThrough: string;
};

export type WhatsAppConversationUpdate = {
  customerId?: string;
  status?: "open" | "closed";
  markRead?: boolean;
  readThrough?: string;
  optedOut?: boolean;
};

// Kept only in the inbox component's memory, never in browser storage.
export type WhatsAppComposerState = {
  draft: string;
  pending: { id: string; text: string } | null;
  preparingQuotation: boolean;
};
