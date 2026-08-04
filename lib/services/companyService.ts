import { supabase } from "@/lib/supabase";

export async function getCompanies() {
  const { data, error } = await supabase
    .from("company")
    .select("*")
    .order("company_name");

  if (error) throw error;

  return data;
}

export async function createCompany(company: {
  company_name: string;
  email: string;
  phone: string;
  registration_number: string;
}) {
  const { error } = await supabase
    .from("company")
    .insert(company);

  if (error) throw error;
}
