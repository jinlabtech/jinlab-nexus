"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Button,
} from "@/components/ui/button";

import {
  approveSalesCreditHoldOverride,
  getSalesOrderCreditControl,
  setSalesOrderPaymentBasis,
} from "@/lib/services/salesService";

import {
  usePermissions,
} from "@/hooks/usePermissions";

import type {
  SalesOrderCreditControl,
} from "@/lib/services/salesService";

import type {
  SalesPaymentBasis,
} from "@/types/sales";


type Props = {
  salesOrderId: string;
};


function basisLabel(
  value:
    SalesPaymentBasis | null
) {
  switch (value) {
    case "credit":
      return "Credit — customer pays later";

    case "immediate":
      return "Pay Now — full payment required";

    case "prepaid":
      return "Prepaid — payment before fulfilment";

    default:
      return "Not selected";
  }
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


export default function SalesOrderCreditControlPanel({
  salesOrderId,
}: Props) {

  const {
    can,
    loading:
      permissionsLoading,
  } =
    usePermissions();


  const canOverride =
    can(
      "sales.credit_hold.override"
    );


  const [
    control,
    setControl,
  ] =
    useState<
      SalesOrderCreditControl |
      null
    >(null);


  const [
    paymentBasis,
    setPaymentBasis,
  ] =
    useState<
      SalesPaymentBasis | ""
    >("");


  const [
    overrideReason,
    setOverrideReason,
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
    approving,
    setApproving,
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


  async function loadControl() {
    try {
      setLoading(true);
      setErrorMessage("");

      const result =
        await getSalesOrderCreditControl(
          salesOrderId
        );

      setControl(result);

      setPaymentBasis(
        result.payment_basis ??
        ""
      );

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Credit control could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    void loadControl();
  }, [
    salesOrderId,
  ]);


  async function savePaymentBasis() {
    if (
      !paymentBasis ||
      !control
    ) {
      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");


      await setSalesOrderPaymentBasis(
        salesOrderId,
        paymentBasis
      );


      await loadControl();


      setSuccessMessage(
        "Payment basis updated."
      );

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Payment basis could not be updated."
      );
    } finally {
      setSaving(false);
    }
  }


  async function approveOverride() {
    if (
      !control ||
      !overrideReason.trim()
    ) {
      return;
    }

    try {
      setApproving(true);
      setErrorMessage("");
      setSuccessMessage("");


      await approveSalesCreditHoldOverride(
        salesOrderId,
        overrideReason.trim()
      );


      setOverrideReason("");

      await loadControl();


      setSuccessMessage(
        "Credit hold override approved and recorded."
      );

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Credit hold override could not be approved."
      );
    } finally {
      setApproving(false);
    }
  }


  if (
    loading ||
    permissionsLoading
  ) {
    return (
      <section className="mb-6 rounded-xl border bg-card p-5">
        <p className="text-sm text-muted-foreground">
          Loading payment and credit controls...
        </p>
      </section>
    );
  }


  if (!control) {
    return (
      <section className="mb-6 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">
          Payment & Credit Control
        </h2>

        <p className="mt-2 text-sm text-destructive">
          {errorMessage ||
            "Credit-control information is unavailable."}
        </p>
      </section>
    );
  }


  const editable =
    control.sales_order_status ===
    "draft";


  const blocked =
    control.credit_hold &&
    control.payment_basis ===
      "credit" &&
    !control.override;


  return (
    <section className="mb-6 rounded-xl border bg-card p-5">

      <div className="flex flex-wrap items-start justify-between gap-4">

        <div>
          <p className="text-sm font-medium text-primary">
            Sales Control
          </p>

          <h2 className="mt-1 text-xl font-semibold">
            Payment & Credit Control
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Controls whether this order creates
            additional customer credit exposure.
          </p>
        </div>


        <div className="flex flex-wrap gap-2">

          {control.credit_hold ? (
            <span className="rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1 text-xs font-bold text-destructive">
              CREDIT HOLD
            </span>
          ) : (
            <span className="rounded-full border px-3 py-1 text-xs font-medium">
              CREDIT CLEAR
            </span>
          )}


          {control.override && (
            <span className="rounded-full border px-3 py-1 text-xs font-medium">
              OVERRIDE APPROVED
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


      <div className="mt-6 grid gap-5 lg:grid-cols-2">

        <div className="rounded-lg border p-4">

          <p className="text-sm text-muted-foreground">
            Payment Basis
          </p>

          <p className="mt-1 font-semibold">
            {basisLabel(
              control.payment_basis
            )}
          </p>


          {editable && (
            <div className="mt-4">

              <select
                value={
                  paymentBasis
                }
                onChange={
                  event =>
                    setPaymentBasis(
                      event.target
                        .value as
                        SalesPaymentBasis | ""
                    )
                }
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">
                  Select payment basis
                </option>

                <option value="credit">
                  Credit — customer pays later
                </option>

                <option value="immediate">
                  Pay Now — full payment required
                </option>

                <option value="prepaid">
                  Prepaid — payment before fulfilment
                </option>
              </select>


              <Button
                type="button"
                variant="outline"
                className="mt-3"
                disabled={
                  saving ||
                  !paymentBasis
                }
                onClick={
                  savePaymentBasis
                }
              >
                {saving
                  ? "Saving..."
                  : "Save Payment Basis"}
              </Button>

            </div>
          )}


          {!control.payment_basis && (
            <p className="mt-3 text-sm font-medium text-destructive">
              A payment basis must be selected
              before this order can be confirmed.
            </p>
          )}

        </div>


        <div className="rounded-lg border p-4">

          <p className="text-sm text-muted-foreground">
            Customer Credit Status
          </p>

          <p className="mt-1 font-semibold">
            {control.credit_hold
              ? "Credit Hold"
              : "Credit Available"}
          </p>


          {control.credit_hold_reason && (
            <div className="mt-3">
              <p className="text-xs font-medium text-muted-foreground">
                Reason
              </p>

              <p className="mt-1 text-sm">
                {control.credit_hold_reason}
              </p>
            </div>
          )}


          {!control.credit_hold && (
            <p className="mt-3 text-sm text-muted-foreground">
              No active credit restriction is
              recorded for this customer.
            </p>
          )}

        </div>

      </div>


      {blocked && (
        <div className="mt-5 rounded-lg border border-destructive/40 bg-destructive/10 p-4">

          <p className="font-semibold text-destructive">
            Credit Sale Blocked
          </p>

          <p className="mt-2 text-sm leading-6">
            This customer is on credit hold.
            Nexus will not allow this credit
            sales order to be confirmed without
            an authorised override.
          </p>


          {canOverride ? (
            <div className="mt-4">

              <label className="block text-sm font-medium">
                Override Reason
              </label>

              <textarea
                rows={3}
                value={
                  overrideReason
                }
                onChange={
                  event =>
                    setOverrideReason(
                      event.target.value
                    )
                }
                placeholder="Explain why this credit sale is being authorised despite the customer hold."
                className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm"
              />


              <Button
                type="button"
                className="mt-3 bg-black text-white hover:bg-black/85"
                disabled={
                  approving ||
                  !overrideReason.trim()
                }
                onClick={
                  approveOverride
                }
              >
                {approving
                  ? "Approving..."
                  : "Approve Credit Override"}
              </Button>

            </div>
          ) : (
            <p className="mt-3 text-sm font-medium">
              An owner or authorised administrator
              must approve this order.
            </p>
          )}

        </div>
      )}


      {control.override && (
        <div className="mt-5 rounded-lg border p-4">

          <div className="flex flex-wrap items-center justify-between gap-3">

            <div>
              <p className="font-semibold">
                Credit Override Approved
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                {formatDateTime(
                  control.override
                    .approved_at
                )}
              </p>
            </div>


            <span className="rounded-full border px-3 py-1 text-xs font-medium">
              {control.override.used_at
                ? "USED"
                : "READY"}
            </span>

          </div>


          <div className="mt-3">
            <p className="text-xs font-medium text-muted-foreground">
              Authorisation Reason
            </p>

            <p className="mt-1 text-sm">
              {control.override.reason}
            </p>
          </div>


          {control.override.used_at && (
            <p className="mt-3 text-xs text-muted-foreground">
              Override used when the order was
              authorised on{" "}
              {formatDateTime(
                control.override.used_at
              )}.
            </p>
          )}

        </div>
      )}


      {control.payment_basis ===
        "immediate" && (
        <p className="mt-5 text-xs leading-5 text-muted-foreground">
          Pay Now orders are not blocked by a customer
          credit hold because they should not create
          new credit exposure. Nexus will separately
          verify that full payment was actually received
          before the transaction is treated as paid.
        </p>
      )}


      {control.payment_basis ===
        "prepaid" && (
        <p className="mt-5 text-xs leading-5 text-muted-foreground">
          Prepaid orders are not blocked by a customer
          credit hold. Nexus will later require payment
          evidence before fulfilment.
        </p>
      )}

    </section>
  );
}
