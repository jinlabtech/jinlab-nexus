"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import DataTable from "@/components/DataTable";
import AccountingNav from "@/components/accounting/AccountingNav";

import {
  Button,
} from "@/components/ui/button";

import {
  usePermissions,
} from "@/hooks/usePermissions";

import {
  supabase,
} from "@/lib/supabase";

import {
  approveJournalEntry,
  createManualJournal,
  getChartOfAccounts,
  getJournalDetail,
  getJournalEntries,
  getTrialBalance,
  postJournalEntry,
  reverseJournalEntry,
} from "@/lib/services/accountingService";

import type {
  ChartOfAccountRow,
  JournalDetail,
  JournalEntry,
  TrialBalanceResult,
} from "@/lib/services/accountingService";


type DraftLine = {
  accountId: string;
  description: string;
  debit: string;
  credit: string;
};


type BranchOption = {
  id: string;
  branch_name: string;
};


function todayInput() {
  const now =
    new Date();

  const local =
    new Date(
      now.getTime() -
      now.getTimezoneOffset() *
        60000
    );

  return local
    .toISOString()
    .slice(
      0,
      10
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


function label(
  value: string
) {
  return value
    .replaceAll(
      "_",
      " "
    )
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase()
    );
}


function newLine(): DraftLine {
  return {
    accountId: "",
    description: "",
    debit: "",
    credit: "",
  };
}


export default function JournalsPage() {
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

  const canCreate =
    can(
      "accounting.journal.create"
    );

  const canApprove =
    can(
      "accounting.journal.approve"
    );

  const canPost =
    can(
      "accounting.journal.post"
    );


  const [
    companyId,
    setCompanyId,
  ] =
    useState("");

  const [
    companyName,
    setCompanyName,
  ] =
    useState(
      "JINLAB Nexus"
    );

  const [
    accounts,
    setAccounts,
  ] =
    useState<
      ChartOfAccountRow[]
    >([]);

  const [
    journals,
    setJournals,
  ] =
    useState<
      JournalEntry[]
    >([]);

  const [
    branches,
    setBranches,
  ] =
    useState<
      BranchOption[]
    >([]);

  const [
    trialBalance,
    setTrialBalance,
  ] =
    useState<
      TrialBalanceResult |
      null
    >(null);


  const [
    selected,
    setSelected,
  ] =
    useState<
      JournalDetail |
      null
    >(null);

  const [
    selectedLoading,
    setSelectedLoading,
  ] =
    useState(false);


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
    message,
    setMessage,
  ] =
    useState("");


  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState<
      "all" |
      "draft" |
      "pending" |
      "posted"
    >("all");


  const [
    showNewJournal,
    setShowNewJournal,
  ] =
    useState(false);

  const [
    entryDate,
    setEntryDate,
  ] =
    useState(
      todayInput()
    );

  const [
    description,
    setDescription,
  ] =
    useState("");

  const [
    reference,
    setReference,
  ] =
    useState("");

  const [
    branchId,
    setBranchId,
  ] =
    useState("");

  const [
    lines,
    setLines,
  ] =
    useState<DraftLine[]>([
      newLine(),
      newLine(),
    ]);


  const [
    showTrialBalance,
    setShowTrialBalance,
  ] =
    useState(false);

  const [
    trialDate,
    setTrialDate,
  ] =
    useState(
      todayInput()
    );


  const [
    showReversal,
    setShowReversal,
  ] =
    useState(false);

  const [
    reversalDate,
    setReversalDate,
  ] =
    useState(
      todayInput()
    );

  const [
    reversalReason,
    setReversalReason,
  ] =
    useState("");


  async function loadData(
    silent = false
  ) {
    try {
      if (silent) {
        setRefreshing(
          true
        );
      } else {
        setLoading(
          true
        );
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
        data: profile,
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


      const currentCompanyId =
        profile.company_id;

      setCompanyId(
        currentCompanyId
      );


      const [
        companyResult,
        accountResult,
        journalResult,
        branchResult,
        trialResult,
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
              currentCompanyId
            )
            .single(),

          getChartOfAccounts(),

          getJournalEntries(
            currentCompanyId
          ),

          supabase
            .from(
              "branch"
            )
            .select(
              "id, branch_name"
            )
            .eq(
              "company_id",
              currentCompanyId
            )
            .order(
              "branch_name"
            ),

          getTrialBalance(
            trialDate
          ),
        ]);


      if (
        companyResult.error
      ) {
        throw new Error(
          companyResult
            .error.message
        );
      }


      if (
        branchResult.error
      ) {
        throw new Error(
          branchResult
            .error.message
        );
      }


      setCompanyName(
        companyResult
          .data.company_name
      );

      setAccounts(
        accountResult
      );

      setJournals(
        journalResult
      );

      setBranches(
        (
          branchResult.data ??
          []
        ) as BranchOption[]
      );

      setTrialBalance(
        trialResult
      );

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Accounting journals could not be loaded."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }


  useEffect(() => {
    if (
      permissionsLoading
    ) {
      return;
    }

    if (!canView) {
      setLoading(false);
      return;
    }

    void loadData();
  }, [
    permissionsLoading,
    canView,
  ]);


  async function logout() {
    await supabase.auth
      .signOut();

    router.replace(
      "/login"
    );
  }


  function money(
    value: number
  ) {
    return new Intl.NumberFormat(
      "en-ZA",
      {
        style:
          "currency",
        currency:
          trialBalance
            ?.currency ??
          "ZAR",
      }
    ).format(
      Number(
        value ||
        0
      )
    );
  }


  const manualAccounts =
    useMemo(
      () =>
        accounts.filter(
          (account) =>
            account.is_active &&
            account
              .allow_manual_posting
        ),
      [
        accounts,
      ]
    );


  const accountMap =
    useMemo(
      () =>
        new Map(
          accounts.map(
            (account) => [
              account.id,
              account,
            ]
          )
        ),
      [
        accounts,
      ]
    );


  const filteredJournals =
    useMemo(
      () =>
        journals.filter(
          (journal) => {
            if (
              statusFilter ===
              "all"
            ) {
              return true;
            }

            if (
              statusFilter ===
              "pending"
            ) {
              return (
                journal.status ===
                  "draft" &&
                journal
                  .approval_status ===
                  "pending"
              );
            }

            return (
              journal.status ===
              statusFilter
            );
          }
        ),
      [
        journals,
        statusFilter,
      ]
    );


  const debitTotal =
    useMemo(
      () =>
        lines.reduce(
          (
            total,
            line
          ) =>
            total +
            Number(
              line.debit ||
              0
            ),
          0
        ),
      [
        lines,
      ]
    );


  const creditTotal =
    useMemo(
      () =>
        lines.reduce(
          (
            total,
            line
          ) =>
            total +
            Number(
              line.credit ||
              0
            ),
          0
        ),
      [
        lines,
      ]
    );


  const draftBalanced =
    debitTotal > 0 &&
    Math.abs(
      debitTotal -
      creditTotal
    ) < 0.005;


  function resetJournalForm() {
    setEntryDate(
      todayInput()
    );

    setDescription("");
    setReference("");
    setBranchId("");

    setLines([
      newLine(),
      newLine(),
    ]);
  }


  function updateLine(
    index: number,
    changes:
      Partial<DraftLine>
  ) {
    setLines(
      (
        current
      ) =>
        current.map(
          (
            line,
            lineIndex
          ) =>
            lineIndex ===
            index
              ? {
                  ...line,
                  ...changes,
                }
              : line
        )
    );
  }


  function removeLine(
    index: number
  ) {
    if (
      lines.length <= 2
    ) {
      return;
    }

    setLines(
      (
        current
      ) =>
        current.filter(
          (
            _,
            lineIndex
          ) =>
            lineIndex !==
            index
        )
    );
  }


  async function saveJournal() {
    if (
      !entryDate ||
      !description.trim()
    ) {
      setErrorMessage(
        "Journal date and description are required."
      );

      return;
    }


    const preparedLines =
      lines.map(
        (line) => ({
          account_id:
            line.accountId,

          description:
            line.description ||
            undefined,

          debit:
            Number(
              line.debit ||
              0
            ),

          credit:
            Number(
              line.credit ||
              0
            ),
        })
      );


    if (
      preparedLines.some(
        (line) =>
          !line.account_id
      )
    ) {
      setErrorMessage(
        "Select an account for every journal line."
      );

      return;
    }


    try {
      setSaving(true);
      setErrorMessage("");
      setMessage("");

      const result =
        await createManualJournal({
          entryDate,
          description:
            description.trim(),
          reference:
            reference.trim(),
          branchId:
            branchId ||
            null,
          lines:
            preparedLines,
        });


      setMessage(
        `Journal ${result.journal.entry_number} saved as draft.`
      );

      setShowNewJournal(
        false
      );

      resetJournalForm();

      await loadData(
        true
      );

      await openJournal(
        result.journal.id
      );

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Journal could not be created."
      );
    } finally {
      setSaving(false);
    }
  }


  async function openJournal(
    journalId: string
  ) {
    if (!companyId) {
      return;
    }

    try {
      setSelectedLoading(
        true
      );

      setErrorMessage("");

      const detail =
        await getJournalDetail(
          journalId,
          companyId
        );

      setSelected(
        detail
      );

      setShowReversal(
        false
      );

      setReversalReason("");

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Journal could not be loaded."
      );
    } finally {
      setSelectedLoading(
        false
      );
    }
  }


  async function approveSelected() {
    if (!selected) {
      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");
      setMessage("");

      await approveJournalEntry(
        selected.journal.id
      );

      setMessage(
        `${selected.journal.entry_number} approved.`
      );

      await loadData(
        true
      );

      await openJournal(
        selected.journal.id
      );

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Journal could not be approved."
      );
    } finally {
      setSaving(false);
    }
  }


  async function postSelected() {
    if (!selected) {
      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");
      setMessage("");

      await postJournalEntry(
        selected.journal.id
      );

      setMessage(
        `${selected.journal.entry_number} posted to the ledger.`
      );

      await loadData(
        true
      );

      await openJournal(
        selected.journal.id
      );

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Journal could not be posted."
      );
    } finally {
      setSaving(false);
    }
  }


  async function reverseSelected() {
    if (
      !selected ||
      !reversalReason.trim()
    ) {
      setErrorMessage(
        "Enter a reason for the reversal."
      );

      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");
      setMessage("");

      await reverseJournalEntry(
        selected.journal.id,
        reversalDate,
        reversalReason.trim()
      );

      setMessage(
        `${selected.journal.entry_number} reversed successfully.`
      );

      setShowReversal(
        false
      );

      setReversalReason("");

      await loadData(
        true
      );

      await openJournal(
        selected.journal.id
      );

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Journal could not be reversed."
      );
    } finally {
      setSaving(false);
    }
  }


  async function refreshTrialBalance() {
    try {
      setRefreshing(
        true
      );

      setErrorMessage("");

      const result =
        await getTrialBalance(
          trialDate
        );

      setTrialBalance(
        result
      );

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Trial Balance could not be loaded."
      );
    } finally {
      setRefreshing(
        false
      );
    }
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
            Loading journals...
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

        <main className="mx-auto max-w-5xl p-6 lg:p-8">
          <div className="rounded-xl border p-6">
            <h1 className="text-xl font-bold">
              Accounting Restricted
            </h1>
          </div>
        </main>
      </DashboardLayout>
    );
  }


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

        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Accounting
            </p>

            <h1 className="mt-1 text-3xl font-bold">
              Journals
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Review, approve and post
              double-entry accounting
              transactions.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setShowTrialBalance(
                  !showTrialBalance
                )
              }
            >
              Trial Balance
            </Button>

            {canCreate && (
              <Button
                type="button"
                className="bg-black text-white hover:bg-black/85"
                onClick={() => {
                  resetJournalForm();
                  setShowNewJournal(
                    true
                  );
                }}
              >
                New Journal
              </Button>
            )}

          </div>
        </div>


        <AccountingNav />


        {errorMessage && (
          <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        )}


        {message && (
          <div className="mb-6 rounded-xl border bg-muted/30 p-4 text-sm">
            {message}
          </div>
        )}


        {showTrialBalance &&
          trialBalance && (
          <section className="mb-10 rounded-xl border bg-card">

            <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5">
              <div>
                <h2 className="text-lg font-semibold">
                  Trial Balance
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Posted ledger balances
                  as at{" "}
                  {formatDate(
                    trialBalance
                      .as_of_date
                  )}.
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="date"
                  value={
                    trialDate
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setTrialDate(
                        event.target
                          .value
                      )
                  }
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                />

                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    refreshing
                  }
                  onClick={() =>
                    void refreshTrialBalance()
                  }
                >
                  Refresh
                </Button>
              </div>
            </div>


            <div className="grid gap-4 border-b p-5 md:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">
                  Total Debit
                </p>

                <p className="mt-1 text-xl font-bold">
                  {money(
                    trialBalance
                      .total_debit
                  )}
                </p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">
                  Total Credit
                </p>

                <p className="mt-1 text-xl font-bold">
                  {money(
                    trialBalance
                      .total_credit
                  )}
                </p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">
                  Status
                </p>

                <p className="mt-1 text-xl font-bold">
                  {trialBalance
                    .balanced
                    ? "Balanced"
                    : "Out of Balance"}
                </p>
              </div>
            </div>


            <div className="p-5">
              <DataTable
                headers={[
                  "Code",
                  "Account",
                  "Debit",
                  "Credit",
                ]}
                rows={
                  trialBalance.rows
                    .filter(
                      (row) =>
                        Number(
                          row.trial_debit
                        ) !== 0 ||
                        Number(
                          row.trial_credit
                        ) !== 0
                    )
                    .map(
                      (
                        row
                      ) => [
                        row.code,

                        row.name,

                        money(
                          row.trial_debit
                        ),

                        money(
                          row.trial_credit
                        ),
                      ]
                    )
                }
                emptyMessage="No posted ledger balances yet."
              />
            </div>

          </section>
        )}


        {showNewJournal && (
          <section className="mb-10 rounded-xl border bg-card">

            <div className="border-b p-5">
              <h2 className="text-lg font-semibold">
                New Manual Journal
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Advanced accounting workspace.
                Ordinary Nexus transactions
                will create journals
                automatically later.
              </p>
            </div>


            <div className="grid gap-5 p-5 md:grid-cols-3">

              <label className="space-y-2">
                <span className="text-sm font-medium">
                  Journal Date
                </span>

                <input
                  type="date"
                  value={
                    entryDate
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setEntryDate(
                        event.target
                          .value
                      )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </label>


              <label className="space-y-2">
                <span className="text-sm font-medium">
                  Reference
                </span>

                <input
                  value={
                    reference
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setReference(
                        event.target
                          .value
                      )
                  }
                  placeholder="Optional"
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </label>


              <label className="space-y-2">
                <span className="text-sm font-medium">
                  Branch
                </span>

                <select
                  value={
                    branchId
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setBranchId(
                        event.target
                          .value
                      )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                >
                  <option value="">
                    Company wide
                  </option>

                  {branches.map(
                    (
                      branch
                    ) => (
                      <option
                        key={
                          branch.id
                        }
                        value={
                          branch.id
                        }
                      >
                        {
                          branch.branch_name
                        }
                      </option>
                    )
                  )}
                </select>
              </label>


              <label className="space-y-2 md:col-span-3">
                <span className="text-sm font-medium">
                  Description
                </span>

                <input
                  value={
                    description
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setDescription(
                        event.target
                          .value
                      )
                  }
                  placeholder="Describe the accounting transaction"
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </label>

            </div>


            <div className="border-t p-5">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h3 className="font-semibold">
                  Journal Lines
                </h3>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setLines(
                      (
                        current
                      ) => [
                        ...current,
                        newLine(),
                      ]
                    )
                  }
                >
                  Add Line
                </Button>
              </div>


              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px]">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="px-2 py-3">
                        Account
                      </th>

                      <th className="px-2 py-3">
                        Description
                      </th>

                      <th className="px-2 py-3 text-right">
                        Debit
                      </th>

                      <th className="px-2 py-3 text-right">
                        Credit
                      </th>

                      <th className="w-20 px-2 py-3" />
                    </tr>
                  </thead>

                  <tbody>
                    {lines.map(
                      (
                        line,
                        index
                      ) => (
                        <tr
                          key={
                            index
                          }
                          className="border-b"
                        >

                          <td className="px-2 py-3">
                            <select
                              value={
                                line.accountId
                              }
                              onChange={
                                (
                                  event
                                ) =>
                                  updateLine(
                                    index,
                                    {
                                      accountId:
                                        event.target
                                          .value,
                                    }
                                  )
                              }
                              className="w-full rounded-md border bg-background px-3 py-2"
                            >
                              <option value="">
                                Select account
                              </option>

                              {manualAccounts.map(
                                (
                                  account
                                ) => (
                                  <option
                                    key={
                                      account.id
                                    }
                                    value={
                                      account.id
                                    }
                                  >
                                    {account.code}
                                    {" — "}
                                    {account.name}
                                  </option>
                                )
                              )}
                            </select>
                          </td>


                          <td className="px-2 py-3">
                            <input
                              value={
                                line.description
                              }
                              onChange={
                                (
                                  event
                                ) =>
                                  updateLine(
                                    index,
                                    {
                                      description:
                                        event.target
                                          .value,
                                    }
                                  )
                              }
                              className="w-full rounded-md border bg-background px-3 py-2"
                            />
                          </td>


                          <td className="px-2 py-3">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={
                                line.debit
                              }
                              onChange={
                                (
                                  event
                                ) =>
                                  updateLine(
                                    index,
                                    {
                                      debit:
                                        event.target
                                          .value,
                                      credit:
                                        event.target
                                          .value
                                          ? ""
                                          : line.credit,
                                    }
                                  )
                              }
                              className="w-full rounded-md border bg-background px-3 py-2 text-right"
                            />
                          </td>


                          <td className="px-2 py-3">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={
                                line.credit
                              }
                              onChange={
                                (
                                  event
                                ) =>
                                  updateLine(
                                    index,
                                    {
                                      credit:
                                        event.target
                                          .value,
                                      debit:
                                        event.target
                                          .value
                                          ? ""
                                          : line.debit,
                                    }
                                  )
                              }
                              className="w-full rounded-md border bg-background px-3 py-2 text-right"
                            />
                          </td>


                          <td className="px-2 py-3">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={
                                lines.length <=
                                2
                              }
                              onClick={() =>
                                removeLine(
                                  index
                                )
                              }
                            >
                              Remove
                            </Button>
                          </td>

                        </tr>
                      )
                    )}
                  </tbody>


                  <tfoot>
                    <tr className="font-semibold">
                      <td
                        colSpan={2}
                        className="px-2 py-4 text-right"
                      >
                        Totals
                      </td>

                      <td className="px-2 py-4 text-right">
                        {money(
                          debitTotal
                        )}
                      </td>

                      <td className="px-2 py-4 text-right">
                        {money(
                          creditTotal
                        )}
                      </td>

                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>


              <div className="mt-4 rounded-lg border p-4 text-sm">
                {draftBalanced
                  ? "✓ Journal is balanced."
                  : "Journal can be saved as draft, but Debit must equal Credit before posting."}
              </div>
            </div>


            <div className="flex justify-end gap-2 border-t p-5">
              <Button
                type="button"
                variant="outline"
                disabled={
                  saving
                }
                onClick={() => {
                  setShowNewJournal(
                    false
                  );

                  resetJournalForm();
                }}
              >
                Cancel
              </Button>

              <Button
                type="button"
                disabled={
                  saving
                }
                className="bg-black text-white hover:bg-black/85"
                onClick={() =>
                  void saveJournal()
                }
              >
                {saving
                  ? "Saving..."
                  : "Save Draft"}
              </Button>
            </div>

          </section>
        )}


        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">

            <div>
              <h2 className="text-xl font-semibold">
                Journal Register
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Complete audit trail of
                accounting entries.
              </p>
            </div>


            <select
              value={
                statusFilter
              }
              onChange={
                (
                  event
                ) =>
                  setStatusFilter(
                    event.target
                      .value as
                      | "all"
                      | "draft"
                      | "pending"
                      | "posted"
                  )
              }
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="all">
                All journals
              </option>

              <option value="draft">
                Draft
              </option>

              <option value="pending">
                Pending approval
              </option>

              <option value="posted">
                Posted
              </option>
            </select>

          </div>


          <DataTable
            headers={[
              "Journal",
              "Date",
              "Description",
              "Source",
              "Approval",
              "Status",
              "Amount",
              "Action",
            ]}
            rows={
              filteredJournals.map(
                (
                  journal
                ) => [
                  <span
                    key="number"
                    className="font-medium"
                  >
                    {
                      journal.entry_number
                    }
                  </span>,

                  formatDate(
                    journal.entry_date
                  ),

                  journal.description,

                  label(
                    journal.source_type
                  ),

                  label(
                    journal.approval_status
                  ),

                  label(
                    journal.status
                  ),

                  money(
                    Number(
                      journal.total_debit
                    )
                  ),

                  <Button
                    key="open"
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void openJournal(
                        journal.id
                      )
                    }
                  >
                    Open
                  </Button>,
                ]
              )
            }
            emptyMessage="No accounting journals found."
          />
        </section>


        {(selected ||
          selectedLoading) && (
          <section className="mt-10 rounded-xl border bg-card">

            {selectedLoading ? (
              <div className="p-6 text-sm text-muted-foreground">
                Loading journal...
              </div>
            ) : selected ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Journal
                    </p>

                    <h2 className="mt-1 text-xl font-bold">
                      {
                        selected
                          .journal
                          .entry_number
                      }
                    </h2>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {
                        selected
                          .journal
                          .description
                      }
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setSelected(
                        null
                      )
                    }
                  >
                    Close
                  </Button>
                </div>


                <div className="grid gap-4 border-b p-5 md:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Date
                    </p>

                    <p className="mt-1 font-medium">
                      {formatDate(
                        selected
                          .journal
                          .entry_date
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Status
                    </p>

                    <p className="mt-1 font-medium">
                      {label(
                        selected
                          .journal
                          .status
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Approval
                    </p>

                    <p className="mt-1 font-medium">
                      {label(
                        selected
                          .journal
                          .approval_status
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Amount
                    </p>

                    <p className="mt-1 font-medium">
                      {money(
                        selected
                          .journal
                          .total_debit
                      )}
                    </p>
                  </div>
                </div>


                <div className="p-5">
                  <DataTable
                    headers={[
                      "Account",
                      "Description",
                      "Debit",
                      "Credit",
                    ]}
                    rows={
                      selected.lines.map(
                        (
                          line
                        ) => {
                          const account =
                            accountMap.get(
                              line.account_id
                            );

                          return [
                            account
                              ? `${account.code} — ${account.name}`
                              : line.account_id,

                            line.description ||
                              "—",

                            line.debit >
                            0
                              ? money(
                                  line.debit
                                )
                              : "—",

                            line.credit >
                            0
                              ? money(
                                  line.credit
                                )
                              : "—",
                          ];
                        }
                      )
                    }
                    emptyMessage="No journal lines."
                  />
                </div>


                {selected
                  .journal
                  .status ===
                  "draft" && (
                  <div className="flex flex-wrap justify-end gap-2 border-t p-5">

                    {canApprove &&
                      selected
                        .journal
                        .approval_status ===
                        "pending" && (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={
                            saving
                          }
                          onClick={() =>
                            void approveSelected()
                          }
                        >
                          Approve Journal
                        </Button>
                      )}


                    {canPost && (
                      <Button
                        type="button"
                        disabled={
                          saving
                        }
                        className="bg-black text-white hover:bg-black/85"
                        onClick={() =>
                          void postSelected()
                        }
                      >
                        Post Journal
                      </Button>
                    )}

                  </div>
                )}


                {selected
                  .journal
                  .status ===
                  "posted" &&
                  canPost && (
                  <div className="border-t p-5">

                    {!showReversal ? (
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setShowReversal(
                              true
                            )
                          }
                        >
                          Reverse Journal
                        </Button>
                      </div>
                    ) : (
                      <div className="grid gap-4 md:grid-cols-[200px_1fr_auto]">

                        <input
                          type="date"
                          value={
                            reversalDate
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setReversalDate(
                                event.target
                                  .value
                              )
                          }
                          className="rounded-md border bg-background px-3 py-2"
                        />

                        <input
                          value={
                            reversalReason
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setReversalReason(
                                event.target
                                  .value
                              )
                          }
                          placeholder="Reason for accounting reversal"
                          className="rounded-md border bg-background px-3 py-2"
                        />

                        <Button
                          type="button"
                          disabled={
                            saving
                          }
                          className="bg-black text-white hover:bg-black/85"
                          onClick={() =>
                            void reverseSelected()
                          }
                        >
                          Confirm Reversal
                        </Button>

                      </div>
                    )}

                  </div>
                )}

              </>
            ) : null}

          </section>
        )}

      </main>
    </DashboardLayout>
  );
}
