export type SecondHandRole = "owner" | "clerk" | "auditor";
export type SecondHandStatus = "held" | "approved" | "released" | "quarantined" | "sold";
export interface SecondHandParty {
  id: string;
  kind: "seller" | "buyer";
  full_name: string;
  id_type: "sa_id" | "passport" | "other";
  id_last4: string;
  verified_at: string;
}
export interface SecondHandItem {
  id: string;
  register_number: string;
  seller_id: string;
  seller_name: string;
  description: string;
  brand: string;
  model: string;
  serial_number: string | null;
  imei: string | null;
  condition: string;
  purchase_amount: number;
  valuation_amount: number;
  acquired_at: string;
  recorded_at: string;
  hold_until: string;
  status: SecondHandStatus;
  flag_reason: string | null;
  saps_reference: string | null;
  approved_at: string | null;
  inventory_item_id: string | null;
  service_job_id: string | null;
  refurbishment_cost: number;
  sale_amount: number | null;
  disposed_at: string | null;
  buyer_id: string | null;
  screening_result: "clear" | "flagged" | "unknown";
}
export interface SecondHandAudit {
  id: string;
  item_id: string | null;
  action: string;
  actor_id: string;
  created_at: string;
  details: Record<string, unknown>;
}
export interface SecondHandCost {
  id: string;
  item_id: string;
  category: "parts" | "labour" | "other";
  description: string;
  amount: number;
  service_job_id: string | null;
  created_at: string;
}
export interface SecondHandWorkspace {
  access_required?: boolean;
  branch_id: string | null;
  role: SecondHandRole | null;
  branches: { id: string; name: string }[];
  policy: { hold_days: number; legal_review_reference: string | null; registration_reference: string | null; premises_confirmed: boolean; goods_scope_confirmed: boolean };
  parties: SecondHandParty[];
  items: SecondHandItem[];
  item_count?: number;
  item_limit?: number;
  audit: SecondHandAudit[];
  access: { user_id: string; role: SecondHandRole }[];
  costs: SecondHandCost[];
}
export type SecondHandAction = "party_create" | "acquire" | "approve" | "release" | "flag" | "report_saps" | "add_cost" | "link_inventory" | "dispose" | "policy_update" | "grant_access" | "revoke_access";

// Spreadsheet programs interpret these leading characters as executable formulas.
export function safeCsvCell(value: unknown): string {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function secondHandCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  return [columns.map(safeCsvCell).join(","), ...rows.map(row => columns.map(column => safeCsvCell(row[column])).join(","))].join("\r\n");
}

export function isSecondHandHoldComplete(item: Pick<SecondHandItem, "hold_until">, now = Date.now()): boolean {
  const until = Date.parse(item.hold_until);
  return Number.isFinite(until) && now >= until;
}

// Only vetted, static database validation messages may cross into the interface.
const safeDatabaseMessages = new Set<string>([
  "A South African ID must contain 13 digits.",
  "A serial number or IMEI is required.",
  "A valid signed-in staff account is required.",
  "A verified buyer in this branch is required.",
  "A verified seller in this branch is required.",
  "Acquisition identity, timestamps, evidence and holding policy are immutable.",
  "Acquisition time must be actual, in the past, and within five years.",
  "Auditor access is read-only.",
  "Choose an existing authenticated staff account.",
  "Communications equipment requires its applicable IMEI.",
  "Confirm registered premises/goods scope and a holding period of 7–365 days.",
  "Grant clerk or auditor access.",
  "IMEI must contain 15 digits.",
  "Invalid request payload.",
  "Invalid sale amount.",
  "Invalid selling price.",
  "Only a released item can be disposed.",
  "Only an approved item can be released.",
  "Only clear, held items can receive owner approval.",
  "Only quarantined items accept a SAPS report reference.",
  "Only verified adults (18 or older) may trade.",
  "Owner access can only be managed by a database administrator.",
  "Owner approval is required before release or refurbishment.",
  "Owner approval is required.",
  "Owner must record registration, premises, goods scope and operating/legal review before trading.",
  "Quarantined or unresolved goods cannot be released, altered or sold.",
  "Record seller ownership/authority declaration before acquisition.",
  "Refurbishment costs require an approved, unsold item.",
  "Release the item first; only one inventory reference is allowed.",
  "Repair job must match this branch, company and device identifier.",
  "Second-hand access for this branch is not granted.",
  "Second-hand acquisition records cannot be deleted.",
  "Second-hand device hold, owner approval, branch or quarantine prevents repairs.",
  "Second-hand register evidence is append-only; records cannot be changed or deleted.",
  "Sight the original identity document and retain a secured copy first.",
  "Sold item investigations require a manual incident process; the register remains unchanged.",
  "Statutory/conservative holding period has not elapsed; no delivery or refurbishment is allowed.",
  "The item is not available in this branch.",
  "This device is controlled by Second-hand Trading. Use its verified-buyer disposal register; ordinary stock, POS and invoice paths are blocked.",
  "This serial/IMEI is already in the register. Owner review is required; repeat intake is blocked.",
  "Unknown second-hand operation."
]);
const safeFieldNames = new Set<string>(["acquisition_reference", "address", "brand", "category", "condition", "description", "full_name", "id_copy_reference", "id_number", "id_type", "invoice_reference", "kind", "legal_review_reference", "model", "ownership_reference", "payment_reference", "phone", "reason", "reference", "registration_reference", "role", "screening_reference", "screening_result", "screening_source", "staff_attestation", "verification_reference"]);
export function secondHandErrorMessage(error: { code?: string; message?: string }): string {
  const message = error.message || "";
  if (["22023", "42501", "P0001"].includes(error.code || "") && safeDatabaseMessages.has(message)) return message;
  const field = /^Invalid or missing field: ([a-z_]+)$/.exec(message)?.[1];
  if (error.code === "22023" && field && safeFieldNames.has(field)) return `Check the ${field.replaceAll("_", " ")} field; it is missing or outside the permitted length.`;
  if (/abort|timed? ?out/i.test(message)) return "The request timed out. Its result is uncertain; refresh the register before retrying to avoid a duplicate record.";
  if (error.code === "42501") return "You do not have access to this branch or action. Ask the owner to review your second-hand trading access.";
  if (error.code === "23505") return "This record or device identifier is already registered. Check the existing register before trying again.";
  if (error.code === "PGRST202" || error.code === "42883") return "Second-hand trading is not available yet. The database update must be installed before this module can be used.";
  if (["22023", "23514", "22P02", "23502", "22003", "22007", "22008"].includes(error.code || "")) return "Some details are invalid. Check the required fields, dates, identifiers and amounts.";
  return "The request could not be completed. Check your connection and refresh the register before retrying.";
}
