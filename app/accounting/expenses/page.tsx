"use client";

import {
  useEffect,
  useState,
} from "react";

import Link from "next/link";

import {
  useRouter,
} from "next/navigation";

import {
  Banknote,
  CalendarClock,
  CircleDollarSign,
  HandCoins,
  PackageOpen,
  Plus,
  RefreshCw,
  WalletCards,
} from "lucide-react";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
import AccountingNav from "@/components/accounting/AccountingNav";
import ActionModal from "@/components/ui/ActionModal";

import {
  Button,
} from "@/components/ui/button";

import {
  usePermissions,
} from "@/hooks/usePermissions";

import {
  supabase,
} from "@/lib/supabase";


type Category = {
  id: string;
  code: string;
  name: string;
  subtype:
    string |
    null;
};


type Supplier = {
  id: string;
  name: string;
};


type Branch = {
  id: string;
  name: string;
};


type Expense = {
  id: string;
  expense_number: string;
  expense_date: string;
  due_date:
    string |
    null;

  category_id: string;
  category: string;

  payee:
    string |
    null;

  supplier_id:
    string |
    null;

  supplier_name:
    string |
    null;

  branch_id:
    string |
    null;

  branch_name:
    string |
    null;

  total_amount: number;
  expense_amount: number;
  tax_amount: number;

  payment_status:
    "paid" |
    "unpaid";

  payment_method:
    string |
    null;

  payment_date:
    string |
    null;

  reference:
    string |
    null;

  notes:
    string |
    null;

  status: string;
  overdue: boolean;
};


type Workspace = {
  ok: boolean;

  period: {
    from_date: string;
    to_date: string;
  };

  summary: {
    total_expenses: number;
    paid_expenses: number;
    still_owed: number;
    overdue: number;
    unpaid_count: number;
  };

  categories:
    Category[];

  suppliers:
    Supplier[];

  branches:
    Branch[];

  expenses:
    Expense[];
};


function localDate() {
  const now =
    new Date();

  const offset =
    now.getTimezoneOffset() *
    60 *
    1000;

  return new Date(
    now.getTime() -
      offset
  )
    .toISOString()
    .slice(
      0,
      10
    );
}


function money(
  value:
    number |
    string |
    null |
    undefined
) {
  return new Intl.NumberFormat(
    "en-ZA",
    {
      style: "currency",
      currency: "ZAR",
      maximumFractionDigits: 2,
    }
  ).format(
    Number(
      value ?? 0
    )
  );
}


function niceDate(
  value:
    string |
    null
) {
  if (!value) {
    return "—";
  }

  return new Date(
    `${value}T00:00:00`
  ).toLocaleDateString(
    "en-ZA",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}


export default function ExpensesPage() {

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
      "accounting.expense.manage"
    );


  const [
    companyName,
    setCompanyName,
  ] =
    useState(
      "JINLAB Nexus"
    );


  const [
    workspace,
    setWorkspace,
  ] =
    useState<
      Workspace |
      null
    >(null);


  const [
    loading,
    setLoading,
  ] =
    useState(true);


  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);


  const [
    saving,
    setSaving,
  ] =
    useState(false);


  const [
    paying,
    setPaying,
  ] =
    useState(false);


  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");


  const [
    successMessage,
    setSuccessMessage,
  ] =
    useState("");


  const [
    showExpense,
    setShowExpense,
  ] =
    useState(false);


  const [
    selectedExpense,
    setSelectedExpense,
  ] =
    useState<
      Expense |
      null
    >(null);


  const [
    expenseDate,
    setExpenseDate,
  ] =
    useState(
      localDate()
    );


  const [
    categoryId,
    setCategoryId,
  ] =
    useState("");


  const [
    amount,
    setAmount,
  ] =
    useState("");


  const [
    paymentStatus,
    setPaymentStatus,
  ] =
    useState<
      "paid" |
      "unpaid"
    >(
      "paid"
    );


  const [
    paymentMethod,
    setPaymentMethod,
  ] =
    useState(
      "eft"
    );


  const [
    dueDate,
    setDueDate,
  ] =
    useState("");


  const [
    supplierId,
    setSupplierId,
  ] =
    useState("");


  const [
    branchId,
    setBranchId,
  ] =
    useState("");


  const [
    payeeName,
    setPayeeName,
  ] =
    useState("");


  const [
    reference,
    setReference,
  ] =
    useState("");


  const [
    notes,
    setNotes,
  ] =
    useState("");


  const [
    payMethod,
    setPayMethod,
  ] =
    useState(
      "eft"
    );


  const [
    payDate,
    setPayDate,
  ] =
    useState(
      localDate()
    );


  const [
    payReference,
    setPayReference,
  ] =
    useState("");


  async function loadWorkspace(
    silent = false
  ) {

    try {

      if (silent) {
        setRefreshing(
          true
        );
      } else {
        setLoading(
          true
        );
      }


      setErrorMessage(
        ""
      );


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
        data:
          profile,
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
        workspaceResult,
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

          supabase.rpc(
            "get_accounting_expense_workspace",
            {
              p_from_date:
                null,

              p_to_date:
                localDate(),
            }
          ),
        ]);


      if (
        companyResult.error
      ) {
        throw companyResult.error;
      }


      if (
        workspaceResult.error
      ) {
        throw workspaceResult.error;
      }


      setCompanyName(
        companyResult.data
          ?.company_name ??
        "JINLAB Nexus"
      );


      const next =
        workspaceResult.data as Workspace;


      setWorkspace(
        next
      );


      if (
        !categoryId &&
        next.categories.length >
          0
      ) {
        setCategoryId(
          next.categories[0].id
        );
      }

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Expenses could not be loaded."
      );

    } finally {

      setLoading(
        false
      );

      setRefreshing(
        false
      );
    }
  }


  useEffect(
    () => {

      if (
        permissionsLoading
      ) {
        return;
      }


      if (
        !canView
      ) {
        setLoading(
          false
        );

        return;
      }


      void loadWorkspace();

    },
    [
      permissionsLoading,
      canView,
    ]
  );


  function resetExpenseForm() {

    setExpenseDate(
      localDate()
    );

    setCategoryId(
      workspace
        ?.categories[0]
        ?.id ??
      ""
    );

    setAmount(
      ""
    );

    setPaymentStatus(
      "paid"
    );

    setPaymentMethod(
      "eft"
    );

    setDueDate(
      ""
    );

    setSupplierId(
      ""
    );

    setBranchId(
      ""
    );

    setPayeeName(
      ""
    );

    setReference(
      ""
    );

    setNotes(
      ""
    );
  }


  async function saveExpense() {

    try {

      if (
        !categoryId
      ) {
        throw new Error(
          "Choose what the money was spent on."
        );
      }


      if (
        Number(
          amount
        ) <= 0
      ) {
        throw new Error(
          "Enter an amount greater than zero."
        );
      }


      setSaving(
        true
      );

      setErrorMessage(
        ""
      );

      setSuccessMessage(
        ""
      );


      const {
        data,
        error,
      } =
        await supabase.rpc(
          "record_accounting_expense",
          {
            p_expense_date:
              expenseDate,

            p_expense_account_id:
              categoryId,

            p_total_amount:
              Number(
                amount
              ),

            p_payment_status:
              paymentStatus,

            p_payment_method:
              paymentStatus ===
              "paid"
                ? paymentMethod
                : null,

            p_branch_id:
              branchId ||
              null,

            p_supplier_id:
              supplierId ||
              null,

            p_payee_name:
              payeeName.trim() ||
              null,

            p_reference:
              reference.trim() ||
              null,

            p_notes:
              notes.trim() ||
              null,

            p_due_date:
              paymentStatus ===
                "unpaid" &&
              dueDate
                ? dueDate
                : null,

            p_tax_amount:
              0,
          }
        );


      if (error) {
        throw error;
      }


      setSuccessMessage(
        data?.simple_message ??
        "Expense recorded."
      );


      setShowExpense(
        false
      );

      resetExpenseForm();

      await loadWorkspace(
        true
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Expense could not be recorded."
      );

    } finally {

      setSaving(
        false
      );
    }
  }


  function openPayment(
    expense: Expense
  ) {

    setSelectedExpense(
      expense
    );

    setPayMethod(
      "eft"
    );

    setPayDate(
      localDate()
    );

    setPayReference(
      ""
    );
  }


  async function payExpense() {

    if (
      !selectedExpense
    ) {
      return;
    }


    try {

      setPaying(
        true
      );

      setErrorMessage(
        ""
      );

      setSuccessMessage(
        ""
      );


      const {
        data,
        error,
      } =
        await supabase.rpc(
          "pay_accounting_expense",
          {
            p_expense_id:
              selectedExpense.id,

            p_payment_method:
              payMethod,

            p_payment_date:
              payDate,

            p_payment_reference:
              payReference.trim() ||
              null,
          }
        );


      if (error) {
        throw error;
      }


      setSuccessMessage(
        data?.simple_message ??
        "Expense paid."
      );


      setSelectedExpense(
        null
      );

      await loadWorkspace(
        true
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Expense payment could not be recorded."
      );

    } finally {

      setPaying(
        false
      );
    }
  }


  async function logout() {

    await supabase.auth
      .signOut();

    router.replace(
      "/login"
    );
  }


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
            Loading expenses...
          </p>

        </main>

      </DashboardLayout>
    );
  }


  if (
    !canView
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


        <main className="mx-auto max-w-5xl p-6 lg:p-8">

          <div className="rounded-2xl border bg-card p-6">

            <h1 className="text-xl font-bold">
              Accounting Restricted
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              Your role does not have access to this area.
            </p>

          </div>

        </main>

      </DashboardLayout>
    );
  }


  const summary =
    workspace?.summary;


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


      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">

        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">

          <div>

            <p className="text-sm font-semibold text-muted-foreground">
              Accounting
            </p>


            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Expenses & Bills
            </h1>


            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Record normal business costs such as rent, salaries,
              internet, electricity, fuel and marketing.
              Nexus handles the accounting automatically.
            </p>

          </div>


          <div className="flex flex-wrap gap-2">

            <Button
              type="button"
              variant="outline"
              disabled={
                refreshing
              }
              onClick={() =>
                void loadWorkspace(
                  true
                )
              }
            >

              <RefreshCw
                className={`mr-2 h-4 w-4 ${
                  refreshing
                    ? "animate-spin"
                    : ""
                }`}
              />

              Refresh

            </Button>


            {
              canManage && (
                <Button
                  type="button"
                  onClick={() =>
                    setShowExpense(
                      true
                    )
                  }
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >

                  <Plus className="mr-2 h-4 w-4" />

                  Record Expense

                </Button>
              )
            }

          </div>

        </div>


        <AccountingNav />


        {
          errorMessage && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {
                errorMessage
              }
            </div>
          )
        }


        {
          successMessage && (
            <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              {
                successMessage
              }
            </div>
          )
        }


        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

            <div className="flex items-start gap-3">

              <PackageOpen className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />


              <div>

                <p className="font-semibold text-amber-950">
                  Buying stock is not a normal expense
                </p>

                <p className="mt-1 max-w-3xl text-sm leading-6 text-amber-900">
                  Phones, laptops and other resale stock should go through Purchasing.
                  Nexus treats stock as something the business owns first,
                  then moves its cost to Money Out only when the item is sold.
                </p>

              </div>

            </div>


            <Link
              href="/purchasing"
              className="shrink-0 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-100"
            >
              Open Purchasing →
            </Link>

          </div>

        </div>


        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">

            <CircleDollarSign className="h-5 w-5 text-rose-700" />

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-rose-800">
              Money Out
            </p>

            <p className="mt-2 text-2xl font-bold text-rose-950">
              {
                money(
                  summary?.total_expenses
                )
              }
            </p>

            <p className="mt-2 text-xs text-rose-800">
              Business costs recorded this year.
            </p>

          </div>


          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">

            <WalletCards className="h-5 w-5 text-emerald-700" />

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-emerald-800">
              Already Paid
            </p>

            <p className="mt-2 text-2xl font-bold text-emerald-950">
              {
                money(
                  summary?.paid_expenses
                )
              }
            </p>

            <p className="mt-2 text-xs text-emerald-800">
              Costs already settled.
            </p>

          </div>


          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">

            <HandCoins className="h-5 w-5 text-amber-700" />

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-amber-800">
              What We Owe
            </p>

            <p className="mt-2 text-2xl font-bold text-amber-950">
              {
                money(
                  summary?.still_owed
                )
              }
            </p>

            <p className="mt-2 text-xs text-amber-800">
              Expenses recorded but not paid yet.
            </p>

          </div>


          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5">

            <CalendarClock className="h-5 w-5 text-orange-700" />

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-orange-800">
              Overdue Bills
            </p>

            <p className="mt-2 text-2xl font-bold text-orange-950">
              {
                money(
                  summary?.overdue
                )
              }
            </p>

            <p className="mt-2 text-xs text-orange-800">
              {
                summary?.unpaid_count ??
                0
              } unpaid item(s).
            </p>

          </div>

        </section>


        <section className="mt-8 overflow-hidden rounded-2xl border bg-card">

          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">

            <div>

              <h2 className="text-lg font-semibold">
                Expense History
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Normal business spending and unpaid bills.
              </p>

            </div>

          </div>


          {
            !workspace ||
            workspace.expenses.length ===
              0 ? (
              <div className="p-10 text-center">

                <Banknote className="mx-auto h-8 w-8 text-muted-foreground" />

                <p className="mt-3 font-semibold">
                  No expenses recorded yet
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  Start with a real JINLAB expense such as rent,
                  internet or salaries.
                </p>

              </div>
            ) : (
              <div className="overflow-x-auto">

                <table className="w-full min-w-[900px] text-sm">

                  <thead className="bg-muted/40">

                    <tr>

                      <th className="px-4 py-3 text-left">
                        Date
                      </th>

                      <th className="px-4 py-3 text-left">
                        Expense
                      </th>

                      <th className="px-4 py-3 text-left">
                        Paid To
                      </th>

                      <th className="px-4 py-3 text-left">
                        Status
                      </th>

                      <th className="px-4 py-3 text-right">
                        Amount
                      </th>

                      <th className="px-4 py-3 text-right">
                        Action
                      </th>

                    </tr>

                  </thead>


                  <tbody className="divide-y">

                    {
                      workspace.expenses.map(
                        (
                          expense
                        ) => (
                          <tr
                            key={
                              expense.id
                            }
                            className="hover:bg-muted/20"
                          >

                            <td className="px-4 py-4">
                              {
                                niceDate(
                                  expense.expense_date
                                )
                              }
                            </td>


                            <td className="px-4 py-4">

                              <p className="font-semibold">
                                {
                                  expense.category
                                }
                              </p>

                              <p className="mt-1 text-xs text-muted-foreground">
                                {
                                  expense.expense_number
                                }
                                {
                                  expense.reference
                                    ? ` · ${expense.reference}`
                                    : ""
                                }
                              </p>

                            </td>


                            <td className="px-4 py-4">

                              <p>
                                {
                                  expense.payee ??
                                  "—"
                                }
                              </p>

                              {
                                expense.branch_name && (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {
                                      expense.branch_name
                                    }
                                  </p>
                                )
                              }

                            </td>


                            <td className="px-4 py-4">

                              {
                                expense.payment_status ===
                                "paid" ? (
                                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                                    Paid
                                  </span>
                                ) : expense.overdue ? (
                                  <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800">
                                    Overdue
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                                    We Owe
                                  </span>
                                )
                              }


                              {
                                expense.payment_status ===
                                  "unpaid" &&
                                expense.due_date && (
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    Due{" "}
                                    {
                                      niceDate(
                                        expense.due_date
                                      )
                                    }
                                  </p>
                                )
                              }

                            </td>


                            <td className="px-4 py-4 text-right font-bold">
                              {
                                money(
                                  expense.total_amount
                                )
                              }
                            </td>


                            <td className="px-4 py-4 text-right">

                              {
                                canManage &&
                                expense.payment_status ===
                                  "unpaid" ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() =>
                                      openPayment(
                                        expense
                                      )
                                    }
                                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                                  >
                                    Pay Bill
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    {
                                      expense.payment_method
                                        ? expense.payment_method.toUpperCase()
                                        : "—"
                                    }
                                  </span>
                                )
                              }

                            </td>

                          </tr>
                        )
                      )
                    }

                  </tbody>

                </table>

              </div>
            )
          }

        </section>


        <ActionModal
          open={
            showExpense
          }
          title="Record Expense"
          subtitle="Tell Nexus what the business spent money on. The accounting happens automatically."
          onClose={() => {
            if (!saving) {
              setShowExpense(
                false
              );
            }
          }}
          maxWidth="max-w-2xl"
        >

          <div className="space-y-5">

            <div className="grid gap-4 sm:grid-cols-2">

              <label className="space-y-2 text-sm">

                <span className="font-medium">
                  Date
                </span>

                <input
                  type="date"
                  value={
                    expenseDate
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setExpenseDate(
                        event.target.value
                      )
                  }
                  className="w-full rounded-lg border bg-background px-3 py-2"
                />

              </label>


              <label className="space-y-2 text-sm">

                <span className="font-medium">
                  What was the money spent on?
                </span>

                <select
                  value={
                    categoryId
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setCategoryId(
                        event.target.value
                      )
                  }
                  className="w-full rounded-lg border bg-background px-3 py-2"
                >

                  {
                    workspace?.categories.map(
                      (
                        category
                      ) => (
                        <option
                          key={
                            category.id
                          }
                          value={
                            category.id
                          }
                        >
                          {
                            category.name
                          }
                        </option>
                      )
                    )
                  }

                </select>

              </label>

            </div>


            <label className="space-y-2 text-sm">

              <span className="font-medium">
                Total Amount
              </span>

              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  amount
                }
                onChange={
                  (
                    event
                  ) =>
                    setAmount(
                      event.target.value
                    )
                }
                placeholder="e.g. 5000"
                className="w-full rounded-lg border bg-background px-3 py-2"
              />

            </label>


            <div className="grid gap-4 sm:grid-cols-2">

              <label className="space-y-2 text-sm">

                <span className="font-medium">
                  Has JINLAB paid it?
                </span>

                <select
                  value={
                    paymentStatus
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setPaymentStatus(
                        event.target.value as "paid" | "unpaid"
                      )
                  }
                  className="w-full rounded-lg border bg-background px-3 py-2"
                >

                  <option value="paid">
                    Yes · Paid now
                  </option>

                  <option value="unpaid">
                    No · Pay later
                  </option>

                </select>

              </label>


              {
                paymentStatus ===
                "paid" ? (
                  <label className="space-y-2 text-sm">

                    <span className="font-medium">
                      Paid using
                    </span>

                    <select
                      value={
                        paymentMethod
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setPaymentMethod(
                            event.target.value
                          )
                      }
                      className="w-full rounded-lg border bg-background px-3 py-2"
                    >

                      <option value="eft">
                        EFT / Bank
                      </option>

                      <option value="cash">
                        Cash
                      </option>

                      <option value="card">
                        Card
                      </option>

                      <option value="other">
                        Other
                      </option>

                    </select>

                  </label>
                ) : (
                  <label className="space-y-2 text-sm">

                    <span className="font-medium">
                      Due Date
                    </span>

                    <input
                      type="date"
                      value={
                        dueDate
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setDueDate(
                            event.target.value
                          )
                      }
                      className="w-full rounded-lg border bg-background px-3 py-2"
                    />

                  </label>
                )
              }

            </div>


            <div className="grid gap-4 sm:grid-cols-2">

              <label className="space-y-2 text-sm">

                <span className="font-medium">
                  Paid to / Owed to
                </span>

                <input
                  type="text"
                  value={
                    payeeName
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setPayeeName(
                        event.target.value
                      )
                  }
                  placeholder="e.g. Landlord, Staff Payroll, Eskom"
                  className="w-full rounded-lg border bg-background px-3 py-2"
                />

              </label>


              <label className="space-y-2 text-sm">

                <span className="font-medium">
                  Existing Supplier
                </span>

                <select
                  value={
                    supplierId
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setSupplierId(
                        event.target.value
                      )
                  }
                  className="w-full rounded-lg border bg-background px-3 py-2"
                >

                  <option value="">
                    None
                  </option>

                  {
                    workspace?.suppliers.map(
                      (
                        supplier
                      ) => (
                        <option
                          key={
                            supplier.id
                          }
                          value={
                            supplier.id
                          }
                        >
                          {
                            supplier.name
                          }
                        </option>
                      )
                    )
                  }

                </select>

              </label>

            </div>


            {
              (
                workspace?.branches.length ??
                0
              ) >
                0 && (
                <label className="space-y-2 text-sm">

                  <span className="font-medium">
                    Branch
                  </span>

                  <select
                    value={
                      branchId
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setBranchId(
                          event.target.value
                        )
                    }
                    className="w-full rounded-lg border bg-background px-3 py-2"
                  >

                    <option value="">
                      Whole company / No specific branch
                    </option>

                    {
                      workspace?.branches.map(
                        (
                          branch
                        ) => (
                          <option
                            key={
                              branch.id
                            }
                            value={
                              branch.id
                            }
                          >
                            {
                              branch.name
                            }
                          </option>
                        )
                      )
                    }

                  </select>

                </label>
              )
            }


            <div className="grid gap-4 sm:grid-cols-2">

              <label className="space-y-2 text-sm">

                <span className="font-medium">
                  Reference
                </span>

                <input
                  type="text"
                  value={
                    reference
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setReference(
                        event.target.value
                      )
                  }
                  placeholder="Invoice, receipt or reference number"
                  className="w-full rounded-lg border bg-background px-3 py-2"
                />

              </label>


              <label className="space-y-2 text-sm">

                <span className="font-medium">
                  Notes
                </span>

                <input
                  type="text"
                  value={
                    notes
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setNotes(
                        event.target.value
                      )
                  }
                  placeholder="Optional"
                  className="w-full rounded-lg border bg-background px-3 py-2"
                />

              </label>

            </div>


            <div className="rounded-xl bg-muted/40 p-4 text-sm leading-6">

              <strong>
                Simple rule:
              </strong>{" "}

              Rent, salaries, electricity, fuel and internet belong here.
              Stock for resale belongs in Purchasing.

            </div>


            <div className="flex justify-end gap-2 border-t pt-4">

              <Button
                type="button"
                variant="outline"
                disabled={
                  saving
                }
                onClick={() =>
                  setShowExpense(
                    false
                  )
                }
              >
                Cancel
              </Button>


              <Button
                type="button"
                disabled={
                  saving
                }
                onClick={() =>
                  void saveExpense()
                }
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >

                {
                  saving
                    ? "Recording..."
                    : "Record Expense"
                }

              </Button>

            </div>

          </div>

        </ActionModal>


        <ActionModal
          open={
            selectedExpense !==
            null
          }
          title="Pay Bill"
          subtitle={
            selectedExpense
              ? `${selectedExpense.category} · ${money(
                  selectedExpense.total_amount
                )}`
              : ""
          }
          onClose={() => {
            if (!paying) {
              setSelectedExpense(
                null
              );
            }
          }}
          maxWidth="max-w-lg"
        >

          <div className="space-y-5">

            <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">

              Paying this will reduce{" "}
              <strong>
                What We Owe
              </strong>{" "}
              and reduce the selected cash/bank account.

            </div>


            <label className="block space-y-2 text-sm">

              <span className="font-medium">
                Paid using
              </span>

              <select
                value={
                  payMethod
                }
                onChange={
                  (
                    event
                  ) =>
                    setPayMethod(
                      event.target.value
                    )
                }
                className="w-full rounded-lg border bg-background px-3 py-2"
              >

                <option value="eft">
                  EFT / Bank
                </option>

                <option value="cash">
                  Cash
                </option>

                <option value="card">
                  Card
                </option>

                <option value="other">
                  Other
                </option>

              </select>

            </label>


            <label className="block space-y-2 text-sm">

              <span className="font-medium">
                Payment Date
              </span>

              <input
                type="date"
                value={
                  payDate
                }
                onChange={
                  (
                    event
                  ) =>
                    setPayDate(
                      event.target.value
                    )
                }
                className="w-full rounded-lg border bg-background px-3 py-2"
              />

            </label>


            <label className="block space-y-2 text-sm">

              <span className="font-medium">
                Payment Reference
              </span>

              <input
                type="text"
                value={
                  payReference
                }
                onChange={
                  (
                    event
                  ) =>
                    setPayReference(
                      event.target.value
                    )
                }
                placeholder="Optional"
                className="w-full rounded-lg border bg-background px-3 py-2"
              />

            </label>


            <div className="flex justify-end gap-2 border-t pt-4">

              <Button
                type="button"
                variant="outline"
                disabled={
                  paying
                }
                onClick={() =>
                  setSelectedExpense(
                    null
                  )
                }
              >
                Cancel
              </Button>


              <Button
                type="button"
                disabled={
                  paying
                }
                onClick={() =>
                  void payExpense()
                }
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >

                {
                  paying
                    ? "Paying..."
                    : "Confirm Payment"
                }

              </Button>

            </div>

          </div>

        </ActionModal>

      </main>

    </DashboardLayout>
  );
}
