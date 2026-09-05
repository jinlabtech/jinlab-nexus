"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import { supabase } from "@/lib/supabase";

import {
  getQuotation,
} from "@/lib/services/quotationService";

import {
  getDocumentLogoUrl,
} from "@/lib/services/settingsService";

import type {
  Quotation,
  QuotationItem,
} from "@/types/quotation";

import JinlabSignatureQuotation from "@/components/quotation-templates/JinlabSignatureQuotation";

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

export default function QuotationPrintPage() {
  const params = useParams();
  const router = useRouter();

  const quotationId =
    String(params.id);

  const [
    quotation,
    setQuotation,
  ] =
    useState<Quotation | null>(
      null
    );

  const [
    items,
    setItems,
  ] =
    useState<QuotationItem[]>(
      []
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
  ] = useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setErrorMessage("");

        const {
          data: { user },
        } =
          await supabase.auth.getUser();

        if (!user) {
          router.push("/login");
          return;
        }

        const {
          data: profile,
          error: profileError,
        } = await supabase
          .from("user_profile")
          .select("company_id")
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
          await getQuotation(
            quotationId,
            companyId
          );

        setQuotation(
          result.quotation
        );

        setItems(
          result.items
        );

        const [
          companyResult,
          customerResult,
          branchResult,
          documentSettingsResult,
        ] =
          await Promise.all([
            supabase
              .from("company")
              .select("*")
              .eq(
                "id",
                companyId
              )
              .single(),

            supabase
              .from("customer")
              .select("*")
              .eq(
                "id",
                result.quotation
                  .customer_id
              )
              .eq(
                "company_id",
                companyId
              )
              .single(),

            supabase
              .from("branch")
              .select("*")
              .eq(
                "id",
                result.quotation
                  .branch_id
              )
              .eq(
                "company_id",
                companyId
              )
              .single(),

            supabase
              .from(
                "company_document_settings"
              )
              .select(
                "logo_path, document_display_name"
              )
              .eq(
                "company_id",
                companyId
              )
              .maybeSingle(),
          ]);

        if (
          companyResult.error
        ) {
          throw new Error(
            companyResult.error.message
          );
        }

        if (
          customerResult.error
        ) {
          throw new Error(
            customerResult.error.message
          );
        }

        const logoUrl =
          await getDocumentLogoUrl(
            documentSettingsResult
              .data?.logo_path ??
              null
          );

        setCompany({
          ...(companyResult.data as CompanyInfo),

          logo_url:
            logoUrl,

          document_display_name:
            documentSettingsResult
              .data
              ?.document_display_name ??
            companyResult.data
              .company_name,
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
            : "Quotation could not be loaded."
        );
      } finally {
        setLoading(false);
      }
    }

    if (quotationId) {
      load();
    }
  }, [
    quotationId,
    router,
  ]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-sm text-gray-600">
          Preparing quotation...
        </p>
      </main>
    );
  }

  if (
    errorMessage ||
    !quotation ||
    !company ||
    !customer
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
        <div className="max-w-lg rounded-xl border bg-white p-6 text-center">
          <h1 className="text-xl font-bold">
            Quotation unavailable
          </h1>

          <p className="mt-3 text-sm text-red-600">
            {errorMessage ||
              "Quotation information is incomplete."}
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
                quotation.quotation_number
              }
            </p>

            <p className="text-xs text-muted-foreground">
              JINLAB Nexus Quotation Preview
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                router.push(
                  `/quotations/${quotation.id}`
                )
              }
            >
              Back to Quotation
            </Button>

            <Button
              type="button"
              onClick={() =>
                window.print()
              }
              className="bg-black text-white hover:bg-black/85"
            >
              Print / Save PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="py-8 print:py-0">
        <JinlabSignatureQuotation
          quotation={quotation}
          items={items}
          company={company}
          customer={customer}
          branch={branch}
        />
      </div>
    </main>
  );
}
