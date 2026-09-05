export type SalesOrderStatus =
  | "draft"
  | "confirmed"
  | "delivered"
  | "invoiced"
  | "cancelled";


export type SalesPaymentBasis =
  | "credit"
  | "immediate"
  | "prepaid";

export type SalesTaxMode =
  | "none"
  | "vat";

export type SalesDiscountMode =
  | "percentage"
  | "fixed";

export type SalesOrder = {
  id: string;
  company_id: string;
  branch_id: string;
  customer_id: string;
  quotation_id: string | null;

  sales_order_number: string;
  status: SalesOrderStatus;

  payment_basis:
    SalesPaymentBasis | null;

  order_date: string;
  expected_delivery: string | null;

  notes: string | null;

  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;

  created_by: string | null;

  created_at: string;
  updated_at: string;
};

export type SalesOrderItem = {
  id: string;
  sales_order_id: string;

  inventory_item_id: string | null;

  description: string;

  quantity: number;
  unit_price: number;

  discount_mode: SalesDiscountMode;
  discount_value: number;

  tax_mode: SalesTaxMode;
  tax_rate: number;

  line_subtotal: number;
  line_discount: number;
  line_tax: number;
  line_total: number;

  created_at: string;
};

export type SalesOrderFormData = {
  customer_id: string;
  branch_id: string;

  payment_basis:
    SalesPaymentBasis | null;

  expected_delivery: string | null;
  notes: string | null;

  quotation_id?: string | null;
};

export type SalesOrderItemFormData = {
  inventory_item_id: string | null;

  description: string;

  quantity: number;
  unit_price: number;

  discount_mode: SalesDiscountMode;
  discount_value: number;

  tax_mode: SalesTaxMode;
  tax_rate: number;
};

export type SalesOrderWithItems = {
  sales_order: SalesOrder;
  items: SalesOrderItem[];
};
