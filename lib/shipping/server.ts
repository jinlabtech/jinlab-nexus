import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ShippingError } from "./provider";
import { readBody } from "@/lib/whatsapp/server";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function id(value: unknown) { if (typeof value !== "string" || !UUID.test(value)) throw new ShippingError("Invalid record identifier."); return value; }
function secret() { const value=process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY; if(!value) throw new ShippingError("Shipping server configuration is missing.",503); return value; }
export function admin() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret(), { auth: { persistSession:false,autoRefreshToken:false } }); }
export async function actor(request: Request, permission: string) {
 const authorization=request.headers.get('authorization'); if(!authorization?.startsWith('Bearer ') || authorization.length>10000) throw new ShippingError("Please sign in.",401);
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error}=await db.auth.getUser(authorization.slice(7)); if(error||!user)throw new ShippingError("Please sign in again.",401);
 const {data:companyId,error:ce}=await db.rpc('current_company_id'); if(ce||!companyId)throw new ShippingError("Company access could not be verified.",403);
 const can=async(p:string)=>{const {data,error}=await db.rpc('current_user_has_permission',{requested_permission:p});if(error)throw new ShippingError("Permissions could not be verified.",503);return data===true};
 if(!await can(permission))throw new ShippingError("You do not have permission for this shipping action.",403);
 return {db,companyId:String(companyId),userId:user.id,can};
}
export async function body(request:Request):Promise<Record<string,unknown>>{try{const value=JSON.parse(new TextDecoder().decode(await readBody(request,65536)));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value}catch{throw new ShippingError("Request must contain a valid shipping form.");}}
export function check(error: {message:string}|null) { if(error)throw new ShippingError("Shipping data could not be saved or loaded. Refresh and try again.",500); }
export type Quote = { companyId:string; shipmentId:string; updatedAt:string; connectionUpdatedAt:string; expires:number; rate:{code:string;name:string;amount:number;serviceId?:number} };
export function signQuote(value:Quote){const text=Buffer.from(JSON.stringify(value)).toString('base64url');return text+'.'+createHmac('sha256',secret()).update('shipping-quote:'+text).digest('base64url')}
export function verifyQuote(value:unknown):Quote{
 if(typeof value!=='string'||value.length>12000)throw new ShippingError("Request a new shipping rate.");
 const [payload,signature,...extra]=value.split('.');const expected=createHmac('sha256',secret()).update('shipping-quote:'+payload).digest();const given=Buffer.from(signature||'','base64url');
 if(extra.length||given.length!==expected.length||!timingSafeEqual(given,expected))throw new ShippingError("Shipping rate is invalid. Request rates again.");
 let quote:Quote;try{quote=JSON.parse(Buffer.from(payload,'base64url').toString())}catch{throw new ShippingError("Shipping rate is invalid.")}
 if(!Number.isFinite(quote.expires)||quote.expires<Date.now())throw new ShippingError("This rate expired. Request rates again.");return quote;
}
