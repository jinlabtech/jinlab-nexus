"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

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

export function useInventory(
  companyId: string
) {
  const [items, setItems] = useState<
    InventoryItem[]
  >([]);

  const [categories, setCategories] =
    useState<InventoryCategory[]>([]);

  const [suppliers, setSuppliers] =
    useState<Supplier[]>([]);

  const [branchStock, setBranchStock] =
    useState<BranchStock[]>([]);

  const [movements, setMovements] =
    useState<StockMovement[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const refreshInventory =
    useCallback(async () => {
      if (!companyId) {
        setItems([]);
        setCategories([]);
        setSuppliers([]);
        setBranchStock([]);
        setMovements([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage("");

      try {
        const [
          itemData,
          categoryData,
          supplierData,
          stockData,
          movementData,
        ] = await Promise.all([
          getInventoryItems(companyId),
          getInventoryCategories(
            companyId
          ),
          getSuppliers(companyId),
          getBranchStock(companyId),
          getStockMovements(
            companyId,
            50
          ),
        ]);

        setItems(itemData);
        setCategories(categoryData);
        setSuppliers(supplierData);
        setBranchStock(stockData);
        setMovements(movementData);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Inventory information could not be loaded."
        );
      } finally {
        setLoading(false);
      }
    }, [companyId]);

  useEffect(() => {
    refreshInventory();
  }, [refreshInventory]);

  return {
    items,
    categories,
    suppliers,
    branchStock,
    movements,
    loading,
    errorMessage,
    refreshInventory,
  };
}
