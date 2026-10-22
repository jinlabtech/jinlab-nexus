"use client";

import { useCallback } from "react";
import { useRequestData } from "@/hooks/useRequestData";
import { getAuditLogs } from "@/lib/services/auditLogService";
import type { AuditLog } from "@/types/auditLog";

const emptyData: AuditLog[] = [];

export function useAuditLogs(companyId: string, limit = 5) {
  const load = useCallback(() => getAuditLogs(companyId, limit), [companyId, limit]);
  const { data, loading, errorMessage, refresh } = useRequestData(
    JSON.stringify([companyId, limit]),
    Boolean(companyId),
    load,
    "Audit activity could not be loaded."
  );

  return {
    auditLogs: data ?? emptyData,
    loading,
    errorMessage,
    refreshAuditLogs: refresh,
  };
}
