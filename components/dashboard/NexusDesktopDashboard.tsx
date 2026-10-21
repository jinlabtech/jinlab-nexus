"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpRight, Bell, CircleCheck, RefreshCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NexusIcon } from "@/components/nexus-icons/NexusIcon";
import CoreCoverage from "@/components/intelligence/CoreCoverage";
import CoreFindingCard, { CORE_MODULE_LABELS } from "@/components/intelligence/CoreFindingCard";
import { usePermissions } from "@/hooks/usePermissions";
import { downloadCoreReport } from "@/lib/services/coreIntelligenceService";
import type { CoreAnalysis, CoreModule } from "@/lib/intelligence/types";
import type { PermissionName } from "@/types/permissions";

const areas = Object.keys(CORE_MODULE_LABELS) as CoreModule[];
const shortcuts: { title: string; detail: string; href: string; icon: string; permission: PermissionName }[] = [
  { title: "Repairs", detail: "Job cards and handovers", href: "/repairs/scanner", icon: "repairs", permission: "repair.view" },
  { title: "Point of sale", detail: "Sales and checkout", href: "/pos", icon: "pos", permission: "pos.view" },
  { title: "Customers", detail: "Customer records", href: "/customers", icon: "customers", permission: "customer.view" },
  { title: "Inventory", detail: "Products and stock", href: "/inventory", icon: "inventory", permission: "inventory.view" },
  { title: "Invoices", detail: "Invoices and balances", href: "/invoices", icon: "invoices", permission: "invoice.view" },
  { title: "Accounting", detail: "Financial workspace", href: "/accounting", icon: "accounting", permission: "accounting.view" },
  { title: "WhatsApp", detail: "Customer conversations", href: "/whatsapp", icon: "whatsapp", permission: "whatsapp.view" },
  { title: "Email", detail: "Mail and communication", href: "/email", icon: "email", permission: "email.view" },
  { title: "Quotations", detail: "Quotes and follow-ups", href: "/quotations", icon: "quotations", permission: "quotation.view" },
  { title: "Purchasing", detail: "Orders and suppliers", href: "/purchasing", icon: "purchasing", permission: "purchasing.view" },
  { title: "My HR", detail: "Your staff workspace", href: "/hr", icon: "hr", permission: "hr.self" },
  { title: "HR management", detail: "People and records", href: "/hr/manage", icon: "users", permission: "hr.view" },
  { title: "My payslips", detail: "Your payslip records", href: "/payroll/my-payslips", icon: "payroll", permission: "payroll.self" },
  { title: "Shipping", detail: "Shipments and tracking", href: "/shipping", icon: "shipping", permission: "shipping.view" },
];

type Props = { isOwner: boolean; role: string; analysis: CoreAnalysis | null; checking: boolean; reviewError: string; onRefresh: () => void };

export default function NexusDesktopDashboard({ isOwner, role, analysis: suppliedAnalysis, checking, reviewError, onRefresh }: Props) {
  // Owner business figures never render in a staff workspace, even if stale props arrive.
  const analysis = isOwner ? suppliedAnalysis : null;
  const permissions = usePermissions();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [filter, setFilter] = useState<CoreModule | "all">("all");
  const [limit, setLimit] = useState(8);
  const notificationRoot = useRef<HTMLDivElement>(null);
  const notificationButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const review = useRef<HTMLElement>(null);
  const reviewTitle = useRef<HTMLHeadingElement>(null);
  const coverage = useRef<HTMLDetailsElement>(null);
  const urgent = analysis?.findings.filter(item => item.severity === "high").length ?? 0;
  const incomplete = analysis?.coverage.filter(item => item.state !== "ready") ?? [];
  const availableShortcuts = shortcuts.filter(item => permissions.can(item.permission));
  const findings = analysis?.findings.filter(item => filter === "all" || item.module === filter) ?? [];
  const metrics = analysis?.metrics.filter(item => filter === "all" || item.module === filter) ?? [];
  const count = (area: CoreModule) => analysis?.findings.filter(item => item.module === area).length ?? 0;

  useEffect(() => {
    if (!notificationsOpen) return;
    closeButton.current?.focus({ preventScroll: true });
    const pointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !notificationRoot.current?.contains(event.target)) setNotificationsOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setNotificationsOpen(false); notificationButton.current?.focus(); }
    };
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", pointer); document.removeEventListener("keydown", key); };
  }, [notificationsOpen]);

  function selectArea(area: CoreModule | "all", moveFocus = false) {
    setFilter(area); setLimit(8); setNotificationsOpen(false);
    if (moveFocus) {
      review.current?.scrollIntoView({ block: "start", behavior: "auto" });
      reviewTitle.current?.focus({ preventScroll: true });
    }
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-medium text-primary">{isOwner ? "Owner workspace" : `${role.replaceAll("_", " ")} workspace`}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Business overview</h1><p className="mt-2 text-sm text-muted-foreground">{isOwner ? "Your business measures, priorities and daily work in one place." : "Your daily work, with access matched to your role."}</p></div>
      {isOwner && <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => window.dispatchEvent(new Event("nexus:helper-open"))}><Sparkles />Ask Nexus Core</Button>
        <div ref={notificationRoot} className="relative">
          <Button ref={notificationButton} variant="outline" aria-expanded={notificationsOpen} aria-controls="nexus-desktop-notifications" onClick={() => setNotificationsOpen(value => !value)}><Bell />Nexus Pulse<span className="rounded-full bg-muted px-2 py-0.5 text-xs">{analysis ? analysis.findings.length : "—"}</span></Button>
          {notificationsOpen && <section id="nexus-desktop-notifications" role="dialog" aria-label="Nexus Pulse notifications" className="nexus-dashboard-notifications absolute right-0 top-full z-40 mt-2 w-[360px] max-w-[calc(100vw-3rem)] rounded-xl border bg-popover p-4 text-popover-foreground shadow-md">
            <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Nexus Pulse</h2><p className="mt-1 text-xs text-muted-foreground">Current review · {urgent} high priority</p></div><Button ref={closeButton} size="icon" variant="ghost" aria-label="Close notifications" onClick={() => { setNotificationsOpen(false); notificationButton.current?.focus(); }}><X /></Button></div>
            <div className="mt-3 max-h-[min(440px,60vh)] space-y-2 overflow-y-auto">
              {!analysis ? <p className="py-4 text-sm text-muted-foreground">{checking ? "Review in progress. Alerts will be available when it finishes." : "Refresh the review to check for priorities."}</p> : <>{areas.filter(area => count(area) > 0).map(area => <button type="button" key={area} className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left text-sm hover:bg-muted" onClick={() => selectArea(area, true)}><span>{CORE_MODULE_LABELS[area]}<small className="mt-1 block text-muted-foreground">Open this area in the business review</small></span><span className="font-semibold">{count(area)}</span></button>)}{analysis.findings.length === 0 && <p className="py-4 text-sm">No priorities identified in the records reviewed.</p>}{incomplete.length > 0 && <button type="button" className="w-full rounded-lg border p-3 text-left text-sm" onClick={() => { setNotificationsOpen(false); if (coverage.current) { coverage.current.open = true; coverage.current.scrollIntoView({ block: "center" }); coverage.current.querySelector("summary")?.focus(); } }}>{incomplete.length} data coverage {incomplete.length === 1 ? "gap" : "gaps"} — review limitations</button>}</>}
            </div><p className="mt-3 border-t pt-3 text-[11px] text-muted-foreground">These are current business findings, not unread messages. Reviewing them does not change any records.</p>
          </section>}
        </div>
        <Button disabled={checking} onClick={onRefresh}><RefreshCw className={checking ? "animate-spin" : ""} />{checking ? "Checking…" : "Refresh review"}</Button>
      </div>}
    </div>

    <section className="rounded-xl border bg-card p-5" aria-label="Your workspaces"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-semibold">Your workspaces</h2><span className="text-xs text-muted-foreground">Available with your access</span></div>
      {permissions.loading ? <p role="status" className="text-sm text-muted-foreground">Loading your available workspaces…</p> : permissions.errorMessage ? <div role="alert" className="text-sm"><p>{permissions.errorMessage}</p><Button className="mt-2" variant="outline" onClick={() => void permissions.refreshPermissions()}>Retry access check</Button></div> : availableShortcuts.length ? <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">{availableShortcuts.map(item => <Link key={item.href} href={item.href} className="flex min-w-0 items-center gap-3 rounded-lg border p-3 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><NexusIcon name={item.icon} size="sidebar" /><span className="min-w-0 flex-1"><strong className="block text-sm">{item.title}</strong><span className="mt-1 block text-xs text-muted-foreground">{item.detail}</span></span><ArrowUpRight className="size-4 shrink-0 text-muted-foreground" /></Link>)}</div> : <p className="text-sm text-muted-foreground">No shortcuts are available with your current access. Ask your owner to review your role permissions.</p>}
    </section>

    {isOwner && <>
      {reviewError && <div role="alert" className="rounded-xl border border-destructive/30 bg-card p-4 text-sm text-destructive">{reviewError}{analysis && " The last completed review remains visible below."}<Button className="ml-3" variant="outline" disabled={checking} onClick={onRefresh}>Try again</Button></div>}
      {!analysis && <div role="status" className="rounded-xl border bg-card p-6"><h2 className="font-semibold">{checking ? "Checking your business records" : "Your business review"}</h2><p className="mt-2 text-sm text-muted-foreground">{checking ? "Your workspaces are ready to use while the review loads." : "Refresh the review to load current business measures and priorities."}</p></div>}
      {analysis && <>
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><p>Last reviewed {new Date(analysis.checkedAt).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} SAST · {urgent} high priority</p><Button size="sm" variant="outline" onClick={() => downloadCoreReport(analysis)}><ArrowDownToLine />Download review</Button></div>
        <section ref={review} className="scroll-mt-6 rounded-xl border bg-card p-5" aria-label="Business review">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 ref={reviewTitle} tabIndex={-1} className="text-lg font-semibold">Business review</h2><p className="mt-1 text-sm text-muted-foreground">Select an area to review its measures and priorities.</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs">{analysis.findings.length} findings</span></div>
          <div className="my-5 flex flex-wrap gap-2" aria-label="Business review areas">{(["all", ...areas] as const).map(area => <button key={area} type="button" aria-pressed={filter === area} onClick={() => selectArea(area)} className={`rounded-lg border px-3 py-2 text-xs font-medium ${filter === area ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>{area === "all" ? "Overview" : CORE_MODULE_LABELS[area]}{area !== "all" && <span className="ml-2">{count(area)}</span>}</button>)}</div>
          {filter === "all" ? <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">{areas.map(area => { const metric = analysis.metrics.find(item => item.module === area); const state = analysis.coverage.find(item => item.module === area); return <button type="button" key={area} onClick={() => selectArea(area)} className="min-w-0 rounded-lg border p-4 text-left hover:bg-muted"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{CORE_MODULE_LABELS[area]}</h3><ArrowUpRight className="size-4" /></div><p className="mt-3 break-words text-xl font-semibold">{metric?.value ?? "—"}</p><p className="mt-1 text-xs text-muted-foreground">{metric?.label ?? (state?.state === "forbidden" ? "Not available with your access" : "No measure available")}</p><p className="mt-4 border-t pt-3 text-xs">{count(area)} findings{state?.state !== "ready" && <span className="ml-2 text-muted-foreground">· {state?.state === "forbidden" ? "Restricted" : "Coverage incomplete"}</span>}</p></button>; })}</div> : <>
            {!!metrics.length && <div className="mb-5 grid gap-3 lg:grid-cols-3">{metrics.map(metric => <article key={metric.id} className="min-w-0 rounded-lg bg-muted/40 p-4"><p className="text-xs text-muted-foreground">{metric.label}</p><p className="mt-2 break-words text-2xl font-semibold">{metric.value}</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{metric.detail}</p></article>)}</div>}
            {analysis.coverage.find(item => item.module === filter)?.state !== "ready" && <p className="mb-4 rounded-lg border p-3 text-sm text-muted-foreground">{analysis.coverage.find(item => item.module === filter)?.detail ?? "Coverage for this area was not supplied."}</p>}
            {findings.length ? <><div className="grid gap-3 xl:grid-cols-2">{findings.slice(0, limit).map(finding => <CoreFindingCard key={finding.id} finding={finding} compact />)}</div><div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">Showing {Math.min(limit, findings.length)} of {findings.length}</span>{limit < findings.length && <Button variant="outline" onClick={() => setLimit(value => value + 8)}>Show more findings</Button>}</div></> : <div className="flex items-start gap-3 rounded-lg border p-5"><CircleCheck className="size-5 shrink-0 text-muted-foreground" /><p className="text-sm">No priorities identified in this area. Check its data coverage before drawing a conclusion.</p></div>}
          </>}
        </section>
        <details ref={coverage} className="rounded-xl border bg-card p-5"><summary className="cursor-pointer text-sm font-semibold">Data coverage <span className="ml-2 font-normal text-muted-foreground">{analysis.coverage.filter(item => item.state === "ready").length}/{analysis.coverage.length} areas fully checked{incomplete.length > 0 ? " · Some records could not be fully checked" : ""}</span></summary><div className="mt-4"><CoreCoverage coverage={analysis.coverage} /></div></details>
      </>}
    </>}
  </div>;
}
