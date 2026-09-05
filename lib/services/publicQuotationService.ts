import { supabase } from "@/lib/supabase";

export type PublicQuotationItem = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;

  discount_rate: number;
  discount_mode:
    | "percentage"
    | "fixed";
  discount_value: number;

  tax_mode:
    | "none"
    | "vat";
  tax_rate: number;

  line_subtotal: number;
  line_discount: number;
  line_tax: number;
  line_total: number;
};

export type PublicQuotationData = {
  ok: boolean;
  reason?: string;

  share_link?: {
    id: string;
    expires_at: string | null;
    first_viewed_at:
      | string
      | null;
  };

  quotation?: {
    id: string;
    quotation_number: string;

    status:
      | "draft"
      | "sent"
      | "accepted"
      | "declined"
      | "expired"
      | "cancelled";

    quotation_date: string;
    valid_until:
      | string
      | null;

    customer_reference:
      | string
      | null;

    notes:
      | string
      | null;

    terms:
      | string
      | null;

    subtotal: number;
    discount_amount: number;
    tax_amount: number;
    total_amount: number;
  };

  company?: {
    name: string;
    branch_name: string;
  };

  customer?: {
    name: string;
  };

  items?: PublicQuotationItem[];
};

export type PublicQuotationAction =
  | "accepted"
  | "declined"
  | "requested_changes";

export type PublicQuotationResponse = {
  ok: boolean;
  reason?: string;

  action?: {
    id: string;
    action: PublicQuotationAction;
    message: string | null;
    occurred_at: string;
  };

  quotation?: {
    id: string;
    quotation_number: string;
    status: string;
  };
};

export async function getPublicQuotation(
  token: string
): Promise<PublicQuotationData> {
  const { data, error } =
    await supabase.rpc(
      "get_public_quotation",
      {
        p_token: token,
      }
    );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data as PublicQuotationData;
}

export async function respondToPublicQuotation(
  token: string,
  action: PublicQuotationAction,
  message?: string
): Promise<PublicQuotationResponse> {
  const { data, error } =
    await supabase.rpc(
      "respond_to_public_quotation",
      {
        p_token: token,
        p_action: action,
        p_message:
          message?.trim() ||
          null,
      }
    );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data as PublicQuotationResponse;
}
