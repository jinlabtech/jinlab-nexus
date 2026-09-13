"use client";

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
  BellRing,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileWarning,
  RefreshCw,
  ShoppingCart,
  ShieldAlert,
  TimerOff,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/lib/supabase";


type Branch = {
  id: string;
  name: string;
};


type IntelligenceSummary = {
  active_employees: number;
  scheduled_today: number;
  clocked_in_now: number;

  pending_leave: number;
  open_attendance_exceptions: number;

  documents_expiring_30_days: number;
  discipline_expiring_30_days: number;

  period_attended_days: number;
  period_late_days: number;
  period_absent_days: number;
  period_worked_minutes: number;

  period_sales_count: number;
  period_sales_value: number;
};


type TrendDay = {
  date: string;

  scheduled: number;
  attended: number;
  late: number;
  absent: number;

  worked_minutes: number;

  sales_count: number;
  sales_value: number;
};


type HrAlert = {
  severity:
    | "critical"
    | "warning"
    | "info";

  type: string;

  employee_id: string | null;
  employee_number: string | null;
  employee_name: string | null;

  branch_name: string | null;
  shift_name: string | null;

  occurred_at: string | null;

  minutes_variance: number;

  message: string;
};


type Workspace = {
  ok: boolean;

  timezone: string;

  today: string;

  range_start: string;
  range_end: string;

  branches: Branch[];

  capabilities: {
    documents: boolean;
    discipline: boolean;
    leave_approval: boolean;
  };

  summary: IntelligenceSummary;

  trend: TrendDay[];

  alerts: HrAlert[];
};


function number(
  value: unknown
) {
  return Number(
    value ??
    0
  );
}


function money(
  value: unknown
) {
  return new Intl.NumberFormat(
    "en-ZA",
    {
      style:
        "currency",

      currency:
        "ZAR",

      maximumFractionDigits:
        0,
    }
  ).format(
    number(
      value
    )
  );
}


function minutesLabel(
  value: unknown
) {
  const minutes =
    number(
      value
    );


  const hours =
    Math.floor(
      minutes /
      60
    );


  const remainder =
    Math.round(
      minutes %
      60
    );


  return `${hours}h ${String(
    remainder
  ).padStart(
    2,
    "0"
  )}m`;
}


function humanDate(
  value:
    string
) {
  return new Date(
    `${value}T12:00:00`
  ).toLocaleDateString(
    "en-ZA",
    {
      weekday:
        "short",

      day:
        "numeric",

      month:
        "short",
    }
  );
}


function humanDateTime(
  value:
    string | null,
  timezone:
    string
) {
  if (!value) {
    return "—";
  }


  return new Intl.DateTimeFormat(
    "en-ZA",
    {
      day:
        "numeric",

      month:
        "short",

      hour:
        "2-digit",

      minute:
        "2-digit",

      hour12:
        false,

      timeZone:
        timezone,
    }
  ).format(
    new Date(
      value
    )
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

      <div className="flex items-start justify-between gap-3">

        <div className="text-muted-foreground">
          {icon}
        </div>

      </div>


      <p className="mt-4 text-3xl font-bold">
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


function AlertBadge({
  severity,
}: {
  severity: HrAlert["severity"];
}) {
  const style =
    severity ===
      "critical"
      ? "border-red-200 bg-red-50 text-red-800"
      : severity ===
          "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-blue-200 bg-blue-50 text-blue-800";


  return (
    <span
      className={[
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-bold capitalize",
        style,
      ].join(
        " "
      )}
    >
      {severity}
    </span>
  );
}


function alertTitle(
  type:
    string
) {
  const titles:
    Record<
      string,
      string
    > = {
      not_arrived:
        "Employee has not arrived",

      late_arrival:
        "Late arrival",

      still_clocked_in:
        "Still clocked in",

      attendance_exception:
        "Attendance exception",

      pending_leave:
        "Leave approval required",

      document_expiry:
        "HR document expiring",

      discipline_expiry:
        "Disciplinary record expiring",
    };


  return (
    titles[
      type
    ] ??
    type.replaceAll(
      "_",
      " "
    )
  );
}


function alertLink(
  type:
    string
) {
  switch (
    type
  ) {
    case "not_arrived":
    case "late_arrival":
    case "still_clocked_in":
    case "attendance_exception":
      return "/hr/timebook";

    case "pending_leave":
      return "/hr";

    case "document_expiry":
      return "/hr/documents";

    case "discipline_expiry":
      return "/hr/records";

    default:
      return "/hr";
  }
}


export default function HrIntelligencePage() {
  const [
    workspace,
    setWorkspace,
  ] =
    useState<Workspace | null>(
      null
    );


  const [
    branchId,
    setBranchId,
  ] =
    useState(
      ""
    );


  const [
    days,
    setDays,
  ] =
    useState(
      7
    );


  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );


  const [
    refreshing,
    setRefreshing,
  ] =
    useState(
      false
    );


  const [
    error,
    setError,
  ] =
    useState(
      ""
    );


  const load =
    useCallback(
      async (
        quiet =
          false
      ) => {
        if (
          !quiet
        ) {
          setRefreshing(
            true
          );
        }


        setError(
          ""
        );


        try {
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
              "get_hr_intelligence_workspace",
              {
                p_branch_id:
                  branchId ||
                  null,

                p_days:
                  days,
              }
            );


          if (
            rpcError
          ) {
            throw rpcError;
          }


          setWorkspace(
            data as Workspace
          );

        } catch (
          caught
        ) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load HR intelligence."
          );

        } finally {
          setLoading(
            false
          );

          setRefreshing(
            false
          );
        }
      },
      [
        branchId,
        days,
      ]
    );


  useEffect(
    () => {
      void load();

    },
    [
      load,
    ]
  );


  useEffect(
    () => {
      const timer =
        window.setInterval(
          () => {
            void load(
              true
            );
          },
          60000
        );


      return () =>
        window.clearInterval(
          timer
        );
    },
    [
      load,
    ]
  );


  const criticalAlerts =
    useMemo(
      () =>
        workspace?.alerts.filter(
          (
            alert
          ) =>
            alert.severity ===
            "critical"
        ).length ??
        0,
      [
        workspace,
      ]
    );


  const warningAlerts =
    useMemo(
      () =>
        workspace?.alerts.filter(
          (
            alert
          ) =>
            alert.severity ===
            "warning"
        ).length ??
        0,
      [
        workspace,
      ]
    );


  const maxTrend =
    useMemo(
      () =>
        Math.max(
          1,
          ...(
            workspace?.trend ??
            []
          ).map(
            (
              day
            ) =>
              Math.max(
                number(
                  day.scheduled
                ),
                number(
                  day.attended
                ),
                number(
                  day.late
                ),
                number(
                  day.absent
                )
              )
          )
        ),
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
            Analysing Nexus HR...
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
              Nexus HR Intelligence
            </p>


            <h1 className="mt-1 text-2xl font-bold">
              Owner Alerts & Workforce Intelligence
            </h1>


            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Live attendance, scheduling, HR compliance and staff activity signals.
            </p>

          </div>


          <button
            type="button"
            disabled={
              refreshing
            }
            onClick={
              () =>
                void load()
            }
            className="inline-flex h-10 items-center gap-2 rounded-xl border bg-background px-4 text-sm font-semibold disabled:opacity-50"
          >
            <RefreshCw
              className={[
                "h-4 w-4",
                refreshing
                  ? "animate-spin"
                  : "",
              ].join(
                " "
              )}
            />

            Refresh
          </button>

        </div>


        {error ? (
          <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">

            <XCircle className="h-5 w-5 shrink-0" />

            {error}

          </div>
        ) : null}


        {workspace ? (
          <>
            <div className="rounded-2xl border bg-background p-5">

              <div className="grid gap-4 md:grid-cols-3">

                <label className="grid gap-1.5 text-sm">

                  <span className="font-medium">
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
                          event.target.value
                        )
                    }
                    className="h-11 rounded-xl border bg-background px-3"
                  >
                    <option value="">
                      All branches
                    </option>

                    {workspace.branches.map(
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
                          {branch.name}
                        </option>
                      )
                    )}

                  </select>

                </label>


                <label className="grid gap-1.5 text-sm">

                  <span className="font-medium">
                    Analysis period
                  </span>

                  <select
                    value={
                      days
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setDays(
                          Number(
                            event.target.value
                          )
                        )
                    }
                    className="h-11 rounded-xl border bg-background px-3"
                  >
                    <option value={7}>
                      Last 7 days
                    </option>

                    <option value={14}>
                      Last 14 days
                    </option>

                    <option value={30}>
                      Last 30 days
                    </option>
                  </select>

                </label>


                <div className="flex items-end">

                  <div className="w-full rounded-xl bg-muted/40 p-3">

                    <p className="text-xs text-muted-foreground">
                      Live status
                    </p>

                    <p className="mt-1 flex items-center gap-2 text-sm font-semibold">
                      <CheckCircle2 className="h-4 w-4" />
                      Auto-refresh every 60 seconds
                    </p>

                  </div>

                </div>

              </div>

            </div>


            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

              <Stat
                title="Active Employees"
                value={
                  workspace.summary.active_employees
                }
                description="Active HR profiles"
                icon={
                  <Users className="h-5 w-5" />
                }
              />


              <Stat
                title="Scheduled Today"
                value={
                  workspace.summary.scheduled_today
                }
                description="Expected to work today"
                icon={
                  <CalendarDays className="h-5 w-5" />
                }
              />


              <Stat
                title="Clocked In Now"
                value={
                  workspace.summary.clocked_in_now
                }
                description="Currently on open time entries"
                icon={
                  <UserCheck className="h-5 w-5" />
                }
              />


              <Stat
                title="Needs Attention"
                value={
                  workspace.alerts.length
                }
                description={`${criticalAlerts} critical · ${warningAlerts} warning`}
                icon={
                  <BellRing className="h-5 w-5" />
                }
              />

            </div>


            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

              <Stat
                title="Late"
                value={
                  workspace.summary.period_late_days
                }
                description={`During last ${days} days`}
                icon={
                  <Clock3 className="h-5 w-5" />
                }
              />


              <Stat
                title="Absent"
                value={
                  workspace.summary.period_absent_days
                }
                description={`During last ${days} days`}
                icon={
                  <TimerOff className="h-5 w-5" />
                }
              />


              <Stat
                title="Worked"
                value={
                  minutesLabel(
                    workspace.summary.period_worked_minutes
                  )
                }
                description={`Attendance time over ${days} days`}
                icon={
                  <Clock3 className="h-5 w-5" />
                }
              />


              <Stat
                title="POS Activity"
                value={
                  workspace.summary.period_sales_count
                }
                description={
                  money(
                    workspace.summary.period_sales_value
                  )
                }
                icon={
                  <ShoppingCart className="h-5 w-5" />
                }
              />

            </div>


            <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">

              <Panel
                title="Owner Alerts"
                description="Deterministic HR signals requiring human attention."
              >

                {workspace.alerts.length ===
                0 ? (
                  <div className="rounded-2xl border border-dashed p-8 text-center">

                    <CheckCircle2 className="mx-auto h-9 w-9 text-muted-foreground" />


                    <p className="mt-3 font-semibold">
                      No current HR alerts
                    </p>


                    <p className="mt-1 text-sm text-muted-foreground">
                      Nexus has not detected an attendance, leave or HR-record issue requiring attention.
                    </p>

                  </div>
                ) : (
                  <div className="space-y-3">

                    {workspace.alerts.map(
                      (
                        alert,
                        index
                      ) => (
                        <Link
                          key={
                            `${alert.type}-${alert.employee_id}-${index}`
                          }
                          href={
                            alertLink(
                              alert.type
                            )
                          }
                          className="block rounded-2xl border p-4 transition hover:bg-muted/30"
                        >

                          <div className="flex flex-wrap items-start justify-between gap-3">

                            <div className="flex min-w-0 gap-3">

                              <div className="mt-0.5">

                                {alert.severity ===
                                "critical" ? (
                                  <ShieldAlert className="h-5 w-5 text-red-700" />
                                ) : alert.severity ===
                                  "warning" ? (
                                  <AlertTriangle className="h-5 w-5 text-amber-700" />
                                ) : (
                                  <BellRing className="h-5 w-5 text-blue-700" />
                                )}

                              </div>


                              <div className="min-w-0">

                                <p className="font-bold">
                                  {alertTitle(
                                    alert.type
                                  )}
                                </p>


                                {alert.employee_name ? (
                                  <p className="mt-0.5 text-sm font-semibold">
                                    {alert.employee_name}
                                  </p>
                                ) : null}


                                <p className="mt-1 text-sm text-muted-foreground">
                                  {alert.message}
                                </p>


                                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">

                                  {alert.employee_number ? (
                                    <span>
                                      {alert.employee_number}
                                    </span>
                                  ) : null}


                                  {alert.branch_name ? (
                                    <span>
                                      {alert.branch_name}
                                    </span>
                                  ) : null}


                                  {alert.shift_name ? (
                                    <span>
                                      {alert.shift_name}
                                    </span>
                                  ) : null}


                                  {alert.occurred_at ? (
                                    <span>
                                      {humanDateTime(
                                        alert.occurred_at,
                                        workspace.timezone
                                      )}
                                    </span>
                                  ) : null}

                                </div>

                              </div>

                            </div>


                            <AlertBadge
                              severity={
                                alert.severity
                              }
                            />

                          </div>

                        </Link>
                      )
                    )}

                  </div>
                )}

              </Panel>


              <Panel
                title="HR Control Centre"
                description="Current items requiring management review."
              >

                <div className="grid gap-3">

                  <Link
                    href="/hr/timebook"
                    className="flex items-center justify-between rounded-xl border p-4 transition hover:bg-muted/30"
                  >

                    <div className="flex items-center gap-3">

                      <AlertTriangle className="h-5 w-5 text-muted-foreground" />

                      <div>
                        <p className="font-semibold">
                          Attendance Exceptions
                        </p>

                        <p className="text-xs text-muted-foreground">
                          Open unresolved exceptions
                        </p>
                      </div>

                    </div>


                    <span className="text-xl font-bold">
                      {workspace.summary.open_attendance_exceptions}
                    </span>

                  </Link>


                  <Link
                    href="/hr"
                    className="flex items-center justify-between rounded-xl border p-4 transition hover:bg-muted/30"
                  >

                    <div className="flex items-center gap-3">

                      <CalendarDays className="h-5 w-5 text-muted-foreground" />

                      <div>
                        <p className="font-semibold">
                          Pending Leave
                        </p>

                        <p className="text-xs text-muted-foreground">
                          Requests awaiting review
                        </p>
                      </div>

                    </div>


                    <span className="text-xl font-bold">
                      {workspace.summary.pending_leave}
                    </span>

                  </Link>


                  {workspace.capabilities.documents ? (
                    <Link
                      href="/hr/documents"
                      className="flex items-center justify-between rounded-xl border p-4 transition hover:bg-muted/30"
                    >

                      <div className="flex items-center gap-3">

                        <FileWarning className="h-5 w-5 text-muted-foreground" />

                        <div>
                          <p className="font-semibold">
                            Documents Expiring
                          </p>

                          <p className="text-xs text-muted-foreground">
                            Within next 30 days
                          </p>
                        </div>

                      </div>


                      <span className="text-xl font-bold">
                        {workspace.summary.documents_expiring_30_days}
                      </span>

                    </Link>
                  ) : null}


                  {workspace.capabilities.discipline ? (
                    <Link
                      href="/hr/records"
                      className="flex items-center justify-between rounded-xl border p-4 transition hover:bg-muted/30"
                    >

                      <div className="flex items-center gap-3">

                        <ShieldAlert className="h-5 w-5 text-muted-foreground" />

                        <div>
                          <p className="font-semibold">
                            Disciplinary Expiry
                          </p>

                          <p className="text-xs text-muted-foreground">
                            Within next 30 days
                          </p>
                        </div>

                      </div>


                      <span className="text-xl font-bold">
                        {workspace.summary.discipline_expiring_30_days}
                      </span>

                    </Link>
                  ) : null}

                </div>

              </Panel>

            </div>


            <Panel
              title="Attendance Trend"
              description={`Daily workforce activity from ${workspace.range_start} to ${workspace.range_end}.`}
            >

              {workspace.trend.length ===
              0 ? (
                <p className="text-sm text-muted-foreground">
                  No attendance trend data available.
                </p>
              ) : (
                <div className="space-y-4">

                  {workspace.trend.map(
                    (
                      day
                    ) => (
                      <div
                        key={
                          day.date
                        }
                        className="rounded-xl border p-4"
                      >

                        <div className="flex flex-wrap items-center justify-between gap-3">

                          <p className="font-semibold">
                            {humanDate(
                              day.date
                            )}
                          </p>


                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">

                            <span>
                              Scheduled{" "}
                              <strong className="text-foreground">
                                {day.scheduled}
                              </strong>
                            </span>


                            <span>
                              Attended{" "}
                              <strong className="text-foreground">
                                {day.attended}
                              </strong>
                            </span>


                            <span>
                              Late{" "}
                              <strong className="text-foreground">
                                {day.late}
                              </strong>
                            </span>


                            <span>
                              Absent{" "}
                              <strong className="text-foreground">
                                {day.absent}
                              </strong>
                            </span>

                          </div>

                        </div>


                        <div className="mt-4 grid gap-2">

                          <TrendBar
                            label="Scheduled"
                            value={
                              day.scheduled
                            }
                            max={
                              maxTrend
                            }
                          />


                          <TrendBar
                            label="Attended"
                            value={
                              day.attended
                            }
                            max={
                              maxTrend
                            }
                          />


                          <TrendBar
                            label="Late"
                            value={
                              day.late
                            }
                            max={
                              maxTrend
                            }
                          />


                          <TrendBar
                            label="Absent"
                            value={
                              day.absent
                            }
                            max={
                              maxTrend
                            }
                          />

                        </div>


                        <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">

                          <span>
                            Worked{" "}
                            <strong className="text-foreground">
                              {minutesLabel(
                                day.worked_minutes
                              )}
                            </strong>
                          </span>


                          <span>
                            Sales{" "}
                            <strong className="text-foreground">
                              {day.sales_count}
                            </strong>
                          </span>


                          <span>
                            Sales Value{" "}
                            <strong className="text-foreground">
                              {money(
                                day.sales_value
                              )}
                            </strong>
                          </span>

                        </div>

                      </div>
                    )
                  )}

                </div>
              )}

            </Panel>


            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

              <QuickLink
                href="/hr/timebook"
                title="Digital Time Book"
                description="Attendance, sales and corrections"
              />


              <QuickLink
                href="/hr"
                title="HR Dashboard"
                description="Roster, leave and employees"
              />


              <QuickLink
                href="/hr/devices"
                title="Attendance Devices"
                description="Kiosk and clock identity"
              />


              <QuickLink
                href="/hr/manage"
                title="HR Management"
                description="Employee configuration"
              />

            </div>
          </>
        ) : null}

      </main>

    </DashboardLayout>
  );
}


function TrendBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const width =
    Math.max(
      0,
      Math.min(
        100,
        (
          number(
            value
          ) /
          Math.max(
            max,
            1
          )
        ) *
          100
      )
    );


  return (
    <div className="grid grid-cols-[80px_1fr_40px] items-center gap-3">

      <span className="text-xs text-muted-foreground">
        {label}
      </span>


      <div className="h-2 overflow-hidden rounded-full bg-muted">

        <div
          className="h-full rounded-full bg-foreground"
          style={{
            width:
              `${width}%`,
          }}
        />

      </div>


      <span className="text-right text-xs font-bold">
        {value}
      </span>

    </div>
  );
}


function QuickLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={
        href
      }
      className="rounded-2xl border bg-background p-5 transition hover:bg-muted/30"
    >

      <p className="font-semibold">
        {title}
      </p>


      <p className="mt-1 text-sm text-muted-foreground">
        {description}
      </p>

    </Link>
  );
}
