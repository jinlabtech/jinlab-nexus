"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  RefreshCw,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/lib/supabase";


type ScheduleItem = {
  id: string;
  shift_date: string;
  shift_name: string;
  status: string;
  branch_name: string | null;
  required_arrival_time: string | null;
  customer_open_time: string | null;
  break_start_time: string | null;
  break_end_time: string | null;
  finish_time: string | null;
  planned_start_at: string;
  planned_end_at: string;
};


type AvailabilityItem = {
  id?: string;
  day_of_week: number;
  is_available: boolean;
  available_from: string | null;
  available_to: string | null;
  notes?: string | null;
};


type SelfServiceData = {
  ok: boolean;
  timezone: string;
  employee: {
    id: string;
    employee_number: string;
    name: string;
    role: string;
    status: string;
    branch_name: string | null;
    is_clocked_in: boolean;
    clock_in_at: string | null;
  };
  availability: AvailabilityItem[];
  schedule: ScheduleItem[];
  today_shift: ScheduleItem | null;
};


const days = [
  {
    number: 1,
    name: "Monday",
  },
  {
    number: 2,
    name: "Tuesday",
  },
  {
    number: 3,
    name: "Wednesday",
  },
  {
    number: 4,
    name: "Thursday",
  },
  {
    number: 5,
    name: "Friday",
  },
  {
    number: 6,
    name: "Saturday",
  },
  {
    number: 7,
    name: "Sunday",
  },
];


function cleanTime(
  value: string | null
) {
  if (!value) {
    return "—";
  }

  return value.slice(
    0,
    5
  );
}


function humanDate(
  value: string
) {
  const date =
    new Date(
      `${value}T12:00:00`
    );

  return date.toLocaleDateString(
    "en-ZA",
    {
      weekday: "long",
      day: "numeric",
      month: "short",
    }
  );
}


export default function MySchedulePage() {
  const router =
    useRouter();

  const [
    data,
    setData,
  ] =
    useState<SelfServiceData | null>(
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
    message,
    setMessage,
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


  function getDateRange() {
    const start =
      new Date();

    const end =
      new Date();

    end.setDate(
      end.getDate() +
      30
    );

    return {
      start:
        start
          .toISOString()
          .slice(
            0,
            10
          ),

      end:
        end
          .toISOString()
          .slice(
            0,
            10
          ),
    };
  }


  async function load() {
    setError(
      ""
    );

    const range =
      getDateRange();


    async function fetchSelfService() {
      return await supabase.rpc(
        "get_hr_self_service",
        {
          p_start_date:
            range.start,

          p_end_date:
            range.end,
        }
      );
    }


    let response =
      await fetchSelfService();


    /*
     * Owner/admin first-use bootstrap.
     *
     * My Schedule is intentionally linked to the logged-in
     * Nexus user. If an owner/admin does not yet have an HR
     * employee profile, Nexus can safely create their own
     * linked profile.
     *
     * Employees/managers must be linked by authorised HR
     * management and cannot create themselves.
     */
    if (
      response.error &&
      response.error.message.includes(
        "No HR employee profile is linked"
      )
    ) {
      const {
        data: {
          user,
        },
      } =
        await supabase.auth.getUser();


      if (!user) {
        throw new Error(
          "Authentication required."
        );
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


      const role =
        String(
          profile?.role ??
          ""
        ).toLowerCase();


      if (
        role ===
          "owner" ||
        role ===
          "admin"
      ) {
        const {
          error:
            bootstrapError,
        } =
          await supabase.rpc(
            "ensure_my_hr_profile",
            {
              p_branch_id:
                null,
            }
          );


        if (bootstrapError) {
          throw bootstrapError;
        }


        /*
         * Profile now exists.
         * Retry the secure self-service request.
         */
        response =
          await fetchSelfService();
      }
    }


    if (response.error) {
      if (
        response.error.message.includes(
          "No HR employee profile is linked"
        )
      ) {
        throw new Error(
          "Your Nexus login is not linked to an HR employee profile yet. Ask the owner or administrator to link your Nexus user under HR Management."
        );
      }


      throw response.error;
    }


    setData(
      response.data as SelfServiceData
    );
  }


  useEffect(
    () => {
      async function start() {
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


          await load();

        } catch (
          caught
        ) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load your HR schedule."
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


  async function clock() {
    if (!data) {
      return;
    }


    setBusy(
      "clock"
    );

    setMessage(
      ""
    );

    setError(
      ""
    );


    try {
      const action =
        data.employee.is_clocked_in
          ? "clock_out"
          : "clock_in";


      const {
        error:
          rpcError,
      } =
        await supabase.rpc(
          "clock_hr_employee",
          {
            p_action:
              action,

            p_employee_id:
              data.employee.id,

            p_branch_id:
              null,

            p_source:
              "mobile",

            p_notes:
              null,
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      setMessage(
        action ===
        "clock_in"
          ? "You are clocked in."
          : "You are clocked out."
      );


      await load();

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Clock action failed."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  function availabilityFor(
    day:
      number
  ) {
    const saved =
      data?.availability.find(
        (
          item
        ) =>
          item.day_of_week ===
          day
      );


    if (saved) {
      return saved;
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
    };
  }


  async function saveAvailability(
    item:
      AvailabilityItem
  ) {
    if (!data) {
      return;
    }


    setBusy(
      `availability-${item.day_of_week}`
    );

    setMessage(
      ""
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
          "save_hr_employee_availability",
          {
            p_employee_id:
              data.employee.id,

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
              null,
          }
        );


      if (rpcError) {
        throw rpcError;
      }


      setMessage(
        "Availability updated."
      );


      await load();

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


  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Loading My Schedule...
          </p>
        </div>
      </DashboardLayout>
    );
  }


  if (!data) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-xl p-6">
          <div className="rounded-2xl border bg-background p-6">
            <h1 className="text-xl font-bold">
              My Schedule
            </h1>

            <p className="mt-3 text-sm text-red-700">
              {error}
            </p>

            <p className="mt-4 text-sm text-muted-foreground">
              Your Nexus user must first be linked to an HR employee record.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }


  return (
    <DashboardLayout>
      <main className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">

        <div className="flex flex-wrap items-start justify-between gap-4">

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Nexus HR
            </p>

            <h1 className="mt-1 text-2xl font-bold">
              My Schedule
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              {
                data.employee.name
              }
              {" · "}
              {
                data.employee.employee_number
              }
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


        <div className="grid gap-3 sm:grid-cols-3">

          <div className="rounded-2xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">
              Nexus role
            </p>

            <p className="mt-1 text-lg font-bold capitalize">
              {
                data.employee.role
              }
            </p>
          </div>


          <div className="rounded-2xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">
              Branch
            </p>

            <p className="mt-1 text-lg font-bold">
              {
                data.employee.branch_name ||
                "Not assigned"
              }
            </p>
          </div>


          <div className="rounded-2xl border bg-background p-4">
            <p className="text-xs text-muted-foreground">
              Attendance
            </p>

            <p className="mt-1 text-lg font-bold">
              {
                data.employee.is_clocked_in
                  ? "Clocked In"
                  : "Clocked Out"
              }
            </p>
          </div>

        </div>


        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        ) : null}


        {message ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {message}
          </div>
        ) : null}


        <section className="rounded-2xl border bg-background p-5">

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

            <div>
              <h2 className="font-semibold">
                My Time Book
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Only you can clock yourself in or out.
              </p>
            </div>


            <button
              type="button"
              disabled={
                busy ===
                "clock"
              }
              onClick={
                () =>
                  void clock()
              }
              className={[
                "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold disabled:opacity-50",
                data.employee.is_clocked_in
                  ? "border bg-background text-foreground"
                  : "bg-foreground text-background",
              ].join(
                " "
              )}
            >
              <Clock3 className="h-5 w-5" />

              {
                data.employee.is_clocked_in
                  ? "Clock Out"
                  : "Clock In"
              }
            </button>

          </div>

        </section>


        {data.today_shift ? (
          <section className="rounded-2xl border bg-background p-5">

            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Today's shift
            </p>

            <h2 className="mt-2 text-xl font-bold">
              {
                data.today_shift.shift_name
              }
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              {
                data.today_shift.branch_name ||
                data.employee.branch_name
              }
            </p>


            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">

              <div className="rounded-xl bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">
                  Required arrival
                </p>

                <p className="mt-1 text-xl font-bold">
                  {
                    cleanTime(
                      data.today_shift.required_arrival_time
                    )
                  }
                </p>
              </div>


              <div className="rounded-xl bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">
                  Customers open
                </p>

                <p className="mt-1 text-xl font-bold">
                  {
                    cleanTime(
                      data.today_shift.customer_open_time
                    )
                  }
                </p>
              </div>


              <div className="rounded-xl bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">
                  Break
                </p>

                <p className="mt-1 text-base font-bold">
                  {
                    data.today_shift.break_start_time &&
                    data.today_shift.break_end_time
                      ? `${cleanTime(
                          data.today_shift.break_start_time
                        )}–${cleanTime(
                          data.today_shift.break_end_time
                        )}`
                      : "—"
                  }
                </p>
              </div>


              <div className="rounded-xl bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">
                  Finish
                </p>

                <p className="mt-1 text-xl font-bold">
                  {
                    cleanTime(
                      data.today_shift.finish_time
                    )
                  }
                </p>
              </div>

            </div>

          </section>
        ) : null}


        <section className="rounded-2xl border bg-background">

          <div className="border-b p-5">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />

              <h2 className="font-semibold">
                Upcoming Work Schedule
              </h2>
            </div>

            <p className="mt-1 text-sm text-muted-foreground">
              Your next 30 days.
            </p>
          </div>


          <div className="grid gap-3 p-4 sm:p-5">

            {
              data.schedule.length ===
              0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No shifts have been scheduled yet.
                </div>
              ) : (
                data.schedule.map(
                  (
                    shift
                  ) => (
                    <div
                      key={
                        shift.id
                      }
                      className="rounded-2xl border p-4"
                    >

                      <div className="flex items-start justify-between gap-3">

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {
                              humanDate(
                                shift.shift_date
                              )
                            }
                          </p>

                          <h3 className="mt-1 text-lg font-bold">
                            {
                              shift.shift_name
                            }
                          </h3>

                          <p className="text-sm text-muted-foreground">
                            {
                              shift.branch_name ||
                              "No branch"
                            }
                          </p>
                        </div>


                        <CheckCircle2 className="h-5 w-5 text-muted-foreground" />

                      </div>


                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">

                        <div className="rounded-xl bg-muted/40 p-3">
                          <p className="text-xs text-muted-foreground">
                            Arrive
                          </p>

                          <p className="mt-1 font-bold">
                            {
                              cleanTime(
                                shift.required_arrival_time
                              )
                            }
                          </p>
                        </div>


                        <div className="rounded-xl bg-muted/40 p-3">
                          <p className="text-xs text-muted-foreground">
                            Open
                          </p>

                          <p className="mt-1 font-bold">
                            {
                              cleanTime(
                                shift.customer_open_time
                              )
                            }
                          </p>
                        </div>


                        <div className="rounded-xl bg-muted/40 p-3">
                          <p className="text-xs text-muted-foreground">
                            Break
                          </p>

                          <p className="mt-1 font-bold">
                            {
                              shift.break_start_time &&
                              shift.break_end_time
                                ? `${cleanTime(
                                    shift.break_start_time
                                  )}–${cleanTime(
                                    shift.break_end_time
                                  )}`
                                : "—"
                            }
                          </p>
                        </div>


                        <div className="rounded-xl bg-muted/40 p-3">
                          <p className="text-xs text-muted-foreground">
                            Finish
                          </p>

                          <p className="mt-1 font-bold">
                            {
                              cleanTime(
                                shift.finish_time
                              )
                            }
                          </p>
                        </div>

                      </div>

                    </div>
                  )
                )
              )
            }

          </div>

        </section>


        <section className="rounded-2xl border bg-background">

          <div className="border-b p-5">
            <h2 className="font-semibold">
              My Availability
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Tell Nexus which days and times you can work. The automatic timetable will respect these settings.
            </p>
          </div>


          <div className="space-y-3 p-4 sm:p-5">

            {
              days.map(
                (
                  day
                ) => {
                  const availability =
                    availabilityFor(
                      day.number
                    );


                  return (
                    <AvailabilityRow
                      key={
                        day.number
                      }
                      dayName={
                        day.name
                      }
                      value={
                        availability
                      }
                      busy={
                        busy ===
                        `availability-${day.number}`
                      }
                      onSave={
                        (
                          next
                        ) =>
                          void saveAvailability(
                            next
                          )
                      }
                    />
                  );
                }
              )
            }

          </div>

        </section>

      </main>
    </DashboardLayout>
  );
}


function AvailabilityRow({
  dayName,
  value,
  busy,
  onSave,
}: {
  dayName: string;
  value: AvailabilityItem;
  busy: boolean;
  onSave: (
    value:
      AvailabilityItem
  ) => void;
}) {
  const [
    form,
    setForm,
  ] =
    useState<AvailabilityItem>(
      value
    );


  useEffect(
    () => {
      setForm(
        value
      );
    },
    [
      value.id,
      value.is_available,
      value.available_from,
      value.available_to,
    ]
  );


  return (
    <div className="rounded-xl border p-4">

      <div className="flex flex-wrap items-center justify-between gap-3">

        <div>
          <p className="font-semibold">
            {dayName}
          </p>

          <p className="text-xs text-muted-foreground">
            {
              form.is_available
                ? "Available to work"
                : "Not available"
            }
          </p>
        </div>


        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={
              form.is_available
            }
            onChange={
              (
                event
              ) =>
                setForm(
                  {
                    ...form,
                    is_available:
                      event.target.checked,
                  }
                )
            }
          />

          Available
        </label>

      </div>


      {
        form.is_available ? (
          <div className="mt-4 grid grid-cols-2 gap-3">

            <label className="text-sm">
              <span className="text-xs text-muted-foreground">
                From
              </span>

              <input
                type="time"
                value={
                  form.available_from?.slice(
                    0,
                    5
                  ) ??
                  "08:00"
                }
                onChange={
                  (
                    event
                  ) =>
                    setForm(
                      {
                        ...form,
                        available_from:
                          event.target.value,
                      }
                    )
                }
                className="mt-1 h-10 w-full rounded-xl border bg-background px-3"
              />
            </label>


            <label className="text-sm">
              <span className="text-xs text-muted-foreground">
                To
              </span>

              <input
                type="time"
                value={
                  form.available_to?.slice(
                    0,
                    5
                  ) ??
                  "17:30"
                }
                onChange={
                  (
                    event
                  ) =>
                    setForm(
                      {
                        ...form,
                        available_to:
                          event.target.value,
                      }
                    )
                }
                className="mt-1 h-10 w-full rounded-xl border bg-background px-3"
              />
            </label>

          </div>
        ) : null
      }


      <button
        type="button"
        disabled={
          busy
        }
        onClick={
          () =>
            onSave(
              form
            )
        }
        className="mt-4 h-10 rounded-xl border bg-background px-4 text-sm font-semibold disabled:opacity-50"
      >
        {
          busy
            ? "Saving..."
            : "Save Availability"
        }
      </button>

    </div>
  );
}
