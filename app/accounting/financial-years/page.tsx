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
  getAccountingFinancialYears,
  getAccountingOverview,
  getAccountingPeriods,
  scheduleAccountingFinancialYear,
  updateScheduledAccountingFinancialYear,
} from "@/lib/services/accountingService";

import type {
  AccountingFinancialYear,
  AccountingPeriod,
} from "@/lib/services/accountingService";


function formatDate(
  value: string
) {
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


function dateOnly(
  date: Date
) {
  return date
    .toISOString()
    .slice(
      0,
      10
    );
}


function nextDay(
  value: string
) {
  const [
    year,
    month,
    day,
  ] =
    value
      .split("-")
      .map(Number);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  date.setUTCDate(
    date.getUTCDate() + 1
  );

  return dateOnly(
    date
  );
}


function oneYearMinusDay(
  value: string
) {
  const [
    year,
    month,
    day,
  ] =
    value
      .split("-")
      .map(Number);

  const date =
    new Date(
      Date.UTC(
        year + 1,
        month - 1,
        day
      )
    );

  date.setUTCDate(
    date.getUTCDate() - 1
  );

  return dateOnly(
    date
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


export default function FinancialYearsPage() {
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

  const canManage =
    can(
      "accounting.financial_year.manage"
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
    years,
    setYears,
  ] =
    useState<
      AccountingFinancialYear[]
    >([]);

  const [
    periods,
    setPeriods,
  ] =
    useState<
      AccountingPeriod[]
    >([]);

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
    message,
    setMessage,
  ] =
    useState("");

  const [
    showSchedule,
    setShowSchedule,
  ] =
    useState(false);

  const [
    editingYearId,
    setEditingYearId,
  ] =
    useState<
      string | null
    >(null);

  const [
    scheduleName,
    setScheduleName,
  ] =
    useState("");

  const [
    scheduleStart,
    setScheduleStart,
  ] =
    useState("");

  const [
    scheduleEnd,
    setScheduleEnd,
  ] =
    useState("");


  async function loadData() {
    try {
      setLoading(true);
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

      /*
       * This also ensures the financial year
       * containing today's date becomes current/open.
       */
      await getAccountingOverview();

      const [
        companyResult,
        yearResult,
        periodResult,
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

          getAccountingFinancialYears(
            currentCompanyId
          ),

          getAccountingPeriods(
            currentCompanyId
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
        companyResult
          .data.company_name
      );

      setYears(
        yearResult
      );

      setPeriods(
        periodResult
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Financial years could not be loaded."
      );
    } finally {
      setLoading(false);
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


  const currentYear =
    useMemo(
      () =>
        years.find(
          (year) =>
            year.status ===
            "open"
        ) ?? null,
      [
        years,
      ]
    );


  const scheduledYears =
    useMemo(
      () =>
        years
          .filter(
            (year) =>
              year.status ===
              "scheduled"
          )
          .sort(
            (
              a,
              b
            ) =>
              a.start_date
                .localeCompare(
                  b.start_date
                )
          ),
      [
        years,
      ]
    );


  const currentPeriods =
    useMemo(
      () =>
        currentYear
          ? periods
              .filter(
                (period) =>
                  period
                    .financial_year_id ===
                  currentYear.id
              )
              .sort(
                (
                  a,
                  b
                ) =>
                  a.start_date
                    .localeCompare(
                      b.start_date
                    )
              )
          : [],
      [
        periods,
        currentYear,
      ]
    );


  function prepareNewSchedule() {
    setEditingYearId(
      null
    );

    setMessage("");
    setErrorMessage("");

    const latestYear =
      [...years]
        .sort(
          (
            a,
            b
          ) =>
            b.end_date.localeCompare(
              a.end_date
            )
        )[0];

    if (latestYear) {
      const start =
        nextDay(
          latestYear.end_date
        );

      setScheduleStart(
        start
      );

      setScheduleEnd(
        oneYearMinusDay(
          start
        )
      );
    } else {
      setScheduleStart("");
      setScheduleEnd("");
    }

    setScheduleName("");

    setShowSchedule(
      true
    );
  }


  function editScheduledYear(
    year:
      AccountingFinancialYear
  ) {
    setEditingYearId(
      year.id
    );

    setScheduleName(
      year.name
    );

    setScheduleStart(
      year.start_date
    );

    setScheduleEnd(
      year.end_date
    );

    setMessage("");
    setErrorMessage("");

    setShowSchedule(
      true
    );
  }


  async function saveSchedule() {
    if (
      !scheduleStart ||
      !scheduleEnd
    ) {
      setErrorMessage(
        "Financial year start and end dates are required."
      );

      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");
      setMessage("");

      if (
        editingYearId
      ) {
        await updateScheduledAccountingFinancialYear(
          editingYearId,
          scheduleStart,
          scheduleEnd,
          scheduleName
        );

        setMessage(
          "Future financial year schedule updated."
        );
      } else {
        await scheduleAccountingFinancialYear(
          scheduleStart,
          scheduleEnd,
          scheduleName
        );

        setMessage(
          "Future financial year scheduled successfully."
        );
      }

      setShowSchedule(
        false
      );

      setEditingYearId(
        null
      );

      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Financial year could not be saved."
      );
    } finally {
      setSaving(false);
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
            Loading financial years...
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

            <p className="mt-2 text-sm text-muted-foreground">
              Your role does not have permission
              to access Accounting.
            </p>
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
              Financial Years
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Control financial-year schedules and
              the accounting periods used by the
              Nexus ledger.
            </p>
          </div>

          {canManage && (
            <Button
              type="button"
              className="bg-black text-white hover:bg-black/85"
              onClick={
                prepareNewSchedule
              }
            >
              Schedule Next Year
            </Button>
          )}
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


        {currentYear ? (
          <section className="rounded-xl border bg-card">
            <div className="border-b p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Current Financial Year
                  </p>

                  <h2 className="mt-1 text-2xl font-bold">
                    {currentYear.name}
                  </h2>

                  <p className="mt-2 text-sm text-muted-foreground">
                    {formatDate(
                      currentYear.start_date
                    )}
                    {" — "}
                    {formatDate(
                      currentYear.end_date
                    )}
                  </p>
                </div>

                <span className="rounded-full border px-3 py-1 text-xs font-semibold uppercase">
                  {currentYear.status}
                </span>
              </div>
            </div>

            <div className="p-5">
              <h3 className="mb-4 font-semibold">
                Accounting Periods
              </h3>

              <DataTable
                headers={[
                  "Period",
                  "Start",
                  "End",
                  "Status",
                ]}
                rows={
                  currentPeriods.map(
                    (
                      period
                    ) => [
                      <span
                        key="name"
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
                emptyMessage="No periods found for this financial year."
              />
            </div>
          </section>
        ) : (
          <div className="rounded-xl border bg-card p-6">
            <h2 className="font-semibold">
              No current financial year
            </h2>

            <p className="mt-2 text-sm text-muted-foreground">
              Nexus could not identify a financial
              year containing today's date.
            </p>
          </div>
        )}


        <section className="mt-10">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">
              Future Schedule
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Future financial years may be changed
              before they become active or contain
              accounting activity.
            </p>
          </div>

          <DataTable
            headers={[
              "Financial Year",
              "Start",
              "End",
              "Status",
              "Source",
              "Action",
            ]}
            rows={
              scheduledYears.map(
                (
                  year
                ) => [
                  <span
                    key="name"
                    className="font-medium"
                  >
                    {year.name}
                  </span>,

                  formatDate(
                    year.start_date
                  ),

                  formatDate(
                    year.end_date
                  ),

                  statusLabel(
                    year.status
                  ),

                  statusLabel(
                    year.schedule_source
                  ),

                  canManage ? (
                    <Button
                      key="edit"
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        editScheduledYear(
                          year
                        )
                      }
                    >
                      Change Schedule
                    </Button>
                  ) : (
                    "—"
                  ),
                ]
              )
            }
            emptyMessage="No future financial year has been scheduled."
          />
        </section>


        {showSchedule && (
          <section className="mt-10 rounded-xl border bg-card">
            <div className="border-b p-5">
              <h2 className="text-lg font-semibold">
                {editingYearId
                  ? "Change Future Financial Year"
                  : "Schedule Financial Year"}
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Historical and active financial
                years cannot be silently rewritten.
              </p>
            </div>

            <div className="grid gap-5 p-5 md:grid-cols-3">

              <label className="space-y-2">
                <span className="text-sm font-medium">
                  Name
                </span>

                <input
                  type="text"
                  value={
                    scheduleName
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setScheduleName(
                        event.target
                          .value
                      )
                  }
                  placeholder="e.g. FY 2027/2028"
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </label>


              <label className="space-y-2">
                <span className="text-sm font-medium">
                  Start Date
                </span>

                <input
                  type="date"
                  value={
                    scheduleStart
                  }
                  onChange={
                    (
                      event
                    ) => {
                      const value =
                        event.target
                          .value;

                      setScheduleStart(
                        value
                      );

                      if (
                        value &&
                        !editingYearId
                      ) {
                        setScheduleEnd(
                          oneYearMinusDay(
                            value
                          )
                        );
                      }
                    }
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </label>


              <label className="space-y-2">
                <span className="text-sm font-medium">
                  End Date
                </span>

                <input
                  type="date"
                  value={
                    scheduleEnd
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setScheduleEnd(
                        event.target
                          .value
                      )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </label>

            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t p-5">
              <Button
                type="button"
                variant="outline"
                disabled={
                  saving
                }
                onClick={() =>
                  setShowSchedule(
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
                className="bg-black text-white hover:bg-black/85"
                onClick={() =>
                  void saveSchedule()
                }
              >
                {saving
                  ? "Saving..."
                  : editingYearId
                    ? "Save Changes"
                    : "Schedule Year"}
              </Button>
            </div>
          </section>
        )}


        <section className="mt-10 rounded-xl border bg-muted/20 p-5">
          <h2 className="font-semibold">
            Financial History Protection
          </h2>

          <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
            Future schedules are flexible.
            Once a financial year becomes active,
            contains ledger activity, is closed,
            or becomes locked, Nexus protects the
            accounting history from silent changes.
          </p>
        </section>

      </main>
    </DashboardLayout>
  );
}
