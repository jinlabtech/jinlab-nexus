export type InventoryCategory = {
  id: string;
  company_id: string;
  category_name: string;
  description: string | null;
  created_at: string;
};

export type Supplier = {
  id: string;
  company_id: string;
  supplier_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
};

export type InventoryItem = {
  id: string;
  company_id: string;
  category_id: string | null;
  supplier_id: string | null;
  item_name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  cost_price: number;
  selling_price: number;
  minimum_stock: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type BranchStock = {
  id: string;
  company_id: string;
  branch_id: string;
  inventory_item_id: string;
  quantity: number;
  updated_at: string;
};

export type StockMovementType =
  | "stock_in"
  | "stock_out"
  | "adjustment_in"
  | "adjustment_out"
  | "transfer_in"
  | "transfer_out"
  | "sale"
  | "repair_usage"
  | "return";

export type StockMovement = {
  id: string;
  company_id: string;
  branch_id: string;
  inventory_item_id: string;
  user_id: string | null;
  movement_type: StockMovementType;
  quantity: number;
  reference: string | null;
  notes: string | null;
  created_at: string;
};

export type InventoryItemFormData = {
  category_id: string;
  supplier_id: string;
  item_name: string;
  sku: string;
  barcode: string;
  description: string;
  cost_price: number;
  selling_price: number;
  minimum_stock: number;
};

export type InventoryCategoryFormData = {
  category_name: string;
  description: string;
};

export type SupplierFormData = {
  supplier_name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
};

export type StockAdjustmentData = {
  branch_id: string;
  inventory_item_id: string;
  movement_type: StockMovementType;
  quantity: number;
  reference?: string;
  notes?: string;
};
