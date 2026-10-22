"use client";

import { useCallback } from "react";
import { useRequestData } from "@/hooks/useRequestData";
import {
  getBranchStock,
  getInventoryCategories,
  getInventoryItems,
  getStockMovements,
  getSuppliers,
} from "@/lib/services/inventoryService";
import type {
  BranchStock,
  InventoryCategory,
  InventoryItem,
  StockMovement,
  Supplier,
} from "@/types/inventory";

const emptyItems: InventoryItem[] = [];
const emptyCategories: InventoryCategory[] = [];
const emptySuppliers: Supplier[] = [];
const emptyStock: BranchStock[] = [];
const emptyMovements: StockMovement[] = [];

export function useInventory(companyId: string) {
  const load = useCallback(async () => {
    const [items, categories, suppliers, branchStock, movements] = await Promise.all([
      getInventoryItems(companyId),
      getInventoryCategories(companyId),
      getSuppliers(companyId),
      getBranchStock(companyId),
      getStockMovements(companyId, 50),
    ]);
    return { items, categories, suppliers, branchStock, movements };
  }, [companyId]);
  const { data, loading, errorMessage, refresh } = useRequestData(
    companyId,
    Boolean(companyId),
    load,
    "Inventory information could not be loaded."
  );

  return {
    items: data?.items ?? emptyItems,
    categories: data?.categories ?? emptyCategories,
    suppliers: data?.suppliers ?? emptySuppliers,
    branchStock: data?.branchStock ?? emptyStock,
    movements: data?.movements ?? emptyMovements,
    loading,
    errorMessage,
    refreshInventory: refresh,
  };
}
