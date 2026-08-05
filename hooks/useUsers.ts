"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { getCompanyUsers } from "@/lib/services/userService";
import type { UserProfile } from "@/types/userProfile";

export function useUsers(companyId: string) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const refreshUsers = useCallback(async () => {
    if (!companyId) {
      setUsers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const data = await getCompanyUsers(companyId);
      setUsers(data);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Users could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  return {
    users,
    loading,
    errorMessage,
    refreshUsers,
  };
}
