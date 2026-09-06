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
import AccountingNav from "@/components/accounting/AccountingNav";
import BusinessPerformanceSummary from "@/components/accounting/BusinessPerformanceSummary";
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


function localToday() {
  const now = new Date();

  const offset =
    now.getTimezoneOffset() *
    60 *
    1000;

  return new Date(
    now.getTime() - offset
  )
    .toISOString()
    .slice(0, 10);
}


function money(
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


export default function AccountingPerformancePage() {
  const router =
    useRouter();

  const {
    can,
    loading:
      permissionsLoading,
  } =
    usePermissions();

  const canView =
    can("accounting.view");

  const canManage =
    can(
      "accounting.budget.manage"
    );


  const [
    companyName,
    setCompanyName,
  ] =
    useState(
      "JINLAB Nexus"
    );

  const [
    asOfDate,
    setAsOfDate,
  ] =
    useState(
      localToday()
    );

  const [
    dashboard,
    setDashboard,
  ] =
    useState<any>(null);

  const [
    budgets,
    setBudgets,
  ] =
    useState<any[]>([]);

  const [
    years,
    setYears,
  ] =
    useState<any[]>([]);

  const [
    branches,
    setBranches,
  ] =
    useState<any[]>([]);

  const [
    selectedBudgetId,
    setSelectedBudgetId,
  ] =
    useState("");

  const [
    workspace,
    setWorkspace,
  ] =
    useState<any>(null);

  const [
    comparison,
    setComparison,
  ] =
    useState<any>(null);

  const [
    values,
    setValues,
  ] =
    useState<
      Record<string, string>
    >({});

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
    approving,
    setApproving,
  ] =
    useState(false);


  const [
    generatingBudget,
    setGeneratingBudget,
  ] =
    useState(false);

  const [
    printingBudget,
    setPrintingBudget,
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
    showCreate,
    setShowCreate,
  ] =
    useState(false);

  const [
    budgetName,
    setBudgetName,
  ] =
    useState("");

  const [
    yearId,
    setYearId,
  ] =
    useState("");

  const [
    branchId,
    setBranchId,
  ] =
    useState("");

  const [
    notes,
    setNotes,
  ] =
    useState("");


  async function logout() {
    await supabase.auth
      .signOut();

    router.replace(
      "/login"
    );
  }


  async function rpc(
    name: string,
    params: any = {}
  ) {
    const {
      data,
      error,
    } =
      await supabase.rpc(
        name,
        params
      );

    if (error) {
      throw new Error(
        error.message
      );
    }

    return data as any;
  }


  async function loadData(
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


      const [
        companyResult,
        yearsResult,
        branchesResult,
        kpiResult,
        budgetResult,
      ] =
        await Promise.all([
          supabase
            .from("company")
            .select(
              "company_name"
            )
            .eq(
              "id",
              profile.company_id
            )
            .single(),

          supabase
            .from(
              "accounting_financial_year"
            )
            .select(
              "id, name, start_date, end_date, status"
            )
            .eq(
              "company_id",
              profile.company_id
            )
            .order(
              "start_date",
              {
                ascending: false,
              }
            ),

          supabase
            .from("branch")
            .select(
              "id, branch_name"
            )
            .eq(
              "company_id",
              profile.company_id
            )
            .order(
              "branch_name"
            ),

          rpc(
            "get_accounting_kpi_dashboard",
            {
              p_as_of_date:
                asOfDate,
              p_branch_id:
                null,
            }
          ),

          rpc(
            "get_accounting_budgets",
            {
              p_financial_year_id:
                null,
            }
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
        yearsResult.error
      ) {
        throw new Error(
          yearsResult
            .error.message
        );
      }

      if (
        branchesResult.error
      ) {
        throw new Error(
          branchesResult
            .error.message
        );
      }


      setCompanyName(
        companyResult
          .data.company_name
      );

      setYears(
        yearsResult.data ??
        []
      );

      setBranches(
        branchesResult.data ??
        []
      );

      setDashboard(
        kpiResult
      );

      const nextBudgets =
        budgetResult
          ?.budgets ??
        [];

      setBudgets(
        nextBudgets
      );


      if (
        !selectedBudgetId
      ) {
        const preferred =
          kpiResult
            ?.budget
            ?.budget_id ??
          nextBudgets.find(
            (item: any) =>
              item.status ===
              "draft"
          )?.id ??
          nextBudgets[0]?.id ??
          "";

        if (preferred) {
          setSelectedBudgetId(
            preferred
          );
        }
      }

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Accounting performance could not be loaded."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }


  async function loadBudget(
    id: string
  ) {
    if (!id) {
      setWorkspace(null);
      setComparison(null);
      setValues({});
      return;
    }

    try {
      setErrorMessage("");

      const [
        workspaceResult,
        comparisonResult,
      ] =
        await Promise.all([
          rpc(
            "get_accounting_budget_workspace",
            {
              p_budget_id:
                id,
            }
          ),

          rpc(
            "get_budget_vs_actual",
            {
              p_budget_id:
                id,
              p_as_of_date:
                asOfDate,
            }
          ),
        ]);


      setWorkspace(
        workspaceResult
      );

      setComparison(
        comparisonResult
      );


      const next:
        Record<
          string,
          string
        > = {};

      for (
        const line of
        workspaceResult.lines ??
        []
      ) {
        next[
          `${line.account_id}:${line.accounting_period_id}`
        ] =
          String(
            Number(
              line.amount
            )
          );
      }

      setValues(
        next
      );

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Budget could not be loaded."
      );
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


  useEffect(() => {
    if (
      selectedBudgetId &&
      canView
    ) {
      void loadBudget(
        selectedBudgetId
      );
    }

  }, [
    selectedBudgetId,
  ]);


  async function generateSmartBudget() {
    const financialYearId =
      dashboard?.financial_year?.id ??
      years[0]?.id;

    if (!financialYearId) {
      setErrorMessage(
        "A financial year is required before Nexus can generate a budget."
      );
      return;
    }

    try {
      setGeneratingBudget(true);
      setErrorMessage("");
      setSuccessMessage("");

      const result =
        await rpc(
          "generate_performance_based_budget",
          {
            p_financial_year_id:
              financialYearId,
            p_branch_id:
              null,
            p_scenario:
              "auto",
            p_name:
              null,
            p_randomness_pct:
              4,
          }
        );

      setSelectedBudgetId(
        result.budget_id
      );

      setSuccessMessage(
        `Smart Budget generated · ${result.scenario} scenario · ${result.confidence} confidence. Review it before approval.`
      );

      await loadData(true);
      await loadBudget(
        result.budget_id
      );

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Smart Budget could not be generated."
      );
    } finally {
      setGeneratingBudget(false);
    }
  }


  async function printSelectedBudget() {
    if (!selectedBudgetId) {
      return;
    }

    try {
      setPrintingBudget(true);
      setErrorMessage("");

      const html =
        await rpc(
          "get_budget_print_html",
          {
            p_budget_id:
              selectedBudgetId,
            p_as_of_date:
              asOfDate,
          }
        );

      const printWindow =
        window.open(
          "",
          "_blank"
        );

      if (!printWindow) {
        throw new Error(
          "The print window was blocked by the browser."
        );
      }

      printWindow.document.open();
      printWindow.document.write(
        html
      );
      printWindow.document.close();

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Budget document could not be prepared."
      );
    } finally {
      setPrintingBudget(false);
    }
  }


  function openCreate() {
    const defaultYear =
      dashboard
        ?.financial_year
        ?.id ??
      years[0]?.id ??
      "";

    const selectedYear =
      years.find(
        (item) =>
          item.id ===
          defaultYear
      );

    setYearId(
      defaultYear
    );

    setBudgetName(
      selectedYear
        ? `${selectedYear.name} Budget`
        : "Year Total Budget"
    );

    setBranchId("");
    setNotes("");
    setShowCreate(true);
  }


  async function createBudget() {
    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");

      if (!yearId) {
        throw new Error(
          "Select a financial year."
        );
      }

      if (
        !budgetName.trim()
      ) {
        throw new Error(
          "Enter a budget name."
        );
      }


      const result =
        await rpc(
          "create_accounting_budget",
          {
            p_financial_year_id:
              yearId,

            p_name:
              budgetName.trim(),

            p_branch_id:
              branchId ||
              null,

            p_notes:
              notes.trim() ||
              null,
          }
        );


      setShowCreate(false);

      setSelectedBudgetId(
        result.budget.id
      );

      setSuccessMessage(
        "Budget created. Add monthly targets below."
      );

      await loadData(
        true
      );

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Budget could not be created."
      );
    } finally {
      setSaving(false);
    }
  }


  async function saveBudget() {
    if (
      !workspace ||
      workspace.budget
        .status !==
        "draft"
    ) {
      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");


      const lines =
        Object.entries(
          values
        ).map(
          ([
            key,
            value,
          ]) => {
            const [
              accountId,
              periodId,
            ] =
              key.split(":");

            const amount =
              Number(
                value || 0
              );

            return {
              account_id:
                accountId,

              accounting_period_id:
                periodId,

              amount:
                Number.isFinite(
                  amount
                )
                  ? amount
                  : 0,
            };
          }
        );


      await rpc(
        "save_accounting_budget_lines",
        {
          p_budget_id:
            workspace
              .budget.id,

          p_lines:
            lines,
        }
      );


      setSuccessMessage(
        "Budget targets saved."
      );

      await loadBudget(
        workspace
          .budget.id
      );

      await loadData(
        true
      );

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Budget could not be saved."
      );
    } finally {
      setSaving(false);
    }
  }


  async function approveBudget() {
    if (
      !workspace ||
      workspace.budget
        .status !==
        "draft"
    ) {
      return;
    }


    if (
      !window.confirm(
        "Approve this budget? Once approved, it becomes the active budget for this financial year and scope."
      )
    ) {
      return;
    }


    try {
      setApproving(true);
      setErrorMessage("");
      setSuccessMessage("");

      await rpc(
        "approve_accounting_budget",
        {
          p_budget_id:
            workspace
              .budget.id,
        }
      );

      setSuccessMessage(
        "Budget approved and connected to Accounting KPIs."
      );

      await loadData(
        true
      );

      await loadBudget(
        workspace
          .budget.id
      );

    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Budget could not be approved."
      );
    } finally {
      setApproving(false);
    }
  }


  const rowTotals =
    useMemo(() => {
      const result:
        Record<
          string,
          number
        > = {};

      if (!workspace) {
        return result;
      }

      for (
        const account of
        workspace.accounts ??
        []
      ) {
        result[
          account.id
        ] =
          (
            workspace.periods ??
            []
          ).reduce(
            (
              total:
                number,
              period:
                any
            ) =>
              total +
              Number(
                values[
                  `${account.id}:${period.id}`
                ] ??
                0
              ),
            0
          );
      }

      return result;

    }, [
      workspace,
      values,
    ]);


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
            Loading KPIs and budgets...
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
            Accounting access is restricted.
          </div>
        </main>
      </DashboardLayout>
    );
  }


  const k =
    dashboard?.kpis;


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


      <main className="mx-auto max-w-[1600px] p-6 lg:p-8">

        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">

          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Accounting
            </p>

            <h1 className="mt-1 text-3xl font-bold">
              Business Performance & Budget
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              See what came in, what went out, what the business kept, and whether you are on track.
            </p>
          </div>


          <div className="flex flex-wrap items-end gap-3">

            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">
                As at
              </span>

              <input
                type="date"
                value={
                  asOfDate
                }
                onChange={
                  (
                    event
                  ) =>
                    setAsOfDate(
                      event.target.value
                    )
                }
                className="rounded-md border bg-background px-3 py-2"
              />
            </label>


            <Button
              type="button"
              variant="outline"
              disabled={
                refreshing
              }
              onClick={() => {
                void (async () => {
                  await loadData(
                    true
                  );

                  if (
                    selectedBudgetId
                  ) {
                    await loadBudget(
                      selectedBudgetId
                    );
                  }
                })();
              }}
            >
              {refreshing
                ? "Refreshing..."
                : "Refresh"}
            </Button>


            {selectedBudgetId && (
              <Button
                type="button"
                variant="outline"
                disabled={
                  printingBudget
                }
                onClick={() =>
                  void printSelectedBudget()
                }
              >
                {printingBudget
                  ? "Preparing..."
                  : "Print Budget"}
              </Button>
            )}


            {canManage && (
              <Button
                type="button"
                variant="outline"
                disabled={
                  generatingBudget
                }
                onClick={() =>
                  void generateSmartBudget()
                }
              >
                {generatingBudget
                  ? "Generating..."
                  : "Generate Smart Budget"}
              </Button>
            )}


            {canManage && (
              <Button
                type="button"
                onClick={
                  openCreate
                }
                className="bg-black text-white hover:bg-black/85"
              >
                + New Budget
              </Button>
            )}

          </div>

        </div>


        <AccountingNav />

        <BusinessPerformanceSummary />


        {errorMessage && (
          <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        )}


        {successMessage && (
          <div className="mb-5 rounded-xl border bg-muted/30 p-4 text-sm">
            {successMessage}
          </div>
        )}


        {k && (
          <>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

              {[
                [
                  "Money In · This Month",
                  money(
                    k.revenue_mtd
                  ),
                ],
                [
                  "Money In · This Year",
                  money(
                    k.revenue_ytd
                  ),
                ],
                [
                  "Cash Collected · This Month",
                  money(
                    k.cash_collected_mtd
                  ),
                ],
                [
                  "Cash Available",
                  money(
                    k.cash_and_bank
                  ),
                ],
                [
                  "Customers Owe Us",
                  money(
                    k.trade_debtors
                  ),
                ],
                [
                  "Customer Money Overdue",
                  money(
                    k.overdue_receivables
                  ),
                ],
                [
                  "Profit Kept · This Year",
                  money(
                    k.net_profit_ytd
                  ),
                ],
                [
                  "Profit Kept per R100",
                  k.net_margin_ytd_pct ==
                  null
                    ? "—"
                    : `${Number(
                        k.net_margin_ytd_pct
                      ).toFixed(
                        1
                      )}%`,
                ],
              ].map(
                ([
                  title,
                  value,
                ]) => (
                  <div
                    key={
                      title
                    }
                    className="rounded-xl border bg-card p-5"
                  >
                    <p className="text-sm text-muted-foreground">
                      {title}
                    </p>

                    <p className="mt-2 text-2xl font-bold">
                      {value}
                    </p>
                  </div>
                )
              )}

            </section>


            <section className="mt-4 grid gap-4 md:grid-cols-3">

              <div className="rounded-xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">
                  Sales Profit Before Running Costs
                </p>

                <p className="mt-2 text-xl font-bold">
                  {money(
                    k.gross_profit_ytd
                  )}
                </p>

                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {
                    dashboard
                      .quality
                      .cost_of_sales_note
                  }
                </p>
              </div>


              <div className="rounded-xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">
                  Customers Paying Late
                </p>

                <p className="mt-2 text-xl font-bold">
                  {
                    k.overdue_invoice_count
                  }
                </p>

                <p className="mt-2 text-xs text-muted-foreground">
                  {money(
                    k.overdue_receivables
                  )} overdue
                </p>
              </div>


              <div className="rounded-xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">
                  Records Health
                </p>

                <p className="mt-2 text-xl font-bold">
                  {
                    k.open_posting_exceptions ===
                    0
                      ? "Healthy"
                      : "Review Required"
                  }
                </p>

                <p className="mt-2 text-xs text-muted-foreground">
                  {
                    k.open_posting_exceptions
                  } open posting exceptions
                </p>
              </div>

            </section>

          </>
        )}


        <section className="mt-10">

          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">

            <div>
              <h2 className="text-xl font-semibold">
                Business Plan
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Plan how much the business should earn, spend and keep, then compare the plan with what really happened.
              </p>
            </div>


            {budgets.length > 0 && (
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">
                  Budget
                </span>

                <select
                  value={
                    selectedBudgetId
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setSelectedBudgetId(
                        event.target.value
                      )
                  }
                  className="min-w-64 rounded-md border bg-background px-3 py-2"
                >
                  {budgets.map(
                    (
                      item
                    ) => (
                      <option
                        key={
                          item.id
                        }
                        value={
                          item.id
                        }
                      >
                        {
                          item.name
                        }{" "}
                        ·{" "}
                        {
                          item.status
                        }
                      </option>
                    )
                  )}
                </select>
              </label>
            )}

          </div>


          {budgets.length ===
          0 ? (
            <div className="rounded-xl border bg-card p-6">
              <p className="font-semibold">
                No budget created yet
              </p>

              <p className="mt-2 text-sm text-muted-foreground">
                Create your first annual budget to activate Budget vs Actual KPIs.
              </p>

              {canManage && (
                <Button
                  type="button"
                  onClick={
                    openCreate
                  }
                  className="mt-4 bg-black text-white hover:bg-black/85"
                >
                  + New Budget
                </Button>
              )}
            </div>
          ) : workspace ? (
            <>

              <div className="mb-5 rounded-xl border bg-card p-5">

                <div className="flex flex-wrap items-start justify-between gap-4">

                  <div>
                    <p className="text-sm text-muted-foreground">
                      {
                        workspace
                          .budget
                          .financial_year_name
                      }
                    </p>

                    <h3 className="mt-1 text-xl font-bold">
                      {
                        workspace
                          .budget.name
                      }
                    </h3>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Scope:{" "}
                      {
                        workspace
                          .budget
                          .branch_name ??
                        "Whole company"
                      }
                      {" · "}
                      Status:{" "}
                      {
                        workspace
                          .budget.status
                      }
                    </p>
                  </div>


                  {canManage &&
                    workspace
                      .budget
                      .status ===
                      "draft" && (
                      <div className="flex gap-2">

                        <Button
                          type="button"
                          variant="outline"
                          disabled={
                            saving
                          }
                          onClick={() =>
                            void saveBudget()
                          }
                        >
                          {saving
                            ? "Saving..."
                            : "Save Draft"}
                        </Button>


                        <Button
                          type="button"
                          disabled={
                            approving
                          }
                          onClick={() =>
                            void approveBudget()
                          }
                          className="bg-black text-white hover:bg-black/85"
                        >
                          {approving
                            ? "Approving..."
                            : "Approve Budget"}
                        </Button>

                      </div>
                    )}

                </div>

              </div>


              {comparison && (
                <div className="mb-5 grid gap-4 md:grid-cols-3">

                  <div className="rounded-xl border bg-card p-5">
                    <p className="text-sm text-muted-foreground">
                      Money In · Planned / Actual
                    </p>

                    <p className="mt-2 font-bold">
                      {money(
                        comparison
                          .summary
                          .revenue_budget_to_date
                      )}
                      {" / "}
                      {money(
                        comparison
                          .summary
                          .revenue_actual_to_date
                      )}
                    </p>
                  </div>


                  <div className="rounded-xl border bg-card p-5">
                    <p className="text-sm text-muted-foreground">
                      Money Out · Planned / Actual
                    </p>

                    <p className="mt-2 font-bold">
                      {money(
                        comparison
                          .summary
                          .expense_budget_to_date
                      )}
                      {" / "}
                      {money(
                        comparison
                          .summary
                          .expense_actual_to_date
                      )}
                    </p>
                  </div>


                  <div className="rounded-xl border bg-card p-5">
                    <p className="text-sm text-muted-foreground">
                      Profit · Planned / Actual
                    </p>

                    <p className="mt-2 font-bold">
                      {money(
                        comparison
                          .summary
                          .profit_budget_to_date
                      )}
                      {" / "}
                      {money(
                        comparison
                          .summary
                          .profit_actual_to_date
                      )}
                    </p>
                  </div>

                </div>
              )}


              <div className="overflow-x-auto rounded-xl border bg-card">

                <table className="min-w-max text-sm">

                  <thead className="border-b bg-muted/20">

                    <tr>

                      <th className="sticky left-0 z-10 min-w-60 bg-muted/20 px-3 py-3 text-left">
                        Budget Category
                      </th>

                      {workspace.periods.map(
                        (
                          period:
                            any
                        ) => (
                          <th
                            key={
                              period.id
                            }
                            className="min-w-32 px-3 py-3 text-right"
                          >
                            {
                              period.name
                            }
                          </th>
                        )
                      )}

                      <th className="min-w-36 px-3 py-3 text-right">
                        Year Total
                      </th>

                    </tr>

                  </thead>


                  <tbody className="divide-y">

                    {workspace.accounts.map(
                      (
                        account:
                          any
                      ) => (
                        <tr
                          key={
                            account.id
                          }
                        >

                          <td className="sticky left-0 bg-card px-3 py-3">

                            <p className="font-medium">
                              {
                                account.code
                              }
                              {" · "}
                              {
                                account.name
                              }
                            </p>

                            <p className="text-xs text-muted-foreground">
                              {
                                account.account_type
                              }
                            </p>

                          </td>


                          {workspace.periods.map(
                            (
                              period:
                                any
                            ) => {
                              const key =
                                `${account.id}:${period.id}`;

                              return (
                                <td
                                  key={
                                    period.id
                                  }
                                  className="px-2 py-2"
                                >

                                  {workspace
                                    .budget
                                    .status ===
                                  "draft" &&
                                  canManage ? (
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={
                                        values[
                                          key
                                        ] ??
                                        ""
                                      }
                                      onChange={
                                        (
                                          event
                                        ) =>
                                          setValues(
                                            (
                                              current
                                            ) => ({
                                              ...current,
                                              [key]:
                                                event
                                                  .target
                                                  .value,
                                            })
                                          )
                                      }
                                      placeholder="0.00"
                                      className="w-28 rounded-md border bg-background px-2 py-2 text-right"
                                    />
                                  ) : (
                                    <div className="text-right">
                                      {money(
                                        Number(
                                          values[
                                            key
                                          ] ??
                                          0
                                        )
                                      )}
                                    </div>
                                  )}

                                </td>
                              );
                            }
                          )}


                          <td className="px-3 py-3 text-right font-semibold">
                            {money(
                              rowTotals[
                                account.id
                              ] ??
                              0
                            )}
                          </td>

                        </tr>
                      )
                    )}

                  </tbody>

                </table>

              </div>

            </>
          ) : null}

        </section>


        <ActionModal
          open={
            showCreate
          }
          title="Create Budget"
          subtitle="Create a financial-year budget for the company or a specific branch."
          onClose={() =>
            setShowCreate(
              false
            )
          }
          maxWidth="max-w-xl"
        >

          <div className="grid gap-5">

            <label className="text-sm">

              <span className="mb-1 block font-medium">
                Financial Year
              </span>

              <select
                value={
                  yearId
                }
                onChange={
                  (
                    event
                  ) =>
                    setYearId(
                      event.target.value
                    )
                }
                className="w-full rounded-md border bg-background px-3 py-2.5"
              >
                <option value="">
                  Select financial year
                </option>

                {years.map(
                  (
                    item
                  ) => (
                    <option
                      key={
                        item.id
                      }
                      value={
                        item.id
                      }
                    >
                      {
                        item.name
                      }
                    </option>
                  )
                )}
              </select>

            </label>


            <label className="text-sm">

              <span className="mb-1 block font-medium">
                Budget Name
              </span>

              <input
                value={
                  budgetName
                }
                onChange={
                  (
                    event
                  ) =>
                    setBudgetName(
                      event.target.value
                    )
                }
                className="w-full rounded-md border bg-background px-3 py-2.5"
              />

            </label>


            <label className="text-sm">

              <span className="mb-1 block font-medium">
                Scope
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
                      event.target.value
                    )
                }
                className="w-full rounded-md border bg-background px-3 py-2.5"
              >
                <option value="">
                  Whole company
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


            <label className="text-sm">

              <span className="mb-1 block font-medium">
                Notes
              </span>

              <textarea
                rows={3}
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
                className="w-full rounded-md border bg-background px-3 py-2.5"
                placeholder="Optional planning notes..."
              />

            </label>


            <div className="flex justify-end gap-3 border-t pt-4">

              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setShowCreate(
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
                  void createBudget()
                }
                className="bg-black text-white hover:bg-black/85"
              >
                {saving
                  ? "Creating..."
                  : "Create Budget"}
              </Button>

            </div>

          </div>

        </ActionModal>

      </main>

    </DashboardLayout>
  );
}
