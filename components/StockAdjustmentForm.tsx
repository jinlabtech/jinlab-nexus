"use client";

import { useState } from "react";

import AppCard from "@/components/ui/AppCard";
import AppInput from "@/components/ui/AppInput";
import { Button } from "@/components/ui/button";

import type { Branch } from "@/types/branch";
import type {
  InventoryItem,
  StockAdjustmentData,
  StockMovementType,
} from "@/types/inventory";

type StockAdjustmentFormProps = {
  item: InventoryItem;
  branches: Branch[];
  onSave: (
    data: StockAdjustmentData
  ) => Promise<void>;
  onCancel: () => void;
};

const movementOptions: {
  value: StockMovementType;
  label: string;
}[] = [
  {
    value: "stock_in",
    label: "Stock In",
  },
  {
    value: "stock_out",
    label: "Stock Out",
  },
  {
    value: "adjustment_in",
    label: "Adjustment In",
  },
  {
    value: "adjustment_out",
    label: "Adjustment Out",
  },
  {
    value: "return",
    label: "Return",
  },
];

export default function StockAdjustmentForm({
  item,
  branches,
  onSave,
  onCancel,
}: StockAdjustmentFormProps) {
  const [branchId, setBranchId] =
    useState("");

  const [
    movementType,
    setMovementType,
  ] = useState<StockMovementType>(
    "stock_in"
  );

  const [quantity, setQuantity] =
    useState("1");

  const [reference, setReference] =
    useState("");

  const [notes, setNotes] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!branchId) {
      setErrorMessage(
        "Select a branch."
      );
      return;
    }

    const parsedQuantity =
      Number(quantity);

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

    setSaving(true);
    setErrorMessage("");

    try {
      await onSave({
        branch_id: branchId,
        inventory_item_id:
          item.id,
        movement_type:
          movementType,
        quantity:
          parsedQuantity,
        reference:
          reference.trim(),
        notes:
          notes.trim(),
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The stock movement could not be saved."
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
            Adjust Stock
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            {item.item_name}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            SKU: {item.sku}
          </p>
        </div>

        <label className="grid gap-2">
          <span className="text-sm font-medium">
            Branch
          </span>

          <select
            value={branchId}
            onChange={(event) =>
              setBranchId(
                event.target.value
              )
            }
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">
              Select branch
            </option>

            {branches.map(
              (branch) => (
                <option
                  key={branch.id}
                  value={branch.id}
                >
                  {branch.branch_name}
                </option>
              )
            )}
          </select>
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium">
            Movement Type
          </span>

          <select
            value={movementType}
            onChange={(event) =>
              setMovementType(
                event.target
                  .value as StockMovementType
              )
            }
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            {movementOptions.map(
              (option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              )
            )}
          </select>
        </label>

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
          label="Reference"
          value={reference}
          placeholder="Example: PO-0001"
          onChange={setReference}
        />

        <label className="grid gap-2">
          <span className="text-sm font-medium">
            Notes
          </span>

          <textarea
            value={notes}
            onChange={(event) =>
              setNotes(
                event.target.value
              )
            }
            rows={4}
            placeholder="Optional stock movement notes"
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
              ? "Saving..."
              : "Save Stock Movement"}
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
