import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

export const runtime = "nodejs";

const GOOGLE_EMAIL_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export async function GET(request: NextRequest) {
  try {
    const clientId = requiredEnv("GOOGLE_EMAIL_CLIENT_ID");
    const redirectUri = requiredEnv("GOOGLE_EMAIL_REDIRECT_URI");

    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const accessToken = authHeader.slice("Bearer ".length).trim();

    const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

    if (!supabaseAnonKey) {
      throw new Error("Missing Supabase public key.");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Invalid Nexus session." },
        { status: 401 }
      );
    }

    const accountId = request.nextUrl.searchParams.get("account_id");

    if (!accountId) {
      return NextResponse.json(
        { error: "account_id is required." },
        { status: 400 }
      );
    }

    /*
     * Confirm that this authenticated Nexus user can see/manage
     * the requested mailbox through the existing RLS-controlled table.
     */
    const { data: account, error: accountError } = await supabase
      .from("email_account")
      .select("id, company_id, email_address")
      .eq("id", accountId)
      .maybeSingle();

    if (accountError || !account) {
      return NextResponse.json(
        { error: "Mailbox not found or access denied." },
        { status: 403 }
      );
    }

    /*
     * OAuth state contains no secrets.
     * It is signed so account/company/user binding cannot be modified.
     */
    const statePayload = {
      nonce: crypto.randomBytes(24).toString("hex"),
      userId: user.id,
      companyId: account.company_id,
      accountId: account.id,
      issuedAt: Date.now(),
    };

    const encodedPayload = Buffer.from(
      JSON.stringify(statePayload)
    ).toString("base64url");

    /*
     * Use the existing server-side Google client secret as the HMAC key.
     * The secret itself never leaves the server.
     */
    const stateSignature = crypto
      .createHmac(
        "sha256",
        requiredEnv("GOOGLE_EMAIL_CLIENT_SECRET")
      )
      .update(encodedPayload)
      .digest("base64url");

    const state = `${encodedPayload}.${stateSignature}`;

    const googleUrl = new URL(
      "https://accounts.google.com/o/oauth2/v2/auth"
    );

    googleUrl.searchParams.set("client_id", clientId);
    googleUrl.searchParams.set("redirect_uri", redirectUri);
    googleUrl.searchParams.set("response_type", "code");
    googleUrl.searchParams.set("scope", GOOGLE_EMAIL_SCOPES);
    googleUrl.searchParams.set("access_type", "offline");
    googleUrl.searchParams.set("prompt", "consent");
    googleUrl.searchParams.set("include_granted_scopes", "true");
    googleUrl.searchParams.set("state", state);

    return NextResponse.json({
      authorization_url: googleUrl.toString(),
    });
  } catch (error) {
    console.error("Google email connect error:", error);

    return NextResponse.json(
      { error: "Unable to start Google connection." },
      { status: 500 }
    );
  }
}
