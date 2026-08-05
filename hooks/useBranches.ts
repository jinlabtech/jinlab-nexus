"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { getBranches } from "@/lib/services/branchService";
import type { Branch } from "@/types/branch";

export function useBranches(companyId: string) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const refreshBranches = useCallback(async () => {
    if (!companyId) {
      setBranches([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const data = await getBranches(companyId);
      setBranches(data);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Branches could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    refreshBranches();
  }, [refreshBranches]);

  return {
    branches,
    loading,
    errorMessage,
    refreshBranches,
  };
}
