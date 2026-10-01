import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const STORAGE_BUCKET = "communication-assets";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
// Allow multipart headers and fields without buffering an unbounded request.
const MAX_REQUEST_SIZE = MAX_FILE_SIZE + 64 * 1024;
const IMAGE_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class UploadRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function readUploadForm(request: NextRequest): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";

  if (!/^multipart\/form-data\s*;/i.test(contentType)) {
    throw new UploadRequestError("A multipart image upload is required.", 400);
  }

  if (Number(request.headers.get("content-length")) > MAX_REQUEST_SIZE) {
    throw new UploadRequestError("Image uploads must be 10 MB or smaller.", 413);
  }

  if (!request.body) {
    throw new UploadRequestError("An image file is required.", 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let byteSize = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      byteSize += value.byteLength;

      if (byteSize > MAX_REQUEST_SIZE) {
        await reader.cancel();
        throw new UploadRequestError("Image uploads must be 10 MB or smaller.", 413);
      }

      chunks.push(new Uint8Array(value));
    }
  } finally {
    reader.releaseLock();
  }

  try {
    return await new Response(new Blob(chunks), {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    throw new UploadRequestError("Invalid image upload form.", 400);
  }
}

function matchesImageType(bytes: Buffer, mimeType: string): boolean {
  switch (mimeType) {
    case "image/jpeg":
      return bytes.length >= 3 && bytes[0] === 0xff &&
        bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/png":
      return bytes.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      );
    case "image/gif":
      return ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6));
    case "image/webp":
      return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WEBP";
    default:
      return false;
  }
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

    if (!accessToken) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
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
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      auth: { persistSession: false, autoRefreshToken: false },
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

    const { data: hasTemplatePermission, error: permissionError } =
      await userClient.rpc("current_user_has_permission", {
        requested_permission: "templates.manage",
      });

    if (permissionError) {
      throw new Error(`Permission check failed: ${permissionError.message}`);
    }

    if (hasTemplatePermission !== true) {
      return NextResponse.json(
        { error: "You do not have permission to manage templates." },
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
      auth: { persistSession: false, autoRefreshToken: false },
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

    const companyId = profile.company_id as string;

    if (!UUID_PATTERN.test(companyId)) {
      throw new Error("Invalid Nexus company profile.");
    }

    const formData = await readUploadForm(request);
    const files = formData.getAll("file");
    const file = files[0];

    if (files.length !== 1 || !(file instanceof File) || file.size === 0) {
      throw new UploadRequestError("Select one non-empty image file.", 400);
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new UploadRequestError("Image uploads must be 10 MB or smaller.", 413);
    }

    const extension = IMAGE_EXTENSIONS.get(file.type);

    if (!extension) {
      throw new UploadRequestError("Upload a JPEG, PNG, GIF, or WebP image.", 415);
    }

    const bytes = Buffer.from(await file.arrayBuffer());

    if (!matchesImageType(bytes, file.type)) {
      throw new UploadRequestError("The file contents do not match its image type.", 415);
    }

    const templateValue = formData.get("templateId");

    if (templateValue !== null && typeof templateValue !== "string") {
      throw new UploadRequestError("Invalid template ID.", 400);
    }

    const templateId = templateValue?.trim() || null;

    if (templateId) {
      if (!UUID_PATTERN.test(templateId)) {
        throw new UploadRequestError("Invalid template ID.", 400);
      }

      const { data: template, error: templateError } = await admin
        .from("communication_template")
        .select("id")
        .eq("id", templateId)
        .eq("company_id", companyId)
        .maybeSingle();

      if (templateError) {
        throw new Error(`Template lookup failed: ${templateError.message}`);
      }

      if (!template) {
        throw new UploadRequestError("Template not found.", 404);
      }
    }

    // The original filename never controls the object path or extension.
    const storagePath = `${companyId}/images/${randomUUID()}.${extension}`;
    const storage = admin.storage.from(STORAGE_BUCKET);
    const { error: uploadError } = await storage.upload(storagePath, bytes, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

    if (uploadError) {
      throw new Error(`Image upload failed: ${uploadError.message}`);
    }

    const asset = await (async () => {
      try {
        const { data, error: assetError } = await admin
          .from("communication_template_asset")
          .insert({
            company_id: companyId,
            template_id: templateId,
            asset_type: "image",
            storage_bucket: STORAGE_BUCKET,
            storage_path: storagePath,
            original_filename: file.name.slice(0, 255),
            mime_type: file.type,
            byte_size: file.size,
            created_by: user.id,
          })
          .select(
            "id, company_id, template_id, brand_profile_id, asset_type, storage_bucket, storage_path, original_filename, mime_type, byte_size, width_px, height_px, alt_text, metadata, created_by, created_at"
          )
          .single();

        if (assetError || !data) {
          throw new Error(`Image registration failed: ${assetError?.message ?? "No asset returned."}`);
        }

        return data;
      } catch (registrationError) {
        try {
          const { error: cleanupError } = await storage.remove([storagePath]);

          if (cleanupError) {
            console.error("Template image cleanup failed:", storagePath, cleanupError);
          }
        } catch (cleanupError) {
          console.error("Template image cleanup failed:", storagePath, cleanupError);
        }

        throw registrationError;
      }
    })();

    const { data: publicUrlData } = storage.getPublicUrl(storagePath);

    return NextResponse.json(
      { publicUrl: publicUrlData.publicUrl, asset },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof UploadRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Template image upload failed:", error);

    return NextResponse.json(
      { error: "Unable to upload this image. Please try again." },
      { status: 500 }
    );
  }
}
