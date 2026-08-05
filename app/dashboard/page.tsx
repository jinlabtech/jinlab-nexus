"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import DashboardCard from "@/components/DashboardCard";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";

import { useAuditLogs } from "@/hooks/useAuditLogs";
import { supabase } from "@/lib/supabase";

type UserProfile = {
  id: string;
  user_id: string;
  company_id: string | null;
  full_name: string;
  email: string | null;
  role: string | null;
};

function formatActivityDate(date: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

export default function DashboardPage() {
  const router = useRouter();

  const [profile, setProfile] =
    useState<UserProfile | null>(null);

  const [companyId, setCompanyId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [userCount, setUserCount] = useState(0);
  const [branchCount, setBranchCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const {
    auditLogs,
    loading: auditLoading,
    errorMessage: auditError,
  } = useAuditLogs(companyId, 5);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setErrorMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/login");
        return;
      }

      const {
        data: profileData,
        error: profileError,
      } = await supabase
        .from("user_profile")
        .select(
          "id, user_id, company_id, full_name, email, role"
        )
        .eq("user_id", user.id)
        .single();

      if (profileError || !profileData) {
        setErrorMessage(
          profileError?.message ??
            "Your user profile could not be loaded."
        );
        setLoading(false);
        return;
      }

      setProfile(profileData);

      if (!profileData.company_id) {
        setErrorMessage(
          "Your account is not linked to a company."
        );
        setLoading(false);
        return;
      }

      const currentCompanyId = profileData.company_id;

      setCompanyId(currentCompanyId);

      const [
        companyResult,
        userCountResult,
        branchCountResult,
      ] = await Promise.all([
        supabase
          .from("company")
          .select("company_name")
          .eq("id", currentCompanyId)
          .single(),

        supabase
          .from("user_profile")
          .select("*", {
            count: "exact",
            head: true,
          })
          .eq("company_id", currentCompanyId),

        supabase
          .from("branch")
          .select("*", {
            count: "exact",
            head: true,
          })
          .eq("company_id", currentCompanyId),
      ]);

      if (companyResult.error) {
        setErrorMessage(companyResult.error.message);
      } else {
        setCompanyName(
          companyResult.data?.company_name ?? ""
        );
      }

      setUserCount(userCountResult.count ?? 0);
      setBranchCount(branchCountResult.count ?? 0);
      setLoading(false);
    }

    loadDashboard();
  }, [router]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <DashboardLayout>
      <Navbar
        companyName={companyName}
        userName={profile?.full_name ?? ""}
        onLogout={logout}
      />

      <main className="p-4 sm:p-6 lg:p-8">
        <section className="mb-8">
          <p className="text-sm font-medium text-primary">
            JINLAB Nexus
          </p>

          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            Welcome back,{" "}
            {profile?.full_name || "JINLAB Admin"}
          </h1>

          <p className="mt-2 text-muted-foreground">
            Monitor your organisation, users, branches and
            recent system activity.
          </p>
        </section>

        {errorMessage && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        {auditError && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            Audit activity warning: {auditError}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <p className="text-muted-foreground">
              Loading dashboard information...
            </p>
          </div>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <DashboardCard
                title="Company"
                value={companyName}
                description="Current organisation"
              />

              <DashboardCard
                title="Users"
                value={String(userCount)}
                description="Users linked to this company"
              />

              <DashboardCard
                title="Branches"
                value={String(branchCount)}
                description="Registered company locations"
              />

              <DashboardCard
                title="Your Role"
                value={profile?.role ?? "-"}
                description="Current access level"
              />
            </section>

            <section className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border bg-card p-6 shadow-sm">
                <div>
                  <h2 className="text-lg font-semibold">
                    Recent activity
                  </h2>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Latest actions recorded for your company.
                  </p>
                </div>

                {auditLoading ? (
                  <div className="mt-6 rounded-lg border border-dashed p-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      Loading recent activity...
                    </p>
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="mt-6 rounded-lg border border-dashed p-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      No recent activity yet.
                    </p>
                  </div>
                ) : (
                  <div className="mt-6 divide-y">
                    {auditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="py-4 first:pt-0 last:pb-0"
                      >
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-medium">
                              {log.description}
                            </p>

                            <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                              {log.module} · {log.action}
                            </p>
                          </div>

                          <p className="text-xs text-muted-foreground">
                            {formatActivityDate(
                              log.created_at
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border bg-card p-6 shadow-sm">
                <h2 className="text-lg font-semibold">
                  Account information
                </h2>

                <div className="mt-5 space-y-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Full name
                    </p>

                    <p className="mt-1 font-medium">
                      {profile?.full_name ?? "-"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Email address
                    </p>

                    <p className="mt-1 break-all font-medium">
                      {profile?.email ?? "-"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Company
                    </p>

                    <p className="mt-1 font-medium">
                      {companyName || "-"}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </DashboardLayout>
  );
}
