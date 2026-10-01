"use client";

import SearchableSelect from "@/components/ui/SearchableSelect";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Mailbox = {
  id: string;
  email_address: string;
  display_name: string | null;
};

type Template = {
  id: string;
  name: string;
  category: string;
  published_version_id: string | null;
};

type Audience = {
  id: string;
  name: string;
};

type Series = {
  id: string;
  name: string;
  description: string | null;
  email_account_id: string;
  template_id: string;
  template_version_id: string;
  audience_id: string;
  subject_override: string | null;
  preheader_override: string | null;
  recurrence_type: "daily" | "weekly" | "monthly" | "yearly";
  recurrence_interval: number;
  weekdays: number[];
  day_of_month: number | null;
  send_time: string;
  timezone: string;
  starts_on: string;
  ends_on: string | null;
  max_occurrences: number | null;
  occurrence_count: number;
  next_run_at: string | null;
  last_run_at: string | null;
  enabled: boolean;
  status: "active" | "paused" | "completed" | "cancelled" | "failed";
  requires_approval: boolean;
  track_opens: boolean;
  track_clicks: boolean;
};

type FormState = {
  id: string | null;
  name: string;
  description: string;
  mailboxId: string;
  templateId: string;
  audienceId: string;
  subjectOverride: string;
  preheaderOverride: string;
  recurrenceType: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  weekdays: number[];
  dayOfMonth: number;
  sendTime: string;
  startsOn: string;
  endMode: "never" | "date" | "count";
  endsOn: string;
  maxOccurrences: number;
  requiresApproval: boolean;
  trackOpens: boolean;
  trackClicks: boolean;
};

const weekdayOptions = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

function todayLocal() {
  const now = new Date();
  const local = new Date(
    now.getTime() - now.getTimezoneOffset() * 60_000
  );

  return local.toISOString().slice(0, 10);
}

function emptyForm(): FormState {
  return {
    id: null,
    name: "",
    description: "",
    mailboxId: "",
    templateId: "",
    audienceId: "",
    subjectOverride: "",
    preheaderOverride: "",
    recurrenceType: "weekly",
    interval: 1,
    weekdays: [1],
    dayOfMonth: 1,
    sendTime: "09:00",
    startsOn: todayLocal(),
    endMode: "never",
    endsOn: "",
    maxOccurrences: 12,
    requiresApproval: false,
    trackOpens: true,
    trackClicks: true,
  };
}

export default function RecurringCampaignStudio() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [isOwner, setIsOwner] = useState(false);

  const [form, setForm] = useState<FormState>(emptyForm());

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState("");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");

    const [
      mailboxResult,
      templateResult,
      audienceResult,
      seriesResult,
    ] = await Promise.all([
      supabase
        .from("email_account")
        .select("id, email_address, display_name")
        .eq("active", true)
        .order("email_address"),

      supabase
        .from("communication_template")
        .select("id, name, category, published_version_id")
        .eq("channel", "email")
        .eq("purpose", "marketing")
        .eq("status", "active")
        .not("published_version_id", "is", null)
        .order("updated_at", { ascending: false }),

      supabase
        .from("marketing_audience")
        .select("id, name")
        .eq("status", "active")
        .order("name"),

      supabase
        .from("marketing_campaign_series")
        .select(
          "id, name, description, email_account_id, template_id, template_version_id, audience_id, subject_override, preheader_override, recurrence_type, recurrence_interval, weekdays, day_of_month, send_time, timezone, starts_on, ends_on, max_occurrences, occurrence_count, next_run_at, last_run_at, enabled, status, requires_approval, track_opens, track_clicks"
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
    ]);

    const firstError =
      mailboxResult.error ||
      templateResult.error ||
      audienceResult.error ||
      seriesResult.error;

    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    const mailboxRows = (mailboxResult.data ?? []) as Mailbox[];
    const templateRows = (templateResult.data ?? []) as Template[];
    const audienceRows = (audienceResult.data ?? []) as Audience[];

    setMailboxes(mailboxRows);
    setTemplates(templateRows);
    setAudiences(audienceRows);
    const { data: ownerData } =
      await supabase.rpc(
        "current_user_is_owner"
      );

    setIsOwner(
      Boolean(ownerData)
    );

    setSeries((seriesResult.data ?? []) as Series[]);

    setForm((current) => ({
      ...current,
      mailboxId:
        current.mailboxId || mailboxRows[0]?.id || "",
      templateId:
        current.templateId || templateRows[0]?.id || "",
      audienceId:
        current.audienceId || audienceRows[0]?.id || "",
    }));

    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkspace();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadWorkspace]);

  const selectedTemplate = useMemo(
    () =>
      templates.find(
        (template) => template.id === form.templateId
      ) ?? null,
    [templates, form.templateId]
  );

  function toggleWeekday(day: number) {
    setForm((current) => {
      const alreadySelected =
        current.weekdays.includes(day);

      return {
        ...current,
        weekdays: alreadySelected
          ? current.weekdays.filter((item) => item !== day)
          : [...current.weekdays, day].sort(),
      };
    });
  }

  function resetForm() {
    const next = emptyForm();

    next.mailboxId = mailboxes[0]?.id ?? "";
    next.templateId = templates[0]?.id ?? "";
    next.audienceId = audiences[0]?.id ?? "";

    setForm(next);
  }

  function editSeries(item: Series) {
    setForm({
      id: item.id,
      name: item.name,
      description: item.description ?? "",
      mailboxId: item.email_account_id,
      templateId: item.template_id,
      audienceId: item.audience_id,
      subjectOverride: item.subject_override ?? "",
      preheaderOverride: item.preheader_override ?? "",
      recurrenceType: item.recurrence_type,
      interval: item.recurrence_interval,
      weekdays: item.weekdays ?? [],
      dayOfMonth: item.day_of_month ?? 1,
      sendTime: item.send_time.slice(0, 5),
      startsOn: item.starts_on,
      endMode: item.ends_on
        ? "date"
        : item.max_occurrences
          ? "count"
          : "never",
      endsOn: item.ends_on ?? "",
      maxOccurrences: item.max_occurrences ?? 12,
      requiresApproval: item.requires_approval,
      trackOpens: item.track_opens,
      trackClicks: item.track_clicks,
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function saveSeries(event: FormEvent) {
    event.preventDefault();

    setError("");
    setNotice("");

    if (!form.name.trim()) {
      setError("Campaign series name is required.");
      return;
    }

    if (!form.mailboxId) {
      setError("Select a sending mailbox.");
      return;
    }

    if (!selectedTemplate?.published_version_id) {
      setError("Select a published marketing template.");
      return;
    }

    if (!form.audienceId) {
      setError("Select an audience.");
      return;
    }

    if (
      form.recurrenceType === "weekly" &&
      form.weekdays.length === 0
    ) {
      setError("Select at least one weekday.");
      return;
    }

    setSaving(true);

    const { error: rpcError } = await supabase.rpc(
      "marketing_save_recurring_series",
      {
        p_series_id: form.id,
        p_name: form.name.trim(),
        p_description: form.description.trim() || null,
        p_email_account_id: form.mailboxId,
        p_template_id: selectedTemplate.id,
        p_template_version_id:
          selectedTemplate.published_version_id,
        p_audience_id: form.audienceId,
        p_subject_override:
          form.subjectOverride.trim() || null,
        p_preheader_override:
          form.preheaderOverride.trim() || null,

        p_recurrence_type: form.recurrenceType,
        p_interval: form.interval,
        p_weekdays:
          form.recurrenceType === "weekly"
            ? form.weekdays
            : [],
        p_day_of_month:
          form.recurrenceType === "monthly"
            ? form.dayOfMonth
            : null,

        p_send_time: form.sendTime,
        p_timezone: "Africa/Johannesburg",
        p_starts_on: form.startsOn,

        p_ends_on:
          form.endMode === "date"
            ? form.endsOn || null
            : null,

        p_max_occurrences:
          form.endMode === "count"
            ? form.maxOccurrences
            : null,

        p_requires_approval: form.requiresApproval,
        p_track_opens: form.trackOpens,
        p_track_clicks: form.trackClicks,

        p_branch_id: null,

        p_settings: {
          editor: "nexus_recurring_campaign_studio_v1",
        },
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setSaving(false);
      return;
    }

    setNotice(
      form.id
        ? "Recurring campaign updated."
        : "Recurring campaign created."
    );

    resetForm();
    await loadWorkspace();

    setSaving(false);
  }

  async function runAction(
    id: string,
    action: "pause" | "resume" | "cancel"
  ) {
    if (
      action === "cancel" &&
      !window.confirm(
        "Cancel this recurring campaign permanently?"
      )
    ) {
      return;
    }

    setActionId(id);
    setError("");
    setNotice("");

    const rpc =
      action === "pause"
        ? "marketing_pause_recurring_series"
        : action === "resume"
          ? "marketing_resume_recurring_series"
          : "marketing_cancel_recurring_series";

    const { error: rpcError } = await supabase.rpc(
      rpc,
      {
        p_series_id: id,
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setActionId("");
      return;
    }

    setNotice(
      action === "pause"
        ? "Recurring campaign paused."
        : action === "resume"
          ? "Recurring campaign resumed."
          : "Recurring campaign cancelled."
    );

    await loadWorkspace();
    setActionId("");
  }

  async function trashSeries(
    id: string
  ) {
    if (!isOwner) {
      return;
    }

    if (
      !window.confirm(
        "Move this email schedule to the Nexus Recycle Bin? Future automatic runs will stop immediately."
      )
    ) {
      return;
    }

    setActionId(id);

    const {
      error: rpcError,
    } =
      await supabase.rpc(
        "marketing_owner_trash_recurring_series",
        {
          p_series_id: id,
        }
      );

    if (rpcError) {
      window.alert(
        rpcError.message
      );

      setActionId("");
      return;
    }

    setSeries(
      (current) =>
        current.filter(
          (item) =>
            item.id !== id
        )
    );

    setActionId("");
  }


  function scheduleDescription(item: Series) {
    if (item.recurrence_type === "daily") {
      return item.recurrence_interval === 1
        ? "Every day"
        : `Every ${item.recurrence_interval} days`;
    }

    if (item.recurrence_type === "weekly") {
      const days = weekdayOptions
        .filter((day) =>
          item.weekdays?.includes(day.value)
        )
        .map((day) => day.label)
        .join(", ");

      return item.recurrence_interval === 1
        ? `Every week · ${days}`
        : `Every ${item.recurrence_interval} weeks · ${days}`;
    }

    if (item.recurrence_type === "yearly") {
      const [, monthValue, dayValue] =
        item.starts_on
          .split("-")
          .map(Number);

      const yearlyDate =
        new Intl.DateTimeFormat(
          "en-ZA",
          {
            day: "numeric",
            month: "long",
          }
        ).format(
          new Date(
            2000,
            monthValue - 1,
            dayValue
          )
        );

      return item.recurrence_interval === 1
        ? `Every year · ${yearlyDate}`
        : `Every ${item.recurrence_interval} years · ${yearlyDate}`;
    }

    return item.recurrence_interval === 1
      ? `Every month · day ${item.day_of_month}`
      : `Every ${item.recurrence_interval} months · day ${item.day_of_month}`;
  }

  if (loading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading recurring campaigns...
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm text-muted-foreground">
            Nexus Email Marketing
          </div>

          <h1 className="text-2xl font-semibold">
            Recurring Campaigns
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Schedule repeat campaigns and adjust their
            recurrence at any time.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/email/marketing"
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            Campaigns
          </Link>

          <Link
            href="/email/templates"
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            Templates
          </Link>

          <Link
            href="/email/bulk"
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            Bulk Email
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form
          onSubmit={saveSeries}
          className="h-fit space-y-5 rounded-xl border bg-card p-5"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">
                {form.id
                  ? "Edit Recurrence"
                  : "New Recurring Campaign"}
              </h2>

              <p className="mt-1 text-xs text-muted-foreground">
                All times use Africa/Johannesburg.
              </p>
            </div>

            {form.id ? (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-medium text-primary"
              >
                New
              </button>
            ) : null}
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium">
              Series name
            </span>

            <input
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Weekly JINLAB Offers"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">
              Description
            </span>

            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">
              Sending mailbox
            </span>

            <SearchableSelect searchLabel="Mailboxes"
              value={form.mailboxId}
              onValueChange={(selectedValue) =>
                setForm((current) => ({
                  ...current,
                  mailboxId: selectedValue,
                }))
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {mailboxes.map((mailbox) => (
                <option
                  key={mailbox.id}
                  value={mailbox.id}
                >
                  {mailbox.display_name ||
                    mailbox.email_address}
                </option>
              ))}
            </SearchableSelect>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">
              Marketing template
            </span>

            <SearchableSelect searchLabel="Templates"
              value={form.templateId}
              onValueChange={(selectedValue) =>
                setForm((current) => ({
                  ...current,
                  templateId: selectedValue,
                }))
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {templates.map((template) => (
                <option
                  key={template.id}
                  value={template.id}
                >
                  {template.name}
                </option>
              ))}
            </SearchableSelect>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">
              Audience
            </span>

            <SearchableSelect searchLabel="Audiences"
              value={form.audienceId}
              onValueChange={(selectedValue) =>
                setForm((current) => ({
                  ...current,
                  audienceId: selectedValue,
                }))
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {audiences.map((audience) => (
                <option
                  key={audience.id}
                  value={audience.id}
                >
                  {audience.name}
                </option>
              ))}
            </SearchableSelect>
          </label>

          <div className="space-y-3">
            <span className="text-sm font-medium">
              Frequency
            </span>

            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 p-4">
              <span className="text-sm font-medium">
                Every
              </span>

              <input
                type="number"
                min={1}
                max={365}
                value={form.interval}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    interval: Math.max(
                      1,
                      Number(event.target.value)
                    ),
                  }))
                }
                className="w-20 rounded-md border bg-background px-3 py-2 text-sm"
              />

              <select
                value={form.recurrenceType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    recurrenceType:
                      event.target.value as FormState["recurrenceType"],
                  }))
                }
                className="min-w-32 rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="daily">
                  {form.interval === 1
                    ? "Day"
                    : "Days"}
                </option>

                <option value="weekly">
                  {form.interval === 1
                    ? "Week"
                    : "Weeks"}
                </option>

                <option value="monthly">
                  {form.interval === 1
                    ? "Month"
                    : "Months"}
                </option>

                <option value="yearly">
                  {form.interval === 1
                    ? "Year"
                    : "Years"}
                </option>
              </select>
            </div>

            {form.recurrenceType === "yearly" ? (
              <p className="text-xs text-muted-foreground">
                Yearly schedules use the month and day
                from the Start date below.
              </p>
            ) : null}
          </div>

          {form.recurrenceType === "weekly" ? (
            <div className="space-y-2">
              <span className="text-sm font-medium">
                Send on
              </span>

              <div className="flex flex-wrap gap-2">
                {weekdayOptions.map((day) => {
                  const selected =
                    form.weekdays.includes(day.value);

                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() =>
                        toggleWeekday(day.value)
                      }
                      className={`rounded-full border px-3 py-1.5 text-xs ${
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {form.recurrenceType === "monthly" ? (
            <label className="block space-y-2">
              <span className="text-sm font-medium">
                Day of month
              </span>

              <input
                type="number"
                min={1}
                max={31}
                value={form.dayOfMonth}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    dayOfMonth: Math.min(
                      31,
                      Math.max(
                        1,
                        Number(event.target.value)
                      )
                    ),
                  }))
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </label>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-2">
              <span className="text-sm font-medium">
                Start
              </span>

              <input
                type="date"
                value={form.startsOn}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    startsOn: event.target.value,
                  }))
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium">
                Send at
              </span>

              <input
                type="time"
                value={form.sendTime}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sendTime: event.target.value,
                  }))
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="space-y-3 rounded-xl border p-4">
            <div className="text-sm font-medium">
              Ends
            </div>

            {(
              [
                ["never", "Never"],
                ["date", "On date"],
                ["count", "After number of sends"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="flex items-center gap-3 text-sm"
              >
                <input
                  type="radio"
                  checked={form.endMode === value}
                  onChange={() =>
                    setForm((current) => ({
                      ...current,
                      endMode: value,
                    }))
                  }
                />

                {label}
              </label>
            ))}

            {form.endMode === "date" ? (
              <input
                type="date"
                value={form.endsOn}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    endsOn: event.target.value,
                  }))
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            ) : null}

            {form.endMode === "count" ? (
              <input
                type="number"
                min={1}
                value={form.maxOccurrences}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    maxOccurrences: Math.max(
                      1,
                      Number(event.target.value)
                    ),
                  }))
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            ) : null}
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium">
              Subject override
            </span>

            <input
              value={form.subjectOverride}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  subjectOverride: event.target.value,
                }))
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </label>

          <div className="space-y-3 rounded-xl border p-4">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={form.requiresApproval}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    requiresApproval:
                      event.target.checked,
                  }))
                }
              />
              Require approval for each run
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={form.trackOpens}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    trackOpens:
                      event.target.checked,
                  }))
                }
              />
              Track opens
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={form.trackClicks}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    trackClicks:
                      event.target.checked,
                  }))
                }
              />
              Track clicks
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving
              ? "Saving..."
              : form.id
                ? "Update Recurrence"
                : "Create Recurring Campaign"}
          </button>
        </form>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-5">
              <div className="text-sm text-muted-foreground">
                Recurring campaigns
              </div>

              <div className="mt-2 text-3xl font-semibold">
                {series.length}
              </div>
            </div>

            <div className="rounded-xl border bg-card p-5">
              <div className="text-sm text-muted-foreground">
                Active
              </div>

              <div className="mt-2 text-3xl font-semibold">
                {
                  series.filter(
                    (item) => item.status === "active"
                  ).length
                }
              </div>
            </div>

            <div className="rounded-xl border bg-card p-5">
              <div className="text-sm text-muted-foreground">
                Paused
              </div>

              <div className="mt-2 text-3xl font-semibold">
                {
                  series.filter(
                    (item) => item.status === "paused"
                  ).length
                }
              </div>
            </div>
          </div>

          <section className="overflow-hidden rounded-xl border bg-card">
            <div className="border-b p-5">
              <h2 className="font-semibold">
                Recurring Campaign Schedule
              </h2>

              <p className="mt-1 text-xs text-muted-foreground">
                Pause, resume or adjust recurrence at any time.
              </p>
            </div>

            <div className="divide-y">
              {series.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No recurring campaigns yet.
                </div>
              ) : (
                series.map((item) => {
                  const template =
                    templates.find(
                      (value) =>
                        value.id === item.template_id
                    );

                  const audience =
                    audiences.find(
                      (value) =>
                        value.id === item.audience_id
                    );

                  return (
                    <div
                      key={item.id}
                      className="p-5"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-medium">
                              {item.name}
                            </div>

                            <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium uppercase">
                              {item.status}
                            </span>
                          </div>

                          <div className="mt-2 text-sm text-muted-foreground">
                            {scheduleDescription(item)}
                            {" · "}
                            {item.send_time.slice(0, 5)}
                          </div>

                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                            <span>
                              Template:{" "}
                              {template?.name ?? "Unknown"}
                            </span>

                            <span>
                              Audience:{" "}
                              {audience?.name ?? "Unknown"}
                            </span>

                            <span>
                              Sent runs:{" "}
                              {item.occurrence_count}
                            </span>
                          </div>

                          <div className="mt-3 text-xs">
                            <span className="text-muted-foreground">
                              Next send:{" "}
                            </span>

                            <span className="font-medium">
                              {item.next_run_at
                                ? new Date(
                                    item.next_run_at
                                  ).toLocaleString()
                                : "None scheduled"}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              editSeries(item)
                            }
                            className="rounded-md border px-3 py-2 text-xs hover:bg-muted"
                          >
                            Edit
                          </button>

                          {item.status === "active" ? (
                            <button
                              type="button"
                              disabled={actionId === item.id}
                              onClick={() =>
                                void runAction(
                                  item.id,
                                  "pause"
                                )
                              }
                              className="rounded-md border px-3 py-2 text-xs hover:bg-muted disabled:opacity-50"
                            >
                              Pause
                            </button>
                          ) : null}

                          {item.status === "paused" ? (
                            <button
                              type="button"
                              disabled={actionId === item.id}
                              onClick={() =>
                                void runAction(
                                  item.id,
                                  "resume"
                                )
                              }
                              className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
                            >
                              Resume
                            </button>
                          ) : null}

                          {![
                            "cancelled",
                            "completed",
                          ].includes(item.status) ? (
                            <button
                              type="button"
                              disabled={actionId === item.id}
                              onClick={() =>
                                void runAction(
                                  item.id,
                                  "cancel"
                                )
                              }
                              className="rounded-md border px-3 py-2 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          ) : null}

                          {isOwner ? (
                            <button
                              type="button"
                              disabled={
                                actionId === item.id
                              }
                              onClick={() =>
                                void trashSeries(
                                  item.id
                                )
                              }
                              className="rounded-md border px-3 py-2 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                            >
                              Move to Recycle Bin
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
