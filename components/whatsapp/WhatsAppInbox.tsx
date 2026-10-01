"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, MessageCircle, Plus, RefreshCw, Search, X } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/lib/supabase";
import { isAbort, whatsappAppUrl, whatsappError, whatsappService } from "@/lib/services/whatsappService";
import type { WhatsAppComposerState, WhatsAppConnection, WhatsAppConversation } from "@/types/whatsapp";
import WhatsAppConnectionCard from "./WhatsAppConnectionCard";
import WhatsAppThread from "./WhatsAppThread";

const emptyComposer: WhatsAppComposerState = { draft: "", pending: null, preparingQuotation: false };

function conversationTime(timestamp: string | null) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function NewConversation({ initialPhone, customerId, canCreate, onCreated, onClose }: {
  initialPhone: string; customerId: string; canCreate: boolean;
  onCreated: (conversation: WhatsAppConversation) => void; onClose: () => void;
}) {
  const [phone, setPhone] = useState(initialPhone);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const handoff = whatsappAppUrl(phone);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!handoff || !canCreate || busy) return;
    setBusy(true);
    setError("");
    try {
      const { conversation } = await whatsappService.createConversation({ phone, ...(customerId ? { customerId } : {}), ...(name.trim() ? { contactName: name.trim() } : {}) });
      if (alive.current) onCreated(conversation);
    } catch (caught) {
      if (alive.current) setError(whatsappError(caught));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return <section className="rounded-2xl border bg-card p-5" aria-label="Prepare a conversation">
    <div className="flex items-start justify-between gap-3">
      <div><h2 className="font-semibold">New conversation</h2><p className="mt-1 text-sm text-muted-foreground">Add a contact to your inbox. The customer must message your business before free replies are available.</p></div>
      <Button size="icon" variant="ghost" aria-label="Close new conversation" disabled={busy} onClick={onClose}><X /></Button>
    </div>
    <form onSubmit={create} className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">WhatsApp number
          <input type="tel" autoComplete="tel" required maxLength={30} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+27 82 123 4567" className="mt-1 block h-10 w-full rounded-lg border bg-background px-3 font-normal" aria-describedby="whatsapp-phone-hint" />
        </label>
        <label className="text-sm font-medium">Contact name <span className="font-normal text-muted-foreground">(optional)</span>
          <input type="text" maxLength={150} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border bg-background px-3 font-normal" />
        </label>
      </div>
      <p id="whatsapp-phone-hint" className="text-xs text-muted-foreground">Include the country code; remove the local leading zero. {customerId ? "This conversation will be linked to the selected Nexus customer." : "You can link a Nexus customer after creating the conversation."}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!handoff || !canCreate || busy}>{busy ? "Creating…" : "Add to inbox"}</Button>
        {handoff && <a href={handoff} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary">Open WhatsApp app <ArrowUpRight className="size-4" /></a>}
      </div>
      {!canCreate && <p className="text-xs text-muted-foreground">Connect WhatsApp Business to add conversations to Nexus. The app link opens a manual conversation; nothing is sent automatically.</p>}
    </form>
  </section>;
}

export default function WhatsAppInbox() {
  const router = useRouter();
  const params = useSearchParams();
  const customerId = params.get("customerId") || "";
  const initialPhone = params.get("phone") || "";
  const { can, loading: permissionsLoading, errorMessage: permissionsError } = usePermissions();
  const canView = can("whatsapp.view");
  const canManage = can("settings.integrations.manage");
  const [connection, setConnection] = useState<WhatsAppConnection | null>(null);
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [search, setSearch] = useState("");
  const requestedFilter = params.get("filter");
  const initialFilter = requestedFilter === "unread" || requestedFilter === "follow_up" || requestedFilter === "unassigned" || requestedFilter === "waiting" || requestedFilter === "won" ? requestedFilter : "all";
  const [filter, setFilter] = useState<
    | "all"
    | "unread"
    | "follow_up"
    | "unassigned"
    | "waiting"
    | "won"
  >(initialFilter);
  function selectFilter(value: typeof filter) {
    setFilter(value);
    const query = new URLSearchParams(params.toString());
    if (value === "all") query.delete("filter"); else query.set("filter", value);
    router.replace(query.toString() ? "/whatsapp?" + query.toString() : "/whatsapp", { scroll: false });
  }

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composers, setComposers] = useState<Record<string, WhatsAppComposerState>>({});
  const [newConversation, setNewConversation] = useState(Boolean(initialPhone || customerId));
  const [whatsappTeam, setWhatsappTeam] = useState<{ user_id: string; display_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (!canView || connection?.setupRequired) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    try {
      const response = await whatsappService.conversations(search, controller.signal);
      if (controller.signal.aborted) return;
      setConversations(response.conversations);
      setError("");
    } catch (caught) {
      if (!isAbort(caught) && !controller.signal.aborted) setError(whatsappError(caught));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [canView, connection?.setupRequired, search]);

  useEffect(() => {
    const debounce = window.setTimeout(() => void refresh(), 250);
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 20_000);
    return () => { window.clearTimeout(debounce); window.clearInterval(timer); abort.current?.abort(); };
  }, [refresh]);

  const onUpdated = useCallback((conversation: WhatsAppConversation) => {
    setConversations((current) => current.map((item) => item.id === conversation.id ? conversation : item));
  }, []);
  const onComposerChange = useCallback((id: string, update: (current: WhatsAppComposerState) => WhatsAppComposerState) => {
    setComposers((current) => ({ ...current, [id]: update(current[id] ?? emptyComposer) }));
  }, []);
  function onCreated(conversation: WhatsAppConversation) {
    setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
    setSelectedId(conversation.id);
    setNewConversation(false);
    if (initialPhone || customerId) router.replace("/whatsapp", { scroll: false });
    void refresh();
  }
  const canSend =
    connection?.canSend === true &&
    can("whatsapp.send");


  useEffect(() => {

    if (!canSend) {
      setWhatsappTeam([]);
      return;
    }

    let active = true;

    void whatsappService
      .assignableUsers()
      .then((users) => {

        if (!active) return;

        setWhatsappTeam(
          users.map(
            (user) => ({
              user_id:
                user.user_id,

              display_name:
                user.display_name,
            })
          )
        );

      })
      .catch(() => {

        if (active) {
          setWhatsappTeam([]);
        }

      });

    return () => {
      active = false;
    };

  }, [canSend]);


  const assigneeNames =
    new Map(
      whatsappTeam.map(
        (user) => [
          user.user_id,
          user.display_name,
        ]
      )
    );


  const nowForInbox =
    Date.now();


  const visible =
    conversations
      .filter(
        (item) => {

          if (
            filter === "all"
          ) {
            return true;
          }

          if (
            filter === "unread"
          ) {
            return (
              item.unread_count >
              0
            );
          }

          if (
            filter ===
            "follow_up"
          ) {
            return (
              item.attention_state ===
                "follow_up_due" ||
              (
                item.follow_up_at &&
                Date.parse(
                  item.follow_up_at
                ) <=
                  nowForInbox
              )
            );
          }

          if (
            filter ===
            "waiting"
          ) {
            return (
              item.attention_state ===
              "waiting_customer"
            );
          }

          return (
            item.sales_stage ===
            "won"
          );

        }
      )
      .sort(
        (
          a,
          b
        ) => {

          const aDue =
            Boolean(
              a.follow_up_at
            ) &&
            Date.parse(
              a.follow_up_at as string
            ) <=
              nowForInbox;

          const bDue =
            Boolean(
              b.follow_up_at
            ) &&
            Date.parse(
              b.follow_up_at as string
            ) <=
              nowForInbox;


          if (
            aDue !== bDue
          ) {
            return aDue
              ? -1
              : 1;
          }


          if (
            Boolean(
              a.unread_count
            ) !==
            Boolean(
              b.unread_count
            )
          ) {
            return a.unread_count
              ? -1
              : 1;
          }


          return (
            Date.parse(
              b.last_message_at ??
              b.created_at
            ) -
            Date.parse(
              a.last_message_at ??
              a.created_at
            )
          );

        }
      );

  return <DashboardLayout>
    <Navbar companyName={connection?.account?.verified_name || "JINLAB Nexus"} onLogout={async () => { await supabase.auth.signOut(); router.replace("/login"); }} />
    <main className="mx-auto max-w-[1800px] space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-sm font-medium text-primary">Customer conversations</p><h1 className="mt-1 flex items-center gap-3 text-3xl font-bold tracking-tight">WhatsApp <MessageCircle className="size-7 text-emerald-600" /></h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Your business inbox, connected to customers and quotations in Nexus.</p></div>
        {can("whatsapp.send") && <Button size="lg" onClick={() => setNewConversation(true)}><Plus /> New conversation</Button>}
      </header>
      {permissionsLoading ? <div className="rounded-2xl border bg-card p-8 text-sm text-muted-foreground" role="status">Loading your workspace permissions…</div> : permissionsError ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{permissionsError}</p> : !canView && !canManage ? <section className="rounded-2xl border bg-card p-8"><h2 className="font-semibold">WhatsApp access needed</h2><p className="mt-2 text-sm text-muted-foreground">Ask your administrator for WhatsApp inbox permission.</p></section> : <>
        <WhatsAppConnectionCard onChange={setConnection} />
        {newConversation && can("whatsapp.send") && <NewConversation key={`${customerId}:${initialPhone}`} initialPhone={initialPhone} customerId={customerId} canCreate={canSend && connection?.ready === true} onCreated={onCreated} onClose={() => setNewConversation(false)} />}
        {canView && !connection?.setupRequired && <section className="grid overflow-hidden rounded-2xl border bg-card shadow-sm lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[310px_minmax(0,1fr)]" aria-label="WhatsApp inbox">
          <aside className={`${selectedId ? "hidden lg:flex" : "flex"} min-w-0 flex-col border-r`}>
            <div className="border-b p-4">
              <div className="flex items-center justify-between"><h2 className="font-semibold">Inbox</h2><Button size="icon" variant="ghost" aria-label="Refresh conversations" disabled={loading} onClick={() => void refresh()}><RefreshCw className={loading ? "animate-spin" : ""} /></Button></div>
              <label className="relative mt-3 block"><span className="sr-only">Search conversations by name or number</span><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or number" maxLength={100} className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm" /></label>
              <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Filter conversations">{([
                ["all", "All"],
                ["unread", "Unread"],
                ["follow_up", "Follow-up"],
                ["unassigned", "Unassigned"],
                ["waiting", "Waiting"],
                ["won", "Won"],
              ] as const).map(
                ([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={
                      filter === value
                    }
                    onClick={() =>
                      selectFilter(value)
                    }
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                      filter === value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                    }`}
                  >
                    {label}
                  </button>
                )
              )}</div>
            </div>
            {error && <p role="alert" className="m-3 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
            <div className="min-h-72 max-h-[640px] flex-1 overflow-y-auto">
              {visible.length === 0 ? <div className="px-6 py-12 text-center"><MessageCircle className="mx-auto size-8 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">{loading ? "Loading conversations…" : search || filter !== "all" ? "No matching conversations" : "Your inbox starts here"}</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{search || filter !== "all" ? "Try another search or filter." : "Customer messages appear here after your business number is connected."}</p></div> : visible.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} aria-pressed={selectedId === item.id} className={`flex w-full items-start gap-3 border-b px-4 py-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-primary ${selectedId === item.id ? "bg-primary/5" : ""}`}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-semibold text-emerald-700 dark:text-emerald-400">{(item.contact_name || "+").slice(0, 2).toUpperCase()}</span>
                <span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-2"><span className="truncate text-sm font-semibold">{item.contact_name || `+${item.wa_id}`}</span><span className="shrink-0 pt-0.5 text-[10px] text-muted-foreground">{conversationTime(item.last_message_at)}</span></span><span className="mt-1 block text-xs text-muted-foreground">+{item.wa_id}</span><span className="mt-2 flex flex-wrap items-center gap-1.5">

                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-primary">
                    {
                      item.sales_stage.replace(
                        "_",
                        " "
                      )
                    }
                  </span>

                  {
                    item.assigned_to ? (
                      <span className="max-w-[120px] truncate rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {
                          assigneeNames.get(
                            item.assigned_to
                          ) ??
                          "Assigned"
                        }
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                        Unassigned
                      </span>
                    )
                  }

                  {
                    item.attention_state ===
                      "waiting_customer" && (
                      <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Waiting
                      </span>
                    )
                  }

                  {
                    item.follow_up_at && (
                      <span
                        className={
                          Date.parse(
                            item.follow_up_at
                          ) <= nowForInbox
                            ? "rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400"
                            : "rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-400"
                        }
                      >
                        {
                          Date.parse(
                            item.follow_up_at
                          ) <= nowForInbox
                            ? "Follow-up due"
                            : `Follow-up ${new Date(
                                item.follow_up_at
                              ).toLocaleDateString(
                                undefined,
                                {
                                  day: "numeric",
                                  month: "short",
                                }
                              )}`
                        }
                      </span>
                    )
                  }

                  {
                    item.unread_count >
                      0 && (
                      <span
                        className="ml-auto rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white"
                        aria-label={`${item.unread_count} unread messages`}
                      >
                        {
                          item.unread_count
                        }
                      </span>
                    )
                  }

                </span></span>
              </button>)}
            </div>
            <p className="border-t p-3 text-[11px] text-muted-foreground">Latest 100 conversations · Updates every 20 seconds</p>
          </aside>
          <div className={`${selectedId ? "block" : "hidden lg:flex"} min-w-0`}>
            {selectedId ? <WhatsAppThread key={selectedId} conversationId={selectedId} composer={composers[selectedId] ?? emptyComposer} onComposerChange={onComposerChange} ready={connection?.ready === true} canSend={canSend} canShareQuotation={can("quotation.send")} onBack={() => setSelectedId(null)} onUpdated={onUpdated} /> : <div className="flex min-h-[640px] w-full flex-col items-center justify-center p-10 text-center"><div className="flex size-20 items-center justify-center rounded-3xl bg-emerald-500/10"><MessageCircle className="size-9 text-emerald-600" /></div><h2 className="mt-6 text-xl font-semibold">A conversation with context</h2><p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">Select a chat to reply, link a customer and prepare a quotation share. Customer records stay close to the conversation.</p><p className="mt-6 rounded-full border px-4 py-2 text-xs text-muted-foreground">Official Meta connection · Free service replies only</p></div>}
          </div>
        </section>}
      </>}
    </main>
  </DashboardLayout>;
}
