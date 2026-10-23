"use client";

import { useCallback } from "react";
import { useRequestData } from "@/hooks/useRequestData";
import { getCompanyUsers } from "@/lib/services/userService";
import type { UserProfile } from "@/types/userProfile";

const emptyData: UserProfile[] = [];

export function useUsers(companyId: string) {
  const load = useCallback(() => getCompanyUsers(companyId), [companyId]);
  const { data, loading, errorMessage, refresh } = useRequestData(
    companyId,
    Boolean(companyId),
    load,
    "Users could not be loaded."
  );

  return {
    users: data ?? emptyData,
    loading,
    errorMessage,
    refreshUsers: refresh,
  };
}
