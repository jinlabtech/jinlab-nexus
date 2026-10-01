import {
  createHmac,
  randomInt,
} from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type OtpChannel =
  | "sms"
  | "email"
  | "whatsapp";

type SendOtpRequest = {
  handoverId?: string;
  channel?: OtpChannel;
};

type HandoverRow = {
  id: string;
  company_id: string;
  status: string;
  job_number_snapshot: string;
  customer_name_snapshot: string;
  customer_phone_snapshot: string | null;
  customer_email_snapshot: string | null;
  signature_storage_path: string | null;
  signature_sha256: string | null;
  signed_at: string | null;
  terms_accepted_at: string | null;
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

function maskDestination(
  channel: OtpChannel,
  destination: string
) {
  if (channel === "email") {
    const [local, domain] =
      destination.split("@");

    if (!domain) return "***";

    return (
      `${local.slice(0, 2)}***@${domain}`
    );
  }

  const digits =
    destination.replace(/\D/g, "");

  return `***${digits.slice(-4)}`;
}

function normalizeEmail(value: string | null) {
  const email =
    value?.trim().toLowerCase() ?? "";

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  ) {
    throw new Error(
      "This customer does not have a valid email address."
    );
  }

  return email;
}

function normalizePhone(value: string | null) {
  let raw =
    value?.trim() ?? "";

  if (!raw) {
    throw new Error(
      "This customer does not have a mobile number."
    );
  }

  raw = raw.replace(/[^\d+]/g, "");

  let digits: string;

  if (raw.startsWith("+")) {
    digits = raw.slice(1);
  } else if (raw.startsWith("00")) {
    digits = raw.slice(2);
  } else {
    digits = raw;
  }

  // South African local mobile format:
  // 08x xxx xxxx -> 278x xxx xxxx
  if (/^0\d{9}$/.test(digits)) {
    digits =
      `27${digits.slice(1)}`;
  }

  if (!/^\d{8,15}$/.test(digits)) {
    throw new Error(
      "Customer mobile number is not valid for SMS delivery."
    );
  }

  return digits;
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

  const accessToken =
    authHeader.slice(7).trim();

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  const key =
    process.env
      .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ?.trim() ||
    process.env
      .NEXT_PUBLIC_SUPABASE_ANON_KEY
      ?.trim();

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
  } = await db.auth.getUser(accessToken);

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
    authHeader,
  };
}

async function sendSmsPortal(
  destination: string,
  message: string
) {
  const clientId =
    process.env
      .SMSPORTAL_CLIENT_ID
      ?.trim();

  const clientSecret =
    process.env
      .SMSPORTAL_CLIENT_SECRET
      ?.trim();

  if (
    !clientId ||
    !clientSecret
  ) {
    throw Object.assign(
      new Error(
        "SMS is not configured yet. Add the SMSPortal credentials to Nexus."
      ),
      { status: 503 }
    );
  }

  const basic =
    Buffer.from(
      `${clientId}:${clientSecret}`,
      "utf8"
    ).toString("base64");

  const testMode =
    process.env
      .SMSPORTAL_TEST_MODE
      ?.trim()
      .toLowerCase() === "true";

  const response =
    await fetch(
      "https://rest.smsportal.com/v3/BulkMessages",
      {
        method: "POST",
        headers: {
          Authorization:
            `Basic ${basic}`,
          Accept:
            "application/json",
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              content: message,
              destination,
            },
          ],
          sendOptions: {
            testMode,
          },
        }),
        cache: "no-store",
        signal:
          AbortSignal.timeout(20_000),
      }
    );

  let result: unknown = null;

  try {
    result =
      await response.json();
  } catch {
    result = null;
  }

  if (!response.ok) {
    console.error(
      "SMSPortal OTP delivery failed:",
      {
        status:
          response.status,
        result,
      }
    );

    throw new Error(
      `SMS provider rejected the message (${response.status}).`
    );
  }

  return {
    providerMessageId: null,
    testMode,
  };
}

async function sendEmail(
  request: Request,
  authHeader: string,
  companyId: string,
  destination: string,
  jobNumber: string,
  code: string
) {
  const transactionalKey=process.env.RESEND_API_KEY?.trim();
  const from=process.env.REPAIR_OTP_FROM_EMAIL?.trim();
  if(transactionalKey && from){
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${transactionalKey}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[destination],subject:`Repair verification · ${jobNumber}`,text:`Your repair handover verification code is ${code}. It expires in 5 minutes. Job: ${jobNumber}.`}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(20000)});
    const result=await response.json().catch(()=>null);
    if(!response.ok||!result?.id)throw Object.assign(new Error("Transactional email could not be delivered. Try SMS or use audited in-person verification with the customer present."),{status:502});
    return {providerMessageId:String(result.id)};
  }
  const {
    data: mailbox,
    error: mailboxError,
  } = await supabaseAdmin
    .from("email_account")
    .select("id")
    .eq(
      "company_id",
      companyId
    )
    .eq(
      "active",
      true
    )
    .order(
      "created_at",
      { ascending: true }
    )
    .limit(1)
    .maybeSingle();

  if (
    mailboxError ||
    !mailbox?.id
  ) {
    throw Object.assign(
      new Error(
        "No active Nexus email mailbox is available."
      ),
      { status: 503 }
    );
  }

  const emailUrl =
    new URL(
      "/api/email/google/send",
      request.url
    );

  const response =
    await fetch(
      emailUrl,
      {
        method: "POST",
        headers: {
          Authorization:
            authHeader,
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          accountId:
            mailbox.id,
          to: [
            destination,
          ],
          cc: [],
          bcc: [],
          subject:
            `JINLAB Repair Verification · ${jobNumber}`,
          bodyText:
            [
              "JINLAB Nexus Repair Verification",
              "",
              `Your verification code is: ${code}`,
              "",
              "This code expires in 5 minutes.",
              "Do not share this code with anyone outside the JINLAB repair handover process.",
              "",
              `Job Card: ${jobNumber}`,
            ].join("\n"),
        }),
        cache: "no-store",
        signal:
          AbortSignal.timeout(
            30_000
          ),
      }
    );

  let result:
    | Record<
        string,
        unknown
      >
    | null = null;

  try {
    result =
      (await response.json()) as Record<
        string,
        unknown
      >;
  } catch {
    result = null;
  }

  if (!response.ok) {

    throw Object.assign(
      new Error(
        "Email verification is unavailable. Ask an administrator to check the connected mailbox or transactional email sender. If the customer is at the counter, use audited in-person verification."
      ),
      {
        status:
          response.status >= 400 &&
          response.status < 600
            ? response.status
            : 502,
      }
    );
  }

  const providerMessageId =
    typeof result?.googleMessageId ===
    "string"
      ? result.googleMessageId
      : typeof result?.messageId ===
          "string"
        ? result.messageId
        : null;

  return {
    providerMessageId,
  };
}

export async function POST(
  request: Request
) {
  let otpId: string | null =
    null;

  try {
    const {
      user,
      companyId,
      authHeader,
    } =
      await authenticateNexus(
        request
      );

    const input =
      (await request.json()) as SendOtpRequest;

    const handoverId =
      input.handoverId?.trim() ??
      "";

    if (
      !UUID.test(
        handoverId
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Repair handover reference is invalid.",
        },
        { status: 400 }
      );
    }

    const channel =
      input.channel;

    if (
      channel !== "sms" &&
      channel !== "email" &&
      channel !== "whatsapp"
    ) {
      return NextResponse.json(
        {
          error:
            "Choose SMS, WhatsApp or email verification.",
        },
        { status: 400 }
      );
    }

    const {
      data,
      error:
        handoverError,
    } =
      await supabaseAdmin
        .from(
          "repair_handover"
        )
        .select(
          [
            "id",
            "company_id",
            "status",
            "job_number_snapshot",
            "customer_name_snapshot",
            "customer_phone_snapshot",
            "customer_email_snapshot",
            "signature_storage_path",
            "signature_sha256",
            "signed_at",
            "terms_accepted_at",
          ].join(",")
        )
        .eq(
          "id",
          handoverId
        )
        .eq(
          "company_id",
          companyId
        )
        .maybeSingle();

    if (
      handoverError
    ) {
      throw new Error(
        `Handover lookup failed: ${handoverError.message}`
      );
    }

    const handover =
      data as unknown as
        | HandoverRow
        | null;

    if (!handover) {
      return NextResponse.json(
        {
          error:
            "Repair handover could not be found.",
        },
        { status: 404 }
      );
    }

    if (
      handover.status ===
      "verified"
    ) {
      return NextResponse.json({
        ok: true,
        alreadyVerified: true,
        status: "verified",
      });
    }

    if (
      handover.status !==
        "awaiting_otp" ||
      !handover
        .signature_storage_path ||
      !handover
        .signature_sha256 ||
      !handover.signed_at ||
      !handover
        .terms_accepted_at
    ) {
      return NextResponse.json(
        {
          error:
            "Customer must accept the terms and sign before OTP verification.",
        },
        { status: 409 }
      );
    }

    let destination:
      string;

    if (
      channel === "email"
    ) {
      destination =
        normalizeEmail(
          handover
            .customer_email_snapshot
        );
    } else {
      destination =
        normalizePhone(
          handover
            .customer_phone_snapshot
        );
    }

    if (
      channel ===
      "whatsapp"
    ) {
      return NextResponse.json(
        {
          error:
            "WhatsApp OTP templates are not configured yet. Use SMS or email for this handover.",
        },
        { status: 503 }
      );
    }

    if (
      channel === "sms" &&
      (!process.env
        .SMSPORTAL_CLIENT_ID
        ?.trim() ||
        !process.env
          .SMSPORTAL_CLIENT_SECRET
          ?.trim())
    ) {
      return NextResponse.json(
        {
          error:
            "SMS is not configured yet. Connect SMSPortal to Nexus first.",
        },
        { status: 503 }
      );
    }

    const code =
      randomInt(
        100000,
        1000000
      ).toString();

    const hash =
      otpDigest(code);

    const expiresAt =
      new Date(
        Date.now() +
          5 * 60 * 1000
      ).toISOString();

    const {
      data:
        issuedRaw,
      error:
        issueError,
    } =
      await supabaseAdmin.rpc(
        "repair_issue_handover_otp",
        {
          p_handover_id:
            handoverId,
          p_actor_user_id:
            user.id,
          p_channel:
            channel,
          p_destination:
            destination,
          p_otp_hash:
            hash,
          p_expires_at:
            expiresAt,
        }
      );

    if (issueError) {
      const status =
        issueError.message.includes(
          "wait 60 seconds"
        ) ||
        issueError.message.includes(
          "Too many OTP"
        )
          ? 429
          : 409;

      return NextResponse.json(
        {
          error:
            issueError.message,
        },
        { status }
      );
    }

    const issued =
      issuedRaw as {
        otp_id?: string;
      } | null;

    if (
      !issued?.otp_id ||
      !UUID.test(
        issued.otp_id
      )
    ) {
      throw new Error(
        "Nexus could not create the OTP challenge."
      );
    }

    otpId =
      issued.otp_id;

    const message =
      `JINLAB Nexus verification code: ${code}. ` +
      `Job ${handover.job_number_snapshot}. ` +
      "Expires in 5 minutes. Do not share this code.";

    let providerMessageId:
      string | null =
      null;

    try {
      if (
        channel === "sms"
      ) {
        const result =
          await sendSmsPortal(
            destination,
            message
          );

        providerMessageId =
          result.providerMessageId;
      } else {
        const result =
          await sendEmail(
            request,
            authHeader,
            companyId,
            destination,
            handover
              .job_number_snapshot,
            code
          );

        providerMessageId =
          result.providerMessageId;
      }

      const {
        error:
          deliveryError,
      } =
        await supabaseAdmin.rpc(
          "repair_mark_handover_otp_delivery",
          {
            p_otp_id:
              otpId,
            p_success:
              true,
            p_provider_message_id:
              providerMessageId,
            p_error:
              null,
          }
        );

      if (
        deliveryError
      ) {
        throw new Error(
          `OTP delivery status could not be recorded: ${deliveryError.message}`
        );
      }
    } catch (deliveryFailure) {
      const reason =
        deliveryFailure instanceof
        Error
          ? deliveryFailure.message
          : "OTP delivery failed.";

      await supabaseAdmin.rpc(
        "repair_mark_handover_otp_delivery",
        {
          p_otp_id:
            otpId,
          p_success:
            false,
          p_provider_message_id:
            null,
          p_error:
            reason,
        }
      );

      const status =
        typeof deliveryFailure ===
          "object" &&
        deliveryFailure !== null &&
        "status" in
          deliveryFailure &&
        typeof (
          deliveryFailure as {
            status?: unknown;
          }
        ).status ===
          "number"
          ? (
              deliveryFailure as {
                status: number;
              }
            ).status
          : 502;

      return NextResponse.json(
        {
          error:
            reason,
        },
        { status }
      );
    }

    return NextResponse.json({
      ok: true,
      otpId,
      channel,
      destinationMasked:
        maskDestination(
          channel,
          destination
        ),
      expiresAt,
      attemptsAllowed: 5,
    });
  } catch (error) {
    console.error(
      "Repair handover OTP send error:",
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
            : "Nexus could not send the repair verification code.",
      },
      { status }
    );
  }
}
