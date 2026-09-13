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
  CheckCircle2,
  Copy,
  KeyRound,
  MonitorSmartphone,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRoundCheck,
  XCircle,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/lib/supabase";


type Branch = {
  id: string;
  name: string;
};


type Device = {
  id: string;
  name: string;
  device_code: string;
  status: string;
  branch_id: string;
  branch_name: string;
  last_seen_at: string | null;
  locked_until: string | null;
  created_at: string;
};


type Employee = {
  id: string;
  employee_number: string;
  name: string;
  status: string;
  branch_id: string | null;
  branch_name: string | null;

  credential_ready: boolean;
  badge_code: string | null;
  credential_locked_until: string | null;
  pin_changed_at: string | null;
};


type Workspace = {
  ok: boolean;
  devices: Device[];
  employees: Employee[];
  branches: Branch[];
};


type DeviceSecret = {
  id: string;
  device_code: string;
  secret: string;
  name: string;
};


const inputClass =
  "h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-foreground";


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
      {value.replaceAll("_", " ")}
    </span>
  );
}


function dateTime(
  value: string | null
) {
  if (!value) {
    return "Never";
  }

  return new Date(
    value
  ).toLocaleString(
    "en-ZA"
  );
}


export default function AttendanceDevicesPage() {
  const router =
    useRouter();

  const [
    workspace,
    setWorkspace,
  ] =
    useState<Workspace | null>(
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
    registerForm,
    setRegisterForm,
  ] =
    useState({
      name: "Front Desk Attendance Kiosk",
      branch_id: "",
    });

  const [
    secret,
    setSecret,
  ] =
    useState<DeviceSecret | null>(
      null
    );

  const [
    selectedEmployee,
    setSelectedEmployee,
  ] =
    useState<Employee | null>(
      null
    );

  const [
    pinForm,
    setPinForm,
  ] =
    useState({
      badge_code: "",
      pin: "",
      confirm_pin: "",
    });


  async function load() {
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
      data,
      error:
        rpcError,
    } =
      await supabase.rpc(
        "get_hr_attendance_devices_workspace"
      );


    if (rpcError) {
      throw rpcError;
    }


    setWorkspace(
      data as Workspace
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
              : "Unable to load attendance devices."
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


  async function registerDevice() {
    if (
      !registerForm.branch_id
    ) {
      setError(
        "Choose a branch."
      );

      return;
    }


    setBusy(
      "register"
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
          "register_hr_attendance_device",
          {
            p_name:
              registerForm.name,

            p_branch_id:
              registerForm.branch_id,
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      const result =
        data as {
          id: string;
          device_code: string;
          device_secret: string;
        };


      setSecret({
        id:
          result.id,

        device_code:
          result.device_code,

        secret:
          result.device_secret,

        name:
          registerForm.name,
      });


      setSuccess(
        "Attendance device registered. Save the secret now."
      );


      await load();

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to register device."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  async function rotateSecret(
    device:
      Device
  ) {
    const confirmed =
      window.confirm(
        `Rotate the secret for ${device.name}? The old kiosk configuration will stop working immediately.`
      );


    if (!confirmed) {
      return;
    }


    setBusy(
      `rotate-${device.id}`
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
          "rotate_hr_attendance_device_secret",
          {
            p_device_id:
              device.id,
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      const result =
        data as {
          device_secret: string;
        };


      setSecret({
        id:
          device.id,

        device_code:
          device.device_code,

        secret:
          result.device_secret,

        name:
          device.name,
      });


      setSuccess(
        "Device secret rotated. Reconfigure the kiosk browser."
      );

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to rotate device secret."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  async function revokeDevice(
    device:
      Device
  ) {
    const confirmed =
      window.confirm(
        `Revoke ${device.name}? This kiosk will no longer be able to record attendance.`
      );


    if (!confirmed) {
      return;
    }


    setBusy(
      `revoke-${device.id}`
    );

    setError(
      ""
    );


    try {
      const {
        error:
          rpcError,
      } =
        await supabase.rpc(
          "revoke_hr_attendance_device",
          {
            p_device_id:
              device.id,
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      setSuccess(
        "Attendance device revoked."
      );


      await load();

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to revoke device."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  function openPinSetup(
    employee:
      Employee
  ) {
    setSelectedEmployee(
      employee
    );


    setPinForm({
      badge_code:
        employee.badge_code ??
        employee.employee_number,

      pin:
        "",

      confirm_pin:
        "",
    });


    setError(
      ""
    );
  }


  async function savePin() {
    if (
      !selectedEmployee
    ) {
      return;
    }


    if (
      !/^[0-9]{4,8}$/.test(
        pinForm.pin
      )
    ) {
      setError(
        "PIN must contain 4 to 8 digits."
      );

      return;
    }


    if (
      pinForm.pin !==
      pinForm.confirm_pin
    ) {
      setError(
        "PIN confirmation does not match."
      );

      return;
    }


    setBusy(
      "pin"
    );

    setError(
      ""
    );


    try {
      const {
        error:
          rpcError,
      } =
        await supabase.rpc(
          "set_hr_employee_clock_pin",
          {
            p_employee_id:
              selectedEmployee.id,

            p_pin:
              pinForm.pin,

            p_badge_code:
              pinForm.badge_code ||
              selectedEmployee.employee_number,
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      setSuccess(
        `Kiosk PIN configured for ${selectedEmployee.name}.`
      );


      setSelectedEmployee(
        null
      );


      setPinForm({
        badge_code: "",
        pin: "",
        confirm_pin: "",
      });


      await load();

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to configure employee PIN."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  function configureThisBrowser() {
    if (!secret) {
      return;
    }


    localStorage.setItem(
      "nexus_hr_kiosk_device_id",
      secret.id
    );


    localStorage.setItem(
      "nexus_hr_kiosk_device_secret",
      secret.secret
    );


    setSuccess(
      "This browser is configured as the attendance kiosk."
    );


    router.push(
      "/hr/kiosk"
    );
  }


  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Loading attendance devices...
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
              Attendance Devices
            </h1>

            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Register dedicated attendance kiosks, lock them to branches and configure employee clock identities.
            </p>
          </div>


          <button
            type="button"
            onClick={
              () =>
                void load()
            }
            className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold"
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


        {secret ? (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">

            <div className="flex items-start gap-3">

              <KeyRound className="mt-1 h-5 w-5 shrink-0" />

              <div className="min-w-0 flex-1">

                <h2 className="font-bold">
                  Device Secret — save this now
                </h2>

                <p className="mt-1 text-sm">
                  Nexus does not store this secret in readable form.
                </p>


                <div className="mt-4 grid gap-3">

                  <div>
                    <p className="text-xs font-semibold uppercase">
                      Device ID
                    </p>

                    <code className="mt-1 block break-all rounded-lg bg-white p-3 text-xs">
                      {secret.id}
                    </code>
                  </div>


                  <div>
                    <p className="text-xs font-semibold uppercase">
                      Device Code
                    </p>

                    <code className="mt-1 block rounded-lg bg-white p-3 text-xs">
                      {secret.device_code}
                    </code>
                  </div>


                  <div>
                    <p className="text-xs font-semibold uppercase">
                      Secret
                    </p>

                    <code className="mt-1 block break-all rounded-lg bg-white p-3 text-xs">
                      {secret.secret}
                    </code>
                  </div>

                </div>


                <div className="mt-4 flex flex-wrap gap-2">

                  <button
                    type="button"
                    onClick={
                      () =>
                        void navigator.clipboard.writeText(
                          secret.secret
                        )
                    }
                    className="inline-flex h-10 items-center gap-2 rounded-xl border bg-white px-4 text-sm font-semibold"
                  >
                    <Copy className="h-4 w-4" />
                    Copy Secret
                  </button>


                  <button
                    type="button"
                    onClick={
                      configureThisBrowser
                    }
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-bold text-background"
                  >
                    <MonitorSmartphone className="h-4 w-4" />
                    Configure This Browser
                  </button>

                </div>

              </div>

            </div>

          </div>
        ) : null}


        <div className="grid gap-5 xl:grid-cols-[420px_1fr]">

          <Panel
            title="Register Kiosk"
            description="Each physical attendance device belongs to one branch."
          >

            <div className="grid gap-4">

              <label className="grid gap-1.5 text-sm">

                <span className="font-medium">
                  Device name
                </span>

                <input
                  value={
                    registerForm.name
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setRegisterForm({
                        ...registerForm,

                        name:
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
                  Branch
                </span>

                <select
                  value={
                    registerForm.branch_id
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setRegisterForm({
                        ...registerForm,

                        branch_id:
                          event.target.value,
                      })
                  }
                  className={
                    inputClass
                  }
                >
                  <option value="">
                    Choose branch
                  </option>

                  {workspace?.branches.map(
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


              <button
                type="button"
                disabled={
                  busy ===
                  "register"
                }
                onClick={
                  () =>
                    void registerDevice()
                }
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-sm font-bold text-background disabled:opacity-50"
              >
                <Smartphone className="h-4 w-4" />
                Register Device
              </button>

            </div>

          </Panel>


          <Panel
            title="Registered Devices"
            description="Secrets can be rotated or devices revoked instantly."
          >

            {workspace?.devices.length ===
            0 ? (
              <p className="text-sm text-muted-foreground">
                No attendance kiosks registered yet.
              </p>
            ) : (
              <div className="space-y-3">

                {workspace?.devices.map(
                  (
                    device
                  ) => (
                    <div
                      key={
                        device.id
                      }
                      className="rounded-xl border p-4"
                    >

                      <div className="flex flex-wrap items-start justify-between gap-3">

                        <div>
                          <p className="font-bold">
                            {device.name}
                          </p>

                          <p className="text-xs text-muted-foreground">
                            {device.device_code} · {device.branch_name}
                          </p>
                        </div>


                        <Badge
                          value={
                            device.status
                          }
                        />

                      </div>


                      <div className="mt-4 grid gap-3 sm:grid-cols-2">

                        <div className="rounded-xl bg-muted/40 p-3">
                          <p className="text-xs text-muted-foreground">
                            Last seen
                          </p>

                          <p className="mt-1 text-sm font-semibold">
                            {dateTime(
                              device.last_seen_at
                            )}
                          </p>
                        </div>


                        <div className="rounded-xl bg-muted/40 p-3">
                          <p className="text-xs text-muted-foreground">
                            Device ID
                          </p>

                          <p className="mt-1 truncate text-xs font-semibold">
                            {device.id}
                          </p>
                        </div>

                      </div>


                      {device.status ===
                      "active" ? (
                        <div className="mt-4 flex flex-wrap gap-2">

                          <button
                            type="button"
                            disabled={
                              busy ===
                              `rotate-${device.id}`
                            }
                            onClick={
                              () =>
                                void rotateSecret(
                                  device
                                )
                            }
                            className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold"
                          >
                            <RotateCcw className="h-4 w-4" />
                            Rotate Secret
                          </button>


                          <button
                            type="button"
                            disabled={
                              busy ===
                              `revoke-${device.id}`
                            }
                            onClick={
                              () =>
                                void revokeDevice(
                                  device
                                )
                            }
                            className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold"
                          >
                            <Trash2 className="h-4 w-4" />
                            Revoke
                          </button>

                        </div>
                      ) : null}

                    </div>
                  )
                )}

              </div>
            )}

          </Panel>

        </div>


        <Panel
          title="Employee Clock Identity"
          description="Each employee gets their own badge code and private PIN. Managers cannot use these credentials to impersonate employees."
        >

          <div className="overflow-x-auto">

            <table className="w-full min-w-[950px] text-sm">

              <thead>

                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">

                  <th className="py-3 pr-4">
                    Employee
                  </th>

                  <th className="py-3 pr-4">
                    Branch
                  </th>

                  <th className="py-3 pr-4">
                    Badge
                  </th>

                  <th className="py-3 pr-4">
                    Credential
                  </th>

                  <th className="py-3 pr-4">
                    PIN updated
                  </th>

                  <th className="py-3">
                    Action
                  </th>

                </tr>

              </thead>


              <tbody>

                {workspace?.employees.map(
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
                          {employee.name}
                        </p>

                        <p className="text-xs text-muted-foreground">
                          {employee.employee_number}
                        </p>

                      </td>


                      <td className="py-4 pr-4">
                        {employee.branch_name ??
                          "No branch"}
                      </td>


                      <td className="py-4 pr-4 font-mono text-xs">
                        {employee.badge_code ??
                          employee.employee_number}
                      </td>


                      <td className="py-4 pr-4">

                        {employee.credential_ready ? (
                          <span className="inline-flex items-center gap-1.5 font-semibold">
                            <ShieldCheck className="h-4 w-4" />
                            Ready
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            PIN required
                          </span>
                        )}

                      </td>


                      <td className="py-4 pr-4">
                        {dateTime(
                          employee.pin_changed_at
                        )}
                      </td>


                      <td className="py-4">

                        <button
                          type="button"
                          onClick={
                            () =>
                              openPinSetup(
                                employee
                              )
                          }
                          className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold"
                        >
                          <KeyRound className="h-4 w-4" />

                          {employee.credential_ready
                            ? "Change PIN"
                            : "Set PIN"}
                        </button>

                      </td>

                    </tr>
                  )
                )}

              </tbody>

            </table>

          </div>

        </Panel>


        {selectedEmployee ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">

            <div className="w-full max-w-lg rounded-2xl bg-background shadow-xl">

              <div className="border-b p-5">

                <h2 className="font-bold">
                  Employee Clock PIN
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedEmployee.name} · {selectedEmployee.employee_number}
                </p>

              </div>


              <div className="grid gap-4 p-5">

                <label className="grid gap-1.5 text-sm">

                  <span className="font-medium">
                    Badge / QR code value
                  </span>

                  <input
                    value={
                      pinForm.badge_code
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setPinForm({
                          ...pinForm,

                          badge_code:
                            event.target.value.toUpperCase(),
                        })
                    }
                    className={
                      inputClass
                    }
                  />

                </label>


                <label className="grid gap-1.5 text-sm">

                  <span className="font-medium">
                    New PIN
                  </span>

                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    value={
                      pinForm.pin
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setPinForm({
                          ...pinForm,

                          pin:
                            event.target.value.replace(
                              /\D/g,
                              ""
                            ),
                        })
                    }
                    className={
                      inputClass
                    }
                  />

                </label>


                <label className="grid gap-1.5 text-sm">

                  <span className="font-medium">
                    Confirm PIN
                  </span>

                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    value={
                      pinForm.confirm_pin
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setPinForm({
                          ...pinForm,

                          confirm_pin:
                            event.target.value.replace(
                              /\D/g,
                              ""
                            ),
                        })
                    }
                    className={
                      inputClass
                    }
                  />

                </label>


                <p className="text-xs text-muted-foreground">
                  The PIN is hashed before storage and cannot be viewed later.
                </p>


                <div className="flex justify-end gap-2">

                  <button
                    type="button"
                    onClick={
                      () =>
                        setSelectedEmployee(
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
                      "pin"
                    }
                    onClick={
                      () =>
                        void savePin()
                    }
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-bold text-background disabled:opacity-50"
                  >
                    <UserRoundCheck className="h-4 w-4" />
                    Save PIN
                  </button>

                </div>

              </div>

            </div>

          </div>
        ) : null}

      </main>

    </DashboardLayout>
  );
}
