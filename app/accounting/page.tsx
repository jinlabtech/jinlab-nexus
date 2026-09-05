"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import DataTable from "@/components/DataTable";
import AccountingNav from "@/components/accounting/AccountingNav";
import AccountingExceptionAlert from "@/components/accounting/AccountingExceptionAlert";

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
  getAccountingAccounts,
  getAccountingOverview,
  getAccountingPeriods,
  getRecentJournalEntries,
} from "@/lib/services/accountingService";

import type {
  AccountingAccount,
  AccountingOverview,
  AccountingPeriod,
  JournalEntry,
} from "@/lib/services/accountingService";


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


function statusLabel(
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


export default function AccountingPage() {
  const router =
    useRouter();

  const {
    can,
    loading:
      permissionsLoading,
  } = usePermissions();

  const canView =
    can(
      "accounting.view"
    );

  const [
    companyName,
    setCompanyName,
  ] =
    useState(
      "JINLAB Nexus"
    );

  const [
    overview,
    setOverview,
  ] =
    useState<AccountingOverview | null>(
      null
    );

  const [
    accounts,
    setAccounts,
  ] =
    useState<AccountingAccount[]>(
      []
    );

  const [
    periods,
    setPeriods,
  ] =
    useState<AccountingPeriod[]>(
      []
    );

  const [
    journals,
    setJournals,
  ] =
    useState<JournalEntry[]>(
      []
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);


  async function loadAccounting(
    silent = false
  ) {
    try {
      if (!silent) {
        setLoading(true);
      } else {
        setRefreshing(true);
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

      const companyId =
        profile.company_id;

      const [
        companyResult,
        overviewResult,
        accountResult,
        periodResult,
        journalResult,
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
              companyId
            )
            .single(),

          getAccountingOverview(),

          getAccountingAccounts(
            companyId
          ),

          getAccountingPeriods(
            companyId
          ),

          getRecentJournalEntries(
            companyId,
            8
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

      setCompanyName(
        companyResult.data
          .company_name
      );

      setOverview(
        overviewResult
      );

      setAccounts(
        accountResult
      );

      setPeriods(
        periodResult
      );

      setJournals(
        journalResult
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Accounting could not be loaded."
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

    void loadAccounting();
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
            Loading accounting...
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
          <div className="rounded-xl border bg-card p-6">
            <h1 className="text-xl font-bold">
              Accounting Restricted
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              Your role does not have permission
              to access the Accounting module.
            </p>
          </div>
        </main>
      </DashboardLayout>
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
          overview?.settings
            .base_currency ??
          "ZAR",
      }
    ).format(
      Number(value || 0)
    );
  }


  const accountPreview =
    accounts.slice(
      0,
      10
    );

  const periodPreview =
    periods.slice(
      0,
      6
    );


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
              Finance
            </p>

            <h1 className="mt-1 text-3xl font-bold">
              Accounting
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Financial position, journals,
              accounting periods and ledger
              activity across your business.
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                router.push(
                  "/settings/finance"
                )
              }
            >
              Finance Settings
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={
                refreshing
              }
              onClick={() =>
                void loadAccounting(
                  true
                )
              }
            >
              {refreshing
                ? "Refreshing..."
                : "Refresh"}
            </Button>
          </div>
        </div>


        <AccountingNav />

        <AccountingExceptionAlert />

        {errorMessage && (
          <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        )}


        {overview &&
          !overview.settings
            .accounting_enabled && (
          <div className="mb-6 rounded-xl border p-5">
            <p className="font-semibold">
              Accounting is disabled
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              Enable accounting automation
              from Finance Settings before
              posting financial transactions.
            </p>
          </div>
        )}


        {overview && (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">

              <div className="rounded-xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">
                  Assets
                </p>

                <p className="mt-2 text-2xl font-bold">
                  {money(
                    overview.balances
                      .assets
                  )}
                </p>
              </div>


              <div className="rounded-xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">
                  Liabilities
                </p>

                <p className="mt-2 text-2xl font-bold">
                  {money(
                    overview.balances
                      .liabilities
                  )}
                </p>
              </div>


              <div className="rounded-xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">
                  Equity
                </p>

                <p className="mt-2 text-2xl font-bold">
                  {money(
                    overview.balances
                      .equity
                  )}
                </p>
              </div>


              <div className="rounded-xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">
                  Revenue
                </p>

                <p className="mt-2 text-2xl font-bold">
                  {money(
                    overview.balances
                      .revenue
                  )}
                </p>
              </div>


              <div className="rounded-xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">
                  Expenses
                </p>

                <p className="mt-2 text-2xl font-bold">
                  {money(
                    overview.balances
                      .expenses
                  )}
                </p>
              </div>


              <div className="rounded-xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">
                  Net Profit
                </p>

                <p className="mt-2 text-2xl font-bold">
                  {money(
                    overview.balances
                      .net_profit
                  )}
                </p>
              </div>

            </section>


            <section className="mt-8 grid gap-5 lg:grid-cols-2">

              <div className="rounded-xl border bg-card p-5">
                <h2 className="text-lg font-semibold">
                  Book Health
                </h2>

                <div className="mt-5 space-y-4 text-sm">

                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      Accounting
                    </span>

                    <span className="font-medium">
                      {overview.settings
                        .accounting_enabled
                        ? "Enabled"
                        : "Disabled"}
                    </span>
                  </div>


                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      Basis
                    </span>

                    <span className="font-medium capitalize">
                      {
                        overview.settings
                          .accounting_basis
                      }
                    </span>
                  </div>


                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      VAT
                    </span>

                    <span className="font-medium">
                      {overview.settings
                        .vat_registered
                        ? "Registered"
                        : "Not registered"}
                    </span>
                  </div>


                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">
                      Current Period
                    </span>

                    <span className="text-right font-medium">
                      {overview.current_period
                        ? `${overview.current_period.name} · ${statusLabel(
                            overview.current_period.status
                          )}`
                        : "Not available"}
                    </span>
                  </div>

                </div>
              </div>


              <div className="rounded-xl border bg-card p-5">
                <h2 className="text-lg font-semibold">
                  Journal Activity
                </h2>

                <div className="mt-5 grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Posted
                    </p>

                    <p className="mt-1 text-2xl font-bold">
                      {
                        overview.journals
                          .posted
                      }
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Draft
                    </p>

                    <p className="mt-1 text-2xl font-bold">
                      {
                        overview.journals
                          .draft
                      }
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Approval
                    </p>

                    <p className="mt-1 text-2xl font-bold">
                      {
                        overview.journals
                          .pending_approval
                      }
                    </p>
                  </div>
                </div>
              </div>

            </section>
          </>
        )}


        <section className="mt-10">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">
              Recent Journals
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Latest accounting entries recorded
              in the company ledger.
            </p>
          </div>

          <DataTable
            headers={[
              "Journal",
              "Date",
              "Description",
              "Source",
              "Status",
              "Amount",
            ]}
            rows={
              journals.map(
                (journal) => [
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

                  statusLabel(
                    journal.source_type
                  ),

                  statusLabel(
                    journal.status
                  ),

                  <span
                    key="amount"
                    className="font-medium"
                  >
                    {money(
                      Number(
                        journal.total_debit
                      )
                    )}
                  </span>,
                ]
              )
            }
            emptyMessage="No journal entries yet. Financial activity will appear here as transactions are posted."
          />
        </section>


        <section className="mt-10">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">
              Chart of Accounts
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Core accounts currently available
              to the accounting engine.
            </p>
          </div>

          <DataTable
            headers={[
              "Code",
              "Account",
              "Type",
              "Subtype",
              "Control",
            ]}
            rows={
              accountPreview.map(
                (account) => [
                  <span
                    key="code"
                    className="font-medium"
                  >
                    {account.code}
                  </span>,

                  account.name,

                  statusLabel(
                    account.account_type
                  ),

                  account.account_subtype
                    ? statusLabel(
                        account.account_subtype
                      )
                    : "—",

                  account.is_system
                    ? "System"
                    : "Custom",
                ]
              )
            }
            emptyMessage="No accounting accounts found."
          />

          {accounts.length > 10 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing 10 of{" "}
              {accounts.length} accounts.
            </p>
          )}
        </section>


        <section className="mt-10">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">
              Accounting Periods
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Financial periods controlling
              where ledger transactions may
              be posted.
            </p>
          </div>

          <DataTable
            headers={[
              "Period",
              "Start",
              "End",
              "Status",
            ]}
            rows={
              periodPreview.map(
                (period) => [
                  <span
                    key="period"
                    className="font-medium"
                  >
                    {period.name}
                  </span>,

                  formatDate(
                    period.start_date
                  ),

                  formatDate(
                    period.end_date
                  ),

                  statusLabel(
                    period.status
                  ),
                ]
              )
            }
            emptyMessage="No accounting periods found."
          />
        </section>

      </main>
    </DashboardLayout>
  );
}
