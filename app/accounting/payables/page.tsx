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
  AlertTriangle,
  Boxes,
  CalendarClock,
  HandCoins,
  PackageCheck,
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


type SupplierBill = {
  id: string;
  bill_number: string;
  supplier_invoice_number: string | null;
  bill_date: string;
  due_date: string | null;

  supplier_id: string;
  supplier_name: string;

  branch_id: string | null;
  branch_name: string | null;

  purchase_order_id: string | null;
  purchase_receipt_id: string | null;

  subtotal: number;
  tax_amount: number;
  total_amount: number;

  amount_paid: number;
  balance_due: number;

  status:
    | "unpaid"
    | "partially_paid"
    | "paid"
    | "cancelled";

  overdue: boolean;
};


type UnbilledReceipt = {
  receipt_id: string;
  receipt_number: string;
  received_at: string;

  purchase_order_id: string;
  purchase_order_number: string;

  supplier_id: string;
  supplier_name: string;

  branch_id: string;
  branch_name: string | null;

  supplier_delivery_reference: string | null;

  stock_value: number;
  estimated_tax: number;
  estimated_total: number;
};


type PayablesWorkspace = {
  ok: boolean;

  as_of_date: string;

  summary: {
    total_owed: number;
    overdue: number;
    open_bills: number;
    paid_total: number;
  };

  bills: SupplierBill[];

  unbilled_receipts:
    UnbilledReceipt[];
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
    value.length >
      10
      ? value
      : `${value}T00:00:00`
  ).toLocaleDateString(
    "en-ZA",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}


export default function SupplierPayablesPage() {

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
      "accounting.payables.manage"
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
      PayablesWorkspace |
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
    creatingBill,
    setCreatingBill,
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
    selectedReceipt,
    setSelectedReceipt,
  ] =
    useState<
      UnbilledReceipt |
      null
    >(null);


  const [
    selectedBill,
    setSelectedBill,
  ] =
    useState<
      SupplierBill |
      null
    >(null);


  const [
    dueDate,
    setDueDate,
  ] =
    useState("");


  const [
    supplierInvoice,
    setSupplierInvoice,
  ] =
    useState("");


  const [
    liabilityNotes,
    setLiabilityNotes,
  ] =
    useState("");


  const [
    paymentAmount,
    setPaymentAmount,
  ] =
    useState("");


  const [
    paymentMethod,
    setPaymentMethod,
  ] =
    useState(
      "eft"
    );


  const [
    paymentDate,
    setPaymentDate,
  ] =
    useState(
      localDate()
    );


  const [
    paymentReference,
    setPaymentReference,
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
            "get_supplier_payables_workspace",
            {
              p_as_of_date:
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


      setWorkspace(
        workspaceResult.data as PayablesWorkspace
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Supplier liabilities could not be loaded."
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


      if (!canView) {
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


  function openReceipt(
    receipt:
      UnbilledReceipt
  ) {

    setSelectedReceipt(
      receipt
    );

    setDueDate(
      ""
    );

    setSupplierInvoice(
      receipt.supplier_delivery_reference ??
      ""
    );

    setLiabilityNotes(
      ""
    );
  }


  async function createBill() {

    if (
      !selectedReceipt
    ) {
      return;
    }


    try {

      setCreatingBill(
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
          "create_supplier_bill_from_receipt",
          {
            p_purchase_receipt_id:
              selectedReceipt.receipt_id,

            p_due_date:
              dueDate ||
              null,

            p_supplier_invoice_number:
              supplierInvoice.trim() ||
              null,

            p_notes:
              liabilityNotes.trim() ||
              null,
          }
        );


      if (error) {
        throw error;
      }


      setSuccessMessage(
        data?.simple_message ??
        "Supplier liability recorded."
      );


      setSelectedReceipt(
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
          : "Supplier bill could not be created."
      );

    } finally {

      setCreatingBill(
        false
      );
    }
  }


  function openPayment(
    bill:
      SupplierBill
  ) {

    setSelectedBill(
      bill
    );

    setPaymentAmount(
      String(
        bill.balance_due
      )
    );

    setPaymentMethod(
      "eft"
    );

    setPaymentDate(
      localDate()
    );

    setPaymentReference(
      ""
    );
  }


  async function payBill() {

    if (
      !selectedBill
    ) {
      return;
    }


    const amount =
      Number(
        paymentAmount
      );


    if (
      amount <= 0
    ) {
      setErrorMessage(
        "Enter a payment amount greater than zero."
      );

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
          "pay_supplier_bill",
          {
            p_supplier_bill_id:
              selectedBill.id,

            p_amount:
              amount,

            p_payment_method:
              paymentMethod,

            p_payment_date:
              paymentDate,

            p_reference:
              paymentReference.trim() ||
              null,
          }
        );


      if (error) {
        throw error;
      }


      setSuccessMessage(
        data?.simple_message ??
        "Supplier payment recorded."
      );


      setSelectedBill(
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
          : "Supplier payment could not be recorded."
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
            Loading what we owe...
          </p>

        </main>

      </DashboardLayout>
    );
  }


  if (!canView) {

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
              Your role does not have access to supplier liabilities.
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
              What We Owe
            </h1>


            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Supplier stock received now and paid later.
              Nexus keeps the stock as an asset and tracks the
              supplier debt separately.
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


            <Link
              href="/purchasing"
              className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium"
            >
              Open Purchasing →
            </Link>

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


        <div className="mb-6 rounded-2xl border border-violet-200 bg-violet-50 p-5 text-violet-950">

          <div className="flex items-start gap-3">

            <Boxes className="mt-0.5 h-5 w-5 shrink-0" />

            <div>

              <p className="font-semibold">
                Stock bought on credit is not an expense yet
              </p>

              <p className="mt-1 text-sm leading-6">
                When JINLAB receives stock without paying immediately,
                the stock becomes something the business owns and the
                supplier amount becomes something the business owes.
                The stock only becomes Cost of Sales when it is sold.
              </p>

            </div>

          </div>

        </div>


        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">

            <HandCoins className="h-5 w-5" />

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide">
              What We Owe Suppliers
            </p>

            <p className="mt-2 text-2xl font-bold">
              {
                money(
                  summary?.total_owed
                )
              }
            </p>

            <p className="mt-2 text-xs">
              Remaining supplier debt.
            </p>

          </div>


          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-950">

            <AlertTriangle className="h-5 w-5" />

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide">
              Overdue
            </p>

            <p className="mt-2 text-2xl font-bold">
              {
                money(
                  summary?.overdue
                )
              }
            </p>

            <p className="mt-2 text-xs">
              Supplier amounts past their due date.
            </p>

          </div>


          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5 text-orange-950">

            <CalendarClock className="h-5 w-5" />

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide">
              Open Bills
            </p>

            <p className="mt-2 text-2xl font-bold">
              {
                summary?.open_bills ??
                0
              }
            </p>

            <p className="mt-2 text-xs">
              Unpaid or partly paid supplier bills.
            </p>

          </div>


          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">

            <WalletCards className="h-5 w-5" />

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide">
              Paid to Suppliers
            </p>

            <p className="mt-2 text-2xl font-bold">
              {
                money(
                  summary?.paid_total
                )
              }
            </p>

            <p className="mt-2 text-xs">
              Supplier debt already settled.
            </p>

          </div>

        </section>


        <section className="mt-8 overflow-hidden rounded-2xl border bg-card">

          <div className="border-b p-5">

            <div className="flex items-start gap-3">

              <PackageCheck className="mt-0.5 h-5 w-5 text-violet-600" />

              <div>

                <h2 className="text-lg font-semibold">
                  Stock Received · Liability Not Yet Recorded
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  These goods receipts have stock in Nexus but do not yet
                  have a supplier bill linked to Accounting.
                </p>

              </div>

            </div>

          </div>


          {
            !workspace ||
            workspace.unbilled_receipts.length ===
              0 ? (
              <div className="p-8 text-center">

                <p className="font-semibold">
                  No unrecorded supplier stock liabilities
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  New unpaid stock receipts will appear here.
                </p>

              </div>
            ) : (
              <div className="divide-y">

                {
                  workspace.unbilled_receipts.map(
                    (
                      receipt
                    ) => (
                      <div
                        key={
                          receipt.receipt_id
                        }
                        className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
                      >

                        <div>

                          <p className="font-semibold">
                            {
                              receipt.supplier_name
                            }
                          </p>


                          <p className="mt-1 text-sm text-muted-foreground">
                            {
                              receipt.receipt_number
                            }
                            {" · "}
                            {
                              receipt.purchase_order_number
                            }
                          </p>


                          <p className="mt-1 text-xs text-muted-foreground">
                            Received{" "}
                            {
                              niceDate(
                                receipt.received_at
                              )
                            }
                            {
                              receipt.branch_name
                                ? ` · ${receipt.branch_name}`
                                : ""
                            }
                          </p>

                        </div>


                        <div className="flex items-center gap-4">

                          <div className="text-right">

                            <p className="text-xs text-muted-foreground">
                              Estimated supplier amount
                            </p>

                            <p className="font-bold">
                              {
                                money(
                                  receipt.estimated_total
                                )
                              }
                            </p>

                          </div>


                          {
                            canManage && (
                              <Button
                                type="button"
                                onClick={() =>
                                  openReceipt(
                                    receipt
                                  )
                                }
                                className="bg-violet-600 text-white hover:bg-violet-700"
                              >
                                Record What We Owe
                              </Button>
                            )
                          }

                        </div>

                      </div>
                    )
                  )
                }

              </div>
            )
          }

        </section>


        <section className="mt-8 overflow-hidden rounded-2xl border bg-card">

          <div className="border-b p-5">

            <h2 className="text-lg font-semibold">
              Supplier Bills
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Stock liabilities and supplier payment progress.
            </p>

          </div>


          {
            !workspace ||
            workspace.bills.length ===
              0 ? (
              <div className="p-8 text-center">

                <p className="font-semibold">
                  No supplier bills recorded yet
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  Record an unpaid goods receipt above to begin.
                </p>

              </div>
            ) : (
              <div className="overflow-x-auto">

                <table className="w-full min-w-[950px] text-sm">

                  <thead className="bg-muted/40">

                    <tr>

                      <th className="px-4 py-3 text-left">
                        Supplier
                      </th>

                      <th className="px-4 py-3 text-left">
                        Bill
                      </th>

                      <th className="px-4 py-3 text-left">
                        Due
                      </th>

                      <th className="px-4 py-3 text-left">
                        Status
                      </th>

                      <th className="px-4 py-3 text-right">
                        Total
                      </th>

                      <th className="px-4 py-3 text-right">
                        Paid
                      </th>

                      <th className="px-4 py-3 text-right">
                        Still Owe
                      </th>

                      <th className="px-4 py-3 text-right">
                        Action
                      </th>

                    </tr>

                  </thead>


                  <tbody className="divide-y">

                    {
                      workspace.bills.map(
                        (
                          bill
                        ) => (
                          <tr
                            key={
                              bill.id
                            }
                            className="hover:bg-muted/20"
                          >

                            <td className="px-4 py-4">

                              <p className="font-semibold">
                                {
                                  bill.supplier_name
                                }
                              </p>

                              {
                                bill.branch_name && (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {
                                      bill.branch_name
                                    }
                                  </p>
                                )
                              }

                            </td>


                            <td className="px-4 py-4">

                              <p className="font-medium">
                                {
                                  bill.bill_number
                                }
                              </p>

                              <p className="mt-1 text-xs text-muted-foreground">
                                {
                                  bill.supplier_invoice_number ??
                                  "No supplier invoice reference"
                                }
                              </p>

                            </td>


                            <td className="px-4 py-4">
                              {
                                niceDate(
                                  bill.due_date
                                )
                              }
                            </td>


                            <td className="px-4 py-4">

                              {
                                bill.status ===
                                "paid" ? (
                                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                                    Paid
                                  </span>
                                ) : bill.overdue ? (
                                  <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800">
                                    Overdue
                                  </span>
                                ) : bill.status ===
                                  "partially_paid" ? (
                                  <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800">
                                    Partly Paid
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                                    We Owe
                                  </span>
                                )
                              }

                            </td>


                            <td className="px-4 py-4 text-right">
                              {
                                money(
                                  bill.total_amount
                                )
                              }
                            </td>


                            <td className="px-4 py-4 text-right">
                              {
                                money(
                                  bill.amount_paid
                                )
                              }
                            </td>


                            <td className="px-4 py-4 text-right font-bold">
                              {
                                money(
                                  bill.balance_due
                                )
                              }
                            </td>


                            <td className="px-4 py-4 text-right">

                              {
                                canManage &&
                                bill.status !==
                                  "paid" ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() =>
                                      openPayment(
                                        bill
                                      )
                                    }
                                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                                  >
                                    Pay Supplier
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    Complete
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
            selectedReceipt !==
            null
          }
          title="Record Supplier Liability"
          subtitle={
            selectedReceipt
              ? `${selectedReceipt.supplier_name} · ${money(
                  selectedReceipt.estimated_total
                )}`
              : ""
          }
          onClose={() => {
            if (
              !creatingBill
            ) {
              setSelectedReceipt(
                null
              );
            }
          }}
          maxWidth="max-w-lg"
        >

          <div className="space-y-5">

            <div className="rounded-xl bg-violet-50 p-4 text-sm leading-6 text-violet-950">

              <strong>
                What Nexus will do:
              </strong>{" "}

              Stock remains an asset and this amount becomes
              <strong> What We Owe</strong>.
              It does not reduce profit yet.

            </div>


            <label className="block space-y-2 text-sm">

              <span className="font-medium">
                Supplier Invoice / Reference
              </span>

              <input
                type="text"
                value={
                  supplierInvoice
                }
                onChange={
                  (
                    event
                  ) =>
                    setSupplierInvoice(
                      event.target.value
                    )
                }
                className="w-full rounded-lg border bg-background px-3 py-2"
                placeholder="Optional"
              />

            </label>


            <label className="block space-y-2 text-sm">

              <span className="font-medium">
                Payment Due Date
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


            <label className="block space-y-2 text-sm">

              <span className="font-medium">
                Notes
              </span>

              <input
                type="text"
                value={
                  liabilityNotes
                }
                onChange={
                  (
                    event
                  ) =>
                    setLiabilityNotes(
                      event.target.value
                    )
                }
                className="w-full rounded-lg border bg-background px-3 py-2"
                placeholder="Optional"
              />

            </label>


            <div className="flex justify-end gap-2 border-t pt-4">

              <Button
                type="button"
                variant="outline"
                disabled={
                  creatingBill
                }
                onClick={() =>
                  setSelectedReceipt(
                    null
                  )
                }
              >
                Cancel
              </Button>


              <Button
                type="button"
                disabled={
                  creatingBill
                }
                onClick={() =>
                  void createBill()
                }
                className="bg-violet-600 text-white hover:bg-violet-700"
              >
                {
                  creatingBill
                    ? "Recording..."
                    : "Record What We Owe"
                }
              </Button>

            </div>

          </div>

        </ActionModal>


        <ActionModal
          open={
            selectedBill !==
            null
          }
          title="Pay Supplier"
          subtitle={
            selectedBill
              ? `${selectedBill.supplier_name} · Still owe ${money(
                  selectedBill.balance_due
                )}`
              : ""
          }
          onClose={() => {
            if (!paying) {
              setSelectedBill(
                null
              );
            }
          }}
          maxWidth="max-w-lg"
        >

          <div className="space-y-5">

            <div className="rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
              You can pay the full amount or enter a smaller amount.
              Nexus will keep the remaining supplier balance automatically.
            </div>


            <label className="block space-y-2 text-sm">

              <span className="font-medium">
                Amount Paying Now
              </span>

              <input
                type="number"
                min="0.01"
                step="0.01"
                value={
                  paymentAmount
                }
                onChange={
                  (
                    event
                  ) =>
                    setPaymentAmount(
                      event.target.value
                    )
                }
                className="w-full rounded-lg border bg-background px-3 py-2"
              />

            </label>


            <label className="block space-y-2 text-sm">

              <span className="font-medium">
                Paid Using
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


            <label className="block space-y-2 text-sm">

              <span className="font-medium">
                Payment Date
              </span>

              <input
                type="date"
                value={
                  paymentDate
                }
                onChange={
                  (
                    event
                  ) =>
                    setPaymentDate(
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
                  paymentReference
                }
                onChange={
                  (
                    event
                  ) =>
                    setPaymentReference(
                      event.target.value
                    )
                }
                className="w-full rounded-lg border bg-background px-3 py-2"
                placeholder="Optional"
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
                  setSelectedBill(
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
                  void payBill()
                }
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {
                  paying
                    ? "Recording Payment..."
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
