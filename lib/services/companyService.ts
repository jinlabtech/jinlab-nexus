import { supabase } from "@/lib/supabase";

import type {
  Company,
  CompanyFormData,
} from "@/types/company";

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
  const { error } = await supabase
    .from("company")
    .insert({
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

export async function updateCompany(
  companyId: string,
  company: CompanyFormData
): Promise<void> {
  const { error } = await supabase
    .from("company")
    .update({
      company_name: company.company_name,
      registration_number:
        company.registration_number || null,
      email: company.email || null,
      phone: company.phone || null,
    })
    .eq("id", companyId);

  if (error) {
    throw new Error(error.message);
  }
}
