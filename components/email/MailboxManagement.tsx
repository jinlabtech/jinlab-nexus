"use client";

import SearchableSelect from "@/components/ui/SearchableSelect";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Mailbox = {
  id: string;
  branch_id: string | null;
  provider: string;
  email_address: string;
  display_name: string | null;
  account_type: "shared" | "personal" | "department";
  department: string | null;
  active: boolean;
  sync_enabled: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProviderConnection = {
  account_id: string;
  provider: string;
  connection_status: string;
  provider_email: string | null;
  connected_at: string | null;
  last_verified_at: string | null;
};

type MailboxAccess = {
  id: string;
  account_id: string;
  user_id: string;
  access_level: "read" | "send" | "manage";
  created_at: string;
};

type NexusUser = {
  user_id: string;
  role: string | null;
};

type Branch = {
  id: string;
  company_id: string;
};

type ManagementWorkspace = {
  accounts: Mailbox[];
  access: MailboxAccess[];
  users: NexusUser[];
  branches: Branch[];
};

type MailboxForm = {
  accountId: string | null;
  emailAddress: string;
  displayName: string;
  accountType: "shared" | "personal" | "department";
  department: string;
  branchId: string;
  provider: "custom" | "google" | "microsoft" | "smtp_imap";
  active: boolean;
  syncEnabled: boolean;
};

const emptyForm: MailboxForm = {
  accountId: null,
  emailAddress: "",
  displayName: "",
  accountType: "shared",
  department: "",
  branchId: "",
  provider: "custom",
  active: true,
  syncEnabled: false,
};

export default function MailboxManagement() {
  const [workspace, setWorkspace] = useState<ManagementWorkspace>({
    accounts: [],
    access: [],
    users: [],
    branches: [],
  });

  const [selectedMailboxId, setSelectedMailboxId] = useState("");
  const [form, setForm] = useState<MailboxForm>(emptyForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accessSaving, setAccessSaving] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [providerConnections, setProviderConnections] = useState<ProviderConnection[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedMailbox = useMemo(
    () =>
      workspace.accounts.find(
        (account) => account.id === selectedMailboxId
      ) ?? null,
    [workspace.accounts, selectedMailboxId]
  );

  const selectedProviderConnection = useMemo(
    () =>
      providerConnections.find(
        (connection) =>
          connection.account_id === selectedMailboxId &&
          connection.provider === "google"
      ) ?? null,
    [providerConnections, selectedMailboxId]
  );

  const selectedAccess = useMemo(
    () =>
      workspace.access.filter(
        (item) => item.account_id === selectedMailboxId
      ),
    [workspace.access, selectedMailboxId]
  );

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");

    const { data, error: rpcError } = await supabase.rpc(
      "get_email_management_workspace"
    );

    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }

    const result = (data ?? {
      accounts: [],
      access: [],
      users: [],
      branches: [],
    }) as ManagementWorkspace;

    const { data: connectionData, error: connectionError } = await supabase
    .from("email_provider_connection")
    .select(
      "account_id, provider, connection_status, provider_email, connected_at, last_verified_at"
    );

  if (connectionError) {
    setError(connectionError.message);
    setLoading(false);
    return;
  }

  setProviderConnections(
    (connectionData ?? []) as ProviderConnection[]
  );

  setWorkspace({
      accounts: result.accounts ?? [],
      access: result.access ?? [],
      users: result.users ?? [],
      branches: result.branches ?? [],
    });

    setSelectedMailboxId((current) => {
      if (
        current &&
        (result.accounts ?? []).some((account) => account.id === current)
      ) {
        return current;
      }

      return result.accounts?.[0]?.id ?? "";
    });

    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkspace();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadWorkspace]);

  function startNewMailbox() {
    setForm(emptyForm);
    setSelectedMailboxId("");
    setNotice("");
    setError("");
  }

  function editMailbox(mailbox: Mailbox) {
    setSelectedMailboxId(mailbox.id);
    setForm({
      accountId: mailbox.id,
      emailAddress: mailbox.email_address,
      displayName: mailbox.display_name ?? "",
      accountType: mailbox.account_type,
      department: mailbox.department ?? "",
      branchId: mailbox.branch_id ?? "",
      provider: mailbox.provider as MailboxForm["provider"],
      active: mailbox.active,
      syncEnabled: mailbox.sync_enabled,
    });
    setNotice("");
    setError("");
  }

  async function saveMailbox(event: FormEvent) {
    event.preventDefault();

    if (!form.emailAddress.trim()) {
      setError("Email address is required.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    const { data, error: rpcError } = await supabase.rpc(
      "email_manage_account",
      {
        p_account_id: form.accountId,
        p_email_address: form.emailAddress.trim(),
        p_display_name: form.displayName.trim() || null,
        p_account_type: form.accountType,
        p_department: form.department.trim() || null,
        p_branch_id: form.branchId || null,
        p_provider: form.provider,
        p_active: form.active,
        p_sync_enabled: form.syncEnabled,
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setSaving(false);
      return;
    }

    const savedId = data as string;

    await loadWorkspace();
    setSelectedMailboxId(savedId);
    setForm(emptyForm);
    setNotice(
      form.accountId
        ? "Mailbox updated successfully."
        : "Mailbox created successfully."
    );
    setSaving(false);
  }

  async function toggleMailboxActive(mailbox: Mailbox) {
    setSaving(true);
    setError("");
    setNotice("");

    const { error: rpcError } = await supabase.rpc(
      "email_manage_account",
      {
        p_account_id: mailbox.id,
        p_email_address: mailbox.email_address,
        p_display_name: mailbox.display_name,
        p_account_type: mailbox.account_type,
        p_department: mailbox.department,
        p_branch_id: mailbox.branch_id,
        p_provider: mailbox.provider,
        p_active: !mailbox.active,
        p_sync_enabled: mailbox.active ? false : mailbox.sync_enabled,
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setSaving(false);
      return;
    }

    await loadWorkspace();

    setNotice(
      mailbox.active
        ? "Mailbox deactivated. Its business history has been retained."
        : "Mailbox reactivated successfully."
    );

    setSaving(false);
  }

  async function connectGoogle(mailbox: Mailbox) {
    try {
      setConnectingGoogle(true);
      setError(""); setNotice("");

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error(
          "Your Nexus session has expired. Please sign in again."
        );
      }

      const response = await fetch(
        `/api/email/google/connect?account_id=${encodeURIComponent(mailbox.id)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        }
      );

      const result = (await response.json()) as {
        authorization_url?: string;
        error?: string;
      };

      if (!response.ok || !result.authorization_url) {
        throw new Error(
          result.error || "Unable to start the Google connection."
        );
      }

      window.location.assign(result.authorization_url);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to connect Google."
      );
      setConnectingGoogle(false);
    }
  }

  async function deleteMailbox(mailbox: Mailbox) {
    const confirmed = window.confirm(
      `Permanently delete ${mailbox.email_address}?\n\n` +
        "This is only allowed when the mailbox has no communication history. " +
        "Mailboxes containing business email must be deactivated instead."
    );

    if (!confirmed) return;

    const typed = window.prompt(
      `Type DELETE to permanently remove ${mailbox.email_address}.`
    );

    if (typed !== "DELETE") {
      if (typed !== null) {
        setError("Permanent deletion cancelled because DELETE was not entered.");
      }
      return;
    }

    setDeleting(true);
    setError("");
    setNotice("");

    const { error: rpcError } = await supabase.rpc(
      "email_delete_account",
      {
        p_account_id: mailbox.id,
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setDeleting(false);
      return;
    }

    setSelectedMailboxId("");
    setForm(emptyForm);

    await loadWorkspace();

    setNotice(
      `Mailbox ${mailbox.email_address} was permanently deleted.`
    );

    setDeleting(false);
  }

  async function setUserAccess(
    userId: string,
    accessLevel: "read" | "send" | "manage"
  ) {
    if (!selectedMailboxId) return;

    setAccessSaving(userId);
    setError("");
    setNotice("");

    const { error: rpcError } = await supabase.rpc(
      "email_manage_account_access",
      {
        p_account_id: selectedMailboxId,
        p_user_id: userId,
        p_access_level: accessLevel,
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setAccessSaving("");
      return;
    }

    await loadWorkspace();
    setNotice("Mailbox access updated.");
    setAccessSaving("");
  }

  async function removeUserAccess(userId: string) {
    if (!selectedMailboxId) return;

    setAccessSaving(userId);
    setError("");
    setNotice("");

    const { error: rpcError } = await supabase.rpc(
      "email_remove_account_access",
      {
        p_account_id: selectedMailboxId,
        p_user_id: userId,
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      setAccessSaving("");
      return;
    }

    await loadWorkspace();
    setNotice("Mailbox access removed.");
    setAccessSaving("");
  }

  function accessForUser(userId: string) {
    return selectedAccess.find((item) => item.user_id === userId) ?? null;
  }

  return (
    <main className="min-h-screen bg-muted/30 p-4 text-foreground md:p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">
              Communications
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Mailboxes & Access
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Control company email accounts and decide who can read,
              send or manage each mailbox.
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/email"
              className="rounded-lg border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Back to Email
            </Link>

            <button
              type="button"
              onClick={startNewMailbox}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              New Mailbox
            </button>
          </div>
        </header>

        {error ? (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-foreground">
            {notice}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="border-b p-5">
              <h2 className="font-semibold">Company Mailboxes</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {workspace.accounts.length} configured
              </p>
            </div>

            {loading ? (
              <div className="p-6 text-sm text-muted-foreground">
                Loading mailboxes…
              </div>
            ) : workspace.accounts.length === 0 ? (
              <div className="p-6">
                <p className="text-sm font-medium">
                  No mailboxes configured
                </p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Create the first company-controlled mailbox for Nexus.
                </p>
              </div>
            ) : (
              <div>
                {workspace.accounts.map((mailbox) => {
                  const selected = selectedMailboxId === mailbox.id;

                  return (
                    <button
                      key={mailbox.id}
                      type="button"
                      onClick={() => {
                        setSelectedMailboxId(mailbox.id);
                        setForm(emptyForm);
                        setNotice("");
                        setError("");
                      }}
                      className={`w-full border-b p-4 text-left transition-colors hover:bg-muted/60 ${
                        selected ? "bg-primary/5" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {mailbox.display_name || mailbox.email_address}
                          </p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {mailbox.email_address}
                          </p>
                        </div>

                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                            mailbox.active
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {mailbox.active ? "Active" : "Inactive"}
                        </span>
                      </div>

                      <p className="mt-3 text-[11px] capitalize text-muted-foreground">
                        {mailbox.account_type}
                        {mailbox.department
                          ? ` · ${mailbox.department}`
                          : ""}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <div className="space-y-6">
            <section className="rounded-2xl border bg-card p-5 shadow-sm md:p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">
                    {form.accountId ? "Edit Mailbox" : "Mailbox Setup"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Provider credentials are not stored on this screen.
                  </p>
                </div>

                {selectedMailbox && !form.accountId ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => editMailbox(selectedMailbox)}
                      className="rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      disabled={saving || deleting}
                      onClick={() => void toggleMailboxActive(selectedMailbox)}
                      className="rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                    >
                      {selectedMailbox.active ? "Deactivate" : "Reactivate"}
                    </button>

                    {selectedMailbox.provider === "google" && (
                      <button
                        type="button"
                        disabled={connectingGoogle || !selectedMailbox.active}
                        onClick={() => void connectGoogle(selectedMailbox)}
                        className="rounded-lg border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                      >
                        {connectingGoogle
                        ? "Connecting Google…"
                        : selectedProviderConnection?.connection_status === "connected"
                          ? "Reconnect Google"
                          : "Connect Google"}
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={saving || deleting}
                      onClick={() => void deleteMailbox(selectedMailbox)}
                      className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
                    >
                      {deleting ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                ) : null}
              </div>

              {selectedMailbox?.provider === "google" && !form.accountId && (
              <div className="mb-5 rounded-xl border bg-muted/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      Google Email
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedProviderConnection?.connection_status === "connected"
                        ? `Connected${selectedProviderConnection.provider_email ? ` · ${selectedProviderConnection.provider_email}` : ""}`
                        : "Not connected"}
                    </p>
                  </div>

                  <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium">
                    {selectedProviderConnection?.connection_status === "connected"
                      ? "Connected"
                      : "Not connected"}
                  </span>
                </div>
              </div>
            )}

            <form onSubmit={saveMailbox} className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium">
                    Email address
                    <input
                      type="email"
                      required
                      value={form.emailAddress}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          emailAddress: event.target.value,
                        }))
                      }
                      placeholder="info@company.co.za"
                      className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal"
                    />
                  </label>

                  <label className="text-sm font-medium">
                    Display name
                    <input
                      value={form.displayName}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          displayName: event.target.value,
                        }))
                      }
                      placeholder="JINLAB Support"
                      className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal"
                    />
                  </label>

                  <label className="text-sm font-medium">
                    Type
                    <select
                      value={form.accountType}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          accountType: event.target
                            .value as MailboxForm["accountType"],
                        }))
                      }
                      className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal"
                    >
                      <option value="shared">Shared</option>
                      <option value="department">Department</option>
                      <option value="personal">Personal</option>
                    </select>
                  </label>

                  <label className="text-sm font-medium">
                    Department
                    <input
                      value={form.department}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          department: event.target.value,
                        }))
                      }
                      placeholder="Sales, Repairs, Accounts…"
                      className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal"
                    />
                  </label>

                  <label className="text-sm font-medium">
                    Provider
                    <select
                      value={form.provider}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          provider: event.target
                            .value as MailboxForm["provider"],
                        }))
                      }
                      className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal"
                    >
                      <option value="custom">Not connected yet</option>
                      <option value="google">Google</option>
                      <option value="microsoft">Microsoft</option>
                      <option value="smtp_imap">SMTP / IMAP</option>
                    </select>
                  </label>

                  <label className="text-sm font-medium">
                    Branch
                    <SearchableSelect searchLabel="Branches"
                      value={form.branchId}
                      onValueChange={(selectedValue) =>
                        setForm((current) => ({
                          ...current,
                          branchId: selectedValue,
                        }))
                      }
                      className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal"
                    >
                      <option value="">All / company level</option>
                      {workspace.branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          Branch {branch.id.slice(0, 8)}
                        </option>
                      ))}
                    </SearchableSelect>
                  </label>
                </div>

                <div className="flex flex-wrap gap-5 rounded-xl border bg-muted/30 p-4">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          active: event.target.checked,
                        }))
                      }
                    />
                    Active mailbox
                  </label>

                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={form.syncEnabled}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          syncEnabled: event.target.checked,
                        }))
                      }
                    />
                    Sync enabled
                  </label>
                </div>

                <div className="flex justify-end gap-2">
                  {form.accountId ? (
                    <button
                      type="button"
                      onClick={() => setForm(emptyForm)}
                      className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
                    >
                      Cancel
                    </button>
                  ) : null}

                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {saving
                      ? "Saving…"
                      : form.accountId
                        ? "Save Changes"
                        : "Create Mailbox"}
                  </button>
                </div>
              </form>
            </section>

            <section className="rounded-2xl border bg-card p-5 shadow-sm md:p-6">
              <div>
                <h2 className="text-lg font-semibold">
                  Staff Access
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedMailbox
                    ? `Control access to ${selectedMailbox.email_address}.`
                    : "Select a mailbox to manage employee access."}
                </p>
              </div>

              {!selectedMailbox ? (
                <div className="mt-5 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Select a mailbox first.
                </div>
              ) : workspace.users.length === 0 ? (
                <div className="mt-5 text-sm text-muted-foreground">
                  No company users were returned.
                </div>
              ) : (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="pb-3 pr-4 font-medium">User</th>
                        <th className="pb-3 pr-4 font-medium">Role</th>
                        <th className="pb-3 pr-4 font-medium">Access</th>
                        <th className="pb-3 text-right font-medium">Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {workspace.users.map((user) => {
                        const access = accessForUser(user.user_id);
                        const busy = accessSaving === user.user_id;

                        return (
                          <tr key={user.user_id} className="border-b last:border-0">
                            <td className="py-4 pr-4">
                              <p className="font-medium">
                                {user.user_id.slice(0, 8)}…
                              </p>
                            </td>

                            <td className="py-4 pr-4 capitalize text-muted-foreground">
                              {user.role || "user"}
                            </td>

                            <td className="py-4 pr-4">
                              <select
                                value={access?.access_level ?? ""}
                                disabled={busy}
                                onChange={(event) => {
                                  const value = event.target.value;

                                  if (!value) {
                                    void removeUserAccess(user.user_id);
                                    return;
                                  }

                                  void setUserAccess(
                                    user.user_id,
                                    value as "read" | "send" | "manage"
                                  );
                                }}
                                className="h-9 rounded-lg border bg-background px-3 text-sm"
                              >
                                <option value="">No access</option>
                                <option value="read">Read</option>
                                <option value="send">Read + Send</option>
                                <option value="manage">Manage</option>
                              </select>
                            </td>

                            <td className="py-4 text-right text-xs text-muted-foreground">
                              {busy
                                ? "Updating…"
                                : access
                                  ? "Assigned"
                                  : "Not assigned"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
