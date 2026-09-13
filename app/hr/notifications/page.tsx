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
  Bell,
  BellRing,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  Clock3,
  FileWarning,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  X,
  XCircle,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/lib/supabase";


type NotificationItem = {
  id: string;

  category: string;
  severity:
    | "info"
    | "warning"
    | "critical";

  title: string;
  message: string;

  action_url: string | null;

  employee_id: string | null;
  employee_name: string | null;

  source_type: string;

  due_at: string | null;
  read_at: string | null;
  resolved_at: string | null;
  created_at: string;
};


type FollowupTask = {
  id: string;

  category: string;

  priority:
    | "low"
    | "normal"
    | "high"
    | "urgent";

  title: string;
  description: string | null;

  action_url: string | null;

  employee_id: string | null;
  employee_name: string | null;

  due_at: string | null;

  status:
    | "open"
    | "in_progress"
    | "done"
    | "dismissed";

  resolution_notes: string | null;

  created_at: string;
};


type Workspace = {
  ok: boolean;

  mode:
    | "management"
    | "self";

  summary: {
    unread: number;
    critical: number;
    warnings: number;
    open_tasks: number;
  };

  notifications: NotificationItem[];

  tasks: FollowupTask[];
};


function dateTime(
  value:
    string | null
) {
  if (!value) {
    return "—";
  }


  return new Date(
    value
  ).toLocaleString(
    "en-ZA",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }
  );
}


function isOverdue(
  value:
    string | null
) {
  if (!value) {
    return false;
  }


  return (
    new Date(
      value
    ).getTime() <
    Date.now()
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
  description: string;
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


      <p className="mt-1 text-xs text-muted-foreground">
        {description}
      </p>

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


function SeverityBadge({
  severity,
}: {
  severity:
    NotificationItem["severity"];
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


function PriorityBadge({
  priority,
}: {
  priority:
    FollowupTask["priority"];
}) {
  const style =
    priority ===
      "urgent"
      ? "border-red-200 bg-red-50 text-red-800"
      : priority ===
          "high"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 bg-slate-50 text-slate-700";


  return (
    <span
      className={[
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-bold capitalize",
        style,
      ].join(
        " "
      )}
    >
      {priority}
    </span>
  );
}


function NotificationIcon({
  category,
}: {
  category:
    string;
}) {
  if (
    category ===
    "shift"
  ) {
    return (
      <CalendarClock className="h-5 w-5" />
    );
  }


  if (
    category ===
    "attendance"
  ) {
    return (
      <Clock3 className="h-5 w-5" />
    );
  }


  if (
    category ===
    "leave"
  ) {
    return (
      <UserCheck className="h-5 w-5" />
    );
  }


  if (
    category ===
    "document"
  ) {
    return (
      <FileWarning className="h-5 w-5" />
    );
  }


  if (
    category ===
    "discipline"
  ) {
    return (
      <ShieldAlert className="h-5 w-5" />
    );
  }


  return (
    <Bell className="h-5 w-5" />
  );
}


export default function HrNotificationsPage() {
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
    includeResolved,
    setIncludeResolved,
  ] =
    useState(
      false
    );


  const [
    activeView,
    setActiveView,
  ] =
    useState<
      | "notifications"
      | "tasks"
    >(
      "notifications"
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
          setBusy(
            "refresh"
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
              "get_hr_notifications_workspace",
              {
                p_include_resolved:
                  includeResolved,
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
              : "Unable to load HR notifications."
          );

        } finally {
          setLoading(
            false
          );


          if (
            !quiet
          ) {
            setBusy(
              ""
            );
          }
        }
      },
      [
        includeResolved,
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


  const unread =
    useMemo(
      () =>
        workspace?.notifications.filter(
          (
            notification
          ) =>
            !notification.read_at &&
            !notification.resolved_at
        ) ??
        [],
      [
        workspace,
      ]
    );


  async function markRead(
    notification:
      NotificationItem
  ) {
    if (
      notification.read_at
    ) {
      return;
    }


    try {
      const {
        error:
          rpcError,
      } =
        await supabase.rpc(
          "mark_hr_notification_read",
          {
            p_notification_id:
              notification.id,
          }
        );


      if (
        rpcError
      ) {
        throw rpcError;
      }


      await load(
        true
      );

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to mark notification as read."
      );
    }
  }


  async function dismissNotification(
    notification:
      NotificationItem
  ) {
    const approved =
      window.confirm(
        `Dismiss "${notification.title}"?`
      );


    if (
      !approved
    ) {
      return;
    }


    setBusy(
      `dismiss-${notification.id}`
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
          "dismiss_hr_notification",
          {
            p_notification_id:
              notification.id,
          }
        );


      if (
        rpcError
      ) {
        throw rpcError;
      }


      setSuccess(
        "Notification dismissed."
      );


      await load(
        true
      );

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to dismiss notification."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  async function changeTaskStatus(
    task:
      FollowupTask,
    status:
      FollowupTask["status"]
  ) {
    setBusy(
      `task-${task.id}`
    );


    setError(
      ""
    );


    try {
      let notes:
        string | null =
          null;


      if (
        status ===
          "done" ||
        status ===
          "dismissed"
      ) {
        notes =
          window.prompt(
            status ===
              "done"
              ? "Optional completion note:"
              : "Reason for dismissing this task:"
          ) ??
          null;
      }


      const {
        error:
          rpcError,
      } =
        await supabase.rpc(
          "update_hr_followup_task_status",
          {
            p_task_id:
              task.id,

            p_status:
              status,

            p_notes:
              notes,
          }
        );


      if (
        rpcError
      ) {
        throw rpcError;
      }


      setSuccess(
        status ===
          "done"
          ? "Follow-up task completed."
          : status ===
              "in_progress"
            ? "Task marked in progress."
            : status ===
                "dismissed"
              ? "Task dismissed."
              : "Task reopened."
      );


      await load(
        true
      );

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update follow-up task."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  async function refreshRules() {
    setBusy(
      "rules"
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
          "refresh_hr_workflow_notifications",
          {
            p_days_ahead:
              7,
          }
        );


      if (
        rpcError
      ) {
        throw rpcError;
      }


      setSuccess(
        "HR workflow rules refreshed."
      );


      await load(
        true
      );

    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to refresh workflow rules."
      );

    } finally {
      setBusy(
        ""
      );
    }
  }


  if (
    loading
  ) {
    return (
      <DashboardLayout>

        <div className="flex min-h-screen items-center justify-center">

          <p className="text-sm text-muted-foreground">
            Loading HR notifications...
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
              Nexus HR Automation
            </p>


            <h1 className="mt-1 text-2xl font-bold">
              Notifications & Follow-ups
            </h1>


            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Shift reminders, attendance alerts, leave follow-ups and HR compliance tasks.
            </p>

          </div>


          <div className="flex flex-wrap gap-2">

            <button
              type="button"
              disabled={
                busy ===
                "rules"
              }
              onClick={
                () =>
                  void refreshRules()
              }
              className="inline-flex h-10 items-center gap-2 rounded-xl border bg-background px-4 text-sm font-semibold disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />

              Run Workflow Check
            </button>


            <button
              type="button"
              disabled={
                busy ===
                "refresh"
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
                  busy ===
                    "refresh"
                    ? "animate-spin"
                    : "",
                ].join(
                  " "
                )}
              />

              Refresh
            </button>

          </div>

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


        {workspace ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

              <Stat
                title="Unread"
                value={
                  workspace.summary.unread
                }
                description="New HR notifications"
                icon={
                  <BellRing className="h-5 w-5" />
                }
              />


              <Stat
                title="Critical"
                value={
                  workspace.summary.critical
                }
                description="Requires urgent attention"
                icon={
                  <ShieldAlert className="h-5 w-5" />
                }
              />


              <Stat
                title="Warnings"
                value={
                  workspace.summary.warnings
                }
                description="Needs management attention"
                icon={
                  <AlertTriangle className="h-5 w-5" />
                }
              />


              <Stat
                title="Follow-up Tasks"
                value={
                  workspace.summary.open_tasks
                }
                description={
                  workspace.mode ===
                    "management"
                    ? "Assigned to you"
                    : "Management only"
                }
                icon={
                  <ClipboardCheck className="h-5 w-5" />
                }
              />

            </div>


            <div className="rounded-2xl border bg-background">

              <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4">

                <div className="flex">

                  <button
                    type="button"
                    onClick={
                      () =>
                        setActiveView(
                          "notifications"
                        )
                    }
                    className={[
                      "border-b-2 px-4 py-4 text-sm font-semibold",
                      activeView ===
                        "notifications"
                        ? "border-foreground"
                        : "border-transparent text-muted-foreground",
                    ].join(
                      " "
                    )}
                  >
                    Notifications
                    {
                      unread.length >
                      0
                        ? ` (${unread.length})`
                        : ""
                    }
                  </button>


                  {workspace.mode ===
                  "management" ? (
                    <button
                      type="button"
                      onClick={
                        () =>
                          setActiveView(
                            "tasks"
                          )
                      }
                      className={[
                        "border-b-2 px-4 py-4 text-sm font-semibold",
                        activeView ===
                          "tasks"
                          ? "border-foreground"
                          : "border-transparent text-muted-foreground",
                      ].join(
                        " "
                      )}
                    >
                      Follow-up Tasks
                      {
                        workspace.summary.open_tasks >
                        0
                          ? ` (${workspace.summary.open_tasks})`
                          : ""
                      }
                    </button>
                  ) : null}

                </div>


                <label className="flex items-center gap-2 px-4 text-sm">

                  <input
                    type="checkbox"
                    checked={
                      includeResolved
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setIncludeResolved(
                          event.target.checked
                        )
                    }
                  />

                  Show completed

                </label>

              </div>

            </div>


            {activeView ===
            "notifications" ? (
              <Panel
                title={
                  workspace.mode ===
                    "management"
                    ? "HR Notifications"
                    : "My HR Notifications"
                }
                description="Nexus checks HR workflow conditions and generates explainable alerts."
              >

                {workspace.notifications.length ===
                0 ? (
                  <div className="rounded-2xl border border-dashed p-10 text-center">

                    <Bell className="mx-auto h-9 w-9 text-muted-foreground" />


                    <p className="mt-3 font-semibold">
                      No HR notifications
                    </p>


                    <p className="mt-1 text-sm text-muted-foreground">
                      There are currently no workflow conditions requiring your attention.
                    </p>

                  </div>
                ) : (
                  <div className="space-y-3">

                    {workspace.notifications.map(
                      (
                        notification
                      ) => (
                        <div
                          key={
                            notification.id
                          }
                          className={[
                            "rounded-2xl border p-4",
                            !notification.read_at &&
                            !notification.resolved_at
                              ? "bg-muted/20"
                              : "",
                          ].join(
                            " "
                          )}
                        >

                          <div className="flex flex-wrap items-start justify-between gap-3">

                            <div className="flex min-w-0 gap-3">

                              <div className="mt-1 text-muted-foreground">

                                <NotificationIcon
                                  category={
                                    notification.category
                                  }
                                />

                              </div>


                              <div className="min-w-0">

                                <div className="flex flex-wrap items-center gap-2">

                                  <p className="font-bold">
                                    {notification.title}
                                  </p>


                                  {!notification.read_at &&
                                  !notification.resolved_at ? (
                                    <CircleDot className="h-4 w-4" />
                                  ) : null}

                                </div>


                                {notification.employee_name ? (
                                  <p className="mt-1 text-sm font-semibold">
                                    {notification.employee_name}
                                  </p>
                                ) : null}


                                <p className="mt-1 text-sm text-muted-foreground">
                                  {notification.message}
                                </p>


                                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">

                                  <span className="capitalize">
                                    {notification.category}
                                  </span>


                                  <span>
                                    Created{" "}
                                    {dateTime(
                                      notification.created_at
                                    )}
                                  </span>


                                  {notification.due_at ? (
                                    <span
                                      className={
                                        isOverdue(
                                          notification.due_at
                                        ) &&
                                        !notification.resolved_at
                                          ? "font-bold text-red-700"
                                          : ""
                                      }
                                    >
                                      Due{" "}
                                      {dateTime(
                                        notification.due_at
                                      )}
                                    </span>
                                  ) : null}


                                  {notification.resolved_at ? (
                                    <span>
                                      Resolved{" "}
                                      {dateTime(
                                        notification.resolved_at
                                      )}
                                    </span>
                                  ) : null}

                                </div>

                              </div>

                            </div>


                            <SeverityBadge
                              severity={
                                notification.severity
                              }
                            />

                          </div>


                          {!notification.resolved_at ? (
                            <div className="mt-4 flex flex-wrap gap-2">

                              {notification.action_url ? (
                                <Link
                                  href={
                                    notification.action_url
                                  }
                                  onClick={
                                    () => {
                                      void markRead(
                                        notification
                                      );
                                    }
                                  }
                                  className="inline-flex h-9 items-center gap-2 rounded-xl bg-foreground px-3 text-xs font-bold text-background"
                                >
                                  View
                                </Link>
                              ) : null}


                              {!notification.read_at ? (
                                <button
                                  type="button"
                                  onClick={
                                    () =>
                                      void markRead(
                                        notification
                                      )
                                  }
                                  className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold"
                                >
                                  <Check className="h-4 w-4" />

                                  Mark Read
                                </button>
                              ) : null}


                              <button
                                type="button"
                                disabled={
                                  busy ===
                                  `dismiss-${notification.id}`
                                }
                                onClick={
                                  () =>
                                    void dismissNotification(
                                      notification
                                    )
                                }
                                className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold disabled:opacity-50"
                              >
                                <X className="h-4 w-4" />

                                Dismiss
                              </button>

                            </div>
                          ) : null}

                        </div>
                      )
                    )}

                  </div>
                )}

              </Panel>
            ) : null}


            {activeView ===
              "tasks" &&
            workspace.mode ===
              "management" ? (
              <Panel
                title="Management Follow-up Tasks"
                description="Actionable HR issues automatically become assigned management tasks."
              >

                {workspace.tasks.length ===
                0 ? (
                  <div className="rounded-2xl border border-dashed p-10 text-center">

                    <ClipboardCheck className="mx-auto h-9 w-9 text-muted-foreground" />


                    <p className="mt-3 font-semibold">
                      No open follow-up tasks
                    </p>


                    <p className="mt-1 text-sm text-muted-foreground">
                      There are currently no HR follow-ups assigned to you.
                    </p>

                  </div>
                ) : (
                  <div className="space-y-3">

                    {workspace.tasks.map(
                      (
                        task
                      ) => (
                        <div
                          key={
                            task.id
                          }
                          className="rounded-2xl border p-4"
                        >

                          <div className="flex flex-wrap items-start justify-between gap-3">

                            <div>

                              <div className="flex flex-wrap items-center gap-2">

                                <p className="font-bold">
                                  {task.title}
                                </p>


                                <PriorityBadge
                                  priority={
                                    task.priority
                                  }
                                />

                              </div>


                              {task.employee_name ? (
                                <p className="mt-1 text-sm font-semibold">
                                  {task.employee_name}
                                </p>
                              ) : null}


                              {task.description ? (
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {task.description}
                                </p>
                              ) : null}


                              <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">

                                <span className="capitalize">
                                  {task.category}
                                </span>


                                <span className="capitalize">
                                  {task.status.replaceAll(
                                    "_",
                                    " "
                                  )}
                                </span>


                                {task.due_at ? (
                                  <span
                                    className={
                                      isOverdue(
                                        task.due_at
                                      ) &&
                                      ![
                                        "done",
                                        "dismissed",
                                      ].includes(
                                        task.status
                                      )
                                        ? "font-bold text-red-700"
                                        : ""
                                    }
                                  >
                                    Due{" "}
                                    {dateTime(
                                      task.due_at
                                    )}
                                  </span>
                                ) : null}

                              </div>


                              {task.resolution_notes ? (
                                <p className="mt-3 rounded-xl bg-muted/40 p-3 text-xs">
                                  {task.resolution_notes}
                                </p>
                              ) : null}

                            </div>

                          </div>


                          {task.status ===
                            "open" ||
                          task.status ===
                            "in_progress" ? (
                            <div className="mt-4 flex flex-wrap gap-2">

                              {task.action_url ? (
                                <Link
                                  href={
                                    task.action_url
                                  }
                                  className="inline-flex h-9 items-center rounded-xl bg-foreground px-3 text-xs font-bold text-background"
                                >
                                  Open HR Record
                                </Link>
                              ) : null}


                              {task.status ===
                              "open" ? (
                                <button
                                  type="button"
                                  disabled={
                                    busy ===
                                    `task-${task.id}`
                                  }
                                  onClick={
                                    () =>
                                      void changeTaskStatus(
                                        task,
                                        "in_progress"
                                      )
                                  }
                                  className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold"
                                >
                                  <Clock3 className="h-4 w-4" />

                                  Start
                                </button>
                              ) : null}


                              <button
                                type="button"
                                disabled={
                                  busy ===
                                  `task-${task.id}`
                                }
                                onClick={
                                  () =>
                                    void changeTaskStatus(
                                      task,
                                      "done"
                                    )
                                }
                                className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold"
                              >
                                <CheckCircle2 className="h-4 w-4" />

                                Done
                              </button>


                              <button
                                type="button"
                                disabled={
                                  busy ===
                                  `task-${task.id}`
                                }
                                onClick={
                                  () =>
                                    void changeTaskStatus(
                                      task,
                                      "dismissed"
                                    )
                                }
                                className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold"
                              >
                                <X className="h-4 w-4" />

                                Dismiss
                              </button>

                            </div>
                          ) : null}

                        </div>
                      )
                    )}

                  </div>
                )}

              </Panel>
            ) : null}


            <Panel
              title="Active Workflow Rules"
              description="These rules currently create Nexus HR notifications automatically."
            >

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">

                <RuleCard
                  title="Upcoming Shift"
                  description="Employees receive reminders for scheduled shifts during the next 7 days."
                />


                <RuleCard
                  title="Employee Not Arrived"
                  description="Management is alerted when scheduled staff have not clocked in after the allowed grace period."
                />


                <RuleCard
                  title="Still Clocked In"
                  description="Management is warned when an attendance entry remains open beyond expected working hours."
                />


                <RuleCard
                  title="Attendance Exception"
                  description="Open attendance exceptions automatically become management follow-up tasks."
                />


                <RuleCard
                  title="Leave Approval"
                  description="Pending leave requests generate reminders and review tasks."
                />


                <RuleCard
                  title="Document Expiry"
                  description="Authorised HR management is warned when employee documents expire within 30 days."
                />


                <RuleCard
                  title="Disciplinary Expiry"
                  description="Authorised HR management is reminded before active disciplinary records expire."
                />

              </div>

            </Panel>
          </>
        ) : null}

      </main>

    </DashboardLayout>
  );
}


function RuleCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border p-4">

      <div className="flex items-start gap-3">

        <CheckCircle2 className="mt-0.5 h-5 w-5 text-muted-foreground" />


        <div>

          <p className="font-semibold">
            {title}
          </p>


          <p className="mt-1 text-sm text-muted-foreground">
            {description}
          </p>

        </div>

      </div>

    </div>
  );
}
