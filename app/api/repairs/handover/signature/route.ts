import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_SIGNATURE_BYTES = 1_048_576;

type SignatureRequest = {
  handoverId?: string;
  imageDataUrl?: string;
};

function isPng(data: Buffer) {
  return (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  );
}

function isWebp(data: Buffer) {
  return (
    data.length >= 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

export async function POST(request: Request) {
  let uploadedPath: string | null = null;

  try {
    const authHeader = request.headers.get("authorization");

    if (
      !authHeader?.startsWith("Bearer ") ||
      authHeader.length > 10_000
    ) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const accessToken = authHeader.slice(7).trim();

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

    const supabasePublicKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

    if (!supabaseUrl || !supabasePublicKey) {
      throw new Error(
        "Nexus Supabase server configuration is incomplete."
      );
    }

    const userClient = createClient(
      supabaseUrl,
      supabasePublicKey,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Your Nexus session has expired." },
        { status: 401 }
      );
    }

    const {
      data: canConfirmIntake,
      error: permissionError,
    } = await userClient.rpc(
      "current_user_has_permission",
      {
        requested_permission: "repair.intake.confirm",
      }
    );

    if (permissionError) {
      throw new Error(
        `Permission check failed: ${permissionError.message}`
      );
    }

    if (canConfirmIntake !== true) {
      return NextResponse.json(
        {
          error:
            "You do not have permission to confirm repair intake.",
        },
        { status: 403 }
      );
    }

    const {
      data: companyId,
      error: companyError,
    } = await userClient.rpc("current_company_id");

    if (
      companyError ||
      typeof companyId !== "string" ||
      !UUID.test(companyId)
    ) {
      return NextResponse.json(
        {
          error:
            "Your Nexus company access could not be verified.",
        },
        { status: 403 }
      );
    }

    const input =
      (await request.json()) as SignatureRequest;

    const handoverId =
      input.handoverId?.trim() ?? "";

    if (!UUID.test(handoverId)) {
      return NextResponse.json(
        { error: "Repair handover reference is invalid." },
        { status: 400 }
      );
    }

    const imageDataUrl =
      input.imageDataUrl?.trim() ?? "";

    if (
      !imageDataUrl ||
      imageDataUrl.length > 1_500_000
    ) {
      return NextResponse.json(
        { error: "Customer signature is required." },
        { status: 400 }
      );
    }

    const match =
      /^data:image\/(png|webp);base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(
        imageDataUrl
      );

    if (!match) {
      return NextResponse.json(
        {
          error:
            "Signature must be a PNG or WebP image.",
        },
        { status: 400 }
      );
    }

    const requestedType =
      match[1].toLowerCase();

    let signature: Buffer;

    try {
      signature = Buffer.from(
        match[2].replace(/\s/g, ""),
        "base64"
      );
    } catch {
      return NextResponse.json(
        { error: "Signature image is invalid." },
        { status: 400 }
      );
    }

    if (
      signature.length === 0 ||
      signature.length > MAX_SIGNATURE_BYTES
    ) {
      return NextResponse.json(
        {
          error:
            "Signature image must be smaller than 1 MB.",
        },
        { status: 400 }
      );
    }

    const actualType =
      isPng(signature)
        ? "png"
        : isWebp(signature)
          ? "webp"
          : null;

    if (
      !actualType ||
      actualType !== requestedType
    ) {
      return NextResponse.json(
        {
          error:
            "Signature image format could not be verified.",
        },
        { status: 400 }
      );
    }

    const {
      data: handover,
      error: handoverError,
    } = await supabaseAdmin
      .from("repair_handover")
      .select(
        "id,company_id,handover_type,status"
      )
      .eq("id", handoverId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (handoverError) {
      throw new Error(
        `Handover lookup failed: ${handoverError.message}`
      );
    }

    if (!handover) {
      return NextResponse.json(
        {
          error:
            "Repair handover could not be found.",
        },
        { status: 404 }
      );
    }

    if (handover.handover_type !== "intake") {
      return NextResponse.json(
        {
          error:
            "This is not a repair intake handover.",
        },
        { status: 409 }
      );
    }

    if (handover.status === "verified") {
      return NextResponse.json({
        ok: true,
        alreadyVerified: true,
        status: "verified",
      });
    }

    if (
      ![
        "draft",
        "awaiting_signature",
        "awaiting_otp",
      ].includes(handover.status)
    ) {
      return NextResponse.json(
        {
          error:
            "This repair handover cannot accept a signature.",
        },
        { status: 409 }
      );
    }

    const digest = createHash("sha256")
      .update(signature)
      .digest("hex");

    uploadedPath =
      `${companyId}/${handoverId}/` +
      `signature-${randomUUID()}.${actualType}`;

    const {
      error: uploadError,
    } = await supabaseAdmin.storage
      .from("repair-signatures")
      .upload(
        uploadedPath,
        signature,
        {
          contentType:
            actualType === "png"
              ? "image/png"
              : "image/webp",
          cacheControl: "3600",
          upsert: false,
        }
      );

    if (uploadError) {
      throw new Error(
        `Signature upload failed: ${uploadError.message}`
      );
    }

    const {
      data: result,
      error: recordError,
    } = await supabaseAdmin.rpc(
      "repair_record_handover_signature_server",
      {
        p_handover_id: handoverId,
        p_actor_user_id: user.id,
        p_signature_storage_path:
          uploadedPath,
        p_signature_sha256: digest,
      }
    );

    if (recordError) {
      await supabaseAdmin.storage
        .from("repair-signatures")
        .remove([uploadedPath]);

      uploadedPath = null;

      throw new Error(
        `Signature record failed: ${recordError.message}`
      );
    }

    return NextResponse.json({
      ok: true,
      handoverId,
      status: "awaiting_otp",
      signatureSha256: digest,
      result,
    });
  } catch (error) {
    if (uploadedPath) {
      try {
        await supabaseAdmin.storage
          .from("repair-signatures")
          .remove([uploadedPath]);
      } catch {
        // Best-effort cleanup only.
      }
    }

    console.error(
      "Repair handover signature error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nexus could not save the customer signature.",
      },
      { status: 500 }
    );
  }
}
