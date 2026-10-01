"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import Link from "next/link";

import {
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
  if (!value) {
    return "—";
  }

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

export default function MyPayslipsPage() {
  const [data, setData] =
    useState<PayrollHistoryResponse | null>(
      null
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const loadPayslips = useCallback(
    async () => {
      try {
        setLoading(true);
        setError("");

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.href = "/login";
          return;
        }

        const {
          data: result,
          error: rpcError,
        } = await supabase.rpc(
          "get_payroll_employee_records",
          {
            p_employee_id: null,
            p_limit: 24,
          }
        );

        if (rpcError) {
          throw rpcError;
        }

        if (!result) {
          throw new Error(
            "Your payslips could not be loaded."
          );
        }

        const response =
          result as PayrollHistoryResponse;

        /*
         * This screen is employee self-service.
         *
         * Security is enforced by the database RPC.
         * An employee cannot use this page to select
         * or request another employee's payroll data.
         */
        setData(response);
      } catch (caught) {
        console.error(
          "My Payslips load failed:",
          caught
        );

        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load your payslips."
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPayslips();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadPayslips]);

  const records =
    data?.records ?? [];

  const employee =
    records[0] ?? null;

  return (
    <DashboardLayout>
      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              JINLAB Nexus Employee Self-Service
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              My Payslips
            </h1>

            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              View your issued payroll records and securely open or print your payslips.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void loadPayslips()
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

        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
            <p className="font-semibold text-destructive">
              My Payslips unavailable
            </p>

            <p className="mt-2 text-sm text-muted-foreground">
              {error}
            </p>

            <p className="mt-3 text-xs text-muted-foreground">
              Your Nexus login must be linked to your HR employee profile and have employee payroll self-service access.
            </p>
          </div>
        ) : null}

        {loading && !data ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-xl border bg-background">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading your payslips...
            </div>
          </div>
        ) : null}

        {!loading && data ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border bg-background p-5">
                <WalletCards className="h-5 w-5 text-muted-foreground" />

                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Employee
                </p>

                <p className="mt-1 font-bold">
                  {employee?.employee_name ??
                    "My Payroll"}
                </p>

                <p className="text-xs text-muted-foreground">
                  {employee?.employee_number ??
                    "Nexus Employee"}
                </p>
              </div>

              <div className="rounded-xl border bg-background p-5">
                <CalendarDays className="h-5 w-5 text-muted-foreground" />

                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Issued Records
                </p>

                <p className="mt-1 text-2xl font-bold">
                  {records.length}
                </p>

                <p className="text-xs text-muted-foreground">
                  Available payroll periods
                </p>
              </div>

              <div className="rounded-xl border bg-background p-5">
                <ShieldCheck className="h-5 w-5 text-muted-foreground" />

                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Privacy
                </p>

                <p className="mt-1 font-bold">
                  Private
                </p>

                <p className="text-xs text-muted-foreground">
                  Only your linked payroll records
                </p>
              </div>
            </div>

            <section className="overflow-hidden rounded-xl border bg-background">
              <div className="border-b p-5">
                <h2 className="font-bold">
                  Payslip History
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Your most recent issued payslips appear first.
                </p>
              </div>

              {records.length === 0 ? (
                <div className="p-12 text-center">
                  <FileText className="mx-auto h-9 w-9 text-muted-foreground" />

                  <p className="mt-4 font-semibold">
                    No payslips available
                  </p>

                  <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                    Your issued payslips will appear here after an authorised payroll run has been posted or paid.
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {records.map((record) => (
                    <article
                      key={
                        record.pay_run_employee_id
                      }
                      className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-bold">
                          {formatDate(
                            record.period_start
                          )}{" "}
                          –{" "}
                          {formatDate(
                            record.period_end
                          )}
                        </p>

                        <p className="mt-1 text-sm text-muted-foreground">
                          Paid{" "}
                          {formatDate(
                            record.payment_date
                          )}
                          {" · "}
                          Tax year{" "}
                          {record.tax_year}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Gross
                          </p>

                          <p className="font-semibold">
                            {money(
                              record.gross_pay
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground">
                            PAYE
                          </p>

                          <p className="font-semibold">
                            {money(
                              record.paye
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground">
                            UIF
                          </p>

                          <p className="font-semibold">
                            {money(
                              record.uif_employee
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground">
                            Net Pay
                          </p>

                          <p className="font-bold">
                            {money(
                              record.net_pay
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {record.payslip_available ? (
                          <Link
                            href={`/payroll/payslips/${record.pay_run_employee_id}`}
                            className="inline-flex h-10 items-center justify-center rounded-lg border bg-background px-4 text-sm font-semibold transition-colors hover:bg-muted"
                          >
                            <FileText className="mr-2 h-4 w-4" />
                            View Payslip
                          </Link>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Not issued
                          </span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />

                <div>
                  <p className="text-sm font-semibold">
                    Secure employee payroll access
                  </p>

                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Payroll access is linked to your Nexus account and HR employee identity. Other employees&apos; payroll records are not available through this self-service screen.
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </main>
    </DashboardLayout>
  );
}
