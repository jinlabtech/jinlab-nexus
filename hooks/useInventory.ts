"use client";

import {
  useCallback,
  useEffect,
  useState,
  useRef,
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

  const requestVersion = useRef(0);

  const refreshInventory =
    useCallback(async () => {
      const version = ++requestVersion.current;
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

        if (version !== requestVersion.current) return;
        setItems(itemData);
        setCategories(categoryData);
        setSuppliers(supplierData);
        setBranchStock(stockData);
        setMovements(movementData);
      } catch (error) {
        if (version !== requestVersion.current) return;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Inventory information could not be loaded."
        );
      } finally {
        if (version === requestVersion.current) setLoading(false);
      }
    }, [companyId]);

  useEffect(() => {
    void refreshInventory();
    return () => { requestVersion.current += 1; };
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
