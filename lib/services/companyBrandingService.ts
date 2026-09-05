import { supabase } from "@/lib/supabase";

export type CompanyBranding = {
  id: string;
  company_name: string;
  trading_name: string | null;
  registration_number: string | null;
  email: string | null;
  phone: string | null;
  physical_address: string | null;
  website: string | null;
  vat_registered: boolean;
  vat_number: string | null;
  logo_path: string | null;
  document_footer: string | null;
};

export type CompanyBrandingFormData = {
  trading_name: string;
  registration_number: string;
  email: string;
  phone: string;
  physical_address: string;
  website: string;
  vat_registered: boolean;
  vat_number: string;
  document_footer: string;
};

const brandingColumns = `
  id,
  company_name,
  trading_name,
  registration_number,
  email,
  phone,
  physical_address,
  website,
  vat_registered,
  vat_number,
  logo_path,
  document_footer
`;

export async function getCompanyBranding(
  companyId: string
): Promise<CompanyBranding> {
  const { data, error } =
    await supabase
      .from("company")
      .select(brandingColumns)
      .eq("id", companyId)
      .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as CompanyBranding;
}

export async function updateCompanyBranding(
  companyId: string,
  formData: CompanyBrandingFormData
): Promise<CompanyBranding> {
  const { data, error } =
    await supabase
      .from("company")
      .update({
        trading_name:
          formData.trading_name.trim() || null,

        registration_number:
          formData.registration_number.trim() || null,

        email:
          formData.email.trim() || null,

        phone:
          formData.phone.trim() || null,

        physical_address:
          formData.physical_address.trim() || null,

        website:
          formData.website.trim() || null,

        vat_registered:
          formData.vat_registered,

        vat_number:
          formData.vat_registered
            ? formData.vat_number.trim() || null
            : null,

        document_footer:
          formData.document_footer.trim() || null,
      })
      .eq("id", companyId)
      .select(brandingColumns)
      .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as CompanyBranding;
}

export async function uploadCompanyLogo(
  companyId: string,
  file: File
): Promise<string> {
  const allowedTypes = [
    "image/png",
    "image/jpeg",
    "image/webp",
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error(
      "Logo must be PNG, JPG, JPEG or WebP."
    );
  }

  const maxSize =
    5 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error(
      "Logo must be smaller than 5 MB."
    );
  }

  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase() ||
    "png";

  const logoPath =
    `${companyId}/company-logo.${extension}`;

  /*
   * Remove old logo first if its extension differs.
   */
  const current =
    await getCompanyBranding(
      companyId
    );

  if (
    current.logo_path &&
    current.logo_path !==
      logoPath
  ) {
    await supabase.storage
      .from("company-logos")
      .remove([
        current.logo_path,
      ]);
  }

  const {
    error: uploadError,
  } =
    await supabase.storage
      .from("company-logos")
      .upload(
        logoPath,
        file,
        {
          upsert: true,
          contentType:
            file.type,
        }
      );

  if (uploadError) {
    throw new Error(
      uploadError.message
    );
  }

  const {
    error: updateError,
  } =
    await supabase
      .from("company")
      .update({
        logo_path:
          logoPath,
      })
      .eq(
        "id",
        companyId
      );

  if (updateError) {
    throw new Error(
      updateError.message
    );
  }

  return logoPath;
}

export async function removeCompanyLogo(
  companyId: string
): Promise<void> {
  const branding =
    await getCompanyBranding(
      companyId
    );

  if (branding.logo_path) {
    const {
      error:
        storageError,
    } =
      await supabase.storage
        .from(
          "company-logos"
        )
        .remove([
          branding.logo_path,
        ]);

    if (storageError) {
      throw new Error(
        storageError.message
      );
    }
  }

  const {
    error,
  } =
    await supabase
      .from("company")
      .update({
        logo_path: null,
      })
      .eq(
        "id",
        companyId
      );

  if (error) {
    throw new Error(
      error.message
    );
  }
}

export async function getCompanyLogoUrl(
  logoPath: string | null
): Promise<string | null> {
  if (!logoPath) {
    return null;
  }

  const {
    data,
    error,
  } =
    await supabase.storage
      .from("company-logos")
      .createSignedUrl(
        logoPath,
        60 * 60
      );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data.signedUrl;
}
