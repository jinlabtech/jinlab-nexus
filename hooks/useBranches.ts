"use client";

import { useCallback } from "react";
import { useRequestData } from "@/hooks/useRequestData";
import { getBranches } from "@/lib/services/branchService";
import type { Branch } from "@/types/branch";

const emptyData: Branch[] = [];

export function useBranches(companyId: string) {
  const load = useCallback(() => getBranches(companyId), [companyId]);
  const { data, loading, errorMessage, refresh } = useRequestData(
    companyId,
    Boolean(companyId),
    load,
    "Branches could not be loaded."
  );

  return {
    branches: data ?? emptyData,
    loading,
    errorMessage,
    refreshBranches: refresh,
  };
}
