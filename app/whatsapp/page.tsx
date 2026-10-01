import { Suspense } from "react";
import WhatsAppInbox from "@/components/whatsapp/WhatsAppInbox";

export default function WhatsAppPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground" role="status">Loading WhatsApp workspace…</div>}>
      <WhatsAppInbox />
    </Suspense>
  );
}
