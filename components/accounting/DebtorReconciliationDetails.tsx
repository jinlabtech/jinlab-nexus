"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import DataTable from "@/components/DataTable";
import DebtorRepairPreview from "@/components/accounting/DebtorRepairPreview";

import {
  Button,
} from "@/components/ui/button";

import {
  getDebtorReconciliationDiagnostics,
} from "@/lib/services/accountingService";

import type {
  DebtorReconciliationResult,
} from "@/lib/services/accountingService";


type Props = {
  asOfDate: string;
  currency?: string;
};


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


function statusLabel(
  status: string
) {
  switch (status) {
    case "invoice_not_posted":
      return "Invoice Not Posted";

    case "payments_not_posted":
      return "Payment Not Posted";

    case "ledger_mismatch":
      return "Ledger Mismatch";

    case "reconciled":
      return "Reconciled";

    default:
      return status;
  }
}


export default function DebtorReconciliationDetails({
  asOfDate,
  currency = "ZAR",
}: Props) {
  const router =
    useRouter();

  const [
    result,
    setResult,
  ] =
    useState<
      DebtorReconciliationResult |
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
    repairInvoiceId,
    setRepairInvoiceId,
  ] =
    useState<
      string | null
    >(null);


  async function load(
    silent = false
  ) {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setErrorMessage("");

      const data =
        await getDebtorReconciliationDiagnostics(
          asOfDate
        );

      setResult(data);

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Debtor reconciliation diagnostics could not be loaded."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }


  useEffect(() => {
    void load();
  }, [
    asOfDate,
  ]);


  if (loading) {
    return (
      <section className="mt-10 rounded-xl border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          Analysing debtor reconciliation...
        </p>
      </section>
    );
  }


  if (errorMessage) {
    return (
      <section className="mt-10 rounded-xl border border-destructive/30 bg-destructive/10 p-5">
        <p className="text-sm text-destructive">
          {errorMessage}
        </p>
      </section>
    );
  }


  if (!result) {
    return null;
  }


  const summary =
    result.summary;


  return (
    <section className="mt-10">

      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">

        <div>
          <h2 className="text-xl font-semibold">
            Reconciliation Details
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Nexus compares each customer
            invoice and payment against the
            Trade Debtors control account.
          </p>
        </div>


        <Button
          type="button"
          variant="outline"
          disabled={
            refreshing
          }
          onClick={() =>
            void load(true)
          }
        >
          {refreshing
            ? "Checking..."
            : "Recheck"}
        </Button>

      </div>


      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Operational Debtors
          </p>

          <p className="mt-2 text-xl font-bold">
            {formatCurrency(
              summary.operational_debtors,
              currency
            )}
          </p>
        </div>


        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Ledger Debtors
          </p>

          <p className="mt-2 text-xl font-bold">
            {formatCurrency(
              summary.ledger_debtors,
              currency
            )}
          </p>
        </div>


        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Difference
          </p>

          <p className="mt-2 text-xl font-bold">
            {formatCurrency(
              summary.difference,
              currency
            )}
          </p>
        </div>


        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Problems Found
          </p>

          <p className="mt-2 text-xl font-bold">
            {summary.problem_invoice_count}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Missing invoices:{" "}
            {
              summary
                .missing_invoice_journal_count
            }
            {" · "}
            Missing payments:{" "}
            {
              summary
                .missing_payment_journal_count
            }
          </p>
        </div>

      </div>


      {Math.abs(
        summary.unlinked_ledger_adjustment
      ) >= 0.01 && (
        <div className="mb-6 rounded-xl border p-4 text-sm">
          <span className="font-semibold">
            Unlinked ledger amount:
          </span>{" "}
          {formatCurrency(
            summary.unlinked_ledger_adjustment,
            currency
          )}
          . This may represent a manual
          journal or another debtor entry
          not linked directly to an invoice.
        </div>
      )}


      <DataTable
        headers={[
          "Invoice",
          "Customer",
          "Invoice Total",
          "Payments",
          "Operational",
          "Ledger",
          "Difference",
          "Invoice Journal",
          "Payment Journals",
          "Diagnosis",
          "Actions",
        ]}
        rows={
          result.invoices.map(
            (invoice) => [

              invoice.invoice_number,

              <div
                key={
                  invoice.customer_id
                }
              >
                <p className="font-medium">
                  {invoice.customer_name}
                </p>

                <p className="text-xs text-muted-foreground">
                  {invoice.customer_number}
                </p>
              </div>,

              formatCurrency(
                invoice.invoice_total,
                currency
              ),

              formatCurrency(
                invoice.payments_to_date,
                currency
              ),

              formatCurrency(
                invoice.operational_balance,
                currency
              ),

              formatCurrency(
                invoice.ledger_balance,
                currency
              ),

              formatCurrency(
                invoice.difference,
                currency
              ),

              invoice.invoice_journal_posted
                ? "Posted"
                : "Missing",

              `${invoice.posted_payment_count}/${invoice.expected_payment_count}`,

              statusLabel(
                invoice.diagnostic_status
              ),

              <div
                key={
                  invoice.invoice_id
                }
                className="flex flex-wrap gap-2"
              >
                <Button
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
                </Button>

                {invoice.diagnostic_status !==
                  "reconciled" && (
                  <Button
                    type="button"
                    size="sm"
                    className="bg-black text-white hover:bg-black/85"
                    onClick={() =>
                      setRepairInvoiceId(
                        invoice.invoice_id
                      )
                    }
                  >
                    Preview Repair
                  </Button>
                )}
              </div>,
            ]
          )
        }
        emptyMessage="No debtor reconciliation records found."
      />


      {repairInvoiceId && (
        <DebtorRepairPreview
          invoiceId={
            repairInvoiceId
          }
          currency={
            currency
          }
          onClose={() =>
            setRepairInvoiceId(
              null
            )
          }
          onRepairComplete={async () => {
            await load(true);
          }}
        />
      )}


      {summary.reconciled && (
        <div className="mt-6 rounded-xl border bg-muted/20 p-4">
          <p className="text-sm font-semibold">
            Debtors Reconciled
          </p>

          <p className="mt-1 text-sm text-muted-foreground">
            Operational customer balances
            agree with the Trade Debtors
            control account for this date.
          </p>
        </div>
      )}

    </section>
  );
}
