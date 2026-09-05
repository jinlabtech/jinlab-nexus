import { supabase } from "@/lib/supabase";
import { saveCompanyDocumentLogo } from "@/lib/services/settingsService";

export async function uploadDocumentLogo(companyId: string, file: File): Promise<string> {
  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (!allowed.includes(file.type)) throw new Error("Logo must be PNG, JPG or WebP.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Logo must be smaller than 5 MB.");

  const extension = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${companyId}/company-logo.${extension}`;

  const { error } = await supabase.storage
    .from("company-logos")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) throw new Error(error.message);
  await saveCompanyDocumentLogo(path);
  return path;
}

export async function removeDocumentLogo(logoPath: string | null): Promise<void> {
  if (logoPath) {
    const { error } = await supabase.storage
      .from("company-logos")
      .remove([logoPath]);
    if (error) throw new Error(error.message);
  }

  await saveCompanyDocumentLogo(null);
}
