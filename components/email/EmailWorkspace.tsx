"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type EmailAccount = {
  id: string;
  email_address: string;
  display_name: string | null;
  account_type: string;
  department: string | null;
  provider: string;
  branch_id: string | null;
  active: boolean;
  sync_enabled: boolean;
  last_synced_at: string | null;
};

type EmailThread = {
  id: string;
  account_id: string;
  customer_id: string | null;
  subject: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  unread_count: number;
  last_message_at: string;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
};

type EmailRecipient = {
  type: string;
  email_address: string;
  display_name: string | null;
};

type EmailMessage = {
  id: string;
  direction: "inbound" | "outbound";
  message_state: string;
  subject: string;
  from_address: string;
  reply_to_address: string | null;
  body_text: string;
  body_html: string | null;
  preview_text: string | null;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
  recipients: EmailRecipient[];
};

type ThreadResponse = {
  thread: EmailThread;
  messages: EmailMessage[];
};

type WorkspaceResponse = {
  accounts: EmailAccount[];
  threads: EmailThread[];
};

function formatDate(value: string | null) {
  if (!value) return "";

  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function EmailWorkspace() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [selectedThread, setSelectedThread] =
    useState<ThreadResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [error, setError] = useState("");

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);
  const [notice, setNotice] = useState("");

  const activeAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId]
  );

  const loadWorkspace = useCallback(
    async (accountId?: string) => {
      setLoading(true);
      setError("");

      const { data, error: rpcError } = await supabase.rpc(
        "get_email_workspace",
        {
          p_account_id: accountId || null,
          p_limit: 100,
        }
      );

      if (rpcError) {
        setError(rpcError.message);
        setLoading(false);
        return;
      }

      const workspace = (data ?? {
        accounts: [],
        threads: [],
      }) as WorkspaceResponse;

      setAccounts(workspace.accounts ?? []);
      setThreads(workspace.threads ?? []);

      if (
        !accountId &&
        !selectedAccountId &&
        (workspace.accounts ?? []).length > 0
      ) {
        setSelectedAccountId(workspace.accounts[0].id);
      }

      setLoading(false);
    },
    [selectedAccountId]
  );

  const loadThread = useCallback(async (threadId: string) => {
    setSelectedThreadId(threadId);
    setThreadLoading(true);
    setError("");

    const { data, error: rpcError } = await supabase.rpc("get_email_thread", {
      p_thread_id: threadId,
    });

    if (rpcError) {
      setError(rpcError.message);
      setSelectedThread(null);
      setThreadLoading(false);
      return;
    }

    setSelectedThread(data as ThreadResponse);
    setThreadLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkspace();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadWorkspace]);

  useEffect(() => {
    if (!selectedAccountId) return;

    const timer = window.setTimeout(() => {
      void loadWorkspace(selectedAccountId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [selectedAccountId, loadWorkspace]);

  async function sendEmail() {
    if (!selectedAccountId) {
      setError("Select an email account first.");
      return;
    }

    if (!composeTo.trim()) {
      setError("Enter a recipient email address.");
      return;
    }

    if (!composeBody.trim()) {
      setError("Enter a message.");
      return;
    }

    setSavingDraft(true);
    setError("");
    setNotice("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        setError("Your Nexus session has expired. Please sign in again.");
        return;
      }

      const recipients = composeTo
        .split(/[;,]/)
        .map((email) => email.trim())
        .filter(Boolean);

      const response = await fetch("/api/email/google/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountId: selectedAccountId,
          to: recipients,
          subject: composeSubject.trim() || "(No subject)",
          bodyText: composeBody.trim(),
        }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
        providerMessageId?: string;
      };

      if (!response.ok || !result.success) {
        setError(result.error || "Unable to send email.");
        return;
      }

      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      setComposeOpen(false);
      setNotice("Email sent successfully through Google and recorded in Nexus.");

      await loadWorkspace(selectedAccountId);
    } catch {
      setError("Unable to send email. Please try again.");
    } finally {
      setSavingDraft(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <div className="border-b bg-background">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              JINLAB Nexus
            </p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">
              Email
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Company-controlled business communication
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/email/mailboxes"
              className="rounded-xl border bg-background px-4 py-3 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted"
            >
              Manage Mailboxes
            </Link>

            <button
              type="button"
              onClick={() => {
                setNotice("");
                setError("");
                setComposeOpen(true);
              }}
              disabled={!selectedAccountId}
              className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Compose
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] p-6">
        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </div>
        ) : null}

        <div className="grid min-h-[680px] overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:grid-cols-[250px_380px_1fr]">
          <aside className="border-b border-border bg-card p-4 text-white lg:border-b-0 lg:border-r">
            <div className="mb-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                Mailboxes
              </p>

              {accounts.length === 0 && !loading ? (
                <div className="rounded-xl bg-card/5 p-3 text-sm text-muted-foreground/70">
                  No mailbox is currently available to your Nexus account.
                </div>
              ) : null}

              <div className="space-y-2">
                {accounts.map((account) => {
                  const active = selectedAccountId === account.id;

                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => {
                        setSelectedAccountId(account.id);
                        setSelectedThreadId("");
                        setSelectedThread(null);
                      }}
                      className={`w-full rounded-xl px-3 py-3 text-left transition ${
                        active
                          ? "bg-primary text-white"
                          : "text-muted-foreground hover:bg-card/10"
                      }`}
                    >
                      <div className="truncate text-sm font-semibold">
                        {account.display_name || account.email_address}
                      </div>
                      <div
                        className={`mt-1 truncate text-xs ${
                          active ? "text-primary-foreground/80" : "text-muted-foreground"
                        }`}
                      >
                        {account.email_address}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                Provider-independent Nexus mailbox
              </p>
            </div>
          </aside>

          <section className="border-b border-border lg:border-b-0 lg:border-r">
            <div className="border-b border-border px-4 py-4">
              <p className="text-sm font-bold text-foreground">Inbox</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {activeAccount?.email_address || "Select a mailbox"}
              </p>
            </div>

            <div className="max-h-[680px] overflow-y-auto">
              {loading ? (
                <div className="p-6 text-sm text-muted-foreground">
                  Loading Nexus Email…
                </div>
              ) : threads.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="text-sm font-semibold text-foreground">
                    Your inbox is ready
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Messages will appear here when this mailbox begins
                    receiving or creating communication.
                  </p>
                </div>
              ) : (
                threads.map((thread) => {
                  const selected = selectedThreadId === thread.id;

                  return (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => void loadThread(thread.id)}
                      className={`block w-full border-b border-border px-4 py-4 text-left transition ${
                        selected
                          ? "bg-primary/10"
                          : "bg-card hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p
                          className={`line-clamp-1 text-sm ${
                            thread.unread_count > 0
                              ? "font-bold text-foreground"
                              : "font-semibold text-foreground"
                          }`}
                        >
                          {thread.subject || "(No subject)"}
                        </p>

                        {thread.unread_count > 0 ? (
                          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
                            {thread.unread_count}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-xs capitalize text-muted-foreground">
                          {thread.priority}
                        </span>
                        <span className="text-xs text-muted-foreground/70">
                          {formatDate(thread.last_message_at)}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <main className="min-w-0 bg-card">
            {!selectedThreadId ? (
              <div className="flex h-full min-h-[520px] items-center justify-center p-8">
                <div className="max-w-md text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
                    ✉
                  </div>
                  <h2 className="mt-5 text-lg font-bold text-foreground">
                    Nexus Email
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Select a conversation to read it, or compose a new
                    company-controlled email.
                  </p>
                </div>
              </div>
            ) : threadLoading ? (
              <div className="p-8 text-sm text-muted-foreground">
                Loading conversation…
              </div>
            ) : selectedThread ? (
              <div>
                <div className="border-b border-border px-6 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-foreground">
                        {selectedThread.thread.subject}
                      </h2>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-muted px-2.5 py-1 font-medium capitalize text-muted-foreground">
                          {selectedThread.thread.status}
                        </span>
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium capitalize text-primary">
                          {selectedThread.thread.priority}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="max-h-[600px] space-y-4 overflow-y-auto bg-muted/30 p-6">
                  {selectedThread.messages.map((message) => (
                    <article
                      key={message.id}
                      className="rounded-2xl border border-border bg-card p-5 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                        <div>
                          <p className="text-sm font-bold text-foreground">
                            {message.from_address}
                          </p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            To:{" "}
                            {message.recipients
                              .filter(
                                (recipient) =>
                                  recipient.type === "to"
                              )
                              .map(
                                (recipient) =>
                                  recipient.email_address
                              )
                              .join(", ") || "—"}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-xs capitalize text-muted-foreground">
                            {message.message_state}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground/70">
                            {formatDate(
                              message.sent_at ||
                                message.received_at ||
                                message.created_at
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="whitespace-pre-wrap break-words pt-5 text-sm leading-7 text-foreground/80">
                        {message.body_text || "(No message text)"}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </main>
        </div>
      </div>

      {composeOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-card/40 p-4 sm:items-center">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="font-bold text-foreground">
                  New Email
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  From {activeAccount?.email_address}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setComposeOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  To
                </label>
                <input
                  value={composeTo}
                  onChange={(event) => setComposeTo(event.target.value)}
                  type="email"
                  placeholder="customer@example.com"
                  className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Subject
                </label>
                <input
                  value={composeSubject}
                  onChange={(event) =>
                    setComposeSubject(event.target.value)
                  }
                  placeholder="Subject"
                  className="w-full rounded-xl border border-border px-4 py-3 text-sm outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Message
                </label>
                <textarea
                  value={composeBody}
                  onChange={(event) => setComposeBody(event.target.value)}
                  rows={10}
                  placeholder="Write your message…"
                  className="w-full resize-y rounded-xl border border-border px-4 py-3 text-sm leading-6 outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-4">
              <p className="text-xs text-muted-foreground">
                Email will be sent through the connected Google mailbox and recorded in Nexus.
              </p>

              <button
                type="button"
                onClick={() => void sendEmail()}
                disabled={savingDraft}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {savingDraft ? "Sending…" : "Send Email"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
