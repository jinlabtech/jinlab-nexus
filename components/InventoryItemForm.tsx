"use client";

import {
  useEffect,
  useState,
} from "react";

import AppCard from "@/components/ui/AppCard";
import AppInput from "@/components/ui/AppInput";
import { Button } from "@/components/ui/button";

import type { Branch } from "@/types/branch";

import type {
  InventoryCategory,
  InventoryItem,
  InventoryItemFormData,
  Supplier,
} from "@/types/inventory";

export type InventoryItemFormSubmitData = {
  item: InventoryItemFormData;
  branch_id: string;
  initial_stock: number;
};

type InventoryItemFormProps = {
  item?: InventoryItem | null;

  categories: InventoryCategory[];
  suppliers: Supplier[];
  branches: Branch[];

  onSave: (
    data: InventoryItemFormSubmitData
  ) => Promise<void>;

  onCancel: () => void;
};

export default function InventoryItemForm({
  item,
  categories,
  suppliers,
  branches,
  onSave,
  onCancel,
}: InventoryItemFormProps) {
  const isEditing = Boolean(item);

  const [itemName, setItemName] =
    useState("");

  const [sku, setSku] =
    useState("");

  const [barcode, setBarcode] =
    useState("");

  const [categoryId, setCategoryId] =
    useState("");

  const [supplierId, setSupplierId] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [costPrice, setCostPrice] =
    useState("0");

  const [sellingPrice, setSellingPrice] =
    useState("0");

  const [minimumStock, setMinimumStock] =
    useState("0");

  const [branchId, setBranchId] =
    useState("");

  const [initialStock, setInitialStock] =
    useState("0");

  const [saving, setSaving] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  useEffect(() => {
    setItemName(
      item?.item_name ?? ""
    );

    setSku(
      item?.sku ?? ""
    );

    setBarcode(
      item?.barcode ?? ""
    );

    setCategoryId(
      item?.category_id ?? ""
    );

    setSupplierId(
      item?.supplier_id ?? ""
    );

    setDescription(
      item?.description ?? ""
    );

    setCostPrice(
      item
        ? String(item.cost_price)
        : "0"
    );

    setSellingPrice(
      item
        ? String(item.selling_price)
        : "0"
    );

    setMinimumStock(
      item
        ? String(item.minimum_stock)
        : "0"
    );

    setBranchId("");
    setInitialStock("0");
    setErrorMessage("");
  }, [item]);

  function generateSku() {
    const cleanedName =
      itemName
        .trim()
        .toUpperCase()
        .replace(
          /[^A-Z0-9]/g,
          ""
        )
        .slice(0, 6);

    const randomPart =
      Math.floor(
        1000 +
          Math.random() *
            9000
      );

    setSku(
      `${
        cleanedName ||
        "ITEM"
      }-${randomPart}`
    );
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!itemName.trim()) {
      setErrorMessage(
        "Item name is required."
      );
      return;
    }

    if (!sku.trim()) {
      setErrorMessage(
        "SKU is required."
      );
      return;
    }

    const parsedCost =
      Number(costPrice);

    const parsedSelling =
      Number(sellingPrice);

    const parsedMinimum =
      Number(minimumStock);

    const parsedInitial =
      Number(initialStock);

    if (
      Number.isNaN(
        parsedCost
      ) ||
      parsedCost < 0
    ) {
      setErrorMessage(
        "Cost price must be 0 or greater."
      );
      return;
    }

    if (
      Number.isNaN(
        parsedSelling
      ) ||
      parsedSelling < 0
    ) {
      setErrorMessage(
        "Selling price must be 0 or greater."
      );
      return;
    }

    if (
      !Number.isInteger(
        parsedMinimum
      ) ||
      parsedMinimum < 0
    ) {
      setErrorMessage(
        "Minimum stock must be a whole number."
      );
      return;
    }

    if (
      !isEditing &&
      (
        !Number.isInteger(
          parsedInitial
        ) ||
        parsedInitial < 0
      )
    ) {
      setErrorMessage(
        "Initial stock must be a whole number."
      );
      return;
    }

    if (
      !isEditing &&
      parsedInitial > 0 &&
      !branchId
    ) {
      setErrorMessage(
        "Select a branch when adding opening stock."
      );
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await onSave({
        item: {
          item_name:
            itemName.trim(),

          sku:
            sku
              .trim()
              .toUpperCase(),

          barcode:
            barcode.trim(),

          category_id:
            categoryId,

          supplier_id:
            supplierId,

          description:
            description.trim(),

          cost_price:
            parsedCost,

          selling_price:
            parsedSelling,

          minimum_stock:
            parsedMinimum,
        },

        branch_id:
          isEditing
            ? ""
            : branchId,

        initial_stock:
          isEditing
            ? 0
            : parsedInitial,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The inventory item could not be saved."
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
          <h2 className="text-xl font-semibold">
            {isEditing
              ? "Edit Inventory Item"
              : "Add Inventory Item"}
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            {isEditing
              ? "Update product information and pricing."
              : "Create a product or component and optionally add opening stock."}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <AppInput
            label="Item Name"
            value={itemName}
            placeholder="Example: iPhone 12 Screen"
            required
            onChange={setItemName}
          />

          <div className="grid gap-2">
            <AppInput
              label="SKU"
              value={sku}
              placeholder="Example: IP12SCR-1001"
              required
              onChange={setSku}
            />

            {!isEditing && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={generateSku}
              >
                Generate SKU
              </Button>
            )}
          </div>

          <AppInput
            label="Barcode"
            value={barcode}
            placeholder="Optional barcode"
            onChange={setBarcode}
          />

          <label className="grid gap-2">
            <span className="text-sm font-medium">
              Category
            </span>

            <select
              value={categoryId}
              onChange={(event) =>
                setCategoryId(
                  event.target.value
                )
              }
              className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">
                No category
              </option>

              {categories.map(
                (category) => (
                  <option
                    key={
                      category.id
                    }
                    value={
                      category.id
                    }
                  >
                    {
                      category.category_name
                    }
                  </option>
                )
              )}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">
              Supplier
            </span>

            <select
              value={supplierId}
              onChange={(event) =>
                setSupplierId(
                  event.target.value
                )
              }
              className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">
                No supplier
              </option>

              {suppliers.map(
                (supplier) => (
                  <option
                    key={
                      supplier.id
                    }
                    value={
                      supplier.id
                    }
                  >
                    {
                      supplier.supplier_name
                    }
                  </option>
                )
              )}
            </select>
          </label>

          <AppInput
            label="Cost Price"
            value={costPrice}
            type="number"
            min={0}
            step="0.01"
            required
            onChange={setCostPrice}
          />

          <AppInput
            label="Selling Price"
            value={sellingPrice}
            type="number"
            min={0}
            step="0.01"
            required
            onChange={setSellingPrice}
          />

          <AppInput
            label="Minimum Stock"
            value={minimumStock}
            type="number"
            min={0}
            step="1"
            required
            onChange={setMinimumStock}
          />

          {!isEditing && (
            <>
              <label className="grid gap-2">
                <span className="text-sm font-medium">
                  Opening Stock Branch
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
                        key={
                          branch.id
                        }
                        value={
                          branch.id
                        }
                      >
                        {
                          branch.branch_name
                        }
                      </option>
                    )
                  )}
                </select>
              </label>

              <AppInput
                label="Initial Stock"
                value={initialStock}
                type="number"
                min={0}
                step="1"
                onChange={setInitialStock}
              />
            </>
          )}
        </div>

        <label className="grid gap-2">
          <span className="text-sm font-medium">
            Description
          </span>

          <textarea
            value={description}
            onChange={(event) =>
              setDescription(
                event.target.value
              )
            }
            rows={4}
            placeholder="Optional item description"
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
              : isEditing
                ? "Save Changes"
                : "Save Item"}
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
