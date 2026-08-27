"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  getCustomers,
} from "@/lib/services/customerService";

import type {
  Customer,
} from "@/types/customer";

export function useCustomers(
  companyId: string,
  includeArchived = false
) {
  const [customers, setCustomers] =
    useState<Customer[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const refreshCustomers =
    useCallback(async () => {
      if (!companyId) {
        setCustomers([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage("");

      try {
        const data =
          await getCustomers(
            companyId,
            includeArchived
          );

        setCustomers(data);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Customers could not be loaded."
        );
      } finally {
        setLoading(false);
      }
    }, [
      companyId,
      includeArchived,
    ]);

  useEffect(() => {
    refreshCustomers();
  }, [refreshCustomers]);

  return {
    customers,
    loading,
    errorMessage,
    refreshCustomers,
  };
}
