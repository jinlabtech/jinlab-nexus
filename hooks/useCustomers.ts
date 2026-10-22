"use client";

import { useCallback } from "react";
import { useRequestData } from "@/hooks/useRequestData";
import { getCustomers } from "@/lib/services/customerService";
import type { Customer } from "@/types/customer";

const emptyData: Customer[] = [];

export function useCustomers(companyId: string, includeArchived = false) {
  const load = useCallback(() => getCustomers(companyId, includeArchived), [companyId, includeArchived]);
  const { data, loading, errorMessage, refresh } = useRequestData(
    JSON.stringify([companyId, includeArchived]),
    Boolean(companyId),
    load,
    "Customers could not be loaded."
  );

  return {
    customers: data ?? emptyData,
    loading,
    errorMessage,
    refreshCustomers: refresh,
  };
}
