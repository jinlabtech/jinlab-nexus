import { supabase } from "@/lib/supabase";

export type Company = {
  id: string;
  company_name: string;
  registration_number: string | null;
  email: string | null;
  phone: string | null;
};

export type CompanyFormData = {
  company_name: string;
  registration_number: string;
  email: string;
  phone: string;
};

export async function getCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from("company")
    .select(
      "id, company_name, registration_number, email, phone"
    )
    .order("company_name");

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function createCompany(
  company: CompanyFormData
): Promise<void> {
  const { error } = await supabase.from("company").insert({
    company_name: company.company_name,
    registration_number:
      company.registration_number || null,
    email: company.email || null,
    phone: company.phone || null,
  });

  if (error) {
    throw new Error(error.message);
  }
}
