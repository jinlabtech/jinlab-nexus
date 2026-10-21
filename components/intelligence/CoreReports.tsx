"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { coreAborted, coreError, coreIntelligenceService, downloadCoreReport } from "@/lib/services/coreIntelligenceService";
import type { CoreAnalysis } from "@/lib/intelligence/types";
import CoreFindingCard from "./CoreFindingCard";
import CoreCoverage from "./CoreCoverage";

export default function CoreReports({ analysis, onAnalysis }: { analysis: CoreAnalysis | null; onAnalysis: (analysis: CoreAnalysis) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function refresh() {
    if (controller.current) return;
    const request = new AbortController(); controller.current = request; setBusy(true); setError("");
    try { const response = await coreIntelligenceService.review(request.signal); if (!request.signal.aborted) onAnalysis(response.analysis); }
    catch (e) { if (!coreAborted(e)) setError(coreError(e)); }
    finally { controller.current = null; setBusy(false); }
  }
  const sales = analysis?.salesReport;
  const repair = analysis?.repairReport;
  const jobs = repair?.jobs.filter(job => filter === "all" || (filter === "unassigned" ? !job.assigned : filter === "collection" ? ["technical_complete", "ready_for_collection", "awaiting_collection"].includes(job.status) : job.status === filter)) ?? [];
  const money = (amount?: number) => amount === undefined ? "Unavailable" : analysis?.currency ? new Intl.NumberFormat("en-ZA", { style: "currency", currency: analysis.currency }).format(amount) : `${amount.toLocaleString("en-ZA", {minimumFractionDigits:2})} (currency not verified)`;
  return <section aria-label="Nexus business reports" className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-5 p-4 [overflow-wrap:anywhere]">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Business reports</h2><Button type="button" variant="outline" disabled={busy} onClick={() => void refresh()}>{busy ? "Checking…" : analysis ? "Refresh reports" : "Load current reports"}</Button></div>
    {busy && <p role="status" className="text-sm">Checking the business records you can access…</p>}
    {error && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm">{error}</p>}
    {!analysis && <p className="text-sm text-muted-foreground">Load current reports for outstanding repairs, sales, money owed, stock and follow-ups.</p>}
    {analysis && <>
      <p className="text-xs text-muted-foreground">{analysis.companyName} · Business date {analysis.asOf}<br/>Checked {new Date(analysis.checkedAt).toLocaleString("en-ZA", {timeZone:"Africa/Johannesburg"})} SAST. Refresh for newer activity.</p>
      <section className="space-y-3 rounded-xl border p-3"><h3 className="font-semibold">Sales report</h3>
        {sales?.state === "ready" ? <><dl className="grid grid-cols-2 gap-3">{[
          ["Revenue · month to date", sales.revenueMonth], ["Cash collected · month to date", sales.cashMonth], ["Gross profit · month to date", sales.grossProfitMonth], ["Net profit · month to date", sales.netProfitMonth], ["Revenue · financial year to date", sales.revenueYear],
        ].map(([label,value]) => <div key={String(label)} className="min-w-0 rounded-lg bg-muted/40 p-2"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-base font-semibold">{money(value as number | undefined)}</dd></div>)}</dl><p className="text-xs text-muted-foreground">{sales.detail}</p>{Boolean(sales.postingExceptions) && <p className="text-sm text-amber-700 dark:text-amber-400">{sales.postingExceptions} open posting exceptions. Totals may change when these are resolved.</p>}</> : <p className="text-sm text-muted-foreground">{sales?.detail || "Refresh to check the sales report."}</p>}
        <Link href="/accounting/performance" className="inline-flex min-h-11 items-center text-sm font-medium text-primary">Open accounting performance →</Link>
      </section>
      <section className="space-y-3 rounded-xl border p-3"><h3 className="font-semibold">Outstanding repairs {repair ? `(${repair.total})` : ""}</h3>
        {analysis.coverage.some(item => item.module === "repairs" && item.state === "partial") && <p className="text-sm text-amber-700 dark:text-amber-400">Partial repair data: counts and filters cover the loaded records only.</p>}
        {repair ? <><label className="grid gap-1 text-sm">Show jobs<select className="min-h-11 w-full rounded-lg border bg-background px-2 text-base" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All outstanding</option><option value="awaiting_approval">Awaiting approval</option><option value="in_progress">In progress</option><option value="collection">Collection review</option><option value="unassigned">Unassigned</option></select></label>
          <p className="text-xs text-muted-foreground">Oldest updates first. Closed, collected and cancelled jobs are excluded. Collection status does not authorise device release.</p>
          {repair.truncated && <p className="text-xs">Showing the oldest 100 outstanding jobs. Open Repairs for the complete queue.</p>}
          {jobs.length === 0 ? <p className="text-sm">No jobs in this selection{repair.truncated ? " among the displayed records" : ""}.</p> : <ul className="divide-y">{jobs.map(job => <li key={job.id} className="py-3 text-sm"><p className="font-semibold">{job.number}</p><p className="capitalize">{job.status.replaceAll("_"," ")} · {job.assigned ? "Assigned" : "Needs a technician"}</p><p className="text-xs text-muted-foreground">Updated {new Date(job.updatedAt).toLocaleDateString("en-ZA", {timeZone:"Africa/Johannesburg"})}</p></li>)}</ul>}
        </> : <p className="text-sm text-muted-foreground">{analysis.coverage.find(item => item.module === "repairs")?.detail || "Repair records could not be checked."}</p>}
        <Link href="/repairs/scanner" className="inline-flex min-h-11 items-center text-sm font-medium text-primary">Open repair workspace →</Link>
      </section>
      <section className="space-y-3"><h3 className="font-semibold">Stock, money owed and follow-ups</h3><dl className="grid grid-cols-2 gap-3">{analysis.metrics.filter(metric => metric.module !== "repairs").map(metric => <div key={metric.id} className="min-w-0 rounded-xl border p-3"><dt className="text-xs text-muted-foreground">{metric.label}</dt><dd className="mt-1 break-words text-lg font-semibold">{metric.value}</dd><p className="mt-2 text-xs text-muted-foreground">{metric.detail}</p></div>)}</dl></section>
      <details><summary className="min-h-11 cursor-pointer font-medium">Priority findings ({analysis.findings.length})</summary><div className="space-y-3">{analysis.findings.map(finding => <CoreFindingCard key={finding.id} finding={finding} compact/>)}</div></details>
      <details><summary className="min-h-11 cursor-pointer font-medium">Data checked and limitations</summary><CoreCoverage coverage={analysis.coverage}/></details>
      <Button type="button" variant="outline" onClick={() => downloadCoreReport(analysis)}>Download business report</Button>
    </>}
  </section>;
}
