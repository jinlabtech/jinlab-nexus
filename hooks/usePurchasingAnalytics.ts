"use client";

import { useMemo } from "react";

import type { InventoryItem } from "@/types/inventory";
import type {
  PurchaseOrder,
} from "@/types/purchasing";

type SupplierSummary = {
  supplier_id: string;
  total_orders: number;
  total_value: number;
};

export function usePurchasingAnalytics(
  purchaseOrders: PurchaseOrder[],
  inventoryItems: InventoryItem[],
  stockByItem: Map<string, number>
) {
  const analytics = useMemo(() => {
    const draftOrders =
      purchaseOrders.filter(
        (order) =>
          order.status === "draft"
      );

    const submittedOrders =
      purchaseOrders.filter(
        (order) =>
          order.status ===
          "submitted"
      );

    const approvedOrders =
      purchaseOrders.filter(
        (order) =>
          order.status ===
          "approved"
      );

    const partialOrders =
      purchaseOrders.filter(
        (order) =>
          order.status ===
          "partially_received"
      );

    const receivedOrders =
      purchaseOrders.filter(
        (order) =>
          order.status ===
          "received"
      );

    const outstandingOrders =
      purchaseOrders.filter(
        (order) =>
          [
            "submitted",
            "approved",
            "partially_received",
          ].includes(
            order.status
          )
      );

    const outstandingValue =
      outstandingOrders.reduce(
        (total, order) =>
          total +
          Number(
            order.total_amount
          ),
        0
      );

    const receivedValue =
      receivedOrders.reduce(
        (total, order) =>
          total +
          Number(
            order.total_amount
          ),
        0
      );

    const supplierMap =
      new Map<
        string,
        SupplierSummary
      >();

    for (
      const order of
      purchaseOrders
    ) {
      const current =
        supplierMap.get(
          order.supplier_id
        ) ?? {
          supplier_id:
            order.supplier_id,
          total_orders: 0,
          total_value: 0,
        };

      current.total_orders += 1;

      current.total_value +=
        Number(
          order.total_amount
        );

      supplierMap.set(
        order.supplier_id,
        current
      );
    }

    const supplierSummary =
      Array.from(
        supplierMap.values()
      ).sort(
        (a, b) =>
          b.total_value -
          a.total_value
      );

    const lowStockItems =
      inventoryItems.filter(
        (item) => {
          const quantity =
            stockByItem.get(
              item.id
            ) ?? 0;

          return (
            quantity <=
            item.minimum_stock
          );
        }
      );

    return {
      totalOrders:
        purchaseOrders.length,

      draftOrders:
        draftOrders.length,

      submittedOrders:
        submittedOrders.length,

      approvedOrders:
        approvedOrders.length,

      partialOrders:
        partialOrders.length,

      receivedOrders:
        receivedOrders.length,

      outstandingValue,

      receivedValue,

      supplierSummary,

      lowStockItems,
    };
  }, [
    purchaseOrders,
    inventoryItems,
    stockByItem,
  ]);

  return analytics;
}
