"use client";

import JsBarcode from "jsbarcode";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Truck, Package, MapPin, ArrowRight, Plus, RefreshCw, CheckCircle2, Clock3, AlertTriangle, Plug, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { supabase } from "@/lib/supabase";
import { emptyAddress, providers, type Address, type Rate, type Shipment } from "@/lib/shipping/types";

type InvoiceOption={id:string;invoice_number:string;customer_id:string;status:string};
type CourierActivity={
 external_id:string;
 tracking_number:string;
 short_tracking_number:string;
 customer_reference:string;
 account:string;
 cost_centre:string;
 status:string;
 recipient_name:string;
 local_area:string;
 city:string;
 service_code:string;
 service_name:string;
 created_at:string;
 updated_at:string;
 nexus_shipment_id:string|null;
};

type Workspace={
 shipments:Shipment[];
 courierActivity:CourierActivity[];
 courierActivityError:string|null;
 settings:{provider_code:string;collection_address:Address}[];
 invoices:InvoiceOption[];
 invoice:InvoiceOption|null;
 customer:Record<string,string|null>|null;
 canManage:boolean;
 canDispatch:boolean;
};
type Form=Record<string,string>;
const blank:Form={id:"",provider_code:"courier_guy",source_id:"",recipient_name:"",recipient_company:"",recipient_phone:"",recipient_email:"",address_line_1:"",address_line_2:"",suburb:"",city:"",province:"",postal_code:"",country_code:"ZA",parcel_count:"1",total_weight_kg:"",length_cm:"",width_cm:"",height_cm:"",contents_description:"",notes:""};
const inputClass="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:opacity-50";
const panelClass="space-y-4 rounded-2xl border border-slate-200 bg-background p-5 shadow-sm";
type View = "overview" | "shipments" | "history" | "new" | "tracking" | "connections";
const navigation: {view:View;href:string;label:string}[] = [{view:"overview",href:"/shipping",label:"Overview"},{view:"shipments",href:"/shipping/shipments",label:"Shipments"},{view:"history",href:"/shipping/history",label:"History"},{view:"new",href:"/shipping/new",label:"New shipment"},{view:"tracking",href:"/shipping/tracking",label:"Tracking"},{view:"connections",href:"/shipping/connections",label:"Courier connections"}];
const statusLabels:Record<string,string>={draft:"Draft",booked:"Booked",collected:"Collected",in_transit:"In transit",out_for_delivery:"Out for delivery",delivered:"Delivered",failed:"Delivery exception",exception:"Delivery exception",cancelled:"Cancelled",returned:"Returned"};
function Status({status}:{status:string}) { const color=status==='delivered'?'bg-emerald-50 text-emerald-700':status==='draft'?'bg-slate-100 text-slate-600':['failed','exception','returned'].includes(status)?'bg-rose-50 text-rose-700':'bg-blue-50 text-blue-700'; return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${color}`}>{statusLabels[status]||status.replaceAll('_',' ')}</span> }
function courierName(code:string){return providers.find(p=>p.code===code)?.name||code}

function courierStatusText(status:string){
 return status
  .replaceAll('_',' ')
  .replaceAll('-',' ')
  .replace(/\b\w/g,value=>value.toUpperCase());
}

function courierStatusTone(status:string){
 const value=status.toLowerCase();

 if(value.includes('delivered'))
  return 'bg-emerald-100 text-emerald-800';

 if(value.includes('cancel'))
  return 'bg-red-100 text-red-800';

 if(value.includes('exception')||value.includes('failed')||value.includes('return'))
  return 'bg-amber-100 text-amber-900';

 if(value.includes('locker'))
  return 'bg-green-100 text-green-800';

 if(value.includes('transit')||value.includes('collected')||value.includes('delivery'))
  return 'bg-blue-100 text-blue-800';

 if(value.includes('await')||value.includes('submitted')||value.includes('dropoff'))
  return 'bg-sky-100 text-sky-800';

 return 'bg-muted text-foreground';
}

function courierDelivered(status:string){
 return status.toLowerCase().includes('delivered');
}

function courierAttention(status:string){
 const value=status.toLowerCase();
 return ['cancel','exception','failed','return'].some(term=>value.includes(term));
}


function courierClosed(status:string){
 const value=status.trim().toLowerCase();

 return (
  value==='delivered'||
  value==='cancelled'||
  value==='canceled'
 );
}

function courierAwaiting(status:string){
 const value=status.toLowerCase();
 return (
  value.includes('submitted')||
  value.includes('await')||
  value.includes('dropoff')||
  value.includes('deposit-pending')||
  value.includes('collection-pending')
 );
}

function courierMoving(status:string){
 const value=status.toLowerCase();
 return (
  value.includes('collected')||
  value.includes('locker')||
  value.includes('transit')||
  value.includes('hub')||
  value.includes('out-for-delivery')
 );
}

function escapePrint(value:unknown){
 return String(value??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#039;');
}

function printNexusWaybill(
 activity:CourierActivity,
 pickup?:Address
){
 const waybill=
  activity.tracking_number||
  activity.short_tracking_number||
  activity.external_id;

 const svg=document.createElementNS(
  'http://www.w3.org/2000/svg',
  'svg'
 );

 JsBarcode(svg,waybill,{
  format:'CODE128',
  displayValue:false,
  width:2,
  height:62,
  margin:0
 });

 const popup=window.open(
  '',
  '_blank',
  'width=900,height=1050'
 );

 if(!popup)
  throw new Error(
   'Allow pop-ups so Nexus can print the waybill.'
  );

 const created=activity.created_at
  ?new Date(activity.created_at).toLocaleString('en-ZA')
  :'—';

 popup.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapePrint(waybill)} · JINLAB Nexus</title>
<style>
*{box-sizing:border-box}
body{
 margin:0;
 background:#fff;
 color:#111827;
 font-family:Arial,Helvetica,sans-serif
}
.sheet{
 width:190mm;
 min-height:260mm;
 margin:0 auto;
 padding:12mm;
 display:flex;
 flex-direction:column
}
.header{
 display:flex;
 justify-content:space-between;
 gap:20px;
 border-bottom:4px solid #111827;
 padding-bottom:14px
}
.logo{
 font-size:22px;
 font-weight:900;
 letter-spacing:.06em
}
.muted{
 color:#64748b;
 font-size:12px;
 line-height:1.5
}
.carrier{
 text-align:right
}
.waybill{
 padding:24px 0;
 text-align:center
}
.waybill h1{
 font-size:34px;
 letter-spacing:.1em;
 margin:8px 0 15px
}
.barcode svg{
 width:100%;
 max-width:520px;
 height:75px
}
.grid{
 display:grid;
 grid-template-columns:1fr 1fr;
 border:1px solid #cbd5e1
}
.box{
 min-height:102px;
 padding:14px;
 border-bottom:1px solid #cbd5e1;
 border-right:1px solid #cbd5e1
}
.box:nth-child(even){
 border-right:0
}
.label{
 color:#64748b;
 font-size:10px;
 font-weight:700;
 letter-spacing:.12em;
 text-transform:uppercase;
 margin-bottom:7px
}
.value{
 font-size:17px;
 font-weight:800;
 line-height:1.35
}
.sub{
 margin-top:5px;
 color:#475569;
 font-size:13px
}
.status{
 display:inline-block;
 padding:5px 10px;
 border-radius:999px;
 background:#e2e8f0
}
.notice{
 margin-top:18px;
 padding:12px;
 border:1px dashed #94a3b8;
 font-size:11px;
 color:#475569
}
.footer{
 margin-top:auto;
 display:flex;
 justify-content:space-between;
 gap:20px;
 border-top:1px solid #cbd5e1;
 padding-top:10px;
 font-size:10px;
 color:#64748b
}
.jinlab{
 color:#0369a1;
 font-weight:800
}
@media print{
 body{margin:0}
 .sheet{
  width:auto;
  min-height:270mm;
  margin:0
 }
}
</style>
</head>

<body>
<div class="sheet">

 <div class="header">
  <div>
   <div class="logo">JINLAB NEXUS</div>
   <div class="muted">Shipping dispatch waybill</div>
  </div>

  <div class="carrier">
   <strong>The Courier Guy</strong>
   <div class="muted">Courier backend</div>
  </div>
 </div>

 <div class="waybill">
  <div class="label">Waybill number</div>
  <h1>${escapePrint(waybill)}</h1>
  <div class="barcode">${svg.outerHTML}</div>
 </div>

 <div class="grid">

  <div class="box">
   <div class="label">Deliver to</div>
   <div class="value">
    ${escapePrint(activity.recipient_name||'—')}
   </div>
   <div class="sub">
    ${escapePrint(
     [activity.local_area,activity.city]
      .filter(Boolean)
      .join(' · ')||'—'
    )}
   </div>
  </div>

  <div class="box">
   <div class="label">Service</div>
   <div class="value">
    ${escapePrint(
     activity.service_code||
     activity.service_name||
     '—'
    )}
   </div>
   <div class="sub">
    ${escapePrint(activity.service_name||'')}
   </div>
  </div>

  <div class="box">
   <div class="label">Customer reference</div>
   <div class="value">
    ${escapePrint(activity.customer_reference||'—')}
   </div>
  </div>

  <div class="box">
   <div class="label">Status</div>
   <div class="value">
    <span class="status">
     ${escapePrint(courierStatusText(activity.status))}
    </span>
   </div>
  </div>

  <div class="box">
   <div class="label">Collection</div>
   <div class="value">
    ${escapePrint(pickup?.company||'JINLAB')}
   </div>
   <div class="sub">
    ${escapePrint(
     [
      pickup?.street,
      pickup?.suburb,
      pickup?.city,
      pickup?.postalCode
     ].filter(Boolean).join(', ')||'—'
    )}
   </div>
  </div>

  <div class="box">
   <div class="label">Created</div>
   <div class="value">
    ${escapePrint(created)}
   </div>
  </div>

 </div>

 <div class="notice">
  Nexus dispatch document generated from the connected courier
  account. Use the courier-issued carrier label where required
  for final parcel acceptance and routing.
 </div>

 <div class="footer">
  <span>JINLAB Technology</span>
  <span class="jinlab">
   Powered by JINLAB Nexus · nexus.jinlab.co.za
  </span>
 </div>

</div>

<script>
window.onload=()=>setTimeout(()=>window.print(),250);
</script>
</body>
</html>`);

 popup.document.close();
}

async function api(action?:Record<string,unknown>,invoiceId?:string):Promise<unknown>{const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('Please sign in to Nexus.');const r=await fetch('/api/shipping'+(!action&&invoiceId?'?invoiceId='+encodeURIComponent(invoiceId):''),{method:action?'POST':'GET',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},...(action?{body:JSON.stringify(action)}:{})});const result=await r.json();if(!r.ok)throw new Error(result.error||'Shipping could not be loaded.');return result}
function ShippingWorkspace({view}:{view:View}){
 const params=useSearchParams();const initialInvoice=params.get('invoiceId')||'';const sequence=useRef(0);
 const [workspace,setWorkspace]=useState<Workspace|null>(null);const [form,setForm]=useState<Form>(blank);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');const [search,setSearch]=useState('');const [rates,setRates]=useState<(Rate&{token:string})[]>([]);const [rate,setRate]=useState('');const [confirmed,setConfirmed]=useState(false);
 const [statusFilter,setStatusFilter]=useState('all'); const [providerFilter,setProviderFilter]=useState('all');
 const [courierSearch,setCourierSearch]=useState('');
 const [courierStatusFilter,setCourierStatusFilter]=useState('all');
 const [connectionProvider,setConnectionProvider]=useState('courier_guy');const [apiKey,setApiKey]=useState('');const [pickup,setPickup]=useState<Address>(emptyAddress);const [waybill,setWaybill]=useState('');
 const [mobileEditorOpen,setMobileEditorOpen]=useState(false);
 const [mobileConnectionOpen,setMobileConnectionOpen]=useState(false);
 const applyWorkspace=useCallback((data:Workspace,fill=false)=>{setWorkspace(data);if(fill&&data.invoice&&data.customer){const c=data.customer;setForm({...blank,source_id:data.invoice.id,recipient_name:c.contact_person||c.customer_name||'',recipient_company:c.customer_name||'',recipient_phone:c.phone||'',recipient_email:c.email||'',address_line_1:c.address_line_1||'',address_line_2:c.address_line_2||'',city:c.city||'',province:c.province||'',postal_code:c.postal_code||'',country_code:!c.country||['South Africa','ZA'].includes(c.country)?'ZA':c.country.toUpperCase()});setRates([]);setRate('');setConfirmed(false)}},[]);
 const load=useCallback(async(invoiceId?:string,fill=false)=>{const request=++sequence.current;const data=await api(undefined,invoiceId) as Workspace;if(request===sequence.current)applyWorkspace(data,fill)},[applyWorkspace]);
 useEffect(()=>{let active=true;api(undefined,initialInvoice).then(data=>{if(active)applyWorkspace(data as Workspace,true)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[applyWorkspace,initialInvoice]);
 async function run(task:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await task()}catch(e){setError(e instanceof Error?e.message:'Shipping failed.')}finally{setBusy(false)}}
 function update(key:string,value:string){setForm(current=>({...current,[key]:value}));setRates([]);setRate('');setConfirmed(false)}
 const selected=workspace?.shipments.find(s=>s.id===form.id);const locked=!!selected&&(selected.status!=='draft'||['sending','uncertain','booked'].includes(selected.booking_state||''));const activeRate=rates.find(r=>r.token===rate);
 const invoiceOptions=workspace?.invoice&&!workspace.invoices.some(i=>i.id===workspace.invoice?.id)?[workspace.invoice,...workspace.invoices]:workspace?.invoices||[];
 const shipments=workspace?.shipments||[];
 const courierActivity=workspace?.courierActivity||[];

 const courierStatuses=[...new Set(
  courierActivity.map(item=>item.status).filter(Boolean)
 )].sort();

 const filteredCourierActivity=courierActivity.filter(item=>{
  const needle=courierSearch.trim().toLowerCase();

  const searchable=[
   item.tracking_number,
   item.short_tracking_number,
   item.customer_reference,
   item.recipient_name,
   item.local_area,
   item.city,
   item.service_code,
   item.service_name,
   item.status
  ].join(' ').toLowerCase();

  return (
   (!needle||searchable.includes(needle))&&
   (courierStatusFilter==='all'||item.status===courierStatusFilter)
  );
 });

 const activeCourierActivity=filteredCourierActivity.filter(
  item=>!courierClosed(item.status)
 );

 const courierHistory=filteredCourierActivity.filter(
  item=>courierClosed(item.status)
 );

 const visibleCourierActivity=
  view==='history'
   ?courierHistory
   :activeCourierActivity;

 const courierAwaitingCount=courierActivity.filter(
  item=>!courierClosed(item.status)&&courierAwaiting(item.status)
 ).length;

 const courierTransitCount=courierActivity.filter(
  item=>!courierClosed(item.status)&&courierMoving(item.status)
 ).length;

 const courierDeliveredCount=courierActivity.filter(item=>courierDelivered(item.status)).length;
 const courierAttentionCount=courierActivity.filter(item=>courierAttention(item.status)).length;
 const courierActiveCount=courierActivity.filter(
  item=>!courierClosed(item.status)
 ).length;

 const active=shipments.filter(s=>!['draft','delivered','cancelled','returned'].includes(s.status));
 const attention=shipments.filter(s=>['sending','uncertain'].includes(s.booking_state||'')||['failed','exception','returned'].includes(s.status));
 const filtered=shipments.filter(s=>(view!=='tracking'||!!s.tracking_number||['sending','uncertain'].includes(s.booking_state||''))&&(statusFilter==='all'||(statusFilter==='attention'?attention.some(a=>a.id===s.id):statusFilter==='active'?active.some(a=>a.id===s.id):s.status===statusFilter))&&(providerFilter==='all'||s.provider_code===providerFilter)&&[s.shipment_number,s.source_reference,s.recipient_name,s.tracking_number,courierName(s.provider_code),s.city,s.status].join(' ').toLowerCase().includes(search.toLowerCase().trim()));
 const showEditor=view==='new'||!!initialInvoice||!!form.id||mobileEditorOpen;
 const pickupAddress=workspace?.settings.find(s=>s.provider_code===form.provider_code)?.collection_address;

 function startNew(){setForm({...blank});setRates([]);setRate('');setConfirmed(false);setWaybill('');setError('');setMessage('')}
 function openMobileNewShipment(){startNew();setMobileEditorOpen(true)}
 function closeMobileShipment(){
  setMobileEditorOpen(false);
  if(view==='new'){
   window.history.back();
   return;
  }
  startNew();
 }
 function edit(s:Shipment){const next={...blank};for(const key of Object.keys(next))next[key]=String(s[key as keyof Shipment]??'');setForm(next);setRates([]);setRate('');setConfirmed(false);setWaybill('');setMessage('');setError('');setMobileEditorOpen(true)}
 async function save(){const numeric=['parcel_count','total_weight_kg','length_cm','width_cm','height_cm'];const shipment:Record<string,unknown>={...form,source_type:'invoice'};for(const key of numeric)shipment[key]=form[key]?Number(form[key]):null;const saved=await api({action:'save',shipment}) as {shipment_id:string};setForm(current=>({...current,id:saved.shipment_id}));await load();setMessage('Shipment draft saved. Request rates or link an existing courier waybill.');return saved.shipment_id}
 function field(key:string,label:string,type='text',required=false){return <label key={key} className="block space-y-1 text-sm"><span>{label}</span><input className={inputClass} type={type} required={required} min={type==='number'?(key==='parcel_count'?'1':'0.001'):undefined} step={type==='number'?(key==='parcel_count'?'1':'any'):undefined} value={form[key]||''} disabled={busy||locked||!workspace?.canManage} onChange={e=>update(key,e.target.value)}/></label>}
 return <DashboardLayout><main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
 <header className="relative overflow-hidden rounded-3xl bg-slate-950 p-6 text-white sm:p-8">
 <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-sky-300"><Truck className="h-5 w-5"/> JINLAB SHIPPING</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your delivery desk.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">From invoice to doorstep. Quote, book and follow your deliveries in one place.</p></div><div className="flex gap-2"><button aria-label="Refresh shipping" disabled={busy} className="rounded-xl border border-white/20 p-3 hover:bg-white/10" onClick={()=>void run(()=>load())}><RefreshCw className={`h-5 w-5 ${busy?'animate-spin':''}`}/></button>{workspace?.canManage&&<>
 <button
  type="button"
  onClick={openMobileNewShipment}
  className="flex items-center gap-2 rounded-xl bg-sky-400 px-3 py-2 text-xs font-semibold text-slate-950 md:hidden"
 >
  <Plus className="h-4 w-4"/>
  New
 </button>

 <button
  type="button"
  onClick={()=>setMobileConnectionOpen(true)}
  className="flex items-center justify-center rounded-xl border border-white/20 px-3 py-2 text-sky-100 md:hidden"
  aria-label="Courier setup"
 >
  <Plug className="h-4 w-4"/>
 </button>

 <Link
  href="/shipping/new"
  onClick={startNew}
  className="hidden items-center gap-2 rounded-xl bg-sky-400 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-300 md:flex"
 >
  <Plus className="h-4 w-4"/>
  New shipment
 </Link>
</>}</div></div>
 <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-slate-300"><span className={`h-2 w-2 rounded-full ${workspace?.settings.length?'bg-emerald-400':'bg-amber-400'}`}/>{workspace?`${workspace.settings.length} courier API connection${workspace.settings.length===1?'':'s'}`:'Loading your workspace'}<span className="mx-2 text-slate-600">/</span> Invoice-linked deliveries</div>
 </header>
 <nav aria-label="Shipping navigation" className="flex gap-1 overflow-x-auto border-b pb-2">{navigation.filter(n=>!['new','connections'].includes(n.view)||workspace?.canManage).map(n=><Link key={n.view} href={n.href} onClick={n.view==='new'?startNew:undefined} aria-current={view===n.view?'page':undefined} className={`${['new','connections'].includes(n.view)?'hidden md:inline-flex':''} whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium ${view===n.view?'bg-slate-900 text-white':'text-muted-foreground hover:bg-muted'}`}>{n.label}</Link>)}</nav>
 {workspace&&view==='overview'&&<>
 <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
 {courierActivity.length?[
  {label:'Active shipments',value:courierActiveCount,icon:Truck,color:'text-blue-600'},
  {label:'Awaiting handover',value:courierAwaitingCount,icon:Package,color:'text-sky-600'},
  {label:'Moving',value:courierTransitCount,icon:Truck,color:'text-indigo-600'},
  {label:'Needs attention',value:courierAttentionCount,icon:AlertTriangle,color:'text-amber-600'}
 ].map(card=><div key={card.label} className="rounded-2xl border bg-background p-5 shadow-sm">
  <div className="flex items-center justify-between">
   <span className="text-sm text-muted-foreground">{card.label}</span>
   <card.icon className={`h-5 w-5 ${card.color}`}/>
  </div>
  <p className="mt-3 text-3xl font-semibold">{card.value}</p>
  <p className="mt-2 text-xs text-muted-foreground">Courier Guy account</p>
 </div>):[
  {label:'Drafts to finish',value:shipments.filter(s=>s.status==='draft').length,icon:Package,color:'text-slate-600'},
  {label:'On their way',value:active.length,icon:Truck,color:'text-blue-600'},
  {label:'Delivered',value:shipments.filter(s=>s.status==='delivered').length,icon:CheckCircle2,color:'text-emerald-600'},
  {label:'Needs attention',value:attention.length,icon:AlertTriangle,color:'text-amber-600'}
 ].map(card=><div key={card.label} className="rounded-2xl border bg-background p-5 shadow-sm">
  <div className="flex items-center justify-between">
   <span className="text-sm text-muted-foreground">{card.label}</span>
   <card.icon className={`h-5 w-5 ${card.color}`}/>
  </div>
  <p className="mt-3 text-3xl font-semibold">{card.value}</p>
  <p className="mt-2 text-xs text-muted-foreground">Nexus shipments</p>
 </div>)}
</div></>}
 {(view==='connections'||mobileConnectionOpen)&&workspace?.canManage&&<>
 {mobileConnectionOpen&&
  <button
   type="button"
   aria-label="Close courier setup"
   className="nexus-shipping-sheet-backdrop fixed inset-0 z-[209] bg-black/35 md:hidden"
   onClick={()=>setMobileConnectionOpen(false)}
  />
 }
 <form
  id="courier-connection"
  className={`${panelClass} ${mobileConnectionOpen?'nexus-shipping-connection-sheet':''}`} onSubmit={e=>{e.preventDefault();void run(async()=>{await api({action:'connect',provider:connectionProvider,apiKey,address:pickup});setApiKey('');await load();setMessage('Courier API verified and connected. You can now request rates and book shipments.')})}}>
 <div className="flex items-center justify-between gap-3">
 <h2 className="text-lg font-semibold">Connect a courier API</h2>
 {mobileConnectionOpen&&
  <button
   type="button"
   className="flex size-9 items-center justify-center rounded-full bg-muted md:hidden"
   onClick={()=>setMobileConnectionOpen(false)}
   aria-label="Close courier setup"
  >
   ×
  </button>
 }
 </div><p className="text-sm text-muted-foreground">The Courier Guy and Shiplogic accounts support rates and booking here. RAM, Fastway and other couriers can be linked by waybill after booking in their portal. API keys are encrypted and never shown again.</p>
 <label className="block text-sm">Courier<select className={inputClass} value={connectionProvider} disabled={busy} onChange={e=>{setConnectionProvider(e.target.value);setApiKey('');setPickup(workspace.settings.find(s=>s.provider_code===e.target.value)?.collection_address||emptyAddress)}}>{providers.filter(p=>p.api).map(p=><option key={p.code} value={p.code}>{p.name}</option>)}</select></label>
 <label className="block text-sm">API key<input className={inputClass} type="password" autoComplete="new-password" required value={apiKey} disabled={busy} onChange={e=>setApiKey(e.target.value)}/></label>
 <h3 className="font-semibold">Collection address</h3><div className="grid gap-3 sm:grid-cols-2">{Object.entries({name:'Contact name',company:'Company',phone:'Phone',email:'Email',street:'Street address',suburb:'Suburb',city:'City',province:'Province',postalCode:'Postal code',country:'Country code (ZA)'}).map(([key,label])=><label key={key} className="block text-sm">{label}<input className={inputClass} value={pickup[key as keyof Address]} disabled={busy} required={!['company','email','suburb'].includes(key)} onChange={e=>setPickup(current=>({...current,[key]:e.target.value}))}/></label>)}</div>
 <button disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{busy?'Checking connection…':'Verify and save connection'}</button>
 </form>
 </>}
 {workspace&&view!=='connections'&&<div className="space-y-6">
 {view!=='new'&&!initialInvoice&&workspace?.settings.some(setting=>setting.provider_code==='courier_guy')&&<section className={panelClass}>
 <div className="flex flex-wrap items-start justify-between gap-3">
  <div>
   <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">Connected courier account</p>
   <h2 className="mt-1 text-xl font-semibold">
    {view==='history'?'Courier history':'Active shipments'}
   </h2>
   <p className="mt-1 text-sm text-muted-foreground">
    {view==='history'
     ?'Delivered and cancelled shipments are kept here, away from daily dispatch work.'
     :'Live shipments that still require operational attention. Courier Guy remains connected in the background.'}
   </p>
  </div>
  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
   API connected
  </span>
 </div>

 <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
  <div className="relative">
   <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"/>
   <input
    type="search"
    aria-label="Search Courier Guy shipments"
    placeholder="Search waybill, reference, recipient or area…"
    className={`${inputClass} pl-10`}
    value={courierSearch}
    onChange={event=>setCourierSearch(event.target.value)}
   />
  </div>

  <select
   aria-label="Courier Guy status"
   className={inputClass}
   value={courierStatusFilter}
   onChange={event=>setCourierStatusFilter(event.target.value)}
  >
   <option value="all">All statuses</option>
   {courierStatuses.map(status=>
    <option key={status} value={status}>{courierStatusText(status)}</option>
   )}
  </select>
 </div>

 {workspace.courierActivityError?
  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
   Courier Guy is connected, but account activity could not be refreshed: {workspace.courierActivityError}
  </div>
 :visibleCourierActivity.length?
  <div className="overflow-x-auto rounded-xl border">
   <table className="w-full min-w-[900px] text-left text-sm">
    <thead className="bg-muted/60">
     <tr className="border-b text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <th className="px-4 py-3">Waybill No.</th>
      <th className="px-4 py-3">Status</th>
      <th className="px-4 py-3">Service</th>
      <th className="px-4 py-3">Customer Reference</th>
      <th className="px-4 py-3">Deliver To</th>
      <th className="px-4 py-3">Created</th>
      <th className="px-4 py-3 text-right">Actions</th>
     </tr>
    </thead>

    <tbody className="divide-y">
     {visibleCourierActivity.map(activity=>
      <tr key={activity.external_id} className="hover:bg-muted/40">
       <td className="px-4 py-4">
        <span className="font-semibold">{activity.tracking_number||activity.short_tracking_number||'—'}</span>

        {activity.short_tracking_number&&activity.short_tracking_number!==activity.tracking_number&&
         <span className="mt-1 block text-xs text-muted-foreground">
          Short ref: {activity.short_tracking_number}
         </span>}

        {activity.nexus_shipment_id&&
         <span className="mt-1 inline-block rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
          Nexus linked
         </span>}
       </td>

       <td className="px-4 py-4">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${courierStatusTone(activity.status)}`}>
         {courierStatusText(activity.status)}
        </span>
       </td>

       <td className="px-4 py-4">
        <span className="font-medium">{activity.service_code||activity.service_name||'—'}</span>
        {activity.service_name&&activity.service_name!==activity.service_code&&
         <span className="mt-1 block text-xs text-muted-foreground">{activity.service_name}</span>}
       </td>

       <td className="px-4 py-4">
        {activity.customer_reference||'—'}
       </td>

       <td className="px-4 py-4">
        <span>{activity.recipient_name||'—'}</span>
        {(activity.local_area||activity.city)&&
         <span className="mt-1 block text-xs text-muted-foreground">
          {[activity.local_area,activity.city].filter(Boolean).join(' · ')}
         </span>}
       </td>

       <td className="px-4 py-4 whitespace-nowrap text-muted-foreground">
        {activity.created_at
         ?new Date(activity.created_at).toLocaleString('en-ZA',{
           year:'numeric',
           month:'short',
           day:'2-digit',
           hour:'2-digit',
           minute:'2-digit'
          })
         :'—'}
       </td>

       <td className="px-4 py-4">
        <div className="flex justify-end gap-2">

         <button
          type="button"
          className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          onClick={()=>printNexusWaybill(
           activity,
           workspace.settings.find(
            setting=>setting.provider_code==='courier_guy'
           )?.collection_address
          )}
         >
          Print waybill
         </button>

         <a
          href="https://portal.thecourierguy.co.za"
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-muted"
         >
          Courier
         </a>

        </div>
       </td>
      </tr>
     )}
    </tbody>
   </table>
  </div>
 :<div className="rounded-xl border border-dashed px-6 py-10 text-center">
   <Package className="mx-auto mb-3 h-9 w-9 text-muted-foreground"/>
   <h3 className="font-semibold">
    {view==='history'
     ?'No completed courier shipments match these filters'
     :'No active courier shipments match these filters'}
   </h3>
   <p className="mt-2 text-sm text-muted-foreground">
    {courierActivity.length?'Clear the search or choose another status.':'Refresh once shipment activity is available in the courier account.'}
   </p>
  </div>}
 </section>}

 {view==='tracking'&&!initialInvoice&&<section id="shipment-list" className={panelClass}>
 <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{view==='tracking'?'Track your deliveries':view==='overview'?'Recent shipments':'All shipments'}</h2><p className="mt-1 text-xs text-muted-foreground">Showing {filtered.length} of the most recent {shipments.length} shipments · up to 250</p></div><div className="flex gap-2"><select aria-label="Filter by courier" className={inputClass} value={providerFilter} onChange={e=>setProviderFilter(e.target.value)}><option value="all">All couriers</option>{providers.map(p=><option key={p.code} value={p.code}>{p.name}</option>)}</select></div></div>
 <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><input aria-label="Search shipments" type="search" placeholder="Search recipient, invoice, waybill or city…" className={`${inputClass} pl-10`} value={search} onChange={e=>setSearch(e.target.value)}/></div>
 <div className="flex flex-wrap gap-2" aria-label="Shipment status filters">{['all','draft','active','booked','in_transit','out_for_delivery','delivered','attention'].map(status=><button key={status} aria-pressed={statusFilter===status} onClick={()=>setStatusFilter(status)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${statusFilter===status?'bg-sky-100 text-sky-900':'bg-muted text-muted-foreground'}`}>{status==='all'?'All':status==='attention'?'Needs attention':status==='active'?'On their way':statusLabels[status]}</button>)}</div>
 {filtered.length?<div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-3">Shipment / invoice</th><th className="px-3 py-3">Deliver to</th><th className="px-3 py-3">Courier / waybill</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Action</th></tr></thead><tbody className="divide-y">{filtered.map(s=><tr key={s.id} className={form.id===s.id?'bg-sky-50/50':'hover:bg-muted/40'}><td className="px-3 py-4"><span className="font-semibold">{s.shipment_number}</span><span className="mt-1 block text-xs text-muted-foreground">{s.source_reference||'No invoice'}</span></td><td className="px-3 py-4"><span>{s.recipient_name}</span><span className="mt-1 block text-xs text-muted-foreground">{s.city} · {s.parcel_count} parcel{s.parcel_count===1?'':'s'}</span></td><td className="px-3 py-4"><span>{courierName(s.provider_code)}</span><span className="mt-1 block text-xs text-muted-foreground">{s.tracking_number||'Awaiting booking'}</span></td><td className="px-3 py-4"><Status status={s.status}/>{['sending','uncertain'].includes(s.booking_state||'')&&<span className="mt-1 block text-xs text-amber-700">Check booking</span>}</td><td className="px-3 py-4 text-right"><button disabled={busy} className="rounded-lg border px-3 py-2 font-medium hover:bg-background" onClick={()=>{edit(s);requestAnimationFrame(()=>document.getElementById('shipment-detail')?.scrollIntoView({behavior:'smooth'}))}}>{s.status==='draft'?'Continue':'View'}</button></td></tr>)}</tbody></table></div>:<div className="rounded-xl border border-dashed px-6 py-12 text-center"><Package className="mx-auto mb-3 h-9 w-9 text-slate-300"/><h3 className="font-semibold">{shipments.length?'No shipments match your filters':'Your first delivery starts here'}</h3><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{shipments.length?'Try another name, waybill or status.':'Choose an invoice, check the customer’s address, then compare courier rates and book.'}</p>{workspace.canManage&&!shipments.length&&<Link href="/shipping/new" onClick={startNew} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"><Plus className="h-4 w-4"/>Create shipment</Link>}</div>}
 </section>}
 {showEditor&&
 <section id="shipment-detail" className={`${panelClass} nexus-shipping-editor`}><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 flex-1 items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-sky-700">{selected?'Shipment details':'New delivery'}</p><h2 className="mt-1 text-xl font-semibold">{selected?.shipment_number||'Arrange a shipment'}</h2></div>{selected&&<Status status={selected.status}/>}</div>
 </div>

 <button
  type="button"
  onClick={closeMobileShipment}
  className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full bg-muted text-lg md:hidden"
  aria-label="Close shipment"
 >
  ×
 </button>

 <div className="grid gap-2 sm:grid-cols-3">{[{label:'Delivery details',done:!!form.id},{label:'Courier quote',done:!!rate||locked},{label:'Book & track',done:!!selected?.tracking_number}].map((step,i)=><div key={step.label} className={`flex items-center gap-2 rounded-lg px-3 py-3 text-sm ${step.done?'bg-emerald-50 text-emerald-800':'bg-muted text-muted-foreground'}`}><span className="flex h-6 w-6 items-center justify-center rounded-full border text-xs">{step.done?'✓':i+1}</span>{step.label}</div>)}</div>
 {pickupAddress&&<div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-slate-800"><MapPin className="mt-1 h-4 w-4 shrink-0"/><div><p className="text-xs font-semibold uppercase tracking-wide">Collect from</p><p className="mt-1 text-sm">{pickupAddress.company||pickupAddress.name} · {pickupAddress.street}, {pickupAddress.city}</p></div><ArrowRight className="ml-auto h-4 w-4 shrink-0"/></div>}

 {selected?.source_id&&<Link className="text-sm text-primary underline" href={'/invoices/'+selected.source_id}>Open invoice {selected.source_reference}</Link>}
 {locked&&<p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{selected?.status==='draft'?'This booking needs checking in the courier portal. Do not create another booking for it. Use reference '+selected.shipment_number+'.':'This shipment has been booked. Its address and parcel details are locked.'}</p>}
 <form className="space-y-4" onSubmit={e=>{e.preventDefault();void run(async()=>{await save()})}}>
 <label className="block text-sm">Invoice<SearchableSelect searchLabel="Invoices" value={form.source_id} disabled={busy||locked||!workspace.canManage} className={inputClass} required onValueChange={value=>void run(async()=>{if(value)await load(value,true);else setForm(blank)})}><option value="">Choose an invoice</option>{invoiceOptions.map(i=><option key={i.id} value={i.id}>{i.invoice_number}</option>)}</SearchableSelect></label>
 <p className="text-xs text-muted-foreground">Choosing an invoice fills the delivery details from its customer. Review them here; changes apply only to this shipment.</p>
 <label className="block text-sm">Courier<SearchableSelect searchLabel="Couriers" value={form.provider_code} disabled={busy||locked||!workspace.canManage} className={inputClass} onValueChange={value=>update('provider_code',value)}>{providers.map(p=><option key={p.code} value={p.code}>{p.name}{p.api?(workspace.settings.some(s=>s.provider_code===p.code)?' · API connected':' · connect API'):' · manual waybill'}</option>)}</SearchableSelect></label>
 <h3 className="flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4 text-sky-600"/>Delivery address</h3><div className="grid gap-3 sm:grid-cols-2">{field('recipient_name','Recipient name','text',true)}{field('recipient_company','Recipient company')}{field('recipient_phone','Phone','tel',true)}{field('recipient_email','Email','email')}{field('address_line_1','Street address','text',true)}{field('address_line_2','Address line 2')}{field('suburb','Suburb')}{field('city','City','text',true)}{field('province','Province','text',true)}{field('postal_code','Postal code','text',true)}{field('country_code','Country code (ZA)','text',true)}</div>
 <h3 className="flex items-center gap-2 font-semibold"><Package className="h-4 w-4 text-sky-600"/>Parcel details</h3><p className="text-xs text-muted-foreground">For multiple parcels, enter identical dimensions for each and their combined weight. Pack differently sized parcels as separate shipments.</p>
 <div className="grid gap-3 sm:grid-cols-2">{field('parcel_count','Number of parcels','number',true)}{field('total_weight_kg','Combined weight (kg)','number',true)}{field('length_cm','Each parcel length (cm)','number',true)}{field('width_cm','Each parcel width (cm)','number',true)}{field('height_cm','Each parcel height (cm)','number',true)}{field('contents_description','Contents')}{field('notes','Delivery instructions')}</div>
 {workspace.canManage&&!locked&&<div className="flex flex-wrap gap-2"><button disabled={busy} className="rounded-lg border px-4 py-2">Save draft</button>{providers.find(p=>p.code===form.provider_code)?.api&&<button type="button" disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground" onClick={e=>{if(!e.currentTarget.form?.reportValidity())return;void run(async()=>{const shipmentId=await save();const result=await api({action:'rates',shipmentId}) as {rates:(Rate&{token:string})[]};setRates(result.rates);setRate('');setConfirmed(false);setMessage('Choose a rate. Rates expire after four minutes.')})}}>Get courier rates</button>}</div>}
 </form>
 {rates.length>0&&!locked&&<div className="space-y-3 rounded-lg border p-4"><h3 className="font-semibold">Courier rates</h3>{rates.map((r,i)=><label key={i} className="flex items-center gap-2 rounded border p-3 text-sm"><input type="radio" name="courier-rate" checked={rate===r.token} onChange={()=>{setRate(r.token);setConfirmed(false)}} disabled={busy}/>{r.name} · R{r.amount.toFixed(2)}</label>)}<p className="text-xs text-muted-foreground">Rates are supplied by the courier. Final charges may change if the measured parcel or address differs.</p>{workspace.canDispatch&&<><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy||!rate} onChange={e=>setConfirmed(e.target.checked)}/>I confirm the address, parcel details and quoted courier charge. Book this shipment.</label><button disabled={busy||!confirmed||!activeRate} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" onClick={()=>void run(async()=>{try{await api({action:'book',shipmentId:form.id,quote:rate,confirmed});setMessage('Shipment booked. Its waybill is linked to the invoice.')}finally{setRates([]);setRate('');setConfirmed(false);await load()}})}>{busy?'Booking…':'Book shipment'}</button></>}</div>}
 {form.id&&!locked&&workspace.canDispatch&&<details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Already booked with a courier? Link its waybill</summary><div className="mt-3 flex gap-2"><input aria-label="Existing courier waybill" className={inputClass} value={waybill} onChange={e=>setWaybill(e.target.value)} placeholder="Waybill number"/><button disabled={busy||!waybill.trim()} className="shrink-0 rounded-lg border px-3" onClick={()=>void run(async()=>{await api({action:'manual-book',shipmentId:form.id,trackingNumber:waybill});await load();setMessage('Existing courier waybill linked.')})}>Link waybill</button></div></details>}
 {selected&&selected.status==='draft'&&['sending','uncertain'].includes(selected.booking_state||'')&&workspace.canDispatch&&<div className="space-y-2 rounded-lg border p-3"><p className="text-sm">Find this shipment in the courier portal using {selected.shipment_number}, then enter its waybill. Nexus will verify the matching reference before linking it.</p><input aria-label="Waybill to reconcile" className={inputClass} value={waybill} onChange={e=>setWaybill(e.target.value)}/><button disabled={busy||!waybill.trim()} className="rounded-lg border px-3 py-2 text-sm" onClick={()=>void run(async()=>{await api({action:'reconcile',shipmentId:selected.id,trackingNumber:waybill});await load();setMessage('Courier booking verified and linked.')})}>Verify existing booking</button></div>}
 {selected?.tracking_number&&<div className="space-y-2 rounded-lg bg-muted p-4"><strong className="block">Waybill: {selected.tracking_number}</strong>{selected.tracking_url?.startsWith('https://')&&<a className="text-sm text-primary underline" href={selected.tracking_url} target="_blank" rel="noreferrer">Track with courier</a>}{workspace.canDispatch&&workspace.settings.some(s=>s.provider_code===selected.provider_code)&&<button disabled={busy} className="ml-3 rounded-lg border px-3 py-2 text-sm" onClick={()=>void run(async()=>{await api({action:'track',shipmentId:selected.id});await load();setMessage('Tracking refreshed.')})}>Refresh tracking</button>}</div>}
 {selected?.events?.length? <div className="space-y-2"><h3 className="flex items-center gap-2 font-semibold"><Clock3 className="h-4 w-4"/>Tracking timeline</h3>{selected.events.map(event=><p key={event.id} className="border-t pt-2 text-sm">{event.description}<span className="block text-xs text-muted-foreground">{new Date(event.event_at).toLocaleString()}</span></p>)}</div>:null}
 </section>}</div>}
 </main></DashboardLayout>
}
export default function ShippingPage({view="overview"}:{view?:View}){return <Suspense fallback={<p className="p-6">Loading shipping…</p>}><ShippingWorkspace view={view}/></Suspense>}
