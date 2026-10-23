"use client";

import { useCallback } from "react";
import { useRequestData } from "@/hooks/useRequestData";
import { getPurchaseOrders, getPurchaseReceipts } from "@/lib/services/purchasingService";
import type { PurchaseOrder, PurchaseReceipt } from "@/types/purchasing";

const emptyOrders: PurchaseOrder[] = [];
const emptyReceipts: PurchaseReceipt[] = [];

export function usePurchasing(companyId: string) {
  const load = useCallback(async () => {
    const [purchaseOrders, receipts] = await Promise.all([
      getPurchaseOrders(companyId),
      getPurchaseReceipts(companyId),
    ]);
    return { purchaseOrders, receipts };
  }, [companyId]);
  const { data, loading, errorMessage, refresh } = useRequestData(
    companyId,
    Boolean(companyId),
    load,
    "Purchasing information could not be loaded."
  );

  return {
    purchaseOrders: data?.purchaseOrders ?? emptyOrders,
    receipts: data?.receipts ?? emptyReceipts,
    loading,
    errorMessage,
    refreshPurchasing: refresh,
  };
}
