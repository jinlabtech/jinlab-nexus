export type QuotationStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled";

export type TaxMode =
  | "none"
  | "vat";

export type DiscountMode =
  | "percentage"
  | "fixed";

export type Quotation = {
  id: string;
  company_id: string;
  customer_id: string;
  branch_id: string;
  created_by: string | null;

  quotation_number: string;
  status: QuotationStatus;

  quotation_date: string;
  valid_until: string | null;

  customer_reference: string | null;
  notes: string | null;
  terms: string | null;

  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;

  created_at: string;
  updated_at: string;
};

export type QuotationItem = {
  id: string;
  quotation_id: string;
  company_id: string;

  inventory_item_id: string | null;

  description: string;

  quantity: number;
  unit_price: number;

  discount_mode: DiscountMode;
  discount_value: number;

  /*
   * Legacy field retained because the database
   * still contains discount_rate.
   */
  discount_rate: number;

  tax_mode: TaxMode;
  tax_rate: number;

  line_subtotal: number;
  line_discount: number;
  line_tax: number;
  line_total: number;

  created_at: string;
};

export type QuotationFormData = {
  customer_id: string;
  branch_id: string;

  valid_until: string;
  customer_reference: string;

  notes: string;
  terms: string;
};

export type QuotationItemFormData = {
  inventory_item_id: string | null;

  description: string;

  quantity: number;
  unit_price: number;

  discount_mode: DiscountMode;
  discount_value: number;

  tax_mode: TaxMode;
  tax_rate: number;
};

export type QuotationWithItems = {
  quotation: Quotation;
  items: QuotationItem[];
};
