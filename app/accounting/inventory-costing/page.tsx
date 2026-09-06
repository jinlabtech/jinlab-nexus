"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  AlertTriangle,
  Boxes,
  Calculator,
  CheckCircle2,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { useRouter } from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";
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


type OpeningStockRow = {
  branch_id: string;
  branch_name: string;
  inventory_item_id: string;
  item_name: string;
  sku: string | null;
  quantity: number;
  catalog_unit_cost: number;
  opening_value: number;
  cost_ok: boolean;
};


type Readiness = {
  ok: boolean;
  enabled: boolean;
  costing_method: string;
  can_activate: boolean;
  requires_stock_count_confirmation: boolean;

  summary: {
    physical_units: number;
    opening_stock_valuation: number;
    inventory_ledger_balance: number;
    cutover_adjustment: number;
    missing_cost_items: number;
    historical_product_units_sold: number;
    historical_product_revenue: number;
    historical_zero_price_product_lines: number;
  };

  accounting: {
    enabled: boolean;
    automatic_journals: boolean;
    automatic_invoice_posting: boolean;
    basis: string;
    inventory_account_configured: boolean;
    cost_of_sales_account_configured: boolean;
    owner_equity_account_configured: boolean;
  };

  opening_stock: OpeningStockRow[];

  warning: string;
};


function money(
  value:
    number |
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


export default function InventoryCostingPage() {

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
      "accounting.inventory_costing.manage"
    );


  const [
    companyName,
    setCompanyName,
  ] =
    useState(
      "JINLAB Nexus"
    );


  const [
    readiness,
    setReadiness,
  ] =
    useState<
      Readiness |
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
    activating,
    setActivating,
  ] =
    useState(false);


  const [
    confirmed,
    setConfirmed,
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


  async function loadData(
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
        readinessResult,
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
            "get_inventory_costing_readiness"
          ),
        ]);


      if (
        companyResult.error
      ) {
        throw companyResult.error;
      }


      if (
        readinessResult.error
      ) {
        throw readinessResult.error;
      }


      setCompanyName(
        companyResult.data
          ?.company_name ??
        "JINLAB Nexus"
      );


      setReadiness(
        readinessResult.data as Readiness
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Inventory costing could not be loaded."
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


      void loadData();

    },
    [
      permissionsLoading,
      canView,
    ]
  );


  async function activateCosting() {

    if (
      !readiness ||
      !confirmed
    ) {
      return;
    }


    const approved =
      window.confirm(
        [
          "Activate weighted-average inventory costing?",
          "",
          `Opening stock: ${readiness.summary.physical_units} units`,
          `Opening value: ${money(
            readiness.summary.opening_stock_valuation
          )}`,
          "",
          "This starts accurate Cost of Sales from today forward.",
          "Historical sales will NOT be rewritten.",
        ].join(
          "\n"
        )
      );


    if (!approved) {
      return;
    }


    try {

      setActivating(
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
          "activate_inventory_costing",
          {
            p_confirm_stock_counts:
              true,

            p_notes:
              "Activated after owner review of opening stock quantities and costs.",
          }
        );


      if (error) {
        throw error;
      }


      setSuccessMessage(
        data?.message ??
        "Inventory costing activated."
      );


      setConfirmed(
        false
      );


      await loadData(
        true
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Inventory costing could not be activated."
      );

    } finally {

      setActivating(
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
            Checking inventory accounting...
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


        <main className="mx-auto max-w-5xl p-6">

          <div className="rounded-2xl border p-6">

            <h1 className="text-xl font-bold">
              Accounting Restricted
            </h1>

          </div>

        </main>

      </DashboardLayout>
    );
  }


  const summary =
    readiness?.summary;


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
              Inventory Costing
            </h1>


            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Connect physical stock to Accounting so every future
              product sale automatically calculates true Cost of Sales
              and profit.
            </p>

          </div>


          <Button
            type="button"
            variant="outline"
            disabled={
              refreshing
            }
            onClick={() =>
              void loadData(
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


        {
          readiness?.enabled ? (
            <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">

              <div className="flex items-start gap-3">

                <CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-700" />


                <div>

                  <h2 className="text-lg font-bold text-emerald-950">
                    Inventory Costing Active
                  </h2>


                  <p className="mt-1 text-sm leading-6 text-emerald-900">
                    Future product sales now reduce stock and post
                    Cost of Sales automatically using weighted-average cost.
                  </p>

                </div>

              </div>

            </div>
          ) : (
            <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-6">

              <div className="flex items-start gap-3">

                <AlertTriangle className="mt-0.5 h-6 w-6 text-amber-700" />


                <div>

                  <h2 className="text-lg font-bold text-amber-950">
                    Costing Not Activated Yet
                  </h2>


                  <p className="mt-1 text-sm leading-6 text-amber-900">
                    Current profit includes rent and salaries,
                    but historical product Cost of Sales is still missing.
                    Confirm physical opening stock below before activation.
                  </p>

                </div>

              </div>

            </div>
          )
        }


        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

          <div className="rounded-2xl border bg-card p-5">

            <Boxes className="h-5 w-5 text-violet-600" />

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Physical Stock
            </p>

            <p className="mt-2 text-2xl font-bold">
              {
                summary?.physical_units ??
                0
              } units
            </p>

          </div>


          <div className="rounded-2xl border bg-card p-5">

            <Calculator className="h-5 w-5 text-emerald-600" />

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Opening Stock Value
            </p>

            <p className="mt-2 text-2xl font-bold">
              {
                money(
                  summary?.opening_stock_valuation
                )
              }
            </p>

          </div>


          <div className="rounded-2xl border bg-card p-5">

            <PackageCheck className="h-5 w-5 text-amber-600" />

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Inventory Ledger Now
            </p>

            <p className="mt-2 text-2xl font-bold">
              {
                money(
                  summary?.inventory_ledger_balance
                )
              }
            </p>

          </div>


          <div className="rounded-2xl border bg-card p-5">

            <ShieldCheck className="h-5 w-5 text-rose-600" />

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cutover Adjustment
            </p>

            <p className="mt-2 text-2xl font-bold">
              {
                money(
                  summary?.cutover_adjustment
                )
              }
            </p>

          </div>

        </section>


        <section className="mt-8 overflow-hidden rounded-2xl border bg-card">

          <div className="border-b p-5">

            <h2 className="text-lg font-semibold">
              Opening Stock Check
            </h2>


            <p className="mt-1 text-sm text-muted-foreground">
              These quantities become the starting point for accurate
              inventory accounting.
            </p>

          </div>


          <div className="overflow-x-auto">

            <table className="w-full min-w-[800px] text-sm">

              <thead className="bg-muted/40">

                <tr>

                  <th className="px-4 py-3 text-left">
                    Branch
                  </th>

                  <th className="px-4 py-3 text-left">
                    Item
                  </th>

                  <th className="px-4 py-3 text-right">
                    Quantity
                  </th>

                  <th className="px-4 py-3 text-right">
                    Unit Cost
                  </th>

                  <th className="px-4 py-3 text-right">
                    Stock Value
                  </th>

                </tr>

              </thead>


              <tbody className="divide-y">

                {
                  readiness
                    ?.opening_stock
                    .map(
                      (
                        row
                      ) => (
                        <tr
                          key={
                            `${row.branch_id}-${row.inventory_item_id}`
                          }
                        >

                          <td className="px-4 py-4">
                            {
                              row.branch_name
                            }
                          </td>


                          <td className="px-4 py-4">

                            <p className="font-semibold">
                              {
                                row.item_name
                              }
                            </p>

                            <p className="text-xs text-muted-foreground">
                              {
                                row.sku ??
                                "No SKU"
                              }
                            </p>

                          </td>


                          <td className="px-4 py-4 text-right font-semibold">
                            {
                              row.quantity
                            }
                          </td>


                          <td className="px-4 py-4 text-right">
                            {
                              money(
                                row.catalog_unit_cost
                              )
                            }
                          </td>


                          <td className="px-4 py-4 text-right font-bold">
                            {
                              money(
                                row.opening_value
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

        </section>


        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm leading-6 text-rose-950">

          <strong>
            Historical warning:
          </strong>{" "}

          Nexus has already recorded{" "}
          <strong>
            {
              summary
                ?.historical_product_units_sold ??
              0
            } product units
          </strong>{" "}
          before this costing engine existed.

          Those historical sales will not be silently rewritten.

          Future sales become accurate from the cutover date.

        </div>


        {
          !readiness?.enabled &&
          canManage && (
            <section className="mt-6 rounded-2xl border bg-card p-6">

              <h2 className="text-lg font-semibold">
                Activate Cost of Sales
              </h2>


              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Only activate after physically checking that the stock
                quantities above are correct.
              </p>


              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border p-4">

                <input
                  type="checkbox"
                  checked={
                    confirmed
                  }
                  onChange={
                    (
                      event
                    ) =>
                      setConfirmed(
                        event.target.checked
                      )
                  }
                  className="mt-1 h-4 w-4"
                />


                <span className="text-sm leading-6">

                  <strong>
                    I confirm these are the real current stock quantities
                    and the displayed cost prices are acceptable as the
                    opening accounting values.
                  </strong>

                  <br />

                  Historical sales remain unchanged.

                </span>

              </label>


              <div className="mt-5 flex justify-end">

                <Button
                  type="button"
                  disabled={
                    !confirmed ||
                    !(readiness?.can_activate ?? false) ||
                    activating
                  }
                  onClick={() =>
                    void activateCosting()
                  }
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >

                  {
                    activating
                      ? "Activating..."
                      : "Activate Inventory Costing"
                  }

                </Button>

              </div>

            </section>
          )
        }

      </main>

    </DashboardLayout>
  );
}
