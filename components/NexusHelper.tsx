"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Activity, ArrowDownToLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import CoreQuestionPanel from "@/components/intelligence/CoreQuestionPanel";
import { downloadCoreReport } from "@/lib/services/coreIntelligenceService";
import type { CoreAnalysis } from "@/lib/intelligence/types";

function moduleLabel(pathname: string) {
  const section = pathname.split("/").filter(Boolean)[0] ?? "dashboard";
  const labels: Record<string, string> = { dashboard: "Whole business", inventory: "Stock", invoices: "Invoices", accounting: "Accounting", quotations: "Quotations", purchasing: "Purchasing", repairs: "Repairs", whatsapp: "WhatsApp", customers: "Customers" };
  return labels[section] ?? section.replaceAll("-", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export default function NexusHelper() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [analysis, setAnalysis] = useState<CoreAnalysis | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    function openFromNexusAction() {
      setOpen(true);
    }

    window.addEventListener(
      "nexus:helper-open",
      openFromNexusAction
    );

    return () => {
      window.removeEventListener(
        "nexus:helper-open",
        openFromNexusAction
      );
    };
  }, []);

  useEffect(() => {
    if (!open) { if (wasOpen.current) opener.current?.focus(); wasOpen.current = false; return; }
    wasOpen.current = true;
    closeButton.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); opener.current?.focus(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);
  function close() { setOpen(false); opener.current?.focus(); }
  return <div id="nexus-helper-root">
    <button ref={opener} type="button" onClick={() => setOpen((current) => !current)} aria-label={open ? "Close Nexus Core helper" : "Open Nexus Core helper"} aria-expanded={open} aria-controls="nexus-core-helper" className={`${open ? "hidden" : "flex"} fixed bottom-5 right-5 z-[70] size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring`}><Activity className="size-5" /></button>
    <section id="nexus-core-helper" hidden={!open} role="dialog" aria-modal="false" aria-label="Nexus Core helper" className={`${open ? "flex" : "hidden"} fixed bottom-0 right-0 top-0 z-[80] w-full max-w-md flex-col border-l bg-background shadow-2xl sm:bottom-5 sm:right-5 sm:top-auto sm:h-[min(760px,calc(100dvh-40px))] sm:rounded-2xl sm:border`}>
      <header className="flex items-center justify-between gap-3 border-b px-4 py-4"><div><p className="flex items-center gap-2 text-sm font-semibold"><Activity className="size-4 text-primary" />Nexus Core</p><p className="mt-1 text-xs text-muted-foreground">{moduleLabel(pathname)} · Business records and checks</p></div><div className="flex items-center gap-1">{analysis && <Button variant="ghost" size="icon" aria-label="Download current business review" onClick={() => downloadCoreReport(analysis)}><ArrowDownToLine /></Button>}<Button ref={closeButton} variant="ghost" size="icon" aria-label="Close Nexus Core helper" onClick={close}><X /></Button></div></header>
      <div className="min-h-0 flex-1"><CoreQuestionPanel route={pathname} compact active={open} onAnalysis={setAnalysis} /></div>
      <p className="border-t px-4 py-2 text-[10px] text-muted-foreground">Nexus records only. Your draft stays here when you close this panel.</p>
    </section>
  </div>;
}
