import { supabase } from "@/lib/supabase";

export type PaymentMethod =
  | "cash"
  | "eft"
  | "card"
  | "other";

export type InvoicePayment = {
  id: string;
  company_id: string;
  branch_id: string;
  invoice_id: string;
  customer_id: string;
  payment_date: string;
  payment_method: PaymentMethod;
  reference: string | null;
  amount: number;
  notes: string | null;
  received_by: string | null;
  created_at: string;
};

export type PaymentFormData = {
  payment_date: string;
  payment_method: PaymentMethod;
  reference: string;
  amount: number;
  notes: string;
};

const paymentColumns =
  "id, company_id, branch_id, invoice_id, customer_id, payment_date, payment_method, reference, amount, notes, received_by, created_at";

export async function getInvoicePayments(
  invoiceId: string,
  companyId: string
): Promise<InvoicePayment[]> {
  const { data, error } =
    await supabase
      .from("invoice_payment")
      .select(paymentColumns)
      .eq("invoice_id", invoiceId)
      .eq("company_id", companyId)
      .order("payment_date", {
        ascending: false,
      })
      .order("created_at", {
        ascending: false,
      });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as InvoicePayment[];
}

export async function recordInvoicePayment(
  invoiceId: string,
  companyId: string,
  branchId: string,
  customerId: string,
  formData: PaymentFormData
): Promise<InvoicePayment> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error(
      "You must be logged in to record a payment."
    );
  }

  const { data, error } =
    await supabase
      .from("invoice_payment")
      .insert({
        company_id: companyId,
        branch_id: branchId,
        invoice_id: invoiceId,
        customer_id: customerId,
        payment_date:
          formData.payment_date,
        payment_method:
          formData.payment_method,
        reference:
          formData.reference.trim() ||
          null,
        amount:
          formData.amount,
        notes:
          formData.notes.trim() ||
          null,
        received_by:
          user.id,
      })
      .select(paymentColumns)
      .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as InvoicePayment;
}
