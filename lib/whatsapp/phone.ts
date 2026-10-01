const MAX_BODY_LENGTH = 4096;

/** Accept explicit international numbers or South African local numbers. */
export function normalizePhone(value: string): string {
  if (typeof value !== "string" || value.length > 100) {
    throw new Error("Enter a valid WhatsApp phone number.");
  }
  const input = value.trim();
  // Reject letters/extensions instead of silently sending to a different number.
  if (!input || !/^[+0-9 ().-]+$/.test(input)) {
    throw new Error("Use a phone number without letters or an extension.");
  }
  let number = input.replace(/[ ().-]/g, "");
  const international = number.startsWith("+") || number.startsWith("00");
  if (number.startsWith("+")) number = number.slice(1);
  else if (number.startsWith("00")) number = number.slice(2);
  if (!international && number.startsWith("0")) {
    if (!/^0[1-9][0-9]{8}$/.test(number)) {
      throw new Error("South African local numbers must contain 10 digits.");
    }
    number = `27${number.slice(1)}`;
  }
  if (!/^[1-9][0-9]{7,14}$/.test(number)) {
    throw new Error("Use an international phone number with 8 to 15 digits.");
  }
  if (number.startsWith("27") && !/^27[1-9][0-9]{8}$/.test(number)) {
    throw new Error("South African numbers must be 27 followed by 9 digits.");
  }
  return number;
}


export function buildWhatsAppUrl(phone: string, message: string): string {
  const normalized = normalizePhone(phone);
  if (typeof message !== "string" || message.length > MAX_BODY_LENGTH) {
    throw new Error("WhatsApp message must be 4096 characters or fewer.");
  }
  return `https://wa.me/${normalized}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}
