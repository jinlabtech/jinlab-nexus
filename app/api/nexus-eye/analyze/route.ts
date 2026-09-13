import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

function getOutputText(response: any): string {
  if (typeof response?.output_text === "string") return response.output_text;

  for (const item of response?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return "";
}

export async function POST(request: NextRequest) {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!openaiKey) {
      return NextResponse.json(
        { error: "Nexus Eye AI is not configured." },
        { status: 503 }
      );
    }

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Supabase configuration is missing." },
        { status: 500 }
      );
    }

    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseKey,
        Authorization: authorization,
      },
      cache: "no-store",
    });

    if (!userResponse.ok) {
      return NextResponse.json({ error: "Invalid Nexus session." }, { status: 401 });
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

    const known = body?.known ?? {};
    const reportedFault =
      typeof body?.reportedFault === "string"
        ? body.reportedFault.trim().slice(0, 1000)
        : "";

    const context = {
      device_type: known.deviceType || null,
      brand: known.brand || null,
      model: known.model || null,
      serial_number: known.serialNumber || null,
      imei: known.imei || null,
      reported_fault: reportedFault || null,
    };

    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        store: false,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `You are Nexus Eye, an electronics repair visual intake assistant.

Analyse the supplied device photo for fast JINLAB job-card intake.

Current staff-entered context:
${JSON.stringify(context)}

Rules:
- Extract only identifiers actually visible or strongly supported.
- NEVER invent a serial number or IMEI.
- If serial or IMEI cannot be read, return null.
- Identify device type, brand, model and colour when reasonably supported.
- Architecture may be inferred only when the identified model strongly supports it; otherwise null.
- Describe visible physical condition only, not hidden faults.
- Diagnostic clues are basic technician suggestions based on the visible device plus reported fault; never present them as confirmed diagnoses.
- Keep diagnostics short, practical and safe.
- Do not provide dangerous mains-voltage or battery-puncture instructions.
- Prefer high-confidence autofill over speculation.
- detected_text should contain useful label text you can actually read.`,
              },
              {
                type: "input_image",
                image_url: imageDataUrl,
                detail: "high",
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "nexus_eye_device_analysis",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                device_type: { type: ["string", "null"] },
                brand: { type: ["string", "null"] },
                model: { type: ["string", "null"] },
                color: { type: ["string", "null"] },
                serial_number: { type: ["string", "null"] },
                imei: { type: ["string", "null"] },
                architecture: { type: ["string", "null"] },
                visible_condition: {
                  type: "array",
                  items: { type: "string" },
                },
                detected_text: {
                  type: "array",
                  items: { type: "string" },
                },
                diagnostic_clues: {
                  type: "array",
                  items: { type: "string" },
                },
                safety_notes: {
                  type: "array",
                  items: { type: "string" },
                },
                overall_confidence: {
                  type: "integer",
                  minimum: 0,
                  maximum: 100,
                },
                autofill_confident: { type: "boolean" },
                summary: { type: "string" },
              },
              required: [
                "device_type",
                "brand",
                "model",
                "color",
                "serial_number",
                "imei",
                "architecture",
                "visible_condition",
                "detected_text",
                "diagnostic_clues",
                "safety_notes",
                "overall_confidence",
                "autofill_confident",
                "summary"
              ],
            },
          },
        },
      }),
    });

    const aiData = await aiResponse.json();

    if (!aiResponse.ok) {
      console.error("Nexus Eye OpenAI error:", aiData?.error?.message);
      return NextResponse.json(
        { error: aiData?.error?.message || "Nexus Eye analysis failed." },
        { status: 502 }
      );
    }

    const outputText = getOutputText(aiData);

    if (!outputText) {
      return NextResponse.json(
        { error: "Nexus Eye returned no device analysis." },
        { status: 502 }
      );
    }

    const analysis = JSON.parse(outputText);

    return NextResponse.json({
      ok: true,
      engine: "nexus-eye-v1",
      analysis,
    });
  } catch (error) {
    console.error("Nexus Eye error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nexus Eye could not analyse the device.",
      },
      { status: 500 }
    );
  }
}
