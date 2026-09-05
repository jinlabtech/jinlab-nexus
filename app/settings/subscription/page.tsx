"use client";

import { useRouter } from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";

import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/lib/supabase";

export default function SubscriptionSettingsPage() {
  const router = useRouter();
  const { can, loading } = usePermissions();

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return null;
  }

  if (!can("settings.subscription.manage")) {
    return (
      <DashboardLayout>
        <Navbar
          companyName="JINLAB Nexus"
          userName="Admin"
          onLogout={logout}
        />

        <main className="mx-auto max-w-5xl p-6 lg:p-8">
          <div className="rounded-xl border p-6">
            <h1 className="text-xl font-bold">
              Restricted Settings
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              Your role does not have authority to manage the
              company subscription.
            </p>

            <button
              type="button"
              onClick={() => router.push("/settings")}
              className="mt-5 rounded-md border px-4 py-2 text-sm"
            >
              Return to Settings
            </button>
          </div>
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
        <button
          type="button"
          onClick={() => router.push("/settings")}
          className="mb-5 text-sm text-muted-foreground hover:text-foreground"
        >
          ← Settings
        </button>

        <h1 className="text-3xl font-bold">
          Plan & Billing
        </h1>

        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Subscription ownership, Nexus modules, usage and paid
          add-ons will be controlled here.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border bg-card p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Current Plan
            </p>
            <p className="mt-2 text-xl font-bold">
              Development
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Modules
            </p>
            <p className="mt-2 text-xl font-bold">
              Nexus Core
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Billing
            </p>
            <p className="mt-2 text-xl font-bold">
              Not configured
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl border bg-muted/20 p-5">
          <p className="font-semibold">
            Subscription engine coming later
          </p>

          <p className="mt-1 text-sm text-muted-foreground">
            We will connect real SaaS plans, module entitlements,
            Nexus Vision, AI usage and free-plan document branding
            here once the billing foundation is built.
          </p>
        </div>
      </main>
    </DashboardLayout>
  );
}
