"use client";

import { FormEvent, useCallback, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/lib/supabase";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonRecord = { [key: string]: JsonValue };

function pretty(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function getStringField(value: JsonValue, ...keys: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string") return candidate;
  }

  return "";
}

export default function PayrollCompliancePage() {
  const [taxYear, setTaxYear] = useState(new Date().getFullYear());
  const [periodType, setPeriodType] = useState("interim");

  const [gate, setGate] = useState<JsonRecord | null>(null);
  const [filing, setFiling] = useState<JsonRecord | null>(null);

  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [testFileId, setTestFileId] = useState("");
  const [acceptanceReference, setAcceptanceReference] = useState("");
  const [acceptanceChannel, setAcceptanceChannel] =
    useState("easyfile_test");
  const [testNotes, setTestNotes] = useState("");

  const [liveFileId, setLiveFileId] = useState("");
  const [submissionReference, setSubmissionReference] = useState("");
  const [submissionChannel, setSubmissionChannel] = useState("easyfile");
  const [submissionStatus, setSubmissionStatus] = useState("submitted");
  const [responseReference, setResponseReference] = useState("");
  const [submissionNotes, setSubmissionNotes] = useState("");

  const [filingId, setFilingId] = useState("");
  const [revisionReason, setRevisionReason] = useState("");
  const [changeSummary, setChangeSummary] = useState("");

  const [revisionId, setRevisionId] = useState("");
  const [revisionControl, setRevisionControl] =
    useState<JsonRecord | null>(null);

  const clearFeedback = () => {
    setError("");
    setMessage("");
  };

  const rpc = async (
    fn: string,
    args: Record<string, unknown> = {},
  ): Promise<JsonValue> => {
    clearFeedback();

    const { data, error: rpcError } = await supabase.rpc(fn, args);

    if (rpcError) {
      throw new Error(rpcError.message);
    }

    return data;
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    clearFeedback();

    try {
      const [gateResult, filingResult] = await Promise.all([
        supabase.rpc("get_payroll_sars_live_export_gate", {
          p_tax_year: taxYear,
          p_period_type: periodType,
        }),
        supabase.rpc("get_payroll_emp501_filing_control", {
          p_tax_year: taxYear,
          p_period_type: periodType,
        }),
      ]);

      if (gateResult.error) throw gateResult.error;
      if (filingResult.error) throw filingResult.error;

      setGate(gateResult.data ?? null);
      setFiling(filingResult.data ?? null);
    } catch (err: unknown) {
      const caughtMessage =
        err instanceof Error ? err.message : "Unable to load payroll compliance control.";
      setError(caughtMessage);
    } finally {
      setLoading(false);
    }
  }, [taxYear, periodType]);

  const runAction = async (
    key: string,
    action: () => Promise<JsonValue>,
    success: string,
  ) => {
    setActionLoading(key);

    try {
      const result = await action();
      setMessage(success);

      if (
        result &&
        typeof result === "object" &&
        !Array.isArray(result)
      ) {
        const resultRecord = result as JsonRecord;

        if (typeof resultRecord.live_file_id === "string") {
          setLiveFileId(resultRecord.live_file_id);
        }

        if (typeof resultRecord.filing_id === "string") {
          setFilingId(resultRecord.filing_id);
        }

        if (typeof resultRecord.revision_id === "string") {
          setRevisionId(resultRecord.revision_id);
        }
      }

      await refresh();
      return result;
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Compliance action failed.",
      );
      return null;
    } finally {
      setActionLoading("");
    }
  };

  const recordTestAcceptance = async (event: FormEvent) => {
    event.preventDefault();

    await runAction(
      "test",
      () =>
        rpc("record_payroll_sars_test_acceptance", {
          p_test_file_id: testFileId,
          p_acceptance_reference: acceptanceReference,
          p_acceptance_channel: acceptanceChannel,
          p_notes: testNotes || null,
        }),
      "External SARS TEST acceptance evidence recorded.",
    );
  };

  const generateLive = async () => {
    const result = await runAction(
      "live",
      () =>
        rpc("generate_payroll_sars_live_import_file", {
          p_tax_year: taxYear,
          p_period_type: periodType,
        }),
      "Controlled LIVE SARS import file generated.",
    );

    const id = getStringField(
      result,
      "live_file_id",
      "file_id",
      "id",
    );

    if (id) setLiveFileId(id);
  };

  const recordSubmission = async (event: FormEvent) => {
    event.preventDefault();

    await runAction(
      "submission",
      () =>
        rpc("record_payroll_sars_live_submission", {
          p_live_file_id: liveFileId,
          p_submission_reference: submissionReference,
          p_submission_channel: submissionChannel,
          p_submission_status: submissionStatus,
          p_response_reference: responseReference || null,
          p_response_at:
            responseReference && submissionStatus !== "submitted"
              ? new Date().toISOString()
              : null,
          p_notes: submissionNotes || null,
        }),
      "SARS LIVE submission evidence recorded.",
    );
  };

  const closeFiling = async () => {
    const evidenceId = window.prompt(
      "Enter the accepted SARS submission evidence ID:",
    );

    if (!evidenceId) return;

    const result = await runAction(
      "closure",
      () =>
        rpc("close_payroll_emp501_filing", {
          p_submission_evidence_id: evidenceId,
          p_notes: "Closed from Nexus Payroll Compliance workspace.",
        }),
      "EMP501 filing closed against accepted SARS evidence.",
    );

    const id = getStringField(
      result,
      "filing_id",
      "id",
    );

    if (id) setFilingId(id);
  };

  const requestRevision = async (event: FormEvent) => {
    event.preventDefault();

    const result = await runAction(
      "revision-request",
      () =>
        rpc("request_payroll_emp501_revision", {
          p_filing_id: filingId,
          p_revision_reason: revisionReason,
          p_change_summary: changeSummary || null,
        }),
      "EMP501 revision submitted for controlled approval.",
    );

    const id = getStringField(
      result,
      "revision_id",
      "id",
    );

    if (id) {
      setRevisionId(id);
      await loadRevision(id);
    }
  };

  const loadRevision = async (id = revisionId) => {
    if (!id) return;

    setActionLoading("revision-load");

    try {
      const data = await rpc("get_payroll_emp501_revision_control", {
        p_filing_id: filingId || id,
      });

      if (
        data &&
        typeof data === "object" &&
        !Array.isArray(data)
      ) {
        setRevisionControl(data as JsonRecord);
      } else {
        setRevisionControl(null);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load EMP501 revision control.",
      );
    } finally {
      setActionLoading("");
    }
  };

  const decideRevision = async (approve: boolean) => {
    if (!revisionId) return;

    await runAction(
      approve ? "revision-approve" : "revision-reject",
      () =>
        rpc("decide_payroll_emp501_revision", {
          p_revision_id: revisionId,
          p_approve: approve,
          p_notes: approve
            ? "Approved from Nexus Payroll Compliance workspace."
            : "Rejected from Nexus Payroll Compliance workspace.",
        }),
      approve
        ? "EMP501 revision approved."
        : "EMP501 revision rejected.",
    );

    if (filingId) await loadRevision();
  };

  const attachRevisionLiveFile = async () => {
    if (!revisionId || !liveFileId) return;

    await runAction(
      "revision-attach",
      () =>
        rpc("attach_payroll_emp501_revision_live_file", {
          p_revision_id: revisionId,
          p_live_file_id: liveFileId,
        }),
      "Replacement LIVE file attached to the EMP501 revision.",
    );

    if (filingId) await loadRevision();
  };

  const cancelRevision = async () => {
    if (!revisionId) return;

    const reason = window.prompt(
      "Reason for cancelling this EMP501 revision:",
    );

    if (!reason) return;

    await runAction(
      "revision-cancel",
      () =>
        rpc("cancel_payroll_emp501_revision", {
          p_revision_id: revisionId,
          p_reason: reason,
        }),
      "EMP501 revision cancelled.",
    );

    if (filingId) await loadRevision();
  };

  const closeRevision = async () => {
    if (!revisionId) return;

    await runAction(
      "revision-close",
      () =>
        rpc("close_payroll_emp501_revision", {
          p_revision_id: revisionId,
          p_notes: "Revision closed from Nexus Payroll Compliance workspace.",
        }),
      "EMP501 revision closed.",
    );

    if (filingId) await loadRevision();
  };

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500";

  const cardClass =
    "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";

  const buttonClass =
    "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
            Payroll
          </p>
          <h1 className="text-3xl font-bold text-slate-950">
            SARS & EMP501 Compliance
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Controlled employer reconciliation workflow from TEST validation
            through LIVE submission, filing closure and auditable revision.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        {message && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {message}
          </div>
        )}

        <section className={cardClass}>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-1 text-sm font-medium">
              Tax year
              <input
                className={inputClass}
                type="number"
                value={taxYear}
                onChange={(e) => setTaxYear(Number(e.target.value))}
              />
            </label>

            <label className="space-y-1 text-sm font-medium">
              Reconciliation period
              <select
                className={inputClass}
                value={periodType}
                onChange={(e) => setPeriodType(e.target.value)}
              >
                <option value="interim">Interim</option>
                <option value="annual">Annual</option>
              </select>
            </label>

            <div className="flex items-end">
              <button
                className={buttonClass}
                onClick={() => void refresh()}
                disabled={loading}
              >
                {loading ? "Refreshing..." : "Refresh Control"}
              </button>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className={cardClass}>
            <h2 className="text-lg font-bold text-slate-950">
              1. TEST Acceptance
            </h2>

            <form
              onSubmit={recordTestAcceptance}
              className="mt-4 space-y-3"
            >
              <input
                className={inputClass}
                placeholder="TEST file UUID"
                value={testFileId}
                onChange={(e) => setTestFileId(e.target.value)}
                required
              />

              <input
                className={inputClass}
                placeholder="External acceptance reference"
                value={acceptanceReference}
                onChange={(e) =>
                  setAcceptanceReference(e.target.value)
                }
                required
              />

              <select
                className={inputClass}
                value={acceptanceChannel}
                onChange={(e) =>
                  setAcceptanceChannel(e.target.value)
                }
              >
                <option value="easyfile_test">e@syFile TEST</option>
                <option value="sars_trade_test">SARS Trade TEST</option>
              </select>

              <textarea
                className={inputClass}
                placeholder="Notes"
                value={testNotes}
                onChange={(e) => setTestNotes(e.target.value)}
              />

              <button
                className={buttonClass}
                disabled={actionLoading === "test"}
              >
                Record TEST Acceptance
              </button>
            </form>
          </section>

          <section className={cardClass}>
            <h2 className="text-lg font-bold text-slate-950">
              2. LIVE Export Gate
            </h2>

            <p className="mt-2 text-sm text-slate-600">
              Nexus will only generate LIVE data when the backend
              compliance gate authorises it.
            </p>

            <button
              className={`${buttonClass} mt-4`}
              onClick={generateLive}
              disabled={actionLoading === "live"}
            >
              Generate Controlled LIVE File
            </button>

            <input
              className={`${inputClass} mt-4`}
              placeholder="LIVE file UUID"
              value={liveFileId}
              onChange={(e) => setLiveFileId(e.target.value)}
            />

            <pre className="mt-4 max-h-80 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
              {pretty(gate)}
            </pre>
          </section>

          <section className={cardClass}>
            <h2 className="text-lg font-bold text-slate-950">
              3. SARS Submission Evidence
            </h2>

            <form
              onSubmit={recordSubmission}
              className="mt-4 space-y-3"
            >
              <input
                className={inputClass}
                placeholder="LIVE file UUID"
                value={liveFileId}
                onChange={(e) => setLiveFileId(e.target.value)}
                required
              />

              <input
                className={inputClass}
                placeholder="SARS submission reference"
                value={submissionReference}
                onChange={(e) =>
                  setSubmissionReference(e.target.value)
                }
                required
              />

              <select
                className={inputClass}
                value={submissionChannel}
                onChange={(e) =>
                  setSubmissionChannel(e.target.value)
                }
              >
                <option value="easyfile">e@syFile</option>
                <option value="efiling">eFiling</option>
              </select>

              <select
                className={inputClass}
                value={submissionStatus}
                onChange={(e) =>
                  setSubmissionStatus(e.target.value)
                }
              >
                <option value="submitted">Submitted</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
              </select>

              <input
                className={inputClass}
                placeholder="SARS response reference (accepted/rejected)"
                value={responseReference}
                onChange={(e) =>
                  setResponseReference(e.target.value)
                }
              />

              <textarea
                className={inputClass}
                placeholder="Submission notes"
                value={submissionNotes}
                onChange={(e) =>
                  setSubmissionNotes(e.target.value)
                }
              />

              <button
                className={buttonClass}
                disabled={actionLoading === "submission"}
              >
                Record SARS Evidence
              </button>
            </form>
          </section>

          <section className={cardClass}>
            <h2 className="text-lg font-bold text-slate-950">
              4. EMP501 Filing Closure
            </h2>

            <p className="mt-2 text-sm text-slate-600">
              Filing closure remains backend-controlled and requires
              accepted SARS submission evidence.
            </p>

            <button
              className={`${buttonClass} mt-4`}
              onClick={closeFiling}
              disabled={actionLoading === "closure"}
            >
              Close EMP501 Filing
            </button>

            <input
              className={`${inputClass} mt-4`}
              placeholder="Closed filing UUID"
              value={filingId}
              onChange={(e) => setFilingId(e.target.value)}
            />

            <pre className="mt-4 max-h-80 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
              {pretty(filing)}
            </pre>
          </section>
        </div>

        <section className={cardClass}>
          <h2 className="text-lg font-bold text-slate-950">
            5. EMP501 Revision & Controlled Resubmission
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            Original filed records remain preserved. Corrections are
            handled through an auditable revision chain.
          </p>

          <form
            onSubmit={requestRevision}
            className="mt-4 grid gap-3 lg:grid-cols-3"
          >
            <input
              className={inputClass}
              placeholder="Original filing UUID"
              value={filingId}
              onChange={(e) => setFilingId(e.target.value)}
              required
            />

            <input
              className={inputClass}
              placeholder="Revision reason (minimum 10 characters)"
              value={revisionReason}
              onChange={(e) => setRevisionReason(e.target.value)}
              required
            />

            <input
              className={inputClass}
              placeholder="Change summary"
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
            />

            <button
              className={buttonClass}
              disabled={actionLoading === "revision-request"}
            >
              Request Revision
            </button>
          </form>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input
              className={inputClass}
              placeholder="Revision UUID"
              value={revisionId}
              onChange={(e) => setRevisionId(e.target.value)}
            />

            <button
              className={buttonClass}
              onClick={() => void decideRevision(true)}
              disabled={!revisionId}
            >
              Approve Revision
            </button>

            <button
              className={buttonClass}
              onClick={() => void decideRevision(false)}
              disabled={!revisionId}
            >
              Reject Revision
            </button>

            <button
              className={buttonClass}
              onClick={attachRevisionLiveFile}
              disabled={!revisionId || !liveFileId}
            >
              Attach Replacement LIVE
            </button>

            <button
              className={buttonClass}
              onClick={cancelRevision}
              disabled={!revisionId}
            >
              Cancel Revision
            </button>

            <button
              className={buttonClass}
              onClick={closeRevision}
              disabled={!revisionId}
            >
              Close Revision
            </button>

            <button
              className={buttonClass}
              onClick={() => void loadRevision()}
              disabled={!filingId}
            >
              Load Revision History
            </button>
          </div>

          <pre className="mt-5 max-h-96 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
            {pretty(revisionControl)}
          </pre>
        </section>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Nexus does not claim to submit directly to SARS. This workspace
          controls preparation, evidence, reconciliation state and audit
          history around externally completed SARS/e@syFile/eFiling actions.
        </div>
      </div>
    </DashboardLayout>
  );
}
