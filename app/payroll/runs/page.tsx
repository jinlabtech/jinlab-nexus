"use client";

import SearchableSelect from "@/components/ui/SearchableSelect";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import Link from "next/link";

import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Coins,
  FileWarning,
  Landmark,
  RefreshCw,
  ShieldCheck,
  Users,
  WalletCards,
  XCircle,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/lib/supabase";


type PayRun = {
  id: string;
  branch_id: string | null;

  period_start: string;
  period_end: string;
  payment_date: string;

  pay_frequency: string;
  tax_year: number;

  status: string;

  created_at: string;
};


type FoundationWorkspace = {
  ok: boolean;
  pay_runs: PayRun[];
};


type RunSummary = {
  employees: number;
  review_required: number;

  gross: number;
  paye: number;

  uif_employee: number;
  uif_employer: number;

  sdl_employer: number;

  net_pay: number;
};


type PayRunItem = {
  id: string;
  code: string;
  name: string;
  category: string;

  amount: number;

  metadata:
    Record<string, unknown>;
};


type PayeCalculation = {
  engine_version?: string;

  tax_year?: number;

  source_title?: string;
  source_url?: string;

  annual_equivalent?: number;

  age_category?: string;
  age_at_tax_year_end?: number;

  annual_tax_before_rebate?: number;
  annual_rebate?: number;
  annual_tax_after_rebate?: number;

  medical_tax_credit_monthly?: number;

  paye_monthly?: number;
};


type CalculationDetails = {
  engine_version?: string;

  tax_year?: number;

  blockers?: string[];

  limitations?: string[];

  paye?:
    PayeCalculation & {
      status?: string;
    };

  uif?: {
    remuneration_base?: number;

    employee_rate?: number;
    employer_rate?: number;

    employee_amount?: number;
    employer_amount?: number;
  };

  sdl?: {
    enabled?: boolean;
    rate?: number;
    employer_amount?: number;
  };
};


type RunEmployee = {
  id: string;

  employee_id: string;
  employee_number: string;
  employee_name: string;

  gross_remuneration: number;
  taxable_remuneration: number;

  paye_amount: number;

  uif_employee: number;
  uif_employer: number;

  sdl_employer: number;

  other_deductions: number;

  net_pay: number;

  calculation_status: string;

  calculation_details:
    CalculationDetails;

  items:
    PayRunItem[];
};


type RunWorkspace = {
  ok: boolean;

  run: {
    id: string;

    branch_id: string | null;

    period_start: string;
    period_end: string;

    payment_date: string;

    pay_frequency: string;
    tax_year: number;

    status: string;

    notes: string | null;

    statutory_rule_set_id: string | null;

    calculated_at: string | null;

    calculation_version: string | null;
  };

  summary: RunSummary;

  employees: RunEmployee[];
};


type CalculationResult = {
  ok: boolean;

  pay_run_id: string;

  status: string;

  engine_version: string;

  employees_total: number;

  calculated: number;
  review_required: number;

  ready_for_review: boolean;

  tax_year: number;
};


function money(
  value:
    unknown
) {
  return new Intl.NumberFormat(
    "en-ZA",
    {
      style:
        "currency",

      currency:
        "ZAR",
    }
  ).format(
    Number(
      value ??
      0
    )
  );
}


function dateLabel(
  value:
    string | null
) {
  if (!value) {
    return "—";
  }

  return new Date(
    `${value.slice(
      0,
      10
    )}T12:00:00`
  ).toLocaleDateString(
    "en-ZA",
    {
      day:
        "numeric",

      month:
        "short",

      year:
        "numeric",
    }
  );
}


function dateTimeLabel(
  value:
    string | null
) {
  if (!value) {
    return "Not calculated";
  }

  return new Date(
    value
  ).toLocaleString(
    "en-ZA"
  );
}


function percentage(
  value:
    unknown
) {
  return `${(
    Number(
      value ??
      0
    ) *
    100
  ).toFixed(
    2
  )}%`;
}


function humanCode(
  value:
    string
) {
  return value
    .replaceAll(
      "_",
      " "
    )
    .replace(
      /\b\w/g,
      (
        character
      ) =>
        character.toUpperCase()
    );
}


function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-background">

      <div className="border-b px-5 py-4">

        <h2 className="font-semibold">
          {title}
        </h2>

        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}

      </div>

      <div className="p-5">
        {children}
      </div>

    </section>
  );
}


function Stat({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: ReactNode;
  description?: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-background p-5">

      <div className="text-muted-foreground">
        {icon}
      </div>

      <p className="mt-3 text-2xl font-bold">
        {value}
      </p>

      <p className="mt-1 text-sm font-semibold">
        {title}
      </p>

      {description ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}

    </div>
  );
}


function Badge({
  value,
}: {
  value: string;
}) {
  const warning =
    value ===
      "review_required" ||
    value ===
      "draft";

  const success =
    value ===
      "calculated" ||
    value ===
      "approved";

  return (
    <span
      className={[
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize",
        warning
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : success
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "bg-muted",
      ].join(
        " "
      )}
    >
      {value.replaceAll(
        "_",
        " "
      )}
    </span>
  );
}


export default function PayrollRunsPage() {
  const [
    runs,
    setRuns,
  ] =
    useState<PayRun[]>(
      []
    );


  const [
    selectedRunId,
    setSelectedRunId,
  ] =
    useState(
      ""
    );


  const [
    workspace,
    setWorkspace,
  ] =
    useState<RunWorkspace | null>(
      null
    );


  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );


  const [
    busy,
    setBusy,
  ] =
    useState(
      ""
    );


  const [
    error,
    setError,
  ] =
    useState(
      ""
    );


  const [
    success,
    setSuccess,
  ] =
    useState(
      ""
    );


  const loadRun =
    useCallback(
      async (
        runId:
          string
      ) => {
        if (!runId) {
          setWorkspace(
            null
          );

          return;
        }


        const {
          data,
          error:
            rpcError,
        } =
          await supabase.rpc(
            "get_payroll_run_workspace",
            {
              p_pay_run_id:
                runId,
            }
          );


        if (
          rpcError
        ) {
          throw rpcError;
        }


        setWorkspace(
          data as RunWorkspace
        );
      },
      []
    );


  const load =
    useCallback(
      async () => {
        setError(
          ""
        );


        const {
          data: {
            user,
          },
        } =
          await supabase.auth.getUser();


        if (!user) {
          window.location.href =
            "/login";

          return;
        }


        const {
          data,
          error:
            rpcError,
        } =
          await supabase.rpc(
            "get_payroll_foundation_workspace"
          );


        if (
          rpcError
        ) {
          throw rpcError;
        }


        const result =
          data as FoundationWorkspace;


        const availableRuns =
          result.pay_runs ??
          [];


        setRuns(
          availableRuns
        );


        let runId =
          selectedRunId;


        if (
          !runId &&
          availableRuns.length >
            0
        ) {
          runId =
            availableRuns[0].id;

          setSelectedRunId(
            runId
          );
        }


        if (runId) {
          await loadRun(
            runId
          );
        }
      },
      [
        loadRun,
        selectedRunId,
      ]
    );


  useEffect(
    () => {
      async function start() {
        try {
          await load();

        } catch (
          caught
        ) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load payroll runs."
          );

        } finally {
          setLoading(
            false
          );
        }
      }


      void start();
    },
    [load]
  );

  async function calculateRun() {
    if (
      !selectedRunId
    ) {
      setError(
        "Choose a pay run first."
      );

      return;
    }


    setBusy(
      "calculate"
    );

    setError(
      ""
    );

    setSuccess(
      ""
    );


    try {
      const {
        data,
        error:
          rpcError,
      } =
        await supabase.rpc(
          "calculate_payroll_pay_run",
          {
            p_pay_run_id:
              selectedRunId,
          }
        );


      if (
        rpcError
      ) {
        throw rpcError;
      }


      const result =
        data as CalculationResult;


      if (
        result.review_required >
        0
      ) {
        setSuccess(
          `Calculation completed with ${result.review_required} employee(s) requiring review. The pay run remains Draft.`
        );

      } else {
        setSuccess(
          `Payroll calculation completed for ${result.calculated} employee(s).`
        );
      }


      await loadRun(
        selectedRunId
      );

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Payroll calculation failed."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  async function refresh() {
    setBusy(
      "refresh"
    );

    setError(
      ""
    );

    try {
      await load();

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to refresh payroll."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  const run =
    workspace?.run;


  const employeesReady =
    useMemo(
      () =>
        workspace?.employees.filter(
          (
            employee
          ) =>
            employee.calculation_status ===
            "calculated"
        ).length ??
        0,
      [
        workspace,
      ]
    );


  if (
    loading
  ) {
    return (
      <DashboardLayout>

        <div className="flex min-h-screen items-center justify-center">

          <p className="text-sm text-muted-foreground">
            Loading Payroll Calculation Engine...
          </p>

        </div>

      </DashboardLayout>
    );
  }


  return (
    <DashboardLayout>

      <main className="mx-auto max-w-[1700px] space-y-5 p-4 sm:p-6">

        <div className="flex flex-wrap items-start justify-between gap-4">

          <div>

            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              JINLAB Nexus Payroll
            </p>


            <h1 className="mt-1 text-2xl font-bold">
              PAYE Calculation & Pay Run Review
            </h1>


            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Standard South African monthly payroll calculation with statutory rule snapshots and review blockers.
            </p>

          </div>


          <div className="flex flex-wrap gap-2">

            <Link
              href="/payroll"
              className="inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold"
            >
              Payroll Setup
            </Link>


            <button
              type="button"
              disabled={
                busy ===
                "refresh"
              }
              onClick={
                () =>
                  void refresh()
              }
              className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />

              Refresh
            </button>

          </div>

        </div>


        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">

          <div className="flex gap-3">

            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-900" />


            <div>

              <p className="font-semibold text-amber-950">
                Standard monthly PAYE engine
              </p>


              <p className="mt-1 text-sm text-amber-900">
                Nexus calculates standard monthly salaried employees. Unsupported tax situations are stopped and marked Review Required rather than estimated.
              </p>

            </div>

          </div>

        </div>


        {error ? (
          <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">

            <XCircle className="h-5 w-5 shrink-0" />

            {error}

          </div>
        ) : null}


        {success ? (
          <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">

            <CheckCircle2 className="h-5 w-5 shrink-0" />

            {success}

          </div>
        ) : null}


        <Panel
          title="Payroll Period"
          description="Choose a draft or calculated pay run."
        >

          {runs.length ===
          0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center">

              <Coins className="mx-auto h-8 w-8 text-muted-foreground" />


              <p className="mt-3 font-semibold">
                No payroll runs
              </p>


              <p className="mt-1 text-sm text-muted-foreground">
                Create a Draft Pay Run from Payroll Setup first.
              </p>


              <Link
                href="/payroll"
                className="mt-4 inline-flex h-10 items-center rounded-xl bg-foreground px-4 text-sm font-bold text-background"
              >
                Go to Payroll Setup
              </Link>

            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">

              <label className="grid gap-1.5 text-sm">

                <span className="font-medium">
                  Pay run
                </span>


                <SearchableSelect searchLabel="Payroll runs"
                  value={
                    selectedRunId
                  }
                  onValueChange={
                    (
                      selectedValue
                    ) =>
                      setSelectedRunId(
                        selectedValue
                      )
                  }
                  className="h-11 rounded-xl border bg-background px-3"
                >
                  {runs.map(
                    (
                      payRun
                    ) => (
                      <option
                        key={
                          payRun.id
                        }
                        value={
                          payRun.id
                        }
                      >
                        {payRun.period_start} → {payRun.period_end} · {payRun.status}
                      </option>
                    )
                  )}

                </SearchableSelect>

              </label>


              <button
                type="button"
                disabled={
                  !selectedRunId ||
                  busy ===
                  "calculate" ||
                  (
                    run !==
                      undefined &&
                    run !==
                      null &&
                    ![
                      "draft",
                      "calculated",
                    ].includes(
                      run.status
                    )
                  )
                }
                onClick={
                  () =>
                    void calculateRun()
                }
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground px-5 text-sm font-bold text-background disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Calculator className="h-4 w-4" />

                {run?.status ===
                "calculated"
                  ? "Recalculate"
                  : "Calculate Payroll"}
              </button>

            </div>
          )}

        </Panel>


        {workspace &&
        run ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

              <Stat
                title="Gross Payroll"
                value={
                  money(
                    workspace.summary.gross
                  )
                }
                description={`${workspace.summary.employees} employee record(s)`}
                icon={
                  <WalletCards className="h-5 w-5" />
                }
              />


              <Stat
                title="PAYE"
                value={
                  money(
                    workspace.summary.paye
                  )
                }
                description={`Tax year ${run.tax_year}`}
                icon={
                  <Landmark className="h-5 w-5" />
                }
              />


              <Stat
                title="Employee UIF"
                value={
                  money(
                    workspace.summary.uif_employee
                  )
                }
                description={`Employer UIF ${money(
                  workspace.summary.uif_employer
                )}`}
                icon={
                  <Coins className="h-5 w-5" />
                }
              />


              <Stat
                title="Net Payroll"
                value={
                  money(
                    workspace.summary.net_pay
                  )
                }
                description={`SDL ${money(
                  workspace.summary.sdl_employer
                )}`}
                icon={
                  <CheckCircle2 className="h-5 w-5" />
                }
              />

            </div>


            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

              <Stat
                title="Run Status"
                value={
                  <Badge
                    value={
                      run.status
                    }
                  />
                }
                description={
                  run.calculation_version ??
                  "Not calculated"
                }
                icon={
                  <ShieldCheck className="h-5 w-5" />
                }
              />


              <Stat
                title="Calculated"
                value={
                  employeesReady
                }
                description="Employees calculated successfully"
                icon={
                  <Users className="h-5 w-5" />
                }
              />


              <Stat
                title="Review Required"
                value={
                  workspace.summary.review_required
                }
                description="Payroll is blocked until resolved"
                icon={
                  <FileWarning className="h-5 w-5" />
                }
              />


              <Stat
                title="Calculated At"
                value={
                  run.calculated_at
                    ? dateLabel(
                        run.calculated_at
                      )
                    : "—"
                }
                description={
                  dateTimeLabel(
                    run.calculated_at
                  )
                }
                icon={
                  <RefreshCw className="h-5 w-5" />
                }
              />

            </div>


            {workspace.summary.review_required >
            0 ? (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">

                <div className="flex gap-3">

                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-900" />


                  <div>

                    <p className="font-bold text-amber-950">
                      Payroll cannot move forward yet
                    </p>


                    <p className="mt-1 text-sm text-amber-900">
                      {workspace.summary.review_required} employee(s) contain unsupported or incomplete payroll information. Nexus has intentionally kept this run in Draft.
                    </p>

                  </div>

                </div>

              </div>
            ) : run.status ===
            "calculated" ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">

                <div className="flex gap-3">

                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-800" />


                  <div>

                    <p className="font-bold text-emerald-950">
                      Calculation complete
                    </p>


                    <p className="mt-1 text-sm text-emerald-900">
                      All employees in this pay run passed the current 23.2 standard-payroll rules. Approval and posting are deliberately not enabled yet.
                    </p>

                  </div>

                </div>

              </div>
            ) : null}


            <Panel
              title="Pay Run Details"
              description={`${run.period_start} → ${run.period_end} · payment ${run.payment_date}`}
            >

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">

                <InfoBox
                  label="Frequency"
                  value={
                    humanCode(
                      run.pay_frequency
                    )
                  }
                />


                <InfoBox
                  label="Tax Year"
                  value={
                    String(
                      run.tax_year
                    )
                  }
                />


                <InfoBox
                  label="Engine"
                  value={
                    run.calculation_version ??
                    "Not calculated"
                  }
                />


                <InfoBox
                  label="Rule Snapshot"
                  value={
                    run.statutory_rule_set_id
                      ? run.statutory_rule_set_id.slice(
                          0,
                          8
                        )
                      : "—"
                  }
                />

              </div>

            </Panel>


            <Panel
              title="Employees"
              description="Every calculation stores the tax and contribution inputs used."
            >

              {workspace.employees.length ===
              0 ? (
                <p className="text-sm text-muted-foreground">
                  Calculate this pay run to populate employee payroll records.
                </p>
              ) : (
                <div className="overflow-x-auto">

                  <table className="w-full min-w-[1350px] text-sm">

                    <thead>

                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">

                        <th className="p-3">
                          Employee
                        </th>

                        <th className="p-3">
                          Gross
                        </th>

                        <th className="p-3">
                          PAYE
                        </th>

                        <th className="p-3">
                          UIF Employee
                        </th>

                        <th className="p-3">
                          UIF Employer
                        </th>

                        <th className="p-3">
                          SDL
                        </th>

                        <th className="p-3">
                          Net Pay
                        </th>

                        <th className="p-3">
                          Status
                        </th>

                        <th className="p-3">
                          Details
                        </th>

                        <th className="p-3">
                          Payslip
                        </th>

                      </tr>

                    </thead>


                    <tbody>

                      {workspace.employees.map(
                        (
                          employee
                        ) => (
                          <tr
                            key={
                              employee.id
                            }
                            className="border-b align-top last:border-0"
                          >

                            <td className="p-3">

                              <p className="font-semibold">
                                {employee.employee_name}
                              </p>


                              <p className="text-xs text-muted-foreground">
                                {employee.employee_number}
                              </p>

                            </td>


                            <td className="p-3 font-semibold">
                              {money(
                                employee.gross_remuneration
                              )}
                            </td>


                            <td className="p-3">
                              {money(
                                employee.paye_amount
                              )}
                            </td>


                            <td className="p-3">
                              {money(
                                employee.uif_employee
                              )}
                            </td>


                            <td className="p-3">
                              {money(
                                employee.uif_employer
                              )}
                            </td>


                            <td className="p-3">
                              {money(
                                employee.sdl_employer
                              )}
                            </td>


                            <td className="p-3 font-bold">
                              {money(
                                employee.net_pay
                              )}
                            </td>


                            <td className="p-3">

                              <Badge
                                value={
                                  employee.calculation_status
                                }
                              />

                            </td>


                            <td className="p-3">

                              <EmployeeDetails
                                employee={
                                  employee
                                }
                              />

                            </td>

                            <td className="p-3">
                              <Link
                                href={`/payroll/payslips/${employee.id}`}
                                className="inline-flex items-center rounded-md border px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted"
                              >
                                View Payslip
                              </Link>
                            </td>

                          </tr>
                        )
                      )}

                    </tbody>

                  </table>

                </div>
              )}

            </Panel>


            <Panel
              title="23.2 Calculation Scope"
              description="Unsupported cases remain visible and blocked for review."
            >

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">

                <ScopeCard
                  title="Supported"
                  items={[
                    "Monthly salaried employee",
                    "2027 statutory tax brackets",
                    "Primary / secondary / tertiary rebates",
                    "Standard medical scheme tax credit",
                    "UIF employee + employer",
                    "SDL employer contribution",
                    "Statutory calculation snapshot",
                  ]}
                />


                <ScopeCard
                  title="Review Required"
                  items={[
                    "Hourly payroll",
                    "Partial employment period",
                    "Tax directives",
                    "Retirement fund deductions",
                    "Bonuses / annual payments",
                    "Complex allowances / fringe benefits",
                    "65+ additional medical credit inputs",
                    "Disability medical special cases",
                  ]}
                />


                <ScopeCard
                  title="Next Payroll Layer"
                  items={[
                    "Time-based hourly earnings",
                    "Overtime import from HR",
                    "Retirement contribution deductions",
                    "Variable remuneration",
                    "Tax directives",
                    "Full medical special cases",
                    "Final payroll approval workflow",
                  ]}
                />

              </div>

            </Panel>
          </>
        ) : null}

      </main>

    </DashboardLayout>
  );
}


function InfoBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-muted/40 p-4">

      <p className="text-xs text-muted-foreground">
        {label}
      </p>


      <p className="mt-1 break-all font-semibold">
        {value}
      </p>

    </div>
  );
}


function EmployeeDetails({
  employee,
}: {
  employee:
    RunEmployee;
}) {
  const details =
    employee.calculation_details ??
    {};


  const blockers =
    details.blockers ??
    [];


  const paye =
    details.paye;


  return (
    <details>

      <summary className="cursor-pointer text-xs font-semibold underline">
        View
      </summary>


      <div className="mt-3 w-[330px] max-w-[80vw] space-y-3 rounded-xl border bg-background p-3">

        {blockers.length >
        0 ? (
          <div>

            <p className="text-xs font-bold text-red-700">
              Review blockers
            </p>


            <ul className="mt-2 space-y-1 text-xs">

              {blockers.map(
                (
                  blocker
                ) => (
                  <li
                    key={
                      blocker
                    }
                  >
                    • {humanCode(
                      blocker
                    )}
                  </li>
                )
              )}

            </ul>

          </div>
        ) : null}


        {paye ? (
          <div className="space-y-2">

            <p className="text-xs font-bold">
              PAYE Calculation
            </p>


            <DetailRow
              label="Annual equivalent"
              value={
                money(
                  paye.annual_equivalent
                )
              }
            />


            <DetailRow
              label="Age category"
              value={
                humanCode(
                  paye.age_category ??
                  "—"
                )
              }
            />


            <DetailRow
              label="Tax before rebate"
              value={
                money(
                  paye.annual_tax_before_rebate
                )
              }
            />


            <DetailRow
              label="Annual rebate"
              value={
                money(
                  paye.annual_rebate
                )
              }
            />


            <DetailRow
              label="Medical credit / month"
              value={
                money(
                  paye.medical_tax_credit_monthly
                )
              }
            />


            <DetailRow
              label="PAYE / month"
              value={
                money(
                  paye.paye_monthly
                )
              }
            />


            {paye.source_url ? (
              <a
                href={
                  paye.source_url
                }
                target="_blank"
                rel="noreferrer"
                className="inline-block pt-1 text-xs underline"
              >
                SARS statutory source
              </a>
            ) : null}

          </div>
        ) : null}


        {details.uif ? (
          <div className="space-y-2 border-t pt-3">

            <p className="text-xs font-bold">
              UIF
            </p>


            <DetailRow
              label="UIF base"
              value={
                money(
                  details.uif.remuneration_base
                )
              }
            />


            <DetailRow
              label="Employee rate"
              value={
                percentage(
                  details.uif.employee_rate
                )
              }
            />


            <DetailRow
              label="Employer rate"
              value={
                percentage(
                  details.uif.employer_rate
                )
              }
            />

          </div>
        ) : null}

      </div>

    </details>
  );
}


function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">

      <span className="text-muted-foreground">
        {label}
      </span>


      <span className="font-semibold">
        {value}
      </span>

    </div>
  );
}


function ScopeCard({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-xl border p-4">

      <p className="font-semibold">
        {title}
      </p>


      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">

        {items.map(
          (
            item
          ) => (
            <li
              key={
                item
              }
            >
              • {item}
            </li>
          )
        )}

      </ul>

    </div>
  );
}
