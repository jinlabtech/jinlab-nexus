"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, CornerDownLeft, LoaderCircle, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { coreAborted, coreError, coreIntelligenceService, coreRecordHref } from "@/lib/services/coreIntelligenceService";
import type { CoreAnalysis, CoreAnswer, CoreTopic } from "@/lib/intelligence/types";
import CoreFindingCard, { CORE_MODULE_LABELS } from "./CoreFindingCard";

type Exchange = { id: string; question: string; answer: CoreAnswer; checkedAt: string; route: string };
const DEFAULT_QUESTIONS = ["What needs my attention today?", "Which invoices are overdue?", "What stock needs reordering?"];

export default function CoreQuestionPanel({ route, compact = false, active = true, onAnalysis }: {
  route: string; compact?: boolean; active?: boolean; onAnalysis?: (analysis: CoreAnalysis) => void;
}) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState("");
  const controller = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const inputId = useId();
  const currentRoute = route.slice(0, 200);
  const latest = messages.at(-1);
  const previousTopic: CoreTopic | undefined = latest?.route === currentRoute ? latest.answer.topic : undefined;

  useEffect(() => () => { requestId.current += 1; controller.current?.abort(); }, []);
  useEffect(() => () => { controller.current?.abort(); }, [currentRoute]);
  useEffect(() => {
    if (!active || !scroller.current || !stickToBottom.current) return;
    scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages, busy, active]);

  async function ask(customQuestion?: string) {
    const question = (customQuestion ?? draft).trim();
    if (!question || question.length > 1500 || controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    const id = ++requestId.current;
    setBusy(true); setError(""); setPendingQuestion(question);
    stickToBottom.current = true;
    try {
      const result = await coreIntelligenceService.ask({ question, previousTopic, route: currentRoute }, abort.signal);
      if (abort.signal.aborted || id !== requestId.current) return;
      if (!result.answer) throw new Error("Nexus did not return an answer. Please try again.");
      setMessages((current) => [...current, { id: crypto.randomUUID(), question, answer: result.answer!, checkedAt: result.analysis.checkedAt, route: currentRoute }]);
      if (customQuestion === undefined) setDraft((current) => current.trim() === question ? "" : current);
      onAnalysis?.(result.analysis);
    } catch (caught) {
      if (!coreAborted(caught) && id === requestId.current) setError(coreError(caught));
    } finally {
      if (id === requestId.current) { controller.current = null; setBusy(false); setPendingQuestion(""); }
    }
  }

  function cancel() {
    requestId.current += 1; controller.current?.abort(); controller.current = null;
    setBusy(false); setPendingQuestion(""); setError("");
  }

  const quickQuestions = compact ? ["What needs attention in this module?", "What should I focus on next?"] : DEFAULT_QUESTIONS;
  const followups = latest?.answer.suggestions ?? [];
  return <section className={`flex min-h-0 flex-col ${compact ? "h-full" : "rounded-2xl border bg-card"}`} aria-label="Ask Nexus Core">
    {!compact && <div className="border-b p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Ask your business</h2><span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">Nexus Core</span></div><p className="mt-2 text-sm text-muted-foreground">Ask about priorities, find a record or follow up on the evidence.</p></div>}
    <div ref={scroller} onScroll={(event) => { const element = event.currentTarget; stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100; }} className={`min-h-0 space-y-5 overflow-y-auto p-4 sm:p-5 ${compact ? "flex-1" : "max-h-[600px]"}`}>
      {!messages.length && <div><p className="text-sm leading-relaxed text-muted-foreground">Nexus checks the records you can access and explains the business checks behind each finding.</p><div className="mt-4 flex flex-wrap gap-2">{quickQuestions.map((question) => <button key={question} type="button" disabled={busy} onClick={() => void ask(question)} className="rounded-xl border bg-background px-3 py-2 text-left text-xs font-medium transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50">{question}</button>)}</div></div>}
      {messages.map((message) => <article key={message.id} className="space-y-3">
        <div className="flex justify-end"><p className="max-w-[90%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary/10 px-4 py-3 text-sm text-foreground">{message.question}</p></div>
        <div><div className="mb-2 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-primary">Nexus Core</span><span className="text-[10px] text-muted-foreground">{message.answer.topic in CORE_MODULE_LABELS ? CORE_MODULE_LABELS[message.answer.topic as keyof typeof CORE_MODULE_LABELS] : "Business review"} · {new Date(message.checkedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span></div><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.answer.text}</p></div>
        {message.answer.matches.length > 0 && <div className="space-y-2">{message.answer.matches.map((match, index) => { const href = coreRecordHref(match.href); return href ? <Link key={`${match.href}-${index}`} href={href} className="flex items-start justify-between gap-2 rounded-lg border p-3 transition hover:bg-muted/40"><span><span className="block text-xs font-semibold text-primary">{match.label}</span><span className="mt-1 block text-xs text-muted-foreground">{match.detail}</span></span><ArrowUpRight className="size-4 shrink-0 text-primary" /></Link> : null; })}</div>}
        {message.answer.findings.length > 0 && <details className="group"><summary className="w-fit cursor-pointer rounded py-1 text-xs font-semibold text-primary focus-visible:outline-2 focus-visible:outline-ring">See supporting findings ({message.answer.findings.length})</summary><div className="mt-3 space-y-3">{message.answer.findings.map((finding) => <CoreFindingCard key={finding.id} finding={finding} compact />)}</div></details>}
      </article>)}
      {busy && <div role="status" className="flex items-start gap-2 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground"><LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" /><div><p className="font-medium text-foreground">Checking Nexus records…</p><p className="mt-1 break-words">{pendingQuestion}</p></div></div>}
      {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    </div>
    {followups.length > 0 && <div className="flex flex-wrap gap-2 border-t px-4 py-3">{followups.slice(0, 4).map((question) => <button key={question} type="button" disabled={busy} onClick={() => void ask(question)} className="rounded-full border px-3 py-1.5 text-left text-[11px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">{question}</button>)}</div>}
    <form onSubmit={(event) => { event.preventDefault(); void ask(); }} className="border-t p-4">
      <label htmlFor={inputId} className="sr-only">Ask Nexus a question</label>
      <textarea ref={textarea} id={inputId} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(); } }} rows={compact ? 3 : 2} maxLength={1500} placeholder={messages.length ? "Ask a follow-up…" : "What should I focus on today?"} className="w-full resize-y rounded-xl border bg-background p-3 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      <div className="mt-3 flex items-center justify-between gap-3"><span className="text-[10px] text-muted-foreground">{draft.length}/1500 <span className="hidden sm:inline">· Shift + Enter for a new line</span></span>{busy ? <Button type="button" variant="outline" onClick={cancel}><Square /> Stop</Button> : <Button type="submit" disabled={!draft.trim()}><Send /> Ask Nexus</Button>}</div>
      {messages.length > 0 && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground"><span className="inline-flex items-center gap-1"><CornerDownLeft className="size-3" /> Follow-up topic: {previousTopic && previousTopic in CORE_MODULE_LABELS ? CORE_MODULE_LABELS[previousTopic as keyof typeof CORE_MODULE_LABELS] : "Business overview"}</span><button type="button" disabled={busy} onClick={() => { setMessages([]); setError(""); textarea.current?.focus(); }} className="rounded py-1 underline-offset-2 hover:underline disabled:opacity-50">Clear answers</button></div>}
    </form>
  </section>;
}
