"use client";

import { useCallback, useMemo } from "react";
import { useRequestData } from "@/hooks/useRequestData";
import { getCurrentUserPermissions, hasPermission } from "@/lib/services/permissionService";
import type { PermissionName } from "@/types/permissions";

const emptyPermissions: PermissionName[] = [];

export function usePermissions() {
  const { data, loading, errorMessage, refresh } = useRequestData(
    "permissions",
    true,
    getCurrentUserPermissions,
    "Permissions could not be loaded."
  );
  const permissions = data ?? emptyPermissions;
  const permissionSet = useMemo(() => new Set(permissions), [permissions]);

  const can = useCallback((permission: PermissionName) => {
    return permissionSet.has(permission);
  }, [permissionSet]);

  const verifyPermission = useCallback((permission: PermissionName) => {
    return hasPermission(permission);
  }, []);

  return {
    permissions,
    loading,
    errorMessage,
    can,
    verifyPermission,
    refreshPermissions: refresh,
  };
}
