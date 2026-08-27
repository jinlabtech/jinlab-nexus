"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import AppCard from "@/components/ui/AppCard";
import AppInput from "@/components/ui/AppInput";
import { Button } from "@/components/ui/button";

import type {
  InventoryItem,
} from "@/types/inventory";

import type {
  DiscountMode,
  QuotationItem,
  QuotationItemFormData,
  TaxMode,
} from "@/types/quotation";

type Props = {
  inventoryItems: InventoryItem[];
  item?: QuotationItem | null;
  onSave: (
    data: QuotationItemFormData
  ) => Promise<void>;
  onCancel: () => void;
};

export default function QuotationItemForm({
  inventoryItems,
  item,
  onSave,
  onCancel,
}: Props) {
  const [
    inventoryItemId,
    setInventoryItemId,
  ] = useState("");

  const [
    description,
    setDescription,
  ] = useState("");

  const [
    quantity,
    setQuantity,
  ] = useState("1");

  const [
    unitPrice,
    setUnitPrice,
  ] = useState("0");

  const [
    discountMode,
    setDiscountMode,
  ] =
    useState<DiscountMode>(
      "percentage"
    );

  const [
    discountValue,
    setDiscountValue,
  ] = useState("0");

  const [
    taxMode,
    setTaxMode,
  ] =
    useState<TaxMode>(
      "none"
    );

  const [
    taxRate,
    setTaxRate,
  ] = useState("15");

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const isEditing =
    Boolean(item);

  useEffect(() => {
    setInventoryItemId(
      item?.inventory_item_id ??
        ""
    );

    setDescription(
      item?.description ?? ""
    );

    setQuantity(
      item
        ? String(item.quantity)
        : "1"
    );

    setUnitPrice(
      item
        ? String(item.unit_price)
        : "0"
    );

    setDiscountMode(
      item?.discount_mode ??
        "percentage"
    );

    setDiscountValue(
      item
        ? String(
            item.discount_value
          )
        : "0"
    );

    setTaxMode(
      item?.tax_mode ??
        "none"
    );

    setTaxRate(
      item
        ? String(item.tax_rate)
        : "15"
    );

    setErrorMessage("");
  }, [item]);

  function selectInventoryItem(
    id: string
  ) {
    setInventoryItemId(id);

    const selected =
      inventoryItems.find(
        (inventoryItem) =>
          inventoryItem.id === id
      );

    if (
      selected &&
      !isEditing
    ) {
      setDescription(
        selected.item_name
      );

      setUnitPrice(
        String(
          selected.selling_price
        )
      );
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const parsedQuantity =
      Number(quantity);

    const parsedUnitPrice =
      Number(unitPrice);

    const parsedDiscount =
      Number(discountValue);

    const parsedTax =
      Number(taxRate);

    if (!description.trim()) {
      setErrorMessage(
        "Description is required."
      );
      return;
    }

    if (
      Number.isNaN(
        parsedQuantity
      ) ||
      parsedQuantity <= 0
    ) {
      setErrorMessage(
        "Quantity must be greater than 0."
      );
      return;
    }

    if (
      Number.isNaN(
        parsedUnitPrice
      ) ||
      parsedUnitPrice < 0
    ) {
      setErrorMessage(
        "Unit price must be 0 or greater."
      );
      return;
    }

    if (
      Number.isNaN(
        parsedDiscount
      ) ||
      parsedDiscount < 0
    ) {
      setErrorMessage(
        "Discount cannot be negative."
      );
      return;
    }

    if (
      discountMode ===
        "percentage" &&
      parsedDiscount > 100
    ) {
      setErrorMessage(
        "Percentage discount cannot exceed 100%."
      );
      return;
    }

    if (
      taxMode === "vat" &&
      (
        Number.isNaN(
          parsedTax
        ) ||
        parsedTax < 0 ||
        parsedTax > 100
      )
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
          inventoryItemId ||
          null,

        description:
          description.trim(),

        quantity:
          parsedQuantity,

        unit_price:
          parsedUnitPrice,

        discount_mode:
          discountMode,

        discount_value:
          parsedDiscount,

        tax_mode:
          taxMode,

        tax_rate:
          taxMode === "vat"
            ? parsedTax
            : 0,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Quotation item could not be saved."
      );
    } finally {
      setSaving(false);
    }
  }

  const subtotal =
    Number(quantity || 0) *
    Number(unitPrice || 0);

  const discount =
    discountMode ===
    "percentage"
      ? subtotal *
        (
          Number(
            discountValue || 0
          ) /
          100
        )
      : Math.min(
          Number(
            discountValue || 0
          ),
          subtotal
        );

  const taxable =
    subtotal - discount;

  const tax =
    taxMode === "vat"
      ? taxable *
        (
          Number(
            taxRate || 0
          ) /
          100
        )
      : 0;

  const total =
    taxable + tax;

  return (
    <AppCard>
      <form
        onSubmit={handleSubmit}
        className="grid gap-5"
      >
        <div>
          <h2 className="text-xl font-semibold">
            {isEditing
              ? "Edit Quotation Item"
              : "Add Quotation Item"}
          </h2>
        </div>

        <label className="grid gap-2">
          <span className="text-sm font-medium">
            Inventory Product
          </span>

          <select
            value={
              inventoryItemId
            }
            onChange={(event) =>
              selectInventoryItem(
                event.target.value
              )
            }
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">
              Custom service / item
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
                  —{" "}
                  {
                    inventoryItem.sku
                  }
                </option>
              )
            )}
          </select>
        </label>

        <AppInput
          label="Description"
          value={description}
          required
          onChange={
            setDescription
          }
        />

        <div className="grid gap-4 md:grid-cols-2">
          <AppInput
            label="Quantity"
            value={quantity}
            type="number"
            min={0.001}
            step="0.001"
            required
            onChange={
              setQuantity
            }
          />

          <AppInput
            label="Unit Price"
            value={unitPrice}
            type="number"
            min={0}
            step="0.01"
            required
            onChange={
              setUnitPrice
            }
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium">
              Discount Type
            </span>

            <select
              value={
                discountMode
              }
              onChange={(event) =>
                setDiscountMode(
                  event.target
                    .value as DiscountMode
                )
              }
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="percentage">
                Percentage (%)
              </option>

              <option value="fixed">
                Fixed Rand (R)
              </option>
            </select>
          </label>

          <AppInput
            label={
              discountMode ===
              "percentage"
                ? "Discount %"
                : "Discount R"
            }
            value={
              discountValue
            }
            type="number"
            min={0}
            step="0.01"
            onChange={
              setDiscountValue
            }
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium">
              Tax
            </span>

            <select
              value={taxMode}
              onChange={(event) =>
                setTaxMode(
                  event.target
                    .value as TaxMode
                )
              }
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="none">
                No Tax
              </option>

              <option value="vat">
                VAT
              </option>
            </select>
          </label>

          {taxMode === "vat" && (
            <AppInput
              label="VAT %"
              value={taxRate}
              type="number"
              min={0}
              max={100}
              step="0.01"
              onChange={
                setTaxRate
              }
            />
          )}
        </div>

        <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">
              Subtotal
            </p>

            <p className="font-semibold">
              R {subtotal.toFixed(2)}
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">
              Discount
            </p>

            <p className="font-semibold">
              R {discount.toFixed(2)}
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">
              Tax
            </p>

            <p className="font-semibold">
              R {tax.toFixed(2)}
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">
              Total
            </p>

            <p className="font-bold">
              R {total.toFixed(2)}
            </p>
          </div>
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
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      </form>
    </AppCard>
  );
}
