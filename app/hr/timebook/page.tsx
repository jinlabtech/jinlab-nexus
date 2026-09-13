"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileDown,
  Printer,
  RefreshCw,
  ShoppingCart,
  Users,
  Wrench,
  XCircle,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/lib/supabase";


type Branch = {
  id: string;
  name: string;
};


type Employee = {
  id: string;
  employee_number: string;
  name: string;
  branch_id: string | null;
  status: string;
};


type TimebookRow = {
  employee_id: string;
  employee_number: string;
  employee_name: string;

  branch_name: string;

  work_date: string;

  roster_assignment_id: string | null;
  shift_name: string | null;

  planned_start_at: string | null;
  planned_end_at: string | null;

  required_arrival_time: string | null;
  customer_open_time: string | null;

  break_start_time: string | null;
  break_end_time: string | null;

  scheduled_finish_time: string | null;

  late_grace_minutes: number | null;

  time_entry_id: string | null;
  time_entry_count: number;

  first_clock_in: string | null;
  last_clock_out: string | null;

  total_break_minutes: number;
  worked_minutes: number;
  scheduled_paid_minutes: number;

  late_minutes: number;
  early_leave_minutes: number;

  sales_count: number;
  sales_value: number;

  attendance_status: string;
};


type TimebookWorkspace = {
  ok: boolean;

  mode:
    | "management"
    | "self";

  timezone: string;
  today: string;

  can_adjust: boolean;
  can_review: boolean;

  branches: Branch[];
  employees: Employee[];

  open_exceptions: number;

  summary: {
    employee_days: number;
    scheduled_shifts: number;
    attended_days: number;
    late_days: number;
    absent_days: number;
    open_clock_ins: number;
    worked_minutes: number;
    scheduled_paid_minutes: number;
    sales_count: number;
    sales_value: number;
  };

  rows: TimebookRow[];
};


type CorrectionForm = {
  row: TimebookRow;

  clock_in: string;
  clock_out: string;
  break_minutes: string;
  reason: string;
};


const inputClass =
  "h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-foreground";


function today() {
  return new Date()
    .toISOString()
    .slice(
      0,
      10
    );
}


function monthStart() {
  const now =
    new Date();

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(
    2,
    "0"
  )}-01`;
}


function money(
  value:
    number
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
      value ||
      0
    )
  );
}


function dateLabel(
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

      year:
        "numeric",
    }
  );
}


function shortTime(
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


function templateTime(
  value:
    string | null
) {
  if (!value) {
    return "—";
  }


  return value.slice(
    0,
    5
  );
}


function minutesLabel(
  minutes:
    number
) {
  const value =
    Math.max(
      0,
      Number(
        minutes ||
        0
      )
    );

  const hours =
    Math.floor(
      value /
      60
    );

  const remaining =
    value %
    60;


  return `${hours}h ${String(
    remaining
  ).padStart(
    2,
    "0"
  )}m`;
}


function datetimeLocal(
  value:
    string | null
) {
  if (!value) {
    return "";
  }


  const date =
    new Date(
      value
    );


  const pad = (
    number:
      number
  ) =>
    String(
      number
    ).padStart(
      2,
      "0"
    );


  return [
    date.getFullYear(),
    "-",
    pad(
      date.getMonth() +
      1
    ),
    "-",
    pad(
      date.getDate()
    ),
    "T",
    pad(
      date.getHours()
    ),
    ":",
    pad(
      date.getMinutes()
    ),
  ].join(
    ""
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
  icon,
}: {
  title: string;
  value: ReactNode;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-background p-5">

      <div className="text-muted-foreground">
        {icon}
      </div>

      <div className="mt-3 text-2xl font-bold">
        {value}
      </div>

      <p className="text-sm text-muted-foreground">
        {title}
      </p>

    </div>
  );
}


function StatusBadge({
  status,
}: {
  status: string;
}) {
  const className =
    status ===
      "absent"
      ? "bg-red-100 text-red-800"
      : status ===
          "late"
        ? "bg-amber-100 text-amber-800"
        : status ===
            "clocked_in"
          ? "bg-blue-100 text-blue-800"
          : status ===
              "completed"
            ? "bg-emerald-100 text-emerald-800"
            : status ===
                "scheduled"
              ? "bg-muted text-foreground"
              : "bg-muted text-muted-foreground";


  return (
    <span
      className={[
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
        className,
      ].join(
        " "
      )}
    >
      {
        status.replaceAll(
          "_",
          " "
        )
      }
    </span>
  );
}


export default function HrTimebookPage() {
  const router =
    useRouter();


  const [
    workspace,
    setWorkspace,
  ] =
    useState<TimebookWorkspace | null>(
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


  const [
    branchId,
    setBranchId,
  ] =
    useState(
      ""
    );


  const [
    employeeId,
    setEmployeeId,
  ] =
    useState(
      ""
    );


  const [
    startDate,
    setStartDate,
  ] =
    useState(
      monthStart()
    );


  const [
    endDate,
    setEndDate,
  ] =
    useState(
      today()
    );


  const [
    reviewDate,
    setReviewDate,
  ] =
    useState(
      today()
    );


  const [
    correction,
    setCorrection,
  ] =
    useState<CorrectionForm | null>(
      null
    );


  async function load() {
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
      router.push(
        "/login"
      );

      return;
    }


    const {
      data,
      error:
        rpcError,
    } =
      await supabase.rpc(
        "get_hr_timebook_workspace",
        {
          p_branch_id:
            branchId ||
            null,

          p_start_date:
            startDate,

          p_end_date:
            endDate,

          p_employee_id:
            employeeId ||
            null,
        }
      );


    if (rpcError) {
      throw rpcError;
    }


    setWorkspace(
      data as TimebookWorkspace
    );
  }


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
              : "Unable to load the digital time book."
          );

        } finally {
          setLoading(
            false
          );
        }
      }


      void start();
    },
    []
  );


  const visibleRows =
    useMemo(
      () =>
        workspace?.rows ??
        [],
      [
        workspace,
      ]
    );


  async function refresh() {
    setBusy(
      "refresh"
    );

    setError(
      ""
    );

    setSuccess(
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
          : "Unable to refresh time book."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  async function runAttendanceReview() {
    if (
      !workspace?.can_review
    ) {
      return;
    }


    setBusy(
      "review"
    );

    setError(
      ""
    );

    setSuccess(
      ""
    );


    try {
      const {
        error:
          rpcError,
      } =
        await supabase.rpc(
          "run_hr_attendance_review",
          {
            p_date:
              reviewDate,

            p_branch_id:
              branchId ||
              null,
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      setSuccess(
        `Attendance review completed for ${reviewDate}.`
      );


      await load();

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Attendance review failed."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  function openCorrection(
    row:
      TimebookRow
  ) {
    if (
      !row.time_entry_id
    ) {
      setError(
        "There is no attendance entry to correct for this row."
      );

      return;
    }


    setCorrection({
      row,

      clock_in:
        datetimeLocal(
          row.first_clock_in
        ),

      clock_out:
        datetimeLocal(
          row.last_clock_out
        ),

      break_minutes:
        String(
          row.total_break_minutes ??
          0
        ),

      reason:
        "",
    });


    setError(
      ""
    );

    setSuccess(
      ""
    );
  }


  async function saveCorrection() {
    if (
      !correction ||
      !correction.row.time_entry_id
    ) {
      return;
    }


    if (
      correction.reason.trim().length <
      5
    ) {
      setError(
        "Enter a correction reason of at least 5 characters."
      );

      return;
    }


    setBusy(
      "correction"
    );

    setError(
      ""
    );

    setSuccess(
      ""
    );


    try {
      const {
        error:
          rpcError,
      } =
        await supabase.rpc(
          "adjust_hr_time_entry",
          {
            p_time_entry_id:
              correction.row.time_entry_id,

            p_clock_in_at:
              correction.clock_in
                ? new Date(
                    correction.clock_in
                  ).toISOString()
                : null,

            p_clock_out_at:
              correction.clock_out
                ? new Date(
                    correction.clock_out
                  ).toISOString()
                : null,

            p_break_minutes:
              Number(
                correction.break_minutes
              ),

            p_reason:
              correction.reason.trim(),
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      setSuccess(
        `Attendance record corrected for ${correction.row.employee_name}.`
      );


      setCorrection(
        null
      );


      await load();

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to correct attendance record."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  function exportCsv() {
    if (
      !workspace ||
      visibleRows.length ===
        0
    ) {
      setError(
        "There are no time-book rows to export."
      );

      return;
    }


    const headings = [
      "Date",
      "Employee Number",
      "Employee",
      "Branch",
      "Shift",
      "Required Arrival",
      "Customer Opening",
      "Clock In",
      "Clock Out",
      "Break Minutes",
      "Hours Worked",
      "Late Minutes",
      "Status",
      "No. of Sales",
      "Sales Value",
    ];


    const records =
      visibleRows.map(
        (
          row
        ) => [
          row.work_date,
          row.employee_number,
          row.employee_name,
          row.branch_name,
          row.shift_name ??
            "",
          templateTime(
            row.required_arrival_time
          ),
          templateTime(
            row.customer_open_time
          ),
          shortTime(
            row.first_clock_in,
            workspace.timezone
          ),
          shortTime(
            row.last_clock_out,
            workspace.timezone
          ),
          row.total_break_minutes,
          minutesLabel(
            row.worked_minutes
          ),
          row.late_minutes,
          row.attendance_status,
          row.sales_count,
          Number(
            row.sales_value
          ).toFixed(
            2
          ),
        ]
      );


    const escapeCell = (
      value:
        unknown
    ) =>
      `"${String(
        value ??
        ""
      ).replaceAll(
        '"',
        '""'
      )}"`;


    const csv =
      [
        headings,
        ...records,
      ]
        .map(
          (
            row
          ) =>
            row
              .map(
                escapeCell
              )
              .join(
                ","
              )
        )
        .join(
          "\n"
        );


    const blob =
      new Blob(
        [
          csv,
        ],
        {
          type:
            "text/csv;charset=utf-8",
        }
      );


    const url =
      URL.createObjectURL(
        blob
      );


    const anchor =
      document.createElement(
        "a"
      );


    anchor.href =
      url;

    anchor.download =
      `nexus-timebook-${startDate}-${endDate}.csv`;


    anchor.click();


    URL.revokeObjectURL(
      url
    );
  }


  if (loading) {
    return (
      <DashboardLayout>

        <div className="flex min-h-screen items-center justify-center">

          <p className="text-sm text-muted-foreground">
            Loading Digital Time Book...
          </p>

        </div>

      </DashboardLayout>
    );
  }


  return (
    <DashboardLayout>

      <style>
        {`
          @media print {
            aside,
            nav,
            .no-print {
              display: none !important;
            }

            body {
              background: white !important;
            }

            main {
              max-width: none !important;
              padding: 0 !important;
            }

            .print-card {
              border: 0 !important;
              box-shadow: none !important;
            }

            table {
              font-size: 9px !important;
            }

            th,
            td {
              padding: 5px !important;
            }
          }
        `}
      </style>


      <main className="mx-auto max-w-[1800px] space-y-5 p-4 sm:p-6">

        <div className="flex flex-wrap items-start justify-between gap-4">

          <div>

            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Nexus HR
            </p>

            <h1 className="mt-1 text-2xl font-bold">
              Digital Time Book
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Attendance, working hours, lateness and POS sales activity.
            </p>

          </div>


          <div className="no-print flex flex-wrap gap-2">

            <button
              type="button"
              onClick={
                exportCsv
              }
              className="inline-flex h-10 items-center gap-2 rounded-xl border bg-background px-4 text-sm font-semibold"
            >
              <FileDown className="h-4 w-4" />

              Export CSV
            </button>


            <button
              type="button"
              onClick={
                () =>
                  window.print()
              }
              className="inline-flex h-10 items-center gap-2 rounded-xl border bg-background px-4 text-sm font-semibold"
            >
              <Printer className="h-4 w-4" />

              Print Time Book
            </button>


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
              className="inline-flex h-10 items-center gap-2 rounded-xl border bg-background px-4 text-sm font-semibold disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />

              Refresh
            </button>

          </div>

        </div>


        {error ? (
          <div className="no-print flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">

            <XCircle className="h-5 w-5 shrink-0" />

            {error}

          </div>
        ) : null}


        {success ? (
          <div className="no-print flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">

            <CheckCircle2 className="h-5 w-5 shrink-0" />

            {success}

          </div>
        ) : null}


        {workspace ? (
          <>
            <div className="no-print rounded-2xl border bg-background p-5">

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">

                {workspace.mode ===
                "management" ? (
                  <>
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
                        className={
                          inputClass
                        }
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
                        Employee
                      </span>

                      <select
                        value={
                          employeeId
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeId(
                              event.target.value
                            )
                        }
                        className={
                          inputClass
                        }
                      >
                        <option value="">
                          All employees
                        </option>

                        {workspace.employees.map(
                          (
                            employee
                          ) => (
                            <option
                              key={
                                employee.id
                              }
                              value={
                                employee.id
                              }
                            >
                              {employee.employee_number} · {employee.name}
                            </option>
                          )
                        )}

                      </select>

                    </label>
                  </>
                ) : null}


                <label className="grid gap-1.5 text-sm">

                  <span className="font-medium">
                    From
                  </span>

                  <input
                    type="date"
                    value={
                      startDate
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setStartDate(
                          event.target.value
                        )
                    }
                    className={
                      inputClass
                    }
                  />

                </label>


                <label className="grid gap-1.5 text-sm">

                  <span className="font-medium">
                    To
                  </span>

                  <input
                    type="date"
                    value={
                      endDate
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setEndDate(
                          event.target.value
                        )
                    }
                    className={
                      inputClass
                    }
                  />

                </label>


                <div className="flex items-end">

                  <button
                    type="button"
                    onClick={
                      () =>
                        void refresh()
                    }
                    className="h-11 w-full rounded-xl bg-foreground px-5 text-sm font-bold text-background"
                  >
                    Apply Filters
                  </button>

                </div>

              </div>

            </div>


            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">

              <Stat
                title="Scheduled"
                value={
                  workspace.summary.scheduled_shifts
                }
                icon={
                  <CalendarDays className="h-5 w-5" />
                }
              />


              <Stat
                title="Attended"
                value={
                  workspace.summary.attended_days
                }
                icon={
                  <Users className="h-5 w-5" />
                }
              />


              <Stat
                title="Late"
                value={
                  workspace.summary.late_days
                }
                icon={
                  <Clock3 className="h-5 w-5" />
                }
              />


              <Stat
                title="Absent"
                value={
                  workspace.summary.absent_days
                }
                icon={
                  <AlertTriangle className="h-5 w-5" />
                }
              />


              <Stat
                title="Worked"
                value={
                  minutesLabel(
                    workspace.summary.worked_minutes
                  )
                }
                icon={
                  <Clock3 className="h-5 w-5" />
                }
              />


              <Stat
                title="POS Sales"
                value={
                  workspace.summary.sales_count
                }
                icon={
                  <ShoppingCart className="h-5 w-5" />
                }
              />

            </div>


            {workspace.mode ===
              "management" &&
            workspace.can_review ? (
              <div className="no-print rounded-2xl border bg-background p-5">

                <div className="flex flex-col gap-4 lg:flex-row lg:items-end">

                  <div className="flex-1">

                    <h2 className="font-semibold">
                      Attendance Review
                    </h2>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Nexus checks scheduled staff for absence, lateness, early departure, missing clock-out and excess time.
                    </p>

                  </div>


                  <label className="grid gap-1.5 text-sm">

                    <span className="font-medium">
                      Review date
                    </span>

                    <input
                      type="date"
                      value={
                        reviewDate
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setReviewDate(
                            event.target.value
                          )
                      }
                      className={
                        inputClass
                      }
                    />

                  </label>


                  <button
                    type="button"
                    disabled={
                      busy ===
                      "review"
                    }
                    onClick={
                      () =>
                        void runAttendanceReview()
                    }
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground px-5 text-sm font-bold text-background disabled:opacity-50"
                  >
                    <Wrench className="h-4 w-4" />

                    Run Review
                  </button>

                </div>


                <p className="mt-4 text-sm">
                  Open attendance exceptions:{" "}
                  <strong>
                    {workspace.open_exceptions}
                  </strong>
                </p>

              </div>
            ) : null}


            <section className="print-card rounded-2xl border bg-background">

              <div className="border-b p-5">

                <h2 className="text-lg font-bold">
                  JINLAB NEXUS — TIME BOOK
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  {startDate} → {endDate}
                </p>

              </div>


              {visibleRows.length ===
              0 ? (
                <div className="p-10 text-center">

                  <Clock3 className="mx-auto h-8 w-8 text-muted-foreground" />

                  <p className="mt-3 font-semibold">
                    No attendance records yet
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Schedule employees and let them clock themselves in/out. Records will appear here automatically.
                  </p>

                </div>
              ) : (
                <div className="overflow-x-auto">

                  <table className="w-full min-w-[1450px] text-sm">

                    <thead>

                      <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">

                        <th className="px-4 py-3">
                          Date
                        </th>

                        <th className="px-4 py-3">
                          Employee
                        </th>

                        <th className="px-4 py-3">
                          Shift
                        </th>

                        <th className="px-4 py-3">
                          Required
                        </th>

                        <th className="px-4 py-3">
                          Customers
                        </th>

                        <th className="px-4 py-3">
                          Time In
                        </th>

                        <th className="px-4 py-3">
                          Time Out
                        </th>

                        <th className="px-4 py-3">
                          Break
                        </th>

                        <th className="px-4 py-3">
                          Worked
                        </th>

                        <th className="px-4 py-3">
                          Late
                        </th>

                        <th className="px-4 py-3">
                          Sales
                        </th>

                        <th className="px-4 py-3">
                          Sales Value
                        </th>

                        <th className="px-4 py-3">
                          Status
                        </th>

                        {workspace.can_adjust ? (
                          <th className="no-print px-4 py-3">
                            Action
                          </th>
                        ) : null}

                      </tr>

                    </thead>


                    <tbody>

                      {visibleRows.map(
                        (
                          row
                        ) => (
                          <tr
                            key={
                              `${row.employee_id}-${row.work_date}`
                            }
                            className="border-b last:border-0"
                          >

                            <td className="whitespace-nowrap px-4 py-4">

                              <p className="font-semibold">
                                {dateLabel(
                                  row.work_date
                                )}
                              </p>

                              <p className="text-xs text-muted-foreground">
                                {row.branch_name ||
                                  "—"}
                              </p>

                            </td>


                            <td className="px-4 py-4">

                              <p className="font-semibold">
                                {row.employee_name}
                              </p>

                              <p className="text-xs text-muted-foreground">
                                {row.employee_number}
                              </p>

                            </td>


                            <td className="px-4 py-4">
                              {row.shift_name ||
                                "Unscheduled"}
                            </td>


                            <td className="px-4 py-4 font-semibold">
                              {templateTime(
                                row.required_arrival_time
                              )}
                            </td>


                            <td className="px-4 py-4">
                              {templateTime(
                                row.customer_open_time
                              )}
                            </td>


                            <td className="px-4 py-4 font-semibold">
                              {shortTime(
                                row.first_clock_in,
                                workspace.timezone
                              )}
                            </td>


                            <td className="px-4 py-4 font-semibold">
                              {shortTime(
                                row.last_clock_out,
                                workspace.timezone
                              )}
                            </td>


                            <td className="px-4 py-4">
                              {row.total_break_minutes} min
                            </td>


                            <td className="px-4 py-4 font-semibold">
                              {minutesLabel(
                                row.worked_minutes
                              )}
                            </td>


                            <td className="px-4 py-4">

                              {row.late_minutes >
                              0
                                ? `${row.late_minutes} min`
                                : "—"}

                            </td>


                            <td className="px-4 py-4 font-bold">
                              {row.sales_count}
                            </td>


                            <td className="px-4 py-4">
                              {money(
                                row.sales_value
                              )}
                            </td>


                            <td className="px-4 py-4">

                              <StatusBadge
                                status={
                                  row.attendance_status
                                }
                              />

                            </td>


                            {workspace.can_adjust ? (
                              <td className="no-print px-4 py-4">

                                {row.time_entry_id ? (
                                  <button
                                    type="button"
                                    onClick={
                                      () =>
                                        openCorrection(
                                          row
                                        )
                                    }
                                    className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold"
                                  >
                                    <Wrench className="h-4 w-4" />

                                    Correct
                                  </button>
                                ) : (
                                  "—"
                                )}

                              </td>
                            ) : null}

                          </tr>
                        )
                      )}

                    </tbody>

                  </table>

                </div>
              )}

            </section>


            {correction ? (
              <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">

                <div className="w-full max-w-xl rounded-2xl bg-background shadow-xl">

                  <div className="border-b p-5">

                    <h2 className="font-bold">
                      Correct Attendance
                    </h2>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {correction.row.employee_name}
                      {" · "}
                      {correction.row.work_date}
                    </p>

                  </div>


                  <div className="grid gap-4 p-5">

                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      This does not clock the employee in or out. It corrects an existing attendance record and creates an audit entry.
                    </div>


                    <label className="grid gap-1.5 text-sm">

                      <span className="font-medium">
                        Correct clock-in
                      </span>

                      <input
                        type="datetime-local"
                        value={
                          correction.clock_in
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setCorrection({
                              ...correction,

                              clock_in:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      />

                    </label>


                    <label className="grid gap-1.5 text-sm">

                      <span className="font-medium">
                        Correct clock-out
                      </span>

                      <input
                        type="datetime-local"
                        value={
                          correction.clock_out
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setCorrection({
                              ...correction,

                              clock_out:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      />

                    </label>


                    <label className="grid gap-1.5 text-sm">

                      <span className="font-medium">
                        Break minutes
                      </span>

                      <input
                        type="number"
                        min="0"
                        max="720"
                        value={
                          correction.break_minutes
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setCorrection({
                              ...correction,

                              break_minutes:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      />

                    </label>


                    <label className="grid gap-1.5 text-sm">

                      <span className="font-medium">
                        Correction reason
                      </span>

                      <textarea
                        value={
                          correction.reason
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setCorrection({
                              ...correction,

                              reason:
                                event.target.value,
                            })
                        }
                        placeholder="Example: Employee forgot to clock out; verified against closing procedure."
                        className="min-h-24 rounded-xl border bg-background p-3 text-sm"
                      />

                    </label>


                    <div className="flex flex-wrap justify-end gap-2">

                      <button
                        type="button"
                        onClick={
                          () =>
                            setCorrection(
                              null
                            )
                        }
                        className="h-10 rounded-xl border px-4 text-sm font-semibold"
                      >
                        Cancel
                      </button>


                      <button
                        type="button"
                        disabled={
                          busy ===
                          "correction"
                        }
                        onClick={
                          () =>
                            void saveCorrection()
                        }
                        className="h-10 rounded-xl bg-foreground px-4 text-sm font-bold text-background disabled:opacity-50"
                      >
                        Save Correction
                      </button>

                    </div>

                  </div>

                </div>

              </div>
            ) : null}
          </>
        ) : null}

      </main>

    </DashboardLayout>
  );
}
