"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import NexusMobileHome from "@/components/layout/NexusMobileHome";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { RefreshCw } from "lucide-react";
import NexusDesktopDashboard from "@/components/dashboard/NexusDesktopDashboard";
import Navbar from "@/components/Navbar";
import { supabase } from "@/lib/supabase";
import { getDocumentLogoUrl } from "@/lib/services/settingsService";
import { coreAborted, coreError, coreIntelligenceService, waitForCoreSignal } from "@/lib/services/coreIntelligenceService";
import type { CoreAnalysis } from "@/lib/intelligence/types";

type UserProfile = { id: string; user_id: string; company_id: string | null; full_name: string; email: string | null; role: string | null };

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [analysis, setAnalysis] = useState<CoreAnalysis | null>(null);
  const [checking, setChecking] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const abort = useRef<AbortController | null>(null);

  const isOwner = profile?.role === "owner";
  const acceptAnalysis = useCallback((next: CoreAnalysis) => {
    setAnalysis((current) => current && Date.parse(current.checkedAt) > Date.parse(next.checkedAt) ? current : next);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); setAuthError("Your profile took too long to load. Refresh this page to try again."); setLoading(false); }, 25_000);
    async function loadDashboard() {
      try {
        const { data: { user }, error } = await waitForCoreSignal(supabase.auth.getUser(), controller.signal);
        if (error || !user) { router.replace("/login"); return; }
        const { data: profileData, error: profileError } = await supabase.from("user_profile")
          .select("id, user_id, company_id, full_name, email, role").eq("user_id", user.id).abortSignal(controller.signal).single();
        if (controller.signal.aborted) return;
        if (profileError || !profileData) throw new Error("Your Nexus profile could not be loaded. Refresh this page to try again.");
        setProfile(profileData);
        if (profileData.company_id) {
          const [
            { data: company },
            { data: documentSettings },
          ] = await Promise.all([
            supabase
              .from("company")
              .select("company_name")
              .eq("id", profileData.company_id)
              .abortSignal(controller.signal)
              .single(),

            supabase
              .from("company_document_settings")
              .select("logo_path")
              .eq("company_id", profileData.company_id)
              .abortSignal(controller.signal)
              .maybeSingle(),
          ]);

          if (!controller.signal.aborted) {
            setCompanyName(
              company?.company_name ?? ""
            );

            const logoUrl =
              await getDocumentLogoUrl(
                documentSettings?.logo_path ?? null
              );

            if (!controller.signal.aborted) {
              setCompanyLogoUrl(
                logoUrl
              );
            }
          }
        }
      } catch (error) {
        if (timedOut) setAuthError("Your profile took too long to load. Refresh this page to try again.");
        else if (!controller.signal.aborted) setAuthError(coreError(error));
      } finally {
        if (!controller.signal.aborted || timedOut) setLoading(false);
        window.clearTimeout(timeout);
      }
    }
    void loadDashboard();
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [router]);

  const refresh = useCallback(async () => {
    if (!isOwner) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setChecking(true); setReviewError("");
    try {
      const result = await coreIntelligenceService.review(controller.signal);
      if (!controller.signal.aborted) acceptAnalysis(result.analysis);
    } catch (error) {
      if (!controller.signal.aborted && !coreAborted(error)) setReviewError(coreError(error));
    } finally {
      if (!controller.signal.aborted) setChecking(false);
    }
  }, [isOwner, acceptAnalysis]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    return () => { window.clearTimeout(initial); abort.current?.abort(); };
  }, [refresh]);

  async function logout() { await supabase.auth.signOut(); router.replace("/login"); }
  return <DashboardLayout>
    <div className="nexus-desktop-dashboard-identity"><Navbar companyName={analysis?.companyName || companyName || "JINLAB Nexus"} companyLogoUrl={companyLogoUrl} userName={profile?.full_name ?? ""} onLogout={logout} /></div>
    <NexusMobileHome />
    <main className="nexus-desktop-dashboard mx-auto hidden w-full max-w-[1600px] p-6 pb-28 md:block lg:p-8 lg:pb-28">
      {loading ? <div role="status" className="flex min-h-64 items-center justify-center gap-3 rounded-xl border bg-card text-sm text-muted-foreground"><RefreshCw className="size-4 animate-spin" />Loading your Nexus workspace…</div> : authError ? <div role="alert" className="rounded-xl border p-5 text-sm text-destructive">{authError}</div> : <NexusDesktopDashboard isOwner={isOwner} role={profile?.role ?? "Team member"} analysis={isOwner ? analysis : null} checking={checking} reviewError={reviewError} onRefresh={() => void refresh()} />}
    </main>
  </DashboardLayout>;
}
