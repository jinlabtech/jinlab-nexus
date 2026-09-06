"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import AccountingNav from "@/components/accounting/AccountingNav";
import DebtorCollectionPanel from "@/components/accounting/DebtorCollectionPanel";
import DebtorPaymentPromises from "@/components/accounting/DebtorPaymentPromises";
import DataTable from "@/components/DataTable";

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
  getCustomerAccountStatement,
} from "@/lib/services/accountingService";

import type {
  CustomerAccountStatement,
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


function dateMinusDays(
  value: string,
  days: number
) {
  const date =
    new Date(
      `${value}T12:00:00`
    );

  date.setDate(
    date.getDate() -
    days
  );

  return date
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
    Number(
      value ?? 0
    )
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


function paymentMethodLabel(
  value?: string | null
) {
  if (!value) {
    return "—";
  }

  switch (
    value.toLowerCase()
  ) {
    case "eft":
      return "EFT";

    case "cash":
      return "Cash";

    case "card":
      return "Card";

    case "other":
      return "Other";

    default:
      return value;
  }
}


function transactionType(
  sourceType: string
) {
  switch (sourceType) {
    case "invoice":
      return "Invoice";

    case "invoice_payment":
      return "Payment";

    case "adjustment":
      return "Adjustment";

    case "reversal":
      return "Reversal";

    default:
      return sourceType
        .replaceAll(
          "_",
          " "
        );
  }
}


export default function CustomerDebtorPage() {
  const params =
    useParams();

  const router =
    useRouter();

  const customerId =
    String(
      params.customerId ??
      ""
    );


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


  const today =
    useMemo(
      () =>
        localToday(),
      []
    );


  const [
    startDate,
    setStartDate,
  ] =
    useState(
      dateMinusDays(
        today,
        90
      )
    );

  const [
    endDate,
    setEndDate,
  ] =
    useState(
      today
    );


  const [
    companyName,
    setCompanyName,
  ] =
    useState(
      "JINLAB Nexus"
    );


  const [
    statement,
    setStatement,
  ] =
    useState<
      CustomerAccountStatement |
      null
    >(null);


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


  const [
    collectionRefreshKey,
    setCollectionRefreshKey,
  ] =
    useState(0);


  async function loadData(
    silent = false
  ) {
    if (!customerId) {
      return;
    }

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
        statementResult,
      ] =
        await Promise.all([
          supabase
            .from(
              "company"
            )
            .select(
              "company_name"
            )
            .eq(
              "id",
              profile.company_id
            )
            .single(),

          getCustomerAccountStatement(
            customerId,
            startDate,
            endDate
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


      setStatement(
        statementResult
      );

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Customer statement could not be loaded."
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
    customerId,
  ]);


  async function logout() {
    await supabase.auth
      .signOut();

    router.replace(
      "/login"
    );
  }


  function printStatement() {
    window.print();
  }


  const currency =
    statement?.currency ??
    "ZAR";


  const creditLimit =
    Number(
      statement?.customer
        .credit_limit ??
      0
    );


  const closingBalance =
    Number(
      statement?.summary
        .closing_balance ??
      0
    );


  const creditAvailable =
    creditLimit > 0
      ? Math.max(
          creditLimit -
          closingBalance,
          0
        )
      : null;


  const creditExceeded =
    creditLimit > 0 &&
    closingBalance >
      creditLimit;


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
            Loading customer statement...
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


  if (!statement) {
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
              Customer Statement
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              Statement data is unavailable.
            </p>
          </div>
        </main>
      </DashboardLayout>
    );
  }


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

        <div className="screen-statement">

        <style jsx global>{`
          #formal-customer-statement {
            display: none;
          }

          @media print {
            @page {
              size: A4 portrait;
              margin: 12mm;
            }

            html,
            body {
              background: #ffffff !important;
              color: #000000 !important;
            }

            body * {
              visibility: hidden !important;
            }

            #formal-customer-statement,
            #formal-customer-statement * {
              visibility: visible !important;
            }

            #formal-customer-statement {
              display: block !important;
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              min-height: 100% !important;
              background: white !important;
              color: black !important;
              font-family:
                Arial,
                Helvetica,
                sans-serif !important;
            }

            .screen-statement {
              display: none !important;
            }

            .statement-no-break {
              break-inside: avoid;
              page-break-inside: avoid;
            }

            .statement-table {
              width: 100%;
              border-collapse: collapse;
            }

            .statement-table th {
              border-top: 1px solid #111;
              border-bottom: 1px solid #111;
              padding: 7px 6px;
              font-size: 9px;
              font-weight: 700;
              text-align: left;
              text-transform: uppercase;
              letter-spacing: 0.02em;
            }

            .statement-table td {
              border-bottom: 1px solid #d7d7d7;
              padding: 8px 6px;
              font-size: 9.5px;
              vertical-align: top;
            }

            .statement-table th.numeric,
            .statement-table td.numeric {
              text-align: right;
            }
          }
        `}</style>


        <div className="print-hide mb-6">
          <button
            type="button"
            onClick={() =>
              router.push(
                "/accounting/debtors"
              )
            }
            className="text-sm font-medium"
          >
            ← Customers / Debtors
          </button>
        </div>


        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">

          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Accounting
            </p>

            <h1 className="mt-1 text-3xl font-bold">
              Customer Statement
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              {statement.customer.customer_name}
              {" · "}
              {statement.customer.customer_number}
            </p>
          </div>


          <div className="print-hide flex flex-wrap items-end gap-3">

            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">
                From
              </span>

              <input
                type="date"
                value={
                  startDate
                }
                onChange={
                  (
                    event
                  ) =>
                    setStartDate(
                      event.target
                        .value
                    )
                }
                className="rounded-md border bg-background px-3 py-2"
              />
            </label>


            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">
                To
              </span>

              <input
                type="date"
                value={
                  endDate
                }
                onChange={
                  (
                    event
                  ) =>
                    setEndDate(
                      event.target
                        .value
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


            <Button
              type="button"
              className="bg-black text-white hover:bg-black/85"
              onClick={
                printStatement
              }
            >
              Print Statement
            </Button>

          </div>

        </div>


        <div className="print-hide">
          <AccountingNav />
        </div>


        {errorMessage && (
          <div className="print-hide mb-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        )}


        <section className="mb-8 rounded-xl border bg-card p-6">

          <div className="flex flex-wrap items-start justify-between gap-6">

            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Statement For
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                {statement.customer.customer_name}
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                {statement.customer.customer_number}
              </p>


              {(statement.customer.address_line_1 ||
                statement.customer.city) && (
                <div className="mt-4 text-sm leading-6 text-muted-foreground">

                  {statement.customer.address_line_1 && (
                    <p>
                      {statement.customer.address_line_1}
                    </p>
                  )}

                  {statement.customer.address_line_2 && (
                    <p>
                      {statement.customer.address_line_2}
                    </p>
                  )}

                  <p>
                    {[
                      statement.customer.city,
                      statement.customer.province,
                      statement.customer.postal_code,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>

                </div>
              )}

            </div>


            <div className="text-sm">
              <p className="font-bold">
                {companyName}
              </p>

              <p className="mt-3 text-muted-foreground">
                Statement period
              </p>

              <p className="font-medium">
                {formatDate(
                  statement.start_date
                )}
                {" – "}
                {formatDate(
                  statement.end_date
                )}
              </p>
            </div>

          </div>

        </section>


        <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Opening Balance
            </p>

            <p className="mt-2 text-2xl font-bold">
              {formatCurrency(
                statement.summary
                  .opening_balance,
                currency
              )}
            </p>
          </div>


          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Invoices / Debits
            </p>

            <p className="mt-2 text-2xl font-bold">
              {formatCurrency(
                statement.summary
                  .period_debits,
                currency
              )}
            </p>
          </div>


          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Payments / Credits
            </p>

            <p className="mt-2 text-2xl font-bold">
              {formatCurrency(
                statement.summary
                  .period_credits,
                currency
              )}
            </p>
          </div>


          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Closing Balance
            </p>

            <p className="mt-2 text-2xl font-bold">
              {formatCurrency(
                statement.summary
                  .closing_balance,
                currency
              )}
            </p>
          </div>

        </section>


        <section className="mb-8 grid gap-4 md:grid-cols-3">

          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Operational Balance
            </p>

            <p className="mt-2 text-xl font-bold">
              {formatCurrency(
                statement.summary
                  .operational_balance,
                currency
              )}
            </p>
          </div>


          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Reconciliation
            </p>

            <p className="mt-2 text-xl font-bold">
              {statement.summary
                .reconciled
                ? "Reconciled"
                : "Review Required"}
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              Difference:{" "}
              {formatCurrency(
                statement.summary
                  .difference,
                currency
              )}
            </p>
          </div>


          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Credit Status
            </p>

            <p className="mt-2 text-xl font-bold">
              {creditLimit <= 0
                ? "No Credit Limit"
                : creditExceeded
                  ? "Limit Exceeded"
                  : "Within Limit"}
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              {creditLimit > 0
                ? `${formatCurrency(
                    creditAvailable ??
                    0,
                    currency
                  )} available of ${formatCurrency(
                    creditLimit,
                    currency
                  )}`
                : `${statement.customer.payment_terms_days} day payment terms`}
            </p>
          </div>

        </section>


        <section className="mb-10">

          <div className="mb-4">
            <h2 className="text-xl font-semibold">
              Statement Transactions
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Posted Trade Debtors ledger movements
              with a running customer balance.
            </p>
          </div>


          <DataTable
            headers={[
              "Date",
              "Type",
              "Reference",
              "Description",
              "Debit",
              "Credit",
              "Balance",
              "Action",
            ]}
            rows={
              statement.transactions.map(
                (
                  transaction
                ) => [

                  formatDate(
                    transaction.entry_date
                  ),

                  transactionType(
                    transaction.source_type
                  ),

                  transaction.invoice_number ??
                    transaction.reference ??
                    transaction.entry_number,

                  transaction.description ??
                    "—",

                  transaction.debit > 0
                    ? formatCurrency(
                        transaction.debit,
                        currency
                      )
                    : "—",

                  transaction.credit > 0
                    ? formatCurrency(
                        transaction.credit,
                        currency
                      )
                    : "—",

                  formatCurrency(
                    transaction.running_balance,
                    currency
                  ),

                  transaction.invoice_id
                    ? (
                      <Button
                        key={
                          transaction.journal_id
                        }
                        type="button"
                        size="sm"
                        variant="outline"
                        className="print-hide"
                        onClick={() =>
                          router.push(
                            `/invoices/${transaction.invoice_id}`
                          )
                        }
                      >
                        Open
                      </Button>
                    )
                    : "—",
                ]
              )
            }
            emptyMessage="No customer ledger transactions exist in this statement period."
          />

        </section>


        <section className="mb-10">

          <div className="mb-4">
            <h2 className="text-xl font-semibold">
              Outstanding Invoices
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Invoices still outstanding as at{" "}
              {formatDate(
                statement.end_date
              )}.
            </p>
          </div>


          <DataTable
            headers={[
              "Invoice",
              "Invoice Date",
              "Due Date",
              "Original",
              "Paid",
              "Outstanding",
              "Days Overdue",
              "Action",
            ]}
            rows={
              statement.open_invoices.map(
                (
                  invoice
                ) => [

                  invoice.invoice_number,

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

                  invoice.days_overdue >
                  0
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
                    className="print-hide"
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
            emptyMessage="This customer has no outstanding invoices as at the selected date."
          />

        </section>


        <section className="mb-10">

          <div className="mb-4">
            <h2 className="text-xl font-semibold">
              Actual Payment History
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Actual money received from the
              customer. Scheduled instalments are
              not shown as payments unless money
              was actually received.
            </p>
          </div>


          <DataTable
            headers={[
              "Date",
              "Invoice",
              "Method",
              "Reference",
              "Amount",
            ]}
            rows={
              statement.payments.map(
                (
                  payment
                ) => [

                  formatDate(
                    payment.payment_date
                  ),

                  payment.invoice_number,

                  paymentMethodLabel(
                    payment.payment_method
                  ),

                  payment.reference ??
                    "—",

                  formatCurrency(
                    payment.amount,
                    currency
                  ),
                ]
              )
            }
            emptyMessage="No actual payments have been recorded for this customer."
          />

        </section>


        <DebtorPaymentPromises
          customerId={
            customerId
          }
          canManage={
            can(
              "accounting.debtors.manage"
            )
          }
          outstanding={
            Math.max(
              closingBalance,
              0
            )
          }
          currency={
            currency
          }
          onChanged={() =>
            setCollectionRefreshKey(
              (
                value
              ) =>
                value + 1
            )
          }
        />


        <DebtorCollectionPanel
          key={`${customerId}-${collectionRefreshKey}`}
          customerId={
            customerId
          }
          canManage={
            can(
              "accounting.debtors.manage"
            )
          }
        />


        <section className="rounded-xl border bg-muted/20 p-5">

          <h2 className="font-semibold">
            Statement Control
          </h2>

          <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
            This statement is derived from
            posted Trade Debtors ledger entries
            and independently checked against
            customer invoices and actual payment
            records.
          </p>

        </section>

        </div>

        <section
          id="formal-customer-statement"
        >
          <div
            style={{
              padding:
                "4mm 2mm 0 2mm",
            }}
          >

            {/* COMPANY HEADER */}
            <div
              className="statement-no-break"
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                gap: "24px",
                borderBottom:
                  "3px solid #111",
                paddingBottom:
                  "14px",
              }}
            >

              <div>
                <div
                  style={{
                    fontSize: "22px",
                    fontWeight: 800,
                    letterSpacing:
                      "-0.02em",
                  }}
                >
                  {companyName}
                </div>

                <div
                  style={{
                    marginTop: "5px",
                    fontSize: "10px",
                    color: "#555",
                  }}
                >
                  CUSTOMER ACCOUNT STATEMENT
                </div>
              </div>


              <div
                style={{
                  textAlign: "right",
                  fontSize: "10px",
                  lineHeight: 1.6,
                }}
              >
                <div>
                  <strong>
                    Statement Date
                  </strong>
                </div>

                <div>
                  {formatDate(
                    statement.end_date
                  )}
                </div>

                <div
                  style={{
                    marginTop: "4px",
                  }}
                >
                  <strong>
                    Currency
                  </strong>
                  {" "}
                  {currency}
                </div>
              </div>

            </div>


            {/* CUSTOMER + STATEMENT INFO */}
            <div
              className="statement-no-break"
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1fr 1fr",
                gap: "28px",
                marginTop: "18px",
              }}
            >

              <div>
                <div
                  style={{
                    fontSize: "9px",
                    fontWeight: 700,
                    textTransform:
                      "uppercase",
                    color: "#666",
                  }}
                >
                  Statement For
                </div>

                <div
                  style={{
                    marginTop: "7px",
                    fontSize: "15px",
                    fontWeight: 700,
                  }}
                >
                  {
                    statement.customer
                      .customer_name
                  }
                </div>

                <div
                  style={{
                    marginTop: "3px",
                    fontSize: "10px",
                  }}
                >
                  Customer No:{" "}
                  {
                    statement.customer
                      .customer_number
                  }
                </div>

                {statement.customer
                  .contact_person && (
                  <div
                    style={{
                      marginTop: "3px",
                      fontSize: "10px",
                    }}
                  >
                    Contact:{" "}
                    {
                      statement.customer
                        .contact_person
                    }
                  </div>
                )}

                {statement.customer
                  .address_line_1 && (
                  <div
                    style={{
                      marginTop: "8px",
                      fontSize: "10px",
                      lineHeight: 1.5,
                    }}
                  >
                    <div>
                      {
                        statement.customer
                          .address_line_1
                      }
                    </div>

                    {statement.customer
                      .address_line_2 && (
                      <div>
                        {
                          statement.customer
                            .address_line_2
                        }
                      </div>
                    )}

                    <div>
                      {[
                        statement.customer
                          .city,
                        statement.customer
                          .province,
                        statement.customer
                          .postal_code,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </div>
                  </div>
                )}
              </div>


              <div>
                <table
                  style={{
                    width: "100%",
                    borderCollapse:
                      "collapse",
                    fontSize: "10px",
                  }}
                >
                  <tbody>

                    <tr>
                      <td
                        style={{
                          padding:
                            "4px 0",
                          color: "#666",
                        }}
                      >
                        Statement Period
                      </td>

                      <td
                        style={{
                          padding:
                            "4px 0",
                          textAlign:
                            "right",
                          fontWeight: 600,
                        }}
                      >
                        {formatDate(
                          statement.start_date
                        )}
                        {" – "}
                        {formatDate(
                          statement.end_date
                        )}
                      </td>
                    </tr>


                    <tr>
                      <td
                        style={{
                          padding:
                            "4px 0",
                          color: "#666",
                        }}
                      >
                        Payment Terms
                      </td>

                      <td
                        style={{
                          padding:
                            "4px 0",
                          textAlign:
                            "right",
                          fontWeight: 600,
                        }}
                      >
                        {
                          statement.customer
                            .payment_terms_days
                        }{" "}
                        days
                      </td>
                    </tr>


                    <tr>
                      <td
                        style={{
                          padding:
                            "4px 0",
                          color: "#666",
                        }}
                      >
                        Credit Limit
                      </td>

                      <td
                        style={{
                          padding:
                            "4px 0",
                          textAlign:
                            "right",
                          fontWeight: 600,
                        }}
                      >
                        {creditLimit > 0
                          ? formatCurrency(
                              creditLimit,
                              currency
                            )
                          : "No limit"}
                      </td>
                    </tr>


                    <tr>
                      <td
                        style={{
                          padding:
                            "4px 0",
                          color: "#666",
                        }}
                      >
                        Account Status
                      </td>

                      <td
                        style={{
                          padding:
                            "4px 0",
                          textAlign:
                            "right",
                          fontWeight: 700,
                        }}
                      >
                        {closingBalance <=
                        0
                          ? "PAID"
                          : "AMOUNT DUE"}
                      </td>
                    </tr>

                  </tbody>
                </table>
              </div>

            </div>


            {/* BALANCE SUMMARY */}
            <div
              className="statement-no-break"
              style={{
                marginTop: "22px",
                borderTop:
                  "1px solid #111",
                borderBottom:
                  "1px solid #111",
                padding:
                  "12px 0",
                display: "grid",
                gridTemplateColumns:
                  "repeat(4, 1fr)",
                gap: "16px",
              }}
            >

              <div>
                <div
                  style={{
                    fontSize: "8px",
                    color: "#666",
                    textTransform:
                      "uppercase",
                  }}
                >
                  Opening Balance
                </div>

                <div
                  style={{
                    marginTop: "5px",
                    fontWeight: 700,
                    fontSize: "12px",
                  }}
                >
                  {formatCurrency(
                    statement.summary
                      .opening_balance,
                    currency
                  )}
                </div>
              </div>


              <div>
                <div
                  style={{
                    fontSize: "8px",
                    color: "#666",
                    textTransform:
                      "uppercase",
                  }}
                >
                  Invoices / Debits
                </div>

                <div
                  style={{
                    marginTop: "5px",
                    fontWeight: 700,
                    fontSize: "12px",
                  }}
                >
                  {formatCurrency(
                    statement.summary
                      .period_debits,
                    currency
                  )}
                </div>
              </div>


              <div>
                <div
                  style={{
                    fontSize: "8px",
                    color: "#666",
                    textTransform:
                      "uppercase",
                  }}
                >
                  Payments / Credits
                </div>

                <div
                  style={{
                    marginTop: "5px",
                    fontWeight: 700,
                    fontSize: "12px",
                  }}
                >
                  {formatCurrency(
                    statement.summary
                      .period_credits,
                    currency
                  )}
                </div>
              </div>


              <div>
                <div
                  style={{
                    fontSize: "8px",
                    color: "#666",
                    textTransform:
                      "uppercase",
                  }}
                >
                  Closing Balance
                </div>

                <div
                  style={{
                    marginTop: "5px",
                    fontWeight: 800,
                    fontSize: "15px",
                  }}
                >
                  {formatCurrency(
                    statement.summary
                      .closing_balance,
                    currency
                  )}
                </div>
              </div>

            </div>


            {/* TRANSACTION TABLE */}
            <div
              style={{
                marginTop: "24px",
              }}
            >

              <div
                style={{
                  marginBottom: "8px",
                  fontSize: "11px",
                  fontWeight: 700,
                }}
              >
                Account Transactions
              </div>


              <table className="statement-table">

                <thead>
                  <tr>
                    <th>
                      Date
                    </th>

                    <th>
                      Transaction
                    </th>

                    <th>
                      Reference
                    </th>

                    <th className="numeric">
                      Debit
                    </th>

                    <th className="numeric">
                      Credit
                    </th>

                    <th className="numeric">
                      Balance
                    </th>
                  </tr>
                </thead>


                <tbody>

                  {statement.transactions
                    .length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          textAlign:
                            "center",
                          padding:
                            "20px 6px",
                        }}
                      >
                        No account transactions
                        for this period.
                      </td>
                    </tr>
                  ) : (
                    statement.transactions.map(
                      (
                        transaction
                      ) => (
                        <tr
                          key={
                            transaction.journal_id
                          }
                        >
                          <td>
                            {formatDate(
                              transaction.entry_date
                            )}
                          </td>

                          <td>
                            {transactionType(
                              transaction.source_type
                            )}

                            {transaction.payment_method && (
                              <div
                                style={{
                                  marginTop:
                                    "2px",
                                  fontSize:
                                    "8px",
                                  color:
                                    "#666",
                                }}
                              >
                                {paymentMethodLabel(
                                  transaction.payment_method
                                )}
                              </div>
                            )}
                          </td>

                          <td>
                            {transaction.invoice_number ??
                              transaction.payment_reference ??
                              transaction.reference ??
                              transaction.entry_number}
                          </td>

                          <td className="numeric">
                            {transaction.debit >
                            0
                              ? formatCurrency(
                                  transaction.debit,
                                  currency
                                )
                              : "—"}
                          </td>

                          <td className="numeric">
                            {transaction.credit >
                            0
                              ? formatCurrency(
                                  transaction.credit,
                                  currency
                                )
                              : "—"}
                          </td>

                          <td className="numeric">
                            <strong>
                              {formatCurrency(
                                transaction.running_balance,
                                currency
                              )}
                            </strong>
                          </td>
                        </tr>
                      )
                    )
                  )}

                </tbody>

              </table>

            </div>


            {/* AMOUNT DUE */}
            <div
              className="statement-no-break"
              style={{
                marginTop: "22px",
                display: "flex",
                justifyContent:
                  "flex-end",
              }}
            >

              <div
                style={{
                  width: "310px",
                  borderTop:
                    "2px solid #111",
                  borderBottom:
                    "2px solid #111",
                  padding:
                    "12px 0",
                }}
              >

                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    fontSize: "10px",
                  }}
                >
                  <span>
                    Operational Balance
                  </span>

                  <span>
                    {formatCurrency(
                      statement.summary
                        .operational_balance,
                      currency
                    )}
                  </span>
                </div>


                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    marginTop: "7px",
                    fontSize: "14px",
                    fontWeight: 800,
                  }}
                >
                  <span>
                    AMOUNT DUE
                  </span>

                  <span>
                    {formatCurrency(
                      Math.max(
                        statement.summary
                          .closing_balance,
                        0
                      ),
                      currency
                    )}
                  </span>
                </div>

              </div>

            </div>


            {/* OUTSTANDING INVOICES */}
            {statement.open_invoices
              .length > 0 && (
              <div
                className="statement-no-break"
                style={{
                  marginTop: "26px",
                }}
              >

                <div
                  style={{
                    marginBottom:
                      "8px",
                    fontSize: "11px",
                    fontWeight: 700,
                  }}
                >
                  Outstanding Invoices
                </div>


                <table className="statement-table">

                  <thead>
                    <tr>
                      <th>
                        Invoice
                      </th>

                      <th>
                        Date
                      </th>

                      <th>
                        Due Date
                      </th>

                      <th className="numeric">
                        Original
                      </th>

                      <th className="numeric">
                        Paid
                      </th>

                      <th className="numeric">
                        Outstanding
                      </th>
                    </tr>
                  </thead>


                  <tbody>
                    {statement.open_invoices.map(
                      (
                        invoice
                      ) => (
                        <tr
                          key={
                            invoice.invoice_id
                          }
                        >
                          <td>
                            {invoice.invoice_number}
                          </td>

                          <td>
                            {formatDate(
                              invoice.invoice_date
                            )}
                          </td>

                          <td>
                            {formatDate(
                              invoice.due_date
                            )}
                          </td>

                          <td className="numeric">
                            {formatCurrency(
                              invoice.invoice_total,
                              currency
                            )}
                          </td>

                          <td className="numeric">
                            {formatCurrency(
                              invoice.paid_to_date,
                              currency
                            )}
                          </td>

                          <td className="numeric">
                            <strong>
                              {formatCurrency(
                                invoice.outstanding,
                                currency
                              )}
                            </strong>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>

                </table>

              </div>
            )}


            {/* FOOTER */}
            <div
              className="statement-no-break"
              style={{
                marginTop: "32px",
                paddingTop: "10px",
                borderTop:
                  "1px solid #aaa",
                fontSize: "8.5px",
                lineHeight: 1.6,
                color: "#555",
              }}
            >

              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  gap: "30px",
                }}
              >

                <div>
                  <strong>
                    Account Reference:
                  </strong>{" "}
                  {
                    statement.customer
                      .customer_number
                  }
                </div>


                <div>
                  <strong>
                    Statement Period:
                  </strong>{" "}
                  {formatDate(
                    statement.start_date
                  )}
                  {" – "}
                  {formatDate(
                    statement.end_date
                  )}
                </div>

              </div>


              <div
                style={{
                  marginTop: "8px",
                }}
              >
                Please quote your customer
                number or invoice number when
                making payment or contacting
                the company regarding this
                account.
              </div>

            </div>

          </div>

        </section>

      </main>
    </DashboardLayout>
  );
}
