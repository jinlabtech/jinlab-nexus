"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";

import { usePermissions } from "@/hooks/usePermissions";

import { supabase } from "@/lib/supabase";

import {
  getAccountingSettings,
  getFinanceSettings,
  saveAccountingSettings,
  saveFinanceSettings,
} from "@/lib/services/settingsService";

import type {
  CompanyAccountingSettings,
  CompanyFinanceSettings,
} from "@/types/settings";

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

function SettingToggle({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className={[
        "flex items-start justify-between gap-5 rounded-xl border p-4",
        disabled ? "opacity-60" : "",
      ].join(" ")}
    >
      <div>
        <p className="font-medium">{title}</p>

        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          {description}
        </p>
      </div>

      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.checked)
        }
        className="mt-1 h-5 w-5"
      />
    </label>
  );
}

export default function FinanceSettingsPage() {
  const router = useRouter();

  const {
    can,
    loading: permissionsLoading,
  } = usePermissions();

  const [finance, setFinance] =
    useState<CompanyFinanceSettings | null>(null);

  const [accounting, setAccounting] =
    useState<CompanyAccountingSettings | null>(
      null
    );

  const [loading, setLoading] = useState(true);

  const [savingFinance, setSavingFinance] =
    useState(false);

  const [savingAccounting, setSavingAccounting] =
    useState(false);

  const [message, setMessage] = useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  const canViewFinance =
    can("settings.finance.view") ||
    can("settings.finance.manage") ||
    can("settings.accounting.manage");

  const canManageFinance =
    can("settings.finance.manage");

  const canManageAccounting =
    can("settings.accounting.manage");

  useEffect(() => {
    if (permissionsLoading) {
      return;
    }

    if (!canViewFinance) {
      setLoading(false);
      return;
    }

    void loadSettings();
  }, [permissionsLoading, canViewFinance]);

  async function loadSettings() {
    try {
      setLoading(true);
      setErrorMessage("");

      const [
        financeSettings,
        accountingSettings,
      ] = await Promise.all([
        getFinanceSettings(),
        getAccountingSettings(),
      ]);

      setFinance(financeSettings);
      setAccounting(accountingSettings);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Settings could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function saveFinance() {
    if (!finance) {
      return;
    }

    try {
      setSavingFinance(true);
      setErrorMessage("");
      setMessage("");

      await saveFinanceSettings(finance);

      await loadSettings();

      setMessage(
        "Financial configuration saved successfully."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Financial settings could not be saved."
      );
    } finally {
      setSavingFinance(false);
    }
  }

  async function saveAccounting() {
    if (!accounting) {
      return;
    }

    try {
      setSavingAccounting(true);
      setErrorMessage("");
      setMessage("");

      await saveAccountingSettings(accounting);

      await loadSettings();

      setMessage(
        "Accounting automation settings saved successfully."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Accounting settings could not be saved."
      );
    } finally {
      setSavingAccounting(false);
    }
  }

  if (permissionsLoading || loading) {
    return (
      <DashboardLayout>
        <Navbar
          companyName="JINLAB Nexus"
          userName="Admin"
          onLogout={logout}
        />

        <main className="mx-auto max-w-7xl p-6 lg:p-8">
          <p className="text-sm text-muted-foreground">
            Loading financial controls...
          </p>
        </main>
      </DashboardLayout>
    );
  }

  if (!canViewFinance) {
    return (
      <DashboardLayout>
        <Navbar
          companyName="JINLAB Nexus"
          userName="Admin"
          onLogout={logout}
        />

        <main className="mx-auto max-w-5xl p-6 lg:p-8">
          <div className="rounded-xl border p-6">
            <h1 className="text-xl font-bold">
              Restricted Settings
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              Your role does not have authority to
              access Finance Settings.
            </p>

            <button
              type="button"
              onClick={() =>
                router.push("/settings")
              }
              className="mt-5 rounded-md border px-4 py-2 text-sm"
            >
              Return to Settings
            </button>
          </div>
        </main>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Navbar
        companyName="JINLAB Nexus"
        userName="Admin"
        onLogout={logout}
      />

      <main className="mx-auto max-w-7xl p-6 lg:p-8">
        <button
          type="button"
          onClick={() =>
            router.push("/settings")
          }
          className="mb-5 text-sm text-muted-foreground hover:text-foreground"
        >
          ← Settings
        </button>

        <div className="mb-8">
          <p className="text-sm font-medium text-muted-foreground">
            Finance & Accounting
          </p>

          <h1 className="mt-1 text-3xl font-bold">
            Financial Control Centre
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            These settings control how JINLAB Nexus
            calculates tax, handles credit, posts
            accounting transactions and governs
            financial automation.
          </p>
        </div>

        {can("accounting.view") && (
          <section className="mb-8 rounded-2xl border bg-card">
            <div className="border-b p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Connected Finance Workspaces
              </p>

              <h2 className="mt-1 text-lg font-semibold">
                Accounting Operations
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Financial configuration lives here. Daily accounting work stays inside the connected Accounting workspaces.
              </p>
            </div>

            <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
              {[
                {
                  name: "Accounting",
                  description: "Business performance and financial records",
                  href: "/accounting",
                },
                {
                  name: "Expenses & Bills",
                  description: "Rent, salaries and operating expenses",
                  href: "/accounting/expenses",
                },
                {
                  name: "What We Owe",
                  description: "Supplier bills and liabilities",
                  href: "/accounting/payables",
                },
                {
                  name: "Bank & Clearing",
                  description: "Card settlements and bank reconciliation",
                  href: "/accounting/bank-reconciliation",
                },
                {
                  name: "Inventory Costing",
                  description: "Stock valuation and Cost of Sales",
                  href: "/accounting/inventory-costing",
                },
                {
                  name: "Performance & Budget",
                  description: "Profit analysis, forecasting and budgets",
                  href: "/accounting/performance",
                },
              ].map((item) => (
                <button
                  key={item.href}
                  type="button"
                  onClick={() =>
                    router.push(item.href)
                  }
                  className="rounded-xl border bg-background p-4 text-left transition hover:-translate-y-0.5 hover:bg-muted/30 hover:shadow-sm"
                >
                  <p className="font-semibold">
                    {item.name}
                  </p>

                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {item.description}
                  </p>

                  <p className="mt-3 text-xs font-semibold">
                    Open →
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}


        {errorMessage && (
          <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        {message && (
          <div className="mb-6 rounded-xl border bg-muted/30 p-4 text-sm">
            {message}
          </div>
        )}

        {finance && (
          <div className="space-y-8">
            <section className="rounded-xl border bg-card">
              <div className="border-b p-5">
                <h2 className="text-lg font-semibold">
                  Financial Setup
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Core financial rules used across
                  Nexus.
                </p>
              </div>

              <div className="grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-sm font-medium">
                    Base Currency
                  </span>

                  <select
                    value={finance.base_currency}
                    disabled={!canManageFinance}
                    onChange={(event) =>
                      setFinance({
                        ...finance,
                        base_currency:
                          event.target.value,
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                  >
                    <option value="ZAR">
                      ZAR — South African Rand
                    </option>
                    <option value="USD">
                      USD — US Dollar
                    </option>
                    <option value="EUR">
                      EUR — Euro
                    </option>
                    <option value="GBP">
                      GBP — British Pound
                    </option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">
                    Financial Year Starts
                  </span>

                  <select
                    value={
                      finance.financial_year_start_month
                    }
                    disabled={!canManageFinance}
                    onChange={(event) =>
                      setFinance({
                        ...finance,
                        financial_year_start_month:
                          Number(
                            event.target.value
                          ),
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                  >
                    {MONTHS.map((month) => (
                      <option
                        key={month.value}
                        value={month.value}
                      >
                        {month.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">
                    Accounting Basis
                  </span>

                  <select
                    value={finance.accounting_basis}
                    disabled={!canManageFinance}
                    onChange={(event) =>
                      setFinance({
                        ...finance,
                        accounting_basis:
                          event.target.value as
                            | "accrual"
                            | "cash",
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                  >
                    <option value="accrual">
                      Accrual
                    </option>
                    <option value="cash">
                      Cash
                    </option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">
                    Accounting Lock Date
                  </span>

                  <input
                    type="date"
                    value={
                      finance.lock_accounting_before ??
                      ""
                    }
                    disabled={!canManageFinance}
                    onChange={(event) =>
                      setFinance({
                        ...finance,
                        lock_accounting_before:
                          event.target.value || null,
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                  />

                  <p className="text-xs text-muted-foreground">
                    Transactions before this date
                    should no longer be edited.
                  </p>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">
                    Rounding
                  </span>

                  <select
                    value={finance.rounding_method}
                    disabled={!canManageFinance}
                    onChange={(event) =>
                      setFinance({
                        ...finance,
                        rounding_method:
                          event.target.value as
                            CompanyFinanceSettings["rounding_method"],
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                  >
                    <option value="standard">
                      Standard
                    </option>
                    <option value="up">
                      Round Up
                    </option>
                    <option value="down">
                      Round Down
                    </option>
                    <option value="none">
                      No Rounding
                    </option>
                  </select>
                </label>
              </div>
            </section>

            <section className="rounded-xl border bg-card">
              <div className="border-b p-5">
                <h2 className="text-lg font-semibold">
                  VAT & Tax
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Company VAT identity and default tax
                  behaviour.
                </p>
              </div>

              <div className="space-y-5 p-5">
                <SettingToggle
                  title="VAT Registered"
                  description="Enable VAT behaviour for this company."
                  checked={finance.vat_registered}
                  disabled={!canManageFinance}
                  onChange={(value) =>
                    setFinance({
                      ...finance,
                      vat_registered: value,
                      vat_number: value
                        ? finance.vat_number
                        : null,
                    })
                  }
                />

                {finance.vat_registered && (
                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-medium">
                        VAT Number
                      </span>

                      <input
                        value={
                          finance.vat_number ?? ""
                        }
                        disabled={!canManageFinance}
                        onChange={(event) =>
                          setFinance({
                            ...finance,
                            vat_number:
                              event.target.value,
                          })
                        }
                        className="w-full rounded-md border bg-background px-3 py-2"
                        placeholder="VAT registration number"
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-medium">
                        Default VAT Rate %
                      </span>

                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={
                          finance.default_vat_rate
                        }
                        disabled={!canManageFinance}
                        onChange={(event) =>
                          setFinance({
                            ...finance,
                            default_vat_rate:
                              Number(
                                event.target.value
                              ),
                          })
                        }
                        className="w-full rounded-md border bg-background px-3 py-2"
                      />
                    </label>
                  </div>
                )}

                <SettingToggle
                  title="Prices Include VAT"
                  description="Treat entered selling prices as VAT-inclusive by default."
                  checked={
                    finance.prices_include_vat
                  }
                  disabled={!canManageFinance}
                  onChange={(value) =>
                    setFinance({
                      ...finance,
                      prices_include_vat: value,
                    })
                  }
                />
              </div>
            </section>

            <section className="rounded-xl border bg-card">
              <div className="border-b p-5">
                <h2 className="text-lg font-semibold">
                  Credit & Payment Terms
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Company defaults for customers and
                  suppliers.
                </p>
              </div>

              <div className="grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-sm font-medium">
                    Customer Payment Days
                  </span>

                  <input
                    type="number"
                    min="0"
                    value={
                      finance.default_customer_payment_days
                    }
                    disabled={!canManageFinance}
                    onChange={(event) =>
                      setFinance({
                        ...finance,
                        default_customer_payment_days:
                          Number(
                            event.target.value
                          ),
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">
                    Supplier Payment Days
                  </span>

                  <input
                    type="number"
                    min="0"
                    value={
                      finance.default_supplier_payment_days
                    }
                    disabled={!canManageFinance}
                    onChange={(event) =>
                      setFinance({
                        ...finance,
                        default_supplier_payment_days:
                          Number(
                            event.target.value
                          ),
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium">
                    Default Credit Limit
                  </span>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      finance.default_customer_credit_limit
                    }
                    disabled={
                      !canManageFinance ||
                      !finance.allow_customer_credit
                    }
                    onChange={(event) =>
                      setFinance({
                        ...finance,
                        default_customer_credit_limit:
                          Number(
                            event.target.value
                          ),
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                  />
                </label>

                <div className="md:col-span-2 xl:col-span-3">
                  <SettingToggle
                    title="Allow Customer Credit"
                    description="Allow customers to carry approved balances instead of requiring immediate payment."
                    checked={
                      finance.allow_customer_credit
                    }
                    disabled={!canManageFinance}
                    onChange={(value) =>
                      setFinance({
                        ...finance,
                        allow_customer_credit: value,
                      })
                    }
                  />
                </div>
              </div>

              {canManageFinance && (
                <div className="border-t p-5">
                  <button
                    type="button"
                    disabled={savingFinance}
                    onClick={saveFinance}
                    className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {savingFinance
                      ? "Saving..."
                      : "Save Financial Configuration"}
                  </button>
                </div>
              )}
            </section>
          </div>
        )}

        {accounting && (
          <section className="mt-10 rounded-xl border bg-card">
            <div className="border-b p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    JINLAB Intelligence
                  </p>

                  <h2 className="mt-1 text-xl font-bold">
                    Nexus Accountant
                  </h2>

                  <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                    Configure how much routine
                    accounting Nexus may perform
                    automatically and when human
                    approval is required.
                  </p>
                </div>

                <span
                  className={[
                    "w-fit rounded-full px-3 py-1 text-xs font-semibold",
                    accounting.nexus_accountant_enabled
                      ? "bg-foreground text-background"
                      : "border text-muted-foreground",
                  ].join(" ")}
                >
                  {accounting.nexus_accountant_enabled
                    ? "ACTIVE"
                    : "OFF"}
                </span>
              </div>
            </div>

            <div className="space-y-8 p-5">
              <div>
                <h3 className="font-semibold">
                  Accounting Engine
                </h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  Core automatic bookkeeping rules.
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <SettingToggle
                    title="Accounting Engine"
                    description="Enable Nexus accounting behaviour for the company."
                    checked={
                      accounting.accounting_enabled
                    }
                    disabled={
                      !canManageAccounting
                    }
                    onChange={(value) =>
                      setAccounting({
                        ...accounting,
                        accounting_enabled: value,
                      })
                    }
                  />

                  <SettingToggle
                    title="Automatic Journals"
                    description="Allow operational transactions to create accounting journal entries."
                    checked={
                      accounting.automatic_journals
                    }
                    disabled={
                      !canManageAccounting
                    }
                    onChange={(value) =>
                      setAccounting({
                        ...accounting,
                        automatic_journals: value,
                      })
                    }
                  />

                  <SettingToggle
                    title="Post Invoices Automatically"
                    description="Post eligible issued invoices into the accounting ledger."
                    checked={
                      accounting.automatic_invoice_posting
                    }
                    disabled={
                      !canManageAccounting
                    }
                    onChange={(value) =>
                      setAccounting({
                        ...accounting,
                        automatic_invoice_posting:
                          value,
                      })
                    }
                  />

                  <SettingToggle
                    title="Post Payments Automatically"
                    description="Post confirmed invoice payments into the accounting ledger."
                    checked={
                      accounting.automatic_payment_posting
                    }
                    disabled={
                      !canManageAccounting
                    }
                    onChange={(value) =>
                      setAccounting({
                        ...accounting,
                        automatic_payment_posting:
                          value,
                      })
                    }
                  />

                  <SettingToggle
                    title="Post Purchases Automatically"
                    description="Prepare accounting entries from approved purchasing activity."
                    checked={
                      accounting.automatic_purchase_posting
                    }
                    disabled={
                      !canManageAccounting
                    }
                    onChange={(value) =>
                      setAccounting({
                        ...accounting,
                        automatic_purchase_posting:
                          value,
                      })
                    }
                  />

                  <SettingToggle
                    title="Automatic Bank Matching"
                    description="Allow Nexus to match bank transactions to invoices, payments and expenses."
                    checked={
                      accounting.automatic_bank_matching
                    }
                    disabled={
                      !canManageAccounting
                    }
                    onChange={(value) =>
                      setAccounting({
                        ...accounting,
                        automatic_bank_matching:
                          value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="border-t pt-8">
                <h3 className="font-semibold">
                  AI Accounting
                </h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  Control Nexus Accountant's
                  autonomous decision authority.
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <SettingToggle
                    title="Enable Nexus Accountant"
                    description="Activate AI-assisted accounting for this company."
                    checked={
                      accounting.nexus_accountant_enabled
                    }
                    disabled={
                      !canManageAccounting
                    }
                    onChange={(value) =>
                      setAccounting({
                        ...accounting,
                        nexus_accountant_enabled:
                          value,
                      })
                    }
                  />

                  <SettingToggle
                    title="Explain Financial Activity"
                    description="Allow Nexus Accountant to explain transactions, balances and accounting decisions."
                    checked={
                      accounting.ai_explanations_enabled
                    }
                    disabled={
                      !canManageAccounting
                    }
                    onChange={(value) =>
                      setAccounting({
                        ...accounting,
                        ai_explanations_enabled:
                          value,
                      })
                    }
                  />

                  <SettingToggle
                    title="AI Recommendations"
                    description="Provide financial recommendations and flag issues that need attention."
                    checked={
                      accounting.ai_recommendations_enabled
                    }
                    disabled={
                      !canManageAccounting
                    }
                    onChange={(value) =>
                      setAccounting({
                        ...accounting,
                        ai_recommendations_enabled:
                          value,
                      })
                    }
                  />

                  <SettingToggle
                    title="Classify Expenses"
                    description="Allow Nexus Accountant to classify routine expenses automatically."
                    checked={
                      accounting.ai_auto_classify_enabled
                    }
                    disabled={
                      !canManageAccounting
                    }
                    onChange={(value) =>
                      setAccounting({
                        ...accounting,
                        ai_auto_classify_enabled:
                          value,
                        automatic_expense_classification:
                          value,
                      })
                    }
                  />

                  <SettingToggle
                    title="Automatic Posting"
                    description="Allow high-confidence, policy-approved AI accounting decisions to post automatically."
                    checked={
                      accounting.ai_auto_post_enabled
                    }
                    disabled={
                      !canManageAccounting
                    }
                    onChange={(value) =>
                      setAccounting({
                        ...accounting,
                        ai_auto_post_enabled:
                          value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="border-t pt-8">
                <h3 className="font-semibold">
                  AI Authority & Approval
                </h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  Define when Nexus can act and when
                  an authorised person must intervene.
                </p>

                <div className="mt-5 grid gap-5 md:grid-cols-3">
                  <label className="space-y-2">
                    <span className="text-sm font-medium">
                      Confidence Required %
                    </span>

                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={
                        accounting.ai_confidence_threshold
                      }
                      disabled={
                        !canManageAccounting
                      }
                      onChange={(event) =>
                        setAccounting({
                          ...accounting,
                          ai_confidence_threshold:
                            Number(
                              event.target.value
                            ),
                        })
                      }
                      className="w-full rounded-md border bg-background px-3 py-2"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-medium">
                      Approval Above
                    </span>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        accounting.transaction_approval_threshold
                      }
                      disabled={
                        !canManageAccounting
                      }
                      onChange={(event) =>
                        setAccounting({
                          ...accounting,
                          transaction_approval_threshold:
                            Number(
                              event.target.value
                            ),
                        })
                      }
                      className="w-full rounded-md border bg-background px-3 py-2"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-medium">
                      When Nexus Is Uncertain
                    </span>

                    <select
                      value={
                        accounting.uncertain_transaction_action
                      }
                      disabled={
                        !canManageAccounting
                      }
                      onChange={(event) =>
                        setAccounting({
                          ...accounting,
                          uncertain_transaction_action:
                            event.target
                              .value as CompanyAccountingSettings["uncertain_transaction_action"],
                        })
                      }
                      className="w-full rounded-md border bg-background px-3 py-2"
                    >
                      <option value="ask">
                        Ask for approval
                      </option>

                      <option value="hold">
                        Hold transaction
                      </option>

                      <option value="manual_review">
                        Send for manual review
                      </option>
                    </select>
                  </label>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <SettingToggle
                    title="Manual Journals Need Approval"
                    description="Prevent unapproved manual accounting journals from being treated as final."
                    checked={
                      accounting.require_manual_journal_approval
                    }
                    disabled={
                      !canManageAccounting
                    }
                    onChange={(value) =>
                      setAccounting({
                        ...accounting,
                        require_manual_journal_approval:
                          value,
                      })
                    }
                  />

                  <SettingToggle
                    title="VAT Adjustments Need Approval"
                    description="Protect VAT-affecting adjustments with an approval step."
                    checked={
                      accounting.require_vat_adjustment_approval
                    }
                    disabled={
                      !canManageAccounting
                    }
                    onChange={(value) =>
                      setAccounting({
                        ...accounting,
                        require_vat_adjustment_approval:
                          value,
                      })
                    }
                  />

                  <SettingToggle
                    title="Reopen Period Needs Approval"
                    description="Require authority before changing transactions in a closed accounting period."
                    checked={
                      accounting.require_period_reopen_approval
                    }
                    disabled={
                      !canManageAccounting
                    }
                    onChange={(value) =>
                      setAccounting({
                        ...accounting,
                        require_period_reopen_approval:
                          value,
                      })
                    }
                  />

                  <SettingToggle
                    title="Tax Submission Needs Approval"
                    description="Nexus may prepare tax information, but final submission requires authorised approval."
                    checked={
                      accounting.require_tax_submission_approval
                    }
                    disabled={
                      !canManageAccounting
                    }
                    onChange={(value) =>
                      setAccounting({
                        ...accounting,
                        require_tax_submission_approval:
                          value,
                      })
                    }
                  />
                </div>
              </div>
            </div>

            {canManageAccounting && (
              <div className="border-t p-5">
                <button
                  type="button"
                  disabled={savingAccounting}
                  onClick={saveAccounting}
                  className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {savingAccounting
                    ? "Saving..."
                    : "Save Accounting Controls"}
                </button>
              </div>
            )}
          </section>
        )}

        <section className="mt-8 rounded-xl border bg-muted/20 p-5">
          <h2 className="font-semibold">
            Why these controls matter
          </h2>

          <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
            These values are no longer interface-only
            preferences. They are company-scoped
            financial policies stored in the Nexus
            database. Changes are performed through
            permission-protected database functions and
            recorded in the Settings change history.
          </p>
        </section>
      </main>
    </DashboardLayout>
  );
}
