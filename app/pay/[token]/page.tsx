"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  getPublicPaymentLink,
  initiatePublicPayment,
  type PublicPaymentLinkData,
} from "@/lib/services/publicPaymentService";

function formatCurrency(
  value: number,
  currency = "ZAR"
) {
  return new Intl.NumberFormat(
    "en-ZA",
    {
      style: "currency",
      currency,
    }
  ).format(value);
}

function formatDate(
  value: string | null | undefined
) {
  if (!value) {
    return "—";
  }

  const dateOnly = value.slice(0, 10);

  return new Intl.DateTimeFormat(
    "en-ZA",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  ).format(
    new Date(
      `${dateOnly}T00:00:00`
    )
  );
}

export default function PublicPaymentPage() {
  const params = useParams();

  const token =
    String(params.token);

  const [
    data,
    setData,
  ] =
    useState<PublicPaymentLinkData | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );

  const [
    paymentMethod,
    setPaymentMethod,
  ] = useState("capitec_pay");

  const [
    customerAmount,
    setCustomerAmount,
  ] = useState("");

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    transactionMessage,
    setTransactionMessage,
  ] = useState<string | null>(null);

  const [
    pendingTransactionId,
    setPendingTransactionId,
  ] = useState<string | null>(null);

  const [
    simulatingPayment,
    setSimulatingPayment,
  ] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);

        const result =
          await getPublicPaymentLink(
            token
          );

        setData(result);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load payment request."
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [token]);

  async function simulateSuccessfulPayment() {
    if (!pendingTransactionId) {
      return;
    }

    try {
      setSimulatingPayment(true);
      setTransactionMessage(
        "Confirming development payment..."
      );

      const response =
        await fetch(
          "/api/dev/payments/simulate",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              transactionId:
                pendingTransactionId,
            }),
          }
        );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error ??
            "Unable to simulate payment."
        );
      }

      setTransactionMessage(
        "Payment verified successfully. Refreshing invoice status..."
      );

      /*
       * Reload the public payment data.
       * The invoice balance should now reflect
       * the authoritative invoice_payment.
       */
      const refreshed =
        await getPublicPaymentLink(
          token
        );

      setData(refreshed);

      setPendingTransactionId(
        null
      );

      setTransactionMessage(
        "Payment received successfully."
      );
    } catch (err) {
      setTransactionMessage(
        err instanceof Error
          ? err.message
          : "Unable to confirm payment."
      );
    } finally {
      setSimulatingPayment(false);
    }
  }

  async function continueToPayment() {
    if (
      !data?.ok ||
      !data.invoice ||
      !data.payment_link
    ) {
      return;
    }

    try {
      setSubmitting(true);
      setTransactionMessage(null);

      const link =
        data.payment_link;

      let amount =
        link.link_type ===
        "customer_entered"
          ? Number(customerAmount)
          : Number(
              link.amount ??
                data.invoice.balance_due
            );

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        throw new Error(
          "Enter a valid payment amount."
        );
      }

      if (
        link.link_type ===
          "customer_entered" &&
        link.minimum_amount != null &&
        amount <
          Number(
            link.minimum_amount
          )
      ) {
        throw new Error(
          "Amount is below the minimum allowed."
        );
      }

      if (
        link.link_type ===
          "customer_entered" &&
        link.maximum_amount != null &&
        amount >
          Number(
            link.maximum_amount
          )
      ) {
        throw new Error(
          "Amount exceeds the maximum allowed."
        );
      }

      if (
        amount >
        Number(
          data.invoice.balance_due
        )
      ) {
        throw new Error(
          "Amount exceeds the outstanding balance."
        );
      }

      const result =
        await initiatePublicPayment(
          token,
          "nexus",
          paymentMethod,
          amount
        );

      setPendingTransactionId(
        result.transaction.id
      );

      setTransactionMessage(
        `Payment request created. Transaction ${result.transaction.id.slice(
          0,
          8
        )} is pending provider processing.`
      );
    } catch (err) {
      setTransactionMessage(
        err instanceof Error
          ? err.message
          : "Unable to start payment."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-50 p-6">
        <div className="mx-auto max-w-xl rounded-2xl border bg-white p-8">
          Loading payment request...
        </div>
      </main>
    );
  }

  if (
    !error &&
    data?.reason === "invoice_paid" &&
    data.invoice &&
    data.company
  ) {
    const paidInvoice =
      data.invoice;

    return (
      <main className="min-h-screen bg-neutral-50 px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-xl">
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <div className="border-b border-neutral-200 px-6 py-6 sm:px-8">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">
                    {data.company.name}
                  </p>

                  {data.company.branch_name && (
                    <p className="mt-1 text-xs text-neutral-500">
                      {data.company.branch_name}
                    </p>
                  )}
                </div>

                <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
                  Paid
                </div>
              </div>
            </div>

            <div className="px-6 py-8 sm:px-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                <span className="text-2xl font-bold text-emerald-700">
                  ✓
                </span>
              </div>

              <h1 className="mt-5 text-2xl font-bold tracking-tight text-neutral-950">
                Payment Complete
              </h1>

              <p className="mt-2 text-sm leading-6 text-neutral-600">
                This invoice has been fully settled.
                No further payment is required.
              </p>

              <div className="mt-7 rounded-xl border border-neutral-200">
                <div className="border-b border-neutral-200 px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-neutral-500">
                        Invoice
                      </p>

                      <p className="mt-1 font-semibold text-neutral-950">
                        {paidInvoice.invoice_number}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-neutral-500">
                        Paid Date
                      </p>

                      <p className="mt-1 text-sm font-semibold text-neutral-950">
                        {formatDate(
                          paidInvoice.paid_at
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 px-4 py-4 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-neutral-500">
                      Invoice Total
                    </span>

                    <span className="font-semibold text-neutral-950">
                      {formatCurrency(
                        Number(
                          paidInvoice.total_amount
                        )
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-neutral-500">
                      Amount Paid
                    </span>

                    <span className="font-semibold text-neutral-950">
                      {formatCurrency(
                        Number(
                          paidInvoice.amount_paid
                        )
                      )}
                    </span>
                  </div>

                  <div className="border-t border-neutral-200 pt-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-semibold text-neutral-950">
                        Balance Due
                      </span>

                      <span className="text-lg font-bold text-neutral-950">
                        {formatCurrency(
                          Number(
                            paidInvoice.balance_due
                          )
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {data.customer?.name && (
                <div className="mt-5 text-sm">
                  <span className="text-neutral-500">
                    Customer
                  </span>

                  <p className="mt-1 font-medium text-neutral-900">
                    {data.customer.name}
                  </p>
                </div>
              )}

              <div className="mt-7 border-t border-neutral-200 pt-5">
                <p className="text-xs leading-5 text-neutral-500">
                  Payment has been recorded against this
                  invoice. This payment link can no longer
                  accept another payment.
                </p>
              </div>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-neutral-400">
            Secure payment powered by JINLAB Nexus
          </p>
        </div>
      </main>
    );
  }

  if (
    error ||
    !data ||
    !data.ok ||
    !data.invoice ||
    !data.payment_link ||
    !data.company
  ) {
    return (
      <main className="min-h-screen bg-neutral-50 p-6">
        <div className="mx-auto max-w-xl rounded-2xl border bg-white p-8">
          <h1 className="text-xl font-bold">
            Payment Link Unavailable
          </h1>

          <p className="mt-3 text-sm text-neutral-600">
            {error ??
              "This payment link is no longer available."}
          </p>

          {data?.reason && (
            <p className="mt-2 text-xs text-neutral-500">
              Status: {data.reason}
            </p>
          )}
        </div>
      </main>
    );
  }

  const {
    invoice,
    payment_link: link,
    company,
    customer,
  } = data;

  const amount =
    link.link_type ===
    "customer_entered"
      ? null
      : Number(
          link.amount ??
            invoice.balance_due
        );

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="border-b pb-5">
            <p className="text-sm font-semibold">
              {company.name}
            </p>

            {company.branch_name && (
              <p className="mt-1 text-xs text-neutral-500">
                {company.branch_name}
              </p>
            )}

            <h1 className="mt-5 text-2xl font-bold">
              Pay Invoice
            </h1>

            <p className="mt-1 text-sm text-neutral-500">
              Invoice{" "}
              {invoice.invoice_number}
            </p>
          </div>

          <div className="space-y-4 py-6">
            <div className="flex justify-between gap-4">
              <span className="text-sm text-neutral-500">
                Customer
              </span>

              <span className="text-sm font-semibold">
                {customer?.name ??
                  "Customer"}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-sm text-neutral-500">
                Invoice Total
              </span>

              <span className="text-sm font-semibold">
                {formatCurrency(
                  Number(
                    invoice.total_amount
                  )
                )}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-sm text-neutral-500">
                Outstanding Balance
              </span>

              <span className="text-sm font-semibold">
                {formatCurrency(
                  Number(
                    invoice.balance_due
                  )
                )}
              </span>
            </div>
          </div>

          <div className="rounded-xl border p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Amount To Pay
            </p>

            {amount !== null ? (
              <p className="mt-2 text-3xl font-bold">
                {formatCurrency(
                  amount,
                  link.currency
                )}
              </p>
            ) : (
              <p className="mt-2 text-lg font-semibold">
                Customer selects amount
              </p>
            )}
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold">
              Choose Payment Method
            </p>

            <div className="mt-3 grid gap-2">
              <button
                type="button"
                onClick={() =>
                  setPaymentMethod(
                    "capitec_pay"
                  )
                }
                className={`rounded-lg border p-4 text-left ${
                  paymentMethod ===
                  "capitec_pay"
                    ? "border-black"
                    : ""
                }`}
              >
                <p className="font-semibold">
                  Capitec Pay / Pay by Bank
                </p>

                <p className="mt-1 text-xs text-neutral-500">
                  Fast bank-authorised payment.
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  setPaymentMethod(
                    "card"
                  )
                }
                className={`rounded-lg border p-4 text-left ${
                  paymentMethod ===
                  "card"
                    ? "border-black"
                    : ""
                }`}
              >
                <p className="font-semibold">
                  Card
                </p>

                <p className="mt-1 text-xs text-neutral-500">
                  Debit or credit card.
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  setPaymentMethod(
                    "instant_eft"
                  )
                }
                className={`rounded-lg border p-4 text-left ${
                  paymentMethod ===
                  "instant_eft"
                    ? "border-black"
                    : ""
                }`}
              >
                <p className="font-semibold">
                  Instant EFT
                </p>

                <p className="mt-1 text-xs text-neutral-500">
                  Secure bank payment.
                </p>
              </button>
            </div>
          </div>

          {link.link_type ===
            "customer_entered" && (
            <div className="mt-5">
              <label className="text-sm font-semibold">
                Payment Amount
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  customerAmount
                }
                onChange={(event) =>
                  setCustomerAmount(
                    event.target.value
                  )
                }
                placeholder="0.00"
                className="mt-2 h-11 w-full rounded-lg border px-3"
              />

              {link.maximum_amount != null && (
                <p className="mt-2 text-xs text-neutral-500">
                  Maximum:{" "}
                  {formatCurrency(
                    Number(
                      link.maximum_amount
                    ),
                    link.currency
                  )}
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={
              continueToPayment
            }
            disabled={
              submitting
            }
            className="mt-6 h-12 w-full rounded-lg bg-black text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting
              ? "Starting Payment..."
              : "Continue Securely"}
          </button>

          {transactionMessage && (
            <div className="mt-4 rounded-lg border p-3 text-sm">
              {transactionMessage}
            </div>
          )}

          {process.env.NODE_ENV !==
            "production" &&
            pendingTransactionId && (
              <div className="mt-4 rounded-xl border border-dashed p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Development Test
                </p>

                <p className="mt-1 text-xs text-neutral-500">
                  Simulate a successful gateway
                  callback without using real money.
                </p>

                <button
                  type="button"
                  onClick={
                    simulateSuccessfulPayment
                  }
                  disabled={
                    simulatingPayment
                  }
                  className="mt-3 h-10 w-full rounded-lg bg-black text-sm font-semibold text-white disabled:opacity-50"
                >
                  {simulatingPayment
                    ? "Verifying Payment..."
                    : "Simulate Successful Payment"}
                </button>
              </div>
            )}

          <p className="mt-3 text-center text-xs text-neutral-500">
            Nexus will only record payment after
            confirmation from the payment provider.
          </p>
        </div>
      </div>
    </main>
  );
}
