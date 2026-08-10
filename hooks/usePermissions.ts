"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/services/permissionService";

import type { PermissionName } from "@/types/permissions";

export function usePermissions() {
  const [permissions, setPermissions] = useState<
    PermissionName[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const refreshPermissions = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const data =
        await getCurrentUserPermissions();

      setPermissions(data);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Permissions could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshPermissions();
  }, [refreshPermissions]);

  const permissionSet = useMemo(
    () => new Set(permissions),
    [permissions]
  );

  function can(permission: PermissionName) {
    return permissionSet.has(permission);
  }

  async function verifyPermission(
    permission: PermissionName
  ) {
    return hasPermission(permission);
  }

  return {
    permissions,
    loading,
    errorMessage,
    can,
    verifyPermission,
    refreshPermissions,
  };
}
