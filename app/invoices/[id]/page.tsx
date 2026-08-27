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
import { Button } from "@/components/ui/button";

import {
  getInvoice,
  updateInvoiceStatus,
} from "@/lib/services/invoiceService";

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
                disabled
                title="Payment recording will be added in the next sprint."
              >
                Record Payment
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
