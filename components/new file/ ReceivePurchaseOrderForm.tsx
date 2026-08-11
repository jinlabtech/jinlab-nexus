"use client";

import {
  useMemo,
  useState,
} from "react";

import AppCard from "@/components/ui/AppCard";
import AppInput from "@/components/ui/AppInput";
import { Button } from "@/components/ui/button";

import type {
  InventoryItem,
} from "@/types/inventory";

import type {
  PurchaseOrderItem,
  ReceivePurchaseOrderData,
} from "@/types/purchasing";

type ReceivePurchaseOrderFormProps = {
  orderNumber: string;

  orderItems:
    PurchaseOrderItem[];

  inventoryItems:
    InventoryItem[];

  onSave: (
    data: ReceivePurchaseOrderData
  ) => Promise<void>;

  onCancel: () => void;
};

export default function ReceivePurchaseOrderForm({
  orderNumber,
  orderItems,
  inventoryItems,
  onSave,
  onCancel,
}: ReceivePurchaseOrderFormProps) {
  const inventoryMap =
    useMemo(
      () =>
        new Map(
          inventoryItems.map(
            (item) => [
              item.id,
              item,
            ]
          )
        ),
      [inventoryItems]
    );

  const [quantities, setQuantities] =
    useState<
      Record<string, string>
    >(() =>
      Object.fromEntries(
        orderItems.map(
          (item) => [
            item.id,
            "0",
          ]
        )
      )
    );

  const [
    supplierReference,
    setSupplierReference,
  ] = useState("");

  const [
    notes,
    setNotes,
  ] = useState("");

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  function updateQuantity(
    orderItemId: string,
    value: string
  ) {
    setQuantities(
      (current) => ({
        ...current,
        [orderItemId]:
          value,
      })
    );
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const items =
      orderItems
        .map((item) => {
          const quantity =
            Number(
              quantities[
                item.id
              ] ?? 0
            );

          return {
            purchase_order_item_id:
              item.id,

            inventory_item_id:
              item.inventory_item_id,

            quantity_received:
              quantity,

            unit_cost:
              Number(
                item.unit_cost
              ),
          };
        })
        .filter(
          (item) =>
            item.quantity_received >
            0
        );

    if (!items.length) {
      setErrorMessage(
        "Enter a received quantity for at least one product."
      );

      return;
    }

    for (const item of items) {
      if (
        !Number.isInteger(
          item.quantity_received
        )
      ) {
        setErrorMessage(
          "Received quantities must be whole numbers."
        );

        return;
      }

      const orderItem =
        orderItems.find(
          (current) =>
            current.id ===
            item.purchase_order_item_id
        );

      if (!orderItem) {
        continue;
      }

      const remaining =
        orderItem.quantity_ordered -
        orderItem.quantity_received;

      if (
        item.quantity_received >
        remaining
      ) {
        const product =
          inventoryMap.get(
            orderItem.inventory_item_id
          );

        setErrorMessage(
          `${
            product?.item_name ??
            "Product"
          }: maximum receivable quantity is ${remaining}.`
        );

        return;
      }
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await onSave({
        supplier_delivery_reference:
          supplierReference.trim(),

        notes:
          notes.trim(),

        items,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Goods could not be received."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppCard>
      <form
        onSubmit={handleSubmit}
        className="grid gap-6"
      >
        <div>
          <p className="text-sm font-medium text-primary">
            Goods Receiving
          </p>

          <h2 className="mt-1 text-xl font-semibold">
            Receive Purchase Order
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            {orderNumber}
          </p>
        </div>

        <div className="rounded-lg border bg-muted/20 p-4">
          <p className="text-sm">
            Enter only the quantities
            physically delivered by the
            supplier.
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Partial deliveries are
            supported. Remaining stock
            can be received later.
          </p>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left">
                  Product
                </th>

                <th className="px-4 py-3 text-right">
                  Ordered
                </th>

                <th className="px-4 py-3 text-right">
                  Received
                </th>

                <th className="px-4 py-3 text-right">
                  Remaining
                </th>

                <th className="px-4 py-3 text-right">
                  Receive Now
                </th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {orderItems.map(
                (item) => {
                  const product =
                    inventoryMap.get(
                      item.inventory_item_id
                    );

                  const remaining =
                    item.quantity_ordered -
                    item.quantity_received;

                  return (
                    <tr
                      key={
                        item.id
                      }
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">
                          {product?.item_name ??
                            "Unknown Item"}
                        </p>

                        <p className="mt-1 text-xs text-muted-foreground">
                          SKU: {" "}
                          {product?.sku ??
                            "-"}
                        </p>
                      </td>

                      <td className="px-4 py-3 text-right">
                        {item.quantity_ordered}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {item.quantity_received}
                      </td>

                      <td className="px-4 py-3 text-right font-medium">
                        {remaining}
                      </td>

                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={0}
                          max={
                            remaining
                          }
                          step="1"
                          disabled={
                            remaining ===
                            0
                          }
                          value={
                            quantities[
                              item.id
                            ] ?? "0"
                          }
                          onChange={(
                            event
                          ) =>
                            updateQuantity(
                              item.id,
                              event
                                .target
                                .value
                            )
                          }
                          className="ml-auto block h-10 w-28 rounded-md border bg-background px-3 text-right outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                        />
                      </td>
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>
        </div>

        <AppInput
          label="Supplier Delivery Reference"
          value={
            supplierReference
          }
          placeholder="Example: INV-5842 or Delivery Note 1023"
          onChange={
            setSupplierReference
          }
        />

        <label className="grid gap-2">
          <span className="text-sm font-medium">
            Receiving Notes
          </span>

          <textarea
            value={notes}
            onChange={(event) =>
              setNotes(
                event.target.value
              )
            }
            rows={4}
            placeholder="Optional receiving notes"
            className="rounded-md border bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          />
        </label>

        {errorMessage && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            disabled={saving}
          >
            {saving
              ? "Receiving Stock..."
              : "Confirm Goods Received"}
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </form>
    </AppCard>
  );
}
