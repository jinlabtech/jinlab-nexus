import { supabase } from "@/lib/supabase";

export type AccountingAccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense";

export type AccountingAccount = {
  id: string;
  company_id: string;
  parent_account_id: string | null;
  code: string;
  name: string;
  description: string | null;
  account_type: AccountingAccountType;
  account_subtype: string | null;
  normal_balance: "debit" | "credit";
  system_key: string | null;
  is_system: boolean;
  allow_manual_posting: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AccountingPeriodStatus =
  | "open"
  | "closed"
  | "locked";

export type AccountingPeriod = {
  id: string;
  company_id: string;
  financial_year_id: string | null;
  name: string;
  start_date: string;
  end_date: string;
  status: AccountingPeriodStatus;
  is_adjustment_period: boolean;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountingFinancialYearStatus =
  | "scheduled"
  | "open"
  | "closed"
  | "locked";

export type AccountingFinancialYear = {
  id: string;
  company_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: AccountingFinancialYearStatus;
  schedule_source: "settings" | "manual";
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type JournalStatus =
  | "draft"
  | "posted";

export type JournalApprovalStatus =
  | "not_required"
  | "pending"
  | "approved";

export type JournalEntry = {
  id: string;
  company_id: string;
  branch_id: string | null;
  accounting_period_id: string | null;
  entry_number: string;
  entry_date: string;
  description: string;
  reference: string | null;
  source_type: string;
  source_id: string | null;
  source_event: string | null;
  currency: string;
  status: JournalStatus;
  approval_status: JournalApprovalStatus;
  total_debit: number;
  total_credit: number;
  reversal_of_entry_id: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  posted_by: string | null;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountingOverview = {
  ok: boolean;

  company_id: string;

  settings: {
    accounting_enabled: boolean;
    base_currency: string;
    accounting_basis: "accrual" | "cash";
    vat_registered: boolean;
  };

  balances: {
    assets: number;
    liabilities: number;
    equity: number;
    revenue: number;
    expenses: number;
    net_profit: number;
  };

  journals: {
    posted: number;
    draft: number;
    pending_approval: number;
  };

  current_period: {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    status: AccountingPeriodStatus;
  } | null;
};


const accountColumns =
  "id, company_id, parent_account_id, code, name, description, account_type, account_subtype, normal_balance, system_key, is_system, allow_manual_posting, is_active, created_at, updated_at";

const periodColumns =
  "id, company_id, financial_year_id, name, start_date, end_date, status, is_adjustment_period, closed_at, closed_by, created_at, updated_at";

const financialYearColumns =
  "id, company_id, name, start_date, end_date, status, schedule_source, created_by, updated_by, created_at, updated_at";

const journalColumns =
  "id, company_id, branch_id, accounting_period_id, entry_number, entry_date, description, reference, source_type, source_id, source_event, currency, status, approval_status, total_debit, total_credit, reversal_of_entry_id, created_by, approved_by, approved_at, posted_by, posted_at, created_at, updated_at";


export async function getAccountingOverview():
Promise<AccountingOverview> {
  const {
    data,
    error,
  } = await supabase.rpc(
    "get_accounting_overview"
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data as AccountingOverview;
}


export async function getAccountingAccounts(
  companyId: string
): Promise<AccountingAccount[]> {
  const {
    data,
    error,
  } = await supabase
    .from("accounting_account")
    .select(accountColumns)
    .eq(
      "company_id",
      companyId
    )
    .order(
      "code",
      {
        ascending: true,
      }
    );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return (
    data ?? []
  ) as AccountingAccount[];
}


export async function getAccountingPeriods(
  companyId: string
): Promise<AccountingPeriod[]> {
  const {
    data,
    error,
  } = await supabase
    .from("accounting_period")
    .select(periodColumns)
    .eq(
      "company_id",
      companyId
    )
    .order(
      "start_date",
      {
        ascending: false,
      }
    );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return (
    data ?? []
  ) as AccountingPeriod[];
}


export async function getRecentJournalEntries(
  companyId: string,
  limit = 8
): Promise<JournalEntry[]> {
  const {
    data,
    error,
  } = await supabase
    .from("journal_entry")
    .select(journalColumns)
    .eq(
      "company_id",
      companyId
    )
    .order(
      "entry_date",
      {
        ascending: false,
      }
    )
    .order(
      "created_at",
      {
        ascending: false,
      }
    )
    .limit(limit);

  if (error) {
    throw new Error(
      error.message
    );
  }

  return (
    data ?? []
  ) as JournalEntry[];
}


export async function getAccountingFinancialYears(
  companyId: string
): Promise<AccountingFinancialYear[]> {
  const {
    data,
    error,
  } = await supabase
    .from("accounting_financial_year")
    .select(financialYearColumns)
    .eq(
      "company_id",
      companyId
    )
    .order(
      "start_date",
      {
        ascending: false,
      }
    );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return (
    data ?? []
  ) as AccountingFinancialYear[];
}


export async function scheduleAccountingFinancialYear(
  startDate: string,
  endDate: string,
  name?: string
) {
  const {
    data,
    error,
  } = await supabase.rpc(
    "schedule_accounting_financial_year",
    {
      p_start_date:
        startDate,
      p_end_date:
        endDate,
      p_name:
        name?.trim() || null,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data;
}


export async function updateScheduledAccountingFinancialYear(
  financialYearId: string,
  startDate: string,
  endDate: string,
  name?: string
) {
  const {
    data,
    error,
  } = await supabase.rpc(
    "update_scheduled_accounting_financial_year",
    {
      p_financial_year_id:
        financialYearId,
      p_start_date:
        startDate,
      p_end_date:
        endDate,
      p_name:
        name?.trim() || null,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data;
}


export type ChartOfAccountRow =
  AccountingAccount & {
    balance: number;
    posted_debit: number;
    posted_credit: number;
    posted_line_count: number;
  };


export async function getChartOfAccounts():
Promise<ChartOfAccountRow[]> {
  const {
    data,
    error,
  } = await supabase.rpc(
    "get_chart_of_accounts"
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  const result =
    data as {
      ok: boolean;
      accounts: ChartOfAccountRow[];
    };

  return result.accounts ?? [];
}


export async function createAccountingAccount(
  values: {
    code: string;
    name: string;
    accountType: AccountingAccountType;
    accountSubtype?: string;
    description?: string;
    parentAccountId?: string | null;
    allowManualPosting?: boolean;
  }
) {
  const {
    data,
    error,
  } = await supabase.rpc(
    "create_accounting_account",
    {
      p_code:
        values.code,

      p_name:
        values.name,

      p_account_type:
        values.accountType,

      p_account_subtype:
        values.accountSubtype ||
        null,

      p_description:
        values.description ||
        null,

      p_parent_account_id:
        values.parentAccountId ||
        null,

      p_allow_manual_posting:
        values.allowManualPosting ??
        true,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data;
}


export async function updateAccountingAccount(
  values: {
    accountId: string;
    code: string;
    name: string;
    accountSubtype?: string;
    description?: string;
    parentAccountId?: string | null;
    allowManualPosting: boolean;
    isActive: boolean;
  }
) {
  const {
    data,
    error,
  } = await supabase.rpc(
    "update_accounting_account",
    {
      p_account_id:
        values.accountId,

      p_code:
        values.code,

      p_name:
        values.name,

      p_account_subtype:
        values.accountSubtype ||
        null,

      p_description:
        values.description ||
        null,

      p_parent_account_id:
        values.parentAccountId ||
        null,

      p_allow_manual_posting:
        values.allowManualPosting,

      p_is_active:
        values.isActive,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data;
}


export type JournalLine = {
  id: string;
  journal_entry_id: string;
  company_id: string;
  account_id: string;
  line_number: number;
  description: string | null;
  debit: number;
  credit: number;
  customer_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};


export type JournalDetail = {
  journal: JournalEntry;
  lines: JournalLine[];
};


export type ManualJournalLineInput = {
  account_id: string;
  description?: string;
  debit?: number;
  credit?: number;
  customer_id?: string | null;
  metadata?: Record<string, unknown>;
};


export type TrialBalanceRow = {
  account_id: string;
  code: string;
  name: string;
  account_type:
    AccountingAccountType;
  account_subtype:
    string | null;
  normal_balance:
    "debit" | "credit";
  is_system: boolean;
  total_debit: number;
  total_credit: number;
  trial_debit: number;
  trial_credit: number;
  balance: number;
};


export type TrialBalanceResult = {
  ok: boolean;
  company_id: string;
  as_of_date: string;
  currency: string;
  total_debit: number;
  total_credit: number;
  balanced: boolean;
  rows: TrialBalanceRow[];
};


const journalLineColumns =
  "id, journal_entry_id, company_id, account_id, line_number, description, debit, credit, customer_id, metadata, created_at";


export async function getJournalEntries(
  companyId: string,
  status?: JournalStatus
): Promise<JournalEntry[]> {
  let query =
    supabase
      .from("journal_entry")
      .select(journalColumns)
      .eq(
        "company_id",
        companyId
      )
      .order(
        "entry_date",
        {
          ascending: false,
        }
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

  if (status) {
    query =
      query.eq(
        "status",
        status
      );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    throw new Error(
      error.message
    );
  }

  return (
    data ?? []
  ) as JournalEntry[];
}


export async function getJournalDetail(
  journalEntryId: string,
  companyId: string
): Promise<JournalDetail> {
  const [
    journalResult,
    lineResult,
  ] =
    await Promise.all([
      supabase
        .from(
          "journal_entry"
        )
        .select(
          journalColumns
        )
        .eq(
          "id",
          journalEntryId
        )
        .eq(
          "company_id",
          companyId
        )
        .single(),

      supabase
        .from(
          "journal_line"
        )
        .select(
          journalLineColumns
        )
        .eq(
          "journal_entry_id",
          journalEntryId
        )
        .eq(
          "company_id",
          companyId
        )
        .order(
          "line_number",
          {
            ascending: true,
          }
        ),
    ]);

  if (
    journalResult.error
  ) {
    throw new Error(
      journalResult
        .error.message
    );
  }

  if (
    lineResult.error
  ) {
    throw new Error(
      lineResult
        .error.message
    );
  }

  return {
    journal:
      journalResult
        .data as JournalEntry,

    lines:
      (
        lineResult.data ??
        []
      ) as JournalLine[],
  };
}


export async function createManualJournal(
  values: {
    entryDate: string;
    description: string;
    reference?: string;
    branchId?: string | null;
    lines: ManualJournalLineInput[];
  }
) {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      "create_manual_journal",
      {
        p_entry_date:
          values.entryDate,

        p_description:
          values.description,

        p_reference:
          values.reference ||
          null,

        p_branch_id:
          values.branchId ||
          null,

        p_lines:
          values.lines,
      }
    );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data as {
    ok: boolean;

    journal: {
      id: string;
      entry_number:
        string;
      entry_date:
        string;
      status:
        JournalStatus;
      approval_status:
        JournalApprovalStatus;
      total_debit:
        number;
      total_credit:
        number;
      line_count:
        number;
    };
  };
}


export async function approveJournalEntry(
  journalEntryId: string
) {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      "approve_journal_entry",
      {
        p_journal_entry_id:
          journalEntryId,
      }
    );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data;
}


export async function postJournalEntry(
  journalEntryId: string
) {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      "post_journal_entry",
      {
        p_journal_entry_id:
          journalEntryId,
      }
    );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data;
}


export async function reverseJournalEntry(
  journalEntryId: string,
  reversalDate: string,
  reason: string
) {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      "reverse_journal_entry",
      {
        p_journal_entry_id:
          journalEntryId,

        p_reversal_date:
          reversalDate,

        p_reason:
          reason,
      }
    );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data;
}


export async function getTrialBalance(
  asOfDate?: string
): Promise<TrialBalanceResult> {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      "get_trial_balance",
      {
        p_as_of_date:
          asOfDate ||
          null,
      }
    );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data as
    TrialBalanceResult;
}


export type AccountingPostingExceptionStatus =
  | "open"
  | "resolved";


export type AccountingPostingException = {
  id: string;
  company_id: string;
  branch_id: string | null;
  source_type:
    | "invoice"
    | "invoice_payment";
  source_id: string;
  source_event: string;
  event_date: string;
  reason_code: string;
  message: string;
  status:
    AccountingPostingExceptionStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
};


const accountingExceptionColumns =
  "id, company_id, branch_id, source_type, source_id, source_event, event_date, reason_code, message, status, created_at, updated_at, resolved_at, resolved_by";


export async function getAccountingPostingExceptions(
  companyId: string,
  status:
    AccountingPostingExceptionStatus |
    "all" = "open"
): Promise<AccountingPostingException[]> {
  let query =
    supabase
      .from(
        "accounting_posting_exception"
      )
      .select(
        accountingExceptionColumns
      )
      .eq(
        "company_id",
        companyId
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );


  if (status !== "all") {
    query =
      query.eq(
        "status",
        status
      );
  }


  const {
    data,
    error,
  } = await query;


  if (error) {
    throw new Error(
      error.message
    );
  }


  return (
    data ?? []
  ) as AccountingPostingException[];
}


export async function retryAccountingPostingException(
  exceptionId: string
) {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      "retry_accounting_posting_exception",
      {
        p_exception_id:
          exceptionId,
      }
    );


  if (error) {
    throw new Error(
      error.message
    );
  }


  return data as {
    ok: boolean;
    journal_id?: string;
    exception_id?: string;
    already_resolved?: boolean;
  };
}


export type AccountingExceptionSummary = {
  ok: boolean;
  open_count: number;
  resolved_count: number;
  oldest_open_date: string | null;
  healthy: boolean;
};


export async function getAccountingExceptionSummary():
Promise<AccountingExceptionSummary> {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      "get_accounting_exception_summary"
    );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data as
    AccountingExceptionSummary;
}


export type DebtorAgeingBucket =
  | "current"
  | "1_30"
  | "31_60"
  | "61_90"
  | "90_plus";


export type DebtorAgeingSummary = {
  total_outstanding: number;
  total_overdue: number;

  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;

  customer_count: number;
  open_invoice_count: number;
  overdue_invoice_count: number;

  ledger_debtors_balance:
    number | null;

  reconciliation_difference:
    number | null;

  reconciled: boolean;
};


export type DebtorAgeingCustomer = {
  customer_id: string;
  customer_number: string;
  customer_name: string;
  customer_type: string;

  credit_limit: number;
  payment_terms_days: number;

  outstanding: number;
  overdue: number;

  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;

  open_invoice_count: number;
  overdue_invoice_count: number;

  oldest_due_date:
    string | null;

  credit_available: number;
  credit_limit_exceeded: boolean;
};


export type DebtorAgeingInvoice = {
  invoice_id: string;
  branch_id: string;

  customer_id: string;
  customer_number: string;
  customer_name: string;

  invoice_number: string;

  invoice_date: string;
  due_date: string;

  invoice_total: number;
  paid_to_date: number;
  outstanding: number;

  days_overdue: number;

  ageing_bucket:
    DebtorAgeingBucket;
};


export type DebtorAgeingResult = {
  ok: boolean;
  as_of_date: string;
  currency: string;

  summary:
    DebtorAgeingSummary;

  customers:
    DebtorAgeingCustomer[];

  invoices:
    DebtorAgeingInvoice[];
};


export async function getDebtorAgeing(
  asOfDate?: string
): Promise<DebtorAgeingResult> {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      "get_debtor_ageing",
      {
        p_as_of_date:
          asOfDate ?? null,
      }
    );


  if (error) {
    throw new Error(
      error.message
    );
  }


  return data as
    DebtorAgeingResult;
}


export type DebtorDiagnosticStatus =
  | "invoice_not_posted"
  | "payments_not_posted"
  | "ledger_mismatch"
  | "reconciled";


export type DebtorReconciliationInvoice = {
  invoice_id: string;
  branch_id: string;

  customer_id: string;
  customer_number: string;
  customer_name: string;

  invoice_number: string;

  invoice_date: string;
  due_date: string;

  invoice_status: string;

  invoice_total: number;
  payments_to_date: number;

  operational_balance: number;

  invoice_journal_posted: boolean;

  expected_payment_count: number;
  posted_payment_count: number;
  missing_payment_count: number;

  ledger_balance: number;
  difference: number;

  diagnostic_status:
    DebtorDiagnosticStatus;
};


export type DebtorReconciliationResult = {
  ok: boolean;

  as_of_date: string;

  summary: {
    operational_debtors: number;
    ledger_debtors: number;

    difference: number;
    reconciled: boolean;

    problem_invoice_count: number;

    missing_invoice_journal_count: number;
    missing_payment_journal_count: number;

    invoice_linked_ledger_balance: number;
    unlinked_ledger_adjustment: number;
  };

  invoices:
    DebtorReconciliationInvoice[];
};


export async function getDebtorReconciliationDiagnostics(
  asOfDate?: string
): Promise<DebtorReconciliationResult> {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      "get_debtor_reconciliation_diagnostics",
      {
        p_as_of_date:
          asOfDate ?? null,
      }
    );


  if (error) {
    throw new Error(
      error.message
    );
  }


  return data as
    DebtorReconciliationResult;
}


export type InvoiceAccountingRepairPayment = {
  payment_id: string;
  payment_date: string;
  payment_method: string;
  reference: string | null;
  amount: number;
  journal_posted: boolean;
};


export type InvoiceAccountingRepairPreview = {
  ok: boolean;

  invoice_id: string;
  invoice_number: string;

  customer_id: string;
  customer_name: string;

  invoice_date: string;
  invoice_status: string;
  invoice_total: number;

  invoice_journal_posted: boolean;

  payment_count: number;
  posted_payment_count: number;
  missing_payment_count: number;

  missing_invoice_journal: boolean;

  entries_to_create: number;

  repairable: boolean;
  reason: string | null;

  payments:
    InvoiceAccountingRepairPayment[];
};


export type InvoiceAccountingRepairResult = {
  ok: boolean;

  invoice_id: string;
  invoice_number: string;

  invoice_journal_created: boolean;
  payment_journals_created: number;
  total_journals_created: number;

  already_reconciled: boolean;

  journals: Array<{
    type: "invoice" | "payment";
    journal_id: string;
    payment_id?: string;
    date?: string;
    payment_date?: string;
    payment_method?: string;
    amount?: number;
  }>;
};


export async function previewInvoiceAccountingRepair(
  invoiceId: string
): Promise<InvoiceAccountingRepairPreview> {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      "preview_invoice_accounting_repair",
      {
        p_invoice_id:
          invoiceId,
      }
    );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data as
    InvoiceAccountingRepairPreview;
}


export async function repairInvoiceAccountingHistory(
  invoiceId: string
): Promise<InvoiceAccountingRepairResult> {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      "repair_invoice_accounting_history",
      {
        p_invoice_id:
          invoiceId,
      }
    );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data as
    InvoiceAccountingRepairResult;
}


export type CustomerStatementTransaction = {
  journal_id: string;
  entry_number: string;
  entry_date: string;

  source_type: string;
  source_id: string | null;
  source_event: string | null;

  reference: string | null;
  description: string | null;

  invoice_id: string | null;
  invoice_number: string | null;

  payment_id: string | null;
  payment_method: string | null;
  payment_reference: string | null;

  debit: number;
  credit: number;
  running_balance: number;
};


export type CustomerStatementOpenInvoice = {
  invoice_id: string;
  invoice_number: string;

  invoice_date: string;
  due_date: string;

  invoice_total: number;
  paid_to_date: number;
  outstanding: number;

  days_overdue: number;
};


export type CustomerStatementPayment = {
  payment_id: string;

  invoice_id: string;
  invoice_number: string;

  payment_date: string;
  payment_method: string;

  reference: string | null;

  amount: number;
};


export type CustomerAccountStatement = {
  ok: boolean;

  customer: {
    id: string;
    customer_number: string;
    customer_name: string;
    customer_type: string;

    contact_person: string | null;

    email: string | null;
    phone: string | null;

    address_line_1: string | null;
    address_line_2: string | null;

    city: string | null;
    province: string | null;
    postal_code: string | null;
    country: string | null;

    credit_limit: number;
    payment_terms_days: number;
  };

  currency: string;

  start_date: string;
  end_date: string;

  summary: {
    opening_balance: number;
    period_debits: number;
    period_credits: number;

    closing_balance: number;

    operational_balance: number;

    difference: number;
    reconciled: boolean;
  };

  transactions:
    CustomerStatementTransaction[];

  open_invoices:
    CustomerStatementOpenInvoice[];

  payments:
    CustomerStatementPayment[];
};


export async function getCustomerAccountStatement(
  customerId: string,
  startDate?: string,
  endDate?: string
): Promise<CustomerAccountStatement> {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      "get_customer_account_statement",
      {
        p_customer_id:
          customerId,

        p_start_date:
          startDate ?? null,

        p_end_date:
          endDate ?? null,
      }
    );


  if (error) {
    throw new Error(
      error.message
    );
  }


  return data as
    CustomerAccountStatement;
}


// ============================================================
// DEBTOR COLLECTION CONTROL
// ============================================================

export type DebtorCollectionStatus =
  | "normal"
  | "follow_up"
  | "promise_to_pay"
  | "disputed"
  | "credit_hold"
  | "legal";


export type DebtorCollectionActivityType =
  | "note"
  | "call"
  | "email"
  | "whatsapp"
  | "promise"
  | "reminder"
  | "credit_hold"
  | "credit_hold_removed"
  | "dispute"
  | "legal";


export type DebtorCollectionControl = {
  collection_status:
    DebtorCollectionStatus;

  next_follow_up_date:
    string | null;

  promised_payment_date:
    string | null;

  promised_amount:
    number | null;

  credit_hold:
    boolean;

  credit_hold_reason:
    string | null;

  assigned_to:
    string | null;

  last_contacted_at:
    string | null;

  last_contacted_by:
    string | null;
};


export type DebtorCollectionActivity = {
  id: string;

  activity_type:
    DebtorCollectionActivityType;

  activity_date: string;

  note: string;

  created_by:
    string | null;
};


export type CustomerCollectionResponse = {
  ok: boolean;

  customer_id: string;
  customer_name: string;

  control:
    DebtorCollectionControl;

  activity:
    DebtorCollectionActivity[];
};


export async function getCustomerCollectionControl(
  customerId: string
): Promise<CustomerCollectionResponse> {

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "get_customer_collection_control",
      {
        p_customer_id:
          customerId,
      }
    );


  if (error) {
    throw new Error(
      error.message
    );
  }


  return data as
    CustomerCollectionResponse;
}


export async function updateCustomerCollectionControl(
  customerId: string,
  input: {
    collectionStatus:
      DebtorCollectionStatus;

    nextFollowUpDate?:
      string | null;

    promisedPaymentDate?:
      string | null;

    promisedAmount?:
      number | null;

    creditHold:
      boolean;

    creditHoldReason?:
      string | null;
  }
) {

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "update_customer_collection_control",
      {
        p_customer_id:
          customerId,

        p_collection_status:
          input.collectionStatus,

        p_next_follow_up_date:
          input.nextFollowUpDate ??
          null,

        p_promised_payment_date:
          input.promisedPaymentDate ??
          null,

        p_promised_amount:
          input.promisedAmount ??
          null,

        p_credit_hold:
          input.creditHold,

        p_credit_hold_reason:
          input.creditHoldReason ??
          null,
      }
    );


  if (error) {
    throw new Error(
      error.message
    );
  }


  return data;
}


export async function addCustomerCollectionActivity(
  customerId: string,
  activityType:
    DebtorCollectionActivityType,
  note: string
) {

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "add_customer_collection_activity",
      {
        p_customer_id:
          customerId,

        p_activity_type:
          activityType,

        p_note:
          note,
      }
    );


  if (error) {
    throw new Error(
      error.message
    );
  }


  return data as string;
}


// ============================================================
// DEBTOR RISK WORKSPACE
// ============================================================

export type DebtorRiskLevel =
  | "current"
  | "due_today"
  | "watch"
  | "elevated"
  | "high"
  | "critical";

export type DebtorRiskCustomer = {
  customer_id: string;
  customer_name: string;

  outstanding: number;
  overdue: number;
  due_today: number;

  ageing_bucket: string;
  risk_level: DebtorRiskLevel;

  oldest_due_date: string | null;
  max_days_overdue: number;

  open_invoice_count: number;
  overdue_invoice_count: number;

  recommended_action: string;
};

export type DebtorRiskSummaryResult = {
  ok: boolean;
  as_of_date: string;

  summary: {
    total_outstanding: number;
    total_overdue: number;
    due_today: number;
    current: number;

    days_1_30: number;
    days_31_60: number;
    days_61_90: number;
    days_90_plus: number;

    critical_customers: number;
    high_customers: number;
    elevated_customers: number;
    watch_customers: number;
  };

  customers: DebtorRiskCustomer[];
};

export async function getDebtorRiskSummary(
  asOfDate?: string
): Promise<DebtorRiskSummaryResult> {
  const {
    data,
    error,
  } = await supabase.rpc(
    "get_debtor_risk_summary",
    {
      p_as_of_date:
        asOfDate ?? null,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data as
    DebtorRiskSummaryResult;
}


// ============================================================
// PAYMENT PROMISE WORKSPACE
// ============================================================

export type DebtorPaymentPromiseStatus =
  | "active"
  | "kept"
  | "partial"
  | "broken"
  | "cancelled";


export type DebtorPaymentPromise = {
  id: string;

  promised_amount: number;
  promised_payment_date: string;
  promise_start_date: string;

  status:
    DebtorPaymentPromiseStatus;

  paid_during_promise: number;
  shortfall: number;

  fulfilled_at: string | null;
  broken_at: string | null;
  cancelled_at: string | null;

  notes: string | null;

  created_at: string;
};


export type CustomerPaymentPromisesResult = {
  ok: boolean;

  customer_id: string;

  promises:
    DebtorPaymentPromise[];
};


export type CreatePaymentPromiseResult = {
  ok: boolean;

  promise_id: string;
  customer_id: string;

  promised_amount: number;
  promised_payment_date: string;

  outstanding_at_creation: number;

  status:
    DebtorPaymentPromiseStatus;
};


export async function getCustomerPaymentPromises(
  customerId: string
): Promise<CustomerPaymentPromisesResult> {
  const {
    data,
    error,
  } = await supabase.rpc(
    "get_customer_payment_promises",
    {
      p_customer_id:
        customerId,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data as
    CustomerPaymentPromisesResult;
}


export async function createDebtorPaymentPromise(
  input: {
    customerId: string;
    amount: number;
    paymentDate: string;
    notes?: string;
  }
): Promise<CreatePaymentPromiseResult> {
  const {
    data,
    error,
  } = await supabase.rpc(
    "create_debtor_payment_promise",
    {
      p_customer_id:
        input.customerId,

      p_promised_amount:
        input.amount,

      p_promised_payment_date:
        input.paymentDate,

      p_notes:
        input.notes?.trim() ||
        null,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data as
    CreatePaymentPromiseResult;
}


// ============================================================
// DEBTOR COLLECTION ACTION QUEUE
// ============================================================

export type DebtorCollectionQueueStatus =
  | "pending"
  | "approved"
  | "dismissed"
  | "completed";

export type DebtorCollectionPriority =
  | "low"
  | "normal"
  | "high"
  | "urgent";

export type DebtorCollectionActionType =
  | "reminder"
  | "follow_up"
  | "escalation"
  | "credit_review"
  | "legal_review"
  | "manual_review"
  | "promise_monitor"
  | "broken_promise";

export type DebtorCollectionQueueItem = {
  id: string;

  customer_id: string;
  customer_name: string;

  status:
    DebtorCollectionQueueStatus;

  priority:
    DebtorCollectionPriority;

  risk_level: string;
  ageing_bucket: string;

  action_type:
    DebtorCollectionActionType;

  recommended_channel:
    string;

  outstanding: number;
  overdue: number;
  max_days_overdue: number;

  due_on: string | null;

  reason: string;

  draft_subject: string | null;
  draft_message: string | null;

  decision_note: string | null;

  created_at: string;
  updated_at: string;
};

export type DebtorCollectionQueueResult = {
  ok: boolean;

  as_of_date: string;

  summary: {
    pending: number;
    approved: number;
    urgent: number;
    high: number;
  };

  items:
    DebtorCollectionQueueItem[];
};

export async function getDebtorCollectionQueue(
  asOfDate?: string
): Promise<DebtorCollectionQueueResult> {
  const {
    data,
    error,
  } = await supabase.rpc(
    "get_debtor_collection_queue",
    {
      p_as_of_date:
        asOfDate ?? null,

      p_status:
        "all",
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data as
    DebtorCollectionQueueResult;
}

export async function decideDebtorCollectionQueueItem(
  queueId: string,
  decision:
    | "approved"
    | "dismissed"
    | "completed",
  note?: string
) {
  const {
    data,
    error,
  } = await supabase.rpc(
    "decide_debtor_collection_queue_item",
    {
      p_queue_id:
        queueId,

      p_decision:
        decision,

      p_note:
        note?.trim() ||
        null,
    }
  );

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data as {
    ok: boolean;
    queue_id: string;
    status:
      DebtorCollectionQueueStatus;
  };
}
