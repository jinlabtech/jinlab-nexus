"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  Clock3,
  PauseCircle,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";

import {
  Button,
} from "@/components/ui/button";

import {
  usePermissions,
} from "@/hooks/usePermissions";

import {
  supabase,
} from "@/lib/supabase";


export type RecalledSuspendedItem = {
  inventory_item_id: string;

  name: string;
  sku: string | null;
  barcode: string | null;

  quantity: number;

  discount_mode:
    "percentage" |
    "fixed";

  discount_value: number;

  snapshot_unit_price: number;
  current_unit_price: number;
  current_stock: number;

  price_changed: boolean;
  stock_short: boolean;
  inactive: boolean;
};


export type RecalledSuspendedSale = {
  ok: boolean;

  id: string;
  hold_number: string;

  branch_id: string;
  branch_name: string;

  customer_id:
    string |
    null;

  customer_name:
    string |
    null;

  notes:
    string |
    null;

  estimated_total_snapshot: number;

  items:
    RecalledSuspendedItem[];

  message: string;
};


type SuspendedSaleRow = {
  id: string;
  hold_number: string;

  branch_id: string;
  branch_name: string;

  customer_id:
    string |
    null;

  customer_name:
    string |
    null;

  cashier_user_id: string;
  cashier_name: string;

  estimated_total: number;
  item_count: number;

  notes:
    string |
    null;

  created_at: string;

  recall_count: number;

  last_recalled_at:
    string |
    null;

  is_mine: boolean;
};


type SuspendedWorkspace = {
  ok: boolean;
  enabled: boolean;
  can_manage: boolean;
  rows: SuspendedSaleRow[];
};


type CartPayloadItem = {
  id: string;
  cart_quantity: number;
  discount_percent: number;
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


export default function SuspendedSalesPanel({
  branchId,
  customerId,
  cartItems,
  enabled,
  activeSuspendedSaleId,
  onSuspended,
  onRecall,
}: {
  branchId: string;

  customerId:
    string |
    null;

  cartItems:
    CartPayloadItem[];

  enabled: boolean;

  activeSuspendedSaleId:
    string |
    null;

  onSuspended: () => void;

  onRecall:
    (
      sale:
        RecalledSuspendedSale
    ) => void;
}) {

  const {
    can,
  } =
    usePermissions();


  const canSuspend =
    can(
      "pos.suspend"
    );


  const canRecall =
    can(
      "pos.recall"
    );


  const canManage =
    can(
      "pos.suspended.manage"
    );


  const [
    workspace,
    setWorkspace,
  ] =
    useState<
      SuspendedWorkspace |
      null
    >(null);


  const [
    loading,
    setLoading,
  ] =
    useState(false);


  const [
    workingId,
    setWorkingId,
  ] =
    useState<
      string |
      null
    >(null);


  const [
    message,
    setMessage,
  ] =
    useState("");


  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");


  async function load(
    silent = false
  ) {

    if (!branchId) {
      return;
    }


    try {

      if (!silent) {
        setLoading(true);
      }


      setErrorMessage("");


      const {
        data,
        error,
      } =
        await supabase.rpc(
          "get_pos_suspended_sales",
          {
            p_branch_id:
              branchId,
          }
        );


      if (error) {
        throw error;
      }


      setWorkspace(
        data as SuspendedWorkspace
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Held sales could not be loaded."
      );

    } finally {

      setLoading(false);
    }
  }


  useEffect(
    () => {

      if (
        branchId &&
        enabled
      ) {
        void load();
      }

    },
    [
      branchId,
      enabled,
    ]
  );


  async function suspendCurrentSale() {

    if (
      cartItems.length ===
      0
    ) {

      setErrorMessage(
        "Add at least one item before suspending the sale."
      );

      return;
    }


    if (
      activeSuspendedSaleId
    ) {

      setErrorMessage(
        "This cart already came from a held sale. Complete it or leave it available in Held Sales."
      );

      return;
    }


    const note =
      window.prompt(
        "Optional note for this held sale:",
        ""
      );


    if (
      note === null
    ) {
      return;
    }


    const approved =
      window.confirm(
        [
          "Suspend this sale?",
          "",
          "No stock will move.",
          "No payment will be recorded.",
          "No revenue or Accounting entry will be created.",
        ].join(
          "\n"
        )
      );


    if (!approved) {
      return;
    }


    try {

      setWorkingId(
        "new"
      );

      setMessage("");
      setErrorMessage("");


      const {
        data,
        error,
      } =
        await supabase.rpc(
          "suspend_pos_sale",
          {
            p_branch_id:
              branchId,

            p_customer_id:
              customerId ||
              null,

            p_items:
              cartItems.map(
                (
                  item
                ) => ({
                  inventory_item_id:
                    item.id,

                  quantity:
                    item.cart_quantity,

                  discount_mode:
                    "percentage",

                  discount_value:
                    item.discount_percent,
                })
              ),

            p_notes:
              note.trim() ||
              null,
          }
        );


      if (error) {
        throw error;
      }


      setMessage(
        `${data?.hold_number ?? "Sale"} suspended successfully.`
      );


      onSuspended();

      await load(
        true
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Sale could not be suspended."
      );

    } finally {

      setWorkingId(
        null
      );
    }
  }


  async function recallSale(
    row:
      SuspendedSaleRow
  ) {

    const approved =
      window.confirm(
        [
          `Recall ${row.hold_number}?`,
          "",
          `${row.item_count} item(s)`,
          `Saved total: ${money(
            row.estimated_total
          )}`,
          "",
          "Nexus will recheck current stock and selling prices.",
        ].join(
          "\n"
        )
      );


    if (!approved) {
      return;
    }


    try {

      setWorkingId(
        row.id
      );

      setMessage("");
      setErrorMessage("");


      const {
        data,
        error,
      } =
        await supabase.rpc(
          "recall_pos_sale",
          {
            p_suspended_sale_id:
              row.id,
          }
        );


      if (error) {
        throw error;
      }


      const recalled =
        data as RecalledSuspendedSale;


      const inactive =
        recalled.items.find(
          (
            item
          ) =>
            item.inactive
        );


      if (inactive) {

        throw new Error(
          `${inactive.name} is no longer an active POS item. A manager must resolve the item before this held sale can continue.`
        );
      }


      const short =
        recalled.items.find(
          (
            item
          ) =>
            item.stock_short
        );


      if (short) {

        throw new Error(
          `${short.name} now has only ${short.current_stock} unit(s) available, but the held sale needs ${short.quantity}.`
        );
      }


      const priceChanged =
        recalled.items.some(
          (
            item
          ) =>
            item.price_changed
        );


      if (priceChanged) {

        window.alert(
          "One or more prices changed after this sale was suspended. Nexus has loaded the CURRENT selling prices."
        );
      }


      onRecall(
        recalled
      );


      setMessage(
        `${recalled.hold_number} recalled. Complete checkout when the customer is ready.`
      );


      await load(
        true
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Held sale could not be recalled."
      );

    } finally {

      setWorkingId(
        null
      );
    }
  }


  async function discardSale(
    row:
      SuspendedSaleRow
  ) {

    const reason =
      window.prompt(
        `Why are you discarding ${row.hold_number}?`,
        ""
      );


    if (
      reason === null
    ) {
      return;
    }


    const approved =
      window.confirm(
        [
          `Discard ${row.hold_number}?`,
          "",
          "This removes the held basket only.",
          "It does not reverse stock or money because none was posted.",
        ].join(
          "\n"
        )
      );


    if (!approved) {
      return;
    }


    try {

      setWorkingId(
        row.id
      );

      setMessage("");
      setErrorMessage("");


      const {
        error,
      } =
        await supabase.rpc(
          "cancel_pos_suspended_sale",
          {
            p_suspended_sale_id:
              row.id,

            p_reason:
              reason.trim() ||
              null,
          }
        );


      if (error) {
        throw error;
      }


      setMessage(
        `${row.hold_number} discarded.`
      );


      await load(
        true
      );

    } catch (
      error
    ) {

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Held sale could not be discarded."
      );

    } finally {

      setWorkingId(
        null
      );
    }
  }


  if (!enabled) {
    return null;
  }


  return (
    <section className="mb-6 rounded-2xl border bg-card">

      <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5">

        <div>

          <div className="flex items-center gap-2">

            <PauseCircle className="h-5 w-5 text-primary" />

            <h2 className="font-semibold">
              Suspend & Recall
            </h2>

          </div>


          <p className="mt-1 text-sm text-muted-foreground">
            Hold a customer basket without creating a payment,
            stock movement or Accounting entry.
          </p>

        </div>


        <div className="flex gap-2">

          <Button
            type="button"
            variant="outline"
            disabled={
              loading
            }
            onClick={() =>
              void load()
            }
          >

            <RefreshCw
              className={`mr-2 h-4 w-4 ${
                loading
                  ? "animate-spin"
                  : ""
              }`}
            />

            Refresh

          </Button>


          {
            canSuspend && (
              <Button
                type="button"
                disabled={
                  cartItems.length ===
                    0 ||
                  workingId !==
                    null ||
                  activeSuspendedSaleId !==
                    null
                }
                onClick={() =>
                  void suspendCurrentSale()
                }
                className="bg-primary text-primary-foreground hover:bg-primary/85"
              >
                <PauseCircle className="mr-2 h-4 w-4" />

                Suspend Current Sale
              </Button>
            )
          }

        </div>

      </div>


      {
        message && (
          <div className="border-b border-primary/20 bg-primary/10 px-5 py-3 text-sm text-primary">
            {
              message
            }
          </div>
        )
      }


      {
        errorMessage && (
          <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800">
            {
              errorMessage
            }
          </div>
        )
      }


      {
        activeSuspendedSaleId && (
          <div className="border-b border-primary/20 bg-primary/10 px-5 py-3 text-sm text-primary">
            <strong>
              Recalled basket active.
            </strong>{" "}

            You can add/remove items before checkout.
            Completing the sale will close the original held basket.
          </div>
        )
      }


      {
        !workspace ||
        workspace.rows.length ===
          0 ? (

          <div className="p-6 text-sm text-muted-foreground">
            No held sales at this branch.
          </div>

        ) : (

          <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">

            {
              workspace.rows.map(
                (
                  row
                ) => (
                  <div
                    key={
                      row.id
                    }
                    className={
                      activeSuspendedSaleId ===
                      row.id
                        ? "rounded-xl border-2 border-primary/30 bg-primary/10 p-4"
                        : "rounded-xl border bg-background p-4"
                    }
                  >

                    <div className="flex items-start justify-between gap-3">

                      <div>

                        <p className="font-bold">
                          {
                            row.hold_number
                          }
                        </p>


                        <p className="mt-1 text-xs text-muted-foreground">
                          {
                            row.customer_name ??
                            "Walk-in Customer"
                          }
                        </p>

                      </div>


                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase text-primary">
                        Held
                      </span>

                    </div>


                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">

                      <div>

                        <p className="text-xs text-muted-foreground">
                          Items
                        </p>

                        <p className="mt-1 font-semibold">
                          {
                            row.item_count
                          }
                        </p>

                      </div>


                      <div>

                        <p className="text-xs text-muted-foreground">
                          Saved Total
                        </p>

                        <p className="mt-1 font-semibold">
                          {
                            money(
                              row.estimated_total
                            )
                          }
                        </p>

                      </div>

                    </div>


                    <div className="mt-4 flex items-center gap-1 text-xs text-muted-foreground">

                      <Clock3 className="h-3.5 w-3.5" />

                      {
                        new Date(
                          row.created_at
                        ).toLocaleString(
                          "en-ZA"
                        )
                      }

                    </div>


                    <p className="mt-2 text-xs text-muted-foreground">
                      Cashier: {
                        row.cashier_name
                      }
                    </p>


                    {
                      row.notes && (
                        <p className="mt-3 rounded-lg bg-muted/40 p-2 text-xs">
                          {
                            row.notes
                          }
                        </p>
                      )
                    }


                    <div className="mt-4 flex gap-2">

                      {
                        canRecall && (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={
                              workingId !==
                                null
                            }
                            onClick={() =>
                              void recallSale(
                                row
                              )
                            }
                            className="flex-1"
                          >
                            <RotateCcw className="mr-2 h-4 w-4" />

                            Recall
                          </Button>
                        )
                      }


                      {
                        (
                          row.is_mine ||
                          canManage
                        ) && (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={
                              workingId !==
                                null ||
                              activeSuspendedSaleId ===
                                row.id
                            }
                            onClick={() =>
                              void discardSale(
                                row
                              )
                            }
                          >
                            <Trash2 className="h-4 w-4" />
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
  );
}
