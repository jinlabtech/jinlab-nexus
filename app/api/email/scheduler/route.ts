import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function suppliedSchedulerSecret(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  const bearer =
    authorization?.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";

  const direct =
    request.headers.get("x-nexus-worker-secret")?.trim() || "";

  return bearer || direct;
}

async function authorized(
  request: NextRequest,
  admin: SupabaseClient
) {
  const supplied = suppliedSchedulerSecret(request);

  if (!supplied) {
    return false;
  }

  const localSecret =
    process.env.CRON_SECRET?.trim() || "";

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
      "Scheduler authentication failed:",
      error.message
    );

    return false;
  }

  return data === true;
}

function adminClient() {
  const serviceRoleKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!serviceRoleKey) {
    throw new Error("Missing Supabase server credential.");
  }

  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

export async function GET(request: NextRequest) {
  try {
    const admin = adminClient();

    if (
      !(await authorized(
        request,
        admin
      ))
    ) {
      return NextResponse.json(
        {
          error: "Unauthorized.",
        },
        { status: 401 }
      );
    }

    const schedulerSecret =
      suppliedSchedulerSecret(request);

    const {
      data: recurringResult,
      error: recurringError,
    } = await admin.rpc(
      "marketing_worker_materialize_due_series",
      {
        p_limit: 10,
      }
    );

    if (recurringError) {
      console.error(
        "Recurring campaign scheduler failed:",
        recurringError.message
      );

      return NextResponse.json(
        {
          error:
            "Nexus could not materialize recurring campaigns.",
        },
        { status: 500 }
      );
    }

    const workerUrl = new URL(
      "/api/email/worker?limit=8",
      request.url
    );

    const workerResponse = await fetch(workerUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${schedulerSecret}`,
      },
      cache: "no-store",
    });

    let workerResult: unknown = null;

    try {
      workerResult = await workerResponse.json();
    } catch {
      workerResult = {
        error: "Worker returned an unreadable response.",
      };
    }

    if (!workerResponse.ok) {
      console.error(
        "Email delivery worker failed after scheduling:",
        workerResult
      );

      return NextResponse.json(
        {
          ok: false,
          recurring: recurringResult,
          delivery: workerResult,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      recurring: recurringResult,
      delivery: workerResult,
    });
  } catch (error) {
    console.error("Nexus email scheduler fatal error:", error);

    return NextResponse.json(
      {
        error: "Nexus email scheduler failed.",
      },
      { status: 500 }
    );
  }
}
