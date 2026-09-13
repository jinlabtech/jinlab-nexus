"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  CheckCircle2,
  Link2,
  RefreshCw,
  ShieldCheck,
  Unlink,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/lib/supabase";


type NexusUser = {
  user_id: string;
  full_name: string;
  email: string | null;
  role: string;

  linked_employee_id: string | null;
  linked_employee_number: string | null;
  linked_employee_name: string | null;
};


type HrEmployee = {
  employee_id: string;
  employee_number: string;
  employee_name: string;
  email: string | null;
  status: string;

  branch_name: string | null;
  position_title: string | null;
  department_name: string | null;

  linked_user_id: string | null;
  linked_user_name: string | null;
  linked_user_email: string | null;
  linked_user_role: string | null;
};


type Suggestion = {
  employee_id: string;
  employee_number: string;
  employee_name: string;

  user_id: string;
  user_name: string;
  user_email: string | null;
  role: string;

  reason:
    | "exact_email"
    | "exact_name";
};


type LinkingWorkspace = {
  ok: boolean;

  summary: {
    nexus_users: number;
    hr_employees: number;
    linked: number;
    unlinked_users: number;
    unlinked_employees: number;
  };

  users: NexusUser[];
  employees: HrEmployee[];
  suggestions: Suggestion[];
};


function Badge({
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


function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-background p-5">

      <div className="text-muted-foreground">
        {icon}
      </div>

      <p className="mt-3 text-3xl font-bold">
        {value}
      </p>

      <p className="text-sm text-muted-foreground">
        {label}
      </p>

    </div>
  );
}


export default function HrUserLinkingPage() {
  const router =
    useRouter();

  const [
    data,
    setData,
  ] =
    useState<LinkingWorkspace | null>(
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
    selectedEmployeeId,
    setSelectedEmployeeId,
  ] =
    useState(
      ""
    );

  const [
    selectedUserId,
    setSelectedUserId,
  ] =
    useState(
      ""
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
      data:
        result,
      error:
        rpcError,
    } =
      await supabase.rpc(
        "get_hr_user_linking_workspace"
      );


    if (rpcError) {
      throw rpcError;
    }


    setData(
      result as LinkingWorkspace
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
              : "Unable to load Nexus/HR links."
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


  const unlinkedEmployees =
    useMemo(
      () =>
        data?.employees.filter(
          (
            employee
          ) =>
            !employee.linked_user_id
        ) ??
        [],
      [
        data,
      ]
    );


  const unlinkedUsers =
    useMemo(
      () =>
        data?.users.filter(
          (
            user
          ) =>
            !user.linked_employee_id
        ) ??
        [],
      [
        data,
      ]
    );


  async function linkEmployee(
    employeeId?:
      string,
    userId?:
      string
  ) {
    const employee =
      employeeId ||
      selectedEmployeeId;

    const user =
      userId ||
      selectedUserId;


    if (
      !employee ||
      !user
    ) {
      setError(
        "Choose both an HR employee and a Nexus user."
      );

      return;
    }


    const employeeRecord =
      data?.employees.find(
        (
          item
        ) =>
          item.employee_id ===
          employee
      );

    const userRecord =
      data?.users.find(
        (
          item
        ) =>
          item.user_id ===
          user
      );


    if (
      !employeeRecord ||
      !userRecord
    ) {
      setError(
        "Employee or Nexus user could not be found."
      );

      return;
    }


    const approved =
      window.confirm(
        `Link ${employeeRecord.employee_name} (${employeeRecord.employee_number}) to Nexus user ${userRecord.full_name} with role ${userRecord.role}?`
      );


    if (!approved) {
      return;
    }


    setBusy(
      "link"
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
          "link_hr_employee_user",
          {
            p_employee_id:
              employee,

            p_user_id:
              user,
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      setSuccess(
        `${employeeRecord.employee_name} is now linked to ${userRecord.full_name}.`
      );


      setSelectedEmployeeId(
        ""
      );

      setSelectedUserId(
        ""
      );


      await load();

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to link employee."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  async function unlinkEmployee(
    employee:
      HrEmployee
  ) {
    const approved =
      window.confirm(
        `Disconnect ${employee.employee_name} from Nexus user ${employee.linked_user_name ?? ""}? Their My Schedule and self-clocking will stop working until linked again.`
      );


    if (!approved) {
      return;
    }


    setBusy(
      `unlink-${employee.employee_id}`
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
          "unlink_hr_employee_user",
          {
            p_employee_id:
              employee.employee_id,
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      setSuccess(
        `${employee.employee_name} was unlinked from the Nexus login.`
      );


      await load();

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to unlink employee."
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
            Loading Nexus HR links...
          </p>

        </div>

      </DashboardLayout>
    );
  }


  return (
    <DashboardLayout>

      <main className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6">

        <div className="flex flex-wrap items-start justify-between gap-4">

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Nexus HR
            </p>

            <h1 className="mt-1 text-2xl font-bold">
              User ↔ Employee Linking
            </h1>

            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Connect each HR employee to the correct Nexus login. This identity link powers My Schedule, self-clocking, employee self-service and role-aware HR access.
            </p>
          </div>


          <button
            type="button"
            onClick={
              () =>
                void load()
            }
            className="inline-flex h-10 items-center gap-2 rounded-xl border bg-background px-4 text-sm font-semibold"
          >
            <RefreshCw className="h-4 w-4" />

            Refresh
          </button>

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


        {data ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">

              <Stat
                label="Nexus users"
                value={
                  data.summary.nexus_users
                }
                icon={
                  <Users className="h-5 w-5" />
                }
              />


              <Stat
                label="HR employees"
                value={
                  data.summary.hr_employees
                }
                icon={
                  <UserCheck className="h-5 w-5" />
                }
              />


              <Stat
                label="Linked"
                value={
                  data.summary.linked
                }
                icon={
                  <Link2 className="h-5 w-5" />
                }
              />


              <Stat
                label="Users not linked"
                value={
                  data.summary.unlinked_users
                }
                icon={
                  <ShieldCheck className="h-5 w-5" />
                }
              />


              <Stat
                label="Employees not linked"
                value={
                  data.summary.unlinked_employees
                }
                icon={
                  <Unlink className="h-5 w-5" />
                }
              />

            </div>


            <section className="rounded-2xl border bg-background">

              <div className="border-b p-5">

                <h2 className="font-semibold">
                  Create Identity Link
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Select the real employee and their real Nexus login. Nothing is linked automatically.
                </p>

              </div>


              <div className="grid gap-4 p-5 md:grid-cols-[1fr_1fr_auto] md:items-end">

                <label className="grid gap-1.5 text-sm">

                  <span className="font-medium">
                    HR employee
                  </span>

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
                    className="h-11 rounded-xl border bg-background px-3"
                  >
                    <option value="">
                      Choose employee
                    </option>

                    {unlinkedEmployees.map(
                      (
                        employee
                      ) => (
                        <option
                          key={
                            employee.employee_id
                          }
                          value={
                            employee.employee_id
                          }
                        >
                          {employee.employee_number} · {employee.employee_name}
                        </option>
                      )
                    )}
                  </select>

                </label>


                <label className="grid gap-1.5 text-sm">

                  <span className="font-medium">
                    Nexus login
                  </span>

                  <select
                    value={
                      selectedUserId
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setSelectedUserId(
                          event.target.value
                        )
                    }
                    className="h-11 rounded-xl border bg-background px-3"
                  >
                    <option value="">
                      Choose Nexus user
                    </option>

                    {unlinkedUsers.map(
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

                </label>


                <button
                  type="button"
                  disabled={
                    busy ===
                      "link" ||
                    !selectedEmployeeId ||
                    !selectedUserId
                  }
                  onClick={
                    () =>
                      void linkEmployee()
                  }
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground px-5 text-sm font-bold text-background disabled:opacity-50"
                >
                  <Link2 className="h-4 w-4" />

                  Link
                </button>

              </div>

            </section>


            {data.suggestions.length >
            0 ? (
              <section className="rounded-2xl border bg-background">

                <div className="border-b p-5">

                  <h2 className="font-semibold">
                    Possible Matches
                  </h2>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Nexus found exact name/email similarities. These are suggestions only — owner/admin must confirm.
                  </p>

                </div>


                <div className="grid gap-3 p-5">

                  {data.suggestions.map(
                    (
                      suggestion
                    ) => (
                      <div
                        key={
                          `${suggestion.employee_id}-${suggestion.user_id}`
                        }
                        className="flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center"
                      >

                        <div className="flex-1">

                          <p className="font-semibold">
                            {suggestion.employee_name}
                          </p>

                          <p className="text-xs text-muted-foreground">
                            {suggestion.employee_number}
                          </p>

                        </div>


                        <div className="flex-1">

                          <p className="font-semibold">
                            {suggestion.user_name}
                          </p>

                          <p className="text-xs text-muted-foreground">
                            {suggestion.user_email ?? "No email"} · {suggestion.role}
                          </p>

                        </div>


                        <Badge
                          value={
                            suggestion.reason
                          }
                        />


                        <button
                          type="button"
                          onClick={
                            () =>
                              void linkEmployee(
                                suggestion.employee_id,
                                suggestion.user_id
                              )
                          }
                          className="h-10 rounded-xl border px-4 text-sm font-semibold"
                        >
                          Confirm Link
                        </button>

                      </div>
                    )
                  )}

                </div>

              </section>
            ) : null}


            <section className="rounded-2xl border bg-background">

              <div className="border-b p-5">

                <h2 className="font-semibold">
                  HR Employee Identity Status
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Every employee who uses My Schedule or self-clocking must have exactly one Nexus login linked.
                </p>

              </div>


              <div className="overflow-x-auto">

                <table className="w-full min-w-[950px] text-sm">

                  <thead>

                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">

                      <th className="px-5 py-3">
                        Employee
                      </th>

                      <th className="px-5 py-3">
                        Department / Position
                      </th>

                      <th className="px-5 py-3">
                        Branch
                      </th>

                      <th className="px-5 py-3">
                        Nexus Login
                      </th>

                      <th className="px-5 py-3">
                        Role
                      </th>

                      <th className="px-5 py-3">
                        Status
                      </th>

                      <th className="px-5 py-3">
                        Action
                      </th>

                    </tr>

                  </thead>


                  <tbody>

                    {data.employees.map(
                      (
                        employee
                      ) => (
                        <tr
                          key={
                            employee.employee_id
                          }
                          className="border-b last:border-0"
                        >

                          <td className="px-5 py-4">

                            <p className="font-semibold">
                              {employee.employee_name}
                            </p>

                            <p className="text-xs text-muted-foreground">
                              {employee.employee_number}
                            </p>

                          </td>


                          <td className="px-5 py-4">

                            <p>
                              {employee.position_title ??
                                "No position"}
                            </p>

                            <p className="text-xs text-muted-foreground">
                              {employee.department_name ??
                                "No department"}
                            </p>

                          </td>


                          <td className="px-5 py-4">
                            {employee.branch_name ??
                              "Not assigned"}
                          </td>


                          <td className="px-5 py-4">

                            {employee.linked_user_id ? (
                              <>
                                <p className="font-semibold">
                                  {employee.linked_user_name}
                                </p>

                                <p className="text-xs text-muted-foreground">
                                  {employee.linked_user_email ??
                                    "No email"}
                                </p>
                              </>
                            ) : (
                              <span className="text-muted-foreground">
                                Not linked
                              </span>
                            )}

                          </td>


                          <td className="px-5 py-4">

                            {employee.linked_user_role ? (
                              <Badge
                                value={
                                  employee.linked_user_role
                                }
                              />
                            ) : (
                              "—"
                            )}

                          </td>


                          <td className="px-5 py-4">

                            {employee.linked_user_id ? (
                              <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                                <CheckCircle2 className="h-4 w-4" />
                                Ready
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                Needs link
                              </span>
                            )}

                          </td>


                          <td className="px-5 py-4">

                            {employee.linked_user_id ? (
                              <button
                                type="button"
                                disabled={
                                  busy ===
                                  `unlink-${employee.employee_id}`
                                }
                                onClick={
                                  () =>
                                    void unlinkEmployee(
                                      employee
                                    )
                                }
                                className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold disabled:opacity-50"
                              >
                                <Unlink className="h-4 w-4" />
                                Unlink
                              </button>
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

            </section>


            <section className="rounded-2xl border bg-background">

              <div className="border-b p-5">

                <h2 className="font-semibold">
                  Nexus Users
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  System access role and HR identity are deliberately separate.
                </p>

              </div>


              <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">

                {data.users.map(
                  (
                    user
                  ) => (
                    <div
                      key={
                        user.user_id
                      }
                      className="rounded-xl border p-4"
                    >

                      <div className="flex items-start justify-between gap-3">

                        <div>
                          <p className="font-semibold">
                            {user.full_name}
                          </p>

                          <p className="text-xs text-muted-foreground">
                            {user.email ??
                              "No email"}
                          </p>
                        </div>


                        <Badge
                          value={
                            user.role
                          }
                        />

                      </div>


                      <div className="mt-4 rounded-xl bg-muted/40 p-3">

                        <p className="text-xs text-muted-foreground">
                          HR identity
                        </p>

                        <p className="mt-1 text-sm font-semibold">
                          {user.linked_employee_name ??
                            "Not linked"}
                        </p>

                        {user.linked_employee_number ? (
                          <p className="text-xs text-muted-foreground">
                            {user.linked_employee_number}
                          </p>
                        ) : null}

                      </div>

                    </div>
                  )
                )}

              </div>

            </section>

          </>
        ) : null}

      </main>

    </DashboardLayout>
  );
}
