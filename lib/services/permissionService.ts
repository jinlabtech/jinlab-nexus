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

export async function getCurrentUserPermissions(): Promise<
  PermissionName[]
> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error(
      userError?.message ??
        "An authenticated user is required."
    );
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("user_profile")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile) {
    throw new Error(
      profileError?.message ??
        "Your user profile could not be loaded."
    );
  }

  const {
    data: role,
    error: roleError,
  } = await supabase
    .from("roles")
    .select("id")
    .eq("role_name", profile.role)
    .single();

  if (roleError || !role) {
    throw new Error(
      roleError?.message ??
        "Your assigned role could not be loaded."
    );
  }

  const {
    data: rolePermissions,
    error: permissionsError,
  } = await supabase
    .from("role_permissions")
    .select(
      `
        permission:permissions (
          permission_name
        )
      `
    )
    .eq("role_id", role.id);

  if (permissionsError) {
    throw new Error(permissionsError.message);
  }

  const permissions =
    rolePermissions
      ?.map((item) => {
        const permission = Array.isArray(
          item.permission
        )
          ? item.permission[0]
          : item.permission;

        return permission?.permission_name;
      })
      .filter(Boolean) ?? [];

  return permissions as PermissionName[];
}
