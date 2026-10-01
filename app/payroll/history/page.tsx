"use client";

import SearchableSelect from "@/components/ui/SearchableSelect";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import Link from "next/link";

import {
  ArrowLeft,
  CalendarDays,
  FileText,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/lib/supabase";

type PayrollRecord = {
  pay_run_employee_id: string;
  pay_run_id: string;

  employee_id: string;
  employee_number: string | null;
  employee_name: string;

  period_start: string;
  period_end: string;
  payment_date: string;

  tax_year: number;
  pay_frequency: string;

  payroll_status: string;

  gross_pay: number;
  paye: number;
  uif_employee: number;
  net_pay: number;

  payslip_available: boolean;
};

type PayrollEmployee = {
  employee_id: string;
  employee_number: string | null;
  employee_name: string;
  status: string;
};

type PayrollWorkspace = {
  ok: boolean;
  employees: PayrollEmployee[];
};

type PayrollHistoryResponse = {
  ok: boolean;
  mode: "self" | "management";
  employee_id: string | null;
  records: PayrollRecord[];
};

function money(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value: string) {
  if (!value) return "—";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function human(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

export default function PayrollHistoryPage() {
  const [history, setHistory] =
    useState<PayrollHistoryResponse | null>(
      null
    );

  const [employees, setEmployees] =
    useState<PayrollEmployee[]>([]);

  const [selectedEmployeeId, setSelectedEmployeeId] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const loadHistory = useCallback(
    async () => {
      try {
        setLoading(true);
        setError("");

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.href =
            "/login";
          return;
        }

        const {
          data,
          error: rpcError,
        } = await supabase.rpc(
          "get_payroll_employee_records",
          {
            p_employee_id:
              selectedEmployeeId || null,
            p_limit: 24,
          }
        );

        if (rpcError) {
          throw rpcError;
        }

        if (!data) {
          throw new Error(
            "Payroll history could not be loaded."
          );
        }

        setHistory(
          data as PayrollHistoryResponse
        );
      } catch (caught) {
        console.error(
          "Payroll history load failed:",
          caught
        );

        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load payroll history."
        );
      } finally {
        setLoading(false);
      }
    },
    [selectedEmployeeId]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      async function loadEmployees() {
        try {
          const { data, error: workspaceError } =
            await supabase.rpc(
              "get_payroll_foundation_workspace"
            );

          if (workspaceError) {
            return;
          }

          const workspace =
            data as PayrollWorkspace | null;

          if (
            workspace?.employees &&
            Array.isArray(workspace.employees)
          ) {
            setEmployees(workspace.employees);
          }
        } catch (caught) {
          console.error(
            "Payroll employee list load failed:",
            caught
          );
        }
      }

      void loadEmployees();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadHistory();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadHistory]);

  const records =
    history?.records ?? [];

  const employeeName =
    records[0]?.employee_name ??
    "Employee";

  const employeeNumber =
    records[0]?.employee_number ??
    "—";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Link
                href="/payroll"
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                Payroll
              </Link>
            </div>

            <h1 className="text-3xl font-bold tracking-tight">
              Payslip History
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              Review historical payroll
              records and open available
              payslips.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void loadHistory()
            }
            disabled={loading}
            className="inline-flex h-10 items-center justify-center rounded-lg border bg-background px-4 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${
                loading
                  ? "animate-spin"
                  : ""
              }`}
            />
            Refresh
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="font-semibold text-destructive">
              Payroll history unavailable
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              {error}
            </p>
          </div>
        )}

        {history?.mode === "management" ? (
          <div className="rounded-xl border bg-background p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex-1">
                <label
                  htmlFor="payroll-history-employee"
                  className="mb-2 block text-sm font-semibold"
                >
                  Employee
                </label>

                <SearchableSelect searchLabel="Employees"
                  id="payroll-history-employee"
                  value={selectedEmployeeId}
                  onValueChange={(selectedValue) =>
                    setSelectedEmployeeId(
                      selectedValue
                    )
                  }
                  className="h-11 w-full max-w-xl rounded-lg border bg-background px-3 text-sm outline-none focus:border-foreground"
                >
                  <option value="">
                    All payroll records
                  </option>

                  {employees.map((employee) => (
                    <option
                      key={employee.employee_id}
                      value={employee.employee_id}
                    >
                      {employee.employee_name}
                      {employee.employee_number
                        ? ` — ${employee.employee_number}`
                        : ""}
                    </option>
                  ))}
                </SearchableSelect>

                <p className="mt-2 text-xs text-muted-foreground">
                  Select an employee to review only that employee&apos;s payroll history.
                </p>
              </div>

              <div className="text-xs text-muted-foreground">
                {employees.length} payroll employee
                {employees.length === 1 ? "" : "s"} available
              </div>
            </div>
          </div>
        ) : null}

        {loading && !history ? (
          <div className="flex min-h-[300px] items-center justify-center rounded-xl border bg-background">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading payroll history...
            </div>
          </div>
        ) : history ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border bg-background p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-muted p-2">
                    <WalletCards className="h-5 w-5" />
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Employee
                    </p>

                    <p className="font-bold">
                      {employeeName}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      {employeeNumber}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-background p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-muted p-2">
                    <CalendarDays className="h-5 w-5" />
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Payroll Records
                    </p>

                    <p className="text-2xl font-bold">
                      {records.length}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-background p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-muted p-2">
                    <ShieldCheck className="h-5 w-5" />
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Access Mode
                    </p>

                    <p className="font-bold">
                      {history.mode ===
                      "self"
                        ? "My Payroll"
                        : "Management"}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      Permission controlled
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border bg-background">
              <div className="border-b p-5">
                <h2 className="font-bold">
                  Payroll Records
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Most recent payroll
                  periods appear first.
                </p>
              </div>

              {records.length === 0 ? (
                <div className="p-10 text-center">
                  <FileText className="mx-auto h-8 w-8 text-muted-foreground" />

                  <p className="mt-3 font-semibold">
                    No payroll records yet
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Historical payslips will
                    appear here after payroll
                    runs are processed.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[950px] text-sm">
                    <thead className="bg-muted/50 text-left">
                      <tr>
                        <th className="p-3">
                          Pay Period
                        </th>

                        <th className="p-3">
                          Payment Date
                        </th>

                        <th className="p-3">
                          Gross
                        </th>

                        <th className="p-3">
                          PAYE
                        </th>

                        <th className="p-3">
                          UIF
                        </th>

                        <th className="p-3">
                          Net Pay
                        </th>

                        <th className="p-3">
                          Status
                        </th>

                        <th className="p-3">
                          Payslip
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {records.map(
                        (record) => (
                          <tr
                            key={
                              record.pay_run_employee_id
                            }
                            className="border-t"
                          >
                            <td className="p-3">
                              <p className="font-semibold">
                                {formatDate(
                                  record.period_start
                                )}
                              </p>

                              <p className="text-xs text-muted-foreground">
                                to{" "}
                                {formatDate(
                                  record.period_end
                                )}
                              </p>
                            </td>

                            <td className="p-3">
                              {formatDate(
                                record.payment_date
                              )}
                            </td>

                            <td className="p-3 font-semibold">
                              {money(
                                record.gross_pay
                              )}
                            </td>

                            <td className="p-3">
                              {money(
                                record.paye
                              )}
                            </td>

                            <td className="p-3">
                              {money(
                                record.uif_employee
                              )}
                            </td>

                            <td className="p-3 font-bold">
                              {money(
                                record.net_pay
                              )}
                            </td>

                            <td className="p-3">
                              <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold">
                                {human(
                                  record.payroll_status
                                )}
                              </span>
                            </td>

                            <td className="p-3">
                              {record.payslip_available ? (
                                <Link
                                  href={`/payroll/payslips/${record.pay_run_employee_id}`}
                                  className="inline-flex items-center rounded-md border px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted"
                                >
                                  <FileText className="mr-2 h-4 w-4" />
                                  View Payslip
                                </Link>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  Not issued
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
