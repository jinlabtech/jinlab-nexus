"use client";

import SearchableSelect from "@/components/ui/SearchableSelect";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileDown,
  FileText,
  Printer,
  RefreshCw,
  ShieldAlert,
  Star,
  Timer,
  Users,
  XCircle,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/lib/supabase";


type Branch = {
  id: string;
  name: string;
  address: string | null;
};


type Employee = {
  id: string;
  employee_number: string;
  name: string;
  branch_id: string | null;
  status: string;
};


type Company = {
  id: string;
  company_name: string;
  trading_name: string | null;
  registration_number: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logo_path: string | null;
};


type ReportSummary = {
  employees: number;
  scheduled_days: number;
  attended_days: number;
  late_days: number;
  absent_days: number;
  worked_minutes: number;
  approved_leave_days: number;
  sales_count: number;
  sales_value: number;
  average_attendance_rate: number | null;
};


type EmployeeSummary = {
  employee_id: string;
  employee_number: string;
  employee_name: string;
  status: string;
  branch_name: string;

  scheduled_days: number;
  attended_days: number;
  late_days: number;
  absent_days: number;
  worked_minutes: number;

  approved_leave_days: number;
  attendance_rate: number | null;

  sales_count: number;
  sales_value: number;

  performance_reviews: number;
  average_rating: number | null;
};


type AttendanceRow = {
  employee_id: string;
  employee_number: string;
  employee_name: string;
  branch_name: string;

  work_date: string;
  shift_name: string | null;

  planned_start_at: string | null;
  planned_end_at: string | null;

  first_clock_in: string | null;
  last_clock_out: string | null;

  break_minutes: number;
  worked_minutes: number;
  scheduled_minutes: number;

  late_minutes: number;

  attendance_status: string;
};


type LeaveRow = {
  id: string;
  employee_id: string;
  employee_number: string;
  employee_name: string;

  leave_type: string;

  start_date: string;
  end_date: string;

  calendar_days: number;
  days_in_report: number;

  status: string;
  reason: string | null;
};


type PerformanceRow = {
  id: string;
  employee_id: string;
  employee_number: string;
  employee_name: string;

  period_start: string;
  period_end: string;

  rating: number | null;
  status: string;

  summary: string | null;
  goals: string | null;
};


type DocumentRow = {
  id: string;
  employee_id: string;
  employee_number: string;
  employee_name: string;

  document_type: string;
  title: string;

  expiry_date: string | null;
  status: string;
};


type DisciplineRow = {
  id: string;
  employee_id: string;
  employee_number: string;
  employee_name: string;

  case_type: string;
  incident_date: string;
  summary: string;

  status: string;
  expiry_date: string | null;
};


type Workspace = {
  ok: boolean;

  company: Company;

  timezone: string;
  today: string;

  range_start: string;
  range_end: string;

  branches: Branch[];
  employees: Employee[];

  capabilities: {
    documents: boolean;
    discipline: boolean;
  };

  summary: ReportSummary;

  employee_summary: EmployeeSummary[];
  attendance_rows: AttendanceRow[];
  leave_rows: LeaveRow[];
  performance_rows: PerformanceRow[];
  document_rows: DocumentRow[];
  discipline_rows: DisciplineRow[];
};


type Tab =
  | "summary"
  | "attendance"
  | "leave"
  | "performance"
  | "compliance";


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
      style: "currency",
      currency: "ZAR",
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
    Math.max(
      0,
      Math.round(
        number(
          value
        )
      )
    );


  const hours =
    Math.floor(
      minutes /
      60
    );


  const remaining =
    minutes %
    60;


  return `${hours}h ${String(
    remaining
  ).padStart(
    2,
    "0"
  )}m`;
}


function dateLabel(
  value: string | null
) {
  if (!value) {
    return "—";
  }


  return new Date(
    `${value.slice(0, 10)}T12:00:00`
  ).toLocaleDateString(
    "en-ZA",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );
}


function dateTimeLabel(
  value: string | null,
  timezone: string
) {
  if (!value) {
    return "—";
  }


  return new Intl.DateTimeFormat(
    "en-ZA",
    {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
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

      <div className="text-muted-foreground">
        {icon}
      </div>


      <p className="mt-3 text-3xl font-bold">
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


function Badge({
  value,
}: {
  value: string;
}) {
  return (
    <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-semibold capitalize">
      {value.replaceAll(
        "_",
        " "
      )}
    </span>
  );
}


export default function HrReportsPage() {
  const [
    workspace,
    setWorkspace,
  ] =
    useState<Workspace | null>(
      null
    );


  const [
    logoUrl,
    setLogoUrl,
  ] =
    useState(
      ""
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
    activeTab,
    setActiveTab,
  ] =
    useState<Tab>(
      "summary"
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
            "get_hr_reports_workspace",
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


        const result =
          data as Workspace;


        setWorkspace(
          result
        );


        if (
          result.company.logo_path
        ) {
          const {
            data:
              signedData,
          } =
            await supabase.storage
              .from(
                "company-logos"
              )
              .createSignedUrl(
                result.company.logo_path,
                600
              );


          setLogoUrl(
            signedData?.signedUrl ??
              ""
          );
        } else {
          setLogoUrl(
            ""
          );
        }
      },
      [
        branchId,
        employeeId,
        startDate,
        endDate,
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
              : "Unable to load HR reports."
          );

        } finally {
          setLoading(
            false
          );
        }
      }


      void start();
    },
    [
      load,
    ]
  );


  const selectedBranch =
    useMemo(
      () =>
        workspace?.branches.find(
          (
            branch
          ) =>
            branch.id ===
            branchId
        ) ??
        null,
      [
        workspace,
        branchId,
      ]
    );


  const selectedEmployee =
    useMemo(
      () =>
        workspace?.employees.find(
          (
            employee
          ) =>
            employee.id ===
            employeeId
        ) ??
        null,
      [
        workspace,
        employeeId,
      ]
    );


  async function recordExport(
    reportType:
      string,
    format:
      "print" |
      "csv"
  ) {
    const {
      error:
        rpcError,
    } =
      await supabase.rpc(
        "record_hr_report_export",
        {
          p_report_type:
            reportType,

          p_format:
            format,

          p_start_date:
            startDate,

          p_end_date:
            endDate,

          p_branch_id:
            branchId ||
            null,

          p_employee_id:
            employeeId ||
            null,
        }
      );


    if (rpcError) {
      throw rpcError;
    }
  }


  async function printPack() {
    setBusy(
      "print"
    );

    setError(
      ""
    );


    try {
      await recordExport(
        "management_pack",
        "print"
      );


      window.print();

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to print HR management pack."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  function csvEscape(
    value:
      unknown
  ) {
    return `"${String(
      value ??
      ""
    ).replaceAll(
      '"',
      '""'
    )}"`;
  }


  function downloadCsv(
    filename:
      string,
    headings:
      string[],
    rows:
      unknown[][]
  ) {
    const csv =
      [
        headings,
        ...rows,
      ]
        .map(
          (
            row
          ) =>
            row
              .map(
                csvEscape
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
      filename;


    anchor.click();


    URL.revokeObjectURL(
      url
    );
  }


  async function exportEmployeeSummary() {
    if (!workspace) {
      return;
    }


    try {
      await recordExport(
        "employee_summary",
        "csv"
      );


      downloadCsv(
        `hr-employee-summary-${startDate}-${endDate}.csv`,
        [
          "Employee Number",
          "Employee",
          "Branch",
          "Status",
          "Scheduled Days",
          "Attended Days",
          "Attendance %",
          "Late Days",
          "Absent Days",
          "Worked Minutes",
          "Approved Leave Days",
          "Sales Count",
          "Sales Value",
          "Performance Reviews",
          "Average Rating",
        ],
        workspace.employee_summary.map(
          (
            row
          ) => [
            row.employee_number,
            row.employee_name,
            row.branch_name,
            row.status,
            row.scheduled_days,
            row.attended_days,
            row.attendance_rate ?? "",
            row.late_days,
            row.absent_days,
            row.worked_minutes,
            row.approved_leave_days,
            row.sales_count,
            row.sales_value,
            row.performance_reviews,
            row.average_rating ?? "",
          ]
        )
      );

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to export employee summary."
      );
    }
  }


  async function exportAttendance() {
    if (!workspace) {
      return;
    }


    try {
      await recordExport(
        "attendance",
        "csv"
      );


      downloadCsv(
        `hr-attendance-${startDate}-${endDate}.csv`,
        [
          "Date",
          "Employee Number",
          "Employee",
          "Branch",
          "Shift",
          "Clock In",
          "Clock Out",
          "Break Minutes",
          "Worked Minutes",
          "Scheduled Minutes",
          "Late Minutes",
          "Status",
        ],
        workspace.attendance_rows.map(
          (
            row
          ) => [
            row.work_date,
            row.employee_number,
            row.employee_name,
            row.branch_name,
            row.shift_name ?? "",
            row.first_clock_in ?? "",
            row.last_clock_out ?? "",
            row.break_minutes,
            row.worked_minutes,
            row.scheduled_minutes,
            row.late_minutes,
            row.attendance_status,
          ]
        )
      );

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to export attendance."
      );
    }
  }


  async function exportLeave() {
    if (!workspace) {
      return;
    }


    try {
      await recordExport(
        "leave",
        "csv"
      );


      downloadCsv(
        `hr-leave-${startDate}-${endDate}.csv`,
        [
          "Employee Number",
          "Employee",
          "Leave Type",
          "Start",
          "End",
          "Calendar Days",
          "Days In Report",
          "Status",
          "Reason",
        ],
        workspace.leave_rows.map(
          (
            row
          ) => [
            row.employee_number,
            row.employee_name,
            row.leave_type,
            row.start_date,
            row.end_date,
            row.calendar_days,
            row.days_in_report,
            row.status,
            row.reason ?? "",
          ]
        )
      );

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to export leave."
      );
    }
  }


  async function exportPerformance() {
    if (!workspace) {
      return;
    }


    try {
      await recordExport(
        "performance",
        "csv"
      );


      downloadCsv(
        `hr-performance-${startDate}-${endDate}.csv`,
        [
          "Employee Number",
          "Employee",
          "Period Start",
          "Period End",
          "Rating",
          "Status",
          "Summary",
          "Goals",
        ],
        workspace.performance_rows.map(
          (
            row
          ) => [
            row.employee_number,
            row.employee_name,
            row.period_start,
            row.period_end,
            row.rating ?? "",
            row.status,
            row.summary ?? "",
            row.goals ?? "",
          ]
        )
      );

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to export performance."
      );
    }
  }


  async function refresh() {
    setBusy(
      "refresh"
    );


    try {
      await load();

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to refresh reports."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  if (loading) {
    return (
      <DashboardLayout>

        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Preparing HR reports...
          </p>
        </div>

      </DashboardLayout>
    );
  }


  return (
    <DashboardLayout>

      <style>
        {`
          .print-only {
            display: none;
          }

          @media print {
            aside,
            nav,
            .no-print,
            .screen-only {
              display: none !important;
            }

            .print-only {
              display: block !important;
            }

            body {
              background: white !important;
              color: black !important;
            }

            main {
              max-width: none !important;
              padding: 0 !important;
            }

            .report-page {
              page-break-after: always;
            }

            .report-page:last-child {
              page-break-after: auto;
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

        <div className="screen-only flex flex-wrap items-start justify-between gap-4">

          <div>

            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Nexus HR
            </p>


            <h1 className="mt-1 text-2xl font-bold">
              HR Reports & Management Packs
            </h1>


            <p className="mt-1 text-sm text-muted-foreground">
              Attendance, leave, performance and compliance reporting.
            </p>

          </div>


          <div className="flex flex-wrap gap-2">

            <button
              type="button"
              disabled={
                busy ===
                "print"
              }
              onClick={
                () =>
                  void printPack()
              }
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-bold text-background disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />

              Print / Save PDF
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
              className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold"
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


        {workspace ? (
          <>
            <div className="screen-only rounded-2xl border bg-background p-5">

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">

                <label className="grid gap-1.5 text-sm">

                  <span className="font-medium">
                    Branch
                  </span>


                  <SearchableSelect searchLabel="Branches"
                    value={
                      branchId
                    }
                    onValueChange={
                      (
                        selectedValue
                      ) =>
                        setBranchId(
                          selectedValue
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

                  </SearchableSelect>

                </label>


                <label className="grid gap-1.5 text-sm">

                  <span className="font-medium">
                    Employee
                  </span>


                  <SearchableSelect searchLabel="Employees"
                    value={
                      employeeId
                    }
                    onValueChange={
                      (
                        selectedValue
                      ) =>
                        setEmployeeId(
                          selectedValue
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

                  </SearchableSelect>

                </label>


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
                    className="h-11 w-full rounded-xl bg-foreground px-4 text-sm font-bold text-background"
                  >
                    Apply
                  </button>

                </div>

              </div>

            </div>


            <div className="screen-only grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

              <Stat
                title="Employees"
                value={
                  workspace.summary.employees
                }
                icon={
                  <Users className="h-5 w-5" />
                }
              />


              <Stat
                title="Attendance"
                value={
                  workspace.summary.average_attendance_rate !==
                  null
                    ? `${workspace.summary.average_attendance_rate}%`
                    : "—"
                }
                description={`${workspace.summary.attended_days} attended`}
                icon={
                  <CheckCircle2 className="h-5 w-5" />
                }
              />


              <Stat
                title="Worked Hours"
                value={
                  minutesLabel(
                    workspace.summary.worked_minutes
                  )
                }
                icon={
                  <Timer className="h-5 w-5" />
                }
              />


              <Stat
                title="Approved Leave"
                value={
                  workspace.summary.approved_leave_days
                }
                description="Days within report period"
                icon={
                  <CalendarDays className="h-5 w-5" />
                }
              />

            </div>


            <div className="screen-only grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

              <Stat
                title="Late Days"
                value={
                  workspace.summary.late_days
                }
                icon={
                  <Timer className="h-5 w-5" />
                }
              />


              <Stat
                title="Absent Days"
                value={
                  workspace.summary.absent_days
                }
                icon={
                  <XCircle className="h-5 w-5" />
                }
              />


              <Stat
                title="POS Sales"
                value={
                  workspace.summary.sales_count
                }
                description={
                  money(
                    workspace.summary.sales_value
                  )
                }
                icon={
                  <BarChart3 className="h-5 w-5" />
                }
              />


              <Stat
                title="Scheduled Days"
                value={
                  workspace.summary.scheduled_days
                }
                icon={
                  <ClipboardList className="h-5 w-5" />
                }
              />

            </div>


            <div className="screen-only overflow-x-auto rounded-2xl border bg-background px-3">

              <div className="flex min-w-max">

                <TabButton
                  active={
                    activeTab ===
                    "summary"
                  }
                  onClick={
                    () =>
                      setActiveTab(
                        "summary"
                      )
                  }
                >
                  Employee Summary
                </TabButton>


                <TabButton
                  active={
                    activeTab ===
                    "attendance"
                  }
                  onClick={
                    () =>
                      setActiveTab(
                        "attendance"
                      )
                  }
                >
                  Attendance
                </TabButton>


                <TabButton
                  active={
                    activeTab ===
                    "leave"
                  }
                  onClick={
                    () =>
                      setActiveTab(
                        "leave"
                      )
                  }
                >
                  Leave
                </TabButton>


                <TabButton
                  active={
                    activeTab ===
                    "performance"
                  }
                  onClick={
                    () =>
                      setActiveTab(
                        "performance"
                      )
                  }
                >
                  Performance
                </TabButton>


                {(workspace.capabilities.documents ||
                  workspace.capabilities.discipline) ? (
                  <TabButton
                    active={
                      activeTab ===
                      "compliance"
                    }
                    onClick={
                      () =>
                        setActiveTab(
                          "compliance"
                        )
                    }
                  >
                    Compliance
                  </TabButton>
                ) : null}

              </div>

            </div>


            <div className="screen-only">

              {activeTab ===
              "summary" ? (
                <EmployeeSummarySection
                  workspace={
                    workspace
                  }
                  onExport={
                    () =>
                      void exportEmployeeSummary()
                  }
                />
              ) : null}


              {activeTab ===
              "attendance" ? (
                <AttendanceSection
                  workspace={
                    workspace
                  }
                  onExport={
                    () =>
                      void exportAttendance()
                  }
                />
              ) : null}


              {activeTab ===
              "leave" ? (
                <LeaveSection
                  workspace={
                    workspace
                  }
                  onExport={
                    () =>
                      void exportLeave()
                  }
                />
              ) : null}


              {activeTab ===
              "performance" ? (
                <PerformanceSection
                  workspace={
                    workspace
                  }
                  onExport={
                    () =>
                      void exportPerformance()
                  }
                />
              ) : null}


              {activeTab ===
              "compliance" ? (
                <ComplianceSection
                  workspace={
                    workspace
                  }
                />
              ) : null}

            </div>


            <div className="print-only">

              <ReportHeader
                workspace={
                  workspace
                }
                logoUrl={
                  logoUrl
                }
                branchName={
                  selectedBranch?.name ??
                  "All Branches"
                }
                employeeName={
                  selectedEmployee?.name ??
                  "All Employees"
                }
              />


              <div className="report-page">

                <ManagementSummary
                  workspace={
                    workspace
                  }
                />

                <EmployeeSummaryTable
                  workspace={
                    workspace
                  }
                />

              </div>


              <div className="report-page">

                <ReportSectionTitle
                  title="Attendance Detail"
                />

                <AttendanceTable
                  workspace={
                    workspace
                  }
                />

              </div>


              <div className="report-page">

                <ReportSectionTitle
                  title="Leave Report"
                />

                <LeaveTable
                  workspace={
                    workspace
                  }
                />


                <div className="mt-8">

                  <ReportSectionTitle
                    title="Performance Report"
                  />

                  <PerformanceTable
                    workspace={
                      workspace
                    }
                  />

                </div>

              </div>


              {(workspace.capabilities.documents ||
                workspace.capabilities.discipline) ? (
                <div className="report-page">

                  <ReportSectionTitle
                    title="HR Compliance"
                  />

                  <ComplianceTables
                    workspace={
                      workspace
                    }
                  />

                </div>
              ) : null}

            </div>
          </>
        ) : null}

      </main>

    </DashboardLayout>
  );
}


function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={[
        "border-b-2 px-4 py-4 text-sm font-semibold",
        active
          ? "border-foreground"
          : "border-transparent text-muted-foreground",
      ].join(
        " "
      )}
    >
      {children}
    </button>
  );
}


function ExportButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold"
    >
      <FileDown className="h-4 w-4" />
      Export CSV
    </button>
  );
}


function EmployeeSummarySection({
  workspace,
  onExport,
}: {
  workspace: Workspace;
  onExport: () => void;
}) {
  return (
    <Panel
      title="Employee Summary"
      description="Attendance, leave, POS activity and performance by employee."
    >

      <div className="mb-4 flex justify-end">

        <ExportButton
          onClick={
            onExport
          }
        />

      </div>


      <EmployeeSummaryTable
        workspace={
          workspace
        }
      />

    </Panel>
  );
}


function EmployeeSummaryTable({
  workspace,
}: {
  workspace: Workspace;
}) {
  if (
    workspace.employee_summary.length ===
    0
  ) {
    return (
      <p className="text-sm text-muted-foreground">
        No employee report data.
      </p>
    );
  }


  return (
    <div className="overflow-x-auto">

      <table className="w-full min-w-[1250px] text-sm">

        <thead>

          <tr className="border-b text-left text-xs uppercase text-muted-foreground">

            <th className="p-3">
              Employee
            </th>

            <th className="p-3">
              Branch
            </th>

            <th className="p-3">
              Scheduled
            </th>

            <th className="p-3">
              Attended
            </th>

            <th className="p-3">
              Attendance
            </th>

            <th className="p-3">
              Late
            </th>

            <th className="p-3">
              Absent
            </th>

            <th className="p-3">
              Worked
            </th>

            <th className="p-3">
              Leave
            </th>

            <th className="p-3">
              Sales
            </th>

            <th className="p-3">
              Performance
            </th>

          </tr>

        </thead>


        <tbody>

          {workspace.employee_summary.map(
            (
              row
            ) => (
              <tr
                key={
                  row.employee_id
                }
                className="border-b last:border-0"
              >

                <td className="p-3">

                  <p className="font-semibold">
                    {row.employee_name}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    {row.employee_number}
                  </p>

                </td>


                <td className="p-3">
                  {row.branch_name ||
                    "—"}
                </td>


                <td className="p-3">
                  {row.scheduled_days}
                </td>


                <td className="p-3">
                  {row.attended_days}
                </td>


                <td className="p-3 font-semibold">
                  {row.attendance_rate !==
                  null
                    ? `${row.attendance_rate}%`
                    : "—"}
                </td>


                <td className="p-3">
                  {row.late_days}
                </td>


                <td className="p-3">
                  {row.absent_days}
                </td>


                <td className="p-3">
                  {minutesLabel(
                    row.worked_minutes
                  )}
                </td>


                <td className="p-3">
                  {row.approved_leave_days}
                </td>


                <td className="p-3">

                  <p className="font-semibold">
                    {row.sales_count}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    {money(
                      row.sales_value
                    )}
                  </p>

                </td>


                <td className="p-3">

                  {row.average_rating !==
                  null ? (
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <Star className="h-3.5 w-3.5" />
                      {row.average_rating}/5
                    </span>
                  ) : (
                    "—"
                  )}

                </td>

              </tr>
            )
          )}

        </tbody>

      </table>

    </div>
  );
}


function AttendanceSection({
  workspace,
  onExport,
}: {
  workspace: Workspace;
  onExport: () => void;
}) {
  return (
    <Panel
      title="Attendance Report"
      description="Scheduled and actual employee attendance."
    >

      <div className="mb-4 flex justify-end">

        <ExportButton
          onClick={
            onExport
          }
        />

      </div>


      <AttendanceTable
        workspace={
          workspace
        }
      />

    </Panel>
  );
}


function AttendanceTable({
  workspace,
}: {
  workspace: Workspace;
}) {
  if (
    workspace.attendance_rows.length ===
    0
  ) {
    return (
      <p className="text-sm text-muted-foreground">
        No attendance entries in this period.
      </p>
    );
  }


  return (
    <div className="overflow-x-auto">

      <table className="w-full min-w-[1200px] text-sm">

        <thead>

          <tr className="border-b text-left text-xs uppercase text-muted-foreground">

            <th className="p-3">
              Date
            </th>

            <th className="p-3">
              Employee
            </th>

            <th className="p-3">
              Shift
            </th>

            <th className="p-3">
              Clock In
            </th>

            <th className="p-3">
              Clock Out
            </th>

            <th className="p-3">
              Worked
            </th>

            <th className="p-3">
              Late
            </th>

            <th className="p-3">
              Status
            </th>

          </tr>

        </thead>


        <tbody>

          {workspace.attendance_rows.map(
            (
              row,
              index
            ) => (
              <tr
                key={
                  `${row.employee_id}-${row.work_date}-${index}`
                }
                className="border-b last:border-0"
              >

                <td className="p-3">
                  {dateLabel(
                    row.work_date
                  )}
                </td>


                <td className="p-3">

                  <p className="font-semibold">
                    {row.employee_name}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    {row.employee_number}
                  </p>

                </td>


                <td className="p-3">
                  {row.shift_name ??
                    "Unscheduled"}
                </td>


                <td className="p-3">
                  {dateTimeLabel(
                    row.first_clock_in,
                    workspace.timezone
                  )}
                </td>


                <td className="p-3">
                  {dateTimeLabel(
                    row.last_clock_out,
                    workspace.timezone
                  )}
                </td>


                <td className="p-3">
                  {minutesLabel(
                    row.worked_minutes
                  )}
                </td>


                <td className="p-3">
                  {row.late_minutes >
                  0
                    ? `${row.late_minutes} min`
                    : "—"}
                </td>


                <td className="p-3">
                  <Badge
                    value={
                      row.attendance_status
                    }
                  />
                </td>

              </tr>
            )
          )}

        </tbody>

      </table>

    </div>
  );
}


function LeaveSection({
  workspace,
  onExport,
}: {
  workspace: Workspace;
  onExport: () => void;
}) {
  return (
    <Panel
      title="Leave Report"
      description="Leave requests overlapping the selected period."
    >

      <div className="mb-4 flex justify-end">

        <ExportButton
          onClick={
            onExport
          }
        />

      </div>


      <LeaveTable
        workspace={
          workspace
        }
      />

    </Panel>
  );
}


function LeaveTable({
  workspace,
}: {
  workspace: Workspace;
}) {
  if (
    workspace.leave_rows.length ===
    0
  ) {
    return (
      <p className="text-sm text-muted-foreground">
        No leave requests in this period.
      </p>
    );
  }


  return (
    <div className="overflow-x-auto">

      <table className="w-full min-w-[1000px] text-sm">

        <thead>

          <tr className="border-b text-left text-xs uppercase text-muted-foreground">

            <th className="p-3">
              Employee
            </th>

            <th className="p-3">
              Leave Type
            </th>

            <th className="p-3">
              Start
            </th>

            <th className="p-3">
              End
            </th>

            <th className="p-3">
              Days
            </th>

            <th className="p-3">
              Status
            </th>

            <th className="p-3">
              Reason
            </th>

          </tr>

        </thead>


        <tbody>

          {workspace.leave_rows.map(
            (
              row
            ) => (
              <tr
                key={
                  row.id
                }
                className="border-b last:border-0"
              >

                <td className="p-3">

                  <p className="font-semibold">
                    {row.employee_name}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    {row.employee_number}
                  </p>

                </td>


                <td className="p-3">
                  {row.leave_type}
                </td>


                <td className="p-3">
                  {dateLabel(
                    row.start_date
                  )}
                </td>


                <td className="p-3">
                  {dateLabel(
                    row.end_date
                  )}
                </td>


                <td className="p-3">
                  {row.days_in_report}
                </td>


                <td className="p-3">
                  <Badge
                    value={
                      row.status
                    }
                  />
                </td>


                <td className="p-3">
                  {row.reason ??
                    "—"}
                </td>

              </tr>
            )
          )}

        </tbody>

      </table>

    </div>
  );
}


function PerformanceSection({
  workspace,
  onExport,
}: {
  workspace: Workspace;
  onExport: () => void;
}) {
  return (
    <Panel
      title="Performance Report"
      description="Performance reviews overlapping this period."
    >

      <div className="mb-4 flex justify-end">

        <ExportButton
          onClick={
            onExport
          }
        />

      </div>


      <PerformanceTable
        workspace={
          workspace
        }
      />

    </Panel>
  );
}


function PerformanceTable({
  workspace,
}: {
  workspace: Workspace;
}) {
  if (
    workspace.performance_rows.length ===
    0
  ) {
    return (
      <p className="text-sm text-muted-foreground">
        No performance reviews in this period.
      </p>
    );
  }


  return (
    <div className="overflow-x-auto">

      <table className="w-full min-w-[1050px] text-sm">

        <thead>

          <tr className="border-b text-left text-xs uppercase text-muted-foreground">

            <th className="p-3">
              Employee
            </th>

            <th className="p-3">
              Period
            </th>

            <th className="p-3">
              Rating
            </th>

            <th className="p-3">
              Status
            </th>

            <th className="p-3">
              Summary
            </th>

            <th className="p-3">
              Goals
            </th>

          </tr>

        </thead>


        <tbody>

          {workspace.performance_rows.map(
            (
              row
            ) => (
              <tr
                key={
                  row.id
                }
                className="border-b last:border-0"
              >

                <td className="p-3">

                  <p className="font-semibold">
                    {row.employee_name}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    {row.employee_number}
                  </p>

                </td>


                <td className="p-3">
                  {dateLabel(
                    row.period_start
                  )}
                  {" → "}
                  {dateLabel(
                    row.period_end
                  )}
                </td>


                <td className="p-3">
                  {row.rating !==
                  null
                    ? `${row.rating}/5`
                    : "—"}
                </td>


                <td className="p-3">
                  <Badge
                    value={
                      row.status
                    }
                  />
                </td>


                <td className="p-3">
                  {row.summary ??
                    "—"}
                </td>


                <td className="p-3">
                  {row.goals ??
                    "—"}
                </td>

              </tr>
            )
          )}

        </tbody>

      </table>

    </div>
  );
}


function ComplianceSection({
  workspace,
}: {
  workspace: Workspace;
}) {
  return (
    <Panel
      title="HR Compliance"
      description="Expiring documents and active disciplinary records."
    >

      <ComplianceTables
        workspace={
          workspace
        }
      />

    </Panel>
  );
}


function ComplianceTables({
  workspace,
}: {
  workspace: Workspace;
}) {
  return (
    <div className="space-y-8">

      {workspace.capabilities.documents ? (
        <div>

          <h3 className="font-semibold">
            Documents Expiring
          </h3>


          {workspace.document_rows.length ===
          0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No current employee documents expiring within the reporting window.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">

              <table className="w-full min-w-[850px] text-sm">

                <thead>

                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">

                    <th className="p-3">
                      Employee
                    </th>

                    <th className="p-3">
                      Document
                    </th>

                    <th className="p-3">
                      Type
                    </th>

                    <th className="p-3">
                      Expiry
                    </th>

                    <th className="p-3">
                      Status
                    </th>

                  </tr>

                </thead>


                <tbody>

                  {workspace.document_rows.map(
                    (
                      row
                    ) => (
                      <tr
                        key={
                          row.id
                        }
                        className="border-b last:border-0"
                      >

                        <td className="p-3">
                          {row.employee_name}
                        </td>


                        <td className="p-3 font-semibold">
                          {row.title}
                        </td>


                        <td className="p-3 capitalize">
                          {row.document_type.replaceAll(
                            "_",
                            " "
                          )}
                        </td>


                        <td className="p-3">
                          {dateLabel(
                            row.expiry_date
                          )}
                        </td>


                        <td className="p-3">
                          <Badge
                            value={
                              row.status
                            }
                          />
                        </td>

                      </tr>
                    )
                  )}

                </tbody>

              </table>

            </div>
          )}

        </div>
      ) : null}


      {workspace.capabilities.discipline ? (
        <div>

          <h3 className="font-semibold">
            Active Disciplinary Records
          </h3>


          {workspace.discipline_rows.length ===
          0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No active disciplinary records.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">

              <table className="w-full min-w-[900px] text-sm">

                <thead>

                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">

                    <th className="p-3">
                      Employee
                    </th>

                    <th className="p-3">
                      Case
                    </th>

                    <th className="p-3">
                      Incident
                    </th>

                    <th className="p-3">
                      Summary
                    </th>

                    <th className="p-3">
                      Expiry
                    </th>

                    <th className="p-3">
                      Status
                    </th>

                  </tr>

                </thead>


                <tbody>

                  {workspace.discipline_rows.map(
                    (
                      row
                    ) => (
                      <tr
                        key={
                          row.id
                        }
                        className="border-b last:border-0"
                      >

                        <td className="p-3">
                          {row.employee_name}
                        </td>


                        <td className="p-3 capitalize">
                          {row.case_type.replaceAll(
                            "_",
                            " "
                          )}
                        </td>


                        <td className="p-3">
                          {dateLabel(
                            row.incident_date
                          )}
                        </td>


                        <td className="p-3">
                          {row.summary}
                        </td>


                        <td className="p-3">
                          {dateLabel(
                            row.expiry_date
                          )}
                        </td>


                        <td className="p-3">
                          <Badge
                            value={
                              row.status
                            }
                          />
                        </td>

                      </tr>
                    )
                  )}

                </tbody>

              </table>

            </div>
          )}

        </div>
      ) : null}

    </div>
  );
}


function ReportHeader({
  workspace,
  logoUrl,
  branchName,
  employeeName,
}: {
  workspace: Workspace;
  logoUrl: string;
  branchName: string;
  employeeName: string;
}) {
  return (
    <div className="mb-8 border-b-2 border-black pb-5">

      <div className="flex items-start justify-between gap-5">

        <div>

          {logoUrl ? (
            <img
              src={
                logoUrl
              }
              alt=""
              className="mb-3 h-14 w-auto object-contain"
            />
          ) : null}


          <h1 className="text-2xl font-bold">
            {workspace.company.company_name}
          </h1>


          <p className="text-sm">
            HR MANAGEMENT PACK
          </p>

        </div>


        <div className="text-right text-xs">

          <p>
            Period: {workspace.range_start} → {workspace.range_end}
          </p>

          <p>
            Branch: {branchName}
          </p>

          <p>
            Employee: {employeeName}
          </p>

          <p>
            Generated: {workspace.today}
          </p>

        </div>

      </div>

    </div>
  );
}


function ManagementSummary({
  workspace,
}: {
  workspace: Workspace;
}) {
  return (
    <div className="mb-8">

      <ReportSectionTitle
        title="Management Summary"
      />


      <div className="grid grid-cols-4 gap-3">

        <PrintStat
          label="Employees"
          value={
            workspace.summary.employees
          }
        />


        <PrintStat
          label="Scheduled Days"
          value={
            workspace.summary.scheduled_days
          }
        />


        <PrintStat
          label="Attended"
          value={
            workspace.summary.attended_days
          }
        />


        <PrintStat
          label="Attendance"
          value={
            workspace.summary.average_attendance_rate !==
            null
              ? `${workspace.summary.average_attendance_rate}%`
              : "—"
          }
        />


        <PrintStat
          label="Late Days"
          value={
            workspace.summary.late_days
          }
        />


        <PrintStat
          label="Absent Days"
          value={
            workspace.summary.absent_days
          }
        />


        <PrintStat
          label="Worked"
          value={
            minutesLabel(
              workspace.summary.worked_minutes
            )
          }
        />


        <PrintStat
          label="Leave Days"
          value={
            workspace.summary.approved_leave_days
          }
        />

      </div>

    </div>
  );
}


function PrintStat({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="border border-black p-3">

      <p className="text-xs">
        {label}
      </p>


      <p className="mt-1 text-xl font-bold">
        {value}
      </p>

    </div>
  );
}


function ReportSectionTitle({
  title,
}: {
  title: string;
}) {
  return (
    <h2 className="mb-3 border-b border-black pb-2 text-lg font-bold">
      {title}
    </h2>
  );
}
