import { supabase } from "@/lib/supabase";

import type {
  AuditLog,
  CreateAuditLogData,
} from "@/types/auditLog";

export async function createAuditLog(
  log: CreateAuditLogData
): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error(
      userError?.message ??
        "An authenticated user is required to create an audit log."
    );
  }

  const { error } = await supabase
    .from("audit_log")
    .insert({
      company_id: log.company_id,
      user_id: user.id,
      action: log.action,
      module: log.module,
      record_id: log.record_id ?? null,
      description: log.description,
      metadata: log.metadata ?? {},
    });

  if (error) {
    throw new Error(error.message);
  }
}

export async function getAuditLogs(
  companyId: string,
  limit = 50
): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select(
      "id, company_id, user_id, action, module, record_id, description, metadata, created_at"
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}
