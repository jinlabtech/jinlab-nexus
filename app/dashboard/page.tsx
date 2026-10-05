"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import NexusMobileHome from "@/components/layout/NexusMobileHome";
import { useRouter } from "next/navigation";
import { Activity, ArrowDownToLine, CircleCheck, Clock3, RefreshCw, ShieldCheck } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import CoreCoverage from "@/components/intelligence/CoreCoverage";
import CoreFindingCard, { CORE_MODULE_LABELS } from "@/components/intelligence/CoreFindingCard";
import CoreQuestionPanel from "@/components/intelligence/CoreQuestionPanel";
import NexusControlDeck from "@/components/dashboard/NexusControlDeck";
import NexusWeatherWidget from "@/components/dashboard/NexusWeatherWidget";
import NexusNotificationCenter from "@/components/dashboard/NexusNotificationCenter";
import NexusWidgetBoard from "@/components/dashboard/NexusWidgetBoard";
import { supabase } from "@/lib/supabase";
import { getDocumentLogoUrl } from "@/lib/services/settingsService";
import { coreAborted, coreError, coreIntelligenceService, downloadCoreReport, waitForCoreSignal } from "@/lib/services/coreIntelligenceService";
import type { CoreAnalysis, CoreModule } from "@/lib/intelligence/types";

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
  const [filter, setFilter] = useState<CoreModule | "all">("all");
  const abort = useRef<AbortController | null>(null);

  const prioritiesRef =
    useRef<HTMLElement | null>(null);

  const metricsRef =
    useRef<HTMLElement | null>(null);

  const coverageRef =
    useRef<HTMLElement | null>(null);
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
  const findings = analysis?.findings.filter((finding) => filter === "all" || finding.module === filter) ?? [];
  const metrics = analysis?.metrics.filter((metric) => filter === "all" || metric.module === filter) ?? [];
  const readyCoverage = analysis?.coverage.filter((item) => item.state === "ready").length ?? 0;
  const incomplete = analysis?.coverage.filter((item) => item.state !== "ready") ?? [];
  const urgent = analysis?.findings.filter((item) => item.severity === "high").length ?? 0;
  const canConclude = analysis?.coverage.filter((item) => filter === "all" || item.module === filter).every((item) => item.state === "ready");

  function openDashboardSurface(
    target:
      | "priorities"
      | "metrics"
      | "coverage"
  ) {

    const node =
      target === "priorities"
        ? prioritiesRef.current
        : target === "metrics"
          ? metricsRef.current
          : coverageRef.current;

    node?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

  }

  return <DashboardLayout>
    <Navbar
      companyName={analysis?.companyName || companyName || "JINLAB Nexus"}
      companyLogoUrl={companyLogoUrl}
      userName={profile?.full_name ?? ""}
      onLogout={logout}
    />

    <NexusMobileHome />

    <main className="mx-auto hidden w-full max-w-[1600px] space-y-6 p-4 pb-24 md:block sm:p-6 sm:pb-24 lg:p-8 lg:pb-24">
      {loading ? <div role="status" className="flex min-h-64 items-center justify-center gap-3 rounded-2xl border bg-card text-sm text-muted-foreground"><RefreshCw className="size-4 animate-spin" />Loading your Nexus workspace…</div> : authError ? <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">{authError}</div> : !isOwner ? <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border bg-card p-8 text-center"><ShieldCheck className="size-9 text-muted-foreground" /><h1 className="mt-4 text-xl font-semibold">Nexus Intelligence</h1><p className="mt-2 text-sm text-muted-foreground">This business review is available to the company owner.</p></div> : <>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div><div className="flex items-center gap-2 text-xs font-semibold text-primary"><span className="flex size-6 items-center justify-center rounded-md bg-primary/10"><Activity className="size-3.5" /></span>Nexus Core</div><h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Nexus Intelligence</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Know what needs attention, see the evidence and take the next step in Nexus.</p></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" size="lg" disabled={!analysis} onClick={() => analysis && downloadCoreReport(analysis)}><ArrowDownToLine />Download report</Button><Button size="lg" disabled={checking} onClick={() => void refresh()}><RefreshCw className={checking ? "animate-spin" : ""} />{checking ? "Checking…" : "Refresh review"}</Button></div>
        </header>

        <NexusControlDeck
          findings={
            analysis?.findings.length ??
            0
          }
          intelligenceFindings={analysis?.findings ?? []}
          intelligenceMetrics={analysis?.metrics ?? []}
          urgent={
            urgent
          }
          metricCount={
            metrics.length
          }
          readyCoverage={
            readyCoverage
          }
          totalCoverage={
            analysis?.coverage.length ??
            0
          }
          coverageGaps={
            incomplete.length
          }
          checking={
            checking
          }
          analysisReady={
            Boolean(
              analysis
            )
          }
          onRefresh={() =>
            void refresh()
          }
          onSelect={
            openDashboardSurface
          }
        />

          <NexusWidgetBoard
            items={[
              {
                id: "weather",
                title: "Local Weather",
                content: <NexusWeatherWidget />,
              },
              {
                id: "notifications",
                title: "Nexus Notifications",
                content: (
                  <NexusNotificationCenter
                    findings={analysis?.findings ?? []}
                    checking={checking}
                  />
                ),
              },
            ]}
          />

        <section
          className="border-y border-border/60 py-2"
          aria-label="Ask Nexus"
        >
          <CoreQuestionPanel
            route="/dashboard"
            compact
            onAnalysis={acceptAnalysis}
          />
        </section>

        {reviewError && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{reviewError}{analysis ? " Your last completed review remains below." : ""}</div>}
        {!analysis && checking && <div role="status" className="rounded-2xl border bg-card p-8"><p className="font-semibold">Checking your business records</p><p className="mt-2 text-sm text-muted-foreground">Reviewing stock, money owed, quotations, purchasing, repairs and accounting checks within your access.</p></div>}
        {analysis && (
          <details className="group border-t border-border/60 pt-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm">
              <span>
                <strong>Detailed business review</strong>
                <span className="ml-2 text-xs text-muted-foreground">
                  {analysis.findings.length} findings
                </span>
              </span>
              <span className="text-xs text-muted-foreground group-open:hidden">
                Open
              </span>
              <span className="hidden text-xs text-muted-foreground group-open:inline">
                Close
              </span>
            </summary>

            <div className="space-y-6 pt-2">
          <section className="rounded-2xl border bg-card p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Business review · {analysis.asOf}</p><span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="size-3.5" />Checked {new Date(analysis.checkedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>
            <h2 className="mt-4 max-w-4xl text-xl font-semibold leading-snug sm:text-2xl">{analysis.headline}</h2>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs"><span><strong className="font-semibold">{analysis.findings.length}</strong> findings to review</span><span className={urgent ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}><strong className="font-semibold">{urgent}</strong> high priority</span><span className="text-muted-foreground">{readyCoverage}/{analysis.coverage.length} areas fully checked</span></div>
            {incomplete.length > 0 && <p className="mt-4 border-t pt-3 text-xs leading-relaxed text-muted-foreground">This review has gaps in {incomplete.map((item) => item.label).join(", ")}. Check data coverage before treating it as a full business picture.</p>}
          </section>
          <div className="flex flex-wrap gap-2" aria-label="Filter business review by area">{(["all", ...Object.keys(CORE_MODULE_LABELS)] as (CoreModule | "all")[]).map((module) => <button key={module} type="button" onClick={() => setFilter(module)} aria-pressed={filter === module} className={`rounded-full border px-3.5 py-2 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-ring ${filter === module ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}>{module === "all" ? "Whole business" : CORE_MODULE_LABELS[module]}<span className={`ml-2 ${filter === module ? "opacity-75" : "text-muted-foreground/70"}`}>{analysis.findings.filter((item) => module === "all" || item.module === module).length}</span></button>)}</div>
          {metrics.length > 0 && <section ref={metricsRef} className="grid scroll-mt-6 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Business measures">{metrics.map((metric) => <article key={metric.id} className="rounded-xl border bg-card p-5"><p className="text-xs font-medium text-muted-foreground">{metric.label}</p><p className="mt-3 break-words text-2xl font-semibold tracking-tight">{metric.value}</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{metric.detail}</p></article>)}</section>}
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-6"><section ref={prioritiesRef} className="scroll-mt-6" aria-label="Business priorities"><div className="mb-4 flex items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Where to focus</h2><p className="mt-1 text-xs text-muted-foreground">Open a finding to see the facts and the check behind it.</p></div><span className="text-xs text-muted-foreground">{findings.length} findings</span></div>{findings.length ? <div className="grid gap-3 2xl:grid-cols-2">{findings.map((finding) => <CoreFindingCard key={finding.id} finding={finding} />)}</div> : <div className="rounded-xl border bg-card p-6"><CircleCheck className="size-6 text-muted-foreground" /><h3 className="mt-3 font-semibold">No priorities identified in this view</h3><p className="mt-2 text-sm text-muted-foreground">{canConclude ? "The current business checks did not flag a priority in the records reviewed." : "Some records could not be checked. Review the coverage gaps before drawing a conclusion."}</p></div>}</section></div>
            <aside ref={coverageRef} className="scroll-mt-6 rounded-2xl border bg-card p-4 sm:p-5"><div className="mb-4"><h2 className="font-semibold">Data coverage</h2><p className="mt-2 text-xs leading-relaxed text-muted-foreground">What Nexus checked, what is missing and what your access allows.</p></div><CoreCoverage coverage={analysis.coverage} /><p className="mt-4 border-t pt-4 text-[11px] leading-relaxed text-muted-foreground">Nexus Core applies defined business checks to your records. Opening a record lets you review it; this workspace does not make changes.</p></aside>
          </div>
            </div>
          </details>
        )}
      </>}
    </main>
  </DashboardLayout>;
}
