import { supabase } from "@/lib/supabase";

import type {
  Customer,
  CustomerFormData,
} from "@/types/customer";

const customerColumns =
  "id, company_id, customer_number, customer_type, customer_name, contact_person, email, phone, alternative_phone, registration_number, vat_number, address_line_1, address_line_2, city, province, postal_code, country, credit_limit, payment_terms_days, notes, is_active, created_by, created_at, updated_at";

export async function getCustomers(
  companyId: string,
  includeArchived = false
): Promise<Customer[]> {
  let query = supabase
    .from("customer")
    .select(customerColumns)
    .eq("company_id", companyId)
    .order("customer_name");

  if (!includeArchived) {
    query = query.eq(
      "is_active",
      true
    );
  }

  const { data, error } =
    await query;

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function createCustomer(
  companyId: string,
  formData: CustomerFormData
): Promise<Customer> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error(
      userError?.message ??
        "Authenticated user required."
    );
  }

  const {
    data: customerNumber,
    error: numberError,
  } = await supabase.rpc(
    "generate_customer_number",
    {
      target_company_id: companyId,
    }
  );

  if (numberError) {
    throw new Error(
      numberError.message
    );
  }

  if (!customerNumber) {
    throw new Error(
      "Customer number could not be generated."
    );
  }

  const { data, error } =
    await supabase
      .from("customer")
      .insert({
        company_id: companyId,

        customer_number:
          customerNumber,

        customer_type:
          formData.customer_type,

        customer_name:
          formData.customer_name,

        contact_person:
          formData.contact_person ||
          null,

        email:
          formData.email || null,

        phone:
          formData.phone || null,

        alternative_phone:
          formData.alternative_phone ||
          null,

        registration_number:
          formData.registration_number ||
          null,

        vat_number:
          formData.vat_number ||
          null,

        address_line_1:
          formData.address_line_1 ||
          null,

        address_line_2:
          formData.address_line_2 ||
          null,

        city:
          formData.city || null,

        province:
          formData.province ||
          null,

        postal_code:
          formData.postal_code ||
          null,

        country:
          formData.country ||
          "South Africa",

        credit_limit:
          formData.credit_limit,

        payment_terms_days:
          formData.payment_terms_days,

        notes:
          formData.notes || null,

        is_active: true,

        created_by:
          user.id,
      })
      .select(customerColumns)
      .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateCustomer(
  customerId: string,
  companyId: string,
  formData: CustomerFormData
): Promise<Customer> {
  const { data, error } =
    await supabase
      .from("customer")
      .update({
        customer_type:
          formData.customer_type,

        customer_name:
          formData.customer_name,

        contact_person:
          formData.contact_person ||
          null,

        email:
          formData.email || null,

        phone:
          formData.phone || null,

        alternative_phone:
          formData.alternative_phone ||
          null,

        registration_number:
          formData.registration_number ||
          null,

        vat_number:
          formData.vat_number ||
          null,

        address_line_1:
          formData.address_line_1 ||
          null,

        address_line_2:
          formData.address_line_2 ||
          null,

        city:
          formData.city || null,

        province:
          formData.province ||
          null,

        postal_code:
          formData.postal_code ||
          null,

        country:
          formData.country ||
          "South Africa",

        credit_limit:
          formData.credit_limit,

        payment_terms_days:
          formData.payment_terms_days,

        notes:
          formData.notes || null,
      })
      .eq("id", customerId)
      .eq("company_id", companyId)
      .select(customerColumns)
      .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function archiveCustomer(
  customerId: string,
  companyId: string
): Promise<void> {
  const { error } =
    await supabase
      .from("customer")
      .update({
        is_active: false,
      })
      .eq("id", customerId)
      .eq("company_id", companyId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function restoreCustomer(
  customerId: string,
  companyId: string
): Promise<void> {
  const { error } =
    await supabase
      .from("customer")
      .update({
        is_active: true,
      })
      .eq("id", customerId)
      .eq("company_id", companyId);

  if (error) {
    throw new Error(error.message);
  }
}
