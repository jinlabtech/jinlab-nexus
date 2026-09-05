import { supabase } from "@/lib/supabase";

export type PublicPaymentLinkData = {
  ok: boolean;
  reason?: string;

  payment_link?: {
    id: string;
    link_type:
      | "full_balance"
      | "fixed_amount"
      | "next_installment"
      | "customer_entered";
    amount: number | null;
    minimum_amount: number | null;
    maximum_amount: number | null;
    currency: string;
    expires_at: string | null;
  };

  invoice?: {
    invoice_number: string;
    invoice_date: string;
    due_date: string | null;
    total_amount: number;
    amount_paid: number;
    balance_due: number;
    status: string;
    paid_at: string | null;
  };

  company?: {
    name: string;
    branch_name: string;
  };

  customer?: {
    name: string;
  };
};

export async function getPublicPaymentLink(
  token: string
): Promise<PublicPaymentLinkData> {
  const { data, error } =
    await supabase.rpc(
      "get_public_payment_link",
      {
        p_token: token,
      }
    );

  if (error) {
    throw new Error(error.message);
  }

  return data as PublicPaymentLinkData;
}

export type PublicGatewayTransaction = {
  id: string;
  status: string;
  provider: string;
  payment_method: string;
  amount: number;
  currency: string;
  created_at: string;
};

export type InitiatePublicPaymentResult = {
  ok: boolean;
  duplicate: boolean;
  transaction: PublicGatewayTransaction;
};

function createIdempotencyKey(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

export async function initiatePublicPayment(
  token: string,
  provider: string,
  paymentMethod: string,
  amount: number,
  idempotencyKey?: string
): Promise<InitiatePublicPaymentResult> {
  const { data, error } =
    await supabase.rpc(
      "create_public_gateway_transaction",
      {
        p_token: token,
        p_provider: provider,
        p_payment_method:
          paymentMethod,
        p_amount: amount,
        p_idempotency_key:
          idempotencyKey ??
          createIdempotencyKey(),
      }
    );

  if (error) {
    throw new Error(error.message);
  }

  return data as InitiatePublicPaymentResult;
}
