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
  CalendarDays,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Save,
  ShieldCheck,
  UserCog,
  Users,
  XCircle,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/lib/supabase";


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
  today_attendance: unknown[];
  leave_requests: LeaveRequest[];
};


type DirectoryUser = {
  user_id: string;
  full_name: string;
  email: string | null;
  role: string;
  employee_id: string | null;
  employee_number: string | null;
  employee_name: string | null;
};


type DirectoryData = {
  ok: boolean;
  roles: {
    id: string;
    role_name: string;
  }[];
  users: DirectoryUser[];
};


type Availability = {
  id?: string;
  day_of_week: number;
  is_available: boolean;
  available_from: string | null;
  available_to: string | null;
  notes: string | null;
};


type LeaveBalance = {
  id: string;
  leave_type_id: string;
  leave_type_name: string;
  period_start: string;
  period_end: string;
  opening_units: number;
  accrued_units: number;
  adjustment_units: number;
  used_units: number;
  available_units: number;
  notes: string | null;
};


type EmployeeManagement = {
  ok: boolean;
  can_manage_employee: boolean;
  can_manage_schedule: boolean;
  can_manage_leave: boolean;

  employee: {
    id: string;
    employee_number: string;
    first_name: string;
    last_name: string;
    preferred_name: string | null;
    email: string | null;
    phone: string | null;
    user_id: string | null;
    primary_branch_id: string | null;
    department_id: string | null;
    position_id: string | null;
    manager_employee_id: string | null;
    employment_type: string;
    status: string;
    hire_date: string;
    end_date: string | null;
    standard_hours_per_week: number;
    internal_notes: string | null;
  };

  availability: Availability[];

  leave_balances: LeaveBalance[];
};


const dayNames = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];


const inputClass =
  "h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-foreground";

const textareaClass =
  "min-h-24 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:border-foreground";


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


function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">
        {label}
      </span>

      {children}
    </label>
  );
}


function PrimaryButton({
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
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50"
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
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border bg-background px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}


function StatusBadge({
  value,
}: {
  value: string;
}) {
  return (
    <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-semibold capitalize">
      {value.replaceAll("_", " ")}
    </span>
  );
}


function currentYearStart() {
  return `${new Date().getFullYear()}-01-01`;
}


function currentYearEnd() {
  return `${new Date().getFullYear()}-12-31`;
}


export default function HrManagementPage() {
  const router =
    useRouter();

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
    userRole,
    setUserRole,
  ] =
    useState(
      ""
    );

  const [
    workspace,
    setWorkspace,
  ] =
    useState<HrWorkspace | null>(
      null
    );

  const [
    directory,
    setDirectory,
  ] =
    useState<DirectoryData | null>(
      null
    );

  const [
    selectedEmployeeId,
    setSelectedEmployeeId,
  ] =
    useState(
      ""
    );

  const [
    details,
    setDetails,
  ] =
    useState<EmployeeManagement | null>(
      null
    );


  const [
    employeeForm,
    setEmployeeForm,
  ] =
    useState({
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      user_id: "",
      primary_branch_id: "",
      department_id: "",
      position_id: "",
      manager_employee_id: "",
      employment_type: "permanent",
      status: "active",
      hire_date: "",
      end_date: "",
      standard_hours_per_week: "45",
      internal_notes: "",
    });


  const [
    availability,
    setAvailability,
  ] =
    useState<Availability[]>(
      []
    );


  const [
    leaveForm,
    setLeaveForm,
  ] =
    useState({
      leave_type_id: "",
      period_start: currentYearStart(),
      period_end: currentYearEnd(),
      opening_units: "0",
      accrued_units: "0",
      adjustment_units: "0",
      notes: "",
    });


  async function loadMain() {
    setError("");

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
      data:
        profile,
      error:
        profileError,
    } =
      await supabase
        .from(
          "user_profile"
        )
        .select(
          "role"
        )
        .eq(
          "user_id",
          user.id
        )
        .single();


    if (profileError) {
      throw profileError;
    }


    setUserRole(
      profile?.role ??
      ""
    );


    const [
      workspaceResult,
      directoryResult,
    ] =
      await Promise.all([
        supabase.rpc(
          "get_hr_workspace",
          {
            p_branch_id:
              null,

            p_search:
              null,
          }
        ),

        supabase.rpc(
          "get_hr_directory_metadata"
        ),
      ]);


    if (workspaceResult.error) {
      throw workspaceResult.error;
    }


    if (directoryResult.error) {
      throw directoryResult.error;
    }


    const nextWorkspace =
      workspaceResult.data as HrWorkspace;

    const nextDirectory =
      directoryResult.data as DirectoryData;


    setWorkspace(
      nextWorkspace
    );

    setDirectory(
      nextDirectory
    );


    if (
      !selectedEmployeeId &&
      nextWorkspace.employees.length >
        0
    ) {
      setSelectedEmployeeId(
        nextWorkspace.employees[0].id
      );
    }
  }


  async function loadEmployee(
    employeeId:
      string
  ) {
    if (!employeeId) {
      setDetails(
        null
      );

      return;
    }


    setBusy(
      "load-employee"
    );

    setError(
      ""
    );


    try {
      const {
        data,
        error:
          rpcError,
      } =
        await supabase.rpc(
          "get_hr_employee_management",
          {
            p_employee_id:
              employeeId,
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      const result =
        data as EmployeeManagement;


      setDetails(
        result
      );


      setEmployeeForm({
        first_name:
          result.employee.first_name ??
          "",

        last_name:
          result.employee.last_name ??
          "",

        email:
          result.employee.email ??
          "",

        phone:
          result.employee.phone ??
          "",

        user_id:
          result.employee.user_id ??
          "",

        primary_branch_id:
          result.employee.primary_branch_id ??
          "",

        department_id:
          result.employee.department_id ??
          "",

        position_id:
          result.employee.position_id ??
          "",

        manager_employee_id:
          result.employee.manager_employee_id ??
          "",

        employment_type:
          result.employee.employment_type,

        status:
          result.employee.status,

        hire_date:
          result.employee.hire_date ??
          "",

        end_date:
          result.employee.end_date ??
          "",

        standard_hours_per_week:
          String(
            result.employee.standard_hours_per_week ??
            45
          ),

        internal_notes:
          result.employee.internal_notes ??
          "",
      });


      const rows =
        dayNames.map(
          (
            _,
            index
          ) => {
            const day =
              index +
              1;

            const existing =
              result.availability.find(
                (
                  item
                ) =>
                  item.day_of_week ===
                  day
              );


            if (existing) {
              return existing;
            }


            return {
              day_of_week:
                day,

              is_available:
                day <=
                5,

              available_from:
                day <=
                5
                  ? "08:00"
                  : null,

              available_to:
                day <=
                5
                  ? "17:30"
                  : null,

              notes:
                null,
            };
          }
        );


      setAvailability(
        rows
      );

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load employee management information."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  useEffect(
    () => {
      async function start() {
        try {
          await loadMain();

        } catch (
          caught
        ) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load HR management."
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


  useEffect(
    () => {
      if (
        selectedEmployeeId
      ) {
        void loadEmployee(
          selectedEmployeeId
        );
      }
    },
    [
      selectedEmployeeId,
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
            selectedEmployeeId
        ) ??
        null,
      [
        workspace,
        selectedEmployeeId,
      ]
    );


  const selectedNexusRole =
    useMemo(
      () => {
        if (
          !directory ||
          !details?.employee.user_id
        ) {
          return "HR only";
        }


        return (
          directory.users.find(
            (
              user
            ) =>
              user.user_id ===
              details.employee.user_id
          )?.role ??
          "HR only"
        );
      },
      [
        directory,
        details,
      ]
    );


  async function refreshAll() {
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
      await loadMain();

      if (
        selectedEmployeeId
      ) {
        await loadEmployee(
          selectedEmployeeId
        );
      }

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to refresh."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  async function saveEmployee() {
    if (
      !details?.can_manage_employee
    ) {
      return;
    }


    setBusy(
      "employee"
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
          "update_hr_employee",
          {
            p_employee_id:
              selectedEmployeeId,

            p_patch: {
              first_name:
                employeeForm.first_name,

              last_name:
                employeeForm.last_name,

              email:
                employeeForm.email,

              phone:
                employeeForm.phone,

              user_id:
                employeeForm.user_id,

              primary_branch_id:
                employeeForm.primary_branch_id,

              department_id:
                employeeForm.department_id,

              position_id:
                employeeForm.position_id,

              manager_employee_id:
                employeeForm.manager_employee_id,

              employment_type:
                employeeForm.employment_type,

              status:
                employeeForm.status,

              hire_date:
                employeeForm.hire_date,

              end_date:
                employeeForm.end_date,

              standard_hours_per_week:
                Number(
                  employeeForm.standard_hours_per_week
                ),

              internal_notes:
                employeeForm.internal_notes,
            },
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      setSuccess(
        "Employee profile updated."
      );


      await loadMain();

      await loadEmployee(
        selectedEmployeeId
      );

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update employee."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  async function saveAvailability(
    item:
      Availability
  ) {
    if (
      !details?.can_manage_schedule
    ) {
      return;
    }


    setBusy(
      `availability-${item.day_of_week}`
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
          "save_hr_employee_availability",
          {
            p_employee_id:
              selectedEmployeeId,

            p_day_of_week:
              item.day_of_week,

            p_is_available:
              item.is_available,

            p_available_from:
              item.is_available
                ? item.available_from
                : null,

            p_available_to:
              item.is_available
                ? item.available_to
                : null,

            p_notes:
              item.notes ||
              null,
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      setSuccess(
        `${dayNames[item.day_of_week - 1]} availability updated.`
      );


      await loadEmployee(
        selectedEmployeeId
      );

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update availability."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  async function saveLeaveBalance() {
    if (
      !details?.can_manage_leave
    ) {
      return;
    }


    if (
      !leaveForm.leave_type_id
    ) {
      setError(
        "Choose a leave type."
      );

      return;
    }


    setBusy(
      "leave-balance"
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
          "set_hr_leave_balance",
          {
            p_employee_id:
              selectedEmployeeId,

            p_leave_type_id:
              leaveForm.leave_type_id,

            p_period_start:
              leaveForm.period_start,

            p_period_end:
              leaveForm.period_end,

            p_opening_units:
              Number(
                leaveForm.opening_units
              ),

            p_accrued_units:
              Number(
                leaveForm.accrued_units
              ),

            p_adjustment_units:
              Number(
                leaveForm.adjustment_units
              ),

            p_notes:
              leaveForm.notes ||
              null,
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      setSuccess(
        "Leave balance updated."
      );


      await loadEmployee(
        selectedEmployeeId
      );

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to save leave balance."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  async function cancelLeave(
    requestId:
      string
  ) {
    setBusy(
      `cancel-${requestId}`
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
          "cancel_hr_leave_request",
          {
            p_request_id:
              requestId,

            p_notes:
              "Cancelled from Nexus HR management.",
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      setSuccess(
        "Leave request cancelled."
      );


      await loadMain();

      await loadEmployee(
        selectedEmployeeId
      );

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to cancel leave."
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
        <div className="flex min-h-screen items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">
            Loading HR Management...
          </p>
        </div>
      </DashboardLayout>
    );
  }


  if (!workspace) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-xl p-6">
          <div className="rounded-2xl border bg-background p-6">
            <h1 className="font-bold">
              HR Management
            </h1>

            <p className="mt-3 text-sm text-red-700">
              {error}
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }


  return (
    <DashboardLayout>
      <main className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">

        <div className="flex flex-wrap items-start justify-between gap-4">

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Nexus HR
            </p>

            <h1 className="mt-1 text-2xl font-bold">
              HR Management
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Employee configuration, roles, availability and leave administration.
            </p>
          </div>


          <SecondaryButton
            onClick={
              () =>
                void refreshAll()
            }
            disabled={
              busy ===
              "refresh"
            }
          >
            <RefreshCw className="h-4 w-4" />

            Refresh
          </SecondaryButton>

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


        <div className="grid gap-4 sm:grid-cols-4">

          <div className="rounded-2xl border bg-background p-5">
            <Users className="h-5 w-5 text-muted-foreground" />

            <p className="mt-3 text-3xl font-bold">
              {workspace.employees.length}
            </p>

            <p className="text-sm text-muted-foreground">
              HR employees
            </p>
          </div>


          <div className="rounded-2xl border bg-background p-5">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />

            <p className="mt-3 text-xl font-bold capitalize">
              {userRole}
            </p>

            <p className="text-sm text-muted-foreground">
              Your Nexus role
            </p>
          </div>


          <div className="rounded-2xl border bg-background p-5">
            <Clock3 className="h-5 w-5 text-muted-foreground" />

            <p className="mt-3 text-3xl font-bold">
              {workspace.summary.clocked_in}
            </p>

            <p className="text-sm text-muted-foreground">
              Currently clocked in
            </p>
          </div>


          <div className="rounded-2xl border bg-background p-5">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />

            <p className="mt-3 text-3xl font-bold">
              {workspace.summary.pending_leave}
            </p>

            <p className="text-sm text-muted-foreground">
              Pending leave
            </p>
          </div>

        </div>


        {workspace.employees.length ===
        0 ? (
          <Panel
            title="No HR employees yet"
            description="Nexus users and HR employee records are separate."
          >
            <p className="text-sm text-muted-foreground">
              Go to Human Resources → Employees and create the first HR employee. Link the employee to their Nexus login so their role and mobile schedule can work.
            </p>
          </Panel>
        ) : (
          <>
            <Panel
              title="Select employee"
              description="Choose the employee whose HR configuration you want to manage."
            >
              <select
                value={
                  selectedEmployeeId
                }
                onChange={
                  (
                    event
                  ) =>
                    setSelectedEmployeeId(
                      event.target.value
                    )
                }
                className={
                  inputClass
                }
              >
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
                      {employee.employee_number} · {employee.full_name}
                    </option>
                  )
                )}
              </select>
            </Panel>


            {selectedEmployee &&
            details ? (
              <div className="grid gap-5 xl:grid-cols-2">

                <Panel
                  title="Employee profile"
                  description={`Employee ${details.employee.employee_number}`}
                >
                  <div className="mb-5 flex flex-wrap gap-3 rounded-xl bg-muted/40 p-4">

                    <div>
                      <p className="text-xs text-muted-foreground">
                        Nexus role
                      </p>

                      <p className="font-bold capitalize">
                        {selectedNexusRole}
                      </p>
                    </div>


                    <div className="ml-auto">
                      <StatusBadge
                        value={
                          details.employee.status
                        }
                      />
                    </div>

                  </div>


                  <div className="grid gap-4 md:grid-cols-2">

                    <Field label="First name">
                      <input
                        value={
                          employeeForm.first_name
                        }
                        disabled={
                          !details.can_manage_employee
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm({
                              ...employeeForm,
                              first_name:
                                event.target.value,
                            })
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
                        disabled={
                          !details.can_manage_employee
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm({
                              ...employeeForm,
                              last_name:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      />
                    </Field>


                    <Field label="Email">
                      <input
                        value={
                          employeeForm.email
                        }
                        disabled={
                          !details.can_manage_employee
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm({
                              ...employeeForm,
                              email:
                                event.target.value,
                            })
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
                        disabled={
                          !details.can_manage_employee
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm({
                              ...employeeForm,
                              phone:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      />
                    </Field>


                    <Field label="Nexus login / role">
                      <select
                        value={
                          employeeForm.user_id
                        }
                        disabled={
                          !details.can_manage_employee
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm({
                              ...employeeForm,
                              user_id:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      >
                        <option value="">
                          HR only — no login linked
                        </option>

                        {directory?.users
                          .filter(
                            (
                              user
                            ) =>
                              !user.employee_id ||
                              user.employee_id ===
                                selectedEmployeeId
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
                                {user.full_name} · {user.role}
                              </option>
                            )
                          )}
                      </select>
                    </Field>


                    <Field label="Branch">
                      <select
                        value={
                          employeeForm.primary_branch_id
                        }
                        disabled={
                          !details.can_manage_employee
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm({
                              ...employeeForm,
                              primary_branch_id:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      >
                        <option value="">
                          No branch
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
                    </Field>


                    <Field label="Department">
                      <select
                        value={
                          employeeForm.department_id
                        }
                        disabled={
                          !details.can_manage_employee
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm({
                              ...employeeForm,
                              department_id:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      >
                        <option value="">
                          No department
                        </option>

                        {workspace.departments.map(
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
                        disabled={
                          !details.can_manage_employee
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm({
                              ...employeeForm,
                              position_id:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      >
                        <option value="">
                          No position
                        </option>

                        {workspace.positions.map(
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


                    <Field label="Reports to">
                      <select
                        value={
                          employeeForm.manager_employee_id
                        }
                        disabled={
                          !details.can_manage_employee
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm({
                              ...employeeForm,
                              manager_employee_id:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      >
                        <option value="">
                          No manager
                        </option>

                        {workspace.employees
                          .filter(
                            (
                              employee
                            ) =>
                              employee.id !==
                              selectedEmployeeId
                          )
                          .map(
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


                    <Field label="Employment type">
                      <select
                        value={
                          employeeForm.employment_type
                        }
                        disabled={
                          !details.can_manage_employee
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm({
                              ...employeeForm,
                              employment_type:
                                event.target.value,
                            })
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


                    <Field label="Status">
                      <select
                        value={
                          employeeForm.status
                        }
                        disabled={
                          !details.can_manage_employee
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm({
                              ...employeeForm,
                              status:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      >
                        <option value="active">
                          Active
                        </option>

                        <option value="on_leave">
                          On leave
                        </option>

                        <option value="suspended">
                          Suspended
                        </option>

                        <option value="terminated">
                          Terminated
                        </option>
                      </select>
                    </Field>


                    <Field label="Hire date">
                      <input
                        type="date"
                        value={
                          employeeForm.hire_date
                        }
                        disabled={
                          !details.can_manage_employee
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm({
                              ...employeeForm,
                              hire_date:
                                event.target.value,
                            })
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
                          employeeForm.end_date
                        }
                        disabled={
                          !details.can_manage_employee
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm({
                              ...employeeForm,
                              end_date:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      />
                    </Field>


                    <Field label="Standard hours / week">
                      <input
                        type="number"
                        min="0"
                        max="168"
                        value={
                          employeeForm.standard_hours_per_week
                        }
                        disabled={
                          !details.can_manage_employee
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setEmployeeForm({
                              ...employeeForm,
                              standard_hours_per_week:
                                event.target.value,
                            })
                        }
                        className={
                          inputClass
                        }
                      />
                    </Field>


                    {details.can_manage_employee ? (
                      <div className="md:col-span-2">

                        <Field label="Internal HR notes">
                          <textarea
                            value={
                              employeeForm.internal_notes
                            }
                            onChange={
                              (
                                event
                              ) =>
                                setEmployeeForm({
                                  ...employeeForm,
                                  internal_notes:
                                    event.target.value,
                                })
                            }
                            className={
                              textareaClass
                            }
                          />
                        </Field>

                      </div>
                    ) : null}


                    {details.can_manage_employee ? (
                      <div className="md:col-span-2">

                        <PrimaryButton
                          disabled={
                            busy ===
                            "employee"
                          }
                          onClick={
                            () =>
                              void saveEmployee()
                          }
                        >
                          <Save className="h-4 w-4" />
                          Save Employee
                        </PrimaryButton>

                      </div>
                    ) : null}

                  </div>
                </Panel>


                <Panel
                  title="Work availability"
                  description="The automatic timetable respects these limits. Managers can schedule staff but cannot clock in for them."
                >
                  <div className="space-y-3">

                    {availability.map(
                      (
                        item,
                        index
                      ) => (
                        <div
                          key={
                            item.day_of_week
                          }
                          className="rounded-xl border p-4"
                        >

                          <div className="flex flex-wrap items-center justify-between gap-3">

                            <div>
                              <p className="font-semibold">
                                {dayNames[index]}
                              </p>

                              <p className="text-xs text-muted-foreground">
                                {item.is_available
                                  ? "Available"
                                  : "Unavailable"}
                              </p>
                            </div>


                            <label className="flex items-center gap-2 text-sm font-medium">
                              <input
                                type="checkbox"
                                checked={
                                  item.is_available
                                }
                                disabled={
                                  !details.can_manage_schedule
                                }
                                onChange={
                                  (
                                    event
                                  ) => {
                                    const next =
                                      [...availability];

                                    next[index] = {
                                      ...item,
                                      is_available:
                                        event.target.checked,
                                    };

                                    setAvailability(
                                      next
                                    );
                                  }
                                }
                              />

                              Available
                            </label>

                          </div>


                          {item.is_available ? (
                            <div className="mt-4 grid grid-cols-2 gap-3">

                              <Field label="From">
                                <input
                                  type="time"
                                  value={
                                    item.available_from?.slice(
                                      0,
                                      5
                                    ) ??
                                    "08:00"
                                  }
                                  disabled={
                                    !details.can_manage_schedule
                                  }
                                  onChange={
                                    (
                                      event
                                    ) => {
                                      const next =
                                        [...availability];

                                      next[index] = {
                                        ...item,
                                        available_from:
                                          event.target.value,
                                      };

                                      setAvailability(
                                        next
                                      );
                                    }
                                  }
                                  className={
                                    inputClass
                                  }
                                />
                              </Field>


                              <Field label="To">
                                <input
                                  type="time"
                                  value={
                                    item.available_to?.slice(
                                      0,
                                      5
                                    ) ??
                                    "17:30"
                                  }
                                  disabled={
                                    !details.can_manage_schedule
                                  }
                                  onChange={
                                    (
                                      event
                                    ) => {
                                      const next =
                                        [...availability];

                                      next[index] = {
                                        ...item,
                                        available_to:
                                          event.target.value,
                                      };

                                      setAvailability(
                                        next
                                      );
                                    }
                                  }
                                  className={
                                    inputClass
                                  }
                                />
                              </Field>

                            </div>
                          ) : null}


                          {details.can_manage_schedule ? (
                            <div className="mt-3">

                              <SecondaryButton
                                disabled={
                                  busy ===
                                  `availability-${item.day_of_week}`
                                }
                                onClick={
                                  () =>
                                    void saveAvailability(
                                      item
                                    )
                                }
                              >
                                <Save className="h-4 w-4" />
                                Save {dayNames[index]}
                              </SecondaryButton>

                            </div>
                          ) : null}

                        </div>
                      )
                    )}

                  </div>
                </Panel>


                <Panel
                  title="Leave balances"
                  description="Operational calendar-day balances. Payroll/statutory entitlement rules are a later compliance layer."
                >

                  {details.leave_balances.length ===
                  0 ? (
                    <p className="mb-4 text-sm text-muted-foreground">
                      No leave balances configured yet.
                    </p>
                  ) : (
                    <div className="mb-5 grid gap-3 md:grid-cols-2">

                      {details.leave_balances.map(
                        (
                          balance
                        ) => (
                          <div
                            key={
                              balance.id
                            }
                            className="rounded-xl border p-4"
                          >
                            <p className="font-semibold">
                              {balance.leave_type_name}
                            </p>

                            <p className="mt-3 text-3xl font-bold">
                              {balance.available_units}
                            </p>

                            <p className="text-xs text-muted-foreground">
                              available · {balance.used_units} used
                            </p>

                            <div className="mt-3 text-xs text-muted-foreground">
                              Opening {balance.opening_units}
                              {" · "}
                              Accrued {balance.accrued_units}
                              {" · "}
                              Adjustment {balance.adjustment_units}
                            </div>
                          </div>
                        )
                      )}

                    </div>
                  )}


                  {details.can_manage_leave ? (
                    <div className="grid gap-4">

                      <Field label="Leave type">
                        <select
                          value={
                            leaveForm.leave_type_id
                          }
                          onChange={
                            (
                              event
                            ) =>
                              setLeaveForm({
                                ...leaveForm,
                                leave_type_id:
                                  event.target.value,
                              })
                          }
                          className={
                            inputClass
                          }
                        >
                          <option value="">
                            Choose leave type
                          </option>

                          {workspace.leave_types.map(
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


                      <div className="grid gap-3 md:grid-cols-2">

                        <Field label="Period start">
                          <input
                            type="date"
                            value={
                              leaveForm.period_start
                            }
                            onChange={
                              (
                                event
                              ) =>
                                setLeaveForm({
                                  ...leaveForm,
                                  period_start:
                                    event.target.value,
                                })
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
                              leaveForm.period_end
                            }
                            onChange={
                              (
                                event
                              ) =>
                                setLeaveForm({
                                  ...leaveForm,
                                  period_end:
                                    event.target.value,
                                })
                            }
                            className={
                              inputClass
                            }
                          />
                        </Field>

                      </div>


                      <div className="grid gap-3 md:grid-cols-3">

                        <Field label="Opening">
                          <input
                            type="number"
                            step="0.5"
                            value={
                              leaveForm.opening_units
                            }
                            onChange={
                              (
                                event
                              ) =>
                                setLeaveForm({
                                  ...leaveForm,
                                  opening_units:
                                    event.target.value,
                                })
                            }
                            className={
                              inputClass
                            }
                          />
                        </Field>


                        <Field label="Accrued">
                          <input
                            type="number"
                            step="0.5"
                            value={
                              leaveForm.accrued_units
                            }
                            onChange={
                              (
                                event
                              ) =>
                                setLeaveForm({
                                  ...leaveForm,
                                  accrued_units:
                                    event.target.value,
                                })
                            }
                            className={
                              inputClass
                            }
                          />
                        </Field>


                        <Field label="Adjustment">
                          <input
                            type="number"
                            step="0.5"
                            value={
                              leaveForm.adjustment_units
                            }
                            onChange={
                              (
                                event
                              ) =>
                                setLeaveForm({
                                  ...leaveForm,
                                  adjustment_units:
                                    event.target.value,
                                })
                            }
                            className={
                              inputClass
                            }
                          />
                        </Field>

                      </div>


                      <PrimaryButton
                        disabled={
                          busy ===
                          "leave-balance"
                        }
                        onClick={
                          () =>
                            void saveLeaveBalance()
                        }
                      >
                        <Save className="h-4 w-4" />
                        Save Leave Balance
                      </PrimaryButton>

                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Only owner/admin can configure leave balances.
                    </p>
                  )}

                </Panel>


                <Panel
                  title="Employee leave activity"
                  description="Pending and approved leave can be cancelled by authorised management."
                >

                  {workspace.leave_requests
                    .filter(
                      (
                        request
                      ) =>
                        request.employee_id ===
                        selectedEmployeeId
                    )
                    .length ===
                  0 ? (
                    <p className="text-sm text-muted-foreground">
                      No leave requests for this employee.
                    </p>
                  ) : (
                    <div className="space-y-3">

                      {workspace.leave_requests
                        .filter(
                          (
                            request
                          ) =>
                            request.employee_id ===
                            selectedEmployeeId
                        )
                        .map(
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
                                    {request.leave_type_name}
                                  </p>

                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {request.start_date}
                                    {" → "}
                                    {request.end_date}
                                    {" · "}
                                    {request.calendar_days} day(s)
                                  </p>
                                </div>


                                <StatusBadge
                                  value={
                                    request.status
                                  }
                                />

                              </div>


                              {request.reason ? (
                                <p className="mt-3 text-sm">
                                  {request.reason}
                                </p>
                              ) : null}


                              {workspace.can_approve_leave &&
                              [
                                "pending",
                                "approved",
                              ].includes(
                                request.status
                              ) ? (
                                <div className="mt-4">

                                  <SecondaryButton
                                    disabled={
                                      busy ===
                                      `cancel-${request.id}`
                                    }
                                    onClick={
                                      () => {
                                        const confirmed =
                                          window.confirm(
                                            "Cancel this leave request?"
                                          );

                                        if (
                                          confirmed
                                        ) {
                                          void cancelLeave(
                                            request.id
                                          );
                                        }
                                      }
                                    }
                                  >
                                    <XCircle className="h-4 w-4" />
                                    Cancel Leave
                                  </SecondaryButton>

                                </div>
                              ) : null}

                            </div>
                          )
                        )}

                    </div>
                  )}

                </Panel>

              </div>
            ) : (
              <Panel
                title="Loading employee"
                description="Retrieving secure HR management data."
              >
                <p className="text-sm text-muted-foreground">
                  Please wait...
                </p>
              </Panel>
            )}
          </>
        )}

      </main>
    </DashboardLayout>
  );
}
