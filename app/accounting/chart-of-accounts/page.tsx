"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import DataTable from "@/components/DataTable";
import AccountingNav from "@/components/accounting/AccountingNav";

import {
  Button,
} from "@/components/ui/button";

import {
  usePermissions,
} from "@/hooks/usePermissions";

import {
  supabase,
} from "@/lib/supabase";

import {
  createAccountingAccount,
  getAccountingOverview,
  getChartOfAccounts,
  updateAccountingAccount,
} from "@/lib/services/accountingService";

import type {
  AccountingAccountType,
  ChartOfAccountRow,
} from "@/lib/services/accountingService";


const ACCOUNT_TYPES:
{
  value: AccountingAccountType;
  label: string;
}[] = [
  {
    value: "asset",
    label: "Assets",
  },
  {
    value: "liability",
    label: "Liabilities",
  },
  {
    value: "equity",
    label: "Equity",
  },
  {
    value: "revenue",
    label: "Revenue",
  },
  {
    value: "expense",
    label: "Expenses",
  },
];


function label(
  value: string
) {
  return value
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase()
    );
}


export default function ChartOfAccountsPage() {
  const router =
    useRouter();

  const {
    can,
    loading:
      permissionsLoading,
  } =
    usePermissions();

  const canView =
    can(
      "accounting.view"
    );

  const canManage =
    can(
      "accounting.accounts.manage"
    );

  const [
    companyName,
    setCompanyName,
  ] =
    useState(
      "JINLAB Nexus"
    );

  const [
    currency,
    setCurrency,
  ] =
    useState(
      "ZAR"
    );

  const [
    accounts,
    setAccounts,
  ] =
    useState<
      ChartOfAccountRow[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  const [
    message,
    setMessage,
  ] =
    useState("");

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    typeFilter,
    setTypeFilter,
  ] =
    useState<
      AccountingAccountType |
      "all"
    >("all");

  const [
    activeFilter,
    setActiveFilter,
  ] =
    useState<
      "all" |
      "active" |
      "inactive"
    >("active");

  const [
    showForm,
    setShowForm,
  ] =
    useState(false);

  const [
    editing,
    setEditing,
  ] =
    useState<
      ChartOfAccountRow |
      null
    >(null);

  const [
    code,
    setCode,
  ] =
    useState("");

  const [
    name,
    setName,
  ] =
    useState("");

  const [
    accountType,
    setAccountType,
  ] =
    useState<
      AccountingAccountType
    >("expense");

  const [
    subtype,
    setSubtype,
  ] =
    useState("");

  const [
    description,
    setDescription,
  ] =
    useState("");

  const [
    parentAccountId,
    setParentAccountId,
  ] =
    useState("");

  const [
    allowManualPosting,
    setAllowManualPosting,
  ] =
    useState(true);

  const [
    isActive,
    setIsActive,
  ] =
    useState(true);


  async function loadData() {
    try {
      setLoading(true);
      setErrorMessage("");

      const {
        data: {
          user,
        },
      } =
        await supabase.auth
          .getUser();

      if (!user) {
        router.replace(
          "/login"
        );
        return;
      }

      const {
        data: profile,
        error:
          profileError,
      } =
        await supabase
          .from(
            "user_profile"
          )
          .select(
            "company_id"
          )
          .eq(
            "user_id",
            user.id
          )
          .single();

      if (
        profileError ||
        !profile?.company_id
      ) {
        throw new Error(
          "Company profile could not be loaded."
        );
      }

      const [
        companyResult,
        overviewResult,
        accountResult,
      ] =
        await Promise.all([
          supabase
            .from(
              "company"
            )
            .select(
              "company_name"
            )
            .eq(
              "id",
              profile.company_id
            )
            .single(),

          getAccountingOverview(),

          getChartOfAccounts(),
        ]);

      if (
        companyResult.error
      ) {
        throw new Error(
          companyResult
            .error.message
        );
      }

      setCompanyName(
        companyResult
          .data.company_name
      );

      setCurrency(
        overviewResult
          .settings.base_currency
      );

      setAccounts(
        accountResult
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Chart of Accounts could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    if (
      permissionsLoading
    ) {
      return;
    }

    if (!canView) {
      setLoading(false);
      return;
    }

    void loadData();
  }, [
    permissionsLoading,
    canView,
  ]);


  async function logout() {
    await supabase.auth
      .signOut();

    router.replace(
      "/login"
    );
  }


  function money(
    value: number
  ) {
    return new Intl.NumberFormat(
      "en-ZA",
      {
        style: "currency",
        currency,
      }
    ).format(
      Number(value || 0)
    );
  }


  function resetForm() {
    setEditing(null);
    setCode("");
    setName("");
    setAccountType(
      "expense"
    );
    setSubtype("");
    setDescription("");
    setParentAccountId("");
    setAllowManualPosting(
      true
    );
    setIsActive(true);
  }


  function createNew() {
    resetForm();
    setMessage("");
    setErrorMessage("");
    setShowForm(true);
  }


  function editAccount(
    account:
      ChartOfAccountRow
  ) {
    setEditing(
      account
    );

    setCode(
      account.code
    );

    setName(
      account.name
    );

    setAccountType(
      account.account_type
    );

    setSubtype(
      account.account_subtype ??
      ""
    );

    setDescription(
      account.description ??
      ""
    );

    setParentAccountId(
      account.parent_account_id ??
      ""
    );

    setAllowManualPosting(
      account.allow_manual_posting
    );

    setIsActive(
      account.is_active
    );

    setMessage("");
    setErrorMessage("");
    setShowForm(true);
  }


  async function saveAccount() {
    if (
      !code.trim() ||
      !name.trim()
    ) {
      setErrorMessage(
        "Account code and name are required."
      );
      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");
      setMessage("");

      if (editing) {
        await updateAccountingAccount({
          accountId:
            editing.id,
          code,
          name,
          accountSubtype:
            subtype,
          description,
          parentAccountId:
            parentAccountId ||
            null,
          allowManualPosting,
          isActive,
        });

        setMessage(
          "Accounting account updated successfully."
        );
      } else {
        await createAccountingAccount({
          code,
          name,
          accountType,
          accountSubtype:
            subtype,
          description,
          parentAccountId:
            parentAccountId ||
            null,
          allowManualPosting,
        });

        setMessage(
          "Accounting account created successfully."
        );
      }

      setShowForm(false);
      resetForm();

      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Accounting account could not be saved."
      );
    } finally {
      setSaving(false);
    }
  }


  const parentOptions =
    accounts.filter(
      (account) =>
        account.is_active &&
        account.account_type ===
          accountType &&
        account.id !==
          editing?.id
    );


  const filteredAccounts =
    useMemo(
      () =>
        accounts.filter(
          (account) => {
            const matchesSearch =
              !search.trim() ||
              account.code
                .toLowerCase()
                .includes(
                  search
                    .trim()
                    .toLowerCase()
                ) ||
              account.name
                .toLowerCase()
                .includes(
                  search
                    .trim()
                    .toLowerCase()
                );

            const matchesType =
              typeFilter === "all" ||
              account.account_type ===
                typeFilter;

            const matchesActive =
              activeFilter === "all" ||
              (
                activeFilter ===
                  "active" &&
                account.is_active
              ) ||
              (
                activeFilter ===
                  "inactive" &&
                !account.is_active
              );

            return (
              matchesSearch &&
              matchesType &&
              matchesActive
            );
          }
        ),
      [
        accounts,
        search,
        typeFilter,
        activeFilter,
      ]
    );


  if (
    permissionsLoading ||
    loading
  ) {
    return (
      <DashboardLayout>
        <Navbar
          companyName={
            companyName
          }
          userName="Admin"
          onLogout={
            logout
          }
        />

        <main className="mx-auto max-w-7xl p-6 lg:p-8">
          <p className="text-sm text-muted-foreground">
            Loading Chart of Accounts...
          </p>
        </main>
      </DashboardLayout>
    );
  }


  return (
    <DashboardLayout>
      <Navbar
        companyName={
          companyName
        }
        userName="Admin"
        onLogout={
          logout
        }
      />

      <main className="mx-auto max-w-7xl p-6 lg:p-8">

        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Accounting
            </p>

            <h1 className="mt-1 text-3xl font-bold">
              Chart of Accounts
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Accounts used by the Nexus ledger,
              financial reports, VAT, reconciliation
              and automated accounting.
            </p>
          </div>

          {canManage && (
            <Button
              type="button"
              className="bg-black text-white hover:bg-black/85"
              onClick={
                createNew
              }
            >
              New Account
            </Button>
          )}
        </div>


        <AccountingNav />


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


        <section className="mb-6 grid gap-3 md:grid-cols-3">
          <input
            type="search"
            value={
              search
            }
            onChange={
              (
                event
              ) =>
                setSearch(
                  event.target.value
                )
            }
            placeholder="Search code or account..."
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />

          <select
            value={
              typeFilter
            }
            onChange={
              (
                event
              ) =>
                setTypeFilter(
                  event.target.value as
                    | AccountingAccountType
                    | "all"
                )
            }
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="all">
              All account types
            </option>

            {ACCOUNT_TYPES.map(
              (
                type
              ) => (
                <option
                  key={
                    type.value
                  }
                  value={
                    type.value
                  }
                >
                  {type.label}
                </option>
              )
            )}
          </select>

          <select
            value={
              activeFilter
            }
            onChange={
              (
                event
              ) =>
                setActiveFilter(
                  event.target.value as
                    | "all"
                    | "active"
                    | "inactive"
                )
            }
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="active">
              Active accounts
            </option>

            <option value="inactive">
              Inactive accounts
            </option>

            <option value="all">
              All accounts
            </option>
          </select>
        </section>


        <DataTable
          headers={[
            "Code",
            "Account",
            "Type",
            "Balance",
            "Posting",
            "Status",
            "Action",
          ]}
          rows={
            filteredAccounts.map(
              (
                account
              ) => [
                <span
                  key="code"
                  className="font-medium"
                >
                  {account.code}
                </span>,

                <div key="name">
                  <p className="font-medium">
                    {account.name}
                  </p>

                  {account.is_system && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Nexus system account
                    </p>
                  )}
                </div>,

                label(
                  account.account_type
                ),

                <span
                  key="balance"
                  className="font-medium"
                >
                  {money(
                    account.balance
                  )}
                </span>,

                account
                  .allow_manual_posting
                  ? "Manual allowed"
                  : "System controlled",

                account.is_active
                  ? "Active"
                  : "Inactive",

                canManage ? (
                  <Button
                    key="edit"
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      editAccount(
                        account
                      )
                    }
                  >
                    Manage
                  </Button>
                ) : (
                  "—"
                ),
              ]
            )
          }
          emptyMessage="No accounting accounts match these filters."
        />


        <p className="mt-3 text-xs text-muted-foreground">
          Showing{" "}
          {
            filteredAccounts.length
          }{" "}
          of{" "}
          {
            accounts.length
          }{" "}
          accounts.
        </p>


        {showForm && (
          <section className="mt-10 rounded-xl border bg-card">
            <div className="border-b p-5">
              <h2 className="text-lg font-semibold">
                {editing
                  ? "Manage Account"
                  : "New Account"}
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                {editing?.is_system
                  ? "This is a Nexus system account. Core accounting controls remain protected."
                  : "Create or maintain an account used by the company ledger."}
              </p>
            </div>


            <div className="grid gap-5 p-5 md:grid-cols-2">

              <label className="space-y-2">
                <span className="text-sm font-medium">
                  Account Code
                </span>

                <input
                  value={
                    code
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setCode(
                        event.target.value
                      )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </label>


              <label className="space-y-2">
                <span className="text-sm font-medium">
                  Account Name
                </span>

                <input
                  value={
                    name
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setName(
                        event.target.value
                      )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </label>


              <label className="space-y-2">
                <span className="text-sm font-medium">
                  Account Type
                </span>

                <select
                  value={
                    accountType
                  }
                  disabled={
                    Boolean(
                      editing
                    )
                  }
                  onChange={
                    (
                      event
                    ) => {
                      setAccountType(
                        event.target
                          .value as
                          AccountingAccountType
                      );

                      setParentAccountId(
                        ""
                      );
                    }
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                >
                  {ACCOUNT_TYPES.map(
                    (
                      type
                    ) => (
                      <option
                        key={
                          type.value
                        }
                        value={
                          type.value
                        }
                      >
                        {type.label}
                      </option>
                    )
                  )}
                </select>
              </label>


              <label className="space-y-2">
                <span className="text-sm font-medium">
                  Subtype
                </span>

                <input
                  value={
                    subtype
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setSubtype(
                        event.target.value
                      )
                  }
                  placeholder="e.g. Vehicle, Insurance, Marketing"
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </label>


              <label className="space-y-2">
                <span className="text-sm font-medium">
                  Parent Account
                </span>

                <select
                  value={
                    parentAccountId
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setParentAccountId(
                        event.target.value
                      )
                  }
                  className="w-full rounded-md border bg-background px-3 py-2"
                >
                  <option value="">
                    No parent account
                  </option>

                  {parentOptions.map(
                    (
                      account
                    ) => (
                      <option
                        key={
                          account.id
                        }
                        value={
                          account.id
                        }
                      >
                        {account.code} — {account.name}
                      </option>
                    )
                  )}
                </select>
              </label>


              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-medium">
                  Description
                </span>

                <textarea
                  value={
                    description
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setDescription(
                        event.target.value
                      )
                  }
                  rows={3}
                  className="w-full rounded-md border bg-background px-3 py-2"
                />
              </label>


              <label className="flex items-center gap-3 rounded-xl border p-4">
                <input
                  type="checkbox"
                  checked={
                    allowManualPosting
                  }
                  disabled={
                    Boolean(
                      editing
                        ?.is_system &&
                      !editing
                        .allow_manual_posting
                    )
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setAllowManualPosting(
                        event.target
                          .checked
                      )
                  }
                />

                <div>
                  <p className="text-sm font-medium">
                    Manual journal posting
                  </p>

                  <p className="text-xs text-muted-foreground">
                    Allow accountants to select this
                    account in manual journals.
                  </p>
                </div>
              </label>


              {editing &&
                !editing.is_system && (
                <label className="flex items-center gap-3 rounded-xl border p-4">
                  <input
                    type="checkbox"
                    checked={
                      isActive
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setIsActive(
                          event.target
                            .checked
                        )
                    }
                  />

                  <div>
                    <p className="text-sm font-medium">
                      Account active
                    </p>

                    <p className="text-xs text-muted-foreground">
                      Inactive accounts remain in
                      historical financial records.
                    </p>
                  </div>
                </label>
              )}

            </div>


            <div className="flex justify-end gap-2 border-t p-5">
              <Button
                type="button"
                variant="outline"
                disabled={
                  saving
                }
                onClick={() => {
                  setShowForm(
                    false
                  );
                  resetForm();
                }}
              >
                Cancel
              </Button>

              <Button
                type="button"
                disabled={
                  saving
                }
                className="bg-black text-white hover:bg-black/85"
                onClick={() =>
                  void saveAccount()
                }
              >
                {saving
                  ? "Saving..."
                  : editing
                    ? "Save Account"
                    : "Create Account"}
              </Button>
            </div>
          </section>
        )}

      </main>
    </DashboardLayout>
  );
}
