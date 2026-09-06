"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import ActionModal from "@/components/ui/ActionModal";

import {
  Button,
} from "@/components/ui/button";

import {
  createDebtorPaymentPromise,
  getCustomerPaymentPromises,
} from "@/lib/services/accountingService";

import type {
  DebtorPaymentPromise,
  DebtorPaymentPromiseStatus,
} from "@/lib/services/accountingService";


type Props = {
  customerId: string;

  canManage: boolean;

  outstanding?: number;

  currency?: string;

  onChanged?: () => void;
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


function formatDateTime(
  value?: string | null
) {
  if (!value) {
    return "—";
  }

  return new Date(
    value
  ).toLocaleString(
    "en-ZA",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}


function statusLabel(
  value:
    DebtorPaymentPromiseStatus
) {
  switch (value) {
    case "active":
      return "Active";

    case "kept":
      return "Kept";

    case "partial":
      return "Partial";

    case "broken":
      return "Broken";

    case "cancelled":
      return "Cancelled";

    default:
      return value;
  }
}


function statusClass(
  value:
    DebtorPaymentPromiseStatus
) {
  switch (value) {
    case "active":
      return "border-blue-300 bg-blue-50 text-blue-700";

    case "kept":
      return "border-emerald-300 bg-emerald-50 text-emerald-700";

    case "partial":
      return "border-amber-300 bg-amber-50 text-amber-700";

    case "broken":
      return "border-destructive/40 bg-destructive/10 text-destructive";

    default:
      return "border-border bg-muted/30 text-muted-foreground";
  }
}


export default function DebtorPaymentPromises({
  customerId,
  canManage,
  outstanding = 0,
  currency = "ZAR",
  onChanged,
}: Props) {

  const today =
    useMemo(
      () =>
        localToday(),
      []
    );


  const [
    promises,
    setPromises,
  ] =
    useState<
      DebtorPaymentPromise[]
    >([]);


  const [
    modalOpen,
    setModalOpen,
  ] =
    useState(false);


  const [
    amount,
    setAmount,
  ] =
    useState("");


  const [
    paymentDate,
    setPaymentDate,
  ] =
    useState(today);


  const [
    notes,
    setNotes,
  ] =
    useState("");


  const [
    loading,
    setLoading,
  ] =
    useState(true);


  const [
    saving,
    setSaving,
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


  async function loadData() {
    try {
      setLoading(true);
      setErrorMessage("");

      const result =
        await getCustomerPaymentPromises(
          customerId
        );

      setPromises(
        result.promises ??
        []
      );

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Payment promises could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    void loadData();
  }, [
    customerId,
  ]);


  const activePromise =
    useMemo(
      () =>
        promises.find(
          (
            promise
          ) =>
            promise.status ===
            "active"
        ) ??
        null,
      [
        promises,
      ]
    );


  function openPromiseModal() {
    setErrorMessage("");
    setSuccessMessage("");

    setAmount(
      outstanding > 0
        ? String(
            Number(
              outstanding
            ).toFixed(2)
          )
        : ""
    );

    setPaymentDate(
      today
    );

    setNotes("");

    setModalOpen(true);
  }


  function closePromiseModal() {
    if (saving) {
      return;
    }

    setModalOpen(false);
  }


  async function createPromise() {
    if (!canManage) {
      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");

      const parsedAmount =
        Number(amount);

      if (
        !Number.isFinite(
          parsedAmount
        ) ||
        parsedAmount <= 0
      ) {
        throw new Error(
          "Promise amount must be greater than zero."
        );
      }


      if (!paymentDate) {
        throw new Error(
          "Select a promised payment date."
        );
      }


      if (
        paymentDate <
        today
      ) {
        throw new Error(
          "Promised payment date cannot be in the past."
        );
      }


      await createDebtorPaymentPromise({
        customerId,
        amount:
          parsedAmount,
        paymentDate,
        notes,
      });


      await loadData();

      setModalOpen(false);

      setSuccessMessage(
        "Payment promise recorded successfully."
      );

      onChanged?.();

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Payment promise could not be created."
      );
    } finally {
      setSaving(false);
    }
  }


  if (loading) {
    return (
      <section className="mb-10 rounded-xl border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Loading payment promises...
        </p>
      </section>
    );
  }


  return (
    <section
      id="payment-promises"
      className="mb-10"
    >

      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">

        <div>
          <p className="text-sm font-medium text-primary">
            Collection Commitment
          </p>

          <h2 className="mt-1 text-xl font-semibold">
            Payment Promises
          </h2>

          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Record a customer commitment to pay and let Nexus track whether the promise was kept, partially kept or broken.
          </p>
        </div>


        {canManage && (
          <Button
            type="button"
            onClick={
              openPromiseModal
            }
            className="bg-black text-white hover:bg-black/85"
          >
            + Record Payment Promise
          </Button>
        )}

      </div>


      {errorMessage && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}


      {successMessage && (
        <div className="mb-4 rounded-lg border bg-muted/30 p-3 text-sm">
          {successMessage}
        </div>
      )}


      {activePromise && (
        <div className="mb-5 rounded-xl border bg-card p-5">

          <div className="flex flex-wrap items-start justify-between gap-4">

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Current Commitment
              </p>

              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(
                  activePromise.promised_amount,
                  currency
                )}
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                Promised by{" "}
                {formatDate(
                  activePromise.promised_payment_date
                )}
              </p>
            </div>


            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(
                activePromise.status
              )}`}
            >
              ACTIVE
            </span>

          </div>


          <div className="mt-5 grid gap-4 sm:grid-cols-3">

            <div>
              <p className="text-xs text-muted-foreground">
                Received During Promise
              </p>

              <p className="mt-1 font-semibold">
                {formatCurrency(
                  activePromise.paid_during_promise,
                  currency
                )}
              </p>
            </div>


            <div>
              <p className="text-xs text-muted-foreground">
                Remaining Commitment
              </p>

              <p className="mt-1 font-semibold">
                {formatCurrency(
                  activePromise.shortfall,
                  currency
                )}
              </p>
            </div>


            <div>
              <p className="text-xs text-muted-foreground">
                Promise Created
              </p>

              <p className="mt-1 font-semibold">
                {formatDateTime(
                  activePromise.created_at
                )}
              </p>
            </div>

          </div>


          {activePromise.notes && (
            <div className="mt-5 rounded-lg border bg-muted/20 p-4">
              <p className="text-xs font-medium text-muted-foreground">
                Notes
              </p>

              <p className="mt-1 text-sm">
                {
                  activePromise.notes
                }
              </p>
            </div>
          )}

        </div>
      )}


      <div className="overflow-hidden rounded-xl border bg-card">

        <div className="border-b p-5">
          <h3 className="font-semibold">
            Promise History
          </h3>

          <p className="mt-1 text-sm text-muted-foreground">
            Historical customer commitments and their outcomes.
          </p>
        </div>


        {promises.length ===
        0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No payment promises have been recorded for this customer.
          </div>
        ) : (
          <div className="overflow-x-auto">

            <table className="w-full text-sm">

              <thead className="border-b bg-muted/20 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">
                    Promise Date
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Amount
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Paid
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Shortfall
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Status
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Recorded
                  </th>
                </tr>
              </thead>


              <tbody className="divide-y">

                {promises.map(
                  (
                    promise
                  ) => (
                    <tr
                      key={
                        promise.id
                      }
                    >
                      <td className="px-4 py-4">
                        {formatDate(
                          promise.promised_payment_date
                        )}
                      </td>

                      <td className="px-4 py-4 font-medium">
                        {formatCurrency(
                          promise.promised_amount,
                          currency
                        )}
                      </td>

                      <td className="px-4 py-4">
                        {formatCurrency(
                          promise.paid_during_promise,
                          currency
                        )}
                      </td>

                      <td className="px-4 py-4">
                        {formatCurrency(
                          promise.shortfall,
                          currency
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(
                            promise.status
                          )}`}
                        >
                          {statusLabel(
                            promise.status
                          )}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-muted-foreground">
                        {formatDateTime(
                          promise.created_at
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


      <ActionModal
        open={modalOpen}
        title="Record Payment Promise"
        subtitle="Record the amount and date the customer has committed to pay."
        onClose={
          closePromiseModal
        }
        maxWidth="max-w-xl"
      >

        <div className="grid gap-5">

          {activePromise && (
            <div className="rounded-lg border bg-muted/20 p-4 text-sm">
              This customer already has an active promise. Recording a new promise will replace the active commitment while keeping the old promise in history.
            </div>
          )}


          <label className="text-sm">
            <span className="mb-1 block font-medium">
              Promise Amount
            </span>

            <input
              type="number"
              min="0.01"
              step="0.01"
              value={
                amount
              }
              onChange={
                (
                  event
                ) =>
                  setAmount(
                    event.target.value
                  )
              }
              placeholder="0.00"
              className="w-full rounded-md border bg-background px-3 py-2.5"
              autoFocus
            />

            {outstanding > 0 && (
              <span className="mt-1 block text-xs text-muted-foreground">
                Current outstanding balance:{" "}
                {formatCurrency(
                  outstanding,
                  currency
                )}
              </span>
            )}
          </label>


          <label className="text-sm">
            <span className="mb-1 block font-medium">
              Promised Payment Date
            </span>

            <input
              type="date"
              min={
                today
              }
              value={
                paymentDate
              }
              onChange={
                (
                  event
                ) =>
                  setPaymentDate(
                    event.target.value
                  )
              }
              className="w-full rounded-md border bg-background px-3 py-2.5"
            />
          </label>


          <label className="text-sm">
            <span className="mb-1 block font-medium">
              Notes
            </span>

            <textarea
              rows={4}
              value={
                notes
              }
              onChange={
                (
                  event
                ) =>
                  setNotes(
                    event.target.value
                  )
              }
              placeholder="Optional notes about the customer's commitment..."
              className="w-full rounded-md border bg-background px-3 py-2.5"
            />
          </label>


          <div className="flex justify-end gap-3 border-t pt-4">

            <Button
              type="button"
              variant="outline"
              disabled={
                saving
              }
              onClick={
                closePromiseModal
              }
            >
              Cancel
            </Button>


            <Button
              type="button"
              disabled={
                saving
              }
              onClick={() =>
                void createPromise()
              }
              className="bg-black text-white hover:bg-black/85"
            >
              {saving
                ? "Recording..."
                : "Record Promise"}
            </Button>

          </div>

        </div>

      </ActionModal>

    </section>
  );
}
