"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  getQuotations,
} from "@/lib/services/quotationService";

import type {
  Quotation,
} from "@/types/quotation";

export function useQuotations(
  companyId: string
) {
  const [quotations, setQuotations] =
    useState<Quotation[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const refreshQuotations =
    useCallback(async () => {
      if (!companyId) {
        setQuotations([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage("");

      try {
        const data =
          await getQuotations(
            companyId
          );

        setQuotations(data);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Quotations could not be loaded."
        );
      } finally {
        setLoading(false);
      }
    }, [companyId]);

  useEffect(() => {
    refreshQuotations();
  }, [refreshQuotations]);

  return {
    quotations,
    loading,
    errorMessage,
    refreshQuotations,
  };
}
