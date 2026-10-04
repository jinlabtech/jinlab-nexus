"use client";

import SearchableSelect from "@/components/ui/SearchableSelect";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, CheckCheck, Clock3, Download, FileText, LoaderCircle, RefreshCw, Send, UserRound, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAbort, WhatsAppRequestError, whatsappAppUrl, whatsappError, whatsappService } from "@/lib/services/whatsappService";
import type {
  WhatsAppAssignableUser,
  WhatsAppAttentionState,
  WhatsAppComposerState,
  WhatsAppConversation,
  WhatsAppConversationDetail,
  WhatsAppConversationUpdate,
  WhatsAppMessage,
  WhatsAppSalesContextUpdate,
  WhatsAppSalesStage,
} from "@/types/whatsapp";

function mergeMessages(current: WhatsAppMessage[], incoming: WhatsAppMessage[]) {
  const merged = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) merged.set(message.id, message);
  return [...merged.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

const SALES_STAGES: {
  value: WhatsAppSalesStage;
  label: string;
}[] = [
  { value: "enquiry", label: "Enquiry" },
  { value: "qualified", label: "Qualified" },
  { value: "quoted", label: "Quoted" },
  { value: "negotiating", label: "Negotiating" },
  { value: "won", label: "Won" },
  { value: "paid", label: "Paid" },
  { value: "lost", label: "Lost" },
];


const ATTENTION_STATES: {
  value: WhatsAppAttentionState;
  label: string;
}[] = [
  { value: "none", label: "Normal" },
  {
    value: "waiting_customer",
    label: "Waiting for customer",
  },
  {
    value: "follow_up_due",
    label: "Follow-up due",
  },
];


function toLocalDateTimeInput(
  value: string | null
) {
  if (!value) return "";

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  const local =
    new Date(
      date.getTime() -
      date.getTimezoneOffset() *
        60_000
    );

  return local
    .toISOString()
    .slice(0, 16);
}


function Attachment({ message }: { message: WhatsAppMessage }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  async function download() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    try {
      const blob = await whatsappService.media(message.id, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = (message.media_filename || `whatsapp-${message.message_type}-${message.id}`).replace(/[\\/]/g, "_");
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (caught) {
      if (!isAbort(caught) && !controller.signal.aborted) setError(whatsappError(caught));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return <div className="mt-2">
    <button type="button" onClick={() => void download()} disabled={busy} className="inline-flex max-w-full items-center gap-2 rounded-lg border bg-background/60 px-3 py-2 text-left text-xs font-medium hover:bg-background disabled:opacity-50">
      {busy ? <LoaderCircle className="size-4 shrink-0 animate-spin" /> : <Download className="size-4 shrink-0" />}<span className="truncate">{busy ? "Downloading…" : message.media_filename || `Download ${message.message_type}`}</span>
    </button>
    {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
  </div>;
}

function MessageBubble({ message }: { message: WhatsAppMessage }) {
  const outbound = message.direction === "outbound";
  const ambiguous = message.status === "unknown" || message.status === "sending";
  return <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
    <article className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[82%] ${outbound ? "rounded-br-md border border-emerald-500/10 bg-emerald-500/10" : "rounded-bl-md border bg-card"}`} aria-label={`${outbound ? "Outgoing" : "Incoming"} message`}>
      {message.body ? <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{message.body}</p> : <p className="text-sm capitalize text-muted-foreground">{message.message_type === "unsupported" ? "This message format cannot be displayed in Nexus." : message.message_type}</p>}
      {message.media_id && <Attachment message={message} />}
      <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
        <time dateTime={message.provider_timestamp || message.created_at}>{new Date(message.provider_timestamp || message.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
        {outbound && <span className={`inline-flex items-center gap-1 ${message.status === "read" ? "text-sky-600" : message.status === "failed" ? "text-destructive" : ""}`}>
          {message.status === "read" || message.status === "delivered" ? <CheckCheck className="size-3.5" /> : message.status === "sent" ? <Check className="size-3.5" /> : message.status === "failed" ? <XCircle className="size-3.5" /> : <Clock3 className="size-3.5" />}
          <span className="capitalize">{message.status === "unknown" ? "Delivery unknown" : message.status === "sending" ? "Awaiting confirmation" : message.status}</span>
        </span>}
      </div>
      {outbound && (ambiguous || message.status === "failed") && <p className="mt-2 max-w-xs text-[11px] leading-relaxed text-muted-foreground">{ambiguous ? "Meta has not confirmed the outcome. Do not resend this message while its status is uncertain." : `Message failed${message.error_code ? ` (code ${message.error_code})` : ""}. Check the error before trying again.`}</p>}
    </article>
  </div>;
}

export default function WhatsAppThread({ conversationId, composer, onComposerChange, ready, canSend, canShareQuotation, onBack, onUpdated }: {
  conversationId: string; ready: boolean; canSend: boolean; canShareQuotation: boolean;
  composer: WhatsAppComposerState;
  onComposerChange: (id: string, update: (current: WhatsAppComposerState) => WhatsAppComposerState) => void;
  onBack: () => void; onUpdated: (conversation: WhatsAppConversation) => void;
}) {
  const [detail, setDetail] = useState<WhatsAppConversationDetail | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [olderLoading, setOlderLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const { draft, pending, preparingQuotation } = composer;
  function setDraft(value: string) {
    onComposerChange(conversationId, (current) => ({ ...current, draft: value }));
  }
  const [customerId, setCustomerId] = useState("");
  const [consent, setConsent] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [
    assignees,
    setAssignees,
  ] =
    useState<WhatsAppAssignableUser[]>([]);

  const [
    assigneesLoading,
    setAssigneesLoading,
  ] =
    useState(false);

  const [
    followUpAtDraft,
    setFollowUpAt,
  ] =
    useState<string | null>(null);

  const [
    followUpNoteDraft,
    setFollowUpNote,
  ] =
    useState<string | null>(null);
  const followUpAt = followUpAtDraft ?? toLocalDateTimeInput(detail?.conversation.follow_up_at ?? null);
  const followUpNote = followUpNoteDraft ?? detail?.conversation.follow_up_note ?? "";
  const alive = useRef(true);
  const abort = useRef<AbortController | null>(null);
  const historyAbort = useRef<AbortController | null>(null);
  const historyLoaded = useRef(false);
  const sendLock = useRef(false);
  const scroller = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const previousHistoryHeight = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    try {
      const data = await whatsappService.conversation(conversationId, controller.signal);
      if (controller.signal.aborted) return;
      if (scroller.current) stickToBottom.current = scroller.current.scrollHeight - scroller.current.scrollTop - scroller.current.clientHeight < 120;
      setDetail(data);
      setMessages((current) => mergeMessages(current, data.messages));
      if (!historyLoaded.current) { setCursor(data.nextCursor); setHasMore(data.hasMore); }
      onUpdated(data.conversation);
      setError("");
    } catch (caught) {
      if (!isAbort(caught) && !controller.signal.aborted) setError(whatsappError(caught));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [conversationId, onUpdated]);

  useEffect(() => {
    alive.current = true;
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => { setNow(Date.now()); if (!document.hidden) void refresh(); }, 20_000);
    return () => { alive.current = false; abort.current?.abort(); historyAbort.current?.abort(); window.clearInterval(timer); window.clearTimeout(initial); };
  }, [refresh]);

  useEffect(() => {
    if (!scroller.current) return;
    if (previousHistoryHeight.current !== null) {
      scroller.current.scrollTop += scroller.current.scrollHeight - previousHistoryHeight.current;
      previousHistoryHeight.current = null;
    } else if (stickToBottom.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages]);

  useEffect(() => {

    if (!canSend) {
      return;
    }

    let active = true;

    const loadingTimer = window.setTimeout(() => { if (active) setAssigneesLoading(true); }, 0);

    void whatsappService
      .assignableUsers()
      .then((users) => {

        if (active) {
          setAssignees(users);
        }

      })
      .catch(() => {

        if (active) {
          setAssignees([]);
        }

      })
      .finally(() => {

        if (active) {
          window.clearTimeout(loadingTimer);
          setAssigneesLoading(false);
        }

      });

    return () => {
      active = false;
      window.clearTimeout(loadingTimer);
    };

  }, [canSend]);


  // A transport failure is reconciled from the stored request ID; it is never retried automatically.
  const reconciled = pending ? messages.find((message) => message.client_request_id === pending.id) : undefined;

  async function loadOlder() {
    if (!cursor || olderLoading) return;
    const controller = new AbortController();
    historyAbort.current = controller;
    setOlderLoading(true);
    try {
      const data = await whatsappService.conversation(conversationId, controller.signal, cursor);
      if (controller.signal.aborted) return;
      historyLoaded.current = true;
      previousHistoryHeight.current = scroller.current?.scrollHeight ?? null;
      setMessages((current) => mergeMessages(current, data.messages));
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
      setActionError("");
    } catch (caught) {
      if (!isAbort(caught) && !controller.signal.aborted) setActionError(whatsappError(caught));
    } finally {
      if (!controller.signal.aborted) setOlderLoading(false);
    }
  }

  async function update(input: WhatsAppConversationUpdate) {
    if (busy) return;
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      const { conversation } = await whatsappService.updateConversation(conversationId, input);
      if (!alive.current) return;
      setDetail((current) => current ? { ...current, conversation } : current);
      onUpdated(conversation);
      setConsent(false);
      await refresh();
    } catch (caught) {
      if (alive.current) setActionError(whatsappError(caught));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function updateSalesContext(
    input: WhatsAppSalesContextUpdate
  ) {
    if (busy) return;

    setBusy(true);
    setActionError("");
    setNotice("");

    try {
      const {
        conversation:
          updatedConversation,
      } =
        await whatsappService
          .updateSalesContext(
            conversationId,
            input
          );

      if (!alive.current) {
        return;
      }

      setDetail(
        (current) =>
          current
            ? {
                ...current,
                conversation:
                  updatedConversation,
              }
            : current
      );

      if (input.followUpAt !== undefined || input.clearFollowUp) {
        setFollowUpAt(null);
        setFollowUpNote(null);
      }
      onUpdated(
        updatedConversation
      );

      setNotice(
        "Sales context updated."
      );

    } catch (caught) {

      if (alive.current) {
        setActionError(
          whatsappError(caught)
        );
      }

    } finally {

      if (alive.current) {
        setBusy(false);
      }

    }
  }


  async function saveFollowUp() {

    if (!followUpAt) {
      setActionError(
        "Choose a follow-up date and time."
      );
      return;
    }

    const date =
      new Date(followUpAt);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      setActionError(
        "The follow-up date is invalid."
      );
      return;
    }

    await updateSalesContext({
      followUpAt:
        date.toISOString(),

      followUpNote:
        followUpNote.trim(),

      attentionState:
        date.getTime() <= now
          ? "follow_up_due"
          : undefined,
    });
  }


  async function clearFollowUp() {

    await updateSalesContext({
      clearFollowUp:
        true,

      attentionState:
        conversation?.attention_state ===
          "follow_up_due"
          ? "none"
          : conversation?.attention_state,
    });

  }


  async function prepareQuotation(quotationId: string) {
    if (busy || preparingQuotation || sending || sendLock.current || pending) return;
    setBusy(true);
    onComposerChange(conversationId, (current) => ({ ...current, preparingQuotation: true }));
    setActionError("");
    try {
      const { text } = await whatsappService.quotationDraft(conversationId, quotationId);
      onComposerChange(conversationId, (current) => ({ ...current, draft: current.draft ? `${current.draft}\n\n${text}` : text }));
      if (!alive.current) return;
      setNotice("Quotation link added to your draft. Review it before sending.");
    } catch (caught) {
      if (alive.current) setActionError(whatsappError(caught));
    } finally {
      onComposerChange(conversationId, (current) => ({ ...current, preparingQuotation: false }));
      if (alive.current) setBusy(false);
    }
  }

  const conversation = detail?.conversation;
  const closesAt = conversation?.last_inbound_at ? new Date(conversation.last_inbound_at).getTime() + (23 * 60 + 55) * 60_000 : 0;
  const inboundAt = conversation?.last_inbound_at ? Date.parse(conversation.last_inbound_at) : NaN;
  const windowOpen = inboundAt <= now && closesAt > now;
  const maySend = canSend && ready && windowOpen && !conversation?.opted_out && conversation?.status === "open";
  const appLink = conversation && !conversation.opted_out ? whatsappAppUrl(conversation.wa_id, draft.trim() || undefined) : null;

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!maySend || busy || preparingQuotation || sendLock.current || pending || !draft.trim() || draft.trim().length > 4096) return;
    const attempt = { id: crypto.randomUUID(), text: draft.trim() };
    onComposerChange(conversationId, (current) => ({ ...current, pending: attempt }));
    await submit(attempt, false);
  }

  async function recoverSubmission() {
    if (!pending || !canSend || busy || preparingQuotation || sendLock.current) return;
    // The server returns an existing reservation or creates it once if the original never arrived.
    await submit(pending, true);
  }

  async function submit(attempt: { id: string; text: string }, recovery: boolean) {
    sendLock.current = true;
    setSending(true);
    setActionError("");
    setNotice("");
    try {
      const { message } = await whatsappService.send({ conversationId, requestId: attempt.id, type: "text", text: attempt.text });
      onComposerChange(conversationId, (current) => current.pending?.id !== attempt.id ? current : {
        ...current,
        pending: null,
        draft: message.status !== "failed" && current.draft.trim() === attempt.text ? "" : current.draft,
      });
      if (!alive.current) return;
      setMessages((current) => mergeMessages(current, [message]));
      stickToBottom.current = true;
      await refresh();
    } catch (caught) {
      if (!recovery && caught instanceof WhatsAppRequestError && caught.status < 500) {
        onComposerChange(conversationId, (current) => current.pending?.id === attempt.id ? { ...current, pending: null } : current);
        if (alive.current) setActionError(whatsappError(caught));
      } else {
        if (!alive.current) return;
        setActionError(recovery ? `${whatsappError(caught)} The original submission reference is retained. Check its status or explicitly retry the same submission.` : "The submission outcome is uncertain. Check its status or explicitly retry the same submission below. Nexus will not retry automatically.");
        void refresh();
      }
    } finally {
      sendLock.current = false;
      if (alive.current) setSending(false);
    }
  }

  if (loading && !detail) return <div className="p-6 text-sm text-muted-foreground" role="status">Loading conversation…</div>;
  if (!detail || !conversation) return <div className="space-y-4 p-6"><Button variant="outline" onClick={onBack}><ArrowLeft /> Inbox</Button><p role="alert" className="text-sm text-destructive">{error || "Conversation could not be loaded."}</p><Button onClick={() => void refresh()} variant="outline">Try again</Button></div>;

  const customer = detail.customers.find(
    (item) =>
      item.id ===
      conversation.customer_id
  );

  return <div className="grid min-w-0 xl:grid-cols-[minmax(0,1fr)_290px]">
    <section className="flex min-w-0 flex-col" aria-label="Selected conversation">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="flex min-w-0 items-center gap-2"><Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to inbox" className="lg:hidden"><ArrowLeft /></Button><div className="min-w-0"><h2 className="truncate font-semibold">{conversation.contact_name || `+${conversation.wa_id}`}</h2><p className="mt-0.5 text-xs text-muted-foreground">+{conversation.wa_id} · <span className="capitalize">{conversation.status}</span>{conversation.opted_out ? " · Opted out" : ""}</p></div></div>
        <div className="flex items-center gap-2"><Button variant="ghost" size="icon" aria-label="Refresh selected conversation" onClick={() => void refresh()}><RefreshCw /></Button>{conversation.unread_count > 0 && <Button size="sm" variant="outline" disabled={busy} onClick={() => void update({ markRead: true, readThrough: detail.readThrough })}>Mark read ({conversation.unread_count})</Button>}{canSend && <Button size="sm" variant="outline" disabled={busy} onClick={() => void update({ status: conversation.status === "open" ? "closed" : "open" })}>{conversation.status === "open" ? "Close" : "Reopen"}</Button>}</div>
      </header>
      {error && <p role="alert" className="m-3 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{error} Your last loaded messages remain visible.</p>}
      <div ref={scroller} className="h-[390px] min-h-64 space-y-4 overflow-y-auto bg-muted/20 p-4 sm:h-[450px] sm:p-5" aria-label="Conversation messages" tabIndex={0}>
        {hasMore && <div className="text-center"><Button size="sm" variant="outline" disabled={olderLoading} onClick={() => void loadOlder()}>{olderLoading ? "Loading…" : "Load older messages"}</Button></div>}
        {messages.length ? messages.map((message) => <MessageBubble key={message.id} message={message} />) : <div className="flex h-full flex-col items-center justify-center text-center"><p className="text-sm font-medium">No messages yet</p><p className="mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">Ask this customer to message your business number to begin a free reply window.</p></div>}
      </div>
      <div className="space-y-3 border-t p-4">
        {actionError && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{actionError}</p>}
        {notice && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">{notice}</p>}
        {pending && <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <p>{reconciled ? `Submission found: ${reconciled.status === "unknown" ? "delivery unknown" : reconciled.status}. Review its status in the conversation.` : "Checking the previous submission. New messages are paused to prevent duplicates."}</p>
          {!reconciled && !sending && <p className="mt-2">If it never reached Nexus, you can retry the same submission. Its original reference and exact text are reused so an existing submission is not sent twice.</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void refresh()}>Check submission status</Button>
            {!reconciled && <Button size="sm" variant="outline" disabled={sending || busy || preparingQuotation || !canSend} onClick={() => void recoverSubmission()}>{sending ? "Checking submission…" : "Retry same submission"}</Button>}
            {reconciled && <Button size="sm" variant="outline" disabled={sending} onClick={() => { onComposerChange(conversationId, (current) => ({ ...current, pending: null, draft: "" })); setActionError(""); }}>Clear submitted draft</Button>}
          </div>
        </div>}
        <div className={`flex items-start gap-2 text-xs ${windowOpen && !conversation.opted_out ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}><Clock3 className="mt-0.5 size-3.5 shrink-0" /><p>{conversation.opted_out ? "This customer has opted out. Replies and app handoffs are paused." : !ready ? "Connect WhatsApp Business to send replies from Nexus." : conversation.status === "closed" ? "Reopen this conversation to reply." : windowOpen ? `Free replies available for about ${Math.max(1, Math.ceil((closesAt - now) / 60_000))} more minutes. Nexus closes replies five minutes early to avoid a paid-window edge.` : "Ask the customer to message your business to reopen replies. Paid templates are disabled."}</p></div>
        <form onSubmit={send} className="space-y-2">
          {canSend && <div className="flex flex-wrap items-center gap-2" aria-label="Sales reply starters">
            <span className="text-xs text-muted-foreground">Draft a reply:</span>
            {[
              ["Product enquiry", "Thanks for contacting us. Which product or model are you looking for, and what is your budget?"],
              ["Delivery details", "Would you prefer collection or delivery? For delivery, please confirm your suburb and postal code so we can prepare a quotation."],
              ["Quotation follow-up", "Have you had a chance to review your quotation? Let us know if you have any questions or would like us to adjust it."],
            ].map(([label, text]) => <Button key={label} type="button" size="sm" variant="outline" disabled={sending || pending !== null || preparingQuotation || conversation.opted_out || (draft.length + text.length + 2 > 4096)} onClick={() => setDraft(draft ? `${draft}\n\n${text}` : text)}>{label}</Button>)}
          </div>}
          <label htmlFor={`draft-${conversationId}`} className="sr-only">Message draft</label>
          <textarea id={`draft-${conversationId}`} value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} maxLength={4096} disabled={!canSend || sending || pending !== null || conversation.opted_out} placeholder={canSend ? "Write a reply or prepare a quotation link…" : "You have read-only access to this inbox."} className="w-full resize-y rounded-xl border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60" />
          <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-[11px] text-muted-foreground">{draft.length}/4096 · Review before sending</span><Button type="submit" disabled={!maySend || !draft.trim() || draft.length > 4096 || sending || busy || preparingQuotation || pending !== null}><Send />{sending ? "Submitting…" : preparingQuotation ? "Preparing quotation…" : "Send free reply"}</Button></div>
        </form>
        {canSend && appLink && !maySend && !pending && <div className="rounded-lg bg-muted/50 p-3"><a href={appLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary">Open WhatsApp app <ArrowUpRight className="size-4" /></a><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Opens your draft for manual review in WhatsApp. Nothing is sent automatically. Nexus cannot confirm app message delivery.</p></div>}
      </div>
    </section>
    <aside className="min-w-0 space-y-5 border-t bg-muted/10 p-4 xl:border-l xl:border-t" aria-label="Customer context">

      <section className="rounded-2xl border bg-card/70 p-4 shadow-sm">

        <div className="flex items-start justify-between gap-3">

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Sales Pipeline
            </p>

            <h3 className="mt-1 text-sm font-semibold">
              {
                SALES_STAGES.find(
                  (stage) =>
                    stage.value ===
                    conversation.sales_stage
                )?.label ??
                "Enquiry"
              }
            </h3>
          </div>

          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
            Live
          </span>

        </div>


        <div className="mt-4 grid grid-cols-2 gap-2">

          {
            SALES_STAGES.map(
              (stage) => {

                const active =
                  conversation.sales_stage ===
                  stage.value;

                return (
                  <button
                    key={stage.value}
                    type="button"
                    disabled={
                      busy ||
                      !canSend
                    }
                    aria-pressed={active}
                    onClick={() =>
                      void updateSalesContext({
                        salesStage:
                          stage.value,
                      })
                    }
                    className={
                      active
                        ? "rounded-xl border border-primary bg-primary px-3 py-2 text-left text-xs font-semibold text-primary-foreground shadow-sm transition"
                        : "rounded-xl border bg-background/60 px-3 py-2 text-left text-xs font-medium text-muted-foreground transition hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
                    }
                  >
                    {stage.label}
                  </button>
                );
              }
            )
          }

        </div>


        <div className="mt-5 border-t pt-4">

          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Conversation state
          </p>


          <div className="mt-2 flex flex-wrap gap-2">

            {
              ATTENTION_STATES.map(
                (state) => {

                  const active =
                    conversation.attention_state ===
                    state.value;

                  return (
                    <button
                      key={state.value}
                      type="button"
                      disabled={
                        busy ||
                        !canSend
                      }
                      aria-pressed={active}
                      onClick={() =>
                        void updateSalesContext({
                          attentionState:
                            state.value,
                        })
                      }
                      className={
                        active
                          ? "rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground transition"
                          : "rounded-full border bg-background/60 px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:bg-muted"
                      }
                    >
                      {state.label}
                    </button>
                  );
                }
              )
            }

          </div>

        </div>


        {
          conversation.sales_stage ===
            "won" && (
            <p className="mt-4 rounded-lg bg-emerald-500/10 p-3 text-xs leading-relaxed text-emerald-800 dark:text-emerald-300">
              Sale marked as won. Keep the conversation active until payment and fulfilment are complete.
            </p>
          )
        }


        {
          conversation.sales_stage ===
            "paid" && (
            <p className="mt-4 rounded-lg bg-emerald-500/10 p-3 text-xs leading-relaxed text-emerald-800 dark:text-emerald-300">
              Customer journey marked as paid.
            </p>
          )
        }


        {
          conversation.sales_stage ===
            "lost" && (
            <p className="mt-4 rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
              Opportunity marked as lost. The conversation and history remain available for future reference.
            </p>
          )
        }

      </section>
      <section className="rounded-2xl border bg-card/60 p-4">

        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <UserRound className="size-4" />
          Sales ownership
        </h3>


        <div className="mt-4">

          <label
            htmlFor={`sales-owner-${conversationId}`}
            className="text-xs font-medium"
          >
            Assigned salesperson
          </label>

          <SearchableSelect
            searchLabel="Team members"
            id={`sales-owner-${conversationId}`}
            value={
              conversation.assigned_to ??
              ""
            }
            onValueChange={
              (value) =>
                void updateSalesContext(
                  value
                    ? {
                        assignedTo:
                          value,
                      }
                    : {
                        clearAssignee:
                          true,
                      }
                )
            }
            disabled={
              busy ||
              !canSend ||
              assigneesLoading
            }
            className="mt-2 h-10 w-full rounded-lg border bg-background px-2 text-xs"
          >

            <option value="">
              Unassigned
            </option>

            {
              assignees.map(
                (user) => (
                  <option
                    key={user.user_id}
                    value={user.user_id}
                  >
                    {
                      user.display_name
                    }
                    {
                      user.role
                        ? ` · ${user.role}`
                        : ""
                    }
                  </option>
                )
              )
            }

          </SearchableSelect>

          {
            assigneesLoading && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Loading available team members…
              </p>
            )
          }

        </div>


        <div className="mt-5 border-t pt-4">

          <div className="flex items-center justify-between gap-3">

            <div>
              <p className="text-xs font-medium">
                Follow-up
              </p>

              <p className="mt-1 text-[11px] text-muted-foreground">
                Schedule the next customer contact.
              </p>
            </div>

            {
              conversation.follow_up_at && (
                <span
                  className={
                    Date.parse(
                      conversation.follow_up_at
                    ) <= now
                      ? "rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400"
                      : "rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary"
                  }
                >
                  {
                    Date.parse(
                      conversation.follow_up_at
                    ) <= now
                      ? "Due now"
                      : "Scheduled"
                  }
                </span>
              )
            }

          </div>


          <label
            htmlFor={`follow-up-${conversationId}`}
            className="mt-4 block text-[11px] font-medium"
          >
            Date and time
          </label>

          <input
            id={`follow-up-${conversationId}`}
            type="datetime-local"
            value={followUpAt}
            onChange={
              (event) =>
                setFollowUpAt(
                  event.target.value
                )
            }
            disabled={
              busy ||
              !canSend
            }
            className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-xs"
          />


          <label
            htmlFor={`follow-up-note-${conversationId}`}
            className="mt-3 block text-[11px] font-medium"
          >
            Follow-up note
          </label>

          <textarea
            id={`follow-up-note-${conversationId}`}
            value={followUpNote}
            onChange={
              (event) =>
                setFollowUpNote(
                  event.target.value
                )
            }
            maxLength={1000}
            rows={3}
            disabled={
              busy ||
              !canSend
            }
            placeholder="Example: Customer will confirm after payday."
            className="mt-1 w-full resize-y rounded-lg border bg-background p-3 text-xs"
          />


          <div className="mt-3 flex flex-wrap gap-2">

            <Button
              type="button"
              size="sm"
              disabled={
                busy ||
                !canSend ||
                !followUpAt
              }
              onClick={() =>
                void saveFollowUp()
              }
            >
              <Clock3 />
              Save follow-up
            </Button>


            {
              conversation.follow_up_at && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    busy ||
                    !canSend
                  }
                  onClick={() =>
                    void clearFollowUp()
                  }
                >
                  Clear
                </Button>
              )
            }

          </div>


          {
            conversation.follow_up_at && (
              <div className="mt-4 rounded-xl bg-muted/60 p-3">

                <p className="text-xs font-semibold">
                  {
                    new Date(
                      conversation.follow_up_at
                    ).toLocaleString(
                      undefined,
                      {
                        weekday:
                          "short",
                        day:
                          "numeric",
                        month:
                          "short",
                        hour:
                          "2-digit",
                        minute:
                          "2-digit",
                      }
                    )
                  }
                </p>

                {
                  conversation.follow_up_note && (
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      {
                        conversation.follow_up_note
                      }
                    </p>
                  )
                }

              </div>
            )
          }

        </div>

      </section>


      <section><h3 className="flex items-center gap-2 text-sm font-semibold"><UserRound className="size-4" /> Customer context</h3><p className="mt-3 text-sm font-medium">{customer?.display_name || (conversation.customer_id ? "Linked Nexus customer" : "No customer linked")}</p><p className="mt-1 text-xs text-muted-foreground">{customer?.phone || "Link a record to see the customer’s business documents."}</p>
        {canSend && <div className="mt-3 space-y-2"><label htmlFor={`customer-${conversationId}`} className="text-xs font-medium">Nexus customer</label><SearchableSelect searchLabel="Records" id={`customer-${conversationId}`} value={customerId || conversation.customer_id || ""} onValueChange={(selectedValue) => setCustomerId(selectedValue)} className="h-9 w-full rounded-lg border bg-background px-2 text-xs"><option value="" disabled>Select a customer</option>{detail.customers.map((item) => <option key={item.id} value={item.id}>{item.display_name}{item.phone ? ` · ${item.phone}` : ""}</option>)}</SearchableSelect><Button variant="outline" size="sm" disabled={busy || !customerId || customerId === conversation.customer_id} onClick={() => void update({ customerId })}>Link customer</Button>{!detail.customers.length && <p className="text-xs text-muted-foreground">No customer records available to link.</p>}</div>}
      </section>
      <section className="border-t pt-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><FileText className="size-4" /> Quotations</h3><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Prepare a customer share link in your draft. <Link href="/quotations" className="font-medium text-primary hover:underline">Open quotations</Link></p><div className="mt-3 space-y-3">{detail.documents.quotations.length ? detail.documents.quotations.map((quote) => <div key={quote.id} className="rounded-lg border bg-card p-3"><Link href={`/quotations/${quote.id}`} className="text-xs font-semibold text-primary hover:underline">{quote.quotation_number}</Link><p className="mt-1 text-[11px] capitalize text-muted-foreground">{quote.status}</p>{canSend && canShareQuotation && <Button variant="outline" size="sm" className="mt-2" disabled={busy || preparingQuotation || sending || pending !== null || conversation.opted_out || !["draft", "sent"].includes(quote.status)} onClick={() => void prepareQuotation(quote.id)}>Prepare link</Button>}</div>) : <p className="text-xs text-muted-foreground">{conversation.customer_id ? "No quotations available with your permissions." : "Link a customer to see quotations."}</p>}</div></section>
      <section className="border-t pt-4"><h3 className="text-sm font-semibold">Invoices</h3><p className="mt-2 text-xs text-muted-foreground">Internal Nexus records.</p><div className="mt-3 space-y-3">{detail.documents.invoices.length ? detail.documents.invoices.map((invoice) => <div key={invoice.id} className="rounded-lg border bg-card p-3"><Link href={`/invoices/${invoice.id}`} className="text-xs font-semibold text-primary hover:underline">{invoice.invoice_number}</Link><p className="mt-1 text-[11px] capitalize text-muted-foreground">{invoice.status}</p></div>) : <p className="text-xs text-muted-foreground">{conversation.customer_id ? "No invoices available with your permissions." : "Link a customer to see invoices."}</p>}</div></section>
      {canSend && <section className="border-t pt-4"><h3 className="text-sm font-semibold">Contact preferences</h3>{conversation.opted_out ? <><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Replies are paused. Only restore them when the customer has given renewed consent.</p><label className="mt-3 flex items-start gap-2 text-xs"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5" />The customer has agreed to receive replies again.</label><Button className="mt-3" size="sm" variant="outline" disabled={busy || !consent} onClick={() => void update({ optedOut: false })}>Record renewed consent</Button></> : <><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Respect the customer’s request to stop messages.</p><Button className="mt-3" size="sm" variant="outline" disabled={busy} onClick={() => void update({ optedOut: true })}>Record opt-out</Button></>}</section>}
    </aside>
  </div>;
}
