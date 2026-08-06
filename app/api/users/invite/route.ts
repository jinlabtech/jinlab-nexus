import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type {
  InviteUserData,
  UserRole,
} from "@/types/userProfile";

const allowedRoles: UserRole[] = [
  "admin",
  "manager",
  "technician",
  "cashier",
  "employee",
  "viewer",
];

function getAccessToken(request: Request) {
  const authorization =
    request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice(7);
}

export async function POST(request: Request) {
  try {
    const accessToken = getAccessToken(request);

    if (!accessToken) {
      return NextResponse.json(
        {
          error: "Authentication is required.",
        },
        {
          status: 401,
        }
      );
    }

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3000";

    if (!supabaseUrl || !publishableKey) {
      return NextResponse.json(
        {
          error:
            "Supabase server configuration is missing.",
        },
        {
          status: 500,
        }
      );
    }

    let redirectUrl: string;

    try {
      redirectUrl = new URL(
        "/accept-invite",
        appUrl
      ).toString();
    } catch {
      return NextResponse.json(
        {
          error:
            "NEXT_PUBLIC_APP_URL is invalid.",
        },
        {
          status: 500,
        }
      );
    }

    const authClient = createClient(
      supabaseUrl,
      publishableKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const {
      data: { user: requestingUser },
      error: requestingUserError,
    } = await authClient.auth.getUser(
      accessToken
    );

    if (
      requestingUserError ||
      !requestingUser
    ) {
      return NextResponse.json(
        {
          error:
            requestingUserError?.message ??
            "Your session is invalid or expired.",
        },
        {
          status: 401,
        }
      );
    }

    const {
      data: requestingProfile,
      error: profileError,
    } = await supabaseAdmin
      .from("user_profile")
      .select(
        "company_id, role, full_name"
      )
      .eq("user_id", requestingUser.id)
      .single();

    if (
      profileError ||
      !requestingProfile
    ) {
      return NextResponse.json(
        {
          error:
            profileError?.message ??
            "Your profile could not be loaded.",
        },
        {
          status: 403,
        }
      );
    }

    if (
      requestingProfile.role !== "owner" &&
      requestingProfile.role !== "admin"
    ) {
      return NextResponse.json(
        {
          error:
            "Only owners and administrators may invite users.",
        },
        {
          status: 403,
        }
      );
    }

    if (!requestingProfile.company_id) {
      return NextResponse.json(
        {
          error:
            "Your account is not linked to a company.",
        },
        {
          status: 400,
        }
      );
    }

    const body =
      (await request.json()) as Partial<InviteUserData>;

    const fullName =
      body.full_name?.trim();

    const email =
      body.email
        ?.trim()
        .toLowerCase();

    const role = body.role;

    if (!fullName) {
      return NextResponse.json(
        {
          error: "Full name is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Enter a valid email address.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !role ||
      !allowedRoles.includes(role)
    ) {
      return NextResponse.json(
        {
          error:
            "The selected role is not allowed.",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: invitationData,
      error: invitationError,
    } =
      await supabaseAdmin.auth.admin
        .inviteUserByEmail(email, {
          data: {
            full_name: fullName,
          },
          redirectTo: redirectUrl,
        });

    if (
      invitationError ||
      !invitationData.user
    ) {
      return NextResponse.json(
        {
          error:
            invitationError?.message ??
            "The invitation could not be sent.",
        },
        {
          status: 400,
        }
      );
    }

    const invitedAuthUserId =
      invitationData.user.id;

    const {
      data: invitedProfile,
      error: invitedProfileError,
    } = await supabaseAdmin
      .from("user_profile")
      .update({
        full_name: fullName,
        email,
        company_id:
          requestingProfile.company_id,
        role,
      })
      .eq(
        "user_id",
        invitedAuthUserId
      )
      .select(
        "id, user_id, company_id, full_name, email, role, created_at"
      )
      .single();

    if (
      invitedProfileError ||
      !invitedProfile
    ) {
      await supabaseAdmin.auth.admin
        .deleteUser(invitedAuthUserId);

      return NextResponse.json(
        {
          error:
            invitedProfileError?.message ??
            "The invited user profile could not be configured.",
        },
        {
          status: 500,
        }
      );
    }

    const { error: auditError } =
      await supabaseAdmin
        .from("audit_log")
        .insert({
          company_id:
            requestingProfile.company_id,
          user_id: requestingUser.id,
          action: "create",
          module: "users",
          record_id:
            invitedProfile.id,
          description:
            `Invited user: ${fullName}`,
          metadata: {
            invited_email: email,
            invited_role: role,
          },
        });

    if (auditError) {
      console.error(
        "Invitation audit error:",
        auditError.message
      );
    }

    return NextResponse.json(
      {
        message:
          `Invitation sent to ${email}.`,
        user: invitedProfile,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Invitation API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected invitation error occurred.",
      },
      {
        status: 500,
      }
    );
  }
}
