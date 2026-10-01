"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  RefreshCw,
  RotateCcw,
  Search,
} from "lucide-react";

import {
  useRouter,
} from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";

import {
  Button,
} from "@/components/ui/button";

import {
  usePermissions,
} from "@/hooks/usePermissions";

import {
  supabase,
} from "@/lib/supabase";


type ReturnableItem = {
  pos_sale_item_id: string;
  inventory_item_id: string;

  name: string;
  sku: string | null;
  barcode: string | null;

  sold_quantity: number;
  returned_quantity: number;
  returnable_quantity: number;

  line_total: number;
  unit_refund_amount: number;
  unit_cost_snapshot: number;

  returnable: boolean;
};


type ReturnableSale = {
  pos_sale_id: string;
  sale_number: string;

  invoice_id: string;
  invoice_number: string;

  branch_id: string;
  branch_name: string;

  customer_id: string;
  customer_name: string;

  payment_method: string;
  total_amount: number;

  created_at: string;

  cashier_name: string;

  items: ReturnableItem[];

  returnable_total: number;
};


type RecentReturn = {
  id: string;
  return_number: string;

  original_pos_sale_id: string;
  original_sale_number: string;

  return_type:
    "refund" |
    "exchange";

  refund_method: string;

  refund_total: number;
  cost_total_restored: number;

  reason: string;

  status: string;

  exchange_pos_sale_id:
    string |
    null;

  created_at: string;

  processed_by_name: string;
};


type Workspace = {
  ok: boolean;

  sales: ReturnableSale[];

  recent_returns:
    RecentReturn[];

  permissions: {
    can_view: boolean;
    can_process: boolean;
    can_manage: boolean;
  };
};


type ReturnSelection = {
  pos_sale_item_id: string;
  quantity: number;
};


type ProcessResult = {
  ok: boolean;

  return_id: string;
  return_number: string;

  original_sale_number: string;

  return_type:
    "refund" |
    "exchange";

  refund_method: string;

  refund_total: number;
  tax_reversed: number;
  cost_restored: number;

  message: string;
};


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


function dateTime(
  value:
    string |
    null |
    undefined
) {

  if (!value) {
    return "—";
  }


  return new Date(
    value
  ).toLocaleString(
    "en-ZA"
  );
}


export default function PosReturnsPage() {

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
      "pos.return.view"
    );


  const canProcess =
    can(
      "pos.return.process"
    );


  const canManage =
    can(
      "pos.return.manage"
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
    search,
    setSearch,
  ] =
    useState("");


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
    processing,
    setProcessing,
  ] =
    useState(false);


  const [
    selectedSale,
    setSelectedSale,
  ] =
    useState<
      ReturnableSale |
      null
    >(null);


  const [
    selection,
    setSelection,
  ] =
    useState<
      ReturnSelection[]
    >([]);


  const [
    reason,
    setReason,
  ] =
    useState("");


  const [
    returnType,
    setReturnType,
  ] =
    useState<
      "refund" |
      "exchange"
    >(
      "refund"
    );


  const [
    refundMethod,
    setRefundMethod,
  ] =
    useState("");


  const [
    success,
    setSuccess,
  ] =
    useState<
      ProcessResult |
      null
    >(null);


  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");


  async function loadWorkspace(
    lookup:
      string |
      null = null,

    silent = false
  ) {

    try {

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }


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
        returnsResult,
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
            "get_pos_return_workspace",
            {
              p_lookup:
                lookup,
            }
          ),
        ]);


      if (
        companyResult.error
      ) {
        throw companyResult.error;
      }


      if (
        returnsResult.error
      ) {
        throw returnsResult.error;
      }


      setCompanyName(
        companyResult.data
          ?.company_name ??
        "JINLAB Nexus"
      );


      setWorkspace(
        returnsResult.data as Workspace
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Returns workspace could not be loaded."
      );

    } finally {

      setLoading(false);
      setRefreshing(false);
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


  async function searchSales() {

    await loadWorkspace(
      search.trim() ||
      null,
      true
    );
  }


  function openReturn(
    sale:
      ReturnableSale
  ) {

    setSelectedSale(
      sale
    );


    setSelection(
      sale.items
        .filter(
          (
            item
          ) =>
            item.returnable
        )
        .map(
          (
            item
          ) => ({
            pos_sale_item_id:
              item.pos_sale_item_id,

            quantity:
              0,
          })
        )
    );


    setReason(
      ""
    );


    setReturnType(
      "refund"
    );


    setRefundMethod(
      sale.payment_method
    );


    setSuccess(
      null
    );

    setErrorMessage(
      ""
    );
  }


  function setReturnQuantity(
    item:
      ReturnableItem,

    next:
      number
  ) {

    const safe =
      Math.max(
        0,
        Math.min(
          item.returnable_quantity,
          Math.floor(
            next
          )
        )
      );


    setSelection(
      (
        current
      ) =>
        current.map(
          (
            row
          ) =>
            row.pos_sale_item_id ===
              item.pos_sale_item_id
              ? {
                  ...row,
                  quantity:
                    safe,
                }
              : row
        )
    );
  }


  const selectedRefund =
    useMemo(
      () => {

        if (!selectedSale) {
          return 0;
        }


        return selectedSale.items.reduce(
          (
            total,
            item
          ) => {

            const quantity =
              selection.find(
                (
                  row
                ) =>
                  row.pos_sale_item_id ===
                  item.pos_sale_item_id
              )?.quantity ??
              0;


            return (
              total +
              quantity *
                Number(
                  item.unit_refund_amount
                )
            );
          },
          0
        );

      },
      [
        selectedSale,
        selection,
      ]
    );


  async function processReturn() {

    if (
      !selectedSale
    ) {
      return;
    }


    const items =
      selection
        .filter(
          (
            item
          ) =>
            item.quantity >
            0
        );


    if (
      items.length ===
      0
    ) {

      setErrorMessage(
        "Select at least one item quantity to return."
      );

      return;
    }


    if (
      reason.trim()
        .length <
      3
    ) {

      setErrorMessage(
        "Enter a clear reason for this return."
      );

      return;
    }


    if (
      refundMethod !==
        selectedSale.payment_method &&
      !canManage
    ) {

      setErrorMessage(
        "Only Owner/Admin may refund using a different payment method."
      );

      return;
    }


    const approved =
      window.confirm(
        [
          returnType ===
            "exchange"
            ? "Process exchange return?"
            : "Process refund?",

          "",

          `Original sale: ${selectedSale.sale_number}`,

          `Refund value: ${money(
            selectedRefund
          )}`,

          `Method: ${refundMethod.toUpperCase()}`,

          "",

          "This will restore stock and reverse Revenue, VAT where applicable, Cost of Sales and the refund account.",

          "",

          "This financial action cannot be hidden or deleted from the audit trail.",
        ].join(
          "\n"
        )
      );


    if (!approved) {
      return;
    }


    try {

      setProcessing(
        true
      );

      setErrorMessage(
        ""
      );

      setSuccess(
        null
      );


      const {
        data,
        error,
      } =
        await supabase.rpc(
          "process_pos_return",
          {
            p_pos_sale_id:
              selectedSale.pos_sale_id,

            p_items:
              items,

            p_reason:
              reason.trim(),

            p_return_type:
              returnType,

            p_refund_method:
              refundMethod,
          }
        );


      if (error) {
        throw error;
      }


      const result =
        data as ProcessResult;


      setSuccess(
        result
      );


      setSelectedSale(
        null
      );


      await loadWorkspace(
        search.trim() ||
        null,
        true
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Return could not be completed."
      );

    } finally {

      setProcessing(
        false
      );
    }
  }


  async function linkExchange(
    row:
      RecentReturn
  ) {

    const saleNumber =
      window.prompt(
        `Enter the replacement POS sale number for ${row.return_number}:`,
        ""
      );


    if (
      saleNumber ===
      null
    ) {
      return;
    }


    const clean =
      saleNumber.trim();


    if (!clean) {
      return;
    }


    try {

      setErrorMessage(
        ""
      );


      const {
        data:
          lookupData,
        error:
          lookupError,
      } =
        await supabase.rpc(
          "get_pos_return_workspace",
          {
            p_lookup:
              clean,
          }
        );


      if (lookupError) {
        throw lookupError;
      }


      const lookup =
        lookupData as Workspace;


      const replacement =
        lookup.sales.find(
          (
            sale
          ) =>
            sale.sale_number
              .toLowerCase() ===
            clean.toLowerCase()
        );


      if (!replacement) {

        throw new Error(
          "Replacement POS sale could not be found."
        );
      }


      const {
        error,
      } =
        await supabase.rpc(
          "link_pos_exchange_sale",
          {
            p_return_id:
              row.id,

            p_replacement_pos_sale_id:
              replacement.pos_sale_id,
          }
        );


      if (error) {
        throw error;
      }


      await loadWorkspace(
        null,
        true
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Exchange sale could not be linked."
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


        <main className="mx-auto max-w-7xl p-6">

          <p className="text-sm text-muted-foreground">
            Loading Returns & Exchanges...
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

          <div className="rounded-2xl border bg-card p-6">

            <h1 className="text-xl font-bold">
              Returns Restricted
            </h1>


            <p className="mt-2 text-sm text-muted-foreground">
              Your role does not have access to POS returns.
            </p>

          </div>

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


      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">

        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">

          <div>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/pos"
                )
              }
              className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Point of Sale
            </button>


            <p className="text-sm font-medium text-muted-foreground">
              Sales
            </p>


            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Returns & Exchanges
            </h1>


            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Find the original POS transaction before returning stock
              or issuing a refund.
            </p>

          </div>


          <Button
            type="button"
            variant="outline"
            disabled={
              refreshing
            }
            onClick={() =>
              void loadWorkspace(
                search.trim() ||
                null,
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


        {
          errorMessage && (
            <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {
                errorMessage
              }
            </div>
          )
        }


        {
          success && (
            <div className="mb-5 rounded-xl border border-primary/20 bg-primary/10 p-4 text-sm text-primary">

              <p className="font-bold">
                {
                  success.return_number
                } completed
              </p>


              <p className="mt-1">
                Refund {
                  money(
                    success.refund_total
                  )
                } · Stock cost restored {
                  money(
                    success.cost_restored
                  )
                }
              </p>


              <p className="mt-1">
                {
                  success.message
                }
              </p>

            </div>
          )
        }


        <section className="mb-7 rounded-2xl border bg-card p-5">

          <div className="flex flex-col gap-3 md:flex-row">

            <div className="relative flex-1">

              <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />


              <input
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
                onKeyDown={
                  (
                    event
                  ) => {

                    if (
                      event.key ===
                      "Enter"
                    ) {
                      void searchSales();
                    }
                  }
                }
                placeholder="Search POS sale, invoice, customer or payment reference..."
                className="w-full rounded-xl border bg-background py-3 pl-10 pr-4 text-sm"
              />

            </div>


            <Button
              type="button"
              onClick={() =>
                void searchSales()
              }
            >
              Search
            </Button>

          </div>

        </section>


        <div className="grid gap-7 xl:grid-cols-[1fr_390px]">

          <section>

            <div className="mb-4">

              <h2 className="text-xl font-bold">
                Original Sales
              </h2>


              <p className="mt-1 text-sm text-muted-foreground">
                Recent POS transactions or matching search results.
              </p>

            </div>


            <div className="space-y-3">

              {
                workspace?.sales.length ===
                  0 ? (

                  <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No matching POS sales.
                  </div>

                ) : (

                  workspace?.sales.map(
                    (
                      sale
                    ) => (
                      <div
                        key={
                          sale.pos_sale_id
                        }
                        className="rounded-2xl border bg-card p-5"
                      >

                        <div className="flex flex-wrap items-start justify-between gap-4">

                          <div>

                            <div className="flex flex-wrap items-center gap-2">

                              <h3 className="font-bold">
                                {
                                  sale.sale_number
                                }
                              </h3>


                              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase text-primary">
                                {
                                  sale.payment_method
                                }
                              </span>

                            </div>


                            <p className="mt-1 text-sm text-muted-foreground">
                              Invoice {
                                sale.invoice_number
                              } · {
                                sale.customer_name
                              }
                            </p>


                            <p className="mt-1 text-xs text-muted-foreground">
                              {
                                sale.branch_name
                              } · {
                                dateTime(
                                  sale.created_at
                                )
                              } · Cashier {
                                sale.cashier_name
                              }
                            </p>

                          </div>


                          <div className="text-right">

                            <p className="text-lg font-bold">
                              {
                                money(
                                  sale.total_amount
                                )
                              }
                            </p>


                            <p className="mt-1 text-xs text-muted-foreground">
                              Returnable {
                                money(
                                  sale.returnable_total
                                )
                              }
                            </p>

                          </div>

                        </div>


                        <div className="mt-4 border-t pt-4">

                          <div className="space-y-2">

                            {
                              sale.items.map(
                                (
                                  item
                                ) => (
                                  <div
                                    key={
                                      item.pos_sale_item_id
                                    }
                                    className="flex items-center justify-between gap-4 rounded-xl bg-muted/50 px-3 py-2.5 text-sm"
                                  >

                                    <div>

                                      <p className="font-semibold">
                                        {
                                          item.name
                                        }
                                      </p>


                                      <p className="mt-0.5 text-xs text-muted-foreground">
                                        Sold {
                                          item.sold_quantity
                                        } · Returned {
                                          item.returned_quantity
                                        } · Available to return {
                                          item.returnable_quantity
                                        }
                                      </p>

                                    </div>


                                    <p className="font-semibold">
                                      {
                                        money(
                                          item.unit_refund_amount
                                        )
                                      } / unit
                                    </p>

                                  </div>
                                )
                              )
                            }

                          </div>


                          {
                            canProcess &&
                            sale.returnable_total >
                              0 && (

                              <Button
                                type="button"
                                className="mt-4"
                                onClick={() =>
                                  openReturn(
                                    sale
                                  )
                                }
                              >
                                <RotateCcw className="mr-2 h-4 w-4" />

                                Start Return
                              </Button>
                            )
                          }

                        </div>

                      </div>
                    )
                  )
                )
              }

            </div>

          </section>


          <aside>

            <div className="mb-4">

              <h2 className="text-xl font-bold">
                Recent Returns
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Permanent POS return history.
              </p>

            </div>


            <div className="space-y-3">

              {
                workspace?.recent_returns.length ===
                  0 ? (

                  <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No POS returns yet.
                  </div>

                ) : (

                  workspace?.recent_returns.map(
                    (
                      row
                    ) => (
                      <div
                        key={
                          row.id
                        }
                        className="rounded-2xl border bg-card p-4"
                      >

                        <div className="flex items-start justify-between gap-3">

                          <div>

                            <p className="font-bold">
                              {
                                row.return_number
                              }
                            </p>


                            <p className="mt-1 text-xs text-muted-foreground">
                              Original {
                                row.original_sale_number
                              }
                            </p>

                          </div>


                          <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase text-primary">
                            {
                              row.return_type
                            }
                          </span>

                        </div>


                        <p className="mt-3 text-lg font-bold">
                          {
                            money(
                              row.refund_total
                            )
                          }
                        </p>


                        <p className="mt-1 text-xs text-muted-foreground">
                          {
                            row.refund_method.toUpperCase()
                          } · {
                            dateTime(
                              row.created_at
                            )
                          }
                        </p>


                        <p className="mt-3 rounded-lg bg-muted/50 p-2 text-xs">
                          {
                            row.reason
                          }
                        </p>


                        {
                          row.return_type ===
                            "exchange" &&
                          !row.exchange_pos_sale_id &&
                          canProcess && (

                            <Button
                              type="button"
                              variant="outline"
                              className="mt-3 w-full"
                              onClick={() =>
                                void linkExchange(
                                  row
                                )
                              }
                            >
                              Link Replacement Sale
                            </Button>
                          )
                        }

                      </div>
                    )
                  )
                )
              }

            </div>

          </aside>

        </div>


        {
          selectedSale && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">

              <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border bg-background shadow-xl">

                <div className="border-b p-5">

                  <h2 className="text-xl font-bold">
                    Return {
                      selectedSale.sale_number
                    }
                  </h2>


                  <p className="mt-1 text-sm text-muted-foreground">
                    Select only the physical items actually being returned.
                  </p>

                </div>


                <div className="space-y-5 p-5">

                  <div className="space-y-3">

                    {
                      selectedSale.items
                        .filter(
                          (
                            item
                          ) =>
                            item.returnable
                        )
                        .map(
                          (
                            item
                          ) => {

                            const quantity =
                              selection.find(
                                (
                                  row
                                ) =>
                                  row.pos_sale_item_id ===
                                  item.pos_sale_item_id
                              )?.quantity ??
                              0;


                            return (
                              <div
                                key={
                                  item.pos_sale_item_id
                                }
                                className="rounded-xl border p-4"
                              >

                                <div className="flex flex-wrap items-center justify-between gap-4">

                                  <div>

                                    <p className="font-semibold">
                                      {
                                        item.name
                                      }
                                    </p>


                                    <p className="mt-1 text-xs text-muted-foreground">
                                      Maximum returnable: {
                                        item.returnable_quantity
                                      }
                                    </p>

                                  </div>


                                  <div className="flex items-center gap-2">

                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() =>
                                        setReturnQuantity(
                                          item,
                                          quantity -
                                            1
                                        )
                                      }
                                    >
                                      −
                                    </Button>


                                    <span className="min-w-8 text-center font-bold">
                                      {
                                        quantity
                                      }
                                    </span>


                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() =>
                                        setReturnQuantity(
                                          item,
                                          quantity +
                                            1
                                        )
                                      }
                                    >
                                      +
                                    </Button>

                                  </div>

                                </div>

                              </div>
                            );
                          }
                        )
                    }

                  </div>


                  <div className="grid gap-4 md:grid-cols-2">

                    <label className="text-sm font-medium">

                      Return Type

                      <select
                        value={
                          returnType
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setReturnType(
                              event.target.value as
                                "refund" |
                                "exchange"
                            )
                        }
                        className="mt-2 w-full rounded-xl border bg-background px-3 py-2.5"
                      >

                        <option value="refund">
                          Refund
                        </option>

                        <option value="exchange">
                          Exchange
                        </option>

                      </select>

                    </label>


                    <label className="text-sm font-medium">

                      Refund Method

                      <select
                        value={
                          refundMethod
                        }
                        disabled={
                          !canManage
                        }
                        onChange={
                          (
                            event
                          ) =>
                            setRefundMethod(
                              event.target.value
                            )
                        }
                        className="mt-2 w-full rounded-xl border bg-background px-3 py-2.5 disabled:opacity-70"
                      >

                        {
                          selectedSale.payment_method ===
                            "split" && (
                            <option value="split">
                              Original Split Tender
                            </option>
                          )
                        }

                        <option value="cash">
                          Cash
                        </option>

                        <option value="card">
                          Card
                        </option>

                        <option value="eft">
                          EFT
                        </option>

                        <option value="other">
                          Other
                        </option>

                      </select>


                      {
                        !canManage && (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            Refund method stays the same as the original sale.
                          </span>
                        )
                      }

                    </label>

                  </div>


                  <label className="block text-sm font-medium">

                    Return Reason

                    <textarea
                      value={
                        reason
                      }
                      onChange={
                        (
                          event
                        ) =>
                          setReason(
                            event.target.value
                          )
                      }
                      rows={3}
                      placeholder="Example: Customer returned unopened item"
                      className="mt-2 w-full rounded-xl border bg-background px-3 py-2.5"
                    />

                  </label>


                  <div className="rounded-xl border border-primary/20 bg-primary/10 p-4">

                    <p className="text-xs font-medium text-muted-foreground">
                      Expected Refund
                    </p>


                    <p className="mt-1 text-2xl font-bold text-primary">
                      {
                        money(
                          selectedRefund
                        )
                      }
                    </p>


                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Nexus uses the original POS selling value and the original
                      inventory cost snapshot. Stock, Cost of Sales and Accounting
                      are reversed automatically.
                    </p>

                  </div>

                </div>


                <div className="flex flex-wrap justify-end gap-3 border-t p-5">

                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      processing
                    }
                    onClick={() =>
                      setSelectedSale(
                        null
                      )
                    }
                  >
                    Cancel
                  </Button>


                  <Button
                    type="button"
                    disabled={
                      processing ||
                      selectedRefund <=
                        0
                    }
                    onClick={() =>
                      void processReturn()
                    }
                  >
                    {
                      processing
                        ? "Processing..."
                        : returnType ===
                            "exchange"
                          ? "Process Exchange Return"
                          : "Process Refund"
                    }
                  </Button>

                </div>

              </div>

            </div>
          )
        }

      </main>

    </DashboardLayout>
  );
}
