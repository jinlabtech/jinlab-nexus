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
