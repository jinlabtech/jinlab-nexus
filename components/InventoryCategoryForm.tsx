"use client";

import { useEffect, useState } from "react";

import AppCard from "@/components/ui/AppCard";
import AppInput from "@/components/ui/AppInput";
import { Button } from "@/components/ui/button";

import type {
  InventoryCategory,
  InventoryCategoryFormData,
} from "@/types/inventory";

type InventoryCategoryFormProps = {
  category?: InventoryCategory | null;

  onSave: (
    data: InventoryCategoryFormData
  ) => Promise<void>;

  onCancel: () => void;
};

export default function InventoryCategoryForm({
  category,
  onSave,
  onCancel,
}: InventoryCategoryFormProps) {
  const [categoryName, setCategoryName] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const isEditing = Boolean(category);

  useEffect(() => {
    setCategoryName(
      category?.category_name ?? ""
    );

    setDescription(
      category?.description ?? ""
    );

    setErrorMessage("");
  }, [category]);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!categoryName.trim()) {
      setErrorMessage(
        "Category name is required."
      );
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await onSave({
        category_name:
          categoryName.trim(),

        description:
          description.trim(),
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The category could not be saved."
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
              ? "Edit Category"
              : "Add Category"}
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Organise inventory items
            into useful groups.
          </p>
        </div>

        <AppInput
          label="Category Name"
          value={categoryName}
          placeholder="Example: Laptop Parts"
          required
          onChange={setCategoryName}
        />

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
            placeholder="Optional category description"
            rows={4}
            className="rounded-md border bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          />
        </label>

        {errorMessage && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
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
                : "Save Category"}
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
