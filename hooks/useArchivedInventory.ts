"use client";

import { useCallback } from "react";
import { useRequestData } from "@/hooks/useRequestData";
import { getArchivedInventoryItems } from "@/lib/services/inventoryService";
import type { InventoryItem } from "@/types/inventory";

const emptyData: InventoryItem[] = [];

export function useArchivedInventory(companyId: string) {
  const load = useCallback(() => getArchivedInventoryItems(companyId), [companyId]);
  const { data, loading, errorMessage, refresh } = useRequestData(
    companyId,
    Boolean(companyId),
    load,
    "Archived inventory could not be loaded."
  );

  return {
    items: data ?? emptyData,
    loading,
    errorMessage,
    refreshArchivedInventory: refresh,
  };
}
