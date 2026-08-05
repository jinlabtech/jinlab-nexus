"use client";

import { useCallback, useEffect, useState } from "react";

import { getCompanies } from "@/lib/services/companyService";
import type { Company } from "@/types/company";

export function useCompanies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const refreshCompanies = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const data = await getCompanies();
      setCompanies(data);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Companies could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCompanies();
  }, [refreshCompanies]);

  return {
    companies,
    loading,
    errorMessage,
    refreshCompanies,
  };
}
