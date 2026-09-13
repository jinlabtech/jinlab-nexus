"use client";

import JinlabA4Invoice from "@/components/invoice-templates/JinlabA4Invoice";

import type { Invoice, InvoiceItem } from "@/lib/services/invoiceService";
import type { InvoicePayment } from "@/lib/services/paymentService";
import type { InvoicePaymentPlan } from "@/lib/services/paymentPlanService";

export type InvoiceTemplate =
  | "jinlab-signature"
  | "executive"
  | "minimal"
  | "retail"
  | "corporate";

export type CompanyInfo = {
  company_name: string;
  registration_number?: string | null;
  vat_number?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  website?: string | null;
  logo_url?: string | null;
  document_display_name?: string | null;
  show_registration_number?: boolean;
  show_vat_number?: boolean;
  show_company_address?: boolean;
  show_company_phone?: boolean;
  show_company_email?: boolean;
  show_company_website?: boolean;
  document_footer?: string | null;
  invoice_footer?: string | null;
};

export type CustomerInfo = {
  customer_name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

export type BranchInfo = {
  branch_name: string;
};

export type BankAccountInfo = {
  bank_name: string;
  account_name: string;
  account_number: string;
  account_type?: string | null;
  branch_code?: string | null;
  swift_code?: string | null;
  currency: string;
  is_default: boolean;
};

type Props = {
  template?: InvoiceTemplate;
  invoice: Invoice;
  items: InvoiceItem[];
  company: CompanyInfo;
  customer: CustomerInfo;
  branch: BranchInfo | null;
  payments?: InvoicePayment[];
  paymentPlan?: InvoicePaymentPlan | null;
  bankAccounts?: BankAccountInfo[];
  paymentTermsLabel?: string;
};

export default function InvoiceTemplateRenderer({
  template = "jinlab-signature",
  invoice,
  items,
  company,
  customer,
  branch,
  payments = [],
  paymentPlan = null,
  bankAccounts = [],
  paymentTermsLabel = "",
}: Props) {
  // Future template ids remain accepted so saved company settings keep working.
  // Until each layout is implemented, they intentionally render through the
  // production-safe JINLAB A4 document rather than silently producing a
  // different or broken invoice.
  switch (template) {
    case "jinlab-signature":
    case "executive":
    case "minimal":
    case "retail":
    case "corporate":
    default:
      return (
        <JinlabA4Invoice
          invoice={invoice}
          items={items}
          company={company}
          customer={customer}
          branch={branch}
          payments={payments}
          paymentPlan={paymentPlan}
          bankAccounts={bankAccounts}
          paymentTermsLabel={paymentTermsLabel}
        />
      );
  }
}
