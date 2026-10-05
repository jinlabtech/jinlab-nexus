"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

const fields = {device_type:"Device type",brand:"Brand",model:"Model",serial_number:"Serial number",imei:"IMEI",reported_fault:"Reported fault",device_condition:"Device condition",accessories_received:"Accessories received",diagnosis:"Diagnosis",repair_outcome_reason:"Not-repaired reason"} as const;
type Field = keyof typeof fields;
export default function OwnerJobCorrection({jobId,updatedAt,values,onSaved}:{jobId:string;updatedAt:string;values:Partial<Record<Field,string|null>>;onSaved:()=>Promise<void>}) {
  const [draft,setDraft]=useState<Partial<Record<Field,string>>|null>(null);
  const [version,setVersion]=useState("");
  const [reason,setReason]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  async function save() {
    setBusy(true);setError("");
    try {
      const {error:rpcError}=await supabase.rpc("correct_service_job_details",{p_job_id:jobId,p_changes:draft,p_reason:reason.trim(),p_expected_updated_at:version});
      if(rpcError)throw new Error(rpcError.message);
      await onSaved();setDraft(null);setReason("");
    }catch(e){setError(e instanceof Error?e.message:"Correction could not be saved.")}finally{setBusy(false)}
  }
  return <section className="nexus-repair-action-card rounded-2xl border bg-background p-4">
    <h3 className="font-semibold">Owner corrections</h3>
    <p className="my-2 text-sm text-muted-foreground">Correct job-card details at any stage. The original details and your reason remain in the audit. Signed handover records remain unchanged; invoice, stock, customer identity and status changes use their controlled workflows.</p>
    {!draft ? <Button variant="outline" onClick={()=>{setDraft(Object.fromEntries(Object.keys(fields).map(key=>[key,values[key as Field]??""])));setVersion(updatedAt);setError("");}}>Correct job-card details</Button> : <form onSubmit={e=>{e.preventDefault();void save()}}>
      <div className="grid gap-3 md:grid-cols-2">{(Object.entries(fields) as [Field,string][]).map(([key,label])=><label key={key} className="block space-y-1 text-sm"><span>{label}</span><textarea disabled={busy} className="w-full rounded-lg border bg-background p-2 text-foreground" value={draft[key]??""} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}</div>
      <label className="my-3 block space-y-1 text-sm"><span>Reason for correction *</span><textarea required disabled={busy} className="w-full rounded-lg border bg-background p-2 text-foreground" value={reason} onChange={e=>setReason(e.target.value)}/></label>
      {error && <p role="alert" className="my-2 text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy||!reason.trim()}>{busy?"Saving…":"Save owner correction"}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setDraft(null)}>Cancel</Button></div>
    </form>}
  </section>;
}
