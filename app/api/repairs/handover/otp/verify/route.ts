import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type VerifyRequest = {
  otpId?: string;
  code?: string;
};

function requiredOtpPepper() {
  const value =
    process.env.REPAIR_HANDOVER_OTP_PEPPER?.trim();

  if (!value || value.length < 32) {
    throw new Error(
      "Repair OTP server secret is not configured."
    );
  }

  return value;
}

function otpDigest(code: string) {
  return createHmac(
    "sha256",
    requiredOtpPepper()
  )
    .update(code)
    .digest("hex");
}

async function authenticateNexus(
  request: Request
) {
  const authHeader =
    request.headers.get("authorization");

  if (
    !authHeader?.startsWith("Bearer ") ||
    authHeader.length > 10_000
  ) {
    throw Object.assign(
      new Error("Authentication required."),
      { status: 401 }
    );
  }

  const token =
    authHeader.slice(7).trim();

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !key) {
    throw new Error(
      "Nexus Supabase configuration is incomplete."
    );
  }

  const db = createClient(
    url,
    key,
    {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  const {
    data: { user },
    error,
  } = await db.auth.getUser(token);

  if (error || !user) {
    throw Object.assign(
      new Error(
        "Your Nexus session has expired."
      ),
      { status: 401 }
    );
  }

  const {
    data: allowed,
    error: permissionError,
  } = await db.rpc(
    "current_user_has_permission",
    {
      requested_permission:
        "repair.intake.confirm",
    }
  );

  if (permissionError) {
    throw new Error(
      `Permission check failed: ${permissionError.message}`
    );
  }

  if (allowed !== true) {
    throw Object.assign(
      new Error(
        "You do not have permission to confirm repair intake."
      ),
      { status: 403 }
    );
  }

  const {
    data: companyId,
    error: companyError,
  } = await db.rpc(
    "current_company_id"
  );

  if (
    companyError ||
    typeof companyId !== "string" ||
    !UUID.test(companyId)
  ) {
    throw Object.assign(
      new Error(
        "Your Nexus company access could not be verified."
      ),
      { status: 403 }
    );
  }

  return {
    user,
    companyId,
  };
}

export async function POST(
  request: Request
) {
  try {
    const {
      user,
      companyId,
    } = await authenticateNexus(
      request
    );

    const input =
      (await request.json()) as VerifyRequest;

    const otpId =
      input.otpId?.trim() ?? "";

    const code =
      input.code?.trim() ?? "";

    if (!UUID.test(otpId)) {
      return NextResponse.json(
        {
          error:
            "OTP verification reference is invalid.",
        },
        { status: 400 }
      );
    }

    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        {
          error:
            "Enter the 6-digit verification code.",
        },
        { status: 400 }
      );
    }

    const {
      data: otp,
      error: otpLookupError,
    } = await supabaseAdmin
      .from("repair_handover_otp")
      .select(
        "id,company_id,handover_id,channel,destination,status"
      )
      .eq("id", otpId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (otpLookupError) {
      throw new Error(
        `OTP lookup failed: ${otpLookupError.message}`
      );
    }

    if (!otp) {
      return NextResponse.json(
        {
          error:
            "Verification code request could not be found.",
        },
        { status: 404 }
      );
    }

    const hash =
      otpDigest(code);

    const {
      data: verifyResult,
      error: verifyError,
    } = await supabaseAdmin.rpc(
      "repair_verify_handover_otp",
      {
        p_otp_id:
          otpId,
        p_actor_user_id:
          user.id,
        p_otp_hash:
          hash,
      }
    );

    if (verifyError) {
      throw new Error(
        `OTP verification failed: ${verifyError.message}`
      );
    }

    const result =
      verifyResult as {
        ok?: boolean;
        code?: string;
        attempts_remaining?: number;
        already_verified?: boolean;
      } | null;

    if (result?.ok !== true) {
      let message =
        "The verification code is incorrect.";

      let status = 400;

      if (
        result?.code === "expired"
      ) {
        message =
          "This verification code has expired. Request a new code.";
        status = 410;
      }

      if (
        result?.code ===
        "too_many_attempts"
      ) {
        message =
          "Too many incorrect attempts. Request a new verification code.";
        status = 429;
      }

      if (
        result?.code ===
        "otp_not_active"
      ) {
        message =
          "This verification code is no longer active.";
        status = 409;
      }

      if (
        result?.code ===
        "handover_not_waiting"
      ) {
        message =
          "This repair handover is no longer waiting for OTP verification.";
        status = 409;
      }

      return NextResponse.json(
        {
          error:
            message,
          attemptsRemaining:
            result?.attempts_remaining ??
            null,
        },
        { status }
      );
    }

    const {
      data: finalized,
      error: finalizeError,
    } = await supabaseAdmin.rpc(
      "repair_finalize_verified_handover",
      {
        p_handover_id:
          otp.handover_id,
        p_verified_by:
          user.id,
        p_channel:
          otp.channel,
        p_reference:
          otp.id,
        p_destination_masked:
          null,
      }
    );

    if (finalizeError) {
      throw new Error(
        `Handover finalisation failed: ${finalizeError.message}`
      );
    }

    const finalResult =
      finalized as {
        ok?: boolean;
        handover_id?: string;
        job_number?: string;
        verified_at?: string;
        receipt_number?: string;
        already_verified?: boolean;
      } | null;

    if (finalResult?.ok !== true) {
      throw new Error(
        "Nexus could not finalise the repair handover."
      );
    }

    return NextResponse.json({
      ok: true,
      handoverId:
        finalResult.handover_id ??
        otp.handover_id,
      jobNumber:
        finalResult.job_number ??
        null,
      receiptNumber:
        finalResult.receipt_number ??
        null,
      verifiedAt:
        finalResult.verified_at ??
        null,
      channel:
        otp.channel,
      alreadyVerified:
        finalResult.already_verified ??
        false,
    });
  } catch (error) {
    console.error(
      "Repair handover OTP verify error:",
      error
    );

    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof (
        error as {
          status?: unknown;
        }
      ).status === "number"
        ? (
            error as {
              status: number;
            }
          ).status
        : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nexus could not verify the repair handover.",
      },
      { status }
    );
  }
}
