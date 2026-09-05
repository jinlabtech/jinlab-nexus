"use client";

import JinlabSignatureInvoice from "@/components/invoice-templates/JinlabSignatureInvoice";

import type {
  Invoice,
  InvoiceItem,
} from "@/lib/services/invoiceService";

import type {
  InvoicePayment,
} from "@/lib/services/paymentService";

import type {
  InvoicePaymentPlan,
} from "@/lib/services/paymentPlanService";

export type InvoiceTemplate =
  | "jinlab-signature"
  | "executive"
  | "minimal"
  | "retail"
  | "corporate";

type CompanyInfo = {
  company_name: string;
  registration_number?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  logo_url?: string | null;
  document_display_name?: string | null;
};

type CustomerInfo = {
  customer_name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

type BranchInfo = {
  branch_name: string;
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
}: Props) {
  switch (template) {
    case "jinlab-signature":
    default:
      return (
        <JinlabSignatureInvoice
          invoice={invoice}
          items={items}
          company={company}
          customer={customer}
          branch={branch}
          payments={payments}
          paymentPlan={paymentPlan}
        />
      );
  }
}
