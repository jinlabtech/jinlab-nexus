export type CoreModule = "inventory" | "receivables" | "quotations" | "purchasing" | "repairs" | "controls" | "whatsapp";
export type CoreTopic = CoreModule | "overview" | "help" | "search";
export type Coverage = { module: CoreModule; label: string; state: "ready" | "partial" | "unavailable" | "forbidden"; detail: string; records: number | null };
export type InventoryFact = { id: string; name: string; sku: string; quantity: number; minimumStock: number; onOrder: number | null };
export type ReceivableFact = { id: string; number: string; customerName: string; outstanding: number; daysOverdue: number; dueDate: string };
export type QuotationFact = { id: string; number: string; status: string; date: string; validUntil: string | null; total: number; converted: boolean | null };
export type PurchaseFact = { id: string; number: string; status: string; expectedDate: string | null; outstandingUnits: number | null };
export type RepairFact = { id: string; number: string; status: string; assigned: boolean; createdAt: string; updatedAt: string };
export type WhatsAppFact = { id: string; contactName: string; waId: string; status: string; salesStage: string; attentionState: string; assigned: boolean; customerLinked: boolean; unreadCount: number; followUpAt: string | null; lastInboundAt: string | null; lastMessageAt: string | null; salesValue: number | null };
export type CoreSnapshot = {
  companyId: string; companyName: string; currency: string | null; asOf: string; checkedAt: string; coverage: Coverage[];
  inventory: InventoryFact[] | null; receivables: ReceivableFact[] | null; quotations: QuotationFact[] | null;
  purchasing: PurchaseFact[] | null; repairs: RepairFact[] | null; whatsapp: WhatsAppFact[] | null;
  controls: { openCount: number; oldestOpenDate: string | null } | null;
};
export type CoreFinding = {
  id: string; module: CoreModule; severity: "high" | "medium" | "low";
  title: string; summary: string; evidence: string[]; rule: string;
  actionLabel: string; href: string; recordId?: string;
};
export type CoreMetric = { id: string; label: string; value: string; detail: string; module: CoreModule };
export type CoreAnalysis = {
  engine: "nexus-core"; version: "1.0"; companyName: string; currency: string | null; asOf: string; checkedAt: string;
  headline: string; metrics: CoreMetric[]; findings: CoreFinding[]; coverage: Coverage[];
};
export type CoreMatch = { label: string; detail: string; href: string; module: CoreModule };
export type CoreAnswer = { text: string; topic: CoreTopic; findings: CoreFinding[]; suggestions: string[]; matches: CoreMatch[] };
export type CoreResponse = { analysis: CoreAnalysis; answer?: CoreAnswer };
