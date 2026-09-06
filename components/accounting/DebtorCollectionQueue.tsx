"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import ActionModal from "@/components/ui/ActionModal";

import {
  Button,
} from "@/components/ui/button";

import {
  decideDebtorCollectionQueueItem,
  getCustomerCollectionControl,
  getDebtorCollectionQueue,
  updateCustomerCollectionControl,
} from "@/lib/services/accountingService";

import type {
  DebtorCollectionQueueItem,
  DebtorCollectionQueueStatus,
} from "@/lib/services/accountingService";


type Props = {
  asOfDate: string;
  canManage: boolean;
};


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
    Number(value ?? 0)
  );
}


function actionLabel(
  value: string
) {
  switch (value) {
    case "reminder":
      return "Send Reminder";

    case "follow_up":
      return "Follow Up";

    case "escalation":
      return "Escalate Collection";

    case "credit_review":
      return "Review Credit";

    case "legal_review":
      return "Legal Review";

    case "manual_review":
      return "Manual Review";

    case "promise_monitor":
      return "Monitor Promise";

    case "broken_promise":
      return "Broken Promise Follow-up";

    default:
      return value.replaceAll(
        "_",
        " "
      );
  }
}


function channelLabel(
  value: string
) {
  switch (
    value.toLowerCase()
  ) {
    case "email":
      return "Email";

    case "whatsapp":
      return "WhatsApp";

    case "phone":
      return "Phone";

    default:
      return "Internal";
  }
}


function priorityClass(
  value: string
) {
  switch (value) {
    case "urgent":
      return "border-destructive/40 bg-destructive/10 text-destructive";

    case "high":
      return "border-orange-300 bg-orange-50 text-orange-700";

    case "normal":
      return "border-blue-300 bg-blue-50 text-blue-700";

    default:
      return "border-border bg-muted/30 text-muted-foreground";
  }
}


function statusClass(
  value: string
) {
  switch (value) {
    case "approved":
      return "border-blue-300 bg-blue-50 text-blue-700";

    case "completed":
      return "border-emerald-300 bg-emerald-50 text-emerald-700";

    case "dismissed":
      return "border-border bg-muted text-muted-foreground";

    default:
      return "border-amber-300 bg-amber-50 text-amber-700";
  }
}


export default function DebtorCollectionQueue({
  asOfDate,
  canManage,
}: Props) {
  const router =
    useRouter();

  const [
    items,
    setItems,
  ] =
    useState<
      DebtorCollectionQueueItem[]
    >([]);

  const [
    summary,
    setSummary,
  ] =
    useState({
      pending: 0,
      approved: 0,
      urgent: 0,
      high: 0,
    });

  const [
    filter,
    setFilter,
  ] =
    useState<
      DebtorCollectionQueueStatus |
      "all"
    >("pending");

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    workingId,
    setWorkingId,
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

  const [
    decisionItem,
    setDecisionItem,
  ] =
    useState<
      DebtorCollectionQueueItem |
      null
    >(null);

  const [
    decisionType,
    setDecisionType,
  ] =
    useState<
      "dismissed" |
      "completed" |
      null
    >(null);

  const [
    decisionNote,
    setDecisionNote,
  ] =
    useState("");


  const [
    holdItem,
    setHoldItem,
  ] =
    useState<
      DebtorCollectionQueueItem |
      null
    >(null);


  const [
    holdReason,
    setHoldReason,
  ] =
    useState("");


  async function loadData() {
    try {
      setLoading(true);
      setErrorMessage("");

      const result =
        await getDebtorCollectionQueue(
          asOfDate
        );

      setItems(
        result.items ??
        []
      );

      setSummary(
        result.summary
      );

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Collection action queue could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    void loadData();
  }, [
    asOfDate,
  ]);


  const visibleItems =
    useMemo(
      () => {
        if (
          filter ===
          "all"
        ) {
          return items;
        }

        return items.filter(
          (
            item
          ) =>
            item.status ===
            filter
        );
      },
      [
        items,
        filter,
      ]
    );


  async function approve(
    item:
      DebtorCollectionQueueItem
  ) {
    if (!canManage) {
      return;
    }

    try {
      setWorkingId(
        item.id
      );

      setErrorMessage("");
      setSuccessMessage("");

      await decideDebtorCollectionQueueItem(
        item.id,
        "approved"
      );

      setSuccessMessage(
        `${actionLabel(
          item.action_type
        )} approved for ${item.customer_name}.`
      );

      await loadData();

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Recommendation could not be approved."
      );
    } finally {
      setWorkingId("");
    }
  }


  function openDecision(
    item:
      DebtorCollectionQueueItem,
    decision:
      "dismissed" |
      "completed"
  ) {
    setDecisionItem(
      item
    );

    setDecisionType(
      decision
    );

    setDecisionNote("");

    setErrorMessage("");
  }


  function closeDecision() {
    if (workingId) {
      return;
    }

    setDecisionItem(null);
    setDecisionType(null);
    setDecisionNote("");
  }


  async function saveDecision() {
    if (
      !decisionItem ||
      !decisionType ||
      !canManage
    ) {
      return;
    }

    try {
      setWorkingId(
        decisionItem.id
      );

      setErrorMessage("");
      setSuccessMessage("");

      await decideDebtorCollectionQueueItem(
        decisionItem.id,
        decisionType,
        decisionNote
      );

      setSuccessMessage(
        decisionType ===
        "completed"
          ? "Collection action marked completed."
          : "Recommendation dismissed."
      );

      closeDecision();

      await loadData();

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Collection recommendation could not be updated."
      );
    } finally {
      setWorkingId("");
    }
  }



  async function copySuggestedMessage(
    item:
      DebtorCollectionQueueItem
  ) {
    if (
      !item.draft_message
    ) {
      return;
    }

    try {
      const content =
        [
          item.draft_subject,
          item.draft_message,
        ]
          .filter(Boolean)
          .join("\n\n");

      await navigator.clipboard
        .writeText(
          content
        );

      setErrorMessage("");

      setSuccessMessage(
        `Approved message copied for ${item.customer_name}.`
      );

    } catch {
      setErrorMessage(
        "The suggested message could not be copied."
      );
    }
  }


  function openPaymentPromise(
    item:
      DebtorCollectionQueueItem
  ) {
    router.push(
      `/accounting/debtors/${item.customer_id}#payment-promises`
    );
  }


  function openCreditHold(
    item:
      DebtorCollectionQueueItem
  ) {
    setHoldItem(
      item
    );

    setHoldReason(
      item.reason
    );

    setErrorMessage("");
    setSuccessMessage("");
  }


  function closeCreditHold() {
    if (workingId) {
      return;
    }

    setHoldItem(null);
    setHoldReason("");
  }


  async function applyCreditHold() {
    if (
      !holdItem ||
      !canManage
    ) {
      return;
    }

    const reason =
      holdReason.trim();

    if (!reason) {
      setErrorMessage(
        "Enter a reason before placing the customer on credit hold."
      );

      return;
    }

    try {
      setWorkingId(
        holdItem.id
      );

      setErrorMessage("");
      setSuccessMessage("");

      const current =
        await getCustomerCollectionControl(
          holdItem.customer_id
        );


      await updateCustomerCollectionControl(
        holdItem.customer_id,
        {
          collectionStatus:
            "credit_hold",

          nextFollowUpDate:
            current.control
              .next_follow_up_date,

          promisedPaymentDate:
            current.control
              .promised_payment_date,

          promisedAmount:
            current.control
              .promised_amount,

          creditHold:
            true,

          creditHoldReason:
            reason,
        }
      );


      await decideDebtorCollectionQueueItem(
        holdItem.id,
        "completed",
        `Credit hold applied: ${reason}`
      );


      setSuccessMessage(
        `${holdItem.customer_name} has been placed on credit hold.`
      );

      setHoldItem(null);
      setHoldReason("");

      await loadData();

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Credit hold could not be applied."
      );
    } finally {
      setWorkingId("");
    }
  }


  return (
    <section className="mb-10">

      <div className="mb-4">

        <p className="text-sm font-medium text-primary">
          Collection Operations
        </p>

        <h2 className="mt-1 text-xl font-semibold">
          Action Queue
        </h2>

        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Nexus recommends the next collection action. Staff still approve and complete the action so customer communication remains controlled and auditable.
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


      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            Pending
          </p>

          <p className="mt-2 text-2xl font-bold">
            {summary.pending}
          </p>
        </div>


        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            Approved
          </p>

          <p className="mt-2 text-2xl font-bold">
            {summary.approved}
          </p>
        </div>


        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            Urgent
          </p>

          <p className="mt-2 text-2xl font-bold">
            {summary.urgent}
          </p>
        </div>


        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            High Priority
          </p>

          <p className="mt-2 text-2xl font-bold">
            {summary.high}
          </p>
        </div>

      </div>


      <div className="mb-4 flex flex-wrap gap-2">

        {[
          "pending",
          "approved",
          "completed",
          "dismissed",
          "all",
        ].map(
          (
            value
          ) => (
            <Button
              key={
                value
              }
              type="button"
              size="sm"
              variant={
                filter ===
                value
                  ? "default"
                  : "outline"
              }
              onClick={() =>
                setFilter(
                  value as
                    DebtorCollectionQueueStatus |
                    "all"
                )
              }
            >
              {value
                .charAt(0)
                .toUpperCase() +
                value.slice(1)}
            </Button>
          )
        )}

      </div>


      {loading ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Building collection action queue...
        </div>
      ) : visibleItems.length ===
        0 ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          No collection actions match this view.
        </div>
      ) : (
        <div className="grid gap-4">

          {visibleItems.map(
            (
              item
            ) => (
              <div
                key={
                  item.id
                }
                className="rounded-xl border bg-card p-5"
              >

                <div className="flex flex-wrap items-start justify-between gap-4">

                  <div>

                    <div className="flex flex-wrap items-center gap-2">

                      <h3 className="font-semibold">
                        {
                          item.customer_name
                        }
                      </h3>


                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${priorityClass(
                          item.priority
                        )}`}
                      >
                        {item.priority.toUpperCase()}
                      </span>


                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass(
                          item.status
                        )}`}
                      >
                        {item.status.toUpperCase()}
                      </span>

                    </div>


                    <p className="mt-2 text-lg font-semibold">
                      {actionLabel(
                        item.action_type
                      )}
                    </p>


                    <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                      {
                        item.reason
                      }
                    </p>

                  </div>


                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      router.push(
                        `/accounting/debtors/${item.customer_id}`
                      )
                    }
                  >
                    Open Customer
                  </Button>

                </div>


                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Outstanding
                    </p>

                    <p className="mt-1 font-semibold">
                      {formatCurrency(
                        item.outstanding
                      )}
                    </p>
                  </div>


                  <div>
                    <p className="text-xs text-muted-foreground">
                      Overdue
                    </p>

                    <p className="mt-1 font-semibold">
                      {formatCurrency(
                        item.overdue
                      )}
                    </p>
                  </div>


                  <div>
                    <p className="text-xs text-muted-foreground">
                      Days Overdue
                    </p>

                    <p className="mt-1 font-semibold">
                      {
                        item.max_days_overdue
                      }
                    </p>
                  </div>


                  <div>
                    <p className="text-xs text-muted-foreground">
                      Recommended Channel
                    </p>

                    <p className="mt-1 font-semibold">
                      {channelLabel(
                        item.recommended_channel
                      )}
                    </p>
                  </div>

                </div>


                {item.draft_message && (
                  <div className="mt-5 rounded-lg border bg-muted/20 p-4">

                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Suggested Message
                    </p>

                    {item.draft_subject && (
                      <p className="mt-2 text-sm font-semibold">
                        {
                          item.draft_subject
                        }
                      </p>
                    )}

                    <p className="mt-2 text-sm leading-6">
                      {
                        item.draft_message
                      }
                    </p>

                  </div>
                )}


                {canManage &&
                  item.status ===
                    "pending" && (
                    <div className="mt-5 flex flex-wrap justify-end gap-2">

                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          workingId ===
                          item.id
                        }
                        onClick={() =>
                          openDecision(
                            item,
                            "dismissed"
                          )
                        }
                      >
                        Dismiss
                      </Button>


                      <Button
                        type="button"
                        disabled={
                          workingId ===
                          item.id
                        }
                        onClick={() =>
                          void approve(
                            item
                          )
                        }
                        className="bg-black text-white hover:bg-black/85"
                      >
                        {workingId ===
                        item.id
                          ? "Working..."
                          : "Approve Action"}
                      </Button>

                    </div>
                  )}


                {canManage &&
                  item.status ===
                    "approved" && (
                    <div className="mt-5 flex flex-wrap justify-end gap-2">

                      {item.draft_message && (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={
                            workingId ===
                            item.id
                          }
                          onClick={() =>
                            void copySuggestedMessage(
                              item
                            )
                          }
                        >
                          Copy Approved Message
                        </Button>
                      )}


                      {(item.action_type ===
                        "promise_monitor" ||
                        item.action_type ===
                        "broken_promise") && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            openPaymentPromise(
                              item
                            )
                          }
                        >
                          {item.action_type ===
                          "broken_promise"
                            ? "Review / Record Promise"
                            : "Open Payment Promise"}
                        </Button>
                      )}


                      {item.action_type ===
                        "credit_review" && (
                        <Button
                          type="button"
                          disabled={
                            workingId ===
                            item.id
                          }
                          onClick={() =>
                            openCreditHold(
                              item
                            )
                          }
                          className="bg-black text-white hover:bg-black/85"
                        >
                          Place Credit Hold
                        </Button>
                      )}


                      <Button
                        type="button"
                        variant={
                          item.action_type ===
                          "credit_review"
                            ? "outline"
                            : "default"
                        }
                        disabled={
                          workingId ===
                          item.id
                        }
                        onClick={() =>
                          openDecision(
                            item,
                            "completed"
                          )
                        }
                        className={
                          item.action_type ===
                          "credit_review"
                            ? undefined
                            : "bg-black text-white hover:bg-black/85"
                        }
                      >
                        Mark Completed
                      </Button>

                    </div>
                  )}

              </div>
            )
          )}

        </div>
      )}


      <ActionModal
        open={
          Boolean(
            decisionItem &&
            decisionType
          )
        }
        title={
          decisionType ===
          "completed"
            ? "Complete Collection Action"
            : "Dismiss Recommendation"
        }
        subtitle={
          decisionItem
            ? `${actionLabel(
                decisionItem.action_type
              )} · ${decisionItem.customer_name}`
            : undefined
        }
        onClose={
          closeDecision
        }
        maxWidth="max-w-xl"
      >

        <div className="grid gap-5">

          <label className="text-sm">

            <span className="mb-1 block font-medium">
              Note
            </span>

            <textarea
              rows={4}
              value={
                decisionNote
              }
              onChange={
                (
                  event
                ) =>
                  setDecisionNote(
                    event.target.value
                  )
              }
              placeholder={
                decisionType ===
                "completed"
                  ? "Example: Called customer; payment expected Friday."
                  : "Why is this recommendation being dismissed?"
              }
              className="w-full rounded-md border bg-background px-3 py-2.5"
            />

          </label>


          <div className="flex justify-end gap-3 border-t pt-4">

            <Button
              type="button"
              variant="outline"
              disabled={
                Boolean(
                  workingId
                )
              }
              onClick={
                closeDecision
              }
            >
              Cancel
            </Button>


            <Button
              type="button"
              disabled={
                Boolean(
                  workingId
                )
              }
              onClick={() =>
                void saveDecision()
              }
              className="bg-black text-white hover:bg-black/85"
            >
              {workingId
                ? "Saving..."
                : decisionType ===
                    "completed"
                  ? "Mark Completed"
                  : "Dismiss"}
            </Button>

          </div>

        </div>

      </ActionModal>


      <ActionModal
        open={
          Boolean(
            holdItem
          )
        }
        title="Place Customer on Credit Hold"
        subtitle={
          holdItem
            ? `${holdItem.customer_name} · ${formatCurrency(
                holdItem.outstanding
              )} outstanding`
            : undefined
        }
        onClose={
          closeCreditHold
        }
        maxWidth="max-w-xl"
      >

        <div className="grid gap-5">

          <div className="rounded-lg border bg-muted/20 p-4">

            <p className="font-medium">
              Credit sales will be restricted
            </p>

            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              New credit Sales Orders and credit invoices will require authorised override while this hold remains active.
            </p>

          </div>


          <label className="text-sm">

            <span className="mb-1 block font-medium">
              Credit Hold Reason
            </span>

            <textarea
              rows={4}
              value={
                holdReason
              }
              onChange={
                (
                  event
                ) =>
                  setHoldReason(
                    event.target.value
                  )
              }
              placeholder="Why should further credit be restricted?"
              className="w-full rounded-md border bg-background px-3 py-2.5"
            />

          </label>


          <div className="flex justify-end gap-3 border-t pt-4">

            <Button
              type="button"
              variant="outline"
              disabled={
                Boolean(
                  workingId
                )
              }
              onClick={
                closeCreditHold
              }
            >
              Cancel
            </Button>


            <Button
              type="button"
              disabled={
                Boolean(
                  workingId
                )
              }
              onClick={() =>
                void applyCreditHold()
              }
              className="bg-black text-white hover:bg-black/85"
            >
              {workingId
                ? "Applying..."
                : "Confirm Credit Hold"}
            </Button>

          </div>

        </div>

      </ActionModal>

    </section>
  );
}
