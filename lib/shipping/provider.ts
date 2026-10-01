import type { Address, Rate, Shipment } from "./types";
export class ShippingError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function validateAddress(value: unknown): Address {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ShippingError("Enter a complete collection address.");
  const raw = value as Record<string, unknown>;
  const result = Object.fromEntries(["name", "company", "phone", "email", "street", "suburb", "city", "province", "postalCode", "country"].map(key => [key, typeof raw[key] === "string" ? raw[key].trim().slice(0, 250) : ""])) as Address;
  for (const field of ["name", "phone", "street", "city", "postalCode", "province"] as const) if (!result[field]) throw new ShippingError(`Collection ${field} is required.`);
  result.country = result.country.toUpperCase();
  if (!/^[A-Z]{2}$/.test(result.country)) throw new ShippingError("Use a two-letter country code, for example ZA.");
  return result;
}
export function shipmentPayload(s: Shipment, pickup: Address) {
  if (![s.length_cm, s.width_cm, s.height_cm, s.total_weight_kg].every(n => Number.isFinite(Number(n)) && Number(n) > 0)) throw new ShippingError("Enter the parcel weight, length, width and height before requesting rates.");
  if (!Number.isInteger(s.parcel_count) || s.parcel_count < 1 || s.parcel_count > 100) throw new ShippingError("Enter a valid parcel count.");
  if (!s.province || !s.postal_code || !/^[A-Z]{2}$/.test(s.country_code)) throw new ShippingError("Complete the delivery province, postal code and two-letter country code.");
  return {
    collection_address: { type: "business", company: pickup.company, street_address: pickup.street, local_area: pickup.suburb, city: pickup.city, zone: pickup.province, country: pickup.country, code: pickup.postalCode },
    collection_contact: { name: pickup.name, mobile_number: pickup.phone, email: pickup.email },
    delivery_address: { type: s.recipient_company ? "business" : "residential", company: s.recipient_company || "", street_address: [s.address_line_1, s.address_line_2].filter(Boolean).join(", "), local_area: s.suburb || "", city: s.city, zone: s.province, country: s.country_code, code: s.postal_code },
    delivery_contact: { name: s.recipient_name, mobile_number: s.recipient_phone, email: s.recipient_email || "" },
    parcels: Array.from({ length: s.parcel_count }, () => ({ parcel_description: s.contents_description || "Goods", submitted_length_cm: Number(s.length_cm), submitted_width_cm: Number(s.width_cm), submitted_height_cm: Number(s.height_cm), submitted_weight_kg: Number(s.total_weight_kg) / s.parcel_count })),
    customer_reference: s.shipment_number,
    customer_reference_name: "Nexus shipment",
    special_instructions_delivery: s.notes || "",
    mute_notifications: false,
  };
}
export function normaliseRates(data: unknown): Rate[] {
  const obj = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const rows = Array.isArray(data) ? data : Array.isArray(obj.rates) ? obj.rates : [];
  return rows.flatMap((row): Rate[] => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>; const service = r.service_level && typeof r.service_level === "object" ? r.service_level as Record<string, unknown> : {};
    const code = String(service.code || r.service_level_code || ""); const amount = Number(r.rate);
    if (!code || r.rate === null || r.rate === undefined || !Number.isFinite(amount) || amount < 0) return [];
    const id = Number(service.id || r.service_level_id);
    return [{ code, name: String(service.name || r.service_level_name || code), amount, ...(Number.isSafeInteger(id) && id > 0 ? { serviceId: id } : {}) }];
  });
}
const bases: Record<string, string> = { courier_guy: "https://api.portal.thecourierguy.co.za", shiplogic: "https://api.shiplogic.com" };
export async function courierRequest(provider: string, key: string, path: string, payload?: unknown) {
  const base = bases[provider]; if (!base) throw new ShippingError("This courier uses manual booking. API support requires a provider adapter.");
  return fetch(`${base}${path}`, { method: payload ? "POST" : "GET", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, ...(payload ? { body: JSON.stringify(payload) } : {}), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25000) });
}


export async function courierWaybillRequest(
  provider: string,
  key: string,
  shipmentId: string
) {
  const base = bases[provider];

  if (!base)
    throw new ShippingError(
      "This courier does not support waybill downloads through Nexus."
    );

  const cleanId = String(shipmentId).trim();

  if (!/^\d{1,20}$/.test(cleanId))
    throw new ShippingError("Invalid courier shipment reference.");

  return fetch(
    `${base}/generate/waybill/${encodeURIComponent(cleanId)}?api_key=${encodeURIComponent(key)}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
    }
  );
}
