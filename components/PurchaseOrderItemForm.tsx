"use client";

import { useEffect, useState } from "react";

import AppCard from "@/components/ui/AppCard";
import AppInput from "@/components/ui/AppInput";
import { Button } from "@/components/ui/button";

import type { InventoryItem } from "@/types/inventory";

import type {
  PurchaseOrderItem,
  PurchaseOrderItemFormData,
} from "@/types/purchasing";

type PurchaseOrderItemFormProps = {
  inventoryItems: InventoryItem[];
  item?: PurchaseOrderItem | null;
  onSave: (
    data: PurchaseOrderItemFormData
  ) => Promise<void>;
  onCancel: () => void;
};

export default function PurchaseOrderItemForm({
  inventoryItems,
  item,
  onSave,
  onCancel,
}: PurchaseOrderItemFormProps) {
  const [inventoryItemId, setInventoryItemId] =
    useState("");

  const [quantity, setQuantity] =
    useState("1");

  const [unitCost, setUnitCost] =
    useState("0");

  const [taxRate, setTaxRate] =
    useState("15");

  const [saving, setSaving] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const isEditing = Boolean(item);

  useEffect(() => {
    setInventoryItemId(
      item?.inventory_item_id ?? ""
    );

    setQuantity(
      item
        ? String(item.quantity_ordered)
        : "1"
    );

    setUnitCost(
      item
        ? String(item.unit_cost)
        : "0"
    );

    setTaxRate(
      item
        ? String(item.tax_rate)
        : "15"
    );

    setErrorMessage("");
  }, [item]);

  function handleInventoryItemChange(
    itemId: string
  ) {
    setInventoryItemId(itemId);

    if (!isEditing) {
      const inventoryItem =
        inventoryItems.find(
          (currentItem) =>
            currentItem.id === itemId
        );

      if (inventoryItem) {
        setUnitCost(
          String(
            inventoryItem.cost_price
          )
        );
      }
    }
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!inventoryItemId) {
      setErrorMessage(
        "Select an inventory item."
      );
      return;
    }

    const parsedQuantity =
      Number(quantity);

    const parsedUnitCost =
      Number(unitCost);

    const parsedTaxRate =
      Number(taxRate);

    if (
      !Number.isInteger(
        parsedQuantity
      ) ||
      parsedQuantity <= 0
    ) {
      setErrorMessage(
        "Quantity must be a whole number greater than 0."
      );
      return;
    }

    if (
      Number.isNaN(
        parsedUnitCost
      ) ||
      parsedUnitCost < 0
    ) {
      setErrorMessage(
        "Unit cost must be 0 or greater."
      );
      return;
    }

    if (
      Number.isNaN(
        parsedTaxRate
      ) ||
      parsedTaxRate < 0 ||
      parsedTaxRate > 100
    ) {
      setErrorMessage(
        "VAT rate must be between 0 and 100."
      );
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await onSave({
        inventory_item_id:
          inventoryItemId,

        quantity_ordered:
          parsedQuantity,

        unit_cost:
          parsedUnitCost,

        tax_rate:
          parsedTaxRate,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Purchase order item could not be saved."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppCard>
      <form
        onSubmit={handleSubmit}
        className="grid gap-5"
      >
        <div>
          <h2 className="text-xl font-semibold">
            {isEditing
              ? "Edit Purchase Order Item"
              : "Add Purchase Order Item"}
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Add products, quantities,
            purchasing cost and VAT.
          </p>
        </div>

        <label className="grid gap-2">
          <span className="text-sm font-medium">
            Inventory Item
          </span>

          <select
            value={inventoryItemId}
            disabled={isEditing}
            onChange={(event) =>
              handleInventoryItemChange(
                event.target.value
              )
            }
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            required
          >
            <option value="">
              Select item
            </option>

            {inventoryItems.map(
              (inventoryItem) => (
                <option
                  key={
                    inventoryItem.id
                  }
                  value={
                    inventoryItem.id
                  }
                >
                  {
                    inventoryItem.item_name
                  }{" "}
                  — {
                    inventoryItem.sku
                  }
                </option>
              )
            )}
          </select>
        </label>

        <div className="grid gap-4 md:grid-cols-3">
          <AppInput
            label="Quantity"
            value={quantity}
            type="number"
            min={1}
            step="1"
            required
            onChange={setQuantity}
          />

          <AppInput
            label="Unit Cost"
            value={unitCost}
            type="number"
            min={0}
            step="0.01"
            required
            onChange={setUnitCost}
          />

          <AppInput
            label="VAT Rate (%)"
            value={taxRate}
            type="number"
            min={0}
            step="0.001"
            required
            onChange={setTaxRate}
          />
        </div>

        <div className="rounded-lg border bg-muted/20 p-4">
          <p className="text-sm text-muted-foreground">
            Estimated Line Total
          </p>

          <p className="mt-1 text-xl font-bold">
            R{" "}
            {(
              Number(quantity || 0) *
              Number(unitCost || 0) *
              (1 +
                Number(
                  taxRate || 0
                ) /
                  100)
            ).toFixed(2)}
          </p>
        </div>

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
              ? "Saving..."
              : isEditing
                ? "Save Changes"
                : "Add Item"}
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
