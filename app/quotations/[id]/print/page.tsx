"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import QuotationPrintDocument from "@/components/QuotationPrintDocument";
import { Button } from "@/components/ui/button";

import { getQuotation } from "@/lib/services/quotationService";
import { supabase } from "@/lib/supabase";

import type { Customer } from "@/types/customer";
import type {
  Quotation,
  QuotationItem,
} from "@/types/quotation";

type CompanyInfo = {
  company_name: string;
  registration_number: string | null;
  email: string | null;
  phone: string | null;
};

type BranchInfo = {
  branch_name: string;
};

export default function QuotationPrintPage() {
  const router = useRouter();
  const params = useParams();

  const quotationId =
    String(params.id);

  const [
    quotation,
    setQuotation,
  ] =
    useState<Quotation | null>(null);

  const [
    items,
    setItems,
  ] =
    useState<QuotationItem[]>([]);

  const [
    customer,
    setCustomer,
  ] =
    useState<Customer | null>(null);

  const [
    company,
    setCompany,
  ] =
    useState<CompanyInfo | null>(null);

  const [
    branch,
    setBranch,
  ] =
    useState<BranchInfo | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  useEffect(() => {
    async function loadDocument() {
      setLoading(true);
      setErrorMessage("");

      try {
        const {
          data: { user },
          error: userError,
        } =
          await supabase.auth.getUser();

        if (
          userError ||
          !user
        ) {
          router.replace(
            "/login"
          );
          return;
        }

        const {
          data: profile,
          error: profileError,
        } = await supabase
          .from("user_profile")
          .select("company_id")
          .eq("user_id", user.id)
          .single();

        if (
          profileError ||
          !profile?.company_id
        ) {
          throw new Error(
            profileError?.message ??
              "Company could not be identified."
          );
        }

        const result =
          await getQuotation(
            quotationId,
            profile.company_id
          );

        setQuotation(
          result.quotation
        );

        setItems(
          result.items
        );

        const [
          customerResult,
          companyResult,
          branchResult,
        ] =
          await Promise.all([
            supabase
              .from("customer")
              .select("*")
              .eq(
                "id",
                result.quotation.customer_id
              )
              .eq(
                "company_id",
                profile.company_id
              )
              .single(),

            supabase
              .from("company")
              .select(
                "company_name, registration_number, email, phone"
              )
              .eq(
                "id",
                profile.company_id
              )
              .single(),

            supabase
              .from("branch")
              .select(
                "branch_name"
              )
              .eq(
                "id",
                result.quotation.branch_id
              )
              .single(),
          ]);

        if (customerResult.error) {
          throw new Error(
            customerResult.error.message
          );
        }

        if (companyResult.error) {
          throw new Error(
            companyResult.error.message
          );
        }

        if (branchResult.error) {
          throw new Error(
            branchResult.error.message
          );
        }

        setCustomer(
          customerResult.data
        );

        setCompany(
          companyResult.data
        );

        setBranch(
          branchResult.data
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Quotation document could not be loaded."
        );
      } finally {
        setLoading(false);
      }
    }

    loadDocument();
  }, [
    quotationId,
    router,
  ]);

  if (loading) {
    return (
      <main className="p-10 text-center">
        Loading quotation...
      </main>
    );
  }

  if (
    errorMessage ||
    !quotation ||
    !customer ||
    !company
  ) {
    return (
      <main className="p-10">
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-700">
          {errorMessage ||
            "Quotation could not be loaded."}
        </div>
      </main>
    );
  }

  return (
    <>
      <style jsx global>{`
        @page {
          size: A4;
          margin: 12mm;
        }

        @media print {
          body {
            background: white !important;
          }

          .no-print {
            display: none !important;
          }

          .quotation-page {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: none !important;
          }
        }
      `}</style>

      <div className="no-print sticky top-0 z-50 flex items-center justify-between border-b bg-background p-4">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            router.push(
              `/quotations/${quotation.id}`
            )
          }
        >
          ← Back to Quotation
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

      <main className="min-h-screen bg-muted/30 p-4 sm:p-8 print:bg-white print:p-0">
        <QuotationPrintDocument
          quotation={quotation}
          items={items}
          customer={customer}
          company={company}
          branch={branch}
        />
      </main>
    </>
  );
}
