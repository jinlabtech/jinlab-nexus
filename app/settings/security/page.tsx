"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";

import SettingsBackButton from "@/components/settings/SettingsBackButton";

import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/lib/supabase";

import {
  getSecuritySettings,
  saveSecuritySettings,
} from "@/lib/services/settingsService";

import type {
  CompanySecuritySettings,
} from "@/types/settings";

function SecurityToggle({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-6 rounded-xl border p-4">
      <div>
        <p className="font-medium">{title}</p>

        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          {description}
        </p>
      </div>

      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.checked)
        }
        className="mt-1 h-5 w-5"
      />
    </label>
  );
}

export default function SecuritySettingsPage() {
  const router = useRouter();

  const {
    can,
    loading: permissionsLoading,
  } = usePermissions();

  const [settings, setSettings] =
    useState<CompanySecuritySettings | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  const allowed =
    can("settings.security.manage");

  useEffect(() => {
    if (permissionsLoading) return;

    if (!allowed) {
      setLoading(false);
      return;
    }

    void loadSettings();
  }, [permissionsLoading, allowed]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function loadSettings() {
    try {
      setLoading(true);

      const data =
        await getSecuritySettings();

      setSettings(data);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Security settings could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    if (!settings) return;

    try {
      setSaving(true);
      setMessage("");
      setErrorMessage("");

      await saveSecuritySettings(settings);

      await loadSettings();

      setMessage(
        "Security controls saved successfully."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Security controls could not be saved."
      );
    } finally {
      setSaving(false);
    }
  }

  if (permissionsLoading || loading) {
    return (
      <DashboardLayout>
        <Navbar
          companyName="JINLAB Nexus"
          userName="Admin"
          onLogout={logout}
        />

        <main className="mx-auto max-w-6xl p-6 lg:p-8">
          Loading Security...
        </main>
      </DashboardLayout>
    );
  }

  if (!allowed) {
    return (
      <DashboardLayout>
        <Navbar
          companyName="JINLAB Nexus"
          userName="Admin"
          onLogout={logout}
        />

        <main className="mx-auto max-w-6xl p-6 lg:p-8">
          <SettingsBackButton />

          <h1 className="text-2xl font-bold">
            Restricted
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Your role cannot manage company security
            controls.
          </p>
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Navbar
        companyName="JINLAB Nexus"
        userName="Admin"
        onLogout={logout}
      />

      <main className="mx-auto max-w-6xl p-6 lg:p-8">
        <SettingsBackButton />

        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Governance
          </p>

          <h1 className="mt-1 text-3xl font-bold">
            Security Controls
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Protect important financial,
            administrative and stock actions from
            unauthorised or accidental changes.
          </p>
        </div>

        {errorMessage && (
          <div className="mt-6 rounded-xl border border-destructive/30 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        {message && (
          <div className="mt-6 rounded-xl border p-4 text-sm">
            {message}
          </div>
        )}

        {settings && (
          <div className="mt-8 space-y-6">
            <section className="rounded-xl border bg-card">
              <div className="border-b p-5">
                <h2 className="font-semibold">
                  Approval Protection
                </h2>
              </div>

              <div className="grid gap-3 p-5 md:grid-cols-2">
                <SecurityToggle
                  title="Confirm Sensitive Actions"
                  description="Require an explicit confirmation before high-impact actions."
                  checked={
                    settings.require_sensitive_action_confirmation
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      require_sensitive_action_confirmation:
                        value,
                    })
                  }
                />

                <SecurityToggle
                  title="Approve Stock Adjustments"
                  description="Protect manual stock corrections with approval."
                  checked={
                    settings.require_stock_adjustment_approval
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      require_stock_adjustment_approval:
                        value,
                    })
                  }
                />

                <SecurityToggle
                  title="Approve Invoice Cancellations"
                  description="Prevent invoices from being cancelled without authority."
                  checked={
                    settings.require_invoice_cancellation_approval
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      require_invoice_cancellation_approval:
                        value,
                    })
                  }
                />

                <SecurityToggle
                  title="Protect Financial Deletes"
                  description="Require approval before deleting or reversing sensitive financial records."
                  checked={
                    settings.require_financial_delete_approval
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      require_financial_delete_approval:
                        value,
                    })
                  }
                />
              </div>
            </section>

            <section className="rounded-xl border bg-card">
              <div className="border-b p-5">
                <h2 className="font-semibold">
                  Administration
                </h2>
              </div>

              <div className="grid gap-3 p-5 md:grid-cols-2">
                <SecurityToggle
                  title="Prevent Role Escalation"
                  description="Stop administrators from granting authority beyond their own permitted level."
                  checked={
                    settings.prevent_role_escalation
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      prevent_role_escalation:
                        value,
                    })
                  }
                />

                <SecurityToggle
                  title="Audit Administrative Changes"
                  description="Record sensitive Settings and administrative changes."
                  checked={
                    settings.audit_admin_changes
                  }
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      audit_admin_changes:
                        value,
                    })
                  }
                />
              </div>
            </section>

            <section className="rounded-xl border bg-card">
              <div className="border-b p-5">
                <h2 className="font-semibold">
                  Session Security
                </h2>
              </div>

              <div className="max-w-md p-5">
                <label className="space-y-2">
                  <span className="text-sm font-medium">
                    Session Timeout
                  </span>

                  <select
                    value={
                      settings.session_timeout_minutes
                    }
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        session_timeout_minutes:
                          Number(
                            event.target.value
                          ),
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                  >
                    <option value={30}>
                      30 minutes
                    </option>

                    <option value={60}>
                      1 hour
                    </option>

                    <option value={240}>
                      4 hours
                    </option>

                    <option value={480}>
                      8 hours
                    </option>

                    <option value={720}>
                      12 hours
                    </option>

                    <option value={1440}>
                      24 hours
                    </option>
                  </select>
                </label>
              </div>
            </section>

            <button
              type="button"
              disabled={saving}
              onClick={saveSettings}
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : "Save Security Controls"}
            </button>
          </div>
        )}
      </main>
    </DashboardLayout>
  );
}
