import { supabase } from "@/lib/supabase";

import type {
  BranchStock,
  InventoryCategory,
  InventoryCategoryFormData,
  InventoryItem,
  InventoryItemFormData,
  StockAdjustmentData,
  StockMovement,
  Supplier,
  SupplierFormData,
} from "@/types/inventory";

const inventoryItemColumns =
  "id, company_id, category_id, supplier_id, item_name, sku, barcode, description, cost_price, selling_price, minimum_stock, is_active, created_at, updated_at";

const categoryColumns =
  "id, company_id, category_name, description, created_at";

const supplierColumns =
  "id, company_id, supplier_name, contact_person, email, phone, address, created_at";

const branchStockColumns =
  "id, company_id, branch_id, inventory_item_id, quantity, updated_at";

const stockMovementColumns =
  "id, company_id, branch_id, inventory_item_id, user_id, movement_type, quantity, reference, notes, created_at";

export async function getInventoryCategories(
  companyId: string
): Promise<InventoryCategory[]> {
  const { data, error } = await supabase
    .from("inventory_category")
    .select(categoryColumns)
    .eq("company_id", companyId)
    .order("category_name");

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function createInventoryCategory(
  companyId: string,
  category: InventoryCategoryFormData
): Promise<InventoryCategory> {
  const { data, error } = await supabase
    .from("inventory_category")
    .insert({
      company_id: companyId,
      category_name: category.category_name,
      description: category.description || null,
    })
    .select(categoryColumns)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getSuppliers(
  companyId: string
): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from("supplier")
    .select(supplierColumns)
    .eq("company_id", companyId)
    .order("supplier_name");

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function createSupplier(
  companyId: string,
  supplier: SupplierFormData
): Promise<Supplier> {
  const { data, error } = await supabase
    .from("supplier")
    .insert({
      company_id: companyId,
      supplier_name: supplier.supplier_name,
      contact_person: supplier.contact_person || null,
      email: supplier.email || null,
      phone: supplier.phone || null,
      address: supplier.address || null,
    })
    .select(supplierColumns)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getInventoryItems(
  companyId: string
): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from("inventory_item")
    .select(inventoryItemColumns)
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("item_name");

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function createInventoryItem(
  companyId: string,
  item: InventoryItemFormData
): Promise<InventoryItem> {
  const { data, error } = await supabase
    .from("inventory_item")
    .insert({
      company_id: companyId,
      category_id: item.category_id || null,
      supplier_id: item.supplier_id || null,
      item_name: item.item_name,
      sku: item.sku,
      barcode: item.barcode || null,
      description: item.description || null,
      cost_price: item.cost_price,
      selling_price: item.selling_price,
      minimum_stock: item.minimum_stock,
    })
    .select(inventoryItemColumns)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateInventoryItem(
  itemId: string,
  companyId: string,
  item: InventoryItemFormData
): Promise<InventoryItem> {
  const { data, error } = await supabase
    .from("inventory_item")
    .update({
      category_id: item.category_id || null,
      supplier_id: item.supplier_id || null,
      item_name: item.item_name,
      sku: item.sku,
      barcode: item.barcode || null,
      description: item.description || null,
      cost_price: item.cost_price,
      selling_price: item.selling_price,
      minimum_stock: item.minimum_stock,
    })
    .eq("id", itemId)
    .eq("company_id", companyId)
    .select(inventoryItemColumns)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deactivateInventoryItem(
  itemId: string,
  companyId: string
): Promise<void> {
  const { error } = await supabase
    .from("inventory_item")
    .update({
      is_active: false,
    })
    .eq("id", itemId)
    .eq("company_id", companyId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function getBranchStock(
  companyId: string
): Promise<BranchStock[]> {
  const { data, error } = await supabase
    .from("branch_stock")
    .select(branchStockColumns)
    .eq("company_id", companyId);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getStockMovements(
  companyId: string,
  limit = 100
): Promise<StockMovement[]> {
  const { data, error } = await supabase
    .from("stock_movement")
    .select(stockMovementColumns)
    .eq("company_id", companyId)
    .order("created_at", {
      ascending: false,
    })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function adjustStock(
  companyId: string,
  adjustment: StockAdjustmentData
): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error(
      userError?.message ??
        "An authenticated user is required."
    );
  }

  const { data: existingStock, error: stockReadError } =
    await supabase
      .from("branch_stock")
      .select("id, quantity")
      .eq("company_id", companyId)
      .eq("branch_id", adjustment.branch_id)
      .eq(
        "inventory_item_id",
        adjustment.inventory_item_id
      )
      .maybeSingle();

  if (stockReadError) {
    throw new Error(stockReadError.message);
  }

  const isIncrease = [
    "stock_in",
    "adjustment_in",
    "transfer_in",
    "return",
  ].includes(adjustment.movement_type);

  const newQuantity = isIncrease
    ? (existingStock?.quantity ?? 0) + adjustment.quantity
    : (existingStock?.quantity ?? 0) - adjustment.quantity;

  if (newQuantity < 0) {
    throw new Error(
      "This stock movement would result in negative stock."
    );
  }

  if (existingStock) {
    const { error: updateError } = await supabase
      .from("branch_stock")
      .update({
        quantity: newQuantity,
      })
      .eq("id", existingStock.id)
      .eq("company_id", companyId);

    if (updateError) {
      throw new Error(updateError.message);
    }
  } else {
    const { error: insertError } = await supabase
      .from("branch_stock")
      .insert({
        company_id: companyId,
        branch_id: adjustment.branch_id,
        inventory_item_id:
          adjustment.inventory_item_id,
        quantity: newQuantity,
      });

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  const { error: movementError } = await supabase
    .from("stock_movement")
    .insert({
      company_id: companyId,
      branch_id: adjustment.branch_id,
      inventory_item_id:
        adjustment.inventory_item_id,
      user_id: user.id,
      movement_type:
        adjustment.movement_type,
      quantity: adjustment.quantity,
      reference:
        adjustment.reference || null,
      notes: adjustment.notes || null,
    });

  if (movementError) {
    throw new Error(movementError.message);
  }
}

export async function updateInventoryCategory(
  categoryId: string,
  companyId: string,
  category: InventoryCategoryFormData
): Promise<InventoryCategory> {
  const { data, error } = await supabase
    .from("inventory_category")
    .update({
      category_name: category.category_name,
      description: category.description || null,
    })
    .eq("id", categoryId)
    .eq("company_id", companyId)
    .select(categoryColumns)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deleteInventoryCategory(
  categoryId: string,
  companyId: string
): Promise<void> {
  const { error } = await supabase
    .from("inventory_category")
    .delete()
    .eq("id", categoryId)
    .eq("company_id", companyId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateSupplier(
  supplierId: string,
  companyId: string,
  supplier: SupplierFormData
): Promise<Supplier> {
  const { data, error } = await supabase
    .from("supplier")
    .update({
      supplier_name: supplier.supplier_name,
      contact_person: supplier.contact_person || null,
      email: supplier.email || null,
      phone: supplier.phone || null,
      address: supplier.address || null,
    })
    .eq("id", supplierId)
    .eq("company_id", companyId)
    .select(supplierColumns)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deleteSupplier(
  supplierId: string,
  companyId: string
): Promise<void> {
  const { error } = await supabase
    .from("supplier")
    .delete()
    .eq("id", supplierId)
    .eq("company_id", companyId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function getArchivedInventoryItems(
  companyId: string
): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from("inventory_item")
    .select(inventoryItemColumns)
    .eq("company_id", companyId)
    .eq("is_active", false)
    .order("item_name");

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function restoreInventoryItem(
  itemId: string,
  companyId: string
): Promise<void> {
  const { error } = await supabase
    .from("inventory_item")
    .update({
      is_active: true,
    })
    .eq("id", itemId)
    .eq("company_id", companyId);

  if (error) {
    throw new Error(error.message);
  }
}
