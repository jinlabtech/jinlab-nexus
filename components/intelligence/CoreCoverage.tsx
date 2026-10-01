"use client";

import { CheckCircle2, CircleHelp, LockKeyhole } from "lucide-react";
import type { Coverage } from "@/lib/intelligence/types";

const labels = { ready: "Checked", partial: "Partial view", unavailable: "Could not check", forbidden: "No access" };

export default function CoreCoverage({ coverage }: { coverage: Coverage[] }) {
  return <div className="space-y-3">{coverage.map((item) => <div key={item.module} className="rounded-xl border bg-background p-3">
    <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{item.label}</span><span className={`inline-flex items-center gap-1 text-[10px] font-medium ${item.state === "ready" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>{item.state === "ready" ? <CheckCircle2 className="size-3" /> : item.state === "forbidden" ? <LockKeyhole className="size-3" /> : <CircleHelp className="size-3" />}{labels[item.state]}</span></div>
    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
    {item.records !== null && <p className="mt-2 text-[10px] text-muted-foreground">{item.records.toLocaleString()} record{item.records === 1 ? "" : "s"} reviewed</p>}
  </div>)}</div>;
}
