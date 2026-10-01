"use client";
import Link from "next/link";
import { usePermissions } from "@/hooks/usePermissions";
export default function ArrangeShippingLink({invoiceId,status}:{invoiceId:string;status:string}){
 const {can}=usePermissions();
 if(!can('shipping.manage')||['draft','cancelled'].includes(status))return null;
 return <Link className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted" href={`/shipping?invoiceId=${encodeURIComponent(invoiceId)}`}>Arrange shipping</Link>;
}
