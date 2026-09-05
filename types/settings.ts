export type AccountingBasis = "accrual" | "cash";

export type RoundingMethod =
  | "standard"
  | "up"
  | "down"
  | "none";

export type UncertainTransactionAction =
  | "ask"
  | "hold"
  | "manual_review";

export type CompanyFinanceSettings = {
  company_id: string;
  base_currency: string;
  financial_year_start_month: number;
  accounting_basis: AccountingBasis;

  vat_registered: boolean;
  vat_number: string | null;
  default_vat_rate: number;
  prices_include_vat: boolean;

  default_customer_payment_days: number;
  default_supplier_payment_days: number;

  allow_customer_credit: boolean;
  default_customer_credit_limit: number;

  rounding_method: RoundingMethod;
  lock_accounting_before: string | null;

  updated_by?: string | null;
  updated_at?: string;
};

export type CompanyAccountingSettings = {
  company_id: string;

  accounting_enabled: boolean;

  automatic_journals: boolean;
  automatic_invoice_posting: boolean;
  automatic_payment_posting: boolean;
  automatic_purchase_posting: boolean;

  automatic_expense_classification: boolean;
  automatic_bank_matching: boolean;

  nexus_accountant_enabled: boolean;

  ai_explanations_enabled: boolean;
  ai_recommendations_enabled: boolean;
  ai_auto_classify_enabled: boolean;
  ai_auto_post_enabled: boolean;

  ai_confidence_threshold: number;
  transaction_approval_threshold: number;

  require_manual_journal_approval: boolean;
  require_vat_adjustment_approval: boolean;
  require_period_reopen_approval: boolean;
  require_tax_submission_approval: boolean;

  uncertain_transaction_action: UncertainTransactionAction;

  updated_by?: string | null;
  updated_at?: string;
};

export type CompanyBankAccount = {
  id: string;
  company_id: string;

  bank_name: string;
  account_name: string;
  account_number: string;

  account_type: string | null;
  branch_code: string | null;
  swift_code: string | null;

  currency: string;

  is_default: boolean;
  show_on_documents: boolean;
  is_active: boolean;

  created_at?: string;
  updated_at?: string;
};

export type CompanySecuritySettings = {
  company_id: string;

  require_sensitive_action_confirmation: boolean;
  require_stock_adjustment_approval: boolean;
  require_invoice_cancellation_approval: boolean;
  require_financial_delete_approval: boolean;

  prevent_role_escalation: boolean;
  audit_admin_changes: boolean;

  session_timeout_minutes: number;

  updated_by?: string | null;
  updated_at?: string;
};

export type SettingsChangeLog = {
  id: string;
  company_id: string;
  setting_area: string;
  action: string;
  changed_by: string | null;
  changed_at: string;
  details: Record<string, unknown> | null;
};
