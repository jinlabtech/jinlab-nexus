"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type EmailAccount = {
  id: string;
  email_address: string;
  display_name: string | null;
  active: boolean;
};

type BulkBatch = {
  id: string;
  name: string;
  purpose: string;
  subject: string;
  status: string;
  scheduled_at: string | null;
  created_at: string;
};

type ParsedRecipient = {
  email: string;
  name: string | null;
};

function parseRecipients(value: string): ParsedRecipient[] {
  const emailRegex =
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

  const result = new Map<string, ParsedRecipient>();

  for (const rawLine of value.replaceAll(";", "\n").split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const emails = line.match(emailRegex) ?? [];

    for (const emailValue of emails) {
      const email = emailValue.toLowerCase().trim();

      let name: string | null = null;

      if (emails.length === 1) {
        const possibleName = line
          .replace(emailValue, "")
          .replace(/[<>,"]/g, "")
          .trim();

        if (possibleName && possibleName !== email) {
          name = possibleName;
        }
      }

      result.set(email, {
        email,
        name,
      });
    }
  }

  return Array.from(result.values());
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export default function BulkEmailComposer() {
  const [mailboxes, setMailboxes] = useState<EmailAccount[]>([]);
  const [batches, setBatches] = useState<BulkBatch[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [trashingId, setTrashingId] = useState("");

  const [emailAccountId, setEmailAccountId] = useState("");
  const [batchName, setBatchName] = useState("");
  const [purpose, setPurpose] = useState("notification");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [recipientText, setRecipientText] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const [loading, setLoading] = useState(true);
  const [queueing, setQueueing] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const recipients = useMemo(
    () => parseRecipients(recipientText),
    [recipientText]
  );

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");

    const [mailboxResult, batchResult] = await Promise.all([
      supabase
        .from("email_account")
        .select("id, email_address, display_name, active")
        .eq("active", true)
        .order("email_address"),

      supabase
        .from("email_bulk_batch")
        .select(
          "id, name, purpose, subject, status, scheduled_at, created_at"
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (mailboxResult.error) {
      setError(mailboxResult.error.message);
      setLoading(false);
      return;
    }

    if (batchResult.error) {
      setError(batchResult.error.message);
      setLoading(false);
      return;
    }

    const activeMailboxes =
      (mailboxResult.data ?? []) as EmailAccount[];

    setMailboxes(activeMailboxes);
    const { data: ownerData } =
      await supabase.rpc(
        "current_user_is_owner"
      );

    setIsOwner(
      Boolean(ownerData)
    );

    setBatches((batchResult.data ?? []) as BulkBatch[]);

    setEmailAccountId((current) => {
      if (
        current &&
        activeMailboxes.some((mailbox) => mailbox.id === current)
      ) {
        return current;
      }

      return activeMailboxes[0]?.id ?? "";
    });

    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkspace();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadWorkspace]);

  async function createAndQueue(event: FormEvent) {
    event.preventDefault();

    setError("");
    setNotice("");

    if (!emailAccountId) {
      setError("Select a sending mailbox.");
      return;
    }

    if (!batchName.trim()) {
      setError("Enter a name for this bulk email.");
      return;
    }

    if (!subject.trim()) {
      setError("Email subject is required.");
      return;
    }

    if (!message.trim()) {
      setError("Write the email message.");
      return;
    }

    if (recipients.length === 0) {
      setError("Add at least one valid email address.");
      return;
    }

    if (recipients.length > 1000) {
      setError(
        "This screen currently supports up to 1,000 recipients per batch."
      );
      return;
    }

    const confirmed = window.confirm(
      `Queue this email for ${recipients.length} recipient${
        recipients.length === 1 ? "" : "s"
      }? Each person will receive a private copy.`
    );

    if (!confirmed) {
      return;
    }

    setQueueing(true);

    const safeMessage = escapeHtml(message)
      .replace(/\r?\n/g, "<br />");

    const htmlBody = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;font-size:15px;color:#111827;">
        ${safeMessage}
      </div>
    `;

    const {
      data: createData,
      error: createError,
    } = await supabase.rpc("email_create_bulk_batch", {
      p_email_account_id: emailAccountId,
      p_name: batchName.trim(),
      p_subject: subject.trim(),
      p_purpose: purpose,
      p_html_body: htmlBody,
      p_text_body: message.trim(),
      p_template_version_id: null,
      p_branch_id: null,
      p_scheduled_at: scheduledAt
        ? new Date(scheduledAt).toISOString()
        : null,
      p_settings: {
        composer: "nexus_bulk_email_v1",
      },
    });

    if (createError) {
      setError(createError.message);
      setQueueing(false);
      return;
    }

    const createResult = createData as {
      batch_id?: string;
    };

    if (!createResult?.batch_id) {
      setError("Nexus created the batch but did not return its ID.");
      setQueueing(false);
      return;
    }

    const batchId = createResult.batch_id;

    const {
      error: recipientError,
    } = await supabase.rpc("email_add_bulk_recipients", {
      p_batch_id: batchId,
      p_recipients: recipients.map((recipient) => ({
        email: recipient.email,
        name: recipient.name,
        variables: {},
      })),
      p_source: "manual",
    });

    if (recipientError) {
      setError(
        `Batch created, but recipients could not be added: ${recipientError.message}`
      );
      setQueueing(false);
      await loadWorkspace();
      return;
    }

    const {
      data: queueData,
      error: queueError,
    } = await supabase.rpc("email_queue_bulk_batch", {
      p_batch_id: batchId,
    });

    if (queueError) {
      setError(
        `Batch and recipients were saved, but queueing failed: ${queueError.message}`
      );
      setQueueing(false);
      await loadWorkspace();
      return;
    }

    const queueResult = queueData as {
      queued_count?: number;
      skipped_count?: number;
      existing_job_count?: number;
    };

    setNotice(
      `${queueResult.queued_count ?? 0} email${
        (queueResult.queued_count ?? 0) === 1 ? "" : "s"
      } queued. ${queueResult.skipped_count ?? 0} skipped.`
    );

    setBatchName("");
    setSubject("");
    setMessage("");
    setRecipientText("");
    setScheduledAt("");

    await loadWorkspace();

    setQueueing(false);
  }

  if (loading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading Nexus Bulk Email...
      </div>
    );
  }

  async function trashBatch(
    batchId: string
  ) {
    if (!isOwner) {
      return;
    }

    if (
      !window.confirm(
        "Move this bulk email to the Nexus Recycle Bin? Any queued unsent deliveries will be cancelled."
      )
    ) {
      return;
    }

    setTrashingId(
      batchId
    );

    const {
      error: rpcError,
    } =
      await supabase.rpc(
        "email_owner_trash_bulk_batch",
        {
          p_batch_id:
            batchId,
        }
      );

    if (rpcError) {
      window.alert(
        rpcError.message
      );

      setTrashingId("");
      return;
    }

    setBatches(
      (current) =>
        current.filter(
          (batch) =>
            batch.id !==
            batchId
        )
    );

    setTrashingId("");
  }


  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm text-muted-foreground">
            Nexus Communications
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">
            Bulk Email
          </h1>

          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Send one message privately to many recipients without exposing
            their email addresses to each other.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/email"
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            Email
          </Link>

          <Link
            href="/email/templates"
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            Templates
          </Link>

          <Link
            href="/email/marketing"
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            Marketing
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_380px]">
        <form
          onSubmit={createAndQueue}
          className="space-y-6 rounded-xl border bg-card p-5"
        >
          <div>
            <h2 className="text-lg font-semibold">
              Compose Bulk Email
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Recruitment correspondence should normally use Notification.
              Promotions should use Marketing.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">
              Send from
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              {mailboxes.map((mailbox) => {
                const selected =
                  mailbox.id === emailAccountId;




  return (
                  <button
                    key={mailbox.id}
                    type="button"
                    onClick={() =>
                      setEmailAccountId(mailbox.id)
                    }
                    className={`rounded-lg border p-4 text-left transition ${
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {mailbox.display_name || "Business mailbox"}
                        </div>

                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {mailbox.email_address}
                        </div>
                      </div>

                      <div
                        className={`h-4 w-4 shrink-0 rounded-full border ${
                          selected
                            ? "border-primary bg-primary"
                            : "border-muted-foreground/40"
                        }`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium">
                Batch name
              </span>

              <input
                value={batchName}
                onChange={(event) =>
                  setBatchName(event.target.value)
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Sales applicants - first response"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium">
                Purpose
              </span>

              <select
                value={purpose}
                onChange={(event) =>
                  setPurpose(event.target.value)
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="notification">
                  Recruitment / Notification
                </option>

                <option value="transactional">
                  Transactional
                </option>

                <option value="marketing">
                  Marketing
                </option>

                <option value="internal">
                  Internal
                </option>
              </select>
            </label>
          </div>

          {purpose === "marketing" ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs">
              Marketing recipients are checked against Nexus consent and
              suppression records before they can be queued.
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">
                Recipients
              </span>

              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                {recipients.length}
              </span>
            </div>

            <textarea
              value={recipientText}
              onChange={(event) =>
                setRecipientText(event.target.value)
              }
              className="min-h-44 w-full rounded-md border bg-background px-3 py-3 font-mono text-sm"
              placeholder={`One recipient per line:

Nomsa <nomsa@example.com>
Thabo, thabo@example.com
customer@example.com`}
            />

            <div className="text-xs text-muted-foreground">
              Duplicate email addresses are automatically removed.
            </div>
          </div>

          {recipients.length > 0 ? (
            <div className="rounded-xl border">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <span className="text-sm font-medium">
                  Recipient Preview
                </span>

                <span className="text-xs text-muted-foreground">
                  Showing {Math.min(recipients.length, 8)} of{" "}
                  {recipients.length}
                </span>
              </div>

              <div className="divide-y">
                {recipients.slice(0, 8).map((recipient) => (
                  <div
                    key={recipient.email}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {recipient.name || "Recipient"}
                      </div>

                      <div className="truncate text-xs text-muted-foreground">
                        {recipient.email}
                      </div>
                    </div>

                    <span className="rounded-full bg-green-500/10 px-2 py-1 text-[10px] font-medium text-green-700">
                      Valid
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <label className="block space-y-2">
            <span className="text-sm font-medium">
              Subject
            </span>

            <input
              value={subject}
              onChange={(event) =>
                setSubject(event.target.value)
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Application for JINLAB Sales Position"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">
              Message
            </span>

            <textarea
              value={message}
              onChange={(event) =>
                setMessage(event.target.value)
              }
              className="min-h-64 w-full rounded-md border bg-background px-3 py-3 text-sm leading-6"
              placeholder="Thank you for applying for the JINLAB Sales position..."
            />
          </label>

          <label className="block max-w-sm space-y-2">
            <span className="text-sm font-medium">
              Schedule
            </span>

            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) =>
                setScheduledAt(event.target.value)
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />

            <span className="block text-xs text-muted-foreground">
              Leave empty to queue immediately.
            </span>
          </label>

          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="text-sm font-medium">
              Privacy & delivery
            </div>

            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Nexus creates a separate delivery job for every recipient.
              Email addresses are never placed together in a public To or CC
              list.
            </p>
          </div>

          <button
            type="submit"
            disabled={
              queueing ||
              recipients.length === 0 ||
              !emailAccountId
            }
            className="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {queueing
              ? "Preparing Bulk Email..."
              : `Queue ${recipients.length || ""} Email${
                  recipients.length === 1 ? "" : "s"
                }`}
          </button>
        </form>

        <div className="space-y-5">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">
              Delivery Summary
            </h2>

            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Recipients
                </span>

                <span className="font-semibold">
                  {recipients.length}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Purpose
                </span>

                <span className="font-medium capitalize">
                  {purpose}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Delivery
                </span>

                <span className="font-medium">
                  {scheduledAt ? "Scheduled" : "Immediate queue"}
                </span>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border bg-card">
            <div className="border-b p-5">
              <h2 className="font-semibold">
                Recent Bulk Emails
              </h2>
            </div>

            <div className="divide-y">
              {batches.length === 0 ? (
                <div className="p-5 text-sm text-muted-foreground">
                  No bulk email batches yet.
                </div>
              ) : (
                batches.map((batch) => (
                  <div
                    key={batch.id}
                    className="p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {batch.name}
                        </div>

                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {batch.subject}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium uppercase">
                          {batch.status}
                        </span>

                        {isOwner ? (
                          <button
                            type="button"
                            disabled={
                              trashingId === batch.id
                            }
                            onClick={() =>
                              void trashBatch(
                                batch.id
                              )
                            }
                            className="rounded-md border px-2.5 py-1.5 text-[11px] text-destructive hover:bg-destructive/10 disabled:opacity-50"
                          >
                            {trashingId === batch.id
                              ? "Moving..."
                              : "Move to Recycle Bin"}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-2 text-[11px] text-muted-foreground">
                      {new Date(batch.created_at).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
