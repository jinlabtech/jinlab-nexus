import { clientRequest } from "@/lib/clientRequest";
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

// Share simultaneous navigation checks, but never cache completed permissions.
const pendingPermissions = new Map<string, Promise<PermissionName[]>>();

export async function getCurrentUserPermissions(): Promise<PermissionName[]> {
  const { data: { session }, error: sessionError } = await clientRequest(supabase.auth.getSession(), "Permissions are waiting for your sign-in session. Please retry.");
  if (sessionError) throw new Error(sessionError.message);
  if (!session) return [];
  const key = session.access_token;
  const pending = pendingPermissions.get(key);
  if (pending) return pending;
  const request = (async () => {
    const [{ data, error }, secondhand] = await Promise.all([
      clientRequest(supabase.rpc("get_current_user_permissions")
        .abortSignal(AbortSignal.timeout(15_000)), "Permissions could not be loaded in time. Please retry."),
      // Dedicated branch grants are authoritative for this sensitive module.
      // Fail closed without hiding existing Nexus modules during a rollout.
      Promise.resolve(supabase.rpc("sh_navigation_access")
        .abortSignal(AbortSignal.timeout(8_000))).catch(() => ({ data: false, error: true })),
    ]);
    if (error) throw new Error(error.message);
    const permissions = (data?.map((row: { permission_name: string }) => row.permission_name)
      .filter((name: string) => Boolean(name) && !name.startsWith("secondhand.")) ?? []) as PermissionName[];
    if (!secondhand.error && secondhand.data === true) permissions.push("secondhand.view");
    return permissions;
  })();
  pendingPermissions.set(key, request);
  try { return await request; }
  finally { if (pendingPermissions.get(key) === request) pendingPermissions.delete(key); }
}
