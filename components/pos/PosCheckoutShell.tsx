"use client";
import { useSyncExternalStore, type ReactNode } from "react";
import ActionModal from "@/components/ui/ActionModal";
function subscribe(callback:()=>void){const query=window.matchMedia("(min-width: 1280px)");query.addEventListener("change",callback);return()=>query.removeEventListener("change",callback)}
const desktopSnapshot=()=>window.matchMedia("(min-width: 1280px)").matches;
export default function PosCheckoutShell({open,busy,onClose,children}:{open:boolean;busy:boolean;onClose:()=>void;children:ReactNode}){
  const desktop=useSyncExternalStore(subscribe,desktopSnapshot,()=>false);
  if(desktop)return <aside className="sticky top-4 h-fit rounded-2xl border bg-card shadow-sm">{children}</aside>;
  return <ActionModal open={open} title="POS checkout" subtitle={busy?"Processing sale. Please wait for confirmation.":"Review the basket and payment. Closing keeps your basket."} onClose={()=>{if(!busy)onClose()}} maxWidth="max-w-2xl">
    {!busy&&<button type="button" onClick={onClose} className="mb-3 min-h-11 w-full rounded-lg border px-3 text-sm">Cancel checkout · Continue shopping</button>}
    {children}
  </ActionModal>;
}
