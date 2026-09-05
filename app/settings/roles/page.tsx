"use client";

import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import { supabase } from "@/lib/supabase";

export default function RoleSettingsPage() {
  const router = useRouter();

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <DashboardLayout>
      <Navbar
        companyName="JINLAB Nexus"
        userName="Admin"
        onLogout={logout}
      />

      <main className="mx-auto max-w-6xl p-6 lg:p-8">
        <button
          type="button"
          onClick={() => router.push("/settings")}
          className="mb-5 text-sm text-muted-foreground hover:text-foreground"
        >
          ← Settings
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold">
            Roles & Access
          </h1>

          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Configure how roles behave across Nexus.
            Actual staff accounts remain in the Users module.
          </p>
        </div>

        <div className="space-y-5">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">
              Role Permissions
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Define which modules and actions each role can access.
            </p>

            <div className="mt-4 rounded-lg border bg-muted/20 p-4 text-sm">
              Existing Nexus permissions will be connected here
              in the next RBAC settings sprint.
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">
              Approval Authority
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Control who can approve financial or operational actions.
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-medium">
                  Default approval required above
                </span>

                <input
                  type="number"
                  placeholder="R 0.00"
                  className="h-10 rounded-md border bg-background px-3"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium">
                  Default approving role
                </span>

                <select className="h-10 rounded-md border bg-background px-3">
                  <option>Owner</option>
                  <option>Admin</option>
                  <option>Manager</option>
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">
              Sensitive Actions
            </h2>

            <div className="mt-4 space-y-3">
              {[
                "Require approval before cancelling issued invoices",
                "Require approval before stock adjustments",
                "Require approval before deleting financial records",
                "Prevent staff from changing company settings",
              ].map((label) => (
                <label
                  key={label}
                  className="flex items-center gap-3"
                >
                  <input type="checkbox" className="h-4 w-4" />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </section>
        </div>
      </main>
    </DashboardLayout>
  );
}
