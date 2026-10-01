import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
export const runtime="nodejs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request:Request){try{
    const authHeader = request.headers.get("authorization");

    if (
      !authHeader?.startsWith("Bearer ") ||
      authHeader.length > 10_000
    ) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const accessToken = authHeader.slice(7).trim();

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

    const supabasePublicKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

    if (!supabaseUrl || !supabasePublicKey) {
      throw new Error(
        "Nexus Supabase server configuration is incomplete."
      );
    }

    const userClient = createClient(
      supabaseUrl,
      supabasePublicKey,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Your Nexus session has expired." },
        { status: 401 }
      );
    }

    const {
      data: canConfirmIntake,
      error: permissionError,
    } = await userClient.rpc(
      "current_user_has_permission",
      {
        requested_permission: "repair.view",
      }
    );

    if (permissionError) {
      throw new Error(
        `Permission check failed: ${permissionError.message}`
      );
    }

    if (canConfirmIntake !== true) {
      return NextResponse.json(
        {
          error:
            "You do not have permission to view repairs.",
        },
        { status: 403 }
      );
    }

    const {
      data: companyId,
      error: companyError,
    } = await userClient.rpc("current_company_id");

    if (
      companyError ||
      typeof companyId !== "string" ||
      !UUID.test(companyId)
    ) {
      return NextResponse.json(
        {
          error:
            "Your Nexus company access could not be verified.",
        },
        { status: 403 }
      );
    }


 const input=await request.json();
 if(typeof input.jobId!=="string"||!UUID.test(input.jobId))return NextResponse.json({error:"Invalid job reference."},{status:400});
 const {data:h,error}=await supabaseAdmin.from("repair_handover").select("id,signature_storage_path,signature_sha256,signed_at,verification_channel,verified_at").eq("company_id",companyId).eq("service_job_id",input.jobId).eq("handover_type","intake").order("created_at",{ascending:false}).limit(1).maybeSingle();
 if(error)throw error;
 if(!h?.signature_storage_path||!h.signed_at)return NextResponse.json({error:"No saved signature for this job yet."},{status:404});
 if(!h.signature_storage_path.startsWith(companyId+"/"))throw new Error("Invalid signature location");
 const {data:link,error:linkError}=await supabaseAdmin.storage.from("repair-signatures").createSignedUrl(h.signature_storage_path,120);
 if(linkError||!link)throw new Error("Signature unavailable");
 return NextResponse.json({url:link.signedUrl,signedAt:h.signed_at,reference:h.id,sha256:h.signature_sha256,verificationChannel:h.verification_channel,verifiedAt:h.verified_at},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Signature could not be opened. Please try again."},{status:500,headers:{"Cache-Control":"no-store"}})}}
