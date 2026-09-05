"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import SettingsBackButton from "@/components/settings/SettingsBackButton";

import { usePermissions } from "@/hooks/usePermissions";

import { supabase } from "@/lib/supabase";

import {
  getSettingsAuditLog,
} from "@/lib/services/settingsService";

import type {
  SettingsChangeLog,
} from "@/types/settings";

export default function SettingsAuditPage() {
  const router = useRouter();

  const {
    can,
    loading: permissionsLoading,
  } = usePermissions();

  const [rows, setRows] =
    useState<SettingsChangeLog[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState("");

  const allowed =
    can("settings.audit.view");

  useEffect(() => {
    if (permissionsLoading) return;

    if (!allowed) {
      setLoading(false);
      return;
    }

    void loadAudit();
  }, [permissionsLoading, allowed]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function loadAudit() {
    try {
      setLoading(true);

      const data =
        await getSettingsAuditLog();

      setRows(data);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Audit history could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardLayout>
      <Navbar
        companyName="JINLAB Nexus"
        userName="Admin"
        onLogout={logout}
      />

      <main className="mx-auto max-w-7xl p-6 lg:p-8">
        <SettingsBackButton />

        <h1 className="text-3xl font-bold">
          Settings Audit
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          Administrative configuration changes made
          inside JINLAB Nexus.
        </p>

        {errorMessage && (
          <div className="mt-6 rounded-xl border border-destructive/30 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        {permissionsLoading || loading ? (
          <p className="mt-8 text-sm text-muted-foreground">
            Loading audit history...
          </p>
        ) : !allowed ? (
          <p className="mt-8 text-sm text-muted-foreground">
            You do not have permission to view
            Settings Audit.
          </p>
        ) : (
          <div className="mt-8 overflow-hidden rounded-xl border">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      Date
                    </th>

                    <th className="px-4 py-3 text-left">
                      Area
                    </th>

                    <th className="px-4 py-3 text-left">
                      Action
                    </th>

                    <th className="px-4 py-3 text-left">
                      Changed By
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t"
                    >
                      <td className="px-4 py-3">
                        {new Date(
                          row.changed_at
                        ).toLocaleString()}
                      </td>

                      <td className="px-4 py-3">
                        {row.setting_area}
                      </td>

                      <td className="px-4 py-3">
                        {row.action}
                      </td>

                      <td className="px-4 py-3 font-mono text-xs">
                        {row.changed_by ??
                          "System"}
                      </td>
                    </tr>
                  ))}

                  {rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-10 text-center text-muted-foreground"
                      >
                        No Settings changes have
                        been recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </DashboardLayout>
  );
}
