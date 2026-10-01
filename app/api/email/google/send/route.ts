import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { OAuth2Client } from "google-auth-library";

import { decryptProviderToken } from "@/lib/email/tokenCrypto";

export const runtime = "nodejs";

type SendEmailRequest = {
  accountId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function normalizeAddresses(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const accessToken = authHeader.slice("Bearer ".length).trim();

    const body = (await request.json()) as Partial<SendEmailRequest>;

    const accountId = body.accountId?.trim();
    const subject = body.subject?.trim() ?? "";
    const bodyText = body.bodyText?.trim() ?? "";
    const bodyHtml = body.bodyHtml?.trim() || undefined;

    const to = normalizeAddresses(body.to);
    const cc = normalizeAddresses(body.cc);
    const bcc = normalizeAddresses(body.bcc);

    if (!accountId) {
      return NextResponse.json(
        { error: "Mailbox is required." },
        { status: 400 }
      );
    }

    if (to.length === 0) {
      return NextResponse.json(
        { error: "At least one recipient is required." },
        { status: 400 }
      );
    }

    if (!subject) {
      return NextResponse.json(
        { error: "Subject is required." },
        { status: 400 }
      );
    }

    if (!bodyText) {
      return NextResponse.json(
        { error: "Message body is required." },
        { status: 400 }
      );
    }

    if (subject.length > 998 || bodyText.length > 1_000_000) {
      return NextResponse.json(
        { error: "Email content exceeds Nexus limits." },
        { status: 400 }
      );
    }

    const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

    if (!supabaseAnonKey) {
      throw new Error("Missing Supabase public key.");
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Invalid Nexus session." },
        { status: 401 }
      );
    }

    const { data: hasEmailSendPermission, error: permissionError } =
      await userClient.rpc("current_user_has_permission", {
        requested_permission: "email.send",
      });

    if (permissionError) {
      throw new Error(`Permission check failed: ${permissionError.message}`);
    }

    if (hasEmailSendPermission !== true) {
      return NextResponse.json(
        { error: "You do not have permission to send email." },
        { status: 403 }
      );
    }

    const { data: hasMailboxSendAccess, error: mailboxAccessError } =
      await userClient.rpc("email_user_can_access_account", {
        p_account_id: accountId,
        p_required_level: "send",
      });

    if (mailboxAccessError) {
      throw new Error(
        `Mailbox access check failed: ${mailboxAccessError.message}`
      );
    }

    if (hasMailboxSendAccess !== true) {
      return NextResponse.json(
        { error: "You do not have send access to this mailbox." },
        { status: 403 }
      );
    }

    const serviceRoleKey =
      process.env.SUPABASE_SECRET_KEY?.trim() ||
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!serviceRoleKey) {
      throw new Error("Missing Supabase server credential.");
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: profile, error: profileError } = await admin
      .from("user_profile")
      .select("company_id")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile?.company_id) {
      return NextResponse.json(
        { error: "Nexus company profile not found." },
        { status: 403 }
      );
    }

    const companyId = profile.company_id;

    const { data: mailbox, error: mailboxError } = await admin
      .from("email_account")
      .select("id, company_id, email_address, display_name, active")
      .eq("id", accountId)
      .eq("company_id", companyId)
      .single();

    if (mailboxError || !mailbox) {
      return NextResponse.json(
        { error: "Mailbox not found." },
        { status: 404 }
      );
    }

    if (!mailbox.active) {
      return NextResponse.json(
        { error: "This mailbox is inactive." },
        { status: 409 }
      );
    }

    const { data: connection, error: connectionError } = await admin
      .from("email_provider_connection")
      .select(
        "id, company_id, account_id, provider, provider_account_id, provider_email, connection_status"
      )
      .eq("company_id", companyId)
      .eq("account_id", accountId)
      .eq("provider", "google")
      .single();

    if (
      connectionError ||
      !connection ||
      connection.connection_status !== "connected"
    ) {
      return NextResponse.json(
        { error: "Google Email is not connected for this mailbox." },
        { status: 409 }
      );
    }

    const mailboxEmail = mailbox.email_address.trim().toLowerCase();
    const providerEmail = connection.provider_email?.trim().toLowerCase();

    if (
      !connection.provider_account_id ||
      !providerEmail ||
      providerEmail !== mailboxEmail
    ) {
      return NextResponse.json(
        { error: "Google mailbox identity verification failed." },
        { status: 409 }
      );
    }

    const { data: vault, error: vaultError } = await admin
      .from("email_provider_token_vault")
      .select(
        "encrypted_refresh_token, encryption_iv, encryption_auth_tag"
      )
      .eq("company_id", companyId)
      .eq("connection_id", connection.id)
      .single();

    if (vaultError || !vault) {
      throw new Error("Google provider credential vault not found.");
    }

    const refreshToken = decryptProviderToken({
      ciphertext: vault.encrypted_refresh_token,
      iv: vault.encryption_iv,
      authTag: vault.encryption_auth_tag,
    });

    if (!refreshToken) {
      throw new Error("Unable to decrypt Google refresh credential.");
    }

    const googleClientId = requiredEnv("GOOGLE_EMAIL_CLIENT_ID");
    const googleClientSecret = requiredEnv("GOOGLE_EMAIL_CLIENT_SECRET");
    const googleRedirectUri = requiredEnv("GOOGLE_EMAIL_REDIRECT_URI");

    const googleOAuth = new OAuth2Client(
      googleClientId,
      googleClientSecret,
      googleRedirectUri
    );

    googleOAuth.setCredentials({
      refresh_token: refreshToken,
    });

    const accessTokenResponse = await googleOAuth.getAccessToken();
    const googleAccessToken = accessTokenResponse.token;

    if (!googleAccessToken) {
      throw new Error("Google did not issue an access token.");
    }

    const encodeHeader = (value: string) =>
      `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;

    const formatAddress = (email: string, name?: string | null) =>
      name?.trim()
        ? `${encodeHeader(name.trim())} <${email}>`
        : email;

    const mimeHeaders = [
      `From: ${formatAddress(mailboxEmail, mailbox.display_name)}`,
      `To: ${to.join(", ")}`,
      ...(cc.length ? [`Cc: ${cc.join(", ")}`] : []),
      ...(bcc.length ? [`Bcc: ${bcc.join(", ")}`] : []),
      `Subject: ${encodeHeader(subject)}`,
      "MIME-Version: 1.0",
      `Content-Type: ${bodyHtml ? "text/html" : "text/plain"}; charset=UTF-8`,
      "Content-Transfer-Encoding: base64",
    ];

    const messageBody = bodyHtml || bodyText;

    const mimeMessage = [
      ...mimeHeaders,
      "",
      Buffer.from(messageBody, "utf8").toString("base64"),
    ].join("\r\n");

    const rawMessage = Buffer.from(mimeMessage, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    const sendAttemptId = crypto.randomUUID();

    const { data: preparedSend, error: prepareError } =
      await userClient.rpc("email_prepare_google_send", {
        p_account_id: accountId,
        p_send_attempt_id: sendAttemptId,
        p_subject: subject,
        p_body_text: bodyText,
        p_body_html: bodyHtml ?? null,
        p_to: to,
        p_cc: cc,
        p_bcc: bcc,
      });

    if (prepareError || !preparedSend?.message_id) {
      console.error("Nexus email preparation failed:", {
        accountId,
        sendAttemptId,
        error: prepareError?.message ?? "No message ID returned",
      });

      return NextResponse.json(
        { error: "Nexus could not prepare this email for sending." },
        { status: 500 }
      );
    }

    const nexusMessageId = preparedSend.message_id as string;

    const { error: sendingError } = await userClient.rpc(
      "email_mark_google_send_sending",
      {
        p_message_id: nexusMessageId,
        p_send_attempt_id: sendAttemptId,
      }
    );

    if (sendingError) {
      console.error("Nexus could not mark email as sending:", {
        accountId,
        nexusMessageId,
        sendAttemptId,
        error: sendingError.message,
      });

      return NextResponse.json(
        { error: "Nexus could not start the email send." },
        { status: 500 }
      );
    }

    const gmailResponse = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          raw: rawMessage,
        }),
      }
    );

    const gmailResult = (await gmailResponse.json()) as {
      id?: string;
      threadId?: string;
      labelIds?: string[];
      error?: {
        code?: number;
        message?: string;
        status?: string;
      };
    };

    if (!gmailResponse.ok || !gmailResult.id) {
      const googleError =
        gmailResult.error?.message || "Google rejected the email.";

      const { error: failError } = await userClient.rpc(
        "email_fail_google_send",
        {
          p_message_id: nexusMessageId,
          p_send_attempt_id: sendAttemptId,
          p_error: googleError,
        }
      );

      if (failError) {
        console.error("Nexus failed to record Gmail send failure:", {
          nexusMessageId,
          sendAttemptId,
          error: failError.message,
        });
      }

      console.error("Gmail send failed:", {
        status: gmailResponse.status,
        error: googleError,
        accountId,
        nexusMessageId,
        sendAttemptId,
      });

      return NextResponse.json(
        { error: "Google was unable to send this email." },
        { status: 502 }
      );
    }

    const googleMessageId = gmailResult.id;
    const googleThreadId = gmailResult.threadId ?? null;

    const { data: finalizedSend, error: finalizeError } =
      await userClient.rpc("email_finalize_google_send", {
        p_message_id: nexusMessageId,
        p_send_attempt_id: sendAttemptId,
        p_provider_message_id: googleMessageId,
      });

    if (finalizeError) {
      console.error(
        "Gmail sent but Nexus finalization requires reconciliation:",
        {
          accountId,
          nexusMessageId,
          sendAttemptId,
          googleMessageId,
          error: finalizeError.message,
        }
      );

      return NextResponse.json(
        {
          success: false,
          sent: true,
          reconciliationRequired: true,
          error:
            "Email was sent by Google and is awaiting Nexus reconciliation. Do not resend it.",
          providerMessageId: googleMessageId,
          providerThreadId: googleThreadId,
          nexusMessageId,
          sendAttemptId,
        },
        { status: 202 }
      );
    }

    return NextResponse.json({
      success: true,
      sent: true,
      reconciliationRequired: false,
      provider: "google",
      providerMessageId: googleMessageId,
      providerThreadId: googleThreadId,
      nexusMessageId,
      sendAttemptId,
      nexus: finalizedSend,
    });
  } catch (error) {
    console.error(
      "Nexus Google send error:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return NextResponse.json(
      { error: "Unable to process email." },
      { status: 500 }
    );
  }
}
