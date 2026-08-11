"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  getArchivedInventoryItems,
} from "@/lib/services/inventoryService";

import type {
  InventoryItem,
} from "@/types/inventory";

export function useArchivedInventory(
  companyId: string
) {
  const [items, setItems] =
    useState<InventoryItem[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const refreshArchivedInventory =
    useCallback(async () => {
      if (!companyId) {
        setItems([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage("");

      try {
        const data =
          await getArchivedInventoryItems(
            companyId
          );

        setItems(data);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Archived inventory could not be loaded."
        );
      } finally {
        setLoading(false);
      }
    }, [companyId]);

  useEffect(() => {
    refreshArchivedInventory();
  }, [refreshArchivedInventory]);

  return {
    items,
    loading,
    errorMessage,
    refreshArchivedInventory,
  };
}
