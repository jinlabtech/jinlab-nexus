"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import DataTable from "@/components/DataTable";
import AccountingNav from "@/components/accounting/AccountingNav";
import DebtorReconciliationDetails from "@/components/accounting/DebtorReconciliationDetails";

import {
  Button,
} from "@/components/ui/button";

import {
  usePermissions,
} from "@/hooks/usePermissions";

import {
  supabase,
} from "@/lib/supabase";

import {
  getDebtorAgeing,
} from "@/lib/services/accountingService";

import type {
  DebtorAgeingResult,
} from "@/lib/services/accountingService";


function localToday() {
  const now =
    new Date();

  const offset =
    now.getTimezoneOffset() *
    60 *
    1000;

  return new Date(
    now.getTime() -
    offset
  )
    .toISOString()
    .slice(0, 10);
}


function formatCurrency(
  value: number,
  currency = "ZAR"
) {
  return new Intl.NumberFormat(
    "en-ZA",
    {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }
  ).format(
    Number(value ?? 0)
  );
}


function formatDate(
  value?: string | null
) {
  if (!value) {
    return "—";
  }

  return new Date(
    `${value.slice(0, 10)}T00:00:00`
  ).toLocaleDateString(
    "en-ZA",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}


function ageingLabel(
  bucket: string
) {
  switch (bucket) {
    case "current":
      return "Current";

    case "1_30":
      return "1–30 days";

    case "31_60":
      return "31–60 days";

    case "61_90":
      return "61–90 days";

    case "90_plus":
      return "90+ days";

    default:
      return bucket;
  }
}


export default function DebtorsPage() {
  const router =
    useRouter();

  const {
    can,
    loading:
      permissionsLoading,
  } =
    usePermissions();

  const canView =
    can(
      "accounting.view"
    );

  const [
    companyName,
    setCompanyName,
  ] =
    useState(
      "JINLAB Nexus"
    );

  const [
    ageing,
    setAgeing,
  ] =
    useState<
      DebtorAgeingResult |
      null
    >(null);

  const [
    asOfDate,
    setAsOfDate,
  ] =
    useState(
      localToday()
    );

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");


  async function loadData(
    silent = false
  ) {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setErrorMessage("");

      const {
        data: {
          user,
        },
      } =
        await supabase.auth
          .getUser();

      if (!user) {
        router.replace(
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


      const [
        companyResult,
        ageingResult,
      ] =
        await Promise.all([
          supabase
            .from("company")
            .select(
              "company_name"
            )
            .eq(
              "id",
              profile.company_id
            )
            .single(),

          getDebtorAgeing(
            asOfDate
          ),
        ]);


      if (
        companyResult.error
      ) {
        throw new Error(
          companyResult
            .error.message
        );
      }


      setCompanyName(
        companyResult
          .data.company_name
      );

      setAgeing(
        ageingResult
      );

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Debtor ageing could not be loaded."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }


  useEffect(() => {
    if (
      permissionsLoading
    ) {
      return;
    }

    if (!canView) {
      setLoading(false);
      return;
    }

    void loadData();

  }, [
    permissionsLoading,
    canView,
  ]);


  async function logout() {
    await supabase.auth
      .signOut();

    router.replace(
      "/login"
    );
  }


  const filteredCustomers =
    useMemo(
      () => {
        if (!ageing) {
          return [];
        }

        const term =
          search
            .trim()
            .toLowerCase();

        if (!term) {
          return ageing.customers;
        }

        return ageing.customers
          .filter(
            (customer) =>
              customer
                .customer_name
                .toLowerCase()
                .includes(term) ||

              customer
                .customer_number
                .toLowerCase()
                .includes(term)
          );
      },
      [
        ageing,
        search,
      ]
    );


  const filteredInvoices =
    useMemo(
      () => {
        if (!ageing) {
          return [];
        }

        const term =
          search
            .trim()
            .toLowerCase();

        if (!term) {
          return ageing.invoices;
        }

        return ageing.invoices
          .filter(
            (invoice) =>
              invoice
                .customer_name
                .toLowerCase()
                .includes(term) ||

              invoice
                .invoice_number
                .toLowerCase()
                .includes(term)
          );
      },
      [
        ageing,
        search,
      ]
    );


  if (
    permissionsLoading ||
    loading
  ) {
    return (
      <DashboardLayout>
        <Navbar
          companyName={
            companyName
          }
          userName="Admin"
          onLogout={
            logout
          }
        />

        <main className="mx-auto max-w-7xl p-6 lg:p-8">
          <p className="text-sm text-muted-foreground">
            Loading customer debtors...
          </p>
        </main>
      </DashboardLayout>
    );
  }


  if (!canView) {
    return (
      <DashboardLayout>
        <Navbar
          companyName={
            companyName
          }
          userName="Admin"
          onLogout={
            logout
          }
        />

        <main className="mx-auto max-w-5xl p-6 lg:p-8">
          <div className="rounded-xl border p-6">
            <h1 className="text-xl font-bold">
              Accounting Restricted
            </h1>
          </div>
        </main>
      </DashboardLayout>
    );
  }


  const currency =
    ageing?.currency ??
    "ZAR";

  const summary =
    ageing?.summary;


  return (
    <DashboardLayout>
      <Navbar
        companyName={
          companyName
        }
        userName="Admin"
        onLogout={
          logout
        }
      />


      <main className="mx-auto max-w-7xl p-6 lg:p-8">

        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">

          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Accounting
            </p>

            <h1 className="mt-1 text-3xl font-bold">
              Customers / Debtors
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Track customer balances,
              overdue invoices, ageing,
              credit exposure and debtor
              ledger reconciliation.
            </p>
          </div>


          <div className="flex flex-wrap items-end gap-3">

            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">
                As at
              </span>

              <input
                type="date"
                value={
                  asOfDate
                }
                onChange={
                  (event) =>
                    setAsOfDate(
                      event.target.value
                    )
                }
                className="rounded-md border bg-background px-3 py-2"
              />
            </label>


            <Button
              type="button"
              variant="outline"
              disabled={
                refreshing
              }
              onClick={() =>
                void loadData(
                  true
                )
              }
            >
              {refreshing
                ? "Refreshing..."
                : "Refresh"}
            </Button>

          </div>
        </div>


        <AccountingNav />


        {errorMessage && (
          <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        )}


        {summary && (
          <>
            <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

              <div className="rounded-xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">
                  Total Outstanding
                </p>

                <p className="mt-2 text-2xl font-bold">
                  {formatCurrency(
                    summary.total_outstanding,
                    currency
                  )}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  {summary.customer_count} customers ·{" "}
                  {summary.open_invoice_count} open invoices
                </p>
              </div>


              <div className="rounded-xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">
                  Total Overdue
                </p>

                <p className="mt-2 text-2xl font-bold">
                  {formatCurrency(
                    summary.total_overdue,
                    currency
                  )}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  {summary.overdue_invoice_count} overdue invoices
                </p>
              </div>


              <div className="rounded-xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">
                  Ledger Debtors
                </p>

                <p className="mt-2 text-2xl font-bold">
                  {summary.ledger_debtors_balance ===
                  null
                    ? "—"
                    : formatCurrency(
                        summary.ledger_debtors_balance,
                        currency
                      )}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Trade Debtors control account
                </p>
              </div>


              <div className="rounded-xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">
                  Reconciliation
                </p>

                <p className="mt-2 text-xl font-bold">
                  {summary.reconciled
                    ? "Reconciled"
                    : "Review Required"}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Difference:{" "}
                  {summary.reconciliation_difference ===
                  null
                    ? "—"
                    : formatCurrency(
                        summary.reconciliation_difference,
                        currency
                      )}
                </p>
              </div>

            </section>


            <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">

              {[
                [
                  "Current",
                  summary.current,
                ],
                [
                  "1–30 days",
                  summary.days_1_30,
                ],
                [
                  "31–60 days",
                  summary.days_31_60,
                ],
                [
                  "61–90 days",
                  summary.days_61_90,
                ],
                [
                  "90+ days",
                  summary.days_90_plus,
                ],
              ].map(
                ([
                  title,
                  value,
                ]) => (
                  <div
                    key={
                      String(title)
                    }
                    className="rounded-xl border bg-card p-4"
                  >
                    <p className="text-xs font-medium text-muted-foreground">
                      {title}
                    </p>

                    <p className="mt-2 text-lg font-bold">
                      {formatCurrency(
                        Number(value),
                        currency
                      )}
                    </p>
                  </div>
                )
              )}

            </section>
          </>
        )}


        <div className="mb-6">
          <input
            type="search"
            value={
              search
            }
            onChange={
              (event) =>
                setSearch(
                  event.target.value
                )
            }
            placeholder="Search customer or invoice..."
            className="w-full max-w-md rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>


        <section className="mb-10">

          <div className="mb-4">
            <h2 className="text-xl font-semibold">
              Customer Balances
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Outstanding balances,
              ageing and customer credit exposure.
            </p>
          </div>


          <DataTable
            headers={[
              "Customer",
              "Outstanding",
              "Overdue",
              "Current",
              "1–30",
              "31–60",
              "61–90",
              "90+",
              "Credit Limit",
              "Exposure",
              "Statement",
            ]}
            rows={
              filteredCustomers.map(
                (customer) => [
                  <button
                    key={
                      customer.customer_id
                    }
                    type="button"
                    className="text-left hover:underline"
                    onClick={() =>
                      router.push(
                        `/accounting/debtors/${customer.customer_id}`
                      )
                    }
                  >
                    <p className="font-medium">
                      {customer.customer_name}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      {customer.customer_number}
                    </p>
                  </button>,

                  formatCurrency(
                    customer.outstanding,
                    currency
                  ),

                  formatCurrency(
                    customer.overdue,
                    currency
                  ),

                  formatCurrency(
                    customer.current,
                    currency
                  ),

                  formatCurrency(
                    customer.days_1_30,
                    currency
                  ),

                  formatCurrency(
                    customer.days_31_60,
                    currency
                  ),

                  formatCurrency(
                    customer.days_61_90,
                    currency
                  ),

                  formatCurrency(
                    customer.days_90_plus,
                    currency
                  ),

                  customer.credit_limit > 0
                    ? formatCurrency(
                        customer.credit_limit,
                        currency
                      )
                    : "No limit",

                  customer.credit_limit_exceeded
                    ? "Limit exceeded"
                    : "Within limit",

                  <Button
                    key={
                      `statement-${customer.customer_id}`
                    }
                    type="button"
                    size="sm"
                    className="bg-black text-white hover:bg-black/85"
                    onClick={() =>
                      router.push(
                        `/accounting/debtors/${customer.customer_id}`
                      )
                    }
                  >
                    View Statement
                  </Button>,
                ]
              )
            }
            emptyMessage="No customers currently have an outstanding debtor balance."
          />

        </section>


        <section>

          <div className="mb-4">
            <h2 className="text-xl font-semibold">
              Open Invoices
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Every outstanding invoice
              included in the ageing calculation.
            </p>
          </div>


          <DataTable
            headers={[
              "Invoice",
              "Customer",
              "Invoice Date",
              "Due Date",
              "Original",
              "Paid",
              "Outstanding",
              "Ageing",
              "Days Overdue",
              "Action",
            ]}
            rows={
              filteredInvoices.map(
                (invoice) => [
                  invoice.invoice_number,

                  invoice.customer_name,

                  formatDate(
                    invoice.invoice_date
                  ),

                  formatDate(
                    invoice.due_date
                  ),

                  formatCurrency(
                    invoice.invoice_total,
                    currency
                  ),

                  formatCurrency(
                    invoice.paid_to_date,
                    currency
                  ),

                  formatCurrency(
                    invoice.outstanding,
                    currency
                  ),

                  ageingLabel(
                    invoice.ageing_bucket
                  ),

                  invoice.days_overdue > 0
                    ? String(
                        invoice.days_overdue
                      )
                    : "—",

                  <Button
                    key={
                      invoice.invoice_id
                    }
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      router.push(
                        `/invoices/${invoice.invoice_id}`
                      )
                    }
                  >
                    Open Invoice
                  </Button>,
                ]
              )
            }
            emptyMessage="No outstanding invoices found for this ageing date."
          />

        </section>


        <DebtorReconciliationDetails
          asOfDate={asOfDate}
          currency={currency}
        />


        <section className="mt-10 rounded-xl border bg-muted/20 p-5">
          <h2 className="font-semibold">
            Debtor Control
          </h2>

          <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
            Operational customer balances
            are independently reconciled to
            the Trade Debtors general ledger
            control account. A difference
            means accounting transactions
            require investigation rather
            than being silently adjusted.
          </p>
        </section>

      </main>
    </DashboardLayout>
  );
}
