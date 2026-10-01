import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { OAuth2Client } from "google-auth-library";

import { encryptProviderToken } from "@/lib/email/tokenCrypto";

export const runtime = "nodejs";

const googleOAuthClient = new OAuth2Client();

const GMAIL_SEND_SCOPE =
  "https://www.googleapis.com/auth/gmail.send";

type OAuthState = {
  nonce: string;
  userId: string;
  companyId: string;
  accountId: string;
  issuedAt: number;
};

type GoogleTokenResponse = {
  access_token?: string;
  id_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function verifyState(state: string): OAuthState {
  const separator = state.lastIndexOf(".");

  if (separator <= 0) {
    throw new Error("Invalid OAuth state.");
  }

  const encodedPayload = state.slice(0, separator);
  const suppliedSignature = state.slice(separator + 1);

  const expectedSignature = crypto
    .createHmac(
      "sha256",
      requiredEnv("GOOGLE_EMAIL_CLIENT_SECRET")
    )
    .update(encodedPayload)
    .digest("base64url");

  if (!safeEqual(suppliedSignature, expectedSignature)) {
    throw new Error("OAuth state signature mismatch.");
  }

  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8")
  ) as OAuthState;

  if (
    !payload.nonce ||
    !payload.userId ||
    !payload.companyId ||
    !payload.accountId ||
    !payload.issuedAt
  ) {
    throw new Error("OAuth state payload is incomplete.");
  }

  const maxAgeMs = 10 * 60 * 1000;

  if (
    payload.issuedAt > Date.now() + 60_000 ||
    Date.now() - payload.issuedAt > maxAgeMs
  ) {
    throw new Error("OAuth state has expired.");
  }

  return payload;
}

function emailRedirect(
  request: NextRequest,
  status: "connected" | "error",
  reason?: string
) {
  const url = new URL("/email/mailboxes", request.url);
  url.searchParams.set("google", status);

  if (reason) {
    url.searchParams.set("reason", reason);
  }

  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const googleError = request.nextUrl.searchParams.get("error");

  if (googleError) {
    return emailRedirect(request, "error", "google_denied");
  }

  const code = request.nextUrl.searchParams.get("code");
  const stateValue = request.nextUrl.searchParams.get("state");

  if (!code || !stateValue) {
    return emailRedirect(request, "error", "missing_callback_parameters");
  }

  try {
    const state = verifyState(stateValue);

    const tokenResponse = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id: requiredEnv("GOOGLE_EMAIL_CLIENT_ID"),
          client_secret: requiredEnv("GOOGLE_EMAIL_CLIENT_SECRET"),
          redirect_uri: requiredEnv("GOOGLE_EMAIL_REDIRECT_URI"),
          grant_type: "authorization_code",
        }),
        cache: "no-store",
      }
    );

    const tokens =
      (await tokenResponse.json()) as GoogleTokenResponse;

    if (!tokenResponse.ok) {
      console.error("Google OAuth token exchange failed:", {
        status: tokenResponse.status,
        error: tokens.error,
      });

      return emailRedirect(request, "error", "token_exchange_failed");
    }

    if (!tokens.refresh_token) {
      return emailRedirect(request, "error", "refresh_token_missing");
    }

    const grantedScopes = (tokens.scope ?? "")
      .split(/\s+/)
      .filter(Boolean);

    if (!grantedScopes.includes(GMAIL_SEND_SCOPE)) {
      return emailRedirect(request, "error", "gmail_send_not_granted");
    }

    if (!tokens.id_token) {
  return emailRedirect(request, "error", "google_identity_missing");
}

const identityTicket = await googleOAuthClient.verifyIdToken({
  idToken: tokens.id_token,
  audience: requiredEnv("GOOGLE_EMAIL_CLIENT_ID"),
});

const googleIdentity = identityTicket.getPayload();

if (
  !googleIdentity?.sub ||
  !googleIdentity.email ||
  googleIdentity.email_verified !== true
) {
  return emailRedirect(request, "error", "google_identity_invalid");
}

const verifiedGoogleEmail = googleIdentity.email.trim().toLowerCase();
const verifiedGoogleSubject = googleIdentity.sub;

const encrypted = encryptProviderToken(tokens.refresh_token);

    /*
     * This key must exist only on the server.
     * It must never use a NEXT_PUBLIC_ prefix.
     */
    const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRoleKey =
      process.env.SUPABASE_SECRET_KEY?.trim() ||
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!serviceRoleKey) {
      throw new Error("Supabase server secret is not configured.");
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    /*
     * Revalidate all tenant/user/mailbox bindings from the signed state
     * before creating the provider connection.
     */
    const { data: profile, error: profileError } = await admin
      .from("user_profile")
      .select("user_id, company_id, role")
      .eq("user_id", state.userId)
      .eq("company_id", state.companyId)
      .maybeSingle();

    if (profileError || !profile) {
      return emailRedirect(request, "error", "nexus_user_invalid");
    }

    const role = (profile.role ?? "").toLowerCase();

    if (role !== "owner" && role !== "admin") {
      return emailRedirect(request, "error", "mailbox_manage_denied");
    }

    const { data: mailbox, error: mailboxError } = await admin
      .from("email_account")
      .select("id, company_id, email_address")
      .eq("id", state.accountId)
      .eq("company_id", state.companyId)
      .maybeSingle();

    if (mailboxError || !mailbox) {
      return emailRedirect(request, "error", "mailbox_invalid");
    }

    const nexusMailboxEmail = mailbox.email_address.trim().toLowerCase();

if (verifiedGoogleEmail !== nexusMailboxEmail) {
  return emailRedirect(request, "error", "google_email_mismatch");
}

const { data: connection, error: connectionError } = await admin
      .from("email_provider_connection")
      .upsert(
        {
          company_id: state.companyId,
          account_id: state.accountId,
          provider: "google",
          provider_account_id: verifiedGoogleSubject,
      provider_email: verifiedGoogleEmail,
          connection_status: "connected",
          scopes: grantedScopes,
          connected_by: state.userId,
          connected_at: new Date().toISOString(),
          disconnected_at: null,
          last_verified_at: new Date().toISOString(),
          last_error: null,
        },
        {
          onConflict: "company_id,account_id,provider",
        }
      )
      .select("id")
      .single();

    if (connectionError || !connection) {
      throw new Error(
        `Unable to save Google provider connection: ${
          connectionError?.message ?? "unknown error"
        }`
      );
    }

    const { error: vaultError } = await admin
      .from("email_provider_token_vault")
      .upsert(
        {
          company_id: state.companyId,
          connection_id: connection.id,
          encrypted_refresh_token: encrypted.ciphertext,
          encryption_iv: encrypted.iv,
          encryption_auth_tag: encrypted.authTag,
          token_version: 1,
        },
        {
          onConflict: "company_id,connection_id",
        }
      );

    if (vaultError) {
      /*
       * Never leave Nexus claiming the mailbox is connected if
       * secure credential persistence failed.
       */
      await admin
        .from("email_provider_connection")
        .update({
          connection_status: "error",
          last_error: "secure_token_storage_failed",
        })
        .eq("id", connection.id)
        .eq("company_id", state.companyId);

      throw new Error(
        `Unable to securely store Google refresh token: ${vaultError.message}`
      );
    }

    /*
     * Never log:
     * - authorization code
     * - access token
     * - refresh token
     * - encrypted token contents
     */

    return emailRedirect(request, "connected");
  } catch (error) {
    console.error(
      "Google email callback failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return emailRedirect(request, "error", "callback_failed");
  }
}
