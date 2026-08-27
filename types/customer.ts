export type CustomerType =
  | "individual"
  | "business"
  | "school"
  | "government"
  | "organisation";

export type Customer = {
  id: string;
  company_id: string;
  customer_number: string;
  customer_type: CustomerType;
  customer_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  alternative_phone: string | null;
  registration_number: string | null;
  vat_number: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string;
  credit_limit: number;
  payment_terms_days: number;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerFormData = {
  customer_type: CustomerType;
  customer_name: string;
  contact_person: string;
  email: string;
  phone: string;
  alternative_phone: string;
  registration_number: string;
  vat_number: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  credit_limit: number;
  payment_terms_days: number;
  notes: string;
};
