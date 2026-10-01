import { NextRequest, NextResponse } from "next/server";
import { createWorker } from "tesseract.js";

export const runtime = "nodejs";
export const maxDuration = 60;

type NexusEyeReading = {
  device_type: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  imei: string | null;
  detected_text: string[];
  raw_text: string;
  overall_confidence: number;
  autofill_confident: boolean;
  summary: string;
};

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return clean(match[1]);
    }
  }

  return null;
}

function detectBrand(text: string) {
  const brands = [
    "Apple",
    "Samsung",
    "Huawei",
    "Honor",
    "Xiaomi",
    "Redmi",
    "Oppo",
    "Vivo",
    "Nokia",
    "Motorola",
    "Lenovo",
    "Dell",
    "HP",
    "Asus",
    "Acer",
    "Microsoft",
    "Sony",
    "LG",
    "Hisense",
    "Tecno",
    "Infinix",
    "Realme",
  ];

  const lower = text.toLowerCase();

  return brands.find((brand) => lower.includes(brand.toLowerCase())) ?? null;
}

function detectDeviceType(text: string) {
  const lower = text.toLowerCase();

  if (/\b(iphone|smartphone|mobile phone|cellphone)\b/.test(lower)) {
    return "Phone";
  }

  if (/\b(ipad|tablet)\b/.test(lower)) {
    return "Tablet";
  }

  if (/\b(macbook|notebook|laptop)\b/.test(lower)) {
    return "Laptop";
  }

  if (/\b(desktop|computer|pc)\b/.test(lower)) {
    return "Computer";
  }

  if (/\b(printer)\b/.test(lower)) {
    return "Printer";
  }

  if (/\b(router|modem)\b/.test(lower)) {
    return "Router";
  }

  return null;
}

function parseReading(rawText: string, confidence: number): NexusEyeReading {
  const text = rawText.replace(/\r/g, "\n");

  const lines = text
    .split("\n")
    .map(clean)
    .filter((line) => line.length >= 2);

  const detectedText = Array.from(new Set(lines)).slice(0, 40);

  const imei = firstMatch(text, [
    /\bIMEI(?:\s*[12])?\s*[:#-]?\s*([0-9][0-9\s-]{13,20}[0-9])\b/i,
  ]);

  const normalizedImei = imei
    ? imei.replace(/[\s-]/g, "").match(/^\d{15}$/)?.[0] ?? null
    : null;

  const serialNumber = firstMatch(text, [
    /\b(?:serial(?:\s*number)?|s\/n|sn)\s*[:#-]?\s*([A-Z0-9-]{5,30})\b/i,
  ]);

  const model = firstMatch(text, [
    /\bmodel(?:\s*(?:name|number|no\.?))?\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,30})\b/i,
    /\b(?:SM-[A-Z0-9-]{4,20})\b/i,
  ]);

  const brand = detectBrand(text);
  const deviceType = detectDeviceType(text);

  const usefulFields = [
    brand,
    model,
    serialNumber,
    normalizedImei,
    deviceType,
  ].filter(Boolean).length;

  const safeConfidence = Math.max(
    0,
    Math.min(100, Math.round(Number.isFinite(confidence) ? confidence : 0))
  );

  return {
    device_type: deviceType,
    brand,
    model,
    serial_number: serialNumber,
    imei: normalizedImei,
    detected_text: detectedText,
    raw_text: rawText.trim(),
    overall_confidence: safeConfidence,
    autofill_confident: safeConfidence >= 80 && usefulFields >= 2,
    summary:
      detectedText.length > 0
        ? `Nexus Eye read ${detectedText.length} visible text line${
            detectedText.length === 1 ? "" : "s"
          }. Review extracted details before saving.`
        : "Nexus Eye could not clearly read text from this image.",
  };
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase configuration is missing." },
        { status: 500 }
      );
    }

    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseKey,
        Authorization: authorization,
      },
      cache: "no-store",
    });

    if (!userResponse.ok) {
      return NextResponse.json(
        { error: "Invalid Nexus session." },
        { status: 401 }
      );
    }

    const permissionResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/current_user_has_permission`,
      {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requested_permission: "repair.view",
        }),
        cache: "no-store",
      }
    );

    const allowed = permissionResponse.ok
      ? await permissionResponse.json()
      : false;

    if (allowed !== true) {
      return NextResponse.json(
        { error: "Permission denied: repair.view" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const imageDataUrl =
      typeof body?.imageDataUrl === "string" ? body.imageDataUrl : "";

    if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(imageDataUrl)) {
      return NextResponse.json(
        { error: "A valid JPEG, PNG or WebP image is required." },
        { status: 400 }
      );
    }

    if (imageDataUrl.length > 5_500_000) {
      return NextResponse.json(
        { error: "Image is too large. Capture a closer photo." },
        { status: 413 }
      );
    }

    const base64 = imageDataUrl.replace(
      /^data:image\/(jpeg|jpg|png|webp);base64,/i,
      ""
    );

    const imageBuffer = Buffer.from(base64, "base64");

    if (imageBuffer.length === 0) {
      return NextResponse.json(
        { error: "Nexus Eye received an empty image." },
        { status: 400 }
      );
    }

    const worker = await createWorker("eng");

    try {
      const result = await worker.recognize(imageBuffer);

      const analysis = parseReading(
        result.data.text ?? "",
        result.data.confidence ?? 0
      );

      return NextResponse.json({
        ok: true,
        engine: "nexus-eye-local-ocr-v1",
        analysis,
      });
    } finally {
      await worker.terminate();
    }
  } catch (error) {
    console.error("Nexus Eye local OCR error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nexus Eye could not read this image.",
      },
      { status: 500 }
    );
  }
}
