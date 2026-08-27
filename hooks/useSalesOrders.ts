"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  getSalesOrders,
} from "@/lib/services/salesService";

import type {
  SalesOrder,
} from "@/types/sales";

export function useSalesOrders(
  companyId: string | null
) {
  const [
    salesOrders,
    setSalesOrders,
  ] = useState<SalesOrder[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const loadSalesOrders =
    useCallback(async () => {
      if (!companyId) {
        setSalesOrders([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const data =
          await getSalesOrders(
            companyId
          );

        setSalesOrders(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not load sales orders."
        );
      } finally {
        setLoading(false);
      }
    }, [companyId]);

  useEffect(() => {
    loadSalesOrders();
  }, [loadSalesOrders]);

  return {
    salesOrders,
    loading,
    error,
    refresh:
      loadSalesOrders,
  };
}
