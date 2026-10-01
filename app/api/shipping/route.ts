import { NextResponse } from "next/server";
import { actor, admin, body, check, id, signQuote, verifyQuote } from "@/lib/shipping/server";
import { courierRequest, normaliseRates, shipmentPayload, ShippingError, validateAddress } from "@/lib/shipping/provider";
import { providers, type Shipment } from "@/lib/shipping/types";
export const runtime="nodejs";
export const maxDuration=60;
const headers={"Cache-Control":"no-store"};

type CourierActivity = {
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

function objectValue(value:unknown):Record<string,unknown>{
 return value&&typeof value==="object"&&!Array.isArray(value)
  ? value as Record<string,unknown>
  : {};
}

function textValue(...values:unknown[]){
 for(const value of values){
  if(typeof value==="string"&&value.trim())return value.trim();
  if(typeof value==="number"&&Number.isFinite(value))return String(value);
 }
 return "";
}

function normaliseCourierActivity(value:unknown):Omit<CourierActivity,"nexus_shipment_id">|null{
 const row=objectValue(value);
 const contact=objectValue(row.delivery_contact);
 const address=objectValue(row.delivery_address);
 const service=objectValue(row.service_level);
 const account=objectValue(row.account);

 const externalId=textValue(row.id,row.shipment_id);

 const shortTracking=textValue(
  row.short_tracking_reference,
  row.tracking_reference
 );

 const tracking=textValue(
  row.custom_tracking_reference,
  row.waybill_number,
  row.waybill,
  shortTracking
 );

 const reference=textValue(
  row.customer_reference,
  row.customer_ref,
  row.reference
 );

 const serviceCode=textValue(
  row.service_level_code,
  row.service_code,
  service.code
 );

 const serviceName=textValue(
  row.service_level_name,
  row.service_name,
  service.name,
  serviceCode
 );

 if(!externalId&&!tracking&&!reference)return null;

 return {
  external_id:externalId||tracking||reference,
  tracking_number:tracking,
  short_tracking_number:shortTracking,
  customer_reference:reference,
  account:textValue(
   row.account_number,
   row.account_reference,
   account.account_number,
   account.code,
   account.name
  ),
  cost_centre:textValue(
   row.cost_centre,
   row.cost_center,
   row.cost_centre_name,
   row.cost_center_name
  ),
  status:textValue(row.status,row.shipment_status)||"unknown",
  recipient_name:textValue(
   contact.name,
   row.recipient_name,
   row.delivery_contact_name,
   address.company
  ),
  local_area:textValue(
   address.local_area,
   address.suburb,
   row.delivery_suburb,
   row.local_area
  ),
  city:textValue(
   address.city,
   row.delivery_city,
   row.city
  ),
  service_code:serviceCode,
  service_name:serviceName,
  created_at:textValue(
   row.time_created,
   row.shipment_time_created,
   row.created_at,
   row.submitted_at,
   row.created
  ),
  updated_at:textValue(
   row.time_modified,
   row.shipment_time_modified,
   row.updated_at,
   row.modified_at,
   row.updated
  ),
 };
}

function failure(error:unknown){return NextResponse.json({error:error instanceof ShippingError?error.message:"Shipping request failed. Please refresh and try again."},{status:error instanceof ShippingError?error.status:500,headers})}
export async function GET(request:Request){try{
 const a=await actor(request,'shipping.view');const db=admin();const url=new URL(request.url);const invoiceId=url.searchParams.get('invoiceId');
 const [workspace,settings,invoices,attempts]=await Promise.all([
 a.db.rpc('get_courier_shipping_workspace',{p_limit:250}),
 db.from('courier_api_settings').select('provider_code,collection_address,updated_at').eq('company_id',a.companyId),
 db.from('invoice').select('id,invoice_number,customer_id,status').eq('company_id',a.companyId).not('status','in','(draft,cancelled)').order('created_at',{ascending:false}).limit(250),
 db.from('courier_api_attempt').select('shipment_id,state').eq('company_id',a.companyId)
 ]);[workspace,settings,invoices,attempts].forEach(r=>check(r.error));
 let invoice=null;let customer=null;
 if(invoiceId){const result=await db.from('invoice').select('id,invoice_number,customer_id,status').eq('id',id(invoiceId)).eq('company_id',a.companyId).single();check(result.error);invoice=result.data;if(!invoice||['draft','cancelled'].includes(invoice.status))throw new ShippingError('Issue the invoice before arranging shipping.');
 const resultCustomer=await db.from('customer').select('customer_name,contact_person,phone,email,address_line_1,address_line_2,city,province,postal_code,country').eq('id',invoice.customer_id).eq('company_id',a.companyId).single();check(resultCustomer.error);customer=resultCustomer.data;}
 const shipments=(workspace.data?.shipments||[]).map((s:Shipment)=>({...s,booking_state:attempts.data?.find(t=>t.shipment_id===s.id)?.state}));

 let courierActivity:CourierActivity[]=[];
 let courierActivityError:string|null=null;

 if(settings.data?.some(setting=>setting.provider_code==='courier_guy')){
  try{
   const credential=await db.rpc('shipping_read_credentials',{
    p_company_id:a.companyId,
    p_provider:'courier_guy'
   });

   if(credential.error)throw credential.error;

   const rawCredential=credential.data as unknown;
   const connection=Array.isArray(rawCredential)
    ? objectValue(rawCredential[0])
    : objectValue(rawCredential);

   const key=textValue(connection.key);

   if(!key)throw new Error('Courier Guy credentials are unavailable.');

   let response=await courierRequest(
    'courier_guy',
    key,
    '/shipments?limit=100&date_filter=time_created&absolute_query=last%2014%20days'
   );

   let payload:unknown=null;

   if(response.ok){
    payload=await response.json();
   }

   const firstRoot=objectValue(payload);

   const firstRows=Array.isArray(payload)
    ?payload
    :Array.isArray(firstRoot.shipments)
     ?firstRoot.shipments
     :Array.isArray(firstRoot.data)
      ?firstRoot.data
      :[];

   // Some Courier Guy account/API configurations may not apply
   // date helpers consistently. Fall back to the known-good list
   // request only when the filtered result is empty.
   if(!response.ok||firstRows.length===0){
    response=await courierRequest(
     'courier_guy',
     key,
     '/shipments?limit=100'
    );

    if(!response.ok){
     throw new Error(`Courier Guy returned HTTP ${response.status}.`);
    }

    payload=await response.json();
   }
   const root=objectValue(payload);

   const rows=Array.isArray(payload)
    ? payload
    : Array.isArray(root.shipments)
      ? root.shipments
      : Array.isArray(root.data)
        ? root.data
        : [payload];

   courierActivity=rows
    .map(normaliseCourierActivity)
    .filter((entry):entry is Omit<CourierActivity,"nexus_shipment_id">=>entry!==null)
    .sort((a,b)=>{
     const aTime=Date.parse(a.created_at||a.updated_at||'');
     const bTime=Date.parse(b.created_at||b.updated_at||'');
     return (Number.isFinite(bTime)?bTime:0)-
            (Number.isFinite(aTime)?aTime:0);
    })
    .map(entry=>{
     const linked=shipments.find((shipment:Shipment)=>
      (!!entry.external_id&&shipment.external_shipment_id===entry.external_id)||
      (!!entry.tracking_number&&shipment.tracking_number===entry.tracking_number)||
      (!!entry.short_tracking_number&&shipment.tracking_number===entry.short_tracking_number)||
      (!!entry.customer_reference&&shipment.shipment_number===entry.customer_reference)
     );

     return {
      ...entry,
      nexus_shipment_id:linked?.id||null
     };
    });

  }catch(error){
   courierActivityError=
    error instanceof Error
      ? error.message
      : 'Courier Guy account activity is temporarily unavailable.';
  }
 }

 return NextResponse.json({
  shipments,
  courierActivity,
  courierActivityError,
  settings:settings.data,
  invoices:invoices.data,
  invoice,
  customer,
  canManage:await a.can('shipping.manage'),
  canDispatch:await a.can('shipping.dispatch')
 },{headers});
 }catch(error){return failure(error)}}
export async function POST(request:Request){try{
 const a=await actor(request,'shipping.view');const input=await body(request);const action=input.action;
 const needed=['book','manual-book','track','reconcile'].includes(String(action))?'shipping.dispatch':'shipping.manage';if(!await a.can(needed))throw new ShippingError('You do not have permission for this action.',403);
 const db=admin();
 if(action==='connect'){
  const provider=String(input.provider);if(!providers.some(p=>p.code===provider&&p.api))throw new ShippingError('Choose an API-supported courier.');
  const address=validateAddress(input.address);const key=String(input.apiKey||'').trim();if(key.length<8||key.length>4096||/[\r\n]/.test(key))throw new ShippingError('Enter a valid courier API key.');
  const response=await courierRequest(provider,key,'/shipments?limit=1');if(!response.ok)throw new ShippingError('The courier could not verify this API key. Check your account and API access.',400);
  const result=await db.rpc('shipping_store_credentials',{p_company_id:a.companyId,p_provider:provider,p_key:key,p_address:address});check(result.error);
  return NextResponse.json({ok:true},{headers});
 }
 if(action==='save'){
  const payload=input.shipment;if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new ShippingError('Complete the shipment form.');
  const s=payload as Record<string,unknown>;if(!providers.some(p=>p.code===s.provider_code))throw new ShippingError('Choose a supported courier.');
  if(s.source_type!=='invoice')throw new ShippingError('Choose the invoice for this shipment.');
  const invoice=await db.from('invoice').select('id,invoice_number,status').eq('id',id(s.source_id)).eq('company_id',a.companyId).single();check(invoice.error);if(!invoice.data||['draft','cancelled'].includes(invoice.data.status))throw new ShippingError('Choose an issued invoice.');
  if(typeof s.country_code!=='string'||!/^[A-Z]{2}$/.test(s.country_code))throw new ShippingError('Use a two-letter country code.');
  const result=await a.db.rpc('save_courier_shipment',{p_payload:{...s,source_reference:invoice.data.invoice_number}});if(result.error)throw new ShippingError('The draft could not be saved. Check its address and parcel details; booked or pending shipments cannot be edited.');
  return NextResponse.json(result.data,{headers});
 }
 const shipmentResult=await db.from('courier_shipment').select('*').eq('id',id(input.shipmentId)).eq('company_id',a.companyId).single();check(shipmentResult.error);const s=shipmentResult.data as Shipment;if(!s)throw new ShippingError('Shipment not found.',404);
 if(action==='manual-book'){
  const tracking=String(input.trackingNumber||'').trim();if(!tracking||tracking.length>100)throw new ShippingError('Enter the waybill from your courier booking.');
  const attempt=await db.from('courier_api_attempt').select('state').eq('shipment_id',s.id).eq('company_id',a.companyId).maybeSingle();check(attempt.error);if(attempt.data&&attempt.data.state!=='rejected')throw new ShippingError('An API booking needs reconciliation. Check its courier reference before linking a waybill.');
  const result=await a.db.rpc('book_courier_shipment',{p_shipment_id:s.id,p_tracking_number:tracking});check(result.error);return NextResponse.json(result.data,{headers});
 }
 const connection=await db.rpc('shipping_read_credentials',{p_company_id:a.companyId,p_provider:s.provider_code});check(connection.error);if(!connection.data)throw new ShippingError('Connect this courier API in Shipping settings first.');const c=connection.data;
 if(action==='reconcile'){
  const tracking=String(input.trackingNumber||'').trim();if(!tracking||tracking.length>100)throw new ShippingError('Enter the waybill found in your courier portal.');
  const attempt=await db.from('courier_api_attempt').select('state').eq('shipment_id',s.id).eq('company_id',a.companyId).maybeSingle();check(attempt.error);if(!attempt.data||!['sending','uncertain'].includes(attempt.data.state))throw new ShippingError('This shipment does not need API reconciliation.');
  const response=await courierRequest(s.provider_code,c.key,'/shipments?tracking_reference='+encodeURIComponent(tracking));if(!response.ok)throw new ShippingError('Courier could not verify this waybill.',502);
  const data=await response.json();const rows=Array.isArray(data)?data:Array.isArray(data.shipments)?data.shipments:[data];
  const found=rows.find((row:Record<string,unknown>)=>row.customer_reference===s.shipment_number&&String(row.short_tracking_reference||row.tracking_reference||'')===tracking);
  if(!found?.id)throw new ShippingError('This waybill does not match the Nexus shipment reference. Check the courier portal.');
  const booked=await a.db.rpc('book_courier_shipment',{p_shipment_id:s.id,p_tracking_number:tracking,p_external_shipment_id:String(found.id)});check(booked.error);
  check((await db.from('courier_api_attempt').update({state:'booked',response:found,updated_at:new Date().toISOString()}).eq('shipment_id',s.id).eq('company_id',a.companyId)).error);return NextResponse.json(booked.data,{headers});
 }
 if(action==='rates'){
  if(s.status!=='draft')throw new ShippingError('Only draft shipments can request rates.');
  const payload=shipmentPayload(s,validateAddress(c.address));const response=await courierRequest(s.provider_code,c.key,'/rates',payload);
  if(!response.ok)throw new ShippingError('The courier could not quote this shipment. Check the address, parcel details and account.',502);
  const rates=normaliseRates(await response.json());if(!rates.length)throw new ShippingError('The courier returned no supported rates for these details.');
  return NextResponse.json({rates:rates.map(rate=>({...rate,token:signQuote({companyId:a.companyId,shipmentId:s.id,updatedAt:s.updated_at,connectionUpdatedAt:c.updated_at,expires:Date.now()+4*60*1000,rate})}))},{headers});
 }
 if(action==='book'){
  if(input.confirmed!==true)throw new ShippingError('Confirm the courier booking and quoted charge.');const quote=verifyQuote(input.quote);
  if(quote.companyId!==a.companyId||quote.shipmentId!==s.id||quote.updatedAt!==s.updated_at||quote.connectionUpdatedAt!==c.updated_at)throw new ShippingError('Shipment or connection changed. Request rates again.');
  const payload={...shipmentPayload(s,validateAddress(c.address)),...(quote.rate.serviceId?{service_level_id:quote.rate.serviceId}:{service_level_code:quote.rate.code})};
  const reserved=await db.rpc('shipping_reserve_booking',{p_company_id:a.companyId,p_shipment_id:s.id,p_updated_at:s.updated_at});if(reserved.error)throw new ShippingError('Booking is already pending, needs reconciliation, or the shipment changed. Refresh before proceeding.',409);
  let response:Response;try{response=await courierRequest(s.provider_code,c.key,'/shipments',payload)}catch{await db.from('courier_api_attempt').update({state:'uncertain',updated_at:new Date().toISOString()}).eq('shipment_id',s.id).eq('company_id',a.companyId);throw new ShippingError('The courier did not confirm the outcome. Do not rebook. Check the courier portal using '+s.shipment_number+'.',502)}
  if(!response.ok){const rejected=[400,401,403,412,422].includes(response.status);check((await db.from('courier_api_attempt').update({state:rejected?'rejected':'uncertain',response:{http_status:response.status},updated_at:new Date().toISOString()}).eq('shipment_id',s.id).eq('company_id',a.companyId)).error);throw new ShippingError(rejected?'Courier rejected the booking. Check your balance, API access and shipment details, then request fresh rates.':'Booking outcome is uncertain. Do not rebook; check the courier portal using '+s.shipment_number+'.',502)}
  let result:Record<string,unknown>;try{result=await response.json()}catch{throw new ShippingError('Booking may exist at the courier. Do not rebook; contact support to reconcile '+s.shipment_number+'.',502)}
  check((await db.from('courier_api_attempt').update({state:'uncertain',response:result,updated_at:new Date().toISOString()}).eq('shipment_id',s.id).eq('company_id',a.companyId)).error);
  const tracking=String(result.short_tracking_reference||result.tracking_reference||'');const external=String(result.id||'');
  if(!tracking||!external)throw new ShippingError('Courier accepted the request but returned incomplete booking details. Do not rebook; reconcile '+s.shipment_number+'.',502);
  const booked=await a.db.rpc('book_courier_shipment',{p_shipment_id:s.id,p_tracking_number:tracking,p_external_shipment_id:external,p_service_code:quote.rate.code,p_service_name:quote.rate.name,p_cost_including_vat:quote.rate.amount});check(booked.error);
  check((await db.from('courier_api_attempt').update({state:'booked',updated_at:new Date().toISOString()}).eq('shipment_id',s.id).eq('company_id',a.companyId)).error);return NextResponse.json(booked.data,{headers});
 }
 if(action==='track'){
  if(!s.tracking_number)throw new ShippingError('Book this shipment first.');const response=await courierRequest(s.provider_code,c.key,'/tracking/shipments?tracking_reference='+encodeURIComponent(s.tracking_number));if(!response.ok)throw new ShippingError('Courier tracking is temporarily unavailable.',502);
  const data=await response.json();const status=String(data.status||'');const statusMap:Record<string,string>={'submitted':'booked','collected':'collected','in-transit':'in_transit','at-hub':'in_transit','at-destination-hub':'in_transit','out-for-delivery':'out_for_delivery','delivered':'delivered','cancelled':'cancelled','delivery-exception':'exception','collection-exception':'exception'};
  const next=statusMap[status];if(next&&next!==s.status&&!['delivered','cancelled'].includes(s.status)){const updated=await a.db.rpc('record_courier_tracking_event',{p_shipment_id:s.id,p_status:next,p_description:'Courier tracking refreshed: '+status});check(updated.error)}
  return NextResponse.json({ok:true,status:next||s.status},{headers});
 }
 throw new ShippingError('Unknown shipping action.');
 }catch(error){return failure(error)}}
