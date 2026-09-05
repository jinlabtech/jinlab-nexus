import { supabase } from "@/lib/supabase";

export type QuotationDeliveryMethod =
  | "email"
  | "whatsapp"
  | "copied_link"
  | "download_pdf"
  | "print"
  | "manual";

export type QuotationShareLink = {
  id: string;
  company_id: string;
  branch_id: string;
  quotation_id: string;
  customer_id: string;
  token: string;

  status:
    | "active"
    | "expired"
    | "cancelled";

  expires_at: string | null;

  created_by: string | null;

  first_viewed_at:
    | string
    | null;

  last_viewed_at:
    | string
    | null;

  view_count: number;

  created_at: string;
  updated_at: string;
};

export type QuotationDelivery = {
  id: string;
  company_id: string;
  quotation_id: string;

  share_link_id:
    | string
    | null;

  customer_id: string;

  delivery_method:
    QuotationDeliveryMethod;

  destination:
    | string
    | null;

  status:
    | "prepared"
    | "sent"
    | "delivered"
    | "viewed"
    | "failed";

  provider:
    | string
    | null;

  provider_message_id:
    | string
    | null;

  failure_reason:
    | string
    | null;

  metadata: Record<
    string,
    unknown
  >;

  prepared_at: string;

  sent_at:
    | string
    | null;

  delivered_at:
    | string
    | null;

  viewed_at:
    | string
    | null;

  created_by:
    | string
    | null;

  created_at: string;
};

export type QuotationCustomerAction = {
  id: string;
  company_id: string;
  quotation_id: string;

  share_link_id:
    | string
    | null;

  customer_id: string;

  action:
    | "viewed"
    | "accepted"
    | "declined"
    | "requested_changes";

  message:
    | string
    | null;

  metadata: Record<
    string,
    unknown
  >;

  occurred_at: string;
  created_at: string;
};

export type CreateQuotationShareLinkResult = {
  ok: boolean;

  share_link: {
    id: string;
    token: string;

    status:
      | "active"
      | "expired"
      | "cancelled";

    expires_at:
      | string
      | null;

    quotation_id: string;
  };
};

export async function createQuotationShareLink(
  quotationId: string,
  expiresAt?: string | null
): Promise<CreateQuotationShareLinkResult> {
  const { data, error } =
    await supabase.rpc(
      "create_quotation_share_link",
      {
        p_quotation_id:
          quotationId,

        p_expires_at:
          expiresAt ?? null,
      }
    );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data as CreateQuotationShareLinkResult;
}

export async function recordQuotationDelivery(
  quotationId: string,
  shareLinkId: string,
  deliveryMethod:
    QuotationDeliveryMethod,
  destination?: string | null,
  metadata: Record<
    string,
    unknown
  > = {}
) {
  const { data, error } =
    await supabase.rpc(
      "record_quotation_delivery",
      {
        p_quotation_id:
          quotationId,

        p_share_link_id:
          shareLinkId,

        p_delivery_method:
          deliveryMethod,

        p_destination:
          destination ?? null,

        p_metadata:
          metadata,
      }
    );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data;
}

export async function cancelQuotationShareLink(
  shareLinkId: string
) {
  const { data, error } =
    await supabase.rpc(
      "cancel_quotation_share_link",
      {
        p_share_link_id:
          shareLinkId,
      }
    );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data;
}

export async function getQuotationShareLinks(
  quotationId: string,
  companyId: string
): Promise<QuotationShareLink[]> {
  const { data, error } =
    await supabase
      .from(
        "quotation_share_link"
      )
      .select("*")
      .eq(
        "quotation_id",
        quotationId
      )
      .eq(
        "company_id",
        companyId
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return (
    (data ??
      []) as QuotationShareLink[]
  );
}

export async function getQuotationDeliveries(
  quotationId: string,
  companyId: string
): Promise<QuotationDelivery[]> {
  const { data, error } =
    await supabase
      .from(
        "quotation_delivery"
      )
      .select("*")
      .eq(
        "quotation_id",
        quotationId
      )
      .eq(
        "company_id",
        companyId
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return (
    (data ??
      []) as QuotationDelivery[]
  );
}

export async function getQuotationCustomerActions(
  quotationId: string,
  companyId: string
): Promise<
  QuotationCustomerAction[]
> {
  const { data, error } =
    await supabase
      .from(
        "quotation_customer_action"
      )
      .select("*")
      .eq(
        "quotation_id",
        quotationId
      )
      .eq(
        "company_id",
        companyId
      )
      .order(
        "occurred_at",
        {
          ascending: false,
        }
      );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return (
    (data ??
      []) as QuotationCustomerAction[]
  );
}
