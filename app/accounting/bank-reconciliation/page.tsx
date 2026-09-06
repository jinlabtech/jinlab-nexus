"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Landmark,
  RefreshCw,
  WalletCards,
} from "lucide-react";

import { useRouter } from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import AccountingNav from "@/components/accounting/AccountingNav";
import ActionModal from "@/components/ui/ActionModal";

import { Button } from "@/components/ui/button";

import { usePermissions } from "@/hooks/usePermissions";

import { supabase } from "@/lib/supabase";


type ClearingReceipt = {
  clearing_line_id: string;
  journal_id: string;
  entry_number: string;
  entry_date: string;

  branch_id: string;
  branch_name: string | null;

  description: string;
  source_type: string;
  source_id: string | null;
  source_event: string | null;

  amount: number;

  payment_method: string;
  payment_reference: string | null;
  invoice_number: string | null;
};


type Settlement = {
  id: string;
  settlement_number: string;
  settlement_date: string;

  branch_id: string;
  branch_name: string | null;

  gross_amount: number;
  fee_amount: number;
  net_amount: number;

  reference: string | null;
  status: string;
};


type ClearingWorkspace = {
  ok: boolean;

  as_of_date: string;

  summary: {
    outstanding_total: number;
    outstanding_count: number;

    future_dated_receipt_count: number;
    future_dated_receipt_amount: number;
  };

  outstanding: ClearingReceipt[];

  recent_settlements: Settlement[];
};


function today() {
  const now = new Date();

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
    Number(value ?? 0)
  );
}


function niceDate(
  value:
    string |
    null |
    undefined
) {
  if (!value) {
    return "—";
  }

  return new Date(
    `${value}T00:00:00`
  ).toLocaleDateString(
    "en-ZA",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}


export default function BankReconciliationPage() {

  const router =
    useRouter();


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


  const canReconcile =
    can(
      "accounting.bank_reconcile"
    );


  const [
    companyName,
    setCompanyName,
  ] =
    useState(
      "JINLAB Nexus"
    );


  const [
    workspace,
    setWorkspace,
  ] =
    useState<
      ClearingWorkspace |
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
    settling,
    setSettling,
  ] =
    useState(false);


  const [
    selectedIds,
    setSelectedIds,
  ] =
    useState<string[]>(
      []
    );


  const [
    showSettlement,
    setShowSettlement,
  ] =
    useState(false);


  const [
    settlementDate,
    setSettlementDate,
  ] =
    useState(
      today()
    );


  const [
    destination,
    setDestination,
  ] =
    useState<
      "bank" |
      "cash"
    >(
      "bank"
    );


  const [
    feeAmount,
    setFeeAmount,
  ] =
    useState(
      "0"
    );


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


  async function loadWorkspace(
    silent = false
  ) {

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
        data:
          profile,
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
        workspaceResult,
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

          supabase.rpc(
            "get_payment_clearing_workspace",
            {
              p_as_of_date:
                today(),
            }
          ),
        ]);


      if (
        companyResult.error
      ) {
        throw companyResult.error;
      }


      if (
        workspaceResult.error
      ) {
        throw workspaceResult.error;
      }


      setCompanyName(
        companyResult.data
          ?.company_name ??
        "JINLAB Nexus"
      );


      setWorkspace(
        workspaceResult.data as ClearingWorkspace
      );


      setSelectedIds(
        []
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Payment Clearing could not be loaded."
      );

    } finally {

      setLoading(false);
      setRefreshing(false);
    }
  }


  useEffect(
    () => {

      if (
        permissionsLoading
      ) {
        return;
      }


      if (!canView) {
        setLoading(false);
        return;
      }


      void loadWorkspace();

    },
    [
      permissionsLoading,
      canView,
    ]
  );


  const selectedReceipts =
    useMemo(
      () => {

        if (!workspace) {
          return [];
        }


        return workspace
          .outstanding
          .filter(
            (
              receipt
            ) =>
              selectedIds.includes(
                receipt.clearing_line_id
              )
          );

      },
      [
        workspace,
        selectedIds,
      ]
    );


  const selectedGross =
    useMemo(
      () =>
        selectedReceipts.reduce(
          (
            total,
            receipt
          ) =>
            total +
            Number(
              receipt.amount
            ),
          0
        ),
      [
        selectedReceipts,
      ]
    );


  const selectedBranch =
    selectedReceipts[0]
      ?.branch_id ??
    null;


  const fee =
    Math.max(
      Number(
        feeAmount ||
        0
      ),
      0
    );


  const netAmount =
    Math.max(
      selectedGross -
      fee,
      0
    );


  function toggleReceipt(
    receipt:
      ClearingReceipt
  ) {

    setErrorMessage("");


    setSelectedIds(
      (
        current
      ) => {

        if (
          current.includes(
            receipt.clearing_line_id
          )
        ) {
          return current.filter(
            (
              id
            ) =>
              id !==
              receipt.clearing_line_id
          );
        }


        const currentReceipts =
          workspace
            ?.outstanding
            .filter(
              (
                item
              ) =>
                current.includes(
                  item.clearing_line_id
                )
            ) ??
          [];


        const existingBranch =
          currentReceipts[0]
            ?.branch_id;


        if (
          existingBranch &&
          existingBranch !==
            receipt.branch_id
        ) {

          setErrorMessage(
            "A settlement batch can contain receipts from one branch only."
          );

          return current;
        }


        return [
          ...current,
          receipt.clearing_line_id,
        ];
      }
    );
  }


  function openSettlement() {

    if (
      selectedIds.length ===
      0
    ) {
      setErrorMessage(
        "Select at least one receipt to settle."
      );

      return;
    }


    setSettlementDate(
      today()
    );

    setDestination(
      "bank"
    );

    setFeeAmount(
      "0"
    );

    setReference(
      ""
    );

    setNotes(
      ""
    );

    setShowSettlement(
      true
    );
  }


  async function settleSelected() {

    if (
      selectedIds.length ===
      0
    ) {
      return;
    }


    if (
      fee >
      selectedGross
    ) {
      setErrorMessage(
        "The processing fee cannot be greater than the selected receipts."
      );

      return;
    }


    try {

      setSettling(true);

      setErrorMessage("");
      setSuccessMessage("");


      const {
        data,
        error,
      } =
        await supabase.rpc(
          "create_payment_clearing_settlement",
          {
            p_clearing_line_ids:
              selectedIds,

            p_settlement_date:
              settlementDate,

            p_destination:
              destination,

            p_fee_amount:
              fee,

            p_reference:
              reference.trim() ||
              null,

            p_notes:
              notes.trim() ||
              null,
          }
        );


      if (error) {
        throw error;
      }


      setSuccessMessage(
        data?.message ??
        "Payment Clearing settled."
      );


      setShowSettlement(
        false
      );

      setSelectedIds(
        []
      );


      await loadWorkspace(
        true
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Settlement could not be recorded."
      );

    } finally {

      setSettling(false);
    }
  }


  async function logout() {

    await supabase.auth
      .signOut();

    router.replace(
      "/login"
    );
  }


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
            Loading bank clearing...
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


        <main className="mx-auto max-w-5xl p-6">

          <div className="rounded-2xl border p-6">

            <h1 className="text-xl font-bold">
              Accounting Restricted
            </h1>

          </div>

        </main>

      </DashboardLayout>
    );
  }


  const summary =
    workspace?.summary;


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


      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">

        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">

          <div>

            <p className="text-sm font-semibold text-muted-foreground">
              Accounting
            </p>


            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Bank & Clearing
            </h1>


            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Match card and other customer receipts to the money
              that actually reached the bank. Nexus handles the
              accounting entry automatically.
            </p>

          </div>


          <Button
            type="button"
            variant="outline"
            disabled={
              refreshing
            }
            onClick={() =>
              void loadWorkspace(
                true
              )
            }
          >

            <RefreshCw
              className={`mr-2 h-4 w-4 ${
                refreshing
                  ? "animate-spin"
                  : ""
              }`}
            />

            Refresh

          </Button>

        </div>


        <AccountingNav />


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
          successMessage && (
            <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              {
                successMessage
              }
            </div>
          )
        }


        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">

            <WalletCards className="h-5 w-5" />

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide">
              Waiting for Settlement
            </p>

            <p className="mt-2 text-2xl font-bold">
              {
                money(
                  summary?.outstanding_total
                )
              }
            </p>

            <p className="mt-2 text-xs">
              {
                summary?.outstanding_count ??
                0
              } receipt(s)
            </p>

          </div>


          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">

            <Landmark className="h-5 w-5" />

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide">
              Selected Gross
            </p>

            <p className="mt-2 text-2xl font-bold">
              {
                money(
                  selectedGross
                )
              }
            </p>

            <p className="mt-2 text-xs">
              Before processing fees.
            </p>

          </div>


          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-950">

            <CreditCard className="h-5 w-5" />

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide">
              Selected Fee
            </p>

            <p className="mt-2 text-2xl font-bold">
              {
                money(
                  fee
                )
              }
            </p>

            <p className="mt-2 text-xs">
              Processor or bank charge.
            </p>

          </div>


          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 text-violet-950">

            <CheckCircle2 className="h-5 w-5" />

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide">
              Net to Bank
            </p>

            <p className="mt-2 text-2xl font-bold">
              {
                money(
                  netAmount
                )
              }
            </p>

            <p className="mt-2 text-xs">
              Gross minus fee.
            </p>

          </div>

        </section>


        {
          Number(
            summary?.future_dated_receipt_count ??
            0
          ) >
            0 && (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">

              <div className="flex items-start gap-3">

                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />


                <div>

                  <p className="font-semibold">
                    Historical future-dated payment data detected
                  </p>


                  <p className="mt-1 text-sm leading-6">
                    {
                      summary?.future_dated_receipt_count
                    } payment receipt(s) worth{" "}
                    <strong>
                      {
                        money(
                          summary?.future_dated_receipt_amount
                        )
                      }
                    </strong>{" "}
                    are dated after today.

                    Nexus now prevents new actual payments from
                    being future-dated. These older entries are
                    excluded from today&apos;s clearing balance.
                  </p>

                </div>

              </div>

            </div>
          )
        }


        <section className="mt-8 overflow-hidden rounded-2xl border bg-card">

          <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5">

            <div>

              <h2 className="text-lg font-semibold">
                Payments Waiting for Bank
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Tick only payments that appear together on the
                same bank settlement.
              </p>

            </div>


            {
              canReconcile && (
                <Button
                  type="button"
                  disabled={
                    selectedIds.length ===
                    0
                  }
                  onClick={
                    openSettlement
                  }
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Settle Selected
                </Button>
              )
            }

          </div>


          {
            !workspace ||
            workspace.outstanding.length ===
              0 ? (
              <div className="p-10 text-center">

                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />

                <p className="mt-3 font-semibold">
                  Payment Clearing is clean
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  No card or other receipts are waiting for settlement.
                </p>

              </div>
            ) : (
              <div className="overflow-x-auto">

                <table className="w-full min-w-[900px] text-sm">

                  <thead className="bg-muted/40">

                    <tr>

                      <th className="px-4 py-3 text-left">
                        Select
                      </th>

                      <th className="px-4 py-3 text-left">
                        Date
                      </th>

                      <th className="px-4 py-3 text-left">
                        Branch
                      </th>

                      <th className="px-4 py-3 text-left">
                        Invoice
                      </th>

                      <th className="px-4 py-3 text-left">
                        Method
                      </th>

                      <th className="px-4 py-3 text-left">
                        Reference
                      </th>

                      <th className="px-4 py-3 text-right">
                        Amount
                      </th>

                    </tr>

                  </thead>


                  <tbody className="divide-y">

                    {
                      workspace.outstanding.map(
                        (
                          receipt
                        ) => {

                          const selected =
                            selectedIds.includes(
                              receipt.clearing_line_id
                            );


                          const differentBranch =
                            selectedBranch !==
                              null &&
                            selectedBranch !==
                              receipt.branch_id &&
                            !selected;


                          return (
                            <tr
                              key={
                                receipt.clearing_line_id
                              }
                              className={
                                selected
                                  ? "bg-emerald-50"
                                  : "hover:bg-muted/20"
                              }
                            >

                              <td className="px-4 py-4">

                                <input
                                  type="checkbox"
                                  checked={
                                    selected
                                  }
                                  disabled={
                                    differentBranch
                                  }
                                  onChange={() =>
                                    toggleReceipt(
                                      receipt
                                    )
                                  }
                                  className="h-4 w-4"
                                />

                              </td>


                              <td className="px-4 py-4">
                                {
                                  niceDate(
                                    receipt.entry_date
                                  )
                                }
                              </td>


                              <td className="px-4 py-4">
                                {
                                  receipt.branch_name ??
                                  "—"
                                }
                              </td>


                              <td className="px-4 py-4 font-medium">
                                {
                                  receipt.invoice_number ??
                                  receipt.entry_number
                                }
                              </td>


                              <td className="px-4 py-4">

                                <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase">
                                  {
                                    receipt.payment_method
                                  }
                                </span>

                              </td>


                              <td className="px-4 py-4 text-muted-foreground">
                                {
                                  receipt.payment_reference ??
                                  "—"
                                }
                              </td>


                              <td className="px-4 py-4 text-right font-bold">
                                {
                                  money(
                                    receipt.amount
                                  )
                                }
                              </td>

                            </tr>
                          );
                        }
                      )
                    }

                  </tbody>

                </table>

              </div>
            )
          }

        </section>


        <section className="mt-8 overflow-hidden rounded-2xl border bg-card">

          <div className="border-b p-5">

            <h2 className="text-lg font-semibold">
              Recent Settlements
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Audit history of money moved from Payment Clearing
              into Bank or Cash.
            </p>

          </div>


          {
            !workspace ||
            workspace.recent_settlements.length ===
              0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No settlement batches recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">

                <table className="w-full min-w-[800px] text-sm">

                  <thead className="bg-muted/40">

                    <tr>

                      <th className="px-4 py-3 text-left">
                        Settlement
                      </th>

                      <th className="px-4 py-3 text-left">
                        Date
                      </th>

                      <th className="px-4 py-3 text-left">
                        Branch
                      </th>

                      <th className="px-4 py-3 text-right">
                        Gross
                      </th>

                      <th className="px-4 py-3 text-right">
                        Fee
                      </th>

                      <th className="px-4 py-3 text-right">
                        Net
                      </th>

                    </tr>

                  </thead>


                  <tbody className="divide-y">

                    {
                      workspace.recent_settlements.map(
                        (
                          settlement
                        ) => (
                          <tr
                            key={
                              settlement.id
                            }
                          >

                            <td className="px-4 py-4 font-semibold">
                              {
                                settlement.settlement_number
                              }
                            </td>


                            <td className="px-4 py-4">
                              {
                                niceDate(
                                  settlement.settlement_date
                                )
                              }
                            </td>


                            <td className="px-4 py-4">
                              {
                                settlement.branch_name ??
                                "—"
                              }
                            </td>


                            <td className="px-4 py-4 text-right">
                              {
                                money(
                                  settlement.gross_amount
                                )
                              }
                            </td>


                            <td className="px-4 py-4 text-right">
                              {
                                money(
                                  settlement.fee_amount
                                )
                              }
                            </td>


                            <td className="px-4 py-4 text-right font-bold">
                              {
                                money(
                                  settlement.net_amount
                                )
                              }
                            </td>

                          </tr>
                        )
                      )
                    }

                  </tbody>

                </table>

              </div>
            )
          }

        </section>


        <ActionModal
          open={
            showSettlement
          }
          title="Settle Payment Clearing"
          subtitle={
            selectedReceipts.length
              ? `${selectedReceipts.length} receipt(s) · ${money(
                  selectedGross
                )} gross`
              : ""
          }
          onClose={() => {
            if (!settling) {
              setShowSettlement(
                false
              );
            }
          }}
          maxWidth="max-w-lg"
        >

          <div className="space-y-5">

            <div className="rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">

              <strong>
                Nexus will post:
              </strong>{" "}

              Payment Clearing decreases,
              Bank/Cash increases by the net amount,
              and any processing fee becomes Bank Charges.

            </div>


            <label className="block space-y-2 text-sm">

              <span className="font-medium">
                Settlement Date
              </span>

              <input
                type="date"
                value={
                  settlementDate
                }
                max={
                  today()
                }
                onChange={
                  (
                    event
                  ) =>
                    setSettlementDate(
                      event.target.value
                    )
                }
                className="w-full rounded-lg border bg-background px-3 py-2"
              />

            </label>


            <label className="block space-y-2 text-sm">

              <span className="font-medium">
                Money Reached
              </span>

              <select
                value={
                  destination
                }
                onChange={
                  (
                    event
                  ) =>
                    setDestination(
                      event.target.value as
                        | "bank"
                        | "cash"
                    )
                }
                className="w-full rounded-lg border bg-background px-3 py-2"
              >

                <option value="bank">
                  Bank Account
                </option>

                <option value="cash">
                  Cash on Hand
                </option>

              </select>

            </label>


            <label className="block space-y-2 text-sm">

              <span className="font-medium">
                Processing / Bank Fee
              </span>

              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  feeAmount
                }
                onChange={
                  (
                    event
                  ) =>
                    setFeeAmount(
                      event.target.value
                    )
                }
                className="w-full rounded-lg border bg-background px-3 py-2"
              />

            </label>


            <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-3">

              <div>

                <p className="text-xs text-muted-foreground">
                  Gross
                </p>

                <p className="mt-1 font-bold">
                  {
                    money(
                      selectedGross
                    )
                  }
                </p>

              </div>


              <div>

                <p className="text-xs text-muted-foreground">
                  Fee
                </p>

                <p className="mt-1 font-bold">
                  {
                    money(
                      fee
                    )
                  }
                </p>

              </div>


              <div>

                <p className="text-xs text-muted-foreground">
                  Net Received
                </p>

                <p className="mt-1 font-bold text-emerald-700">
                  {
                    money(
                      netAmount
                    )
                  }
                </p>

              </div>

            </div>


            <label className="block space-y-2 text-sm">

              <span className="font-medium">
                Bank / Settlement Reference
              </span>

              <input
                type="text"
                value={
                  reference
                }
                onChange={
                  (
                    event
                  ) =>
                    setReference(
                      event.target.value
                    )
                }
                placeholder="e.g. Merchant settlement reference"
                className="w-full rounded-lg border bg-background px-3 py-2"
              />

            </label>


            <label className="block space-y-2 text-sm">

              <span className="font-medium">
                Notes
              </span>

              <input
                type="text"
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
                className="w-full rounded-lg border bg-background px-3 py-2"
              />

            </label>


            <div className="flex justify-end gap-2 border-t pt-4">

              <Button
                type="button"
                variant="outline"
                disabled={
                  settling
                }
                onClick={() =>
                  setShowSettlement(
                    false
                  )
                }
              >
                Cancel
              </Button>


              <Button
                type="button"
                disabled={
                  settling ||
                  selectedIds.length ===
                    0
                }
                onClick={() =>
                  void settleSelected()
                }
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >

                {
                  settling
                    ? "Settling..."
                    : "Confirm Settlement"
                }

              </Button>

            </div>

          </div>

        </ActionModal>

      </main>

    </DashboardLayout>
  );
}
