"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import Link from "next/link";

import {
  useParams,
  useRouter,
} from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import InvoicePaymentForm from "@/components/InvoicePaymentForm";
import InvoicePaymentPlanForm from "@/components/InvoicePaymentPlanForm";
import InvoiceLivePreview from "@/components/InvoiceLivePreview";
import InvoiceTemplateSelector from "@/components/InvoiceTemplateSelector";
import { Button } from "@/components/ui/button";

import {
  getInvoice,
  updateInvoiceDetails,
  updateInvoiceItemFinancials,
  getInvoiceChangeLog,
  updateInvoiceStatus,
  type UpdateInvoiceDetailsInput,
  type UpdateInvoiceItemFinancialsInput,
  type InvoiceChangeLog,
} from "@/lib/services/invoiceService";

import {
  getInvoicePayments,
  recordInvoicePayment,
} from "@/lib/services/paymentService";

import {
  cancelPaymentLink,
  createPaymentLink,
  getInvoicePaymentLinks,
  type InvoicePaymentLink,
  type PaymentLinkType,
} from "@/lib/services/paymentGatewayService";

import type {
  InvoicePayment,
  PaymentFormData,
} from "@/lib/services/paymentService";

import {
  createPaymentPlan,
  getInvoicePaymentPlan,
  getPaymentPlanInstallments,
  calculatePaymentPlanProgress,
  type InvoicePaymentPlan,
  type PaymentPlanInstallment,
  type PaymentFrequency,
  type PaymentPlanType,
} from "@/lib/services/paymentPlanService";

import {
  getDocumentLogoUrl,
} from "@/lib/services/settingsService";

import { supabase } from "@/lib/supabase";

import type {
  Invoice,
  InvoiceItem,
} from "@/lib/services/invoiceService";

import type {
  Customer,
} from "@/types/customer";

type BranchInfo = {
  id: string;
  branch_name: string;
};

function formatCurrency(
  value: number
) {
  return new Intl.NumberFormat(
    "en-ZA",
    {
      style: "currency",
      currency: "ZAR",
    }
  ).format(value);
}

function formatStatus(
  value: string
) {
  return value
    .split("_")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(" ");
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();

  const invoiceId =
    String(params.id);

  const [
    companyId,
    setCompanyId,
  ] =
    useState<string | null>(
      null
    );

  const [
    companyName,
    setCompanyName,
  ] = useState("JINLAB");

  const [
    companyLogoUrl,
    setCompanyLogoUrl,
  ] =
    useState<string | null>(
      null
    );

  const [
    userName,
    setUserName,
  ] = useState(
    "JINLAB Admin"
  );

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
    customer,
    setCustomer,
  ] =
    useState<Customer | null>(
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
    actionLoading,
    setActionLoading,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    showPaymentForm,
    setShowPaymentForm,
  ] = useState(false);

  const [
    payments,
    setPayments,
  ] = useState<InvoicePayment[]>([]);

  const [
    showPaymentPlanForm,
    setShowPaymentPlanForm,
  ] = useState(false);

  const [
    paymentPlan,
    setPaymentPlan,
  ] =
    useState<InvoicePaymentPlan | null>(
      null
    );

  const [
    planInstallments,
    setPlanInstallments,
  ] =
    useState<PaymentPlanInstallment[]>(
      []
    );

  const [showPaymentLinkForm, setShowPaymentLinkForm] =
    useState(false);

  const [paymentLinks, setPaymentLinks] =
    useState<InvoicePaymentLink[]>([]);

  const [paymentLinkType, setPaymentLinkType] =
    useState<PaymentLinkType>("full_balance");

  const [paymentLinkAmount, setPaymentLinkAmount] =
    useState("");

  const [paymentLinkExpiry, setPaymentLinkExpiry] =
    useState("7");

  const planProgress =
    calculatePaymentPlanProgress(
      planInstallments
    );

  const planCompleted =
    Boolean(paymentPlan) &&
    Number(invoice?.balance_due ?? 0) <= 0;

  const planDisplayStatus =
    planCompleted
      ? "Completed"
      : paymentPlan
        ? formatStatus(
            paymentPlan.status
          )
        : "";

  async function handleCancelPaymentLink(
    paymentLinkId: string
  ) {
    if (!companyId || !invoice) {
      return;
    }

    const confirmed = window.confirm(
      "Cancel this payment link?"
    );

    if (!confirmed) {
      return;
    }

    try {
      setActionLoading(true);

      await cancelPaymentLink(
        paymentLinkId,
        companyId
      );

      const refreshedLinks =
        await getInvoicePaymentLinks(
          invoice.id,
          companyId
        );

      setPaymentLinks(refreshedLinks);
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unable to cancel payment link."
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function savePaymentLink() {
    if (!invoice || !companyId) {
      return;
    }

    try {
      setActionLoading(true);

      let amount: number | null = null;

      if (paymentLinkType === "fixed_amount") {
        amount = Number(paymentLinkAmount);

        if (
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          throw new Error(
            "Enter a valid payment amount."
          );
        }

        if (
          amount >
          Number(invoice.balance_due)
        ) {
          throw new Error(
            "Payment link amount cannot exceed the outstanding balance."
          );
        }
      }

      if (
        paymentLinkType ===
          "next_installment" &&
        !planProgress.next_installment
      ) {
        throw new Error(
          "There is no outstanding instalment."
        );
      }

      const expiryDays =
        paymentLinkExpiry === "none"
          ? null
          : Number(paymentLinkExpiry);

      const expiresAt =
        expiryDays === null
          ? null
          : new Date(
              Date.now() +
                expiryDays *
                  24 *
                  60 *
                  60 *
                  1000
            ).toISOString();

      const linkAmount =
        paymentLinkType ===
        "full_balance"
          ? Number(
              invoice.balance_due
            )
          : paymentLinkType ===
              "next_installment"
            ? planProgress.next_amount_due
            : paymentLinkType ===
                "fixed_amount"
              ? amount
              : null;

      await createPaymentLink({
        company_id:
          companyId,

        branch_id:
          invoice.branch_id,

        invoice_id:
          invoice.id,

        customer_id:
          invoice.customer_id,

        payment_plan_id:
          paymentPlan?.id ?? null,

        installment_id:
          paymentLinkType ===
          "next_installment"
            ? planProgress
                .next_installment
                ?.id ?? null
            : null,

        link_type:
          paymentLinkType,

        amount:
          linkAmount,

        maximum_amount:
          paymentLinkType ===
          "customer_entered"
            ? Number(
                invoice.balance_due
              )
            : null,

        currency: "ZAR",

        expires_at:
          expiresAt,
      });

      const refreshedLinks =
        await getInvoicePaymentLinks(
          invoice.id,
          companyId
        );

      setPaymentLinks(
        refreshedLinks
      );

      setShowPaymentLinkForm(
        false
      );

      setPaymentLinkAmount("");

      setPaymentLinkType(
        "full_balance"
      );

      setPaymentLinkExpiry(
        "7"
      );
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unable to create payment link."
      );
    } finally {
      setActionLoading(false);
    }
  }

  const loadInvoice =
    useCallback(
      async (
        targetCompanyId: string
      ) => {
        const result =
          await getInvoice(
            invoiceId,
            targetCompanyId
          );

        setInvoice(
          result.invoice
        );

        setItems(
          result.items
        );

        const paymentData =
          await getInvoicePayments(
            invoiceId,
            targetCompanyId
          );

        setPayments(
          paymentData
        );

        const paymentLinkData =
          await getInvoicePaymentLinks(
            invoiceId,
            targetCompanyId
          );

        setPaymentLinks(
          paymentLinkData
        );

        const activePlan =
          await getInvoicePaymentPlan(
            invoiceId,
            targetCompanyId
          );

        setPaymentPlan(
          activePlan
        );

        if (activePlan) {
          const installmentData =
            await getPaymentPlanInstallments(
              activePlan.id,
              targetCompanyId
            );

          setPlanInstallments(
            installmentData
          );
        } else {
          setPlanInstallments([]);
        }

        const [
          customerResult,
          branchResult,
        ] =
          await Promise.all([
            supabase
              .from("customer")
              .select("*")
              .eq(
                "id",
                result.invoice
                  .customer_id
              )
              .eq(
                "company_id",
                targetCompanyId
              )
              .single(),

            supabase
              .from("branch")
              .select(
                "id, branch_name"
              )
              .eq(
                "id",
                result.invoice
                  .branch_id
              )
              .single(),
          ]);

        if (
          customerResult.error
        ) {
          throw new Error(
            customerResult.error
              .message
          );
        }

        if (
          branchResult.error
        ) {
          throw new Error(
            branchResult.error
              .message
          );
        }

        setCustomer(
          customerResult.data as Customer
        );

        setBranch(
          branchResult.data as BranchInfo
        );
      },
      [invoiceId]
    );

  const [
    invoiceChangeLog,
    setInvoiceChangeLog,
  ] = useState<
    InvoiceChangeLog[]
  >([]);

  useEffect(() => {
    async function initialise() {
      try {
        setLoading(true);
        setErrorMessage("");

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
          .select(
            "full_name, company_id"
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
            profileError
              ?.message ??
              "Company could not be identified."
          );
        }

        const targetCompanyId =
          profile.company_id;

        setCompanyId(
          targetCompanyId
        );

        if (
          profile.full_name
        ) {
          setUserName(
            profile.full_name
          );
        }

        const {
          data: company,
          error: companyError,
        } = await supabase
          .from("company")
          .select(
            "company_name"
          )
          .eq(
            "id",
            targetCompanyId
          )
          .single();

        if (
          companyError
        ) {
          throw new Error(
            companyError.message
          );
        }

        setCompanyName(
          company.company_name
        );

        const {
          data: documentSettings,
          error: documentSettingsError,
        } = await supabase
          .from(
            "company_document_settings"
          )
          .select("logo_path")
          .eq(
            "company_id",
            targetCompanyId
          )
          .maybeSingle();

        if (documentSettingsError) {
          console.error(
            "Document settings could not be loaded:",
            documentSettingsError.message
          );
        }

        if (
          documentSettings?.logo_path
        ) {
          try {
            const logoUrl =
              await getDocumentLogoUrl(
                documentSettings.logo_path
              );

            setCompanyLogoUrl(
              logoUrl
            );
          } catch (logoError) {
            console.error(
              "Invoice logo could not be loaded:",
              logoError
            );

            setCompanyLogoUrl(
              null
            );
          }
        } else {
          setCompanyLogoUrl(
            null
          );
        }

        await loadInvoice(
          targetCompanyId
        );
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

    initialise();
  }, [
    router,
    loadInvoice,
  ]);

  async function refresh() {
    if (!companyId) {
      return;
    }

    await loadInvoice(
      companyId
    );
  }

  async function savePaymentPlan(data: {
    plan_type: PaymentPlanType;
    deposit_amount: number;
    instalment_amount: number;
    frequency: PaymentFrequency;
    start_date: string;
    first_payment_date: string;
    expected_completion_date: string;
    notes: string;
  }) {
    if (
      !companyId ||
      !invoice ||
      !customer ||
      !branch
    ) {
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage("");
      setMessage("");

      await createPaymentPlan({
        company_id: companyId,
        branch_id: branch.id,
        invoice_id: invoice.id,
        customer_id: customer.id,

        plan_type: data.plan_type,

        total_amount:
          Number(invoice.balance_due),

        deposit_amount:
          data.deposit_amount,

        instalment_amount:
          data.instalment_amount,

        frequency:
          data.frequency,

        start_date:
          data.start_date,

        first_payment_date:
          data.first_payment_date,

        expected_completion_date:
          data.expected_completion_date ||
          null,

        notes:
          data.notes,
      });

      setShowPaymentPlanForm(false);

      setMessage(
        "Payment plan created successfully."
      );

      await refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Payment plan could not be created."
      );

      throw error;
    } finally {
      setActionLoading(false);
    }
  }

  async function saveLiveItemFinancials(
    itemId: string,
    input: UpdateInvoiceItemFinancialsInput
  ) {
    if (
      !companyId ||
      !invoice
    ) {
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage("");
      setMessage("");

      await updateInvoiceItemFinancials(
        itemId,
        input
      );

      /*
       * Reload database-authoritative totals.
       * The PostgreSQL triggers recalculate
       * line totals, invoice total and balance.
       */
      await loadInvoice(
        companyId
      );

      setMessage(
        "Price and discount updated successfully."
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Invoice item could not be updated.";

      setErrorMessage(
        message
      );

      throw error;
    } finally {
      setActionLoading(false);
    }
  }

  async function saveLiveInvoiceEdit(
    input: UpdateInvoiceDetailsInput
  ) {
    if (
      !companyId ||
      !invoice
    ) {
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage("");
      setMessage("");

      const updated =
        await updateInvoiceDetails(
          invoice.id,
          companyId,
          input
        );

      /*
       * Update immediately so the preview
       * responds without waiting for another
       * page load.
       */
      setInvoice(updated);

      /*
       * Then reload the authoritative database
       * state and related records.
       */
      await loadInvoice(
        companyId
      );

      setMessage(
        "Invoice updated successfully."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Invoice could not be updated."
      );

      throw error;
    } finally {
      setActionLoading(false);
    }
  }

  async function issueInvoice() {
    if (
      !companyId ||
      !invoice
    ) {
      return;
    }

    if (
      items.length === 0
    ) {
      setErrorMessage(
        "An invoice must contain at least one item before it can be issued."
      );
      return;
    }

    const confirmed =
      window.confirm(
        `Issue invoice ${invoice.invoice_number}?`
      );

    if (!confirmed) {
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage("");
      setMessage("");

      const updated =
        await updateInvoiceStatus(
          invoice.id,
          companyId,
          "issued"
        );

      setInvoice(
        updated
      );

      setMessage(
        `${updated.invoice_number} issued successfully.`
      );

      await refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Invoice could not be issued."
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function cancelInvoice() {
    if (
      !companyId ||
      !invoice
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        `Cancel invoice ${invoice.invoice_number}?`
      );

    if (!confirmed) {
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage("");

      const updated =
        await updateInvoiceStatus(
          invoice.id,
          companyId,
          "cancelled"
        );

      setInvoice(
        updated
      );

      setMessage(
        `${updated.invoice_number} cancelled.`
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Invoice could not be cancelled."
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function savePayment(
    data: PaymentFormData
  ) {
    if (
      !companyId ||
      !invoice
    ) {
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage("");
      setMessage("");

      await recordInvoicePayment(
        invoice.id,
        companyId,
        invoice.branch_id,
        invoice.customer_id,
        data
      );

      setShowPaymentForm(false);

      setMessage(
        "Payment recorded successfully."
      );

      await refresh();
    } finally {
      setActionLoading(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();

    router.replace(
      "/login"
    );
  }

  if (loading) {
    return (
      <DashboardLayout>
        <Navbar
          companyName={
            companyName
          }
          userName={
            userName
          }
          onLogout={logout}
        />

        <main className="p-10 text-center text-sm text-muted-foreground">
          Loading invoice...
        </main>
      </DashboardLayout>
    );
  }

  if (
    errorMessage &&
    !invoice
  ) {
    return (
      <DashboardLayout>
        <Navbar
          companyName={
            companyName
          }
          userName={
            userName
          }
          onLogout={logout}
        />

        <main className="p-8">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive">
            {errorMessage}
          </div>
        </main>
      </DashboardLayout>
    );
  }

  if (!invoice) {
    return null;
  }

  return (
    <DashboardLayout>
      <Navbar
        companyName={
          companyName
        }
        userName={
          userName
        }
        onLogout={logout}
      />

      <main className="p-4 sm:p-6 lg:p-8">
        <Link
          href="/invoices"
          className="mb-5 inline-block text-sm font-medium text-primary hover:underline"
        >
          ← Invoices
        </Link>

        <section className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">
              Invoice
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              {
                invoice.invoice_number
              }
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="inline-flex rounded-full border px-3 py-1 text-xs font-medium">
                {formatStatus(
                  invoice.status
                )}
              </span>

              {invoice.sales_order_id && (
                <Link
                  href={`/sales/${invoice.sales_order_id}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View Sales Order
                </Link>
              )}

              {invoice.quotation_id && (
                <Link
                  href={`/quotations/${invoice.quotation_id}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View Quotation
                </Link>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {invoice.status ===
              "draft" && (
              <>
                <Button
                  type="button"
                  onClick={
                    issueInvoice
                  }
                  disabled={
                    actionLoading
                  }
                >
                  {actionLoading
                    ? "Processing..."
                    : "Issue Invoice"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={
                    cancelInvoice
                  }
                  disabled={
                    actionLoading
                  }
                >
                  Cancel Invoice
                </Button>
              </>
            )}

            {[
              "issued",
              "partially_paid",
              "overdue",
            ].includes(
              invoice.status
            ) && (
              <Button
                type="button"
                onClick={() => {
                  setShowPaymentPlanForm(
                    false
                  );
                  setShowPaymentForm(
                    true
                  );
                }}
                disabled={
                  actionLoading ||
                  Number(
                    invoice.balance_due
                  ) <= 0
                }
              >
                Record Payment
              </Button>
            )}

            {[
              "issued",
              "partially_paid",
              "overdue",
            ].includes(
              invoice.status
            ) &&
              Number(
                invoice.balance_due
              ) > 0 &&
              !paymentPlan && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowPaymentForm(
                      false
                    );
                    setShowPaymentPlanForm(
                      true
                    );
                  }}
                  disabled={
                    actionLoading
                  }
                >
                  Create Payment Plan
                </Button>
              )}
          </div>
        </section>

        {message && (
          <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {message}
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Customer
            </p>

            <p className="mt-2 font-semibold">
              {customer?.customer_name ??
                "-"}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Branch
            </p>

            <p className="mt-2 font-semibold">
              {branch?.branch_name ??
                "-"}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Invoice Date
            </p>

            <p className="mt-2 font-semibold">
              {
                invoice.invoice_date
              }
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Due Date
            </p>

            <p className="mt-2 font-semibold">
              {invoice.due_date ??
                "-"}
            </p>
          </div>
        </section>

        <section className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Invoice Total
            </p>

            <p className="mt-2 text-2xl font-bold">
              {formatCurrency(
                Number(
                  invoice.total_amount
                )
              )}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Amount Paid
            </p>

            <p className="mt-2 text-2xl font-bold">
              {formatCurrency(
                Number(
                  invoice.amount_paid
                )
              )}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Balance Due
            </p>

            <p className="mt-2 text-2xl font-bold">
              {formatCurrency(
                Number(
                  invoice.balance_due
                )
              )}
            </p>
          </div>
        </section>

        <section className="mb-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">
                  Invoice Workspace
                </h2>

                <span className="rounded-full border bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                  Live
                </span>
              </div>

              <p className="mt-1 text-sm text-muted-foreground">
                View the invoice and its financial activity together.
              </p>
            </div>

            <p className="text-sm font-semibold">
              {invoice.invoice_number}
            </p>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
            <InvoiceLivePreview
              invoice={invoice}
              items={items}
              customer={customer}
              branch={branch}
              companyName={companyName}
              companyLogoUrl={companyLogoUrl}
              payments={payments}
              saving={actionLoading}
              onUpdateInvoice={
                saveLiveInvoiceEdit
              }
              onUpdateItemFinancials={
                saveLiveItemFinancials
              }
              changeLog={
                invoiceChangeLog
              }
            />

            <div className="grid content-start gap-4">
              <div className="rounded-xl border bg-card p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Payment Control
                </p>

                <div className="mt-4 rounded-lg bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground">
                    Balance Due
                  </p>

                  <p className="mt-1 text-3xl font-black">
                    {formatCurrency(
                      Number(
                        invoice.balance_due
                      )
                    )}
                  </p>

                  <div className="mt-3 flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Paid
                    </span>

                    <span className="font-semibold">
                      {formatCurrency(
                        Number(
                          invoice.amount_paid
                        )
                      )}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-2">
                  <Button
                    type="button"
                    onClick={() => {
                      setShowPaymentPlanForm(
                        false
                      );
                      setShowPaymentForm(
                        true
                      );
                    }}
                    disabled={
                      actionLoading ||
                      Number(
                        invoice.balance_due
                      ) <= 0 ||
                      invoice.status ===
                        "cancelled"
                    }
                    className="w-full bg-black text-white hover:bg-black/85"
                  >
                    Record Payment
                  </Button>

                  <Button
                    type="button"
                    onClick={() => {
                      setShowPaymentForm(
                        false
                      );
                      setShowPaymentPlanForm(
                        true
                      );
                    }}
                    disabled={
                      actionLoading ||
                      Number(
                        invoice.balance_due
                      ) <= 0 ||
                      invoice.status ===
                        "cancelled" ||
                      Boolean(paymentPlan)
                    }
                    className="w-full bg-black text-white hover:bg-black/85"
                  >
                    {paymentPlan
                      ? "Payment Plan Active"
                      : "Create Payment Plan"}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setShowPaymentLinkForm(
                        true
                      )
                    }
                    disabled={
                      actionLoading ||
                      Number(
                        invoice.balance_due
                      ) <= 0 ||
                      invoice.status ===
                        "cancelled"
                    }
                    className="w-full"
                  >
                    Create Payment Link
                  </Button>
                </div>
              </div>

              {paymentPlan && (
                <div className="rounded-xl border bg-card p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Payment Plan
                      </p>

                      <p className="mt-1 text-lg font-bold">
                        {formatStatus(
                          paymentPlan.plan_type
                        )}
                      </p>
                    </div>

                    <span className="rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase">
                      {planDisplayStatus}
                    </span>
                  </div>

                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Payment Progress
                      </span>

                      <span className="font-semibold">
                        {planCompleted
                          ? 100
                          : planProgress.progress_percentage}
                        %
                      </span>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-foreground transition-all"
                        style={{
                          width: `${
                            planCompleted
                              ? 100
                              : planProgress.progress_percentage
                          }%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Paid
                      </p>
                      <p className="mt-1 font-semibold">
                        {formatCurrency(
                          Math.max(
                            Number(
                              invoice.total_amount
                            ) -
                              Number(
                                invoice.balance_due
                              ),
                            0
                          )
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">
                        Remaining
                      </p>
                      <p className="mt-1 font-semibold">
                        {formatCurrency(
                          Number(
                            invoice.balance_due
                          )
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">
                        Payments
                      </p>
                      <p className="mt-1 font-semibold">
                        {
                          planProgress.paid_installments
                        }{" "}
                        of{" "}
                        {
                          planProgress.total_installments
                        }
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">
                        Overdue
                      </p>
                      <p className="mt-1 font-semibold">
                        {
                          planProgress.overdue_installments
                        }{" "}
                        payment
                        {planProgress.overdue_installments ===
                        1
                          ? ""
                          : "s"}
                      </p>
                    </div>
                  </div>

                  {!planCompleted &&
                    planProgress.next_installment && (
                      <div className="mt-5 border-t pt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Next Payment
                        </p>

                        <div className="mt-2 flex items-end justify-between gap-4">
                          <div>
                            <p className="font-semibold">
                              {
                                planProgress.next_payment_date
                              }
                            </p>

                            <p className="mt-1 text-xs text-muted-foreground">
                              Instalment #
                              {
                                planProgress.next_installment
                                  .installment_number
                              }
                            </p>
                          </div>

                          <p className="text-lg font-bold">
                            {formatCurrency(
                              planProgress.next_amount_due
                            )}
                          </p>
                        </div>
                      </div>
                    )}

                  {!planCompleted &&
                    Number(invoice.balance_due) > 0 && (
                      <div className="mt-5 border-t pt-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Payment Options
                          </p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            The schedule shows what is expected.
                            The customer can still pay the next
                            instalment, choose another amount,
                            or settle the account early.
                          </p>
                        </div>

                        <div className="mt-4 grid gap-2">
                          {planProgress.next_installment && (
                            <Button
                              type="button"
                              onClick={() => {
                                setPaymentLinkType(
                                  "next_installment"
                                );
                                setShowPaymentLinkForm(
                                  true
                                );
                              }}
                              disabled={actionLoading}
                              className="w-full bg-black text-white hover:bg-black/85"
                            >
                              Pay Next Instalment —{" "}
                              {formatCurrency(
                                planProgress.next_amount_due
                              )}
                            </Button>
                          )}

                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setPaymentLinkType(
                                "customer_entered"
                              );
                              setShowPaymentLinkForm(
                                true
                              );
                            }}
                            disabled={actionLoading}
                            className="w-full"
                          >
                            Customer Chooses Amount
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setPaymentLinkType(
                                "full_balance"
                              );
                              setShowPaymentLinkForm(
                                true
                              );
                            }}
                            disabled={actionLoading}
                            className="w-full"
                          >
                            Settle Remaining Balance —{" "}
                            {formatCurrency(
                              Number(
                                invoice.balance_due
                              )
                            )}
                          </Button>
                        </div>
                      </div>
                    )}

                  {planProgress.overdue_installments >
                    0 &&
                    !planCompleted && (
                      <div className="mt-4 rounded-lg border border-red-200 p-3">
                        <div className="flex justify-between gap-4">
                          <span className="text-xs font-semibold text-red-700">
                            Overdue Amount
                          </span>

                          <span className="text-sm font-bold text-red-700">
                            {formatCurrency(
                              planProgress.overdue_amount
                            )}
                          </span>
                        </div>
                      </div>
                    )}

                  {planCompleted && (
                    <div className="mt-5 border-t pt-4">
                      <p className="text-sm font-semibold">
                        Payment plan completed
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        Full payment received. The
                        instalment history remains
                        available below.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl border bg-card">
                <div className="border-b p-5">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">
                      Recent Records
                    </p>

                    <span className="text-xs text-muted-foreground">
                      {payments.length} payments
                    </span>
                  </div>
                </div>

                {payments.length === 0 ? (
                  <div className="p-5 text-sm text-muted-foreground">
                    No payment records yet.
                  </div>
                ) : (
                  <div className="divide-y">
                    {payments
                      .slice(0, 5)
                      .map(
                        (payment) => (
                          <div
                            key={
                              payment.id
                            }
                            className="flex items-center justify-between gap-4 p-4"
                          >
                            <div>
                              <p className="text-sm font-semibold capitalize">
                                {
                                  payment.payment_method
                                }
                              </p>

                              <p className="text-xs text-muted-foreground">
                                {
                                  payment.payment_date
                                }
                                {payment.reference
                                  ? ` • ${payment.reference}`
                                  : ""}
                              </p>
                            </div>

                            <div className="text-right">
                              <p className="font-bold">
                                {formatCurrency(
                                  Number(
                                    payment.amount
                                  )
                                )}
                              </p>

                              <p className="text-[10px] font-bold uppercase text-emerald-700">
                                Recorded
                              </p>
                            </div>
                          </div>
                        )
                      )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5">
            <div>
              <h2 className="text-lg font-semibold">
                Payment Links
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Manage payment requests created for
                this invoice.
              </p>
            </div>

            <Button
              type="button"
              onClick={() =>
                setShowPaymentLinkForm(true)
              }
              disabled={
                actionLoading ||
                Number(invoice.balance_due) <= 0 ||
                invoice.status === "cancelled"
              }
              className="bg-black text-white hover:bg-black/85"
            >
              Create Payment Link
            </Button>
          </div>

          {paymentLinks.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">
              No payment links created yet.
            </div>
          ) : (
            <div className="divide-y">
              {paymentLinks.map((link) => {
                const expired =
                  Boolean(link.expires_at) &&
                  new Date(link.expires_at as string).getTime() <
                    Date.now();

                const displayStatus =
                  link.status === "active" && expired
                    ? "expired"
                    : link.status;

                const displayAmount =
                  link.link_type === "customer_entered"
                    ? "Customer chooses"
                    : link.amount != null
                      ? formatCurrency(
                          Number(link.amount)
                        )
                      : "—";

                return (
                  <div
                    key={link.id}
                    className="p-5"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">
                            {link.link_type ===
                            "full_balance"
                              ? "Full Balance"
                              : link.link_type ===
                                  "fixed_amount"
                                ? "Specific Amount"
                                : link.link_type ===
                                    "next_installment"
                                  ? "Next Instalment"
                                  : "Customer Chooses Amount"}
                          </p>

                          <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase">
                            {displayStatus}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            Amount: {displayAmount}
                          </span>

                          <span>
                            Created:{" "}
                            {new Date(
                              link.created_at
                            ).toLocaleDateString(
                              "en-ZA"
                            )}
                          </span>

                          <span>
                            Expires:{" "}
                            {link.expires_at
                              ? new Date(
                                  link.expires_at
                                ).toLocaleString(
                                  "en-ZA"
                                )
                              : "No expiry"}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={async () => {
                            try {
                              const paymentUrl =
                                `${window.location.origin}/pay/${link.token}`;

                              await navigator.clipboard.writeText(
                                paymentUrl
                              );

                              alert(
                                "Payment link copied."
                              );
                            } catch {
                              alert(
                                "Unable to copy payment link."
                              );
                            }
                          }}
                        >
                          Copy Payment Link
                        </Button>

                        {displayStatus ===
                          "active" && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              handleCancelPaymentLink(
                                link.id
                              )
                            }
                            disabled={actionLoading}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {showPaymentLinkForm && (
          <section className="mb-6 rounded-xl border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">
                  Create Payment Link
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Create a secure link for this
                  invoice.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setShowPaymentLinkForm(
                    false
                  )
                }
              >
                Close
              </Button>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div>
                <label className="text-sm font-medium">
                  Payment Amount
                </label>

                <select
                  value={
                    paymentLinkType
                  }
                  onChange={(event) =>
                    setPaymentLinkType(
                      event.target
                        .value as PaymentLinkType
                    )
                  }
                  className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="full_balance">
                    Full Outstanding Balance
                  </option>

                  {paymentPlan &&
                    planProgress
                      .next_installment && (
                      <option value="next_installment">
                        Next Instalment
                      </option>
                    )}

                  <option value="fixed_amount">
                    Specific Amount
                  </option>

                  <option value="customer_entered">
                    Customer Chooses Amount
                  </option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">
                  Link Expiry
                </label>

                <select
                  value={
                    paymentLinkExpiry
                  }
                  onChange={(event) =>
                    setPaymentLinkExpiry(
                      event.target.value
                    )
                  }
                  className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="1">
                    24 Hours
                  </option>

                  <option value="3">
                    3 Days
                  </option>

                  <option value="7">
                    7 Days
                  </option>

                  <option value="none">
                    No Expiry
                  </option>
                </select>
              </div>
            </div>

            {paymentLinkType ===
              "fixed_amount" && (
              <div className="mt-4 max-w-sm">
                <label className="text-sm font-medium">
                  Amount
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={
                    paymentLinkAmount
                  }
                  onChange={(event) =>
                    setPaymentLinkAmount(
                      event.target.value
                    )
                  }
                  placeholder="0.00"
                  className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
                />
              </div>
            )}

            <div className="mt-5 rounded-lg border p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Amount To Pay
              </p>

              <p className="mt-2 text-xl font-bold">
                {paymentLinkType ===
                "full_balance"
                  ? formatCurrency(
                      Number(
                        invoice.balance_due
                      )
                    )
                  : paymentLinkType ===
                      "next_installment"
                    ? formatCurrency(
                        planProgress
                          .next_amount_due
                      )
                    : paymentLinkType ===
                        "fixed_amount"
                      ? paymentLinkAmount
                        ? formatCurrency(
                            Number(
                              paymentLinkAmount
                            )
                          )
                        : "—"
                      : "Customer chooses amount"}
              </p>

              {paymentLinkType ===
                "customer_entered" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Maximum allowed:{" "}
                  {formatCurrency(
                    Number(
                      invoice.balance_due
                    )
                  )}
                </p>
              )}
            </div>

            <div className="mt-5">
              <Button
                type="button"
                onClick={
                  savePaymentLink
                }
                disabled={
                  actionLoading
                }
                className="bg-black text-white hover:bg-black/85"
              >
                {actionLoading
                  ? "Creating..."
                  : "Create Payment Link"}
              </Button>
            </div>
          </section>
        )}

        <section className="mb-6 rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">
                Payments & Payment Plans
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Record payments, partial payments, lay-bys and instalments.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => {
                  setShowPaymentPlanForm(false);
                  setShowPaymentForm(true);
                }}
                disabled={
                  actionLoading ||
                  Number(invoice.balance_due) <= 0 ||
                  invoice.status === "cancelled"
                }
                className="bg-black text-white hover:bg-black/85"
              >
                Record Payment
              </Button>

              <Button
                type="button"
                onClick={() => {
                  setShowPaymentForm(false);
                  setShowPaymentPlanForm(true);
                }}
                disabled={
                  actionLoading ||
                  Number(invoice.balance_due) <= 0 ||
                  invoice.status === "cancelled" ||
                  Boolean(paymentPlan)
                }
                className="bg-black text-white hover:bg-black/85"
              >
                {paymentPlan
                  ? `Payment Plan ${planDisplayStatus}`
                  : "Create Payment Plan"}
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">
                Invoice Total
              </p>
              <p className="mt-1 font-semibold">
                {formatCurrency(Number(invoice.total_amount))}
              </p>
            </div>

            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">
                Paid
              </p>
              <p className="mt-1 font-semibold">
                {formatCurrency(Number(invoice.amount_paid))}
              </p>
            </div>

            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">
                Balance Due
              </p>
              <p className="mt-1 font-semibold">
                {formatCurrency(Number(invoice.balance_due))}
              </p>
            </div>
          </div>
        </section>

        {showPaymentForm &&
          Number(
            invoice.balance_due
          ) > 0 && (
            <div className="mb-6">
              <InvoicePaymentForm
                balanceDue={
                  Number(
                    invoice.balance_due
                  )
                }
                saving={
                  actionLoading
                }
                onSave={
                  savePayment
                }
                onCancel={() =>
                  setShowPaymentForm(
                    false
                  )
                }
              />
            </div>
          )}

        {showPaymentPlanForm &&
          !paymentPlan &&
          Number(
            invoice.balance_due
          ) > 0 && (
            <div className="mb-6">
              <InvoicePaymentPlanForm
                balanceDue={
                  Number(
                    invoice.balance_due
                  )
                }
                saving={
                  actionLoading
                }
                onSave={
                  savePaymentPlan
                }
                onCancel={() =>
                  setShowPaymentPlanForm(
                    false
                  )
                }
              />
            </div>
          )}

        {paymentPlan && (
          <section className="mb-6 overflow-hidden rounded-xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5">
              <div>
                <h2 className="text-lg font-semibold">
                  Payment Plan
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  {formatStatus(
                    paymentPlan.plan_type
                  )} payment arrangement
                </p>
              </div>

              <span className="rounded-full border px-3 py-1 text-xs font-semibold uppercase">
                {formatStatus(
                  paymentPlan.status
                )}
              </span>
            </div>

            <div className="grid gap-4 border-b p-5 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">
                  Plan Amount
                </p>
                <p className="mt-1 font-semibold">
                  {formatCurrency(
                    Number(
                      paymentPlan.total_amount
                    )
                  )}
                </p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">
                  Deposit Required
                </p>
                <p className="mt-1 font-semibold">
                  {formatCurrency(
                    Number(
                      paymentPlan.deposit_amount
                    )
                  )}
                </p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">
                  Instalment
                </p>
                <p className="mt-1 font-semibold">
                  {paymentPlan.instalment_amount
                    ? formatCurrency(
                        Number(
                          paymentPlan.instalment_amount
                        )
                      )
                    : "-"}
                </p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">
                  Next Payment
                </p>
                <p className="mt-1 font-semibold">
                  {paymentPlan.next_payment_date ??
                    "-"}
                </p>
              </div>
            </div>

            <div className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold">
                  Instalment Schedule
                </h3>

                <span className="text-sm text-muted-foreground">
                  {planInstallments.length} payments
                </span>
              </div>

              {planInstallments.length ===
              0 ? (
                <p className="text-sm text-muted-foreground">
                  No scheduled instalments.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/30">
                      <tr>
                        <th className="p-3 text-left">
                          #
                        </th>
                        <th className="p-3 text-left">
                          Due
                        </th>
                        <th className="p-3 text-right">
                          Amount
                        </th>
                        <th className="p-3 text-right">
                          Paid
                        </th>
                        <th className="p-3 text-right">
                          Status
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {planInstallments.map(
                        (installment) => (
                          <tr
                            key={
                              installment.id
                            }
                            className="border-b last:border-0"
                          >
                            <td className="p-3">
                              {
                                installment.installment_number
                              }
                            </td>

                            <td className="p-3">
                              {
                                installment.due_date
                              }
                            </td>

                            <td className="p-3 text-right">
                              {formatCurrency(
                                Number(
                                  installment.amount_due
                                )
                              )}
                            </td>

                            <td className="p-3 text-right">
                              {formatCurrency(
                                Number(
                                  installment.amount_paid
                                )
                              )}
                            </td>

                            <td className="p-3 text-right font-medium">
                              {formatStatus(
                                installment.status
                              )}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b p-5">
            <h2 className="text-lg font-semibold">
              Invoice Items
            </h2>

            <p className="text-sm text-muted-foreground">
              {items.length} item
              {items.length === 1
                ? ""
                : "s"}
            </p>
          </div>

          {items.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No invoice items.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="p-4 text-left">
                      Description
                    </th>

                    <th className="p-4 text-right">
                      Qty
                    </th>

                    <th className="p-4 text-right">
                      Unit Price
                    </th>

                    <th className="p-4 text-right">
                      Discount
                    </th>

                    <th className="p-4 text-right">
                      Tax
                    </th>

                    <th className="p-4 text-right">
                      Total
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {items.map(
                    (item) => (
                      <tr
                        key={
                          item.id
                        }
                        className="border-b last:border-0"
                      >
                        <td className="p-4 font-medium">
                          {
                            item.description
                          }
                        </td>

                        <td className="p-4 text-right">
                          {Number(
                            item.quantity
                          )}
                        </td>

                        <td className="p-4 text-right">
                          {formatCurrency(
                            Number(
                              item.unit_price
                            )
                          )}
                        </td>

                        <td className="p-4 text-right">
                          {item.discount_mode ===
                          "percentage"
                            ? `${Number(
                                item.discount_value
                              )}%`
                            : formatCurrency(
                                Number(
                                  item.discount_value
                                )
                              )}
                        </td>

                        <td className="p-4 text-right">
                          {item.tax_mode ===
                          "vat"
                            ? `VAT ${Number(
                                item.tax_rate
                              )}%`
                            : "No Tax"}
                        </td>

                        <td className="p-4 text-right font-semibold">
                          {formatCurrency(
                            Number(
                              item.line_total
                            )
                          )}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>


        <div className="mt-6">
          <InvoiceTemplateSelector
            invoiceId={invoice.id}
          />
        </div>

        <section className="mt-6 overflow-hidden rounded-xl border bg-card">
          <div className="border-b p-5">
            <h2 className="text-lg font-semibold">
              Payment History
            </h2>

            <p className="text-sm text-muted-foreground">
              {payments.length} payment
              {payments.length === 1
                ? ""
                : "s"}
            </p>
          </div>

          {payments.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No payments recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="p-4 text-left">
                      Date
                    </th>
                    <th className="p-4 text-left">
                      Method
                    </th>
                    <th className="p-4 text-left">
                      Reference
                    </th>
                    <th className="p-4 text-right">
                      Amount
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {payments.map(
                    (payment) => (
                      <tr
                        key={
                          payment.id
                        }
                        className="border-b last:border-0"
                      >
                        <td className="p-4">
                          {
                            payment.payment_date
                          }
                        </td>

                        <td className="p-4 capitalize">
                          {
                            payment.payment_method
                          }
                        </td>

                        <td className="p-4">
                          {
                            payment.reference ||
                            "-"
                          }
                        </td>

                        <td className="p-4 text-right font-semibold">
                          {formatCurrency(
                            Number(
                              payment.amount
                            )
                          )}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-6 flex justify-end">
          <div className="w-full max-w-md rounded-xl border bg-card p-5">
            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">
                Subtotal
              </span>

              <span>
                {formatCurrency(
                  Number(
                    invoice.subtotal
                  )
                )}
              </span>
            </div>

            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">
                Discount
              </span>

              <span>
                -
                {formatCurrency(
                  Number(
                    invoice.discount_amount
                  )
                )}
              </span>
            </div>

            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">
                Tax
              </span>

              <span>
                {formatCurrency(
                  Number(
                    invoice.tax_amount
                  )
                )}
              </span>
            </div>

            <div className="mt-2 flex justify-between border-t pt-4 text-xl font-bold">
              <span>
                Total
              </span>

              <span>
                {formatCurrency(
                  Number(
                    invoice.total_amount
                  )
                )}
              </span>
            </div>

            <div className="mt-2 flex justify-between border-t pt-4 font-semibold">
              <span>
                Balance Due
              </span>

              <span>
                {formatCurrency(
                  Number(
                    invoice.balance_due
                  )
                )}
              </span>
            </div>
          </div>
        </section>

        {invoice.notes && (
          <section className="mt-6 rounded-xl border bg-card p-5">
            <h2 className="font-semibold">
              Notes
            </h2>

            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {invoice.notes}
            </p>
          </section>
        )}

        {invoice.terms && (
          <section className="mt-4 rounded-xl border bg-card p-5">
            <h2 className="font-semibold">
              Terms
            </h2>

            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {invoice.terms}
            </p>
          </section>
        )}
      </main>
    </DashboardLayout>
  );
}
