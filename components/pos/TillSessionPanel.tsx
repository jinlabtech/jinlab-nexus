"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Banknote,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  UnlockKeyhole,
  WalletCards,
} from "lucide-react";

import ActionModal from "@/components/ui/ActionModal";

import {
  Button,
} from "@/components/ui/button";

import {
  usePermissions,
} from "@/hooks/usePermissions";

import {
  supabase,
} from "@/lib/supabase";


type TillTotals = {
  opening_float: number;
  cash_sales: number;
  card_sales: number;
  eft_sales: number;
  other_sales: number;
  gross_sales: number;
  transaction_count: number;
  expected_cash: number;
};


type OpenTill = {
  id: string;
  session_number: string;
  branch_id: string;
  branch_name: string;
  cashier_user_id: string;
  cashier_name: string;
  opened_at: string;
  opening_float: number;
  totals: TillTotals;
};


type TillWorkspace = {
  ok: boolean;
  selected_branch_id: string | null;
  require_cashier_session: boolean;
  can_open: boolean;
  can_close: boolean;
  can_manage_cashup: boolean;
  open_session: OpenTill | null;
  recent_sessions: unknown[];
};


function money(
  value:
    number |
    string |
    null |
    undefined
) {

  return new Intl.NumberFormat(
    "en-ZA",
    {
      style: "currency",
      currency: "ZAR",
      maximumFractionDigits: 2,
    }
  ).format(
    Number(
      value ?? 0
    )
  );
}


export default function TillSessionPanel({
  branchId,
  onSessionChange,
}: {
  branchId: string;
  onSessionChange?: () => void;
}) {

  const {
    can,
  } =
    usePermissions();


  const [
    workspace,
    setWorkspace,
  ] =
    useState<
      TillWorkspace |
      null
    >(null);


  const [
    loading,
    setLoading,
  ] =
    useState(false);


  const [
    openModal,
    setOpenModal,
  ] =
    useState(false);


  const [
    closeModal,
    setCloseModal,
  ] =
    useState(false);


  const [
    openingFloat,
    setOpeningFloat,
  ] =
    useState("0");


  const [
    countedCash,
    setCountedCash,
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
    saving,
    setSaving,
  ] =
    useState(false);


  async function load() {

    if (!branchId) {
      return;
    }


    try {

      setLoading(true);
      setErrorMessage("");


      const {
        data,
        error,
      } =
        await supabase.rpc(
          "get_pos_till_workspace",
          {
            p_branch_id:
              branchId,
          }
        );


      if (error) {
        throw error;
      }


      setWorkspace(
        data as TillWorkspace
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Till session could not be loaded."
      );

    } finally {

      setLoading(false);
    }
  }


  useEffect(
    () => {

      void load();

    },
    [
      branchId,
    ]
  );


  async function openTill() {

    try {

      setSaving(true);
      setErrorMessage("");


      const {
        error,
      } =
        await supabase.rpc(
          "open_pos_till_session",
          {
            p_branch_id:
              branchId,

            p_opening_float:
              Number(
                openingFloat ||
                0
              ),

            p_notes:
              notes.trim() ||
              null,
          }
        );


      if (error) {
        throw error;
      }


      setOpenModal(false);
      setOpeningFloat("0");
      setNotes("");


      await load();

      onSessionChange?.();

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Till could not be opened."
      );

    } finally {

      setSaving(false);
    }
  }


  async function closeTill() {

    if (
      !workspace
        ?.open_session
    ) {
      return;
    }


    try {

      setSaving(true);
      setErrorMessage("");


      const {
        error,
      } =
        await supabase.rpc(
          "close_pos_till_session",
          {
            p_session_id:
              workspace
                .open_session
                .id,

            p_counted_cash:
              Number(
                countedCash ||
                0
              ),

            p_notes:
              notes.trim() ||
              null,
          }
        );


      if (error) {
        throw error;
      }


      setCloseModal(false);
      setCountedCash("");
      setNotes("");


      await load();

      onSessionChange?.();

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Till could not be closed."
      );

    } finally {

      setSaving(false);
    }
  }


  const session =
    workspace
      ?.open_session;


  const wrongBranch =
    Boolean(
      session &&
      session.branch_id !==
        branchId
    );


  if (loading) {

    return (
      <div className="mb-5 rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
        Loading till session...
      </div>
    );
  }


  return (
    <>

      {
        errorMessage && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {
              errorMessage
            }
          </div>
        )
      }


      {
        !session ? (

          <div className={
            workspace
              ?.require_cashier_session
              ? "mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-5"
              : "mb-5 rounded-2xl border bg-card p-5"
          }>

            <div className="flex flex-wrap items-center justify-between gap-4">

              <div className="flex items-start gap-3">

                <LockKeyhole className="mt-0.5 h-5 w-5 text-amber-700" />


                <div>

                  <p className="font-semibold">
                    No Till Session Open
                  </p>


                  <p className="mt-1 text-sm text-muted-foreground">
                    {
                      workspace
                        ?.require_cashier_session
                        ? "A till session is required before checkout."
                        : "Opening a till session enables float control and cash-up."
                    }
                  </p>

                </div>

              </div>


              {
                can(
                  "pos.session.open"
                ) && (
                  <Button
                    type="button"
                    onClick={() =>
                      setOpenModal(
                        true
                      )
                    }
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  >

                    <UnlockKeyhole className="mr-2 h-4 w-4" />

                    Open Till

                  </Button>
                )
              }

            </div>

          </div>

        ) : (

          <div className={
            wrongBranch
              ? "mb-5 rounded-2xl border border-red-200 bg-red-50 p-5"
              : "mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"
          }>

            <div className="flex flex-wrap items-start justify-between gap-4">

              <div>

                <div className="flex items-center gap-2">

                  <CheckCircle2 className="h-5 w-5 text-emerald-700" />


                  <p className="font-bold">
                    Till Open · {
                      session.session_number
                    }
                  </p>

                </div>


                <p className="mt-1 text-sm text-muted-foreground">
                  {
                    session.branch_name
                  } · {
                    session.cashier_name
                  }
                </p>


                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">

                  <Clock3 className="h-3.5 w-3.5" />

                  Opened {
                    new Date(
                      session.opened_at
                    ).toLocaleString(
                      "en-ZA"
                    )
                  }

                </p>

              </div>


              {
                can(
                  "pos.session.close"
                ) && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {

                      setCountedCash(
                        String(
                          session
                            .totals
                            .expected_cash
                        )
                      );

                      setCloseModal(
                        true
                      );
                    }}
                  >
                    Cash-Up / Close Till
                  </Button>
                )
              }

            </div>


            {
              wrongBranch && (
                <p className="mt-4 rounded-xl bg-white/70 p-3 text-sm font-semibold text-red-800">
                  This till belongs to another branch. Close it before selling from the selected branch.
                </p>
              )
            }


            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">

              <div className="rounded-xl bg-white/70 p-3">

                <p className="text-xs text-muted-foreground">
                  Opening Float
                </p>

                <p className="mt-1 font-bold">
                  {
                    money(
                      session
                        .totals
                        .opening_float
                    )
                  }
                </p>

              </div>


              <div className="rounded-xl bg-white/70 p-3">

                <p className="text-xs text-muted-foreground">
                  Cash Sales
                </p>

                <p className="mt-1 font-bold">
                  {
                    money(
                      session
                        .totals
                        .cash_sales
                    )
                  }
                </p>

              </div>


              <div className="rounded-xl bg-white/70 p-3">

                <p className="text-xs text-muted-foreground">
                  Card
                </p>

                <p className="mt-1 font-bold">
                  {
                    money(
                      session
                        .totals
                        .card_sales
                    )
                  }
                </p>

              </div>


              <div className="rounded-xl bg-white/70 p-3">

                <p className="text-xs text-muted-foreground">
                  EFT / Other
                </p>

                <p className="mt-1 font-bold">
                  {
                    money(
                      session
                        .totals
                        .eft_sales +
                      session
                        .totals
                        .other_sales
                    )
                  }
                </p>

              </div>


              <div className="rounded-xl bg-white/70 p-3">

                <p className="text-xs text-muted-foreground">
                  Transactions
                </p>

                <p className="mt-1 font-bold">
                  {
                    session
                      .totals
                      .transaction_count
                  }
                </p>

              </div>


              <div className="rounded-xl bg-white/80 p-3">

                <p className="text-xs text-muted-foreground">
                  Expected Cash
                </p>

                <p className="mt-1 font-bold text-emerald-700">
                  {
                    money(
                      session
                        .totals
                        .expected_cash
                    )
                  }
                </p>

              </div>

            </div>

          </div>

        )
      }


      <ActionModal
        open={
          openModal
        }
        title="Open Till"
        subtitle="Enter the cash physically placed in the drawer before sales begin."
        onClose={() => {
          if (!saving) {
            setOpenModal(false);
          }
        }}
        maxWidth="max-w-lg"
      >

        <div className="space-y-5">

          <label className="block space-y-2 text-sm">

            <span className="font-medium">
              Opening Float
            </span>


            <div className="relative">

              <Banknote className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />


              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  openingFloat
                }
                onChange={
                  (
                    event
                  ) =>
                    setOpeningFloat(
                      event.target.value
                    )
                }
                className="w-full rounded-lg border bg-background py-2.5 pl-10 pr-3"
              />

            </div>

          </label>


          <label className="block space-y-2 text-sm">

            <span className="font-medium">
              Opening Note
            </span>


            <input
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
              placeholder="Optional"
              className="w-full rounded-lg border bg-background px-3 py-2.5"
            />

          </label>


          <div className="flex justify-end gap-2 border-t pt-4">

            <Button
              type="button"
              variant="outline"
              disabled={
                saving
              }
              onClick={() =>
                setOpenModal(
                  false
                )
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
                void openTill()
              }
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {
                saving
                  ? "Opening..."
                  : "Open Till"
              }
            </Button>

          </div>

        </div>

      </ActionModal>


      <ActionModal
        open={
          closeModal
        }
        title="Cash-Up & Close Till"
        subtitle={
          session
            ? `Expected cash ${money(
                session
                  .totals
                  .expected_cash
              )}`
            : ""
        }
        onClose={() => {
          if (!saving) {
            setCloseModal(false);
          }
        }}
        maxWidth="max-w-lg"
      >

        <div className="space-y-5">

          {
            session && (
              <div className="grid grid-cols-2 gap-3 rounded-xl border p-4">

                <div>

                  <p className="text-xs text-muted-foreground">
                    Opening Float
                  </p>

                  <p className="mt-1 font-bold">
                    {
                      money(
                        session
                          .totals
                          .opening_float
                      )
                    }
                  </p>

                </div>


                <div>

                  <p className="text-xs text-muted-foreground">
                    Cash Sales
                  </p>

                  <p className="mt-1 font-bold">
                    {
                      money(
                        session
                          .totals
                          .cash_sales
                      )
                    }
                  </p>

                </div>


                <div>

                  <p className="text-xs text-muted-foreground">
                    Gross Sales
                  </p>

                  <p className="mt-1 font-bold">
                    {
                      money(
                        session
                          .totals
                          .gross_sales
                      )
                    }
                  </p>

                </div>


                <div>

                  <p className="text-xs text-muted-foreground">
                    Expected Drawer
                  </p>

                  <p className="mt-1 font-bold text-emerald-700">
                    {
                      money(
                        session
                          .totals
                          .expected_cash
                      )
                    }
                  </p>

                </div>

              </div>
            )
          }


          <label className="block space-y-2 text-sm">

            <span className="font-medium">
              Actual Cash Counted
            </span>


            <div className="relative">

              <WalletCards className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />


              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  countedCash
                }
                onChange={
                  (
                    event
                  ) =>
                    setCountedCash(
                      event.target.value
                    )
                }
                className="w-full rounded-lg border bg-background py-2.5 pl-10 pr-3"
              />

            </div>

          </label>


          {
            session &&
            countedCash !==
              "" && (
              <div className="rounded-xl bg-muted/40 p-4">

                <p className="text-xs text-muted-foreground">
                  Difference
                </p>


                <p className={
                  Math.abs(
                    Number(
                      countedCash
                    ) -
                    session
                      .totals
                      .expected_cash
                  ) <
                  0.01
                    ? "mt-1 text-xl font-bold text-emerald-700"
                    : "mt-1 text-xl font-bold text-red-700"
                }>
                  {
                    money(
                      Number(
                        countedCash
                      ) -
                      session
                        .totals
                        .expected_cash
                    )
                  }
                </p>

              </div>
            )
          }


          <label className="block space-y-2 text-sm">

            <span className="font-medium">
              Closing Note
            </span>


            <input
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
              placeholder="Explain shortages/overages if necessary"
              className="w-full rounded-lg border bg-background px-3 py-2.5"
            />

          </label>


          <div className="flex justify-end gap-2 border-t pt-4">

            <Button
              type="button"
              variant="outline"
              disabled={
                saving
              }
              onClick={() =>
                setCloseModal(
                  false
                )
              }
            >
              Cancel
            </Button>


            <Button
              type="button"
              disabled={
                saving ||
                countedCash ===
                  ""
              }
              onClick={() =>
                void closeTill()
              }
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {
                saving
                  ? "Closing..."
                  : "Confirm Cash-Up"
              }
            </Button>

          </div>

        </div>

      </ActionModal>

    </>
  );
}
