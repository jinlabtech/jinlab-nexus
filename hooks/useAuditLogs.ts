"use client";

import { useCallback, useEffect, useState } from "react";

import { getAuditLogs } from "@/lib/services/auditLogService";
import type { AuditLog } from "@/types/auditLog";

export function useAuditLogs(
  companyId: string,
  limit = 5
) {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const refreshAuditLogs = useCallback(async () => {
    if (!companyId) {
      setAuditLogs([]);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const data = await getAuditLogs(companyId, limit);
      setAuditLogs(data);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Audit activity could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }, [companyId, limit]);

  useEffect(() => {
    refreshAuditLogs();
  }, [refreshAuditLogs]);

  return {
    auditLogs,
    loading,
    errorMessage,
    refreshAuditLogs,
  };
}
