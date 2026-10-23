"use client";

import { useCallback } from "react";
import { useRequestData } from "@/hooks/useRequestData";
import { getSalesOrders } from "@/lib/services/salesService";
import type { SalesOrder } from "@/types/sales";

const emptyData: SalesOrder[] = [];

export function useSalesOrders(companyId: string | null) {
  const load = useCallback(() => getSalesOrders(companyId ?? ""), [companyId]);
  const { data, loading, errorMessage, refresh } = useRequestData(
    companyId ?? "",
    Boolean(companyId),
    load,
    "Could not load sales orders."
  );

  return {
    salesOrders: data ?? emptyData,
    loading,
    error: errorMessage || null,
    refresh,
  };
}
