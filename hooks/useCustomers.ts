"use client";

import {
  useCallback,
  useEffect,
  useState,
  useRef,
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

  const requestVersion = useRef(0);

  const refreshCustomers =
    useCallback(async () => {
      const version = ++requestVersion.current;
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

        if (version !== requestVersion.current) return;
        setCustomers(data);
      } catch (error) {
        if (version !== requestVersion.current) return;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Customers could not be loaded."
        );
      } finally {
        if (version === requestVersion.current) setLoading(false);
      }
    }, [
      companyId,
      includeArchived,
    ]);

  useEffect(() => {
    void refreshCustomers();
    return () => { requestVersion.current += 1; };
  }, [refreshCustomers]);

  return {
    customers,
    loading,
    errorMessage,
    refreshCustomers,
  };
}
