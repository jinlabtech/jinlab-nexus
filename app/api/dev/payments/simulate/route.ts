import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(
  request: NextRequest
) {
  try {
    if (
      process.env.NODE_ENV ===
      "production"
    ) {
      return NextResponse.json(
        {
          error:
            "Development gateway simulator is disabled.",
        },
        {
          status: 403,
        }
      );
    }

    const body =
      await request.json();

    const transactionId =
      body?.transactionId;

    if (
      !transactionId ||
      typeof transactionId !==
        "string"
    ) {
      return NextResponse.json(
        {
          error:
            "Transaction ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    const supabaseUrl =
      process.env
        .NEXT_PUBLIC_SUPABASE_URL;

    const supabaseSecretKey =
      process.env
        .SUPABASE_SECRET_KEY;

    if (
      !supabaseUrl ||
      !supabaseSecretKey
    ) {
      return NextResponse.json(
        {
          error:
            "Development gateway server configuration is incomplete.",
        },
        {
          status: 500,
        }
      );
    }

    const admin =
      createClient(
        supabaseUrl,
        supabaseSecretKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        }
      );

    const {
      data,
      error,
    } =
      await admin.rpc(
        "simulate_gateway_payment_success",
        {
          p_transaction_id:
            transactionId,
        }
      );

    if (error) {
      return NextResponse.json(
        {
          error:
            error.message,
        },
        {
          status: 400,
        }
      );
    }

    return NextResponse.json(
      data
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to simulate payment.",
      },
      {
        status: 500,
      }
    );
  }
}
