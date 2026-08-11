export type PurchaseOrderStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "partially_received"
  | "received"
  | "cancelled";

export type PurchaseOrder = {
  id: string;
  company_id: string;
  supplier_id: string;
  branch_id: string;
  created_by: string | null;
  purchase_order_number: string;
  status: PurchaseOrderStatus;
  order_date: string;
  expected_date: string | null;
  supplier_reference: string | null;
  notes: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  created_at: string;
  updated_at: string;
};

export type PurchaseOrderItem = {
  id: string;
  purchase_order_id: string;
  company_id: string;
  inventory_item_id: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
  tax_rate: number;
  line_subtotal: number;
  line_tax: number;
  line_total: number;
  created_at: string;
};

export type PurchaseReceipt = {
  id: string;
  company_id: string;
  purchase_order_id: string;
  branch_id: string;
  received_by: string | null;
  receipt_number: string;
  supplier_delivery_reference: string | null;
  notes: string | null;
  received_at: string;
  created_at: string;
};

export type PurchaseReceiptItem = {
  id: string;
  purchase_receipt_id: string;
  purchase_order_item_id: string;
  company_id: string;
  inventory_item_id: string;
  quantity_received: number;
  unit_cost: number;
  created_at: string;
};

export type PurchaseOrderFormData = {
  supplier_id: string;
  branch_id: string;
  expected_date: string;
  supplier_reference: string;
  notes: string;
};

export type PurchaseOrderItemFormData = {
  inventory_item_id: string;
  quantity_ordered: number;
  unit_cost: number;
  tax_rate: number;
};

export type PurchaseOrderWithItems = {
  order: PurchaseOrder;
  items: PurchaseOrderItem[];
};

export type ReceivePurchaseItemData = {
  purchase_order_item_id: string;
  inventory_item_id: string;
  quantity_received: number;
  unit_cost: number;
};

export type ReceivePurchaseOrderData = {
  supplier_delivery_reference: string;
  notes: string;
  items: ReceivePurchaseItemData[];
};
