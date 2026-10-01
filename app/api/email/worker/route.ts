import { NextRequest, NextResponse } from "next/server";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { OAuth2Client } from "google-auth-library";

import { decryptProviderToken } from "@/lib/email/tokenCrypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClaimedJob = {
  job_id: string;
  company_id: string;
  claim_token: string;
  attempt_id: string;
  attempt_no: number;
  email_account_id: string;
  recipient_address: string;
  recipient_display_name?: string | null;
  subject?: string | null;
  rendered_html?: string | null;
  rendered_text?: string | null;
  source_type: string;
  source_id?: string | null;
  purpose: string;
  variables?: Record<string, unknown>;
};

type ClaimResult = {
  ok?: boolean;
  claimed_count?: number;
  jobs?: ClaimedJob[];
};

type GmailResult = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

class WorkerDeliveryError extends Error {
  retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.name = "WorkerDeliveryError";
    this.retryable = retryable;
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new WorkerDeliveryError(
      `Missing required environment variable: ${name}`,
      false
    );
  }

  return value;
}

function createAdminClient() {
  const supabaseUrl = requiredEnv(
    "NEXT_PUBLIC_SUPABASE_URL"
  );

  const serviceRoleKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!serviceRoleKey) {
    throw new WorkerDeliveryError(
      "Missing Supabase server credential.",
      false
    );
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function workerSecret() {
  return (
    process.env.EMAIL_WORKER_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    ""
  );
}

function suppliedWorkerSecret(request: NextRequest) {
  const authorization =
    request.headers.get("authorization");

  const bearer =
    authorization?.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";

  const direct =
    request.headers
      .get("x-nexus-worker-secret")
      ?.trim() || "";

  return bearer || direct;
}

async function authorized(
  request: NextRequest,
  admin: SupabaseClient
) {
  const supplied =
    suppliedWorkerSecret(request);

  if (!supplied) {
    return false;
  }

  const localSecret =
    workerSecret();

  if (
    localSecret &&
    supplied === localSecret
  ) {
    return true;
  }

  const {
    data,
    error,
  } = await admin.rpc(
    "email_scheduler_verify_secret",
    {
      p_secret: supplied,
    }
  );

  if (error) {
    console.error(
      "Worker scheduler authentication failed:",
      error.message
    );

    return false;
  }

  return data === true;
}

function cleanHeaderValue(value: string) {
  return value
    .replace(/[\r\n]+/g, " ")
    .trim();
}

function cleanEmail(value: string) {
  return value
    .replace(/[\r\n]+/g, "")
    .trim()
    .toLowerCase();
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(
    cleanHeaderValue(value),
    "utf8"
  ).toString("base64")}?=`;
}

function formatAddress(
  email: string,
  name?: string | null
) {
  const safeEmail = cleanEmail(email);

  return name?.trim()
    ? `${encodeHeader(name.trim())} <${safeEmail}>`
    : safeEmail;
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function marketingUnsubscribeUrl(
  variables?: Record<string, unknown>
) {
  const raw = variables?.unsubscribe_url;

  if (typeof raw === "string") {
    try {
      const url = new URL(raw);

      if (
        url.protocol === "https:" ||
        url.protocol === "http:"
      ) {
        return url.toString();
      }
    } catch {
      // Fall through to token-based URL.
    }
  }

  const token = variables?.unsubscribe_token;

  if (
    typeof token !== "string" ||
    token.length < 32
  ) {
    return null;
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "https://nexus.jinlab.co.za";

  try {
    const url = new URL(
      "/api/email/unsubscribe",
      baseUrl
    );

    url.searchParams.set(
      "token",
      token
    );

    return url.toString();
  } catch {
    return null;
  }
}

function buildRawMessage(params: {
  fromEmail: string;
  fromName?: string | null;
  toEmail: string;
  toName?: string | null;
  subject: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  purpose: string;
  variables?: Record<string, unknown>;
}) {
  const {
    fromEmail,
    fromName,
    toEmail,
    toName,
    subject,
    bodyText,
    bodyHtml,
    purpose,
    variables,
  } = params;

  const html = bodyHtml?.trim() || "";
  const text = bodyText?.trim() || "";

  let messageBody = html || text;

  if (!messageBody) {
    throw new WorkerDeliveryError(
      "Queued email has no message body.",
      false
    );
  }

  const unsubscribeUrl =
    purpose === "marketing"
      ? marketingUnsubscribeUrl(variables)
      : null;

  if (
    purpose === "marketing" &&
    !unsubscribeUrl
  ) {
    throw new WorkerDeliveryError(
      "Marketing email is missing unsubscribe context.",
      false
    );
  }

  if (unsubscribeUrl) {
    if (html) {
      const safeUrl = unsubscribeUrl
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;");

      const hasPlaceholder =
        /\{\{\s*unsubscribe_url\s*\}\}/.test(
          messageBody
        );

      if (hasPlaceholder) {
        messageBody = messageBody.replace(
          /\{\{\s*unsubscribe_url\s*\}\}/g,
          safeUrl
        );
      } else {
        messageBody += `
          <div style="margin-top:32px;padding-top:18px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
            You are receiving this marketing email from JINLAB.
            <a href="${safeUrl}" style="color:#2563eb;">Unsubscribe</a>
          </div>
        `;
      }
    } else {
      const hasPlaceholder =
        /\{\{\s*unsubscribe_url\s*\}\}/.test(
          messageBody
        );

      if (hasPlaceholder) {
        messageBody = messageBody.replace(
          /\{\{\s*unsubscribe_url\s*\}\}/g,
          unsubscribeUrl
        );
      } else {
        messageBody +=
          `\n\nUnsubscribe from JINLAB marketing email:\n${unsubscribeUrl}`;
      }
    }
  }

  const headers = [
    `From: ${formatAddress(fromEmail, fromName)}`,
    `To: ${formatAddress(toEmail, toName)}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: ${
      html ? "text/html" : "text/plain"
    }; charset=UTF-8`,
    "Content-Transfer-Encoding: base64",

    ...(unsubscribeUrl
      ? [
          `List-Unsubscribe: <${unsubscribeUrl}>`,
          "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
        ]
      : []),
  ];

  const mimeMessage = [
    ...headers,
    "",
    Buffer.from(
      messageBody,
      "utf8"
    ).toString("base64"),
  ].join("\r\n");

  return base64Url(mimeMessage);
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unknown worker error.";
}

function looksTransient(message: string) {
  return /timeout|timed out|network|fetch failed|econnreset|econnrefused|etimedout|temporary|temporarily|rate limit|too many requests|429|502|503|504/i.test(
    message
  );
}

function gmailFailureRetryable(
  status: number,
  message: string
) {
  if (
    status === 408 ||
    status === 429 ||
    status >= 500
  ) {
    return true;
  }

  if (
    status === 403 &&
    /rate|quota|temporar/i.test(message)
  ) {
    return true;
  }

  return false;
}

async function pause(milliseconds: number) {
  await new Promise((resolve) =>
    setTimeout(resolve, milliseconds)
  );
}

async function getGoogleSession(
  admin: SupabaseClient,
  job: ClaimedJob
) {
  const {
    data: mailbox,
    error: mailboxError,
  } = await admin
    .from("email_account")
    .select(
      "id, company_id, email_address, display_name, active, provider"
    )
    .eq("company_id", job.company_id)
    .eq("id", job.email_account_id)
    .eq("active", true)
    .single();

  if (mailboxError || !mailbox) {
    throw new WorkerDeliveryError(
      "Active sending mailbox was not found.",
      false
    );
  }

  if (mailbox.provider !== "google") {
    throw new WorkerDeliveryError(
      `Unsupported email provider: ${mailbox.provider}`,
      false
    );
  }

  const {
    data: connection,
    error: connectionError,
  } = await admin
    .from("email_provider_connection")
    .select(
      "id, provider, connection_status, provider_email"
    )
    .eq("company_id", job.company_id)
    .eq("account_id", job.email_account_id)
    .eq("provider", "google")
    .eq("connection_status", "connected")
    .limit(1)
    .maybeSingle();

  if (
    connectionError ||
    !connection
  ) {
    throw new WorkerDeliveryError(
      "Connected Google provider account was not found.",
      false
    );
  }

  const {
    data: vault,
    error: vaultError,
  } = await admin
    .from("email_provider_token_vault")
    .select(
      "encrypted_refresh_token, encryption_iv, encryption_auth_tag"
    )
    .eq("company_id", job.company_id)
    .eq("connection_id", connection.id)
    .single();

  if (vaultError || !vault) {
    throw new WorkerDeliveryError(
      "Google provider credential vault was not found.",
      false
    );
  }

  let refreshToken: string;

  try {
    refreshToken = decryptProviderToken({
      ciphertext:
        vault.encrypted_refresh_token,
      iv: vault.encryption_iv,
      authTag:
        vault.encryption_auth_tag,
    });
  } catch {
    throw new WorkerDeliveryError(
      "Unable to decrypt Google refresh credential.",
      false
    );
  }

  if (!refreshToken) {
    throw new WorkerDeliveryError(
      "Google refresh credential is empty.",
      false
    );
  }

  const googleOAuth = new OAuth2Client(
    requiredEnv(
      "GOOGLE_EMAIL_CLIENT_ID"
    ),
    requiredEnv(
      "GOOGLE_EMAIL_CLIENT_SECRET"
    ),
    requiredEnv(
      "GOOGLE_EMAIL_REDIRECT_URI"
    )
  );

  googleOAuth.setCredentials({
    refresh_token: refreshToken,
  });

  try {
    const tokenResponse =
      await googleOAuth.getAccessToken();

    const accessToken =
      tokenResponse.token;

    if (!accessToken) {
      throw new Error(
        "Google did not issue an access token."
      );
    }

    return {
      mailbox,
      accessToken,
    };
  } catch (error) {
    const message = errorMessage(error);

    throw new WorkerDeliveryError(
      `Google access token refresh failed: ${message}`,
      looksTransient(message)
    );
  }
}

async function markFailed(
  admin: SupabaseClient,
  job: ClaimedJob,
  message: string,
  retryable: boolean,
  errorCode?: string | null,
  metadata: Record<string, unknown> = {}
) {
  const { error } = await admin.rpc(
    "email_worker_mark_failed",
    {
      p_job_id: job.job_id,
      p_claim_token: job.claim_token,
      p_attempt_id: job.attempt_id,
      p_error: message,
      p_retryable: retryable,
      p_error_code:
        errorCode || null,
      p_response_metadata:
        metadata,
    }
  );

  if (error) {
    console.error(
      "Nexus worker could not mark delivery failed:",
      {
        jobId: job.job_id,
        error: error.message,
      }
    );
  }
}

async function markUncertain(
  admin: SupabaseClient,
  job: ClaimedJob,
  message: string,
  metadata: Record<string, unknown> = {}
) {
  const { error } = await admin.rpc(
    "email_worker_mark_uncertain",
    {
      p_job_id: job.job_id,
      p_claim_token: job.claim_token,
      p_attempt_id: job.attempt_id,
      p_error: message,
      p_response_metadata:
        metadata,
    }
  );

  if (error) {
    console.error(
      "Nexus worker could not mark delivery uncertain:",
      {
        jobId: job.job_id,
        error: error.message,
      }
    );
  }
}

async function processJob(
  admin: SupabaseClient,
  job: ClaimedJob
): Promise<
  "sent" | "retry" | "failed" | "uncertain"
> {
  let sendingStarted = false;

  try {
    if (!job.email_account_id) {
      throw new WorkerDeliveryError(
        "Queued email does not have a sending mailbox.",
        false
      );
    }

    if (!job.recipient_address?.trim()) {
      throw new WorkerDeliveryError(
        "Queued email does not have a recipient.",
        false
      );
    }

    const subject =
      job.subject?.trim() || "";

    if (!subject) {
      throw new WorkerDeliveryError(
        "Queued email does not have a subject.",
        false
      );
    }

    const {
      mailbox,
      accessToken,
    } = await getGoogleSession(
      admin,
      job
    );

    const rawMessage =
      buildRawMessage({
        fromEmail:
          mailbox.email_address,
        fromName:
          mailbox.display_name,
        toEmail:
          job.recipient_address,
        toName:
          job.recipient_display_name,
        subject,
        bodyText:
          job.rendered_text,
        bodyHtml:
          job.rendered_html,
        purpose:
          job.purpose,
        variables:
          job.variables,
      });

    const {
      error: sendingError,
    } = await admin.rpc(
      "email_worker_mark_sending",
      {
        p_job_id: job.job_id,
        p_claim_token:
          job.claim_token,
        p_attempt_id:
          job.attempt_id,
      }
    );

    if (sendingError) {
      throw new WorkerDeliveryError(
        `Nexus could not mark delivery as sending: ${sendingError.message}`,
        true
      );
    }

    sendingStarted = true;

    let gmailResponse: Response;

    try {
      gmailResponse = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            raw: rawMessage,
          }),
        }
      );
    } catch (error) {
      const message =
        `Google delivery response was not received: ${errorMessage(
          error
        )}`;

      await markUncertain(
        admin,
        job,
        message,
        {
          stage:
            "gmail_request",
        }
      );

      return "uncertain";
    }

    const responseText =
      await gmailResponse.text();

    let gmailResult: GmailResult = {};

    try {
      gmailResult =
        responseText
          ? (JSON.parse(
              responseText
            ) as GmailResult)
          : {};
    } catch {
      if (gmailResponse.ok) {
        await markUncertain(
          admin,
          job,
          "Google accepted the HTTP request but returned an unreadable response.",
          {
            http_status:
              gmailResponse.status,
          }
        );

        return "uncertain";
      }
    }

    if (
      !gmailResponse.ok ||
      !gmailResult.id
    ) {
      const googleError =
        gmailResult.error?.message ||
        `Google rejected the email with HTTP ${gmailResponse.status}.`;

      const retryable =
        gmailFailureRetryable(
          gmailResponse.status,
          googleError
        );

      await markFailed(
        admin,
        job,
        googleError,
        retryable,
        gmailResult.error?.status ||
          String(
            gmailResponse.status
          ),
        {
          http_status:
            gmailResponse.status,
          google_status:
            gmailResult.error?.status ||
            null,
        }
      );

      return retryable
        ? "retry"
        : "failed";
    }

    const {
      error: sentError,
    } = await admin.rpc(
      "email_worker_mark_sent",
      {
        p_job_id:
          job.job_id,
        p_claim_token:
          job.claim_token,
        p_attempt_id:
          job.attempt_id,
        p_provider_message_id:
          gmailResult.id,
        p_provider_thread_id:
          gmailResult.threadId ||
          null,
        p_response_metadata: {
          label_ids:
            gmailResult.labelIds ||
            [],
          http_status:
            gmailResponse.status,
        },
      }
    );

    if (sentError) {
      await markUncertain(
        admin,
        job,
        `Google accepted the email but Nexus could not finalize the delivery record: ${sentError.message}`,
        {
          provider_message_id:
            gmailResult.id,
          provider_thread_id:
            gmailResult.threadId ||
            null,
        }
      );

      return "uncertain";
    }

    return "sent";
  } catch (error) {
    const message =
      errorMessage(error);

    const retryable =
      error instanceof
      WorkerDeliveryError
        ? error.retryable
        : looksTransient(message);

    if (sendingStarted) {
      await markUncertain(
        admin,
        job,
        message,
        {
          stage:
            "post_send_start",
        }
      );

      return "uncertain";
    }

    await markFailed(
      admin,
      job,
      message,
      retryable,
      null,
      {
        stage:
          "delivery_setup",
      }
    );

    return retryable
      ? "retry"
      : "failed";
  }
}

async function runWorker(
  request: NextRequest
) {
  try {
    const admin =
      createAdminClient();

    if (
      !(await authorized(
        request,
        admin
      ))
    ) {
      return NextResponse.json(
        {
          error:
            "Worker authentication failed.",
        },
        {
          status: 401,
        }
      );
    }

    const requestedLimit =
      Number(
        request.nextUrl.searchParams.get(
          "limit"
        ) || "4"
      );

    const limit =
      Number.isFinite(
        requestedLimit
      )
        ? Math.min(
            8,
            Math.max(
              1,
              Math.floor(
                requestedLimit
              )
            )
          )
        : 4;

    const {
      data: claimData,
      error: claimError,
    } = await admin.rpc(
      "email_worker_claim_due_jobs",
      {
        p_limit: limit,
        p_lease_seconds: 180,
      }
    );

    if (claimError) {
      console.error(
        "Email worker claim failed:",
        claimError.message
      );

      return NextResponse.json(
        {
          error:
            "Nexus could not claim queued email jobs.",
        },
        {
          status: 500,
        }
      );
    }

    const claim =
      (claimData ||
        {}) as ClaimResult;

    const jobs =
      Array.isArray(claim.jobs)
        ? claim.jobs
        : [];

    const summary = {
      claimed: jobs.length,
      sent: 0,
      retry: 0,
      failed: 0,
      uncertain: 0,
    };

    for (
      let index = 0;
      index < jobs.length;
      index += 1
    ) {
      const result =
        await processJob(
          admin,
          jobs[index]
        );

      summary[result] += 1;

      // Keep delivery deliberately controlled.
      // We do not burst all messages at Gmail at once.
      if (
        index <
        jobs.length - 1
      ) {
        await pause(500);
      }
    }

    return NextResponse.json({
      ok: true,
      ...summary,
    });
  } catch (error) {
    console.error(
      "Email worker fatal error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Email worker failed.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(
  request: NextRequest
) {
  return runWorker(request);
}

export async function GET(
  request: NextRequest
) {
  return runWorker(request);
}
