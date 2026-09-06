"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Button,
} from "@/components/ui/button";

import {
  addCustomerCollectionActivity,
  getCustomerCollectionControl,
  updateCustomerCollectionControl,
} from "@/lib/services/accountingService";

import type {
  CustomerCollectionResponse,
  DebtorCollectionActivityType,
  DebtorCollectionStatus,
} from "@/lib/services/accountingService";


type Props = {
  customerId: string;
  canManage: boolean;
};


function formatDateTime(
  value?: string | null
) {
  if (!value) {
    return "Never";
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


function activityLabel(
  value: string
) {
  switch (value) {
    case "call":
      return "Phone Call";

    case "email":
      return "Email";

    case "whatsapp":
      return "WhatsApp";

    case "promise":
      return "Promise to Pay";

    case "reminder":
      return "Payment Reminder";

    case "credit_hold":
      return "Credit Hold";

    case "credit_hold_removed":
      return "Credit Hold Removed";

    case "dispute":
      return "Dispute";

    case "legal":
      return "Legal";

    default:
      return "Note";
  }
}


function statusLabel(
  value: DebtorCollectionStatus
) {
  switch (value) {
    case "normal":
      return "Normal";

    case "follow_up":
      return "Follow-up Required";

    case "promise_to_pay":
      return "Promise to Pay";

    case "disputed":
      return "Disputed";

    case "credit_hold":
      return "Credit Hold";

    case "legal":
      return "Legal";

    default:
      return value;
  }
}


export default function DebtorCollectionPanel({
  customerId,
  canManage,
}: Props) {

  const [
    data,
    setData,
  ] =
    useState<
      CustomerCollectionResponse |
      null
    >(null);


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
    activitySaving,
    setActivitySaving,
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


  const [
    collectionStatus,
    setCollectionStatus,
  ] =
    useState<
      DebtorCollectionStatus
    >("normal");


  const [
    nextFollowUpDate,
    setNextFollowUpDate,
  ] =
    useState("");


  const [
    promisedPaymentDate,
    setPromisedPaymentDate,
  ] =
    useState("");


  const [
    promisedAmount,
    setPromisedAmount,
  ] =
    useState("");


  const [
    creditHold,
    setCreditHold,
  ] =
    useState(false);


  const [
    creditHoldReason,
    setCreditHoldReason,
  ] =
    useState("");


  const [
    activityType,
    setActivityType,
  ] =
    useState<
      DebtorCollectionActivityType
    >("note");


  const [
    activityNote,
    setActivityNote,
  ] =
    useState("");


  function populateForm(
    response:
      CustomerCollectionResponse
  ) {
    setCollectionStatus(
      response.control
        .collection_status
    );

    setNextFollowUpDate(
      response.control
        .next_follow_up_date ??
      ""
    );

    setPromisedPaymentDate(
      response.control
        .promised_payment_date ??
      ""
    );

    setPromisedAmount(
      response.control
        .promised_amount != null
        ? String(
            response.control
              .promised_amount
          )
        : ""
    );

    setCreditHold(
      response.control
        .credit_hold
    );

    setCreditHoldReason(
      response.control
        .credit_hold_reason ??
      ""
    );
  }


  async function loadData() {
    try {
      setLoading(true);
      setErrorMessage("");

      const response =
        await getCustomerCollectionControl(
          customerId
        );

      setData(response);
      populateForm(response);

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Collection information could not be loaded."
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


  async function saveControl() {
    if (!canManage) {
      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");


      const amount =
        promisedAmount.trim()
          ? Number(
              promisedAmount
            )
          : null;


      if (
        amount !== null &&
        (
          !Number.isFinite(
            amount
          ) ||
          amount <= 0
        )
      ) {
        throw new Error(
          "Promised amount must be greater than zero."
        );
      }


      if (
        creditHold &&
        !creditHoldReason.trim()
      ) {
        throw new Error(
          "Enter a reason before placing the customer on credit hold."
        );
      }


      await updateCustomerCollectionControl(
        customerId,
        {
          collectionStatus:
            creditHold
              ? "credit_hold"
              : collectionStatus,

          nextFollowUpDate:
            nextFollowUpDate ||
            null,

          promisedPaymentDate:
            promisedPaymentDate ||
            null,

          promisedAmount:
            amount,

          creditHold,

          creditHoldReason:
            creditHoldReason.trim() ||
            null,
        }
      );


      const refreshed =
        await getCustomerCollectionControl(
          customerId
        );

      setData(refreshed);
      populateForm(refreshed);

      setSuccessMessage(
        "Collection control updated."
      );

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Collection control could not be updated."
      );
    } finally {
      setSaving(false);
    }
  }


  async function addActivity() {
    if (
      !canManage ||
      !activityNote.trim()
    ) {
      return;
    }

    try {
      setActivitySaving(true);
      setErrorMessage("");
      setSuccessMessage("");


      await addCustomerCollectionActivity(
        customerId,
        activityType,
        activityNote.trim()
      );


      const refreshed =
        await getCustomerCollectionControl(
          customerId
        );

      setData(refreshed);
      populateForm(refreshed);

      setActivityNote("");

      setSuccessMessage(
        "Collection activity recorded."
      );

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Activity could not be recorded."
      );
    } finally {
      setActivitySaving(false);
    }
  }


  if (loading) {
    return (
      <section className="mb-10 rounded-xl border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Loading collection controls...
        </p>
      </section>
    );
  }


  if (!data) {
    return (
      <section className="mb-10 rounded-xl border bg-card p-6">
        <h2 className="text-xl font-semibold">
          Collection Control
        </h2>

        <p className="mt-2 text-sm text-destructive">
          {errorMessage ||
            "Collection data is unavailable."}
        </p>
      </section>
    );
  }


  return (
    <section className="mb-10">

      <div className="mb-4">
        <h2 className="text-xl font-semibold">
          Collection Control
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Manage follow-ups, disputes,
          collection activity and customer credit restrictions.
          These controls do not change the accounting ledger.
        </p>
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


      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">

        <div className="rounded-xl border bg-card p-5">

          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">

            <div>
              <p className="text-sm text-muted-foreground">
                Collection Status
              </p>

              <p className="mt-1 text-lg font-bold">
                {statusLabel(
                  data.control
                    .collection_status
                )}
              </p>
            </div>


            {data.control.credit_hold && (
              <span className="rounded-full border px-3 py-1 text-xs font-bold">
                CREDIT HOLD
              </span>
            )}

          </div>


          <div className="grid gap-4 sm:grid-cols-2">

            <label className="text-sm">
              <span className="mb-1 block font-medium">
                Status
              </span>

              <select
                value={
                  collectionStatus
                }
                disabled={
                  !canManage
                }
                onChange={
                  (
                    event
                  ) =>
                    setCollectionStatus(
                      event.target
                        .value as
                        DebtorCollectionStatus
                    )
                }
                className="w-full rounded-md border bg-background px-3 py-2"
              >
                <option value="normal">
                  Normal
                </option>

                <option value="follow_up">
                  Follow-up Required
                </option>

                <option
                  value="promise_to_pay"
                  disabled
                >
                  Promise to Pay — use Payment Promises
                </option>

                <option value="disputed">
                  Disputed
                </option>

                <option value="legal">
                  Legal
                </option>
              </select>
            </label>


            <label className="text-sm">
              <span className="mb-1 block font-medium">
                Next Follow-up
              </span>

              <input
                type="date"
                value={
                  nextFollowUpDate
                }
                disabled={
                  !canManage
                }
                onChange={
                  (
                    event
                  ) =>
                    setNextFollowUpDate(
                      event.target
                        .value
                    )
                }
                className="w-full rounded-md border bg-background px-3 py-2"
              />
            </label>


            <div className="sm:col-span-2 rounded-lg border bg-muted/20 p-4">
              <p className="text-sm font-medium">
                Payment Promise
              </p>

              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Payment commitments are managed in the Payment Promises section above so that every promise has a tracked outcome and history.
              </p>
            </div>

          </div>


          <div className="mt-5 rounded-lg border p-4">

            <label className="flex items-start gap-3">

              <input
                type="checkbox"
                checked={
                  creditHold
                }
                disabled={
                  !canManage
                }
                onChange={
                  (
                    event
                  ) =>
                    setCreditHold(
                      event.target
                        .checked
                    )
                }
                className="mt-1"
              />

              <div>
                <p className="font-medium">
                  Place customer on credit hold
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Restrict new credit Sales Orders
                  and credit invoices unless an authorised
                  override is recorded.
                </p>
              </div>

            </label>


            {creditHold && (
              <label className="mt-4 block text-sm">
                <span className="mb-1 block font-medium">
                  Credit Hold Reason
                </span>

                <textarea
                  rows={3}
                  value={
                    creditHoldReason
                  }
                  disabled={
                    !canManage
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setCreditHoldReason(
                        event.target
                          .value
                      )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                  placeholder="Why should new credit sales be blocked?"
                />
              </label>
            )}

          </div>


          {canManage && (
            <div className="mt-5 flex justify-end">
              <Button
                type="button"
                disabled={
                  saving
                }
                className="bg-black text-white hover:bg-black/85"
                onClick={
                  saveControl
                }
              >
                {saving
                  ? "Saving..."
                  : "Save Collection Control"}
              </Button>
            </div>
          )}

        </div>


        <div className="rounded-xl border bg-card p-5">

          <h3 className="font-semibold">
            Record Activity
          </h3>

          <p className="mt-1 text-sm text-muted-foreground">
            Add an append-only record of customer
            contact or collection activity.
          </p>


          {canManage ? (
            <>
              <label className="mt-5 block text-sm">
                <span className="mb-1 block font-medium">
                  Activity Type
                </span>

                <select
                  value={
                    activityType
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setActivityType(
                        event.target
                          .value as
                          DebtorCollectionActivityType
                      )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                >
                  <option value="note">
                    Note
                  </option>

                  <option value="call">
                    Phone Call
                  </option>

                  <option value="email">
                    Email
                  </option>

                  <option value="whatsapp">
                    WhatsApp
                  </option>

                  <option value="reminder">
                    Payment Reminder
                  </option>

                  <option value="promise">
                    Promise to Pay
                  </option>

                  <option value="dispute">
                    Dispute
                  </option>

                  <option value="legal">
                    Legal
                  </option>
                </select>
              </label>


              <label className="mt-4 block text-sm">
                <span className="mb-1 block font-medium">
                  Note
                </span>

                <textarea
                  rows={5}
                  value={
                    activityNote
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setActivityNote(
                        event.target
                          .value
                      )
                  }
                  placeholder="Example: Called customer. They promised to pay R1,500 on 10 Sep."
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </label>


              <Button
                type="button"
                disabled={
                  activitySaving ||
                  !activityNote.trim()
                }
                onClick={
                  addActivity
                }
                className="mt-4 w-full bg-black text-white hover:bg-black/85"
              >
                {activitySaving
                  ? "Recording..."
                  : "Record Activity"}
              </Button>
            </>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">
              You have read-only access to
              collection history.
            </p>
          )}


          <div className="mt-6 border-t pt-5">

            <p className="text-sm font-medium">
              Last Contact
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              {formatDateTime(
                data.control
                  .last_contacted_at
              )}
            </p>


            <p className="mt-4 text-sm font-medium">
              Next Follow-up
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              {formatDate(
                data.control
                  .next_follow_up_date
              )}
            </p>


            {data.control
              .promised_payment_date && (
              <>
                <p className="mt-4 text-sm font-medium">
                  Promise to Pay
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  {data.control
                    .promised_amount !=
                  null
                    ? new Intl.NumberFormat(
                        "en-ZA",
                        {
                          style:
                            "currency",
                          currency:
                            "ZAR",
                        }
                      ).format(
                        Number(
                          data.control
                            .promised_amount
                        )
                      )
                    : "Amount not specified"}
                  {" on "}
                  {formatDate(
                    data.control
                      .promised_payment_date
                  )}
                </p>
              </>
            )}

          </div>

        </div>

      </div>


      <div className="mt-5 rounded-xl border bg-card p-5">

        <div className="mb-5">
          <h3 className="font-semibold">
            Collection History
          </h3>

          <p className="mt-1 text-sm text-muted-foreground">
            Permanent history of collection
            actions and customer communication.
          </p>
        </div>


        {data.activity.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No collection activity has been recorded yet.
          </div>
        ) : (
          <div className="space-y-3">

            {data.activity.map(
              activity => (
                <div
                  key={
                    activity.id
                  }
                  className="rounded-lg border p-4"
                >

                  <div className="flex flex-wrap items-start justify-between gap-3">

                    <div>
                      <p className="font-medium">
                        {activityLabel(
                          activity.activity_type
                        )}
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(
                          activity.activity_date
                        )}
                      </p>
                    </div>

                  </div>


                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6">
                    {activity.note}
                  </p>

                </div>
              )
            )}

          </div>
        )}

      </div>

    </section>
  );
}
