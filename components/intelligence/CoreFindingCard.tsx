"use client";

import Link from "next/link";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { coreRecordHref } from "@/lib/services/coreIntelligenceService";
import type { CoreFinding, CoreModule } from "@/lib/intelligence/types";

export const CORE_MODULE_LABELS: Record<CoreModule, string> = {
  inventory: "Stock", receivables: "Money owed", quotations: "Quotations",
  purchasing: "Purchasing", repairs: "Repairs", controls: "Accounting checks", whatsapp: "WhatsApp Sales",
};

export default function CoreFindingCard({ finding, compact = false }: { finding: CoreFinding; compact?: boolean }) {
  const href = coreRecordHref(finding.href);
  const priority = { high: "High priority", medium: "Review soon", low: "Keep in view" }[finding.severity];
  const tone = { high: "border-l-amber-500", medium: "border-l-primary/60", low: "border-l-muted-foreground/30" }[finding.severity];
  return <article className={`rounded-xl border border-l-4 bg-card ${tone} ${compact ? "p-3" : "p-4 sm:p-5"}`}>
    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium"><span className="text-muted-foreground">{CORE_MODULE_LABELS[finding.module]}</span><span className={finding.severity === "high" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}>{priority}</span></div>
    <h3 className={`mt-2 font-semibold leading-snug ${compact ? "text-sm" : "text-base"}`}>{finding.title}</h3>
    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{finding.summary}</p>
    <details className="group mt-3 text-xs">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded py-1 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">Why this matters <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" /></summary>
      <div className="mt-2 space-y-3 rounded-lg bg-muted/50 p-3">
        <div><p className="font-semibold">Evidence from Nexus</p><ul className="mt-2 list-disc space-y-1.5 pl-4 text-muted-foreground">{finding.evidence.map((item, index) => <li key={`${finding.id}-${index}`}>{item}</li>)}</ul></div>
        <div className="border-t pt-3"><p className="font-semibold">Check applied</p><p className="mt-1 leading-relaxed text-muted-foreground">{finding.rule}</p></div>
      </div>
    </details>
    {href && <Link href={href} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary underline-offset-4 hover:underline">{finding.actionLabel}<ArrowUpRight className="size-3.5" /></Link>}
  </article>;
}
