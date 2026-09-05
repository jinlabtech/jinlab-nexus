"use client";

import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import { supabase } from "@/lib/supabase";

export default function BranchSettingsPage() {
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
            Branch Settings
          </h1>

          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Configure how branches operate.
            Creating and editing branch records remains in the Branches module.
          </p>
        </div>

        <div className="space-y-5">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">
              Branch Behaviour
            </h2>

            <div className="mt-4 space-y-3">
              {[
                "Keep stock isolated by branch",
                "Keep customer activity visible company-wide",
                "Require branch selection on sales documents",
                "Use branch address on invoices",
                "Use branch contact details on quotations",
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

          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">
              Numbering
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Configure how branch codes appear on documents and records.
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-medium">
                  Branch code format
                </span>

                <input
                  placeholder="e.g. VRY"
                  className="h-10 rounded-md border bg-background px-3"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium">
                  Document numbering
                </span>

                <select className="h-10 rounded-md border bg-background px-3">
                  <option>Company-wide numbering</option>
                  <option>Separate numbering per branch</option>
                </select>
              </label>
            </div>
          </section>
        </div>
      </main>
    </DashboardLayout>
  );
}
