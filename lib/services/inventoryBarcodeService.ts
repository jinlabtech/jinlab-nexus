import { supabase } from "@/lib/supabase";

export type InventoryBarcodeLabel = {
  id: string;
  item_name: string;
  sku: string;
  barcode: string;
  selling_price: number;
  copies: number;
};

export type InventoryBarcodeWorkspace = {
  ok: boolean;
  selected_branch_id: string | null;
  branches: Array<{
    id: string;
    name: string;
  }>;
  summary: {
    active_items: number;
    with_barcode: number;
    without_barcode: number;
  };
};

export async function getInventoryBarcodeWorkspace(
  branchId: string | null = null
): Promise<InventoryBarcodeWorkspace> {
  const { data, error } = await supabase.rpc(
    "get_inventory_barcode_workspace",
    { p_branch_id: branchId }
  );

  if (error) throw new Error(error.message);

  return data as InventoryBarcodeWorkspace;
}

export async function generateInventoryBarcode(
  inventoryItemId: string
): Promise<string> {
  const { data, error } = await supabase.rpc(
    "generate_inventory_barcode",
    { p_inventory_item_id: inventoryItemId }
  );

  if (error) throw new Error(error.message);

  const barcode = data?.barcode;

  if (!barcode) {
    throw new Error("Nexus did not return a barcode.");
  }

  return String(barcode);
}

export async function getInventoryBarcodeLabels(
  items: Array<{
    inventory_item_id: string;
    copies: number;
  }>
): Promise<InventoryBarcodeLabel[]> {
  const { data, error } = await supabase.rpc(
    "get_inventory_barcode_labels",
    { p_items: items }
  );

  if (error) throw new Error(error.message);

  return (data ?? []) as InventoryBarcodeLabel[];
}
