"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeftRight, ClipboardCheck, Link2, Plus, RefreshCw, ShieldCheck, Users, Wrench } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ActionModal from "@/components/ui/ActionModal";
import TradingWorkspace from "@/components/second-hand/TradingWorkspace";
import { Button } from "@/components/ui/button";
import { exportSecondHandRegister, getSecondHandIntegrationChoices, getSecondHandWorkspace, secondHandAction } from "@/lib/services/secondHandService";
import { isSecondHandHoldComplete, secondHandCsv, type SecondHandAction, type SecondHandIntegrationChoices, type SecondHandItem, type SecondHandWorkspace } from "@/types/secondHand";

type Dialog = SecondHandAction | "export" | null;
const inputClass = "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const money = (value: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value || 0);
const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(value)) : "—";
const label = (value: string) => value.replaceAll("_", " ");
const titles: Record<Exclude<Dialog, null>, string> = {
  party_create: "Verify a seller or buyer", acquire: "Record device acquisition", approve: "Owner approval", release: "Release from holding", flag: "Flag suspect goods", report_saps: "Record SAPS report", add_cost: "Record refurbishment cost", link_repair: "Link Nexus repair job", link_inventory: "Link inventory record", dispose: "Record verified sale", policy_update: "Branch trading setup", grant_access: "Grant branch access", revoke_access: "Revoke branch access", export: "Export the register",
};
function Field({ title, name, type = "text", required = true, value, onChange, hint, min, max, step, pattern, minLength, maxLength = 500 }: { title: string; name: string; type?: string; required?: boolean; value?: string | number; onChange?: (value: string) => void; hint?: string; min?: string | number; max?: string | number; step?: string; pattern?: string; minLength?: number; maxLength?: number }) {
  return <label className="block text-sm font-medium">{title}{!required && <span className="font-normal text-muted-foreground"> (optional)</span>}<input name={name} type={type} required={required} defaultValue={onChange ? undefined : value} value={onChange ? value : undefined} onChange={onChange ? event => onChange(event.target.value) : undefined} min={min} max={max} step={step} pattern={pattern} minLength={minLength} maxLength={maxLength} autoComplete="off" className={inputClass} />{hint && <span className="mt-1 block text-xs font-normal text-muted-foreground">{hint}</span>}</label>;
}
function SelectField({ title, name, children, value, required = true }: { title: string; name: string; children: ReactNode; value?: string; required?: boolean }) {
  return <label className="block text-sm font-medium">{title}<select name={name} required={required} defaultValue={value} className={inputClass}>{children}</select></label>;
}
function Check({ name, children, checked = false }: { name: string; children: ReactNode; checked?: boolean }) {
  return <label className="flex items-start gap-2 text-sm"><input type="checkbox" name={name} required defaultChecked={checked} className="mt-1 size-4 shrink-0 accent-primary" /><span>{children}</span></label>;
}
function Note({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">{children}</div>;
}
function Status({ status }: { status: string }) {
  const colour = status === "quarantined" ? "border-destructive/30 bg-destructive/10 text-destructive" : status === "released" || status === "sold" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${colour}`}>{label(status)}</span>;
}
function downloadFile(value: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function acquisitionLocalTime() {
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  return parts.replace(" ", "T");
}

function IntegrationSearch({ query, onQuery, loading, error, onSearch, placeholder }: { query: string; onQuery: (value: string) => void; loading: boolean; error: string; onSearch: () => void; placeholder: string }) {
  return <div><div className="flex flex-wrap gap-2"><input aria-label={placeholder} placeholder={placeholder} value={query} onChange={event => onQuery(event.target.value)} maxLength={100} className="min-w-48 flex-1 rounded-lg border bg-background px-3 py-2 text-sm" /><Button type="button" variant="outline" disabled={loading} onClick={onSearch}><RefreshCw className={loading ? "animate-spin" : ""} />{loading ? "Loading…" : "Search records"}</Button></div>{loading && <p role="status" className="mt-2 text-xs text-muted-foreground">Loading records permitted for this workflow…</p>}{error && <p role="alert" className="mt-2 text-xs text-destructive">{error} Search again to retry.</p>}</div>;
}

function RepairJobPicker({ choices, loading, error, currentId, onRefresh, required = true }: { choices: SecondHandIntegrationChoices | null; loading: boolean; error: string; currentId?: string; onRefresh: () => void; required?: boolean }) {
  return <div className="space-y-3 rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><Wrench className="size-4 text-primary" />Matching Nexus repair jobs</h3><Button type="button" variant="outline" disabled={loading} onClick={onRefresh}><RefreshCw className={loading ? "animate-spin" : ""} />Refresh</Button></div><SelectField title="Existing repair job" name="service_job_id" required={required} value={currentId}><option value="">{loading ? "Loading matching jobs…" : required ? "Select a matching job" : "No repair link for this cost"}</option>{choices?.repair_jobs.map(job => <option key={job.id} value={job.id}>{job.job_number} · {label(job.status)}</option>)}</SelectField>{loading && <p role="status" className="text-xs text-muted-foreground">Checking branch and device identifier…</p>}{error && <p role="alert" className="text-xs text-destructive">{error}</p>}{!loading && !error && !choices?.repair_jobs.length && <p className="text-xs text-muted-foreground">No matching repair jobs found. Create or locate the real device job in Nexus Repairs with the same serial / IMEI and branch, then refresh.</p>}<Link href="/repairs/scanner" target="_blank" className="inline-block text-xs text-primary underline">Open Nexus Repairs in another tab</Link><p className="text-xs text-muted-foreground">Only jobs matching this branch, company and device are offered. The server rechecks the match when saving.</p></div>;
}

export default function SecondHandPage() {
  const [workspace, setWorkspace] = useState<SecondHandWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [acquisitionPreset, setAcquisitionPreset] = useState<"purchase" | "trade_in">("purchase");
  const [acquisitionType, setAcquisitionType] = useState<"purchase" | "trade_in">("purchase");
  const [integrationChoices, setIntegrationChoices] = useState<SecondHandIntegrationChoices | null>(null);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [integrationError, setIntegrationError] = useState("");
  const [integrationQuery, setIntegrationQuery] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [replacementId, setReplacementId] = useState("");
  const [allowance, setAllowance] = useState("");
  const [partyPreset, setPartyPreset] = useState<"seller" | "buyer">("seller");
  const [clock, setClock] = useState(() => Date.now());
  const requestId = useRef(0);
  const integrationRequest = useRef(0);
  const cancelPendingRequests = useCallback(() => { ++requestId.current; ++integrationRequest.current; }, []);
  const load = useCallback(async (branchId?: string) => {
    const request = ++requestId.current;
    setLoading(true); setError("");
    try { const next = await getSecondHandWorkspace(branchId); if (request === requestId.current) setWorkspace(next); }
    catch (cause) { if (request === requestId.current) { setWorkspace(null); setError(cause instanceof Error ? cause.message : "Could not load the register."); } }
    finally { if (request === requestId.current) setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    getSecondHandWorkspace().then(next => { if (active) setWorkspace(next); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not load the register."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; cancelPendingRequests(); };
  }, [cancelPendingRequests]);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 30000); return () => clearInterval(timer); }, []);

  const owner = workspace?.role === "owner";
  const writer = owner || workspace?.role === "clerk";
  const items = workspace?.items ?? [];
  const parties = workspace?.parties ?? [];
  const selected = items.find(item => item.id === selectedId);
  const branchId = workspace?.branch_id || "";
  const setupReady = !!(workspace?.policy?.legal_review_reference && workspace.policy.registration_reference && workspace.policy.premises_confirmed && workspace.policy.goods_scope_confirmed);

  const selectedReplacement = integrationChoices?.replacement_items.find(item => item.id === replacementId);
  const allowanceValue = Math.max(0, Number(allowance) || 0);
  async function loadIntegrationChoices(action: Exclude<Dialog, null>, query = "", preserveSelection = true) {
    const request = ++integrationRequest.current;
    const chosenCustomer = preserveSelection ? integrationChoices?.customers.find(customer => customer.id === customerId) : undefined;
    const chosenReplacement = preserveSelection ? integrationChoices?.replacement_items.find(item => item.id === replacementId) : undefined;
    setIntegrationLoading(true); setIntegrationError("");
    try {
      const choices = await getSecondHandIntegrationChoices(branchId, query, action === "add_cost" || action === "link_repair" ? selected?.id : undefined);
      if (request === integrationRequest.current) setIntegrationChoices({
        ...choices,
        customers: chosenCustomer && !choices.customers.some(customer => customer.id === chosenCustomer.id) ? [...choices.customers, chosenCustomer] : choices.customers,
        replacement_items: chosenReplacement && !choices.replacement_items.some(item => item.id === chosenReplacement.id) ? [...choices.replacement_items, chosenReplacement] : choices.replacement_items,
      });
    } catch (cause) {
      if (request === integrationRequest.current) { setIntegrationError(cause instanceof Error ? cause.message : "Could not load linked Nexus records."); }
    } finally { if (request === integrationRequest.current) setIntegrationLoading(false); }
  }
  function open(action: Exclude<Dialog, null>) {
    if (busy) return;
    setError(""); setNotice(""); setIntegrationQuery(""); setIntegrationChoices(null); setIntegrationError("");
    setCustomerId(""); setReplacementId(""); setAllowance(""); setDialog(action);
    ++integrationRequest.current;
    if (["acquire", "add_cost", "link_repair", "grant_access"].includes(action)) void loadIntegrationChoices(action, "", false);
    else setIntegrationLoading(false);
  }
  function openAcquire(type: "purchase" | "trade_in") { if (busy) return; setAcquisitionPreset(type); setAcquisitionType(type); open("acquire"); }
  function openParty(kind: "seller" | "buyer") { if (busy) return; setPartyPreset(kind); open("party_create"); }
  function close() { if (!busy) { ++integrationRequest.current; setDialog(null); setError(""); } }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || !branchId || busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const action = dialog;
    const payload: Record<string, unknown> = { branch_id: branchId };
    for (const [key, value] of data.entries()) if (typeof value === "string" && value.trim() !== "") payload[key] = value.trim();
    for (const key of ["purchase_amount", "valuation_amount", "selling_price", "sale_amount", "amount", "hold_days"]) if (payload[key] != null) payload[key] = Number(payload[key]);
    for (const key of ["original_id_sighted", "ownership_declared", "communications_device", "premises_confirmed", "goods_scope_confirmed"]) if (data.has(key)) payload[key] = true;

    if (selected && !["party_create", "acquire", "policy_update", "grant_access", "revoke_access", "export"].includes(action)) payload.item_id = selected.id;
    setBusy(true); setError("");
    try {
      if (action === "acquire") {
        const acquired = new Date(`${String(payload.acquired_at)}:00+02:00`);
        if (!Number.isFinite(acquired.getTime()) || acquired.getTime() > Date.now()) throw new Error("Enter a valid actual acquisition time that is not in the future.");
        payload.communications_device = data.get("communications_device") === "true";
        payload.acquired_at = acquired.toISOString();
        if (acquisitionType === "trade_in" && (customerId || replacementId)) {
          if (!customerId || !replacementId) throw new Error("Choose both an existing customer and a replacement product for the linked exchange.");
          if (integrationLoading || integrationError || !integrationChoices?.customers.some(customer => customer.id === customerId) || !selectedReplacement) throw new Error("Reload the linked exchange records before saving. Your customer and replacement selections must both be available.");
          payload.customer_id = customerId;
          payload.replacement_inventory_item_id = replacementId;
        }
        if (payload.acquisition_type === "trade_in" && !payload.trade_in_reference) throw new Error("Enter the agreed trade-in credit or transaction reference.");
        if (!payload.imei && !payload.serial_number) throw new Error("Enter a serial number or IMEI.");
        if (payload.communications_device && !payload.imei) throw new Error("Communication equipment requires its applicable IMEI.");
      }
      if (action === "export") {
        const register = await exportSecondHandRegister(branchId);
        const today = new Date().toISOString().slice(0, 10);
        downloadFile(JSON.stringify(register, null, 2), `second-hand-register-${today}.json`, "application/json");
        setNotice("Register downloaded. It contains sensitive identity information; store and share it securely.");
      } else {
        const result = await secondHandAction(action, payload);
        if (action === "acquire") setSelectedId(result.id);
        setNotice(`${titles[action]} saved. The register and audit trail have been updated.`);
      }
      form.reset(); setDialog(null);
      await load(branchId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The action could not be completed."); }
    finally {
      const identity = form.elements.namedItem("id_number");
      if (identity instanceof HTMLInputElement) identity.value = "";
      delete payload.id_number;
      setBusy(false);
    }
  }
  function exportSummary(items: SecondHandItem[]) {
    const rows = items.map(item => ({ register_number: item.register_number, description: item.description, status: item.status, serial_number: item.serial_number, imei: item.imei, acquired_at: item.acquired_at, hold_until: item.hold_until, purchase_amount: item.purchase_amount, refurbishment_cost: item.refurbishment_cost, sale_amount: item.sale_amount, disposed_at: item.disposed_at }));
    downloadFile("\uFEFF" + secondHandCsv(rows), `second-hand-stock-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
    setNotice("Stock summary downloaded without seller or buyer identity details. This is not the full statutory register.");
  }

  return <DashboardLayout><main className="p-4 sm:p-6 lg:p-8">
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm font-medium text-primary">Trading & inventory</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Second-Hand Goods</h1><p className="mt-2 text-sm text-muted-foreground">Verified intake, controlled holding and a traceable device register.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={loading || busy} onClick={() => void load(branchId)}><RefreshCw className={loading ? "animate-spin" : ""} />Refresh</Button>{owner && <Button variant="outline" disabled={loading || busy} onClick={() => open("policy_update")}><ShieldCheck />Branch setup</Button>}</div>
    </header>
    {notice && <p role="status" className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">{notice}</p>}
    {error && !dialog && <p role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">{error}</p>}
    {loading ? <div role="status" className="rounded-xl border p-8 text-muted-foreground">Loading the secure trading workspace…</div> : !workspace?.role || workspace.access_required || !branchId ? <section className="rounded-xl border p-6"><ShieldCheck className="mb-3 size-7 text-muted-foreground" /><h2 className="text-lg font-semibold">Second-hand trading access required</h2><p className="mt-2 max-w-xl text-sm text-muted-foreground">Your account needs a dedicated second-hand trading role for a branch. Ask the company owner to grant access. If the owner also cannot enter, the protected owner setup must be completed by the deployment administrator.</p><Link href="/dashboard" className="mt-4 inline-block text-sm text-primary underline">Return to dashboard</Link></section> : <>
      <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <label className="flex flex-wrap items-center gap-3 text-sm font-medium">Branch<select aria-label="Trading branch" value={branchId} disabled={busy} onChange={event => { ++integrationRequest.current; setSelectedId(""); setDialog(null); setNotice(""); void load(event.target.value); }} className="max-w-full rounded-lg border bg-background px-3 py-2">{workspace.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs capitalize text-primary">{workspace.role}</span></label>
        <div className="flex flex-wrap gap-2">{writer && <><Button variant="outline" disabled={busy} onClick={() => openParty("seller")}><Users />Verify seller</Button><Button disabled={busy || !setupReady || !parties.some(party => party.kind === "seller")} onClick={() => openAcquire("purchase")}><Plus />Acquire device</Button><Button variant="outline" disabled={busy || !setupReady || !parties.some(party => party.kind === "seller")} onClick={() => openAcquire("trade_in")}><ArrowLeftRight />Trade-in</Button></>}</div>
      </section>
      <TradingWorkspace key={branchId} workspace={workspace} setupReady={setupReady} busy={busy} now={clock} selectedId={selectedId} onSelect={setSelectedId} onOpen={open} onAcquire={openAcquire} onVerify={openParty} onExportSummary={exportSummary} detail={selected ? <ItemDetail item={selected} workspace={workspace} owner={owner} writer={!!writer} now={clock} open={open} onVerifyBuyer={() => openParty("buyer")} onClose={() => setSelectedId("")} /> : null} />
      <p className="mt-6 max-w-4xl text-xs leading-relaxed text-muted-foreground">Supports second-hand goods recordkeeping. This software does not certify SAPS compliance. Keep held goods physically separate on registered premises. Review your certificate conditions, inspection arrangements and signature procedures with your legal adviser or designated SAPS officer. <a href="https://www.gov.za/sites/default/files/gcis_document/201409/32087392.pdf" target="_blank" rel="noreferrer" className="underline">Act 6 of 2009</a> · <a href="https://www.gov.za/sites/default/files/gcis_document/201409/35220gon285.pdf" target="_blank" rel="noreferrer" className="underline">Dealer regulations</a></p>
    </>}
    <ActionModal open={!!dialog} title={dialog === "acquire" && acquisitionType === "trade_in" ? "Record customer trade-in" : dialog ? titles[dialog] : "Trading action"} onClose={close} maxWidth="max-w-2xl" dismissOnBackdrop={!busy}>
      {dialog && <form key={`${dialog}-${acquisitionPreset}-${partyPreset}`} onSubmit={submit} autoComplete="off"><fieldset disabled={busy} className="space-y-4">
        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">{error}</p>}
        {dialog === "party_create" && <><Note>Inspect the original identity document and retain a copy securely. Enter its locked physical-file locator here. Full identity numbers are never shown in the working list and are cleared after submission.</Note><div className="grid gap-4 sm:grid-cols-2"><SelectField title="Person is a" name="kind" value={partyPreset}><option value="seller">Seller</option><option value="buyer">Buyer</option></SelectField><Field title="Full legal name" name="full_name" minLength={2} maxLength={200} /><SelectField title="Identity document" name="id_type"><option value="sa_id">South African ID</option><option value="passport">Passport</option></SelectField><Field title="Full identity / passport number" name="id_number" minLength={4} maxLength={40} /><Field title="Date of birth" name="date_of_birth" type="date" min="1900-01-01" max={new Date(Date.UTC(new Date().getUTCFullYear() - 18, new Date().getUTCMonth(), new Date().getUTCDate())).toISOString().slice(0, 10)} /><Field title="Contact telephone" name="phone" type="tel" minLength={5} maxLength={40} /></div><Field title="Physical address" name="address" minLength={5} maxLength={1000} /><Field title="Secure identity-copy file reference" name="id_copy_reference" minLength={3} maxLength={300} hint="A real locked physical record locator; do not paste a public link." /><Field title="Verification evidence / staff reference" name="verification_reference" minLength={3} /><Check name="original_id_sighted">I inspected the original document and retained a legible copy in the secure file referenced above.</Check></>}
        {dialog === "acquire" && <><Note>Record the actual acquisition event. The statutory hold does not start at onboarding or later approval. Do not purchase or accept suspect goods. Unknown or flagged screening is recorded in quarantine for incident handling and cannot be cleared by ordinary owner approval. Report suspicion to SAPS immediately.</Note><SelectField title="Verified seller" name="seller_id"><option value="">Select seller</option>{parties.filter(party => party.kind === "seller").map(party => <option key={party.id} value={party.id}>{party.full_name} · ID ending {party.id_last4}</option>)}</SelectField><Field title="Device description" name="description" /><div className="grid gap-4 sm:grid-cols-2"><Field title="Brand" name="brand" maxLength={100} /><Field title="Model" name="model" maxLength={150} /><Field title="Serial number" name="serial_number" required={false} minLength={2} maxLength={100} hint="Copy the physical device identifier exactly; check against its system settings." /><Field title="IMEI (15 digits)" name="imei" required={false} pattern="[0-9]{15}" maxLength={15} hint="Digits only. Compare the device, settings and supporting ownership evidence." /><SelectField title="Communication equipment with IMEI" name="communications_device" value="true"><option value="true">Yes — IMEI required</option><option value="false">No — serial number required</option></SelectField><SelectField title="Condition" name="condition"><option value="good">Good</option><option value="excellent">Excellent</option><option value="fair">Fair</option><option value="poor">Poor</option><option value="for_parts">For parts / repair</option></SelectField><Field title={acquisitionType === "trade_in" ? "Agreed device allowance (ZAR)" : "Purchase amount (ZAR)"} name="purchase_amount" type="number" min={0} max={9999999999} step="0.01" value={allowance} onChange={setAllowance} /><Field title="Valuation (ZAR)" name="valuation_amount" type="number" min={0} max={9999999999} step="0.01" /><Field title="Acquired at (South Africa time)" name="acquired_at" type="datetime-local" value={acquisitionLocalTime()} max={acquisitionLocalTime()} /><label className="block text-sm font-medium">Acquisition type<select name="acquisition_type" value={acquisitionType} onChange={event => { setAcquisitionType(event.target.value as "purchase" | "trade_in"); setCustomerId(""); setReplacementId(""); }} className={inputClass}><option value="purchase">Purchase</option><option value="trade_in">Trade-in</option></select></label></div>{acquisitionType === "trade_in" && <section className="space-y-4 rounded-xl border bg-muted/20 p-4"><div><h3 className="flex items-center gap-2 text-sm font-semibold"><ArrowLeftRight className="size-4 text-primary" />Link the customer exchange <span className="font-normal text-muted-foreground">(optional)</span></h3><p className="mt-1 text-xs text-muted-foreground">Choose an existing company customer and replacement product to record an exchange estimate. Seller identity verification above is still required.</p></div><IntegrationSearch query={integrationQuery} onQuery={setIntegrationQuery} loading={integrationLoading} error={integrationError} onSearch={() => void loadIntegrationChoices("acquire", integrationQuery)} placeholder="Search customer name, number or replacement product…" /><label className="block text-sm font-medium">Existing Nexus customer<select name="customer_id" value={customerId} disabled={integrationLoading || !!integrationError} onChange={event => { setCustomerId(event.target.value); setReplacementId(""); }} className={inputClass}><option value="">No linked exchange</option>{integrationChoices?.customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}{customer.number ? ` · ${customer.number}` : ""}</option>)}</select></label><label className="block text-sm font-medium">Replacement stock item<select name="replacement_inventory_item_id" required={!!customerId} value={replacementId} disabled={!customerId || integrationLoading || !!integrationError} onChange={event => setReplacementId(event.target.value)} className={inputClass}><option value="">{customerId ? "Select replacement product" : "Choose a customer first"}</option>{integrationChoices?.replacement_items.map(item => <option key={item.id} value={item.id}>{item.name}{item.sku ? ` · ${item.sku}` : ""} · {money(item.selling_price)} · {item.quantity} available</option>)}</select>{customerId && !replacementId && <span className="mt-1 block text-xs font-normal text-muted-foreground">Select a replacement product to finish the linked exchange, or clear the customer to record intake without an exchange estimate.</span>}</label>{selectedReplacement && <div className="rounded-lg border bg-background p-3"><dl className="space-y-2 text-sm"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Current replacement price</dt><dd className="font-medium">{money(selectedReplacement.selling_price)}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Agreed device allowance</dt><dd className="font-medium">{money(allowanceValue)}</dd></div><div className="flex justify-between gap-3 border-t pt-2"><dt>{allowanceValue > selectedReplacement.selling_price ? "Excess allowance estimate" : "Balance due estimate"}</dt><dd className="font-semibold text-primary">{money(Math.abs(selectedReplacement.selling_price - allowanceValue))}</dd></div></dl><p className="mt-3 text-xs leading-relaxed text-muted-foreground">The server rechecks branch, stock eligibility and price when saving. This records an estimate only; it does not reserve stock, issue credit, collect payment or post a POS sale.</p></div>}{!integrationLoading && !integrationError && integrationChoices && <p className="text-xs text-muted-foreground">Up to 20 matching customers and eligible products are shown, plus your retained selections. Search for a customer first, select them, then search for the replacement product.</p>}</section>}<Field title="Trade-in credit / transaction reference" name="trade_in_reference" required={acquisitionType === "trade_in"} hint="Required for trade-ins. Record the agreed credit separately in your accounting workflow." /><Field title="Acquisition event / payment reference" name="acquisition_reference" minLength={3} /><Field title="Ownership or authority evidence reference" name="ownership_reference" minLength={3} /><Check name="ownership_declared">I have reasonable evidence that the seller owns this item or is authorised to dispose of it.</Check><div className="grid gap-4 sm:grid-cols-2"><SelectField title="Stolen / blacklist screening result" name="screening_result" value="unknown"><option value="unknown">Unknown — quarantine</option><option value="clear">Checked — no issue found</option><option value="flagged">Flagged — quarantine</option></SelectField><Field title="Screening source" name="screening_source" minLength={3} maxLength={300} /></div><Field title="Screening evidence reference" name="screening_reference" minLength={3} /><Field title="Concern / flag reason" name="flag_reason" required={false} /><Field title="Staff name and transaction attestation" name="staff_attestation" minLength={3} maxLength={300} hint="Enter your full name and confirmation. Keep any required signed supporting record." /></>}
        {dialog === "policy_update" && <><Note>Use real certificate and review references. Confirm the premises, storage and electronics categories before trading. Existing holds cannot be shortened. Default: 8 days from the later of acquisition and recording. Late entry extends the hold; it never backdates release.</Note><Field title="Holding days" name="hold_days" type="number" min={7} max={365} step="1" value={workspace?.policy?.hold_days ?? 8} /><Field title="Legal / designated-officer review reference" name="legal_review_reference" value={workspace?.policy?.legal_review_reference || ""} /><Field title="Dealer registration certificate reference" name="registration_reference" value={workspace?.policy?.registration_reference || ""} /><Check name="premises_confirmed" checked={workspace?.policy?.premises_confirmed}>I checked that this trading and holding premises is covered by the actual registration and that separate holding storage is available.</Check><Check name="goods_scope_confirmed" checked={workspace?.policy?.goods_scope_confirmed}>I checked the certificate’s goods categories and conditions permit this electronics trading workflow.</Check></>}
        {(dialog === "approve" || dialog === "release") && <><Note>{dialog === "approve" ? "Owner approval confirms the acquisition review. It does not end the hold or override quarantine." : "Release is permitted only after the server-calculated hold and owner review. Confirm the actual item, evidence and storage before release."}</Note><p className="text-sm font-medium">{selected?.register_number} · {selected?.description}</p><Field title="Staff name and review attestation" name="staff_attestation" minLength={3} maxLength={300} /></>}
        {dialog === "flag" && <><Note>Flagging stops onward trading. Report suspected stolen goods, false identity or tampered identifiers immediately to the local SAPS station. This app does not send a report for you.</Note><Field title="Reason for flagging" name="reason" /></>}
        {dialog === "report_saps" && <><Note>Record the acknowledgement provided after reporting to SAPS. Preserve relevant evidence. Adding a reference does not clear the quarantine.</Note><Field title="SAPS station / occurrence-book reference" name="reference" /></>}
        {dialog === "add_cost" && <><Note>Record completed refurbishment only after the hold. Cost records do not post an accounting payment or alter a repair job.</Note><div className="grid gap-4 sm:grid-cols-2"><SelectField title="Cost category" name="category"><option value="parts">Parts</option><option value="labour">Labour</option><option value="other">Other</option></SelectField><Field title="Amount (ZAR)" name="amount" type="number" min="0.01" max={9999999999} step="0.01" /></div><Field title="Work / cost description" name="description" /><RepairJobPicker choices={integrationChoices} loading={integrationLoading} error={integrationError} currentId={selected?.service_job_id || undefined} onRefresh={() => void loadIntegrationChoices("add_cost")} required={false} /></>}
        {dialog === "link_repair" && <><Note>Link an existing Nexus repair job for this branch and matching device identifier. The device must have owner approval and its holding period must have elapsed. Linking records the relationship without adding a fictitious cost or changing the repair job.</Note><p className="text-sm font-medium">{selected?.register_number} · {selected?.description}</p><RepairJobPicker choices={integrationChoices} loading={integrationLoading} error={integrationError} currentId={selected?.service_job_id || undefined} onRefresh={() => void loadIntegrationChoices("link_repair")} /></>}
        {dialog === "link_inventory" && <><Note>This creates a linked inventory reference with zero available stock. Ordinary POS and invoice sales of this device remain blocked. Use Record sale here after verified buyer intake.</Note><Field title="Target selling price (ZAR)" name="selling_price" type="number" min="0.01" max={9999999999} step="0.01" value={selected?.valuation_amount} /></>}
        {dialog === "dispose" && <><Note>This records disposal and buyer verification. It does not create an invoice, take payment or post accounting entries. Enter the real invoice and payment references from your approved accounting workflow.</Note><SelectField title="Verified buyer" name="buyer_id"><option value="">Select buyer</option>{parties.filter(party => party.kind === "buyer").map(party => <option key={party.id} value={party.id}>{party.full_name} · ID ending {party.id_last4}</option>)}</SelectField><Field title="Sale amount (ZAR)" name="sale_amount" type="number" min="0.01" max={9999999999} step="0.01" /><Field title="External invoice reference" name="invoice_reference" /><Field title="Payment reference" name="payment_reference" /><Field title="Staff name and disposal attestation" name="staff_attestation" minLength={3} maxLength={300} /></>}
        {dialog === "grant_access" && <><Note>Trading access is separate from general Nexus permissions and is limited to this branch. Staff can intake and record concerns/costs. Auditors can read and export sensitive register data.</Note><IntegrationSearch query={integrationQuery} onQuery={setIntegrationQuery} loading={integrationLoading} error={integrationError} onSearch={() => void loadIntegrationChoices("grant_access", integrationQuery)} placeholder="Search existing company staff name or email…" /><SelectField title="Existing company staff account" name="user_id"><option value="">{integrationLoading ? "Loading staff…" : "Select the intended staff account"}</option>{integrationChoices?.staff.map(staff => <option key={staff.id} value={staff.id}>{staff.name} · {staff.email}</option>)}</SelectField>{!integrationLoading && !integrationError && !integrationChoices?.staff.length && <p className="text-xs text-muted-foreground">No matching confirmed staff accounts in this company. Check their existing Nexus profile and try another search.</p>}<SelectField title="Branch role" name="role"><option value="clerk">Clerk</option><option value="auditor">Auditor — includes sensitive exports</option></SelectField>{!!workspace?.access?.length && <div className="rounded-lg border p-3 text-xs"><p className="mb-2 font-semibold">Current branch access</p>{workspace.access.map(access => <p key={access.user_id} className="break-all py-1">{access.user_id} · {access.role}</p>)}<Button type="button" variant="outline" className="mt-2" onClick={() => open("revoke_access")}>Revoke access</Button></div>}</>}
        {dialog === "revoke_access" && <SelectField title="User access to revoke" name="user_id"><option value="">Select user</option>{workspace?.access?.filter(access => access.role !== "owner").map(access => <option key={access.user_id} value={access.user_id}>{access.user_id} · {access.role}</option>)}</SelectField>}
        {dialog === "export" && <><Note>The complete JSON register contains full identity numbers and other sensitive personal information. Download only for an authorised purpose to a secure device. Do not upload it to public links or attach it to general support tickets.</Note><p className="text-sm text-muted-foreground">Includes transaction records, verification details, costs and audit entries. It is a machine-readable export; the inspection format and supporting physical identity copies still need to meet your registration requirements.</p><Check name="export_acknowledged">I am authorised to handle this register and will protect the downloaded file.</Check></>}
        <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={close}>Cancel</Button><Button type="submit" disabled={((dialog === "link_repair" || dialog === "grant_access") && (integrationLoading || !!integrationError)) || (dialog === "acquire" && !!(customerId || replacementId) && (integrationLoading || !!integrationError || !integrationChoices?.customers.some(customer => customer.id === customerId) || !selectedReplacement))}>{busy ? "Saving…" : dialog === "export" ? "Download sensitive register" : "Save and record"}</Button></div>
      </fieldset></form>}
    </ActionModal>
  </main></DashboardLayout>;
}

function ItemDetail({ item, workspace, owner, writer, now, open, onVerifyBuyer, onClose }: { item: SecondHandItem; workspace: SecondHandWorkspace; owner: boolean; writer: boolean; now: number; open: (action: Exclude<Dialog, null>) => void; onVerifyBuyer: () => void; onClose: () => void }) {
  const held = !isSecondHandHoldComplete(item, now);
  const blocked = item.status === "quarantined" || item.status === "sold";
  const costs = workspace.costs?.filter(cost => cost.item_id === item.id) ?? [];
  const events = workspace.audit?.filter(event => event.item_id === item.id) ?? [];
  return <aside className="min-w-0 rounded-xl border bg-card p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-xs text-muted-foreground">{item.register_number}</p><h2 className="mt-1 text-lg font-semibold">{item.description}</h2><div className="mt-2"><Status status={item.status} /></div></div><Button variant="ghost" aria-label="Close device details" onClick={onClose}>×</Button></div>
    <dl className="my-5 space-y-3 text-sm">{[["Seller", item.seller_name], ["IMEI", item.imei || "—"], ["Serial number", item.serial_number || "—"], ["Condition", label(item.condition)], ["Acquired", date(item.acquired_at)], ["Recorded", date(item.recorded_at)], ["Hold until", date(item.hold_until)], ["Screening", label(item.screening_result)], ["Purchase", money(item.purchase_amount)], ["Valuation", money(item.valuation_amount)], ["Refurbishment", money(item.refurbishment_cost)], ["Sale", item.sale_amount != null ? money(item.sale_amount) : "—"]].map(([title, value]) => <div key={title} className="flex justify-between gap-4"><dt className="shrink-0 text-muted-foreground">{title}</dt><dd className="text-right">{value}</dd></div>)}</dl>
    {item.flag_reason && <div className="mb-4"><Note><strong>Concern:</strong> {item.flag_reason}<p className="mt-1">SAPS reference: {item.saps_reference || "Not yet recorded — report immediately"}</p></Note></div>}
    {held && !blocked && <p className="mb-4 rounded-lg bg-muted p-3 text-xs">Holding period active. Keep this item separate. Delivery and refurbishment that changes the device remain blocked.</p>}
    <div className="flex flex-wrap gap-2">{owner && item.status === "held" && <Button onClick={() => open("approve")}><ClipboardCheck />Approve</Button>}{owner && item.status === "approved" && <Button disabled={held} onClick={() => open("release")}>Release hold</Button>}{writer && !blocked && <Button variant="outline" disabled={held || !item.approved_at} onClick={() => open("add_cost")}>Add cost</Button>}{writer && !blocked && <Button variant="outline" disabled={held || !item.approved_at} onClick={() => open("link_repair")}><Link2 />{item.service_job_id ? "Review repair link" : "Link repair"}</Button>}{owner && item.status === "released" && !item.inventory_item_id && <Button variant="outline" onClick={() => open("link_inventory")}>Link inventory</Button>}{owner && item.status === "released" && <Button disabled={!workspace.parties.some(party => party.kind === "buyer")} onClick={() => open("dispose")}>Record sale</Button>}{writer && item.status !== "sold" && <Button variant="destructive" onClick={() => open("flag")}>Flag concern</Button>}{writer && item.status === "quarantined" && <Button variant="outline" onClick={() => open("report_saps")}>SAPS report</Button>}</div>
    {owner && item.status === "released" && !workspace.parties.some(party => party.kind === "buyer") && <div className="mt-4 rounded-lg bg-muted p-3"><p className="text-xs text-muted-foreground">Verify the buyer before recording this sale.</p><Button variant="outline" className="mt-2" onClick={onVerifyBuyer}><Users />Verify buyer</Button></div>}
    {item.inventory_item_id && <p className="mt-4 break-all text-xs text-muted-foreground">Inventory reference: {item.inventory_item_id}<br />Zero available stock; sell through the verified disposal workflow.</p>}
    {item.service_job_id && <p className="mt-3 break-all text-xs text-muted-foreground">Repair job reference: {item.service_job_id}</p>}
    {item.service_job_id && <Link href="/repairs/scanner" className="mt-3 inline-block text-xs text-primary underline">Open Repairs · locate the linked job</Link>}
    {item.acquisition_type === "trade_in" && <div className="mt-5 rounded-xl border bg-primary/5 p-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><ArrowLeftRight className="size-4 text-primary" />Trade-in exchange</h3><p className="mt-2 break-words text-xs text-muted-foreground">Reference: {item.trade_in_reference || "—"}</p>{item.trade_in && <dl className="mt-3 space-y-2 text-xs">{[["Customer", item.trade_in.customer_name], ["Replacement", item.trade_in.replacement_item_name], ["Price at intake", money(item.trade_in.replacement_price)], ["Device allowance", money(item.trade_in.allowance_amount)], ["Estimated balance due", money(item.trade_in.balance_due)], ["Excess allowance", money(item.trade_in.excess_allowance)]].map(([title, value]) => <div key={title} className="flex justify-between gap-3"><dt className="text-muted-foreground">{title}</dt><dd className="text-right">{value}</dd></div>)}</dl>}<p className="mt-3 text-xs text-muted-foreground">Recorded estimate only. Confirm settlement separately in the approved sales/accounting workflow.</p></div>}
    <div className="mt-5 border-t pt-4"><h3 className="text-sm font-semibold">Recorded costs</h3>{costs.length ? <ul className="mt-2 space-y-2 text-xs">{costs.map(cost => <li key={cost.id} className="flex justify-between gap-3"><span>{cost.description}<span className="block text-muted-foreground">{cost.category} · {date(cost.created_at)}</span></span><strong className="whitespace-nowrap">{money(cost.amount)}</strong></li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">No costs recorded.</p>}</div>
    <div className="mt-5 border-t pt-4"><h3 className="text-sm font-semibold">Audit trail</h3><p className="mt-1 text-xs text-muted-foreground">Events shown from the latest 100 branch entries. The full register export contains the complete history.</p><ul className="mt-3 max-h-72 space-y-3 overflow-y-auto">{events.map(event => <li key={event.id} className="border-l-2 border-primary/30 pl-3 text-xs"><p className="font-medium capitalize">{label(event.action)}</p><p className="mt-1 text-muted-foreground">{date(event.created_at)}</p><p className="mt-1 break-all text-muted-foreground">Actor: {event.actor_id}</p></li>)}</ul>{!events.length && <p className="mt-2 text-xs text-muted-foreground">No audit entries loaded.</p>}</div>
  </aside>;
}
