import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    throw new Error("Supabase server configuration is missing.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function validToken(token: string) {
  return /^[A-Za-z0-9_-]{32,200}$/.test(token);
}

function htmlPage(
  title: string,
  message: string,
  formHtml = ""
) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>${title}</title>
</head>
<body style="
  margin:0;
  background:#f5f7fb;
  color:#111827;
  font-family:Arial,sans-serif;
">
  <main style="
    max-width:560px;
    margin:70px auto;
    padding:24px;
  ">
    <section style="
      background:white;
      border:1px solid #e5e7eb;
      border-radius:16px;
      padding:32px;
    ">
      <div style="
        font-size:12px;
        font-weight:700;
        letter-spacing:.08em;
        color:#2563eb;
        text-transform:uppercase;
        margin-bottom:10px;
      ">
        JINLAB Nexus
      </div>

      <h1 style="
        margin:0 0 14px;
        font-size:26px;
      ">${title}</h1>

      <p style="
        line-height:1.6;
        color:#4b5563;
      ">${message}</p>

      ${formHtml}
    </section>
  </main>
</body>
</html>`;
}

function responseHtml(
  body: string,
  status = 200
) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function GET(request: NextRequest) {
  const token =
    request.nextUrl.searchParams.get("token")?.trim() || "";

  if (!validToken(token)) {
    return responseHtml(
      htmlPage(
        "Invalid unsubscribe link",
        "This unsubscribe link is not valid."
      ),
      400
    );
  }

  const action =
    `/api/email/unsubscribe?token=${encodeURIComponent(token)}`;

  return responseHtml(
    htmlPage(
      "Unsubscribe from marketing email",
      "You can stop receiving JINLAB marketing emails at this address. Operational messages such as quotations, invoices, repairs or recruitment communication are managed separately.",
      `
      <form method="post" action="${action}" style="margin-top:24px;">
        <button
          type="submit"
          style="
            border:0;
            border-radius:8px;
            padding:12px 18px;
            background:#111827;
            color:white;
            font-size:14px;
            font-weight:700;
            cursor:pointer;
          "
        >
          Unsubscribe
        </button>
      </form>
      `
    )
  );
}

export async function POST(request: NextRequest) {
  const token =
    request.nextUrl.searchParams.get("token")?.trim() || "";

  if (!validToken(token)) {
    return responseHtml(
      htmlPage(
        "Invalid unsubscribe link",
        "This unsubscribe request is not valid."
      ),
      400
    );
  }

  try {
    const admin = serviceClient();

    const {
      data,
      error,
    } = await admin.rpc(
      "communication_unsubscribe_by_token",
      {
        p_token: token,
      }
    );

    if (error) {
      console.error(
        "Marketing unsubscribe failed:",
        error.message
      );

      return responseHtml(
        htmlPage(
          "Unable to unsubscribe",
          "Nexus could not process this request right now. Please try again."
        ),
        500
      );
    }

    const result =
      (data || {}) as {
        ok?: boolean;
        status?: string;
      };

    if (!result.ok) {
      return responseHtml(
        htmlPage(
          "Link expired or already used",
          "This unsubscribe link is no longer active. If you already unsubscribed, no further action is required."
        )
      );
    }

    return responseHtml(
      htmlPage(
        "You are unsubscribed",
        "Your email address has been removed from JINLAB marketing email delivery."
      )
    );
  } catch (error) {
    console.error(
      "Unsubscribe endpoint error:",
      error
    );

    return responseHtml(
      htmlPage(
        "Unable to unsubscribe",
        "Nexus could not process this request right now."
      ),
      500
    );
  }
}
