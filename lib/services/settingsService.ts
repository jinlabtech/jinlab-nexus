import { supabase } from "@/lib/supabase";

import type {
  CompanyAccountingSettings,
  CompanyFinanceSettings,
  CompanySecuritySettings,
  SettingsChangeLog,
} from "@/types/settings";

export async function getCurrentCompanyId(): Promise<string> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    throw new Error(authError.message);
  }

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const { data, error } = await supabase
    .from("user_profile")
    .select("company_id")
    .eq("user_id", user.id)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.company_id) {
    throw new Error("No company is assigned to this user.");
  }

  return data.company_id;
}

export async function getFinanceSettings(): Promise<CompanyFinanceSettings> {
  const companyId = await getCurrentCompanyId();

  const { data, error } = await supabase
    .from("company_finance_settings")
    .select("*")
    .eq("company_id", companyId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as CompanyFinanceSettings;
}

export async function saveFinanceSettings(
  settings: CompanyFinanceSettings
): Promise<void> {
  const { error } = await supabase.rpc(
    "update_company_finance_settings",
    {
      p_base_currency: settings.base_currency,
      p_financial_year_start_month:
        settings.financial_year_start_month,
      p_accounting_basis: settings.accounting_basis,

      p_vat_registered: settings.vat_registered,
      p_vat_number: settings.vat_number,
      p_default_vat_rate: settings.default_vat_rate,
      p_prices_include_vat: settings.prices_include_vat,

      p_default_customer_payment_days:
        settings.default_customer_payment_days,
      p_default_supplier_payment_days:
        settings.default_supplier_payment_days,

      p_allow_customer_credit:
        settings.allow_customer_credit,

      p_default_customer_credit_limit:
        settings.default_customer_credit_limit,

      p_rounding_method: settings.rounding_method,

      p_lock_accounting_before:
        settings.lock_accounting_before || null,
    }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function getAccountingSettings(): Promise<CompanyAccountingSettings> {
  const companyId = await getCurrentCompanyId();

  const { data, error } = await supabase
    .from("company_accounting_settings")
    .select("*")
    .eq("company_id", companyId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as CompanyAccountingSettings;
}

export async function saveAccountingSettings(
  settings: CompanyAccountingSettings
): Promise<void> {
  const { error } = await supabase.rpc(
    "update_company_accounting_settings",
    {
      p_accounting_enabled:
        settings.accounting_enabled,

      p_automatic_journals:
        settings.automatic_journals,

      p_automatic_invoice_posting:
        settings.automatic_invoice_posting,

      p_automatic_payment_posting:
        settings.automatic_payment_posting,

      p_automatic_purchase_posting:
        settings.automatic_purchase_posting,

      p_automatic_expense_classification:
        settings.automatic_expense_classification,

      p_automatic_bank_matching:
        settings.automatic_bank_matching,

      p_nexus_accountant_enabled:
        settings.nexus_accountant_enabled,

      p_ai_explanations_enabled:
        settings.ai_explanations_enabled,

      p_ai_recommendations_enabled:
        settings.ai_recommendations_enabled,

      p_ai_auto_classify_enabled:
        settings.ai_auto_classify_enabled,

      p_ai_auto_post_enabled:
        settings.ai_auto_post_enabled,

      p_ai_confidence_threshold:
        settings.ai_confidence_threshold,

      p_transaction_approval_threshold:
        settings.transaction_approval_threshold,

      p_require_manual_journal_approval:
        settings.require_manual_journal_approval,

      p_require_vat_adjustment_approval:
        settings.require_vat_adjustment_approval,

      p_require_period_reopen_approval:
        settings.require_period_reopen_approval,

      p_require_tax_submission_approval:
        settings.require_tax_submission_approval,

      p_uncertain_transaction_action:
        settings.uncertain_transaction_action,
    }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export type CompanyProfileSettings = {
  company_id: string;
  legal_name: string | null;
  trading_name: string | null;
  registration_number: string | null;
  business_type: string | null;
  industry: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  physical_address: string | null;
  postal_address: string | null;
  country_code: string;
  province: string | null;
  city: string | null;
  timezone: string;
};

export async function getCompanyProfileSettings(): Promise<CompanyProfileSettings> {
  const companyId = await getCurrentCompanyId();

  const { data, error } = await supabase
    .from("company_profile_settings")
    .select("*")
    .eq("company_id", companyId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as CompanyProfileSettings;
}

export async function saveCompanyProfileSettings(
  settings: CompanyProfileSettings
): Promise<void> {
  const { error } = await supabase.rpc(
    "update_company_profile_settings",
    {
      p_legal_name:
        settings.legal_name ?? "",

      p_trading_name:
        settings.trading_name ?? "",

      p_registration_number:
        settings.registration_number ?? "",

      p_business_type:
        settings.business_type ?? "",

      p_industry:
        settings.industry ?? "",

      p_email:
        settings.email ?? "",

      p_phone:
        settings.phone ?? "",

      p_website:
        settings.website ?? "",

      p_physical_address:
        settings.physical_address ?? "",

      p_postal_address:
        settings.postal_address ?? "",

      p_country_code:
        settings.country_code,

      p_province:
        settings.province ?? "",

      p_city:
        settings.city ?? "",

      p_timezone:
        settings.timezone,
    }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function getSecuritySettings(): Promise<CompanySecuritySettings> {
  const companyId = await getCurrentCompanyId();

  const { data, error } = await supabase
    .from("company_security_settings")
    .select("*")
    .eq("company_id", companyId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as CompanySecuritySettings;
}

export async function saveSecuritySettings(
  settings: CompanySecuritySettings
): Promise<void> {
  const { error } = await supabase.rpc(
    "update_company_security_settings",
    {
      p_require_sensitive_action_confirmation:
        settings.require_sensitive_action_confirmation,

      p_require_stock_adjustment_approval:
        settings.require_stock_adjustment_approval,

      p_require_invoice_cancellation_approval:
        settings.require_invoice_cancellation_approval,

      p_require_financial_delete_approval:
        settings.require_financial_delete_approval,

      p_prevent_role_escalation:
        settings.prevent_role_escalation,

      p_audit_admin_changes:
        settings.audit_admin_changes,

      p_session_timeout_minutes:
        settings.session_timeout_minutes,
    }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function getSettingsAuditLog(): Promise<SettingsChangeLog[]> {
  const companyId = await getCurrentCompanyId();

  const { data, error } = await supabase
    .from("settings_change_log")
    .select("*")
    .eq("company_id", companyId)
    .order("changed_at", {
      ascending: false,
    })
    .limit(250);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as SettingsChangeLog[];
}


// ============================================================
// BRANDING & DOCUMENT SETTINGS
// ============================================================

export type CompanyDocumentSettings = {
  company_id: string;
  logo_path: string | null;
  document_display_name: string | null;

  show_registration_number: boolean;
  show_vat_number: boolean;
  show_company_address: boolean;
  show_company_phone: boolean;
  show_company_email: boolean;
  show_company_website: boolean;

  document_footer: string | null;
  invoice_footer: string | null;
  quotation_footer: string | null;

  default_invoice_template: string;
  default_quotation_template: string;

  updated_by?: string | null;
  updated_at?: string | null;
};


export async function getCompanyDocumentSettings(): Promise<
  CompanyDocumentSettings
> {
  const companyId =
    await getCurrentCompanyId();

  const {
    data,
    error,
  } = await supabase
    .from("company_document_settings")
    .select("*")
    .eq("company_id", companyId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as CompanyDocumentSettings;
}


export async function saveCompanyDocumentSettings(
  settings: Omit<
    CompanyDocumentSettings,
    | "company_id"
    | "updated_by"
    | "updated_at"
  >
): Promise<void> {
  const {
    error,
  } = await supabase.rpc(
    "update_company_document_settings",
    {
      p_logo_path:
        settings.logo_path,

      p_document_display_name:
        settings.document_display_name,

      p_show_registration_number:
        settings.show_registration_number,

      p_show_vat_number:
        settings.show_vat_number,

      p_show_company_address:
        settings.show_company_address,

      p_show_company_phone:
        settings.show_company_phone,

      p_show_company_email:
        settings.show_company_email,

      p_show_company_website:
        settings.show_company_website,

      p_document_footer:
        settings.document_footer,

      p_invoice_footer:
        settings.invoice_footer,

      p_quotation_footer:
        settings.quotation_footer,

      p_default_invoice_template:
        settings.default_invoice_template,

      p_default_quotation_template:
        settings.default_quotation_template,
    }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function saveCompanyDocumentLogo(logoPath: string | null): Promise<void> {
  const { error } = await supabase.rpc("update_company_document_logo", {
    p_logo_path: logoPath,
  });
  if (error) throw new Error(error.message);
}

export async function getDocumentLogoUrl(logoPath: string | null): Promise<string | null> {
  if (!logoPath) return null;
  const { data, error } = await supabase.storage
    .from("company-logos")
    .createSignedUrl(logoPath, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
