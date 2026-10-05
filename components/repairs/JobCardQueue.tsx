"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type JobCardQueueRow = {
  id: string;
  job_number: string;
  status: string;
  customer_name: string;
  device_type: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  imei: string | null;
  reported_fault: string | null;
  assigned_employee: string | null;
  approved_amount: number | null;
  invoice_number: string | null;
  balance_due: number | null;
  created_at: string;
  intake_confirmed: boolean;
};

const statuses = [
  ["", "All statuses"],
  ["received", "Received"],
  ["diagnosing", "Diagnosing"],
  ["awaiting_approval", "Awaiting approval"],
  ["approved", "Approved"],
  ["in_progress", "In repair"],
  ["technical_complete", "Technical complete"],
  ["ready_for_collection", "Ready for collection"],
  ["collected", "Collected"],
  ["closed", "Closed"],
  ["cancelled", "Cancelled"],
] as const;

const statusLabel = (status: string) =>
  status.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

const money = (value: number | null) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value);


const receivedDateTime = (value: string) =>
  new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

export default function JobCardQueue({
  onOpen,
  canDelete,
}: {
  onOpen: (jobNumber: string) => void;
  canDelete: boolean;
}) {
  const [rows, setRows] = useState<JobCardQueueRow[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [view, setView] = useState<"active" | "archived" | "not_repaired">("active");
  const requestId = useRef(0);
  const [sortOrder, setSortOrder] = useState<
    "newest" | "oldest" | "workflow"
  >("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("get_service_job_queue", {
      p_search: search.trim() || null,
      p_status: view === "not_repaired" ? "not_repaired" : status || view,
      p_limit: 150,
    });

    if (currentRequest !== requestId.current) return;

    if (rpcError) {
      setRows([]);
      setError(rpcError.message);
    } else {
      setRows((data ?? []) as JobCardQueueRow[]);
    }
    setLoading(false);
  }, [search, status, view]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadQueue(), 250);
    return () => {
      window.clearTimeout(timer);
      requestId.current += 1;
    };
  }, [loadQueue]);


  const displayRows = useMemo(() => {
    if (sortOrder === "workflow") {
      return rows;
    }

    return [...rows].sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();

      return sortOrder === "oldest"
        ? aTime - bTime
        : bTime - aTime;
    });
  }, [rows, sortOrder]);

  async function deleteMistake(job: JobCardQueueRow) {
    const reason = window.prompt(
      `Why are you deleting ${job.job_number}?`,
      "Created in error"
    );

    if (!reason?.trim()) return;

    if (!window.confirm(`Permanently delete ${job.job_number}?`)) return;

    setDeletingId(job.id);
    setError("");

    const { error: deleteError } = await supabase.rpc(
      "delete_mistaken_service_job",
      {
        p_job_id: job.id,
        p_reason: reason.trim(),
      }
    );

    setDeletingId(null);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    await loadQueue();
  }

  return (
    <section className="nexus-repair-queue mb-6 rounded-2xl border bg-background shadow-sm">
      <div className="nexus-repair-queue-toolbar border-b p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Job Card views">
          {([['active', 'Active jobs'], ['not_repaired', 'Not repaired'], ['archived', 'Completed & cancelled']] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={view === value}
              onClick={() => {
                requestId.current += 1;
                setRows([]);
                setLoading(true);
                setStatus("");
                setView(value);
              }}
              disabled={view === value}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold ${view === value ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-muted"}`}
            >{label}</button>
          ))}
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-bold">Job Card Queue</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {view === "active" ? "Current repairs and devices waiting for collection." : view === "not_repaired" ? "Unsuccessful repairs and devices not repaired, including returned jobs. Open a card for the recorded reason." : "Collected, closed and cancelled jobs. Search and open any card to view its history."}
            </p>
          </div>
          <div className="nexus-repair-queue-filters grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_170px_auto]">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Job Card or customer..."
              aria-label="Search Job Cards"
              className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />

            <select
              value={status}
              aria-label="Job Card status"
              disabled={view === "not_repaired"}
              onChange={(e) => setStatus(e.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {statuses.filter(([value]) => !value || (["collected", "closed", "cancelled"].includes(value) === (view === "archived"))).map(([value, label]) => (
                <option key={value || "all"} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={sortOrder}
              onChange={(e) =>
                setSortOrder(
                  e.target.value as
                    | "newest"
                    | "oldest"
                    | "workflow"
                )
              }
              className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              aria-label="Job Card order"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="workflow">Workflow order</option>
            </select>

            <button
              type="button"
              onClick={() => void loadQueue()}
              className="h-10 rounded-md border px-4 text-sm font-semibold hover:bg-muted"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <p className="mb-3 text-sm font-semibold">
          {loading ? "Loading Job Cards..." : `${rows.length}${rows.length === 150 ? "+" : ""} Job Card${rows.length === 1 ? "" : "s"}${rows.length === 150 ? " — narrow your search to find older records" : ""}`}
        </p>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!error && !loading && rows.length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <p className="font-semibold">No matching Job Cards</p>
          </div>
        )}

        {!error && !loading && rows.length > 0 && (
          <div className="nexus-repair-queue-list space-y-3">
            {displayRows.map((job) => (
              <div
                key={job.id}
                onClick={() => onOpen(job.job_number)}
                className="nexus-repair-queue-card w-full cursor-pointer rounded-xl border p-4 text-left transition hover:border-primary/40 hover:bg-muted/50"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold text-primary">
                        {job.job_number}
                      </span>

                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
                        {statusLabel(job.status)}
                      </span>

                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          job.intake_confirmed
                            ? "bg-green-500/10 text-green-700"
                            : "bg-amber-500/10 text-amber-700"
                        }`}
                      >
                        {job.intake_confirmed
                          ? "Handover Verified"
                          : "Handover Pending"}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className="font-medium">
                        Received
                      </span>

                      <span>
                        {receivedDateTime(job.created_at)}
                      </span>
                    </div>

                    <p className="mt-2 font-semibold">
                      {job.customer_name}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[job.brand, job.model, job.device_type].filter(Boolean).join(" · ") || "Device not specified"}
                    </p>
                    {job.reported_fault && <p className="mt-2 text-sm">{job.reported_fault}</p>}
                  </div>

                  <div className="nexus-repair-queue-meta grid shrink-0 grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                    <div><p className="text-xs text-muted-foreground">Technician</p><p className="font-medium">{job.assigned_employee || "Unassigned"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Approved</p><p className="font-medium">{money(job.approved_amount)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Invoice</p><p className="font-medium">{job.invoice_number || "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Balance</p><p className="font-medium">{money(job.balance_due)}</p></div>
                  </div>
                </div>
                <div className="nexus-repair-queue-footer mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                  <span>{job.serial_number ? `Serial: ${job.serial_number}` : job.imei ? `IMEI: ${job.imei}` : "No serial/IMEI captured"}</span>
                  <div className="flex items-center gap-3">
                    {canDelete && job.status === "received" && (
                      <button
                        type="button"
                        disabled={deletingId === job.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteMistake(job);
                        }}
                        className="font-semibold text-red-600 hover:underline disabled:opacity-50"
                      >
                        {deletingId === job.id ? "Deleting..." : "Delete Mistake"}
                      </button>
                    )}
                    <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(job.job_number); }} className="font-semibold text-primary hover:underline">Open Job Card →</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
