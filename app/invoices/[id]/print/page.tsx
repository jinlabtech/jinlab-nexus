"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
  useRouter,
  useSearchParams,
} from "next/navigation";

import { supabase } from "@/lib/supabase";

import {
  getDocumentLogoUrl,
} from "@/lib/services/settingsService";

import {
  getInvoice,
} from "@/lib/services/invoiceService";

import type {
  Invoice,
  InvoiceItem,
} from "@/lib/services/invoiceService";

import {
  getInvoicePayments,
} from "@/lib/services/paymentService";

import type {
  InvoicePayment,
} from "@/lib/services/paymentService";

import {
  getInvoicePaymentPlan,
} from "@/lib/services/paymentPlanService";

import type {
  InvoicePaymentPlan,
} from "@/lib/services/paymentPlanService";

import InvoiceTemplateRenderer from "@/components/invoice-templates/InvoiceTemplateRenderer";

import type {
  InvoiceTemplate,
} from "@/components/invoice-templates/InvoiceTemplateRenderer";

import { Button } from "@/components/ui/button";

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

const allowedTemplates: InvoiceTemplate[] = [
  "jinlab-signature",
  "executive",
  "minimal",
  "retail",
  "corporate",
];

export default function InvoicePrintPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams =
    useSearchParams();

  const invoiceId =
    params.id as string;

  const requestedTemplate =
    searchParams.get(
      "template"
    ) as InvoiceTemplate | null;

  const template:
    InvoiceTemplate =
      requestedTemplate &&
      allowedTemplates.includes(
        requestedTemplate
      )
        ? requestedTemplate
        : "jinlab-signature";

  const [
    invoice,
    setInvoice,
  ] =
    useState<Invoice | null>(
      null
    );

  const [
    items,
    setItems,
  ] =
    useState<InvoiceItem[]>(
      []
    );

  const [
    payments,
    setPayments,
  ] =
    useState<InvoicePayment[]>(
      []
    );

  const [
    paymentPlan,
    setPaymentPlan,
  ] =
    useState<InvoicePaymentPlan | null>(
      null
    );

  const [
    company,
    setCompany,
  ] =
    useState<CompanyInfo | null>(
      null
    );

  const [
    customer,
    setCustomer,
  ] =
    useState<CustomerInfo | null>(
      null
    );

  const [
    branch,
    setBranch,
  ] =
    useState<BranchInfo | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setErrorMessage("");

        const {
          data: {
            user,
          },
        } =
          await supabase.auth.getUser();

        if (!user) {
          router.push(
            "/login"
          );
          return;
        }

        const {
          data: profile,
          error:
            profileError,
        } =
          await supabase
            .from(
              "user_profile"
            )
            .select(
              "company_id"
            )
            .eq(
              "user_id",
              user.id
            )
            .single();

        if (
          profileError ||
          !profile?.company_id
        ) {
          throw new Error(
            "Company profile could not be loaded."
          );
        }

        const companyId =
          profile.company_id;

        const result =
          await getInvoice(
            invoiceId,
            companyId
          );

        setInvoice(
          result.invoice
        );

        setItems(
          result.items
        );

        const invoicePayments =
          await getInvoicePayments(
            invoiceId,
            companyId
          );

        setPayments(
          invoicePayments
        );

        const invoicePaymentPlan =
          await getInvoicePaymentPlan(
            invoiceId,
            companyId
          );

        setPaymentPlan(
          invoicePaymentPlan
        );

        const [
          companyResult,
          customerResult,
          branchResult,
          documentSettingsResult,
        ] =
          await Promise.all([
            supabase
              .from(
                "company"
              )
              .select("*")
              .eq(
                "id",
                companyId
              )
              .single(),

            supabase
              .from(
                "customer"
              )
              .select("*")
              .eq(
                "id",
                result.invoice
                  .customer_id
              )
              .eq(
                "company_id",
                companyId
              )
              .single(),

            supabase
              .from(
                "branch"
              )
              .select("*")
              .eq(
                "id",
                result.invoice
                  .branch_id
              )
              .eq(
                "company_id",
                companyId
              )
              .single(),

            supabase
              .from("company_document_settings")
              .select(
                "logo_path, document_display_name"
              )
              .eq(
                "company_id",
                companyId
              )
              .single(),
          ]);

        if (
          companyResult.error
        ) {
          throw new Error(
            companyResult
              .error.message
          );
        }

        if (
          customerResult.error
        ) {
          throw new Error(
            customerResult
              .error.message
          );
        }

        const logoUrl =
          await getDocumentLogoUrl(
            documentSettingsResult.data?.logo_path ??
              null
          );

        setCompany({
          ...(companyResult.data as CompanyInfo),
          logo_url: logoUrl,
          document_display_name:
            documentSettingsResult.data
              ?.document_display_name ??
            companyResult.data.company_name,
        });

        setCustomer(
          customerResult.data as CustomerInfo
        );

        if (
          !branchResult.error
        ) {
          setBranch(
            branchResult.data as BranchInfo
          );
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Invoice could not be loaded."
        );
      } finally {
        setLoading(false);
      }
    }

    if (invoiceId) {
      load();
    }
  }, [
    invoiceId,
    router,
  ]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-sm text-gray-600">
          Preparing invoice...
        </p>
      </main>
    );
  }

  if (
    errorMessage ||
    !invoice ||
    !company ||
    !customer
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
        <div className="max-w-lg rounded-xl border bg-white p-6 text-center">
          <h1 className="text-xl font-bold">
            Invoice unavailable
          </h1>

          <p className="mt-3 text-sm text-red-600">
            {errorMessage ||
              "Invoice information is incomplete."}
          </p>

          <Button
            type="button"
            variant="outline"
            className="mt-5"
            onClick={() =>
              router.back()
            }
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
            <p className="font-semibold">
              {
                invoice.invoice_number
              }
            </p>

            <p className="text-xs text-muted-foreground">
              JINLAB Nexus Invoice Preview
            </p>
          </div>

          <div className="flex flex-wrap gap-2">

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                router.push(
                  `/invoices/${invoice.id}`
                )
              }
            >
              Back to Invoice
            </Button>

            <Button
              type="button"
              onClick={() =>
                window.print()
              }
            >
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
        />
      </div>

    </main>
  );
}
