"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { supabase } from "@/lib/supabase";

import { getDocumentLogoUrl } from "@/lib/services/settingsService";
import { getInvoice } from "@/lib/services/invoiceService";
import type { Invoice, InvoiceItem } from "@/lib/services/invoiceService";
import { getInvoicePayments } from "@/lib/services/paymentService";
import type { InvoicePayment } from "@/lib/services/paymentService";
import { getInvoicePaymentPlan } from "@/lib/services/paymentPlanService";
import type { InvoicePaymentPlan } from "@/lib/services/paymentPlanService";

import InvoiceTemplateRenderer from "@/components/invoice-templates/InvoiceTemplateRenderer";
import type {
  BankAccountInfo,
  CompanyInfo,
  CustomerInfo,
  InvoiceTemplate,
} from "@/components/invoice-templates/InvoiceTemplateRenderer";

import { Button } from "@/components/ui/button";

type BranchInfo = {
  branch_name: string;
};

type CompanyRow = {
  company_name: string;
  registration_number: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  physical_address: string | null;
  website: string | null;
};

type CompanyProfileRow = {
  legal_name: string | null;
  trading_name: string | null;
  registration_number: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  physical_address: string | null;
  postal_address: string | null;
  city: string | null;
  province: string | null;
  country_code: string | null;
};

type DocumentSettingsRow = {
  logo_path: string | null;
  document_display_name: string | null;
  show_registration_number: boolean;
  show_vat_number: boolean;
  show_company_address: boolean;
  show_company_phone: boolean;
  show_company_email: boolean;
  show_company_website: boolean;
  document_footer: string | null;
  invoice_footer: string | null;
};

type FinanceSettingsRow = {
  vat_registered: boolean;
  vat_number: string | null;
};

type CustomerRow = {
  customer_name: string;
  email: string | null;
  phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
};

const allowedTemplates: InvoiceTemplate[] = [
  "jinlab-signature",
  "executive",
  "minimal",
  "retail",
  "corporate",
];

function joinAddress(values: Array<string | null | undefined>) {
  const clean = values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return clean.length > 0 ? clean.join("\n") : null;
}

function derivePaymentTerms(invoice: Invoice) {
  if (!invoice.due_date || invoice.due_date === invoice.invoice_date) {
    return "Due on Receipt";
  }

  const start = new Date(`${invoice.invoice_date}T00:00:00`);
  const end = new Date(`${invoice.due_date}T00:00:00`);

  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);

  if (days === 15) return "Net 15";
  if (days === 30) return "Net 30";
  if (days === 45) return "Net 45";
  if (days > 0) return `${days} days`;

  return "Custom";
}

export default function InvoicePrintPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const invoiceId = params.id as string;

  const requestedTemplate = searchParams.get("template") as InvoiceTemplate | null;

  const template: InvoiceTemplate =
    requestedTemplate && allowedTemplates.includes(requestedTemplate)
      ? requestedTemplate
      : "jinlab-signature";

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [paymentPlan, setPaymentPlan] = useState<InvoicePaymentPlan | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [branch, setBranch] = useState<BranchInfo | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccountInfo[]>([]);
  const [paymentTermsLabel, setPaymentTermsLabel] = useState("");
  const [documentWarning, setDocumentWarning] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setErrorMessage("");
        setDocumentWarning("");

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push("/login");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("user_profile")
          .select("company_id")
          .eq("user_id", user.id)
          .single();

        if (profileError || !profile?.company_id) {
          throw new Error("Company profile could not be loaded.");
        }

        const companyId = profile.company_id;

        const result = await getInvoice(invoiceId, companyId);

        setInvoice(result.invoice);
        setItems(result.items);

        const [invoicePayments, invoicePaymentPlan] = await Promise.all([
          getInvoicePayments(invoiceId, companyId),
          getInvoicePaymentPlan(invoiceId, companyId),
        ]);

        setPayments(invoicePayments);
        setPaymentPlan(invoicePaymentPlan);

        const [
          companyResult,
          profileSettingsResult,
          customerResult,
          branchResult,
          documentSettingsResult,
          financeSettingsResult,
          bankResult,
          migrationResult,
        ] = await Promise.all([
          supabase
            .from("company")
            .select(
              "company_name, registration_number, email, phone, address, physical_address, website"
            )
            .eq("id", companyId)
            .single(),

          supabase
            .from("company_profile_settings")
            .select(
              "legal_name, trading_name, registration_number, email, phone, website, physical_address, postal_address, city, province, country_code"
            )
            .eq("company_id", companyId)
            .maybeSingle(),

          supabase
            .from("customer")
            .select(
              "customer_name, email, phone, address_line_1, address_line_2, city, province, postal_code, country"
            )
            .eq("id", result.invoice.customer_id)
            .eq("company_id", companyId)
            .single(),

          supabase
            .from("branch")
            .select("branch_name")
            .eq("id", result.invoice.branch_id)
            .eq("company_id", companyId)
            .maybeSingle(),

          supabase
            .from("company_document_settings")
            .select(
              "logo_path, document_display_name, show_registration_number, show_vat_number, show_company_address, show_company_phone, show_company_email, show_company_website, document_footer, invoice_footer"
            )
            .eq("company_id", companyId)
            .maybeSingle(),

          supabase
            .from("company_finance_settings")
            .select("vat_registered, vat_number")
            .eq("company_id", companyId)
            .maybeSingle(),

          supabase
            .from("company_bank_account")
            .select(
              "bank_name, account_name, account_number, account_type, branch_code, swift_code, currency, is_default"
            )
            .eq("company_id", companyId)
            .eq("is_active", true)
            .eq("show_on_documents", true)
            .order("is_default", { ascending: false })
            .order("bank_name", { ascending: true }),

          supabase
            .from("external_migration_reference")
            .select("metadata")
            .eq("company_id", companyId)
            .eq("source_system", "zoho_invoice")
            .eq("entity_type", "invoice")
            .eq("nexus_id", result.invoice.id)
            .maybeSingle(),
        ]);

        if (companyResult.error) {
          throw new Error(companyResult.error.message);
        }

        if (customerResult.error) {
          throw new Error(customerResult.error.message);
        }

        const legacyCompany = companyResult.data as CompanyRow;
        const companyProfile = profileSettingsResult.data as CompanyProfileRow | null;
        const documentSettings =
          documentSettingsResult.data as DocumentSettingsRow | null;
        const financeSettings = financeSettingsResult.data as FinanceSettingsRow | null;
        const customerRow = customerResult.data as CustomerRow;

        const logoUrl = await getDocumentLogoUrl(documentSettings?.logo_path ?? null);

        // Company Profile Settings is the canonical document source. This avoids
        // leaking old/test values from the legacy company row when the new profile
        // exists but has not yet been completed.
        const profileExists = Boolean(companyProfile);

        const displayName =
          documentSettings?.document_display_name?.trim() ||
          companyProfile?.trading_name?.trim() ||
          companyProfile?.legal_name?.trim() ||
          legacyCompany.company_name;

        const companyAddress = profileExists
          ? joinAddress([
              companyProfile?.physical_address,
              companyProfile?.city,
              companyProfile?.province,
            ])
          : joinAddress([legacyCompany.physical_address, legacyCompany.address]);

        const companyInfo: CompanyInfo = {
          company_name: legacyCompany.company_name,
          document_display_name: displayName,
          registration_number: profileExists
            ? companyProfile?.registration_number ?? null
            : legacyCompany.registration_number,
          vat_number: financeSettings?.vat_registered
            ? financeSettings.vat_number
            : null,
          email: profileExists
            ? companyProfile?.email ?? null
            : legacyCompany.email,
          phone: profileExists
            ? companyProfile?.phone ?? null
            : legacyCompany.phone,
          website: profileExists
            ? companyProfile?.website ?? null
            : legacyCompany.website,
          address: companyAddress,
          logo_url: logoUrl,
          show_registration_number:
            documentSettings?.show_registration_number ?? true,
          show_vat_number: documentSettings?.show_vat_number ?? true,
          show_company_address: documentSettings?.show_company_address ?? true,
          show_company_phone: documentSettings?.show_company_phone ?? true,
          show_company_email: documentSettings?.show_company_email ?? true,
          show_company_website: documentSettings?.show_company_website ?? false,
          document_footer: documentSettings?.document_footer ?? null,
          invoice_footer: documentSettings?.invoice_footer ?? null,
        };

        setCompany(companyInfo);

        setCustomer({
          customer_name: customerRow.customer_name,
          email: customerRow.email,
          phone: customerRow.phone,
          address: joinAddress([
            customerRow.address_line_1,
            customerRow.address_line_2,
            customerRow.city,
            customerRow.province,
            customerRow.postal_code,
            customerRow.country,
          ]),
        });

        setBranch(branchResult.data as BranchInfo | null);
        setBankAccounts((bankResult.data ?? []) as BankAccountInfo[]);

        const migrationMetadata = migrationResult.data?.metadata as
          | Record<string, unknown>
          | null
          | undefined;

        const migratedTerms =
          typeof migrationMetadata?.payment_terms_label === "string"
            ? migrationMetadata.payment_terms_label
            : "";

        setPaymentTermsLabel(
          migratedTerms || derivePaymentTerms(result.invoice)
        );

        const missingProfileBits = [
          !companyInfo.address ? "address" : null,
          !companyInfo.email ? "email" : null,
          !companyInfo.phone ? "phone" : null,
        ].filter(Boolean);

        if (missingProfileBits.length > 0) {
          setDocumentWarning(
            `Company document profile is incomplete (${missingProfileBits.join(
              ", "
            )}). Update Settings → Company Profile before issuing new customer documents.`
          );
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Invoice could not be loaded."
        );
      } finally {
        setLoading(false);
      }
    }

    if (invoiceId) {
      void load();
    }
  }, [invoiceId, router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-sm text-gray-600">Preparing invoice...</p>
      </main>
    );
  }

  if (errorMessage || !invoice || !company || !customer) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
        <div className="max-w-lg rounded-xl border bg-white p-6 text-center">
          <h1 className="text-xl font-bold">Invoice unavailable</h1>

          <p className="mt-3 text-sm text-red-600">
            {errorMessage || "Invoice information is incomplete."}
          </p>

          <Button
            type="button"
            variant="outline"
            className="mt-5"
            onClick={() => router.back()}
          >
            Go Back
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-100 print:bg-white">
      <div className="sticky top-0 z-50 border-b bg-white/95 px-6 py-3 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">{invoice.invoice_number}</p>

            <p className="text-xs text-muted-foreground">
              JINLAB Nexus · A4 Invoice Preview
            </p>

            {documentWarning && (
              <p className="mt-1 max-w-2xl text-xs text-amber-700">
                {documentWarning}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/invoices/${invoice.id}`)}
            >
              Back to Invoice
            </Button>

            <Button type="button" onClick={() => window.print()}>
              Print / Save PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="py-8 print:py-0">
        <InvoiceTemplateRenderer
          template={template}
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
      </div>
    </main>
  );
}
