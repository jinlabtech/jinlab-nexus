import { supabase } from "@/lib/supabase";

import type { PermissionName } from "@/types/permissions";

export async function hasPermission(
  permission: PermissionName
): Promise<boolean> {
  const { data, error } = await supabase.rpc(
    "has_permission",
    {
      requested_permission: permission,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

export async function getCurrentUserPermissions(): Promise<PermissionName[]> {
  const { data, error } = await supabase.rpc(
    "get_current_user_permissions"
  );

  if (error) {
    throw new Error(error.message);
  }

  const permissions =
    data
      ?.map((row: { permission_name: string }) =>
        row.permission_name
      )
      .filter(Boolean) ?? [];

  return permissions as PermissionName[];
}
