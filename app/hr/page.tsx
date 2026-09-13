"use client";

import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  Activity,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
  XCircle,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/lib/supabase";


type Tab =
  | "overview"
  | "employees"
  | "attendance"
  | "leave"
  | "schedule"
  | "organisation"
  | "records";


type Branch = {
  id: string;
  name: string;
};


type Department = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
};


type Position = {
  id: string;
  title: string;
  code: string;
  department_id: string | null;
  is_active: boolean;
};


type LeaveType = {
  id: string;
  code: string;
  name: string;
  is_paid: boolean;
  requires_attachment: boolean;
};


type Employee = {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  employment_type: string;
  hire_date: string;
  standard_hours_per_week: number;
  user_id: string | null;
  branch_id: string | null;
  branch_name: string | null;
  department_id: string | null;
  department_name: string | null;
  position_id: string | null;
  position_title: string | null;
  manager_employee_id: string | null;
  is_clocked_in: boolean;
};


type Attendance = {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_number: string;
  branch_name: string | null;
  work_date: string;
  clock_in_at: string;
  clock_out_at: string | null;
  status: string;
  source: string;
  duration_minutes: number | null;
};


type LeaveRequest = {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_number: string;
  leave_type_id: string;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  calendar_days: number;
  reason: string | null;
  status: string;
  requested_at: string;
  reviewed_at: string | null;
  review_notes: string | null;
};


type HrWorkspace = {
  ok: boolean;
  can_manage_employees: boolean;
  can_manage_attendance: boolean;
  can_approve_leave: boolean;
  own_employee_id: string | null;
  today: string;
  timezone: string;
  branches: Branch[];
  departments: Department[];
  positions: Position[];
  leave_types: LeaveType[];
  summary: {
    active_employees: number;
    clocked_in: number;
    pending_leave: number;
  };
  employees: Employee[];
  today_attendance: Attendance[];
  leave_requests: LeaveRequest[];
};


type ShiftTemplate = {
  id: string;
  name: string;
  code: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  is_active: boolean;
};


type RosterItem = {
  id: string;
  employee_id: string;
  employee_number: string;
  employee_name: string;
  branch_name: string | null;
  shift_name: string;
  shift_date: string;
  planned_start_at: string;
  planned_end_at: string;
  status: string;
};


type AttendanceException = {
  id: string;
  employee_id: string;
  employee_name: string;
  exception_type: string;
  severity: string;
  status: string;
  minutes_variance: number | null;
  details: Record<string, unknown>;
  exception_date: string;
  branch_name: string | null;
};


type LeaveBalance = {
  id: string;
  employee_id: string;
  employee_name: string;
  leave_type: string;
  period_start: string;
  period_end: string;
  opening_units: number;
  accrued_units: number;
  adjustment_units: number;
  used_units: number;
  available_units: number;
};


type OperationsWorkspace = {
  ok: boolean;
  mode: "management" | "self";
  branches: Branch[];
  shift_templates: ShiftTemplate[];
  roster: RosterItem[];
  attendance_exceptions: AttendanceException[];
  leave_balances: LeaveBalance[];
  performance_summary: {
    open_reviews?: number;
    closed_reviews?: number;
  };
  discipline_summary: {
    open_cases?: number;
    closed_cases?: number;
  };
  documents_summary: {
    current?: number;
    expiring_30_days?: number;
  };
};


type NexusRole = {
  id: string;
  role_name: string;
};


type NexusDirectoryUser = {
  user_id: string;
  full_name: string;
  email: string | null;
  role: string;
  employee_id: string | null;
  employee_number: string | null;
  employee_name: string | null;
};


type HrDirectoryMetadata = {
  ok: boolean;
  roles: NexusRole[];
  users: NexusDirectoryUser[];
};


const emptyDirectory: HrDirectoryMetadata = {
  ok: true,
  roles: [],
  users: [],
};


const emptyCore: HrWorkspace = {
  ok: true,
  can_manage_employees: false,
  can_manage_attendance: false,
  can_approve_leave: false,
  own_employee_id: null,
  today: "",
  timezone: "Africa/Johannesburg",
  branches: [],
  departments: [],
  positions: [],
  leave_types: [],
  summary: {
    active_employees: 0,
    clocked_in: 0,
    pending_leave: 0,
  },
  employees: [],
  today_attendance: [],
  leave_requests: [],
};


const emptyOperations: OperationsWorkspace = {
  ok: true,
  mode: "self",
  branches: [],
  shift_templates: [],
  roster: [],
  attendance_exceptions: [],
  leave_balances: [],
  performance_summary: {},
  discipline_summary: {},
  documents_summary: {},
};


function todayIso() {
  return new Date().toISOString().slice(0, 10);
}


function futureIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}


function humanDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}


function humanDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}


function minutesToHours(value: number | null) {
  if (value === null) {
    return "Open";
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  return `${hours}h ${minutes}m`;
}


function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-foreground">
        {label}
      </span>
      {children}
    </label>
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


function StatusBadge({
  value,
}: {
  value: string;
}) {
  const normal =
    value
      .replaceAll("_", " ")
      .toLowerCase();

  const positive =
    [
      "active",
      "approved",
      "completed",
      "resolved",
      "current",
      "acknowledged",
      "closed",
    ].includes(
      value.toLowerCase()
    );

  const warning =
    [
      "pending",
      "open",
      "submitted",
      "issued",
      "scheduled",
      "on_leave",
    ].includes(
      value.toLowerCase()
    );

  return (
    <span
      className={[
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
        positive
          ? "bg-emerald-100 text-emerald-800"
          : warning
            ? "bg-amber-100 text-amber-800"
            : "bg-muted text-muted-foreground",
      ].join(" ")}
    >
      {normal}
    </span>
  );
}


function PrimaryButton({
  children,
  onClick,
  disabled = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}


function SecondaryButton({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border bg-background px-4 py-2 text-sm font-semibold transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}


const inputClass =
  "h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none transition focus:border-foreground";

const textAreaClass =
  "min-h-24 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus:border-foreground";


export default function HrPage() {
  const router =
    useRouter();

  const [
    activeTab,
    setActiveTab,
  ] =
    useState<Tab>(
      "overview"
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
    errorMessage,
    setErrorMessage,
  ] =
    useState(
      ""
    );

  const [
    successMessage,
    setSuccessMessage,
  ] =
    useState(
      ""
    );

  const [
    companyName,
    setCompanyName,
  ] =
    useState(
      ""
    );

  const [
    userName,
    setUserName,
  ] =
    useState(
      ""
    );

  const [
    userRole,
    setUserRole,
  ] =
    useState(
      ""
    );

  const [
    core,
    setCore,
  ] =
    useState<HrWorkspace>(
      emptyCore
    );

  const [
    operations,
    setOperations,
  ] =
    useState<OperationsWorkspace>(
      emptyOperations
    );

  const [
    directory,
    setDirectory,
  ] =
    useState<HrDirectoryMetadata>(
      emptyDirectory
    );


  const [
    branchId,
    setBranchId,
  ] =
    useState(
      ""
    );

  const [
    search,
    setSearch,
  ] =
    useState(
      ""
    );

  const [
    rangeStart,
    setRangeStart,
  ] =
    useState(
      todayIso()
    );

  const [
    rangeEnd,
    setRangeEnd,
  ] =
    useState(
      futureIso(14)
    );


  const [
    employeeForm,
    setEmployeeForm,
  ] =
    useState({
      user_id: "",
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      branch_id: "",
      department_id: "",
      position_id: "",
      employment_type: "permanent",
      hire_date: todayIso(),
      hours: "45",
    });


  const [
    leaveForm,
    setLeaveForm,
  ] =
    useState({
      employee_id: "",
      leave_type_id: "",
      start_date: todayIso(),
      end_date: todayIso(),
      reason: "",
    });


  const [
    departmentForm,
    setDepartmentForm,
  ] =
    useState({
      name: "",
      code: "",
    });


  const [
    positionForm,
    setPositionForm,
  ] =
    useState({
      title: "",
      code: "",
      department_id: "",
    });


  const [
    shiftForm,
    setShiftForm,
  ] =
    useState({
      name: "",
      code: "",
      start_time: "08:00",
      end_time: "17:00",
      break_minutes: "60",
      late_grace_minutes: "5",
      overtime_threshold_minutes: "30",
    });


  const [
    rosterForm,
    setRosterForm,
  ] =
    useState({
      employee_id: "",
      shift_template_id: "",
      shift_date: todayIso(),
      branch_id: "",
      notes: "",
    });


  const [
    performanceForm,
    setPerformanceForm,
  ] =
    useState({
      employee_id: "",
      period_start: todayIso(),
      period_end: todayIso(),
      rating: "3",
      summary: "",
      strengths: "",
      improvement_areas: "",
      goals: "",
    });


  const [
    disciplineForm,
    setDisciplineForm,
  ] =
    useState({
      employee_id: "",
      case_type: "written_warning",
      incident_date: todayIso(),
      summary: "",
      details: "",
      action_taken: "",
      status: "open",
      expiry_date: "",
    });


  const [
    documentForm,
    setDocumentForm,
  ] =
    useState({
      employee_id: "",
      document_type: "contract",
      title: "",
      file_path: "",
      issued_date: todayIso(),
      expiry_date: "",
      notes: "",
    });


  async function loadWorkspace() {
    setErrorMessage("");

    const [
      coreResult,
      operationsResult,
      directoryResult,
    ] =
      await Promise.all([
        supabase.rpc(
          "get_hr_workspace",
          {
            p_branch_id:
              branchId || null,
            p_search:
              search || null,
          }
        ),

        supabase.rpc(
          "get_hr_operations_workspace",
          {
            p_branch_id:
              branchId || null,
            p_start_date:
              rangeStart,
            p_end_date:
              rangeEnd,
          }
        ),

        supabase.rpc(
          "get_hr_directory_metadata"
        ),
      ]);


    if (coreResult.error) {
      throw coreResult.error;
    }

    if (operationsResult.error) {
      throw operationsResult.error;
    }

    if (directoryResult.error) {
      throw directoryResult.error;
    }


    setCore(
      (
        coreResult.data ??
        emptyCore
      ) as HrWorkspace
    );

    setOperations(
      (
        operationsResult.data ??
        emptyOperations
      ) as OperationsWorkspace
    );

    setDirectory(
      (
        directoryResult.data ??
        emptyDirectory
      ) as HrDirectoryMetadata
    );
  }


  useEffect(
    () => {
      async function bootstrap() {
        try {
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
            data: profile,
            error: profileError,
          } =
            await supabase
              .from(
                "user_profile"
              )
              .select(
                "full_name, role, company_id"
              )
              .eq(
                "user_id",
                user.id
              )
              .single();


          if (profileError) {
            throw profileError;
          }


          setUserName(
            profile?.full_name ??
              user.email ??
              "Nexus User"
          );

          setUserRole(
            profile?.role ??
              ""
          );


          if (
            profile?.company_id
          ) {
            const {
              data: company,
              error: companyError,
            } =
              await supabase
                .from(
                  "company"
                )
                .select(
                  "company_name"
                )
                .eq(
                  "id",
                  profile.company_id
                )
                .single();


            if (companyError) {
              throw companyError;
            }


            setCompanyName(
              company?.company_name ??
                ""
            );
          }


          await loadWorkspace();

        } catch (
          error
        ) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load HR."
          );
        } finally {
          setLoading(
            false
          );
        }
      }


      void bootstrap();
    },
    []
  );


  async function refresh() {
    setBusy(
      "refresh"
    );

    try {
      await loadWorkspace();
    } catch (
      error
    ) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to refresh HR."
      );
    } finally {
      setBusy(
        ""
      );
    }
  }


  async function execute(
    key: string,
    functionName: string,
    args: Record<
      string,
      unknown
    >,
    success: string
  ) {
    setBusy(
      key
    );

    setErrorMessage(
      ""
    );

    setSuccessMessage(
      ""
    );


    try {
      const {
        error,
      } =
        await supabase.rpc(
          functionName,
          args
        );


      if (error) {
        throw error;
      }


      setSuccessMessage(
        success
      );


      await loadWorkspace();

    } catch (
      error
    ) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "HR action failed."
      );
    } finally {
      setBusy(
        ""
      );
    }
  }


  async function logout() {
    await supabase.auth.signOut();
    router.push(
      "/login"
    );
  }


  async function createEmployee() {
    await execute(
      "employee-create",
      "create_hr_employee",
      {
        p_first_name:
          employeeForm.first_name,
        p_last_name:
          employeeForm.last_name,
        p_user_id:
          employeeForm.user_id ||
          null,
        p_email:
          employeeForm.email ||
          null,
        p_phone:
          employeeForm.phone ||
          null,
        p_branch_id:
          employeeForm.branch_id ||
          null,
        p_department_id:
          employeeForm.department_id ||
          null,
        p_position_id:
          employeeForm.position_id ||
          null,
        p_manager_employee_id:
          null,
        p_employment_type:
          employeeForm.employment_type,
        p_hire_date:
          employeeForm.hire_date,
        p_standard_hours_per_week:
          Number(
            employeeForm.hours
          ),
      },
      "Employee created successfully."
    );


    setEmployeeForm(
      {
        ...employeeForm,
        user_id: "",
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
      }
    );
  }


  async function clockEmployee(
    employee: Employee
  ) {
    const action =
      employee.is_clocked_in
        ? "clock_out"
        : "clock_in";


    await execute(
      `clock-${employee.id}`,
      "clock_hr_employee",
      {
        p_action:
          action,
        p_employee_id:
          employee.id,
        p_branch_id:
          employee.branch_id ||
          branchId ||
          null,
        p_source:
          "web",
        p_notes:
          null,
      },
      action ===
        "clock_in"
        ? `${employee.full_name} clocked in.`
        : `${employee.full_name} clocked out.`
    );
  }


  async function submitLeave() {
    await execute(
      "leave-submit",
      "submit_hr_leave_request",
      {
        p_leave_type_id:
          leaveForm.leave_type_id,
        p_start_date:
          leaveForm.start_date,
        p_end_date:
          leaveForm.end_date,
        p_reason:
          leaveForm.reason ||
          null,
        p_employee_id:
          leaveForm.employee_id ||
          null,
      },
      "Leave request submitted."
    );


    setLeaveForm(
      {
        ...leaveForm,
        reason: "",
      }
    );
  }


  async function reviewLeave(
    id: string,
    decision:
      | "approved"
      | "rejected"
  ) {
    await execute(
      `leave-${id}`,
      "review_hr_leave_request",
      {
        p_request_id:
          id,
        p_decision:
          decision,
        p_notes:
          null,
      },
      `Leave request ${decision}.`
    );
  }


  async function runAttendanceReview() {
    await execute(
      "attendance-review",
      "run_hr_attendance_review",
      {
        p_date:
          core.today ||
          todayIso(),
        p_branch_id:
          branchId ||
          null,
      },
      "Attendance review completed."
    );
  }


  async function resolveException(
    id: string,
    resolution:
      | "resolved"
      | "dismissed"
  ) {
    await execute(
      `exception-${id}`,
      "resolve_hr_attendance_exception",
      {
        p_exception_id:
          id,
        p_resolution:
          resolution,
        p_notes:
          null,
      },
      `Attendance exception ${resolution}.`
    );
  }


  const ownerOrAdmin =
    [
      "owner",
      "admin",
    ].includes(
      userRole
    );


  const managementMode =
    operations.mode ===
    "management";


  const tabs: {
    id: Tab;
    label: string;
  }[] =
    [
      {
        id:
          "overview",
        label:
          "Overview",
      },
      {
        id:
          "employees",
        label:
          "Employees",
      },
      {
        id:
          "attendance",
        label:
          "Attendance",
      },
      {
        id:
          "leave",
        label:
          "Leave",
      },
      {
        id:
          "schedule",
        label:
          managementMode
            ? "Schedule"
            : "My Schedule",
      },
      {
        id:
          "organisation",
        label:
          "Organisation",
      },
      {
        id:
          "records",
        label:
          "HR Records",
      },
    ];


  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="text-center">
            <Activity className="mx-auto h-8 w-8 animate-pulse" />
            <p className="mt-3 text-sm text-muted-foreground">
              Loading Nexus HR...
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }


  return (
    <DashboardLayout>
      <div className="min-h-screen">

        <header className="border-b bg-background">
          <div className="flex flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Human Resources
              </p>

              <h1 className="mt-1 text-2xl font-bold tracking-tight">
                {companyName || "JINLAB Nexus"}
              </h1>

              <p className="mt-1 text-sm text-muted-foreground">
                Employees, attendance, leave, scheduling and HR records.
              </p>
            </div>


            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold">
                  {userName}
                </p>

                <p className="text-xs capitalize text-muted-foreground">
                  {userRole || "user"} · {operations.mode}
                </p>
              </div>


              <SecondaryButton
                onClick={
                  () =>
                    void refresh()
                }
                disabled={
                  busy ===
                  "refresh"
                }
              >
                <RefreshCw
                  className={[
                    "h-4 w-4",
                    busy ===
                    "refresh"
                      ? "animate-spin"
                      : "",
                  ].join(" ")}
                />
                Refresh
              </SecondaryButton>


              <SecondaryButton
                onClick={
                  () =>
                    void logout()
                }
              >
                <LogOut className="h-4 w-4" />
                Logout
              </SecondaryButton>
            </div>
          </div>


          <div className="overflow-x-auto px-4 sm:px-6">
            <div className="flex min-w-max gap-1">
              {tabs.map(
                (
                  tab
                ) => (
                  <button
                    key={
                      tab.id
                    }
                    type="button"
                    onClick={
                      () =>
                        setActiveTab(
                          tab.id
                        )
                    }
                    className={[
                      "border-b-2 px-4 py-3 text-sm font-semibold transition",
                      activeTab ===
                      tab.id
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    {tab.label}
                  </button>
                )
              )}
            </div>
          </div>
        </header>


        <main className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">

          {errorMessage ? (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>
                {errorMessage}
              </span>
            </div>
          ) : null}


          {successMessage ? (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <span>
                {successMessage}
              </span>
            </div>
          ) : null}


          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr]">
            <Field label="Branch">
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

                {core.branches.map(
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
            </Field>


            <Field label="Employee search">
              <div className="relative">
                <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />

                <input
                  value={
                    search
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setSearch(
                        event.target.value
                      )
                  }
                  placeholder="Name, employee number or email"
                  className={`${inputClass} pl-9`}
                />
              </div>
            </Field>


            <div className="flex items-end">
              <PrimaryButton
                onClick={
                  () =>
                    void refresh()
                }
              >
                <Search className="h-4 w-4" />
                Apply Filters
              </PrimaryButton>
            </div>
          </div>


          {activeTab ===
          "overview" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">

                <div className="rounded-2xl border bg-background p-5">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <p className="mt-4 text-3xl font-bold">
                    {core.summary.active_employees}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Active employees
                  </p>
                </div>


                <div className="rounded-2xl border bg-background p-5">
                  <Clock3 className="h-5 w-5 text-muted-foreground" />
                  <p className="mt-4 text-3xl font-bold">
                    {core.summary.clocked_in}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Clocked in
                  </p>
                </div>


                <div className="rounded-2xl border bg-background p-5">
                  <CalendarDays className="h-5 w-5 text-muted-foreground" />
                  <p className="mt-4 text-3xl font-bold">
                    {core.summary.pending_leave}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Pending leave
                  </p>
                </div>


                <div className="rounded-2xl border bg-background p-5">
                  <ShieldAlert className="h-5 w-5 text-muted-foreground" />
                  <p className="mt-4 text-3xl font-bold">
                    {
                      operations.attendance_exceptions.filter(
                        (
                          item
                        ) =>
                          item.status ===
                          "open"
                      ).length
                    }
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Attendance exceptions
                  </p>
                </div>


                <div className="rounded-2xl border bg-background p-5">
                  <Activity className="h-5 w-5 text-muted-foreground" />
                  <p className="mt-4 text-3xl font-bold">
                    {operations.performance_summary.open_reviews ?? 0}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Open reviews
                  </p>
                </div>


                <div className="rounded-2xl border bg-background p-5">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <p className="mt-4 text-3xl font-bold">
                    {operations.documents_summary.expiring_30_days ?? 0}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Documents expiring
                  </p>
                </div>
              </div>


              <div className="grid gap-5 xl:grid-cols-2">

                <Panel
                  title="Today's attendance"
                  description={`Timezone: ${core.timezone}`}
                >
                  {core.today_attendance.length ===
                  0 ? (
                    <p className="text-sm text-muted-foreground">
                      No attendance entries yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {core.today_attendance.slice(
                        0,
                        8
                      ).map(
                        (
                          item
                        ) => (
                          <div
                            key={
                              item.id
                            }
                            className="flex items-center justify-between gap-4 rounded-xl border p-3"
                          >
                            <div>
                              <p className="font-semibold">
                                {item.employee_name}
                              </p>

                              <p className="text-xs text-muted-foreground">
                                {item.branch_name || "No branch"} · {humanDateTime(item.clock_in_at)}
                              </p>
                            </div>

                            <StatusBadge
                              value={
                                item.status
                              }
                            />
                          </div>
                        )
                      )}
                    </div>
                  )}
                </Panel>


                <Panel
                  title="Upcoming roster"
                  description="Next scheduled shifts in the selected period."
                >
                  {operations.roster.length ===
                  0 ? (
                    <p className="text-sm text-muted-foreground">
                      No scheduled shifts.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {operations.roster.slice(
                        0,
                        8
                      ).map(
                        (
                          item
                        ) => (
                          <div
                            key={
                              item.id
                            }
                            className="flex items-center justify-between gap-4 rounded-xl border p-3"
                          >
                            <div>
                              <p className="font-semibold">
                                {item.employee_name}
                              </p>

                              <p className="text-xs text-muted-foreground">
                                {item.shift_name} · {humanDate(item.shift_date)}
                              </p>
                            </div>

                            <StatusBadge
                              value={
                                item.status
                              }
                            />
                          </div>
                        )
                      )}
                    </div>
                  )}
                </Panel>

              </div>
            </>
          ) : null}


          {activeTab ===
          "employees" ? (
            <div className="grid gap-5 xl:grid-cols-[1fr_360px]">

              <Panel
                title="Employee directory"
                description="Live employee records linked to Nexus HR."
              >
                {core.employees.length ===
                0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center">
                    <Users className="mx-auto h-8 w-8 text-muted-foreground" />

                    <p className="mt-3 font-semibold">
                      No HR employees yet
                    </p>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Create the first employee using the panel on the right.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="pb-3 pr-4">
                            Employee
                          </th>
                          <th className="pb-3 pr-4">
                            Branch
                          </th>
                          <th className="pb-3 pr-4">
                            Position
                          </th>
                          <th className="pb-3 pr-4">
                            Nexus Role
                          </th>

                          <th className="pb-3 pr-4">
                            Type
                          </th>
                          <th className="pb-3 pr-4">
                            Status
                          </th>
                          <th className="pb-3">
                            Time
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {core.employees.map(
                          (
                            employee
                          ) => (
                            <tr
                              key={
                                employee.id
                              }
                              className="border-b last:border-0"
                            >
                              <td className="py-4 pr-4">
                                <p className="font-semibold">
                                  {employee.full_name}
                                </p>

                                <p className="text-xs text-muted-foreground">
                                  {employee.employee_number} · {employee.email || "No email"}
                                </p>
                              </td>

                              <td className="py-4 pr-4">
                                {employee.branch_name || "—"}
                              </td>

                              <td className="py-4 pr-4">
                                {employee.position_title || employee.department_name || "—"}
                              </td>

                              <td className="py-4 pr-4">
                                <span className="font-semibold capitalize">
                                  {
                                    directory.users.find(
                                      (
                                        user
                                      ) =>
                                        user.employee_id ===
                                        employee.id
                                    )?.role ??
                                    "HR only"
                                  }
                                </span>
                              </td>

                              <td className="py-4 pr-4 capitalize">
                                {employee.employment_type.replaceAll("_", " ")}
                              </td>

                              <td className="py-4 pr-4">
                                <StatusBadge
                                  value={
                                    employee.status
                                  }
                                />
                              </td>

                              <td className="py-4">
                                {
                                  (
                                    core.own_employee_id ===
                                      employee.id
                                  ) ? (
                                    <SecondaryButton
                                      disabled={
                                        busy ===
                                        `clock-${employee.id}`
                                      }
                                      onClick={
                                        () =>
                                          void clockEmployee(
                                            employee
                                          )
                                      }
                                    >
                                      <Clock3 className="h-4 w-4" />
                                      {
                                        employee.is_clocked_in
                                          ? "Clock Out"
                                          : "Clock In"
                                      }
                                    </SecondaryButton>
                                  ) : (
                                    employee.is_clocked_in
                                      ? "Clocked in"
                                      : "—"
                                  )
                                }
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>


              {core.can_manage_employees ? (
                <Panel
                  title="Add employee"
                  description="Create a new HR employee profile."
                >
                  <div className="grid gap-4">
                    <Field label="Nexus user / access role">
                      <select
                        value={
                          employeeForm.user_id
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm(
                              {
                                ...employeeForm,
                                user_id:
                                  event.target.value,
                              }
                            )
                        }
                        className={
                          inputClass
                        }
                      >
                        <option value="">
                          HR record only — no Nexus login
                        </option>

                        {
                          directory.users
                            .filter(
                              (
                                user
                              ) =>
                                !user.employee_id
                            )
                            .map(
                              (
                                user
                              ) => (
                                <option
                                  key={
                                    user.user_id
                                  }
                                  value={
                                    user.user_id
                                  }
                                >
                                  {
                                    user.full_name
                                  }
                                  {" · "}
                                  {
                                    user.role
                                  }
                                </option>
                              )
                            )
                        }
                      </select>

                      <span className="text-xs text-muted-foreground">
                        The Nexus access role comes from Users & Permissions.
                      </span>
                    </Field>


                    <Field label="First name">
                      <input
                        value={
                          employeeForm.first_name
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm(
                              {
                                ...employeeForm,
                                first_name:
                                  event.target.value,
                              }
                            )
                        }
                        className={
                          inputClass
                        }
                      />
                    </Field>


                    <Field label="Last name">
                      <input
                        value={
                          employeeForm.last_name
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm(
                              {
                                ...employeeForm,
                                last_name:
                                  event.target.value,
                              }
                            )
                        }
                        className={
                          inputClass
                        }
                      />
                    </Field>


                    <Field label="Email">
                      <input
                        type="email"
                        value={
                          employeeForm.email
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm(
                              {
                                ...employeeForm,
                                email:
                                  event.target.value,
                              }
                            )
                        }
                        className={
                          inputClass
                        }
                      />
                    </Field>


                    <Field label="Phone">
                      <input
                        value={
                          employeeForm.phone
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm(
                              {
                                ...employeeForm,
                                phone:
                                  event.target.value,
                              }
                            )
                        }
                        className={
                          inputClass
                        }
                      />
                    </Field>


                    <Field label="Branch">
                      <select
                        value={
                          employeeForm.branch_id
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm(
                              {
                                ...employeeForm,
                                branch_id:
                                  event.target.value,
                              }
                            )
                        }
                        className={
                          inputClass
                        }
                      >
                        <option value="">
                          No branch
                        </option>

                        {core.branches.map(
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
                    </Field>


                    <Field label="Department">
                      <select
                        value={
                          employeeForm.department_id
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm(
                              {
                                ...employeeForm,
                                department_id:
                                  event.target.value,
                              }
                            )
                        }
                        className={
                          inputClass
                        }
                      >
                        <option value="">
                          None
                        </option>

                        {core.departments.map(
                          (
                            department
                          ) => (
                            <option
                              key={
                                department.id
                              }
                              value={
                                department.id
                              }
                            >
                              {department.name}
                            </option>
                          )
                        )}
                      </select>
                    </Field>


                    <Field label="Position">
                      <select
                        value={
                          employeeForm.position_id
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm(
                              {
                                ...employeeForm,
                                position_id:
                                  event.target.value,
                              }
                            )
                        }
                        className={
                          inputClass
                        }
                      >
                        <option value="">
                          None
                        </option>

                        {core.positions.map(
                          (
                            position
                          ) => (
                            <option
                              key={
                                position.id
                              }
                              value={
                                position.id
                              }
                            >
                              {position.title}
                            </option>
                          )
                        )}
                      </select>
                    </Field>


                    <Field label="Employment type">
                      <select
                        value={
                          employeeForm.employment_type
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm(
                              {
                                ...employeeForm,
                                employment_type:
                                  event.target.value,
                              }
                            )
                        }
                        className={
                          inputClass
                        }
                      >
                        <option value="permanent">
                          Permanent
                        </option>
                        <option value="fixed_term">
                          Fixed term
                        </option>
                        <option value="part_time">
                          Part time
                        </option>
                        <option value="casual">
                          Casual
                        </option>
                        <option value="contractor">
                          Contractor
                        </option>
                        <option value="intern">
                          Intern
                        </option>
                      </select>
                    </Field>


                    <Field label="Hire date">
                      <input
                        type="date"
                        value={
                          employeeForm.hire_date
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm(
                              {
                                ...employeeForm,
                                hire_date:
                                  event.target.value,
                              }
                            )
                        }
                        className={
                          inputClass
                        }
                      />
                    </Field>


                    <Field label="Standard hours / week">
                      <input
                        type="number"
                        value={
                          employeeForm.hours
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm(
                              {
                                ...employeeForm,
                                hours:
                                  event.target.value,
                              }
                            )
                        }
                        className={
                          inputClass
                        }
                      />
                    </Field>


                    <PrimaryButton
                      disabled={
                        !employeeForm.first_name ||
                        !employeeForm.last_name ||
                        busy ===
                          "employee-create"
                      }
                      onClick={
                        () =>
                          void createEmployee()
                      }
                    >
                      <Plus className="h-4 w-4" />
                      Create Employee
                    </PrimaryButton>
                  </div>
                </Panel>
              ) : null}

            </div>
          ) : null}


          {activeTab ===
          "attendance" ? (
            <div className="space-y-5">

              {managementMode ? (
                <div className="flex justify-end">
                  <PrimaryButton
                    disabled={
                      busy ===
                      "attendance-review"
                    }
                    onClick={
                      () =>
                        void runAttendanceReview()
                    }
                  >
                    <Activity className="h-4 w-4" />
                    Run Attendance Review
                  </PrimaryButton>
                </div>
              ) : null}


              <div className="grid gap-5 xl:grid-cols-2">

                <Panel
                  title="Today's time book"
                  description={`Work date ${core.today || todayIso()}`}
                >
                  {core.today_attendance.length ===
                  0 ? (
                    <p className="text-sm text-muted-foreground">
                      No employees have clocked in today.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {core.today_attendance.map(
                        (
                          item
                        ) => (
                          <div
                            key={
                              item.id
                            }
                            className="rounded-xl border p-4"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="font-semibold">
                                  {item.employee_name}
                                </p>

                                <p className="text-xs text-muted-foreground">
                                  {item.employee_number} · {item.branch_name || "No branch"}
                                </p>
                              </div>

                              <StatusBadge
                                value={
                                  item.status
                                }
                              />
                            </div>

                            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  In
                                </p>
                                <p className="font-medium">
                                  {humanDateTime(item.clock_in_at)}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Out
                                </p>
                                <p className="font-medium">
                                  {humanDateTime(item.clock_out_at)}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Worked
                                </p>
                                <p className="font-medium">
                                  {minutesToHours(item.duration_minutes)}
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </Panel>


                <Panel
                  title="Attendance exceptions"
                  description="Absence, lateness, early departure, missing clock-out and overtime."
                >
                  {operations.attendance_exceptions.length ===
                  0 ? (
                    <p className="text-sm text-muted-foreground">
                      No attendance exceptions in this period.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {operations.attendance_exceptions.map(
                        (
                          item
                        ) => (
                          <div
                            key={
                              item.id
                            }
                            className="rounded-xl border p-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold">
                                  {item.employee_name}
                                </p>

                                <p className="mt-1 text-sm capitalize">
                                  {item.exception_type.replaceAll("_", " ")}
                                </p>

                                <p className="mt-1 text-xs text-muted-foreground">
                                  {humanDate(item.exception_date)} · {item.branch_name || "No branch"}
                                </p>
                              </div>

                              <StatusBadge
                                value={
                                  item.status
                                }
                              />
                            </div>

                            {
                              item.status ===
                                "open" &&
                              managementMode
                                ? (
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    <SecondaryButton
                                      onClick={
                                        () =>
                                          void resolveException(
                                            item.id,
                                            "resolved"
                                          )
                                      }
                                    >
                                      <CheckCircle2 className="h-4 w-4" />
                                      Resolve
                                    </SecondaryButton>

                                    <SecondaryButton
                                      onClick={
                                        () =>
                                          void resolveException(
                                            item.id,
                                            "dismissed"
                                          )
                                      }
                                    >
                                      <XCircle className="h-4 w-4" />
                                      Dismiss
                                    </SecondaryButton>
                                  </div>
                                )
                                : null
                            }
                          </div>
                        )
                      )}
                    </div>
                  )}
                </Panel>

              </div>
            </div>
          ) : null}


          {activeTab ===
          "leave" ? (
            <div className="grid gap-5 xl:grid-cols-[380px_1fr]">

              <Panel
                title="Request leave"
                description="Submit leave for approval."
              >
                <div className="grid gap-4">

                  {managementMode ? (
                    <Field label="Employee">
                      <select
                        value={
                          leaveForm.employee_id
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setLeaveForm(
                              {
                                ...leaveForm,
                                employee_id:
                                  event.target.value,
                              }
                            )
                        }
                        className={
                          inputClass
                        }
                      >
                        <option value="">
                          Myself
                        </option>

                        {core.employees.map(
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
                              {employee.full_name}
                            </option>
                          )
                        )}
                      </select>
                    </Field>
                  ) : null}


                  <Field label="Leave type">
                    <select
                      value={
                        leaveForm.leave_type_id
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setLeaveForm(
                            {
                              ...leaveForm,
                              leave_type_id:
                                event.target.value,
                            }
                          )
                      }
                      className={
                        inputClass
                      }
                    >
                      <option value="">
                        Choose leave type
                      </option>

                      {core.leave_types.map(
                        (
                          type
                        ) => (
                          <option
                            key={
                              type.id
                            }
                            value={
                              type.id
                            }
                          >
                            {type.name}
                          </option>
                        )
                      )}
                    </select>
                  </Field>


                  <Field label="Start date">
                    <input
                      type="date"
                      value={
                        leaveForm.start_date
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setLeaveForm(
                            {
                              ...leaveForm,
                              start_date:
                                event.target.value,
                            }
                          )
                      }
                      className={
                        inputClass
                      }
                    />
                  </Field>


                  <Field label="End date">
                    <input
                      type="date"
                      value={
                        leaveForm.end_date
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setLeaveForm(
                            {
                              ...leaveForm,
                              end_date:
                                event.target.value,
                            }
                          )
                      }
                      className={
                        inputClass
                      }
                    />
                  </Field>


                  <Field label="Reason">
                    <textarea
                      value={
                        leaveForm.reason
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setLeaveForm(
                            {
                              ...leaveForm,
                              reason:
                                event.target.value,
                            }
                          )
                      }
                      className={
                        textAreaClass
                      }
                    />
                  </Field>


                  <PrimaryButton
                    disabled={
                      !leaveForm.leave_type_id ||
                      busy ===
                        "leave-submit"
                    }
                    onClick={
                      () =>
                        void submitLeave()
                    }
                  >
                    <CalendarDays className="h-4 w-4" />
                    Submit Leave
                  </PrimaryButton>
                </div>
              </Panel>


              <div className="space-y-5">

                <Panel
                  title="Leave requests"
                  description="Recent employee leave activity."
                >
                  {core.leave_requests.length ===
                  0 ? (
                    <p className="text-sm text-muted-foreground">
                      No leave requests.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {core.leave_requests.map(
                        (
                          request
                        ) => (
                          <div
                            key={
                              request.id
                            }
                            className="rounded-xl border p-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold">
                                  {request.employee_name}
                                </p>

                                <p className="mt-1 text-sm">
                                  {request.leave_type_name} · {request.calendar_days} day(s)
                                </p>

                                <p className="mt-1 text-xs text-muted-foreground">
                                  {humanDate(request.start_date)} → {humanDate(request.end_date)}
                                </p>
                              </div>

                              <StatusBadge
                                value={
                                  request.status
                                }
                              />
                            </div>


                            {request.reason ? (
                              <p className="mt-3 text-sm text-muted-foreground">
                                {request.reason}
                              </p>
                            ) : null}


                            {
                              request.status ===
                                "pending" &&
                              core.can_approve_leave
                                ? (
                                  <div className="mt-4 flex gap-2">
                                    <PrimaryButton
                                      disabled={
                                        busy ===
                                        `leave-${request.id}`
                                      }
                                      onClick={
                                        () =>
                                          void reviewLeave(
                                            request.id,
                                            "approved"
                                          )
                                      }
                                    >
                                      <CheckCircle2 className="h-4 w-4" />
                                      Approve
                                    </PrimaryButton>

                                    <SecondaryButton
                                      disabled={
                                        busy ===
                                        `leave-${request.id}`
                                      }
                                      onClick={
                                        () =>
                                          void reviewLeave(
                                            request.id,
                                            "rejected"
                                          )
                                      }
                                    >
                                      <XCircle className="h-4 w-4" />
                                      Reject
                                    </SecondaryButton>
                                  </div>
                                )
                                : null
                            }
                          </div>
                        )
                      )}
                    </div>
                  )}
                </Panel>


                <Panel
                  title="Leave balances"
                  description="Configured balances minus approved leave."
                >
                  {operations.leave_balances.length ===
                  0 ? (
                    <p className="text-sm text-muted-foreground">
                      No leave balances configured yet.
                    </p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {operations.leave_balances.map(
                        (
                          item
                        ) => (
                          <div
                            key={
                              item.id
                            }
                            className="rounded-xl border p-4"
                          >
                            <p className="font-semibold">
                              {item.employee_name}
                            </p>

                            <p className="text-sm text-muted-foreground">
                              {item.leave_type}
                            </p>

                            <p className="mt-3 text-2xl font-bold">
                              {item.available_units}
                            </p>

                            <p className="text-xs text-muted-foreground">
                              available · {item.used_units} used
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </Panel>

              </div>
            </div>
          ) : null}


          {activeTab ===
          "schedule" ? (
            <div className="space-y-5">

              <div className="grid gap-3 md:hidden">
                <div>
                  <h2 className="text-lg font-bold">
                    {
                      managementMode
                        ? "Mobile Roster"
                        : "My Work Schedule"
                    }
                  </h2>

                  <p className="text-sm text-muted-foreground">
                    Your upcoming work times are available directly on your phone.
                  </p>
                </div>

                {
                  operations.roster.length ===
                  0 ? (
                    <div className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
                      No shifts scheduled in this period.
                    </div>
                  ) : (
                    operations.roster
                      .slice(
                        0,
                        20
                      )
                      .map(
                        (
                          item
                        ) => (
                          <div
                            key={
                              item.id
                            }
                            className="rounded-2xl border bg-background p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  {
                                    humanDate(
                                      item.shift_date
                                    )
                                  }
                                </p>

                                <p className="mt-1 text-lg font-bold">
                                  {
                                    item.shift_name
                                  }
                                </p>

                                {
                                  managementMode && (
                                    <p className="text-sm font-medium">
                                      {
                                        item.employee_name
                                      }
                                    </p>
                                  )
                                }
                              </div>

                              <StatusBadge
                                value={
                                  item.status
                                }
                              />
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3">
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Start
                                </p>

                                <p className="font-semibold">
                                  {
                                    new Date(
                                      item.planned_start_at
                                    ).toLocaleTimeString(
                                      "en-ZA",
                                      {
                                        hour:
                                          "2-digit",
                                        minute:
                                          "2-digit",
                                      }
                                    )
                                  }
                                </p>
                              </div>

                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Finish
                                </p>

                                <p className="font-semibold">
                                  {
                                    new Date(
                                      item.planned_end_at
                                    ).toLocaleTimeString(
                                      "en-ZA",
                                      {
                                        hour:
                                          "2-digit",
                                        minute:
                                          "2-digit",
                                      }
                                    )
                                  }
                                </p>
                              </div>
                            </div>

                            <p className="mt-3 text-xs text-muted-foreground">
                              {
                                item.branch_name ||
                                "No branch"
                              }
                            </p>
                          </div>
                        )
                      )
                  )
                }
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Roster start">
                  <input
                    type="date"
                    value={
                      rangeStart
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setRangeStart(
                          event.target.value
                        )
                    }
                    className={
                      inputClass
                    }
                  />
                </Field>

                <Field label="Roster end">
                  <input
                    type="date"
                    value={
                      rangeEnd
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setRangeEnd(
                          event.target.value
                        )
                    }
                    className={
                      inputClass
                    }
                  />
                </Field>

                <div className="flex items-end">
                  <PrimaryButton
                    onClick={
                      () =>
                        void refresh()
                    }
                  >
                    Refresh Roster
                  </PrimaryButton>
                </div>


                {
                  managementMode ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <PrimaryButton
                        disabled={
                          !branchId ||
                          busy ===
                            "roster-auto"
                        }
                        onClick={
                          () =>
                            void execute(
                              "roster-auto",
                              "generate_hr_roster",
                              {
                                p_branch_id:
                                  branchId,
                                p_start_date:
                                  rangeStart,
                                p_end_date:
                                  rangeEnd,
                                p_shift_template_ids:
                                  null,
                                p_randomize:
                                  true,
                                p_replace_existing:
                                  false,
                              },
                              "Nexus automatically arranged the employee timetable."
                            )
                        }
                      >
                        <Activity className="h-4 w-4" />
                        Auto Arrange
                      </PrimaryButton>


                      <SecondaryButton
                        disabled={
                          !branchId ||
                          busy ===
                            "roster-randomise"
                        }
                        onClick={
                          () => {
                            const approved =
                              window.confirm(
                                "Re-randomise future scheduled shifts in this range? Existing scheduled roster entries for this branch will be replaced."
                              );

                            if (!approved) {
                              return;
                            }

                            void execute(
                              "roster-randomise",
                              "generate_hr_roster",
                              {
                                p_branch_id:
                                  branchId,
                                p_start_date:
                                  rangeStart,
                                p_end_date:
                                  rangeEnd,
                                p_shift_template_ids:
                                  null,
                                p_randomize:
                                  true,
                                p_replace_existing:
                                  true,
                              },
                              "Future timetable re-randomised."
                            );
                          }
                        }
                      >
                        <RefreshCw className="h-4 w-4" />
                        Re-randomise
                      </SecondaryButton>
                    </div>
                  ) : null
                }
              </div>


              {managementMode ? (
                <div className="grid gap-5 xl:grid-cols-2">

                  <Panel
                    title="Create shift template"
                    description="Reusable working-time pattern."
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Shift name">
                        <input
                          value={
                            shiftForm.name
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setShiftForm(
                                {
                                  ...shiftForm,
                                  name:
                                    event.target.value,
                                }
                              )
                          }
                          className={
                            inputClass
                          }
                          placeholder="Normal Day"
                        />
                      </Field>


                      <Field label="Code">
                        <input
                          value={
                            shiftForm.code
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setShiftForm(
                                {
                                  ...shiftForm,
                                  code:
                                    event.target.value,
                                }
                              )
                          }
                          className={
                            inputClass
                          }
                          placeholder="DAY"
                        />
                      </Field>


                      <Field label="Start">
                        <input
                          type="time"
                          value={
                            shiftForm.start_time
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setShiftForm(
                                {
                                  ...shiftForm,
                                  start_time:
                                    event.target.value,
                                }
                              )
                          }
                          className={
                            inputClass
                          }
                        />
                      </Field>


                      <Field label="End">
                        <input
                          type="time"
                          value={
                            shiftForm.end_time
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setShiftForm(
                                {
                                  ...shiftForm,
                                  end_time:
                                    event.target.value,
                                }
                              )
                          }
                          className={
                            inputClass
                          }
                        />
                      </Field>


                      <Field label="Break minutes">
                        <input
                          type="number"
                          value={
                            shiftForm.break_minutes
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setShiftForm(
                                {
                                  ...shiftForm,
                                  break_minutes:
                                    event.target.value,
                                }
                              )
                          }
                          className={
                            inputClass
                          }
                        />
                      </Field>


                      <Field label="Late grace minutes">
                        <input
                          type="number"
                          value={
                            shiftForm.late_grace_minutes
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setShiftForm(
                                {
                                  ...shiftForm,
                                  late_grace_minutes:
                                    event.target.value,
                                }
                              )
                          }
                          className={
                            inputClass
                          }
                        />
                      </Field>


                      <div className="md:col-span-2">
                        <PrimaryButton
                          disabled={
                            !shiftForm.name ||
                            !shiftForm.code ||
                            busy ===
                              "shift-create"
                          }
                          onClick={
                            () =>
                              void execute(
                                "shift-create",
                                "save_hr_shift_template",
                                {
                                  p_id:
                                    null,
                                  p_name:
                                    shiftForm.name,
                                  p_code:
                                    shiftForm.code,
                                  p_start_time:
                                    shiftForm.start_time,
                                  p_end_time:
                                    shiftForm.end_time,
                                  p_break_minutes:
                                    Number(
                                      shiftForm.break_minutes
                                    ),
                                  p_late_grace_minutes:
                                    Number(
                                      shiftForm.late_grace_minutes
                                    ),
                                  p_overtime_threshold_minutes:
                                    Number(
                                      shiftForm.overtime_threshold_minutes
                                    ),
                                  p_is_active:
                                    true,
                                },
                                "Shift template created."
                              )
                          }
                        >
                          <Plus className="h-4 w-4" />
                          Save Shift
                        </PrimaryButton>
                      </div>
                    </div>
                  </Panel>


                  <Panel
                    title="Assign shift"
                    description="Schedule an employee for a date."
                  >
                    <div className="grid gap-4">
                      <Field label="Employee">
                        <select
                          value={
                            rosterForm.employee_id
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setRosterForm(
                                {
                                  ...rosterForm,
                                  employee_id:
                                    event.target.value,
                                }
                              )
                          }
                          className={
                            inputClass
                          }
                        >
                          <option value="">
                            Choose employee
                          </option>

                          {core.employees.map(
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
                                {employee.full_name}
                              </option>
                            )
                          )}
                        </select>
                      </Field>


                      <Field label="Shift">
                        <select
                          value={
                            rosterForm.shift_template_id
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setRosterForm(
                                {
                                  ...rosterForm,
                                  shift_template_id:
                                    event.target.value,
                                }
                              )
                          }
                          className={
                            inputClass
                          }
                        >
                          <option value="">
                            Choose shift
                          </option>

                          {operations.shift_templates.map(
                            (
                              shift
                            ) => (
                              <option
                                key={
                                  shift.id
                                }
                                value={
                                  shift.id
                                }
                              >
                                {shift.name} · {shift.start_time}–{shift.end_time}
                              </option>
                            )
                          )}
                        </select>
                      </Field>


                      <Field label="Date">
                        <input
                          type="date"
                          value={
                            rosterForm.shift_date
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setRosterForm(
                                {
                                  ...rosterForm,
                                  shift_date:
                                    event.target.value,
                                }
                              )
                          }
                          className={
                            inputClass
                          }
                        />
                      </Field>


                      <Field label="Branch">
                        <select
                          value={
                            rosterForm.branch_id
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setRosterForm(
                                {
                                  ...rosterForm,
                                  branch_id:
                                    event.target.value,
                                }
                              )
                          }
                          className={
                            inputClass
                          }
                        >
                          <option value="">
                            Employee primary branch
                          </option>

                          {core.branches.map(
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
                      </Field>


                      <PrimaryButton
                        disabled={
                          !rosterForm.employee_id ||
                          !rosterForm.shift_template_id ||
                          busy ===
                            "shift-assign"
                        }
                        onClick={
                          () =>
                            void execute(
                              "shift-assign",
                              "assign_hr_shift",
                              {
                                p_employee_id:
                                  rosterForm.employee_id,
                                p_shift_template_id:
                                  rosterForm.shift_template_id,
                                p_shift_date:
                                  rosterForm.shift_date,
                                p_branch_id:
                                  rosterForm.branch_id ||
                                  null,
                                p_notes:
                                  rosterForm.notes ||
                                  null,
                              },
                              "Shift assigned."
                            )
                        }
                      >
                        <CalendarDays className="h-4 w-4" />
                        Assign Shift
                      </PrimaryButton>
                    </div>
                  </Panel>

                </div>
              ) : null}


              <Panel
                title="Roster"
                description={`${humanDate(rangeStart)} to ${humanDate(rangeEnd)}`}
              >
                {operations.roster.length ===
                0 ? (
                  <p className="text-sm text-muted-foreground">
                    No shifts scheduled in this period.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="pb-3">
                            Date
                          </th>
                          <th className="pb-3">
                            Employee
                          </th>
                          <th className="pb-3">
                            Shift
                          </th>
                          <th className="pb-3">
                            Branch
                          </th>
                          <th className="pb-3">
                            Start
                          </th>
                          <th className="pb-3">
                            End
                          </th>
                          <th className="pb-3">
                            Status
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {operations.roster.map(
                          (
                            item
                          ) => (
                            <tr
                              key={
                                item.id
                              }
                              className="border-b last:border-0"
                            >
                              <td className="py-4">
                                {humanDate(item.shift_date)}
                              </td>
                              <td className="py-4 font-semibold">
                                {item.employee_name}
                              </td>
                              <td className="py-4">
                                {item.shift_name}
                              </td>
                              <td className="py-4">
                                {item.branch_name || "—"}
                              </td>
                              <td className="py-4">
                                {humanDateTime(item.planned_start_at)}
                              </td>
                              <td className="py-4">
                                {humanDateTime(item.planned_end_at)}
                              </td>
                              <td className="py-4">
                                <StatusBadge
                                  value={
                                    item.status
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
              </Panel>

            </div>
          ) : null}


          {activeTab ===
          "organisation" ? (
            <div className="grid gap-5 xl:grid-cols-2">

              <Panel
                title="Departments"
                description="Organisational departments used by employees and positions."
              >
                {core.can_manage_employees ? (
                  <div className="mb-5 grid gap-3 md:grid-cols-[1fr_180px_auto]">
                    <input
                      value={
                        departmentForm.name
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setDepartmentForm(
                            {
                              ...departmentForm,
                              name:
                                event.target.value,
                            }
                          )
                      }
                      placeholder="Department name"
                      className={
                        inputClass
                      }
                    />

                    <input
                      value={
                        departmentForm.code
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setDepartmentForm(
                            {
                              ...departmentForm,
                              code:
                                event.target.value,
                            }
                          )
                      }
                      placeholder="Code"
                      className={
                        inputClass
                      }
                    />

                    <PrimaryButton
                      disabled={
                        !departmentForm.name ||
                        !departmentForm.code
                      }
                      onClick={
                        () =>
                          void execute(
                            "department-save",
                            "save_hr_department",
                            {
                              p_id:
                                null,
                              p_name:
                                departmentForm.name,
                              p_code:
                                departmentForm.code,
                              p_is_active:
                                true,
                            },
                            "Department created."
                          )
                      }
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </PrimaryButton>
                  </div>
                ) : null}


                <div className="space-y-2">
                  {core.departments.length ===
                  0 ? (
                    <p className="text-sm text-muted-foreground">
                      No departments yet.
                    </p>
                  ) : (
                    core.departments.map(
                      (
                        department
                      ) => (
                        <div
                          key={
                            department.id
                          }
                          className="flex items-center justify-between rounded-xl border p-3"
                        >
                          <div>
                            <p className="font-semibold">
                              {department.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {department.code}
                            </p>
                          </div>

                          <StatusBadge
                            value={
                              department.is_active
                                ? "active"
                                : "inactive"
                            }
                          />
                        </div>
                      )
                    )
                  )}
                </div>
              </Panel>


              <Panel
                title="Positions"
                description="Job positions and department structure."
              >
                {core.can_manage_employees ? (
                  <div className="mb-5 grid gap-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <input
                        value={
                          positionForm.title
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setPositionForm(
                              {
                                ...positionForm,
                                title:
                                  event.target.value,
                              }
                            )
                        }
                        placeholder="Position title"
                        className={
                          inputClass
                        }
                      />

                      <input
                        value={
                          positionForm.code
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setPositionForm(
                              {
                                ...positionForm,
                                code:
                                  event.target.value,
                              }
                            )
                        }
                        placeholder="Code"
                        className={
                          inputClass
                        }
                      />
                    </div>


                    <select
                      value={
                        positionForm.department_id
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setPositionForm(
                            {
                              ...positionForm,
                              department_id:
                                event.target.value,
                            }
                          )
                      }
                      className={
                        inputClass
                      }
                    >
                      <option value="">
                        No department
                      </option>

                      {core.departments.map(
                        (
                          department
                        ) => (
                          <option
                            key={
                              department.id
                            }
                            value={
                              department.id
                            }
                          >
                            {department.name}
                          </option>
                        )
                      )}
                    </select>


                    <PrimaryButton
                      disabled={
                        !positionForm.title ||
                        !positionForm.code
                      }
                      onClick={
                        () =>
                          void execute(
                            "position-save",
                            "save_hr_position",
                            {
                              p_id:
                                null,
                              p_title:
                                positionForm.title,
                              p_code:
                                positionForm.code,
                              p_department_id:
                                positionForm.department_id ||
                                null,
                              p_is_active:
                                true,
                            },
                            "Position created."
                          )
                      }
                    >
                      <Plus className="h-4 w-4" />
                      Add Position
                    </PrimaryButton>
                  </div>
                ) : null}


                <div className="space-y-2">
                  {core.positions.length ===
                  0 ? (
                    <p className="text-sm text-muted-foreground">
                      No positions yet.
                    </p>
                  ) : (
                    core.positions.map(
                      (
                        position
                      ) => (
                        <div
                          key={
                            position.id
                          }
                          className="flex items-center justify-between rounded-xl border p-3"
                        >
                          <div>
                            <p className="font-semibold">
                              {position.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {position.code}
                            </p>
                          </div>

                          <StatusBadge
                            value={
                              position.is_active
                                ? "active"
                                : "inactive"
                            }
                          />
                        </div>
                      )
                    )
                  )}
                </div>
              </Panel>


              <div className="xl:col-span-2">
                <Panel
                  title="Nexus users & HR roles"
                  description="Access roles control what each linked employee can do in Nexus."
                >

                  <div className="flex flex-wrap gap-2">
                    {
                      directory.roles.map(
                        (
                          role
                        ) => (
                          <span
                            key={
                              role.id
                            }
                            className="rounded-full border bg-muted/40 px-3 py-1.5 text-sm font-semibold capitalize"
                          >
                            {
                              role.role_name
                            }
                          </span>
                        )
                      )
                    }
                  </div>


                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[700px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="pb-3 pr-4">
                            Nexus User
                          </th>

                          <th className="pb-3 pr-4">
                            Email
                          </th>

                          <th className="pb-3 pr-4">
                            Access Role
                          </th>

                          <th className="pb-3">
                            HR Employee
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {
                          directory.users.map(
                            (
                              user
                            ) => (
                              <tr
                                key={
                                  user.user_id
                                }
                                className="border-b last:border-0"
                              >
                                <td className="py-4 pr-4 font-semibold">
                                  {
                                    user.full_name
                                  }
                                </td>

                                <td className="py-4 pr-4">
                                  {
                                    user.email ||
                                    "—"
                                  }
                                </td>

                                <td className="py-4 pr-4">
                                  <span className="font-semibold capitalize">
                                    {
                                      user.role
                                    }
                                  </span>
                                </td>

                                <td className="py-4">
                                  {
                                    user.employee_name
                                      ? `${user.employee_name} · ${user.employee_number ?? ""}`
                                      : "Not linked yet"
                                  }
                                </td>
                              </tr>
                            )
                          )
                        }
                      </tbody>
                    </table>
                  </div>

                </Panel>
              </div>

            </div>
          ) : null}


          {activeTab ===
          "records" ? (
            <div className="space-y-5">

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border bg-background p-5">
                  <Activity className="h-5 w-5 text-muted-foreground" />
                  <p className="mt-4 text-3xl font-bold">
                    {operations.performance_summary.open_reviews ?? 0}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Open performance reviews
                  </p>
                </div>

                <div className="rounded-2xl border bg-background p-5">
                  <ShieldAlert className="h-5 w-5 text-muted-foreground" />
                  <p className="mt-4 text-3xl font-bold">
                    {operations.discipline_summary.open_cases ?? 0}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Open disciplinary cases
                  </p>
                </div>

                <div className="rounded-2xl border bg-background p-5">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <p className="mt-4 text-3xl font-bold">
                    {operations.documents_summary.current ?? 0}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Current HR documents
                  </p>
                </div>
              </div>


              {managementMode ? (
                <Panel
                  title="Performance review"
                  description="Record structured employee performance."
                >
                  <div className="grid gap-4 lg:grid-cols-3">
                    <Field label="Employee">
                      <select
                        value={
                          performanceForm.employee_id
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setPerformanceForm(
                              {
                                ...performanceForm,
                                employee_id:
                                  event.target.value,
                              }
                            )
                        }
                        className={
                          inputClass
                        }
                      >
                        <option value="">
                          Choose employee
                        </option>

                        {core.employees.map(
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
                              {employee.full_name}
                            </option>
                          )
                        )}
                      </select>
                    </Field>

                    <Field label="Period start">
                      <input
                        type="date"
                        value={
                          performanceForm.period_start
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setPerformanceForm(
                              {
                                ...performanceForm,
                                period_start:
                                  event.target.value,
                              }
                            )
                        }
                        className={
                          inputClass
                        }
                      />
                    </Field>

                    <Field label="Period end">
                      <input
                        type="date"
                        value={
                          performanceForm.period_end
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setPerformanceForm(
                              {
                                ...performanceForm,
                                period_end:
                                  event.target.value,
                              }
                            )
                        }
                        className={
                          inputClass
                        }
                      />
                    </Field>

                    <Field label="Rating 1–5">
                      <input
                        type="number"
                        min="1"
                        max="5"
                        step="0.5"
                        value={
                          performanceForm.rating
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setPerformanceForm(
                              {
                                ...performanceForm,
                                rating:
                                  event.target.value,
                              }
                            )
                        }
                        className={
                          inputClass
                        }
                      />
                    </Field>

                    <div className="lg:col-span-2">
                      <Field label="Summary">
                        <textarea
                          value={
                            performanceForm.summary
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setPerformanceForm(
                                {
                                  ...performanceForm,
                                  summary:
                                    event.target.value,
                                }
                              )
                          }
                          className={
                            textAreaClass
                          }
                        />
                      </Field>
                    </div>

                    <Field label="Strengths">
                      <textarea
                        value={
                          performanceForm.strengths
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setPerformanceForm(
                              {
                                ...performanceForm,
                                strengths:
                                  event.target.value,
                              }
                            )
                        }
                        className={
                          textAreaClass
                        }
                      />
                    </Field>

                    <Field label="Improvement areas">
                      <textarea
                        value={
                          performanceForm.improvement_areas
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setPerformanceForm(
                              {
                                ...performanceForm,
                                improvement_areas:
                                  event.target.value,
                              }
                            )
                        }
                        className={
                          textAreaClass
                        }
                      />
                    </Field>

                    <Field label="Goals">
                      <textarea
                        value={
                          performanceForm.goals
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setPerformanceForm(
                              {
                                ...performanceForm,
                                goals:
                                  event.target.value,
                              }
                            )
                        }
                        className={
                          textAreaClass
                        }
                      />
                    </Field>

                    <div className="lg:col-span-3">
                      <PrimaryButton
                        disabled={
                          !performanceForm.employee_id ||
                          busy ===
                            "performance-save"
                        }
                        onClick={
                          () =>
                            void execute(
                              "performance-save",
                              "save_hr_performance_review",
                              {
                                p_id:
                                  null,
                                p_employee_id:
                                  performanceForm.employee_id,
                                p_period_start:
                                  performanceForm.period_start,
                                p_period_end:
                                  performanceForm.period_end,
                                p_rating:
                                  Number(
                                    performanceForm.rating
                                  ),
                                p_summary:
                                  performanceForm.summary ||
                                  null,
                                p_strengths:
                                  performanceForm.strengths ||
                                  null,
                                p_improvement_areas:
                                  performanceForm.improvement_areas ||
                                  null,
                                p_goals:
                                  performanceForm.goals ||
                                  null,
                                p_status:
                                  "submitted",
                              },
                              "Performance review saved."
                            )
                        }
                      >
                        Save Performance Review
                      </PrimaryButton>
                    </div>
                  </div>
                </Panel>
              ) : null}


              {ownerOrAdmin ? (
                <div className="grid gap-5 xl:grid-cols-2">

                  <Panel
                    title="Disciplinary record"
                    description="Sensitive owner/admin HR record."
                  >
                    <div className="grid gap-4">
                      <Field label="Employee">
                        <select
                          value={
                            disciplineForm.employee_id
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setDisciplineForm(
                                {
                                  ...disciplineForm,
                                  employee_id:
                                    event.target.value,
                                }
                              )
                          }
                          className={
                            inputClass
                          }
                        >
                          <option value="">
                            Choose employee
                          </option>

                          {core.employees.map(
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
                                {employee.full_name}
                              </option>
                            )
                          )}
                        </select>
                      </Field>


                      <Field label="Case type">
                        <select
                          value={
                            disciplineForm.case_type
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setDisciplineForm(
                                {
                                  ...disciplineForm,
                                  case_type:
                                    event.target.value,
                                }
                              )
                          }
                          className={
                            inputClass
                          }
                        >
                          <option value="counselling">
                            Counselling
                          </option>
                          <option value="verbal_warning">
                            Verbal warning
                          </option>
                          <option value="written_warning">
                            Written warning
                          </option>
                          <option value="final_written_warning">
                            Final written warning
                          </option>
                          <option value="investigation">
                            Investigation
                          </option>
                          <option value="misconduct">
                            Misconduct
                          </option>
                          <option value="other">
                            Other
                          </option>
                        </select>
                      </Field>


                      <Field label="Incident date">
                        <input
                          type="date"
                          value={
                            disciplineForm.incident_date
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setDisciplineForm(
                                {
                                  ...disciplineForm,
                                  incident_date:
                                    event.target.value,
                                }
                              )
                          }
                          className={
                            inputClass
                          }
                        />
                      </Field>


                      <Field label="Summary">
                        <textarea
                          value={
                            disciplineForm.summary
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setDisciplineForm(
                                {
                                  ...disciplineForm,
                                  summary:
                                    event.target.value,
                                }
                              )
                          }
                          className={
                            textAreaClass
                          }
                        />
                      </Field>


                      <Field label="Details">
                        <textarea
                          value={
                            disciplineForm.details
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setDisciplineForm(
                                {
                                  ...disciplineForm,
                                  details:
                                    event.target.value,
                                }
                              )
                          }
                          className={
                            textAreaClass
                          }
                        />
                      </Field>


                      <Field label="Action taken">
                        <textarea
                          value={
                            disciplineForm.action_taken
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setDisciplineForm(
                                {
                                  ...disciplineForm,
                                  action_taken:
                                    event.target.value,
                                }
                              )
                          }
                          className={
                            textAreaClass
                          }
                        />
                      </Field>


                      <PrimaryButton
                        disabled={
                          !disciplineForm.employee_id ||
                          !disciplineForm.summary
                        }
                        onClick={
                          () =>
                            void execute(
                              "discipline-save",
                              "save_hr_disciplinary_case",
                              {
                                p_id:
                                  null,
                                p_employee_id:
                                  disciplineForm.employee_id,
                                p_case_type:
                                  disciplineForm.case_type,
                                p_incident_date:
                                  disciplineForm.incident_date,
                                p_summary:
                                  disciplineForm.summary,
                                p_details:
                                  disciplineForm.details ||
                                  null,
                                p_action_taken:
                                  disciplineForm.action_taken ||
                                  null,
                                p_status:
                                  disciplineForm.status,
                                p_expiry_date:
                                  disciplineForm.expiry_date ||
                                  null,
                              },
                              "Disciplinary record saved."
                            )
                        }
                      >
                        <ShieldAlert className="h-4 w-4" />
                        Save Record
                      </PrimaryButton>
                    </div>
                  </Panel>


                  <Panel
                    title="Employee document"
                    description="Create secure HR document metadata. File upload storage comes in the next document sprint."
                  >
                    <div className="grid gap-4">
                      <Field label="Employee">
                        <select
                          value={
                            documentForm.employee_id
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setDocumentForm(
                                {
                                  ...documentForm,
                                  employee_id:
                                    event.target.value,
                                }
                              )
                          }
                          className={
                            inputClass
                          }
                        >
                          <option value="">
                            Choose employee
                          </option>

                          {core.employees.map(
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
                                {employee.full_name}
                              </option>
                            )
                          )}
                        </select>
                      </Field>


                      <Field label="Document type">
                        <select
                          value={
                            documentForm.document_type
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setDocumentForm(
                                {
                                  ...documentForm,
                                  document_type:
                                    event.target.value,
                                }
                              )
                          }
                          className={
                            inputClass
                          }
                        >
                          <option value="contract">
                            Contract
                          </option>
                          <option value="id_document">
                            ID document
                          </option>
                          <option value="certificate">
                            Certificate
                          </option>
                          <option value="medical_note">
                            Medical note
                          </option>
                          <option value="warning">
                            Warning
                          </option>
                          <option value="performance">
                            Performance
                          </option>
                          <option value="policy_acknowledgement">
                            Policy acknowledgement
                          </option>
                          <option value="other">
                            Other
                          </option>
                        </select>
                      </Field>


                      <Field label="Title">
                        <input
                          value={
                            documentForm.title
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setDocumentForm(
                                {
                                  ...documentForm,
                                  title:
                                    event.target.value,
                                }
                              )
                          }
                          className={
                            inputClass
                          }
                        />
                      </Field>


                      <Field label="Storage reference">
                        <input
                          value={
                            documentForm.file_path
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setDocumentForm(
                                {
                                  ...documentForm,
                                  file_path:
                                    event.target.value,
                                }
                              )
                          }
                          placeholder="Optional for now"
                          className={
                            inputClass
                          }
                        />
                      </Field>


                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label="Issued date">
                          <input
                            type="date"
                            value={
                              documentForm.issued_date
                            }
                            onChange={
                              (
                                event
                              ) =>
                                setDocumentForm(
                                  {
                                    ...documentForm,
                                    issued_date:
                                      event.target.value,
                                  }
                                )
                            }
                            className={
                              inputClass
                            }
                          />
                        </Field>

                        <Field label="Expiry date">
                          <input
                            type="date"
                            value={
                              documentForm.expiry_date
                            }
                            onChange={
                              (
                                event
                              ) =>
                                setDocumentForm(
                                  {
                                    ...documentForm,
                                    expiry_date:
                                      event.target.value,
                                  }
                                )
                            }
                            className={
                              inputClass
                            }
                          />
                        </Field>
                      </div>


                      <Field label="Notes">
                        <textarea
                          value={
                            documentForm.notes
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setDocumentForm(
                                {
                                  ...documentForm,
                                  notes:
                                    event.target.value,
                                }
                              )
                          }
                          className={
                            textAreaClass
                          }
                        />
                      </Field>


                      <PrimaryButton
                        disabled={
                          !documentForm.employee_id ||
                          !documentForm.title
                        }
                        onClick={
                          () =>
                            void execute(
                              "document-save",
                              "save_hr_document_record",
                              {
                                p_id:
                                  null,
                                p_employee_id:
                                  documentForm.employee_id,
                                p_document_type:
                                  documentForm.document_type,
                                p_title:
                                  documentForm.title,
                                p_file_path:
                                  documentForm.file_path ||
                                  null,
                                p_issued_date:
                                  documentForm.issued_date ||
                                  null,
                                p_expiry_date:
                                  documentForm.expiry_date ||
                                  null,
                                p_status:
                                  "current",
                                p_notes:
                                  documentForm.notes ||
                                  null,
                              },
                              "HR document record saved."
                            )
                        }
                      >
                        <FileText className="h-4 w-4" />
                        Save Document Record
                      </PrimaryButton>
                    </div>
                  </Panel>

                </div>
              ) : null}

            </div>
          ) : null}

        </main>
      </div>
    </DashboardLayout>
  );
}
