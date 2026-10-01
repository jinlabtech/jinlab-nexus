"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ExternalLink, Link2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAbort, whatsappError, whatsappService } from "@/lib/services/whatsappService";
import type { WhatsAppConnection } from "@/types/whatsapp";

export default function WhatsAppConnectionCard({ onChange }: { onChange?: (state: WhatsAppConnection) => void }) {
  const [connection, setConnection] = useState<WhatsAppConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const refresh = useCallback(async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    try {
      const state = await whatsappService.account(controller.signal);
      if (controller.signal.aborted) return;
      setConnection(state);
      setError("");
      onChange?.(state);
    } catch (caught) {
      if (!isAbort(caught) && !controller.signal.aborted) setError(whatsappError(caught));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [onChange]);

  useEffect(() => {
    mounted.current = true;
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 60_000);
    return () => { mounted.current = false; abort.current?.abort(); window.clearInterval(timer); window.clearTimeout(initial); };
  }, [refresh]);

  async function connect(active: boolean) {
    setBusy(true);
    setError("");
    try {
      await whatsappService.connect(active);
      if (mounted.current) await refresh();
    } catch (caught) {
      if (mounted.current) setError(whatsappError(caught));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  const ready = connection?.ready === true;
  const setupVisible = expanded || (connection !== null && !ready);
  return (
    <section className="rounded-2xl border bg-card" aria-label="WhatsApp Business connection">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${ready ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
            {ready ? <CheckCircle2 className="size-5" /> : <Link2 className="size-5" />}
          </div>
          <div>
            <p className="font-semibold">{ready ? "WhatsApp Business configured" : loading && !connection ? "Checking connection…" : "WhatsApp Business setup"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {ready ? [connection.account?.verified_name, connection.account?.display_phone_number].filter(Boolean).join(" · ") || "Official Meta connection" : "Connect your business number to the Nexus inbox."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 sm:inline-flex">Free service replies</span>
          <Button variant="ghost" size="icon" onClick={() => void refresh()} disabled={loading || busy} aria-label="Refresh WhatsApp connection">
            <RefreshCw className={loading ? "animate-spin" : ""} />
          </Button>
          <Button variant="outline" onClick={() => setExpanded(!expanded)} aria-expanded={setupVisible}>
            Connection details <ChevronDown className={setupVisible ? "rotate-180" : ""} />
          </Button>
        </div>
      </div>
      {error && <p role="alert" className="mx-4 mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {setupVisible && <div className="border-t p-4 sm:p-5">
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <h3 className="text-sm font-semibold">Official WhatsApp Business Platform</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Nexus uses Meta directly. This inbox allows text replies within the free customer service window after a customer messages you. Paid templates and automatic campaigns are disabled.</p>
            <ol className="mt-4 space-y-2 pl-5 text-sm text-muted-foreground list-decimal">
              <li>If your number is used in the WhatsApp Business phone app, your administrator must confirm that Meta supports using the app and Nexus together before connecting it.</li>
              <li>Have your administrator configure the private credentials and webhook for Nexus. Credentials stay on the server.</li>
              <li>Connect the configured number here, then ask a customer to message your business.</li>
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">Phone-app chats and earlier history are not currently synced into Nexus. App handoffs are manual and do not confirm delivery here.</p>
            <a href="https://business.whatsapp.com/products/platform-pricing" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">Meta pricing <ExternalLink className="size-3" /></a>
          </div>
          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-emerald-600" /> Connection readiness</p>
            <p className="mt-3 text-sm">{ready ? "Number configured. Confirm the connection by receiving a new customer message." : connection?.setupRequired ? "Database setup needs to be completed by your administrator." : connection?.missing.length ? "Private Meta configuration is incomplete." : connection?.account && !connection.account.active ? "The Nexus connection is paused." : "The configured number has not been connected to this company."}</p>
            {connection?.canManage && Boolean(connection.missing.length) && <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Configuration items needed</summary><ul className="mt-2 space-y-1 break-all">{connection.missing.map((name) => <li key={name}>{name}</li>)}</ul></details>}
            {connection?.canManage ? <div className="mt-4">
              <Button onClick={() => void connect(!ready)} disabled={busy || loading || (!ready && (Boolean(connection.missing.length) || connection.setupRequired))} variant={ready ? "outline" : "default"}>
                {busy ? "Updating connection…" : ready ? "Pause Nexus connection" : "Connect configured number"}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">{ready ? "Pausing stops this integration from processing new messages." : "Connects only the number configured for this company."}</p>
            </div> : <p className="mt-3 text-xs text-muted-foreground">An administrator with integration permissions can complete setup.</p>}
          </div>
        </div>
      </div>}
    </section>
  );
}
