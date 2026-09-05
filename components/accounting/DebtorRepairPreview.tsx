"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Button,
} from "@/components/ui/button";

import {
  previewInvoiceAccountingRepair,
  repairInvoiceAccountingHistory,
} from "@/lib/services/accountingService";

import type {
  InvoiceAccountingRepairPreview,
} from "@/lib/services/accountingService";


type Props = {
  invoiceId: string;
  currency?: string;

  onClose: () => void;

  onRepairComplete?: () =>
    void | Promise<void>;
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
  value: string
) {
  switch (
    value.toLowerCase()
  ) {
    case "eft":
      return "EFT";

    case "cash":
      return "Cash";

    case "card":
      return "Card";

    default:
      return value;
  }
}


export default function DebtorRepairPreview({
  invoiceId,
  currency = "ZAR",
  onClose,
  onRepairComplete,
}: Props) {
  const [
    preview,
    setPreview,
  ] =
    useState<
      InvoiceAccountingRepairPreview |
      null
    >(null);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    repairing,
    setRepairing,
  ] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] =
    useState("");


  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setErrorMessage("");

        const data =
          await previewInvoiceAccountingRepair(
            invoiceId
          );

        setPreview(data);

      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Repair preview could not be loaded."
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [
    invoiceId,
  ]);


  async function repair() {
    if (
      !preview ||
      !preview.repairable
    ) {
      return;
    }


    const confirmed =
      window.confirm(
        `Repair accounting history for ${preview.invoice_number}?\n\n` +
        `${preview.entries_to_create} journal entries will be created using the original transaction dates.`
      );


    if (!confirmed) {
      return;
    }


    try {
      setRepairing(true);

      setErrorMessage("");
      setSuccessMessage("");


      const result =
        await repairInvoiceAccountingHistory(
          preview.invoice_id
        );


      if (
        result.already_reconciled
      ) {
        setSuccessMessage(
          "This invoice was already fully reconciled."
        );
      } else {
        setSuccessMessage(
          `${result.total_journals_created} accounting journal entries were created successfully.`
        );
      }


      const refreshed =
        await previewInvoiceAccountingRepair(
          preview.invoice_id
        );

      setPreview(
        refreshed
      );


      if (
        onRepairComplete
      ) {
        await onRepairComplete();
      }

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Historical accounting repair failed."
      );
    } finally {
      setRepairing(false);
    }
  }


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">

      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border bg-background shadow-xl">

        <div className="flex items-start justify-between gap-4 border-b p-6">

          <div>
            <p className="text-sm text-muted-foreground">
              Historical Accounting
            </p>

            <h2 className="mt-1 text-2xl font-bold">
              Preview Repair
            </h2>
          </div>


          <Button
            type="button"
            variant="outline"
            onClick={
              onClose
            }
          >
            Close
          </Button>

        </div>


        <div className="p-6">

          {loading && (
            <p className="text-sm text-muted-foreground">
              Analysing historical accounting...
            </p>
          )}


          {errorMessage && (
            <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {errorMessage}
            </div>
          )}


          {successMessage && (
            <div className="mb-5 rounded-xl border bg-muted/30 p-4 text-sm font-medium">
              {successMessage}
            </div>
          )}


          {!loading &&
            preview && (
            <>
              <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

                <div className="rounded-xl border p-4">
                  <p className="text-xs text-muted-foreground">
                    Invoice
                  </p>

                  <p className="mt-2 font-semibold">
                    {preview.invoice_number}
                  </p>
                </div>


                <div className="rounded-xl border p-4">
                  <p className="text-xs text-muted-foreground">
                    Customer
                  </p>

                  <p className="mt-2 font-semibold">
                    {preview.customer_name}
                  </p>
                </div>


                <div className="rounded-xl border p-4">
                  <p className="text-xs text-muted-foreground">
                    Invoice Date
                  </p>

                  <p className="mt-2 font-semibold">
                    {formatDate(
                      preview.invoice_date
                    )}
                  </p>
                </div>


                <div className="rounded-xl border p-4">
                  <p className="text-xs text-muted-foreground">
                    Invoice Total
                  </p>

                  <p className="mt-2 font-semibold">
                    {formatCurrency(
                      preview.invoice_total,
                      currency
                    )}
                  </p>
                </div>

              </div>


              <div className="mb-6 rounded-xl border p-5">

                <h3 className="font-semibold">
                  Accounting Repair Summary
                </h3>


                <div className="mt-4 grid gap-4 sm:grid-cols-3">

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Invoice Journal
                    </p>

                    <p className="mt-1 font-medium">
                      {preview.invoice_journal_posted
                        ? "Already Posted"
                        : "Will Be Created"}
                    </p>
                  </div>


                  <div>
                    <p className="text-xs text-muted-foreground">
                      Payment Journals
                    </p>

                    <p className="mt-1 font-medium">
                      {preview.posted_payment_count}
                      {" / "}
                      {preview.payment_count}
                      {" posted"}
                    </p>
                  </div>


                  <div>
                    <p className="text-xs text-muted-foreground">
                      Entries To Create
                    </p>

                    <p className="mt-1 text-xl font-bold">
                      {preview.entries_to_create}
                    </p>
                  </div>

                </div>

              </div>


              <div className="mb-6">

                <h3 className="font-semibold">
                  Actual Payments
                </h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  These are actual payment records,
                  not the original instalment schedule.
                </p>


                <div className="mt-4 overflow-hidden rounded-xl border">

                  <div className="overflow-x-auto">

                    <table className="w-full text-sm">

                      <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">
                            Date
                          </th>

                          <th className="px-4 py-3">
                            Method
                          </th>

                          <th className="px-4 py-3">
                            Reference
                          </th>

                          <th className="px-4 py-3 text-right">
                            Amount
                          </th>

                          <th className="px-4 py-3">
                            Ledger
                          </th>
                        </tr>
                      </thead>


                      <tbody>
                        {preview.payments.length ===
                        0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-4 py-6 text-center text-muted-foreground"
                            >
                              No payments have been recorded.
                            </td>
                          </tr>
                        ) : (
                          preview.payments.map(
                            (
                              payment
                            ) => (
                              <tr
                                key={
                                  payment.payment_id
                                }
                                className="border-t"
                              >
                                <td className="px-4 py-3">
                                  {formatDate(
                                    payment.payment_date
                                  )}
                                </td>

                                <td className="px-4 py-3">
                                  {paymentMethodLabel(
                                    payment.payment_method
                                  )}
                                </td>

                                <td className="px-4 py-3">
                                  {payment.reference ??
                                    "—"}
                                </td>

                                <td className="px-4 py-3 text-right font-medium">
                                  {formatCurrency(
                                    payment.amount,
                                    currency
                                  )}
                                </td>

                                <td className="px-4 py-3">
                                  {payment.journal_posted
                                    ? "Posted"
                                    : "Missing"}
                                </td>
                              </tr>
                            )
                          )
                        )}
                      </tbody>

                    </table>

                  </div>

                </div>

              </div>


              {!preview.repairable &&
                preview.reason && (
                <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4">

                  <p className="font-semibold">
                    Repair unavailable
                  </p>

                  <p className="mt-1 text-sm">
                    {preview.reason}
                  </p>

                </div>
              )}


              <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-5">

                <p className="max-w-xl text-xs leading-5 text-muted-foreground">
                  Nexus will preserve the original
                  invoice date, each actual payment
                  date and each recorded payment
                  method. Scheduled instalments that
                  were never actually paid will not
                  create accounting entries.
                </p>


                <Button
                  type="button"
                  disabled={
                    repairing ||
                    !preview.repairable ||
                    preview.entries_to_create ===
                      0
                  }
                  className="bg-black text-white hover:bg-black/85"
                  onClick={() =>
                    void repair()
                  }
                >
                  {repairing
                    ? "Repairing..."
                    : preview.entries_to_create ===
                      0
                      ? "Already Reconciled"
                      : "Repair Accounting"}
                </Button>

              </div>
            </>
          )}

        </div>

      </div>

    </div>
  );
}
