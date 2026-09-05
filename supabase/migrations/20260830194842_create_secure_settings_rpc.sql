-- ============================================================
-- JINLAB NEXUS
-- Sprint 18.14B
-- Secure Settings RPC Layer
-- ============================================================


-- ============================================================
-- 1. PERMISSION CHECK HELPER
-- Uses existing roles / role_permissions / permissions.
-- ============================================================

create or replace function public.current_user_has_permission(
  requested_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profile up
    join public.roles r
      on r.role_name = up.role
    join public.role_permissions rp
      on rp.role_id = r.id
    join public.permissions p
      on p.id = rp.permission_id
    where up.user_id = auth.uid()
      and p.permission_name = requested_permission
  );
$$;


-- ============================================================
-- 2. CURRENT COMPANY HELPER
-- ============================================================

create or replace function public.current_settings_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id
  from public.user_profile
  where user_id = auth.uid()
  limit 1;
$$;


-- ============================================================
-- 3. AUDIT HELPER
-- ============================================================

create or replace function public.log_settings_change(
  p_company_id uuid,
  p_setting_area text,
  p_action text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.settings_change_log (
    company_id,
    setting_area,
    action,
    changed_by,
    details
  )
  values (
    p_company_id,
    p_setting_area,
    p_action,
    auth.uid(),
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;


-- ============================================================
-- 4. UPDATE COMPANY PROFILE
-- ============================================================

create or replace function public.update_company_profile_settings(
  p_legal_name text,
  p_trading_name text,
  p_registration_number text,
  p_business_type text,
  p_industry text,
  p_email text,
  p_phone text,
  p_website text,
  p_physical_address text,
  p_postal_address text,
  p_country_code text,
  p_province text,
  p_city text,
  p_timezone text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if not public.current_user_has_permission(
    'settings.company.manage'
  ) then
    raise exception 'Permission denied: settings.company.manage';
  end if;

  v_company_id := public.current_settings_company_id();

  if v_company_id is null then
    raise exception 'No company is assigned to this user';
  end if;

  if nullif(trim(p_legal_name), '') is null then
    raise exception 'Legal company name is required';
  end if;

  insert into public.company_profile_settings (
    company_id,
    legal_name,
    trading_name,
    registration_number,
    business_type,
    industry,
    email,
    phone,
    website,
    physical_address,
    postal_address,
    country_code,
    province,
    city,
    timezone,
    updated_by
  )
  values (
    v_company_id,
    trim(p_legal_name),
    nullif(trim(p_trading_name), ''),
    nullif(trim(p_registration_number), ''),
    nullif(trim(p_business_type), ''),
    nullif(trim(p_industry), ''),
    nullif(trim(p_email), ''),
    nullif(trim(p_phone), ''),
    nullif(trim(p_website), ''),
    nullif(trim(p_physical_address), ''),
    nullif(trim(p_postal_address), ''),
    coalesce(nullif(trim(p_country_code), ''), 'ZA'),
    nullif(trim(p_province), ''),
    nullif(trim(p_city), ''),
    coalesce(
      nullif(trim(p_timezone), ''),
      'Africa/Johannesburg'
    ),
    auth.uid()
  )
  on conflict (company_id)
  do update set
    legal_name = excluded.legal_name,
    trading_name = excluded.trading_name,
    registration_number = excluded.registration_number,
    business_type = excluded.business_type,
    industry = excluded.industry,
    email = excluded.email,
    phone = excluded.phone,
    website = excluded.website,
    physical_address = excluded.physical_address,
    postal_address = excluded.postal_address,
    country_code = excluded.country_code,
    province = excluded.province,
    city = excluded.city,
    timezone = excluded.timezone;

  -- Keep core company display name synchronized.
  update public.company
  set company_name = trim(p_legal_name)
  where id = v_company_id;

  perform public.log_settings_change(
    v_company_id,
    'company_profile',
    'updated',
    jsonb_build_object(
      'legal_name', trim(p_legal_name),
      'trading_name', p_trading_name
    )
  );
end;
$$;


-- ============================================================
-- 5. UPDATE DOCUMENT / BRANDING SETTINGS
-- ============================================================

create or replace function public.update_company_document_settings(
  p_document_display_name text,
  p_show_registration_number boolean,
  p_show_vat_number boolean,
  p_show_company_address boolean,
  p_show_company_phone boolean,
  p_show_company_email boolean,
  p_show_company_website boolean,
  p_document_footer text,
  p_invoice_footer text,
  p_quotation_footer text,
  p_default_invoice_template text,
  p_default_quotation_template text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if not public.current_user_has_permission(
    'settings.branding.manage'
  ) then
    raise exception 'Permission denied: settings.branding.manage';
  end if;

  v_company_id := public.current_settings_company_id();

  if v_company_id is null then
    raise exception 'No company is assigned to this user';
  end if;

  insert into public.company_document_settings (
    company_id,
    document_display_name,
    show_registration_number,
    show_vat_number,
    show_company_address,
    show_company_phone,
    show_company_email,
    show_company_website,
    document_footer,
    invoice_footer,
    quotation_footer,
    default_invoice_template,
    default_quotation_template,
    updated_by
  )
  values (
    v_company_id,
    nullif(trim(p_document_display_name), ''),
    coalesce(p_show_registration_number, true),
    coalesce(p_show_vat_number, true),
    coalesce(p_show_company_address, true),
    coalesce(p_show_company_phone, true),
    coalesce(p_show_company_email, true),
    coalesce(p_show_company_website, false),
    nullif(trim(p_document_footer), ''),
    nullif(trim(p_invoice_footer), ''),
    nullif(trim(p_quotation_footer), ''),
    coalesce(
      nullif(trim(p_default_invoice_template), ''),
      'jinlab-signature'
    ),
    coalesce(
      nullif(trim(p_default_quotation_template), ''),
      'jinlab-signature'
    ),
    auth.uid()
  )
  on conflict (company_id)
  do update set
    document_display_name =
      excluded.document_display_name,
    show_registration_number =
      excluded.show_registration_number,
    show_vat_number =
      excluded.show_vat_number,
    show_company_address =
      excluded.show_company_address,
    show_company_phone =
      excluded.show_company_phone,
    show_company_email =
      excluded.show_company_email,
    show_company_website =
      excluded.show_company_website,
    document_footer =
      excluded.document_footer,
    invoice_footer =
      excluded.invoice_footer,
    quotation_footer =
      excluded.quotation_footer,
    default_invoice_template =
      excluded.default_invoice_template,
    default_quotation_template =
      excluded.default_quotation_template;

  perform public.log_settings_change(
    v_company_id,
    'branding_documents',
    'updated',
    jsonb_build_object(
      'invoice_template',
      p_default_invoice_template,
      'quotation_template',
      p_default_quotation_template
    )
  );
end;
$$;


-- ============================================================
-- 6. UPDATE FINANCE SETTINGS
-- ============================================================

create or replace function public.update_company_finance_settings(
  p_base_currency text,
  p_financial_year_start_month integer,
  p_accounting_basis text,
  p_vat_registered boolean,
  p_vat_number text,
  p_default_vat_rate numeric,
  p_prices_include_vat boolean,
  p_default_customer_payment_days integer,
  p_default_supplier_payment_days integer,
  p_allow_customer_credit boolean,
  p_default_customer_credit_limit numeric,
  p_rounding_method text,
  p_lock_accounting_before date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if not public.current_user_has_permission(
    'settings.finance.manage'
  ) then
    raise exception 'Permission denied: settings.finance.manage';
  end if;

  v_company_id := public.current_settings_company_id();

  if v_company_id is null then
    raise exception 'No company is assigned to this user';
  end if;

  if p_financial_year_start_month not between 1 and 12 then
    raise exception 'Financial year month must be between 1 and 12';
  end if;

  if p_accounting_basis not in ('accrual', 'cash') then
    raise exception 'Invalid accounting basis';
  end if;

  if p_default_vat_rate < 0
     or p_default_vat_rate > 100 then
    raise exception 'VAT rate must be between 0 and 100';
  end if;

  if p_default_customer_payment_days < 0
     or p_default_supplier_payment_days < 0 then
    raise exception 'Payment days cannot be negative';
  end if;

  if p_default_customer_credit_limit < 0 then
    raise exception 'Credit limit cannot be negative';
  end if;

  if p_rounding_method not in (
    'standard',
    'up',
    'down',
    'none'
  ) then
    raise exception 'Invalid rounding method';
  end if;

  insert into public.company_finance_settings (
    company_id,
    base_currency,
    financial_year_start_month,
    accounting_basis,
    vat_registered,
    vat_number,
    default_vat_rate,
    prices_include_vat,
    default_customer_payment_days,
    default_supplier_payment_days,
    allow_customer_credit,
    default_customer_credit_limit,
    rounding_method,
    lock_accounting_before,
    updated_by
  )
  values (
    v_company_id,
    upper(coalesce(nullif(trim(p_base_currency), ''), 'ZAR')),
    p_financial_year_start_month,
    p_accounting_basis,
    coalesce(p_vat_registered, false),
    case
      when coalesce(p_vat_registered, false)
      then nullif(trim(p_vat_number), '')
      else null
    end,
    p_default_vat_rate,
    coalesce(p_prices_include_vat, true),
    p_default_customer_payment_days,
    p_default_supplier_payment_days,
    coalesce(p_allow_customer_credit, true),
    p_default_customer_credit_limit,
    p_rounding_method,
    p_lock_accounting_before,
    auth.uid()
  )
  on conflict (company_id)
  do update set
    base_currency = excluded.base_currency,
    financial_year_start_month =
      excluded.financial_year_start_month,
    accounting_basis = excluded.accounting_basis,
    vat_registered = excluded.vat_registered,
    vat_number = excluded.vat_number,
    default_vat_rate = excluded.default_vat_rate,
    prices_include_vat = excluded.prices_include_vat,
    default_customer_payment_days =
      excluded.default_customer_payment_days,
    default_supplier_payment_days =
      excluded.default_supplier_payment_days,
    allow_customer_credit =
      excluded.allow_customer_credit,
    default_customer_credit_limit =
      excluded.default_customer_credit_limit,
    rounding_method = excluded.rounding_method,
    lock_accounting_before =
      excluded.lock_accounting_before;

  perform public.log_settings_change(
    v_company_id,
    'finance',
    'updated',
    jsonb_build_object(
      'currency', upper(p_base_currency),
      'accounting_basis', p_accounting_basis,
      'vat_registered', p_vat_registered,
      'financial_year_start_month',
      p_financial_year_start_month
    )
  );
end;
$$;


-- ============================================================
-- 7. UPDATE NEXUS ACCOUNTANT / ACCOUNTING AUTOMATION
-- ============================================================

create or replace function public.update_company_accounting_settings(
  p_accounting_enabled boolean,
  p_automatic_journals boolean,
  p_automatic_invoice_posting boolean,
  p_automatic_payment_posting boolean,
  p_automatic_purchase_posting boolean,
  p_automatic_expense_classification boolean,
  p_automatic_bank_matching boolean,
  p_nexus_accountant_enabled boolean,
  p_ai_explanations_enabled boolean,
  p_ai_recommendations_enabled boolean,
  p_ai_auto_classify_enabled boolean,
  p_ai_auto_post_enabled boolean,
  p_ai_confidence_threshold numeric,
  p_transaction_approval_threshold numeric,
  p_require_manual_journal_approval boolean,
  p_require_vat_adjustment_approval boolean,
  p_require_period_reopen_approval boolean,
  p_require_tax_submission_approval boolean,
  p_uncertain_transaction_action text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if not public.current_user_has_permission(
    'settings.accounting.manage'
  ) then
    raise exception 'Permission denied: settings.accounting.manage';
  end if;

  v_company_id := public.current_settings_company_id();

  if v_company_id is null then
    raise exception 'No company is assigned to this user';
  end if;

  if p_ai_confidence_threshold < 0
     or p_ai_confidence_threshold > 100 then
    raise exception 'AI confidence threshold must be between 0 and 100';
  end if;

  if p_transaction_approval_threshold < 0 then
    raise exception 'Approval threshold cannot be negative';
  end if;

  if p_uncertain_transaction_action not in (
    'ask',
    'hold',
    'manual_review'
  ) then
    raise exception 'Invalid uncertain transaction action';
  end if;

  insert into public.company_accounting_settings (
    company_id,
    accounting_enabled,
    automatic_journals,
    automatic_invoice_posting,
    automatic_payment_posting,
    automatic_purchase_posting,
    automatic_expense_classification,
    automatic_bank_matching,
    nexus_accountant_enabled,
    ai_explanations_enabled,
    ai_recommendations_enabled,
    ai_auto_classify_enabled,
    ai_auto_post_enabled,
    ai_confidence_threshold,
    transaction_approval_threshold,
    require_manual_journal_approval,
    require_vat_adjustment_approval,
    require_period_reopen_approval,
    require_tax_submission_approval,
    uncertain_transaction_action,
    updated_by
  )
  values (
    v_company_id,
    p_accounting_enabled,
    p_automatic_journals,
    p_automatic_invoice_posting,
    p_automatic_payment_posting,
    p_automatic_purchase_posting,
    p_automatic_expense_classification,
    p_automatic_bank_matching,
    p_nexus_accountant_enabled,
    p_ai_explanations_enabled,
    p_ai_recommendations_enabled,
    p_ai_auto_classify_enabled,
    p_ai_auto_post_enabled,
    p_ai_confidence_threshold,
    p_transaction_approval_threshold,
    p_require_manual_journal_approval,
    p_require_vat_adjustment_approval,
    p_require_period_reopen_approval,
    p_require_tax_submission_approval,
    p_uncertain_transaction_action,
    auth.uid()
  )
  on conflict (company_id)
  do update set
    accounting_enabled = excluded.accounting_enabled,
    automatic_journals = excluded.automatic_journals,
    automatic_invoice_posting =
      excluded.automatic_invoice_posting,
    automatic_payment_posting =
      excluded.automatic_payment_posting,
    automatic_purchase_posting =
      excluded.automatic_purchase_posting,
    automatic_expense_classification =
      excluded.automatic_expense_classification,
    automatic_bank_matching =
      excluded.automatic_bank_matching,
    nexus_accountant_enabled =
      excluded.nexus_accountant_enabled,
    ai_explanations_enabled =
      excluded.ai_explanations_enabled,
    ai_recommendations_enabled =
      excluded.ai_recommendations_enabled,
    ai_auto_classify_enabled =
      excluded.ai_auto_classify_enabled,
    ai_auto_post_enabled =
      excluded.ai_auto_post_enabled,
    ai_confidence_threshold =
      excluded.ai_confidence_threshold,
    transaction_approval_threshold =
      excluded.transaction_approval_threshold,
    require_manual_journal_approval =
      excluded.require_manual_journal_approval,
    require_vat_adjustment_approval =
      excluded.require_vat_adjustment_approval,
    require_period_reopen_approval =
      excluded.require_period_reopen_approval,
    require_tax_submission_approval =
      excluded.require_tax_submission_approval,
    uncertain_transaction_action =
      excluded.uncertain_transaction_action;

  perform public.log_settings_change(
    v_company_id,
    'nexus_accountant',
    'updated',
    jsonb_build_object(
      'enabled', p_nexus_accountant_enabled,
      'ai_auto_post', p_ai_auto_post_enabled,
      'confidence_threshold',
      p_ai_confidence_threshold,
      'approval_threshold',
      p_transaction_approval_threshold
    )
  );
end;
$$;


-- ============================================================
-- 8. UPDATE BRANCH POLICIES
-- ============================================================

create or replace function public.update_company_branch_settings(
  p_isolate_stock_by_branch boolean,
  p_isolate_sales_by_branch boolean,
  p_customer_visibility text,
  p_require_branch_on_sales boolean,
  p_require_branch_on_purchases boolean,
  p_use_branch_address_on_invoice boolean,
  p_use_branch_contact_on_documents boolean,
  p_branch_document_numbering text,
  p_cross_branch_stock_transfer_enabled boolean,
  p_cross_branch_transfer_requires_approval boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if not public.current_user_has_permission(
    'settings.branches.manage'
  ) then
    raise exception 'Permission denied: settings.branches.manage';
  end if;

  v_company_id := public.current_settings_company_id();

  if p_customer_visibility not in (
    'company',
    'branch'
  ) then
    raise exception 'Invalid customer visibility';
  end if;

  if p_branch_document_numbering not in (
    'company',
    'branch'
  ) then
    raise exception 'Invalid branch numbering mode';
  end if;

  insert into public.company_branch_settings (
    company_id,
    isolate_stock_by_branch,
    isolate_sales_by_branch,
    customer_visibility,
    require_branch_on_sales,
    require_branch_on_purchases,
    use_branch_address_on_invoice,
    use_branch_contact_on_documents,
    branch_document_numbering,
    cross_branch_stock_transfer_enabled,
    cross_branch_transfer_requires_approval,
    updated_by
  )
  values (
    v_company_id,
    p_isolate_stock_by_branch,
    p_isolate_sales_by_branch,
    p_customer_visibility,
    p_require_branch_on_sales,
    p_require_branch_on_purchases,
    p_use_branch_address_on_invoice,
    p_use_branch_contact_on_documents,
    p_branch_document_numbering,
    p_cross_branch_stock_transfer_enabled,
    p_cross_branch_transfer_requires_approval,
    auth.uid()
  )
  on conflict (company_id)
  do update set
    isolate_stock_by_branch =
      excluded.isolate_stock_by_branch,
    isolate_sales_by_branch =
      excluded.isolate_sales_by_branch,
    customer_visibility =
      excluded.customer_visibility,
    require_branch_on_sales =
      excluded.require_branch_on_sales,
    require_branch_on_purchases =
      excluded.require_branch_on_purchases,
    use_branch_address_on_invoice =
      excluded.use_branch_address_on_invoice,
    use_branch_contact_on_documents =
      excluded.use_branch_contact_on_documents,
    branch_document_numbering =
      excluded.branch_document_numbering,
    cross_branch_stock_transfer_enabled =
      excluded.cross_branch_stock_transfer_enabled,
    cross_branch_transfer_requires_approval =
      excluded.cross_branch_transfer_requires_approval;

  perform public.log_settings_change(
    v_company_id,
    'branch_policy',
    'updated',
    jsonb_build_object(
      'stock_isolation',
      p_isolate_stock_by_branch,
      'sales_isolation',
      p_isolate_sales_by_branch,
      'customer_visibility',
      p_customer_visibility
    )
  );
end;
$$;


-- ============================================================
-- 9. UPDATE SECURITY SETTINGS
-- ============================================================

create or replace function public.update_company_security_settings(
  p_require_sensitive_action_confirmation boolean,
  p_require_stock_adjustment_approval boolean,
  p_require_invoice_cancellation_approval boolean,
  p_require_financial_delete_approval boolean,
  p_prevent_role_escalation boolean,
  p_audit_admin_changes boolean,
  p_session_timeout_minutes integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if not public.current_user_has_permission(
    'settings.security.manage'
  ) then
    raise exception 'Permission denied: settings.security.manage';
  end if;

  v_company_id := public.current_settings_company_id();

  if p_session_timeout_minutes < 15
     or p_session_timeout_minutes > 10080 then
    raise exception 'Session timeout must be between 15 and 10080 minutes';
  end if;

  insert into public.company_security_settings (
    company_id,
    require_sensitive_action_confirmation,
    require_stock_adjustment_approval,
    require_invoice_cancellation_approval,
    require_financial_delete_approval,
    prevent_role_escalation,
    audit_admin_changes,
    session_timeout_minutes,
    updated_by
  )
  values (
    v_company_id,
    p_require_sensitive_action_confirmation,
    p_require_stock_adjustment_approval,
    p_require_invoice_cancellation_approval,
    p_require_financial_delete_approval,
    p_prevent_role_escalation,
    p_audit_admin_changes,
    p_session_timeout_minutes,
    auth.uid()
  )
  on conflict (company_id)
  do update set
    require_sensitive_action_confirmation =
      excluded.require_sensitive_action_confirmation,
    require_stock_adjustment_approval =
      excluded.require_stock_adjustment_approval,
    require_invoice_cancellation_approval =
      excluded.require_invoice_cancellation_approval,
    require_financial_delete_approval =
      excluded.require_financial_delete_approval,
    prevent_role_escalation =
      excluded.prevent_role_escalation,
    audit_admin_changes =
      excluded.audit_admin_changes,
    session_timeout_minutes =
      excluded.session_timeout_minutes;

  perform public.log_settings_change(
    v_company_id,
    'security',
    'updated',
    jsonb_build_object(
      'role_escalation_protection',
      p_prevent_role_escalation,
      'audit_admin_changes',
      p_audit_admin_changes,
      'session_timeout_minutes',
      p_session_timeout_minutes
    )
  );
end;
$$;


-- ============================================================
-- 10. EXECUTION SECURITY
-- Do not leave SECURITY DEFINER RPCs executable by everyone.
-- ============================================================

revoke all on function
public.current_user_has_permission(text)
from public;

revoke all on function
public.current_settings_company_id()
from public;

revoke all on function
public.log_settings_change(uuid,text,text,jsonb)
from public;

revoke all on function
public.update_company_profile_settings(
  text,text,text,text,text,text,text,text,text,text,text,text,text,text
)
from public;

revoke all on function
public.update_company_document_settings(
  text,boolean,boolean,boolean,boolean,boolean,boolean,
  text,text,text,text,text
)
from public;

revoke all on function
public.update_company_finance_settings(
  text,integer,text,boolean,text,numeric,boolean,
  integer,integer,boolean,numeric,text,date
)
from public;

revoke all on function
public.update_company_accounting_settings(
  boolean,boolean,boolean,boolean,boolean,boolean,boolean,
  boolean,boolean,boolean,boolean,boolean,numeric,numeric,
  boolean,boolean,boolean,boolean,text
)
from public;

revoke all on function
public.update_company_branch_settings(
  boolean,boolean,text,boolean,boolean,boolean,boolean,
  text,boolean,boolean
)
from public;

revoke all on function
public.update_company_security_settings(
  boolean,boolean,boolean,boolean,boolean,boolean,integer
)
from public;


-- Authenticated application users may CALL these functions.
-- The functions themselves perform the authoritative permission checks.

grant execute on function
public.current_user_has_permission(text)
to authenticated;

grant execute on function
public.current_settings_company_id()
to authenticated;

grant execute on function
public.update_company_profile_settings(
  text,text,text,text,text,text,text,text,text,text,text,text,text,text
)
to authenticated;

grant execute on function
public.update_company_document_settings(
  text,boolean,boolean,boolean,boolean,boolean,boolean,
  text,text,text,text,text
)
to authenticated;

grant execute on function
public.update_company_finance_settings(
  text,integer,text,boolean,text,numeric,boolean,
  integer,integer,boolean,numeric,text,date
)
to authenticated;

grant execute on function
public.update_company_accounting_settings(
  boolean,boolean,boolean,boolean,boolean,boolean,boolean,
  boolean,boolean,boolean,boolean,boolean,numeric,numeric,
  boolean,boolean,boolean,boolean,text
)
to authenticated;

grant execute on function
public.update_company_branch_settings(
  boolean,boolean,text,boolean,boolean,boolean,boolean,
  text,boolean,boolean
)
to authenticated;

grant execute on function
public.update_company_security_settings(
  boolean,boolean,boolean,boolean,boolean,boolean,integer
)
to authenticated;

