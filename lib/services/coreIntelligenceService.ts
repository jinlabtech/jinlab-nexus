import { supabase } from "@/lib/supabase";
import type { CoreAnalysis, CoreResponse, CoreTopic } from "@/lib/intelligence/types";

export class CoreRequestError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = "CoreRequestError"; }
}

export function coreError(error: unknown) {
  return error instanceof Error ? error.message : "Nexus could not check your business data. Please try again.";
}

export function coreAborted(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function waitForCoreSignal<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(new DOMException("Request cancelled", "AbortError"));
    if (signal.aborted) { cancel(); return; }
    signal.addEventListener("abort", cancel, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener("abort", cancel));
  });
}

async function request(input?: { question: string; previousTopic?: CoreTopic; route?: string }, outerSignal?: AbortSignal): Promise<CoreResponse> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  let timedOut = false;
  const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, 35_000);
  outerSignal?.addEventListener("abort", cancel, { once: true });
  if (outerSignal?.aborted) controller.abort();
  try {
    const { data, error } = await waitForCoreSignal(supabase.auth.getSession(), controller.signal);
    if (error || !data.session) throw new CoreRequestError("Your session has expired. Sign in again to continue.", 401);
    const response = await fetch("/api/nexus-intelligence", {
      method: input ? "POST" : "GET", cache: "no-store", signal: controller.signal,
      headers: { Authorization: `Bearer ${data.session.access_token}`, ...(input ? { "Content-Type": "application/json" } : {}) },
      ...(input ? { body: JSON.stringify(input) } : {}),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new CoreRequestError(payload?.error || "Nexus could not load this review. Please try again.", response.status);
    if (!payload?.analysis || (input && !payload.answer)) throw new CoreRequestError("The review was incomplete. Please try again.", 502);
    return payload as CoreResponse;
  } catch (error) {
    if (timedOut) throw new CoreRequestError("This review took too long. Your draft is safe; try again when your connection is ready.", 408);
    if (error instanceof TypeError) throw new CoreRequestError("Nexus could not reach your business data. Check your connection and try again.", 0);
    throw error;
  } finally {
    window.clearTimeout(timer);
    outerSignal?.removeEventListener("abort", cancel);
  }
}

export const coreIntelligenceService = {
  review: (signal?: AbortSignal) => request(undefined, signal),
  ask: (input: { question: string; previousTopic?: CoreTopic; route?: string }, signal?: AbortSignal) => request(input, signal),
};

export function coreRecordHref(href: string) {
  return /^\/(?!\/)/.test(href) && !/[\\\r\n]/.test(href) ? href : null;
}

export function downloadCoreReport(analysis: CoreAnalysis) {
  const lines = ["NEXUS INTELLIGENCE", analysis.companyName, `Business date: ${analysis.asOf}`, `Checked: ${analysis.checkedAt}`, "", analysis.headline, "", "BUSINESS MEASURES"];
  for (const metric of analysis.metrics) lines.push(`${metric.label}: ${metric.value}`, metric.detail, "");
  lines.push("PRIORITIES");
  if (!analysis.findings.length) lines.push("No priorities identified within the available data and current checks.");
  for (const finding of analysis.findings) lines.push(`[${finding.severity.toUpperCase()}] ${finding.title}`, finding.summary, ...finding.evidence.map((item) => `- ${item}`), `Check applied: ${finding.rule}`, `${finding.actionLabel}: ${coreRecordHref(finding.href) ? window.location.origin + finding.href : "Open the relevant Nexus module"}`, "");
  lines.push("DATA COVERAGE");
  for (const coverage of analysis.coverage) lines.push(`${coverage.label}: ${coverage.state}${coverage.records === null ? "" : ` (${coverage.records} records)`}`, coverage.detail, "");
  lines.push("Prepared by Nexus Core from permitted Nexus records and defined business checks. This report does not change records.");
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `nexus-intelligence-${analysis.asOf.replace(/[^\d-]/g, "").slice(0, 10) || "review"}.txt`;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
