"use client";

import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import { supabase } from "@/lib/supabase";

export default function SystemSettingsPage() {
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
            System Settings
          </h1>

          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Configure security, notifications and integrations.
          </p>
        </div>

        <div className="space-y-5">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">
              Security
            </h2>

            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-3">
                <input type="checkbox" className="h-4 w-4" />
                <span className="text-sm">
                  Require stronger authentication for sensitive actions
                </span>
              </label>

              <label className="flex items-center gap-3">
                <input type="checkbox" className="h-4 w-4" />
                <span className="text-sm">
                  Log all administrative changes
                </span>
              </label>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">
              Notifications
            </h2>

            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-3">
                <input type="checkbox" className="h-4 w-4" />
                <span className="text-sm">
                  Send important financial alerts
                </span>
              </label>

              <label className="flex items-center gap-3">
                <input type="checkbox" className="h-4 w-4" />
                <span className="text-sm">
                  Send security alerts to owners
                </span>
              </label>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">
              Integrations
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Banking, email, WhatsApp, accounting,
              payment and external service integrations will appear here.
            </p>
          </section>
        </div>
      </main>
    </DashboardLayout>
  );
}
