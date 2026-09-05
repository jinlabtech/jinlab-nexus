import { supabase } from "@/lib/supabase";

export type PaymentLinkType =
  | "full_balance"
  | "fixed_amount"
  | "next_installment"
  | "customer_entered";

export type PaymentLinkStatus =
  | "active"
  | "paid"
  | "expired"
  | "cancelled";

export type GatewayTransactionStatus =
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled"
  | "refunded";

export type InvoicePaymentLink = {
  id: string;
  company_id: string;
  branch_id: string;
  invoice_id: string;
  customer_id: string;

  payment_plan_id: string | null;
  installment_id: string | null;

  link_type: PaymentLinkType;

  token: string;

  amount: number | null;
  minimum_amount: number | null;
  maximum_amount: number | null;

  currency: string;

  status: PaymentLinkStatus;

  expires_at: string | null;

  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentGatewayTransaction = {
  id: string;
  company_id: string;
  branch_id: string;
  invoice_id: string;
  customer_id: string;

  payment_link_id: string | null;
  payment_plan_id: string | null;
  installment_id: string | null;

  provider: string;
  provider_transaction_id: string | null;
  provider_reference: string | null;

  payment_method: string | null;

  amount: number;
  currency: string;

  status: GatewayTransactionStatus;

  gateway_fee: number | null;
  failure_reason: string | null;

  idempotency_key: string;

  provider_payload: unknown | null;

  paid_at: string | null;
  verified_at: string | null;

  created_at: string;
  updated_at: string;
};

export type CreatePaymentLinkInput = {
  company_id: string;
  branch_id: string;
  invoice_id: string;
  customer_id: string;

  payment_plan_id?: string | null;
  installment_id?: string | null;

  link_type: PaymentLinkType;

  amount?: number | null;
  minimum_amount?: number | null;
  maximum_amount?: number | null;

  currency?: string;

  expires_at?: string | null;
};

const paymentLinkColumns = `
  id,
  company_id,
  branch_id,
  invoice_id,
  customer_id,
  payment_plan_id,
  installment_id,
  link_type,
  token,
  amount,
  minimum_amount,
  maximum_amount,
  currency,
  status,
  expires_at,
  created_by,
  created_at,
  updated_at
`;

const gatewayTransactionColumns = `
  id,
  company_id,
  branch_id,
  invoice_id,
  customer_id,
  payment_link_id,
  payment_plan_id,
  installment_id,
  provider,
  provider_transaction_id,
  provider_reference,
  payment_method,
  amount,
  currency,
  status,
  gateway_fee,
  failure_reason,
  idempotency_key,
  provider_payload,
  paid_at,
  verified_at,
  created_at,
  updated_at
`;

function createSecureToken(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID().replace(/-/g, "");
  }

  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

export async function createPaymentLink(
  input: CreatePaymentLinkInput
): Promise<InvoicePaymentLink> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error(
      "You must be logged in to create a payment link."
    );
  }

  if (
    input.link_type === "fixed_amount" &&
    (!input.amount || input.amount <= 0)
  ) {
    throw new Error(
      "A fixed payment link requires an amount greater than zero."
    );
  }

  if (
    input.link_type === "customer_entered" &&
    input.minimum_amount != null &&
    input.maximum_amount != null &&
    input.minimum_amount > input.maximum_amount
  ) {
    throw new Error(
      "Minimum payment amount cannot exceed maximum payment amount."
    );
  }

  const { data, error } =
    await supabase
      .from("invoice_payment_link")
      .insert({
        company_id: input.company_id,
        branch_id: input.branch_id,
        invoice_id: input.invoice_id,
        customer_id: input.customer_id,

        payment_plan_id:
          input.payment_plan_id ?? null,

        installment_id:
          input.installment_id ?? null,

        link_type: input.link_type,

        token: createSecureToken(),

        amount:
          input.amount ?? null,

        minimum_amount:
          input.minimum_amount ?? null,

        maximum_amount:
          input.maximum_amount ?? null,

        currency:
          input.currency ?? "ZAR",

        status: "active",

        expires_at:
          input.expires_at ?? null,

        created_by:
          user.id,
      })
      .select(paymentLinkColumns)
      .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as InvoicePaymentLink;
}

export async function getInvoicePaymentLinks(
  invoiceId: string,
  companyId: string
): Promise<InvoicePaymentLink[]> {
  const { data, error } =
    await supabase
      .from("invoice_payment_link")
      .select(paymentLinkColumns)
      .eq("invoice_id", invoiceId)
      .eq("company_id", companyId)
      .order("created_at", {
        ascending: false,
      });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as InvoicePaymentLink[];
}

export async function getPaymentLinkByToken(
  token: string
): Promise<InvoicePaymentLink | null> {
  const { data, error } =
    await supabase
      .from("invoice_payment_link")
      .select(paymentLinkColumns)
      .eq("token", token)
      .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as InvoicePaymentLink | null;
}

export async function cancelPaymentLink(
  paymentLinkId: string,
  companyId: string
): Promise<void> {
  const { error } =
    await supabase
      .from("invoice_payment_link")
      .update({
        status: "cancelled",
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", paymentLinkId)
      .eq("company_id", companyId)
      .eq("status", "active");

  if (error) {
    throw new Error(error.message);
  }
}

export async function getInvoiceGatewayTransactions(
  invoiceId: string,
  companyId: string
): Promise<PaymentGatewayTransaction[]> {
  const { data, error } =
    await supabase
      .from("payment_gateway_transaction")
      .select(gatewayTransactionColumns)
      .eq("invoice_id", invoiceId)
      .eq("company_id", companyId)
      .order("created_at", {
        ascending: false,
      });

  if (error) {
    throw new Error(error.message);
  }

  return (
    data ?? []
  ) as PaymentGatewayTransaction[];
}
