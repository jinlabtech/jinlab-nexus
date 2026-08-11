"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  getPurchaseOrders,
  getPurchaseReceipts,
} from "@/lib/services/purchasingService";

import type {
  PurchaseOrder,
  PurchaseReceipt,
} from "@/types/purchasing";

export function usePurchasing(
  companyId: string
) {
  const [purchaseOrders, setPurchaseOrders] =
    useState<PurchaseOrder[]>([]);

  const [receipts, setReceipts] =
    useState<PurchaseReceipt[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const refreshPurchasing =
    useCallback(async () => {
      if (!companyId) {
        setPurchaseOrders([]);
        setReceipts([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage("");

      try {
        const [
          ordersData,
          receiptsData,
        ] = await Promise.all([
          getPurchaseOrders(
            companyId
          ),
          getPurchaseReceipts(
            companyId
          ),
        ]);

        setPurchaseOrders(
          ordersData
        );

        setReceipts(
          receiptsData
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Purchasing information could not be loaded."
        );
      } finally {
        setLoading(false);
      }
    }, [companyId]);

  useEffect(() => {
    refreshPurchasing();
  }, [refreshPurchasing]);

  return {
    purchaseOrders,
    receipts,
    loading,
    errorMessage,
    refreshPurchasing,
  };
}
