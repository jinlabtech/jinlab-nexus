"use client";

import { useCallback } from "react";
import { useRequestData } from "@/hooks/useRequestData";
import { getQuotations } from "@/lib/services/quotationService";
import type { Quotation } from "@/types/quotation";

const emptyData: Quotation[] = [];

export function useQuotations(companyId: string) {
  const load = useCallback(() => getQuotations(companyId), [companyId]);
  const { data, loading, errorMessage, refresh } = useRequestData(
    companyId,
    Boolean(companyId),
    load,
    "Quotations could not be loaded."
  );

  return {
    quotations: data ?? emptyData,
    loading,
    errorMessage,
    refreshQuotations: refresh,
  };
}
