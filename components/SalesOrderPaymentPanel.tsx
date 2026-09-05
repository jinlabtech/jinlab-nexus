"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Button,
} from "@/components/ui/button";

import {
  getSalesOrderPaymentSummary,
  recordSalesOrderPayment,
} from "@/lib/services/salesService";

import {
  usePermissions,
} from "@/hooks/usePermissions";

import type {
  SalesOrderPaymentMethod,
  SalesOrderPaymentSummary,
} from "@/lib/services/salesService";


type Props = {
  salesOrderId: string;
};


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
  value: number
) {
  return new Intl.NumberFormat(
    "en-ZA",
    {
      style: "currency",
      currency: "ZAR",
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


function methodLabel(
  value:
    SalesOrderPaymentMethod
) {
  switch (value) {
    case "cash":
      return "Cash";

    case "eft":
      return "EFT";

    case "card":
      return "Card";

    case "other":
      return "Other";

    default:
      return value;
  }
}


function basisLabel(
  value?: string | null
) {
  switch (value) {
    case "credit":
      return "Credit";

    case "immediate":
      return "Pay Now";

    case "prepaid":
      return "Prepaid";

    default:
      return "Not selected";
  }
}


export default function SalesOrderPaymentPanel({
  salesOrderId,
}: Props) {

  const {
    can,
    loading:
      permissionsLoading,
  } =
    usePermissions();


  const canRecord =
    can(
      "sales.payment.record"
    );


  const [
    summary,
    setSummary,
  ] =
    useState<
      SalesOrderPaymentSummary |
      null
    >(null);


  const [
    loading,
    setLoading,
  ] =
    useState(true);


  const [
    recording,
    setRecording,
  ] =
    useState(false);


  const [
    paymentDate,
    setPaymentDate,
  ] =
    useState(
      localToday()
    );


  const [
    paymentMethod,
    setPaymentMethod,
  ] =
    useState<
      SalesOrderPaymentMethod | ""
    >("");


  const [
    amount,
    setAmount,
  ] =
    useState("");


  const [
    reference,
    setReference,
  ] =
    useState("");


  const [
    notes,
    setNotes,
  ] =
    useState("");


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


  async function loadSummary() {
    try {
      setLoading(true);
      setErrorMessage("");
      setSummary(null);

      const result =
        await getSalesOrderPaymentSummary(
          salesOrderId
        );

      setSummary(result);

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Payment information could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    void loadSummary();
  }, [
    salesOrderId,
  ]);


  async function recordPayment() {
    if (
      !summary ||
      !paymentMethod
    ) {
      return;
    }


    try {
      setRecording(true);

      setErrorMessage("");
      setSuccessMessage("");


      const numericAmount =
        Number(
          amount
        );


      if (
        !Number.isFinite(
          numericAmount
        ) ||
        numericAmount <= 0
      ) {
        throw new Error(
          "Enter a valid payment amount greater than zero."
        );
      }


      if (
        numericAmount >
        Number(
          summary.balance_due
        ) + 0.009
      ) {
        throw new Error(
          `Payment cannot exceed the remaining balance of ${formatCurrency(
            Number(
              summary.balance_due
            )
          )}.`
        );
      }


      if (
        paymentMethod !==
          "cash" &&
        !reference.trim()
      ) {
        throw new Error(
          "Enter a payment reference for EFT, Card or Other payments."
        );
      }


      await recordSalesOrderPayment(
        salesOrderId,
        {
          paymentDate,

          paymentMethod,

          reference:
            reference.trim() ||
            null,

          amount:
            numericAmount,

          notes:
            notes.trim() ||
            null,
        }
      );


      setAmount("");
      setReference("");
      setNotes("");

      const refreshed =
        await getSalesOrderPaymentSummary(
          salesOrderId
        );

      setSummary(
        refreshed
      );


      setSuccessMessage(
        `Payment of ${formatCurrency(
          numericAmount
        )} recorded successfully.`
      );

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Payment could not be recorded."
      );
    } finally {
      setRecording(false);
    }
  }


  if (
    loading ||
    permissionsLoading
  ) {
    return (
      <section className="mb-6 rounded-xl border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          Loading payment information...
        </p>
      </section>
    );
  }


  if (!summary) {
    return (
      <section className="mb-6 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">
          Payments
        </h2>

        <p className="mt-2 text-sm text-destructive">
          {errorMessage ||
            "Payment information is unavailable."}
        </p>
      </section>
    );
  }


  const balance =
    Number(
      summary.balance_due
    );


  return (
    <section className="mb-6 rounded-xl border bg-card p-5">

      <div className="flex flex-wrap items-start justify-between gap-4">

        <div>
          <p className="text-sm font-medium text-primary">
            Payments
          </p>

          <h2 className="mt-1 text-xl font-semibold">
            Sales Order Payment
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Prepaid orders can receive an advance here.
            Pay Now and Credit payments are recorded after invoicing.
          </p>
        </div>


        <div className="flex flex-wrap gap-2">

          <span className="rounded-full border px-3 py-1 text-xs font-medium">
            {basisLabel(
              summary.payment_basis
            )}
          </span>


          {summary.fully_paid ? (
            <span className="rounded-full border px-3 py-1 text-xs font-bold">
              FULLY PAID
            </span>
          ) : (
            <span className="rounded-full border px-3 py-1 text-xs font-medium">
              PAYMENT OUTSTANDING
            </span>
          )}

        </div>

      </div>


      {errorMessage && (
        <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}


      {successMessage && (
        <div className="mt-5 rounded-lg border bg-muted/30 p-3 text-sm">
          {successMessage}
        </div>
      )}


      <div className="mt-6 grid gap-4 sm:grid-cols-3">

        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            Order Total
          </p>

          <p className="mt-2 text-xl font-bold">
            {formatCurrency(
              Number(
                summary.order_total
              )
            )}
          </p>
        </div>


        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            Received
          </p>

          <p className="mt-2 text-xl font-bold">
            {formatCurrency(
              Number(
                summary.amount_paid
              )
            )}
          </p>
        </div>


        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            Remaining
          </p>

          <p className="mt-2 text-xl font-bold">
            {formatCurrency(
              balance
            )}
          </p>
        </div>

      </div>


      {!summary.payment_basis && (
        <div className="mt-5 rounded-lg border p-4 text-sm">
          Select and save a payment basis before
          recording money against this order.
        </div>
      )}


      {canRecord &&
        summary.payment_basis === "prepaid" &&
        !summary.fully_paid && (

        <div className="mt-6 rounded-lg border p-5">

          <h3 className="font-semibold">
            Record Advance Payment
          </h3>


          <div className="mt-4 grid gap-4 sm:grid-cols-2">

            <label className="text-sm">
              <span className="mb-1 block font-medium">
                Actual Payment Date
              </span>

              <input
                type="date"
                value={
                  paymentDate
                }
                onChange={
                  event =>
                    setPaymentDate(
                      event.target.value
                    )
                }
                className="h-10 w-full rounded-md border bg-background px-3"
              />
            </label>


            <label className="text-sm">
              <span className="mb-1 block font-medium">
                Payment Method
              </span>

              <select
                value={
                  paymentMethod
                }
                onChange={
                  event =>
                    setPaymentMethod(
                      event.target
                        .value as
                        SalesOrderPaymentMethod | ""
                    )
                }
                className="h-10 w-full rounded-md border bg-background px-3"
              >
                <option value="">
                  Select method
                </option>

                <option value="cash">
                  Cash
                </option>

                <option value="eft">
                  EFT
                </option>

                <option value="card">
                  Card
                </option>

                <option value="other">
                  Other
                </option>
              </select>
            </label>


            <label className="text-sm">
              <span className="mb-1 block font-medium">
                Amount
              </span>

              <input
                type="number"
                min="0.01"
                step="0.01"
                max={
                  balance
                }
                value={
                  amount
                }
                onChange={
                  event =>
                    setAmount(
                      event.target.value
                    )
                }
                placeholder="0.00"
                className="h-10 w-full rounded-md border bg-background px-3"
              />

              <button
                type="button"
                onClick={() =>
                  setAmount(
                    balance.toFixed(2)
                  )
                }
                className="mt-2 text-xs font-medium text-primary hover:underline"
              >
                Use remaining balance
              </button>
            </label>


            <label className="text-sm">
              <span className="mb-1 block font-medium">
                Reference
              </span>

              <input
                type="text"
                value={
                  reference
                }
                onChange={
                  event =>
                    setReference(
                      event.target.value
                    )
                }
                placeholder={
                  paymentMethod ===
                    "cash"
                    ? "Optional for cash"
                    : "Bank / card / payment reference"
                }
                className="h-10 w-full rounded-md border bg-background px-3"
              />
            </label>

          </div>


          <label className="mt-4 block text-sm">
            <span className="mb-1 block font-medium">
              Notes
            </span>

            <textarea
              rows={3}
              value={
                notes
              }
              onChange={
                event =>
                  setNotes(
                    event.target.value
                  )
              }
              placeholder="Optional payment notes..."
              className="w-full rounded-md border bg-background px-3 py-2"
            />
          </label>


          <div className="mt-4 flex justify-end">

            <Button
              type="button"
              className="bg-black text-white hover:bg-black/85"
              disabled={
                recording ||
                !paymentMethod ||
                !amount
              }
              onClick={
                recordPayment
              }
            >
              {recording
                ? "Recording..."
                : "Record Payment"}
            </Button>

          </div>

        </div>
      )}


      <div className="mt-6">

        <h3 className="font-semibold">
          Payment History
        </h3>

        <p className="mt-1 text-sm text-muted-foreground">
          Actual receipts only. Scheduled payments
          are not included here.
        </p>


        {summary.payments.length ===
        0 ? (
          <div className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No payments have been recorded.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">

            <table className="w-full text-sm">

              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="p-3 text-left">
                    Date
                  </th>

                  <th className="p-3 text-left">
                    Method
                  </th>

                  <th className="p-3 text-left">
                    Reference
                  </th>

                  <th className="p-3 text-right">
                    Amount
                  </th>
                </tr>
              </thead>


              <tbody>

                {summary.payments.map(
                  payment => (
                    <tr
                      key={
                        payment.id
                      }
                      className="border-b last:border-0"
                    >
                      <td className="p-3">
                        {formatDate(
                          payment.payment_date
                        )}
                      </td>

                      <td className="p-3">
                        {methodLabel(
                          payment.payment_method
                        )}
                      </td>

                      <td className="p-3">
                        {payment.reference ??
                          "—"}
                      </td>

                      <td className="p-3 text-right font-medium">
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

      </div>

    </section>
  );
}
