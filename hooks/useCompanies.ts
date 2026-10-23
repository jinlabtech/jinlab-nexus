"use client";

import { useCallback } from "react";
import { useRequestData } from "@/hooks/useRequestData";
import { getCompanies } from "@/lib/services/companyService";
import type { Company } from "@/types/company";

const emptyData: Company[] = [];

export function useCompanies() {
  const load = useCallback(() => getCompanies(), []);
  const { data, loading, errorMessage, refresh } = useRequestData(
    "companies",
    true,
    load,
    "Companies could not be loaded."
  );

  return {
    companies: data ?? emptyData,
    loading,
    errorMessage,
    refreshCompanies: refresh,
  };
}
