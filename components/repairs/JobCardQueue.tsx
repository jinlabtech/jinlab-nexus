"use client";

import { useCallback, useEffect, useState } from "react";
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
};

const statuses = [
  ["", "All jobs"],
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("get_service_job_queue", {
      p_search: search.trim() || null,
      p_status: status || null,
      p_limit: 150,
    });

    if (rpcError) {
      setRows([]);
      setError(rpcError.message);
    } else {
      setRows((data ?? []) as JobCardQueueRow[]);
    }
    setLoading(false);
  }, [search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadQueue(), 250);
    return () => window.clearTimeout(timer);
  }, [loadQueue]);

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
    <section className="mb-6 rounded-2xl border bg-background shadow-sm">
      <div className="border-b p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-bold">Job Card Queue</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Search by Job Card, customer, device, serial number, IMEI or fault.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(240px,1fr)_190px_auto]">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Job Card or customer..."
              className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            >
              {statuses.map(([value, label]) => (
                <option key={value || "all"} value={value}>{label}</option>
              ))}
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
          {loading ? "Loading Job Cards..." : `${rows.length} Job Card${rows.length === 1 ? "" : "s"}`}
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

        {!error && rows.length > 0 && (
          <div className="space-y-3">
            {rows.map((job) => (
              <div
                key={job.id}
                onClick={() => onOpen(job.job_number)}
                className="w-full cursor-pointer rounded-xl border p-4 text-left transition hover:border-blue-300 hover:bg-blue-50/40"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-blue-700">{job.job_number}</span>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
                        {statusLabel(job.status)}
                      </span>
                    </div>
                    <p className="mt-2 font-semibold">{job.customer_name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[job.brand, job.model, job.device_type].filter(Boolean).join(" · ") || "Device not specified"}
                    </p>
                    {job.reported_fault && <p className="mt-2 text-sm">{job.reported_fault}</p>}
                  </div>

                  <div className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                    <div><p className="text-xs text-muted-foreground">Technician</p><p className="font-medium">{job.assigned_employee || "Unassigned"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Approved</p><p className="font-medium">{money(job.approved_amount)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Invoice</p><p className="font-medium">{job.invoice_number || "—"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Balance</p><p className="font-medium">{money(job.balance_due)}</p></div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
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
                    <span className="font-semibold text-blue-700">Open Job Card →</span>
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
