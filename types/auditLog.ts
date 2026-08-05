export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "view"
  | "login"
  | "logout";

export type AuditLog = {
  id: string;
  company_id: string | null;
  user_id: string | null;
  action: string;
  module: string;
  record_id: string | null;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type CreateAuditLogData = {
  company_id: string;
  action: AuditAction;
  module: string;
  record_id?: string | null;
  description: string;
  metadata?: Record<string, unknown>;
};
