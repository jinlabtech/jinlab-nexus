"use client";

import { useEffect, useState } from "react";

import AppCard from "@/components/ui/AppCard";
import AppInput from "@/components/ui/AppInput";
import { Button } from "@/components/ui/button";

import type { Branch } from "@/types/branch";
import type { Supplier } from "@/types/inventory";
import type {
  PurchaseOrder,
  PurchaseOrderFormData,
} from "@/types/purchasing";

type PurchaseOrderFormProps = {
  order?: PurchaseOrder | null;
  suppliers: Supplier[];
  branches: Branch[];
  onSave: (data: PurchaseOrderFormData) => Promise<void>;
  onCancel: () => void;
};

export default function PurchaseOrderForm({
  order,
  suppliers,
  branches,
  onSave,
  onCancel,
}: PurchaseOrderFormProps) {
  const [supplierId, setSupplierId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [supplierReference, setSupplierReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isEditing = Boolean(order);

  useEffect(() => {
    setSupplierId(order?.supplier_id ?? "");
    setBranchId(order?.branch_id ?? "");
    setExpectedDate(order?.expected_date ?? "");
    setSupplierReference(order?.supplier_reference ?? "");
    setNotes(order?.notes ?? "");
    setErrorMessage("");
  }, [order]);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!supplierId) {
      setErrorMessage("Select a supplier.");
      return;
    }

    if (!branchId) {
      setErrorMessage("Select a receiving branch.");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await onSave({
        supplier_id: supplierId,
        branch_id: branchId,
        expected_date: expectedDate,
        supplier_reference: supplierReference.trim(),
        notes: notes.trim(),
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The purchase order could not be saved."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppCard>
      <form onSubmit={handleSubmit} className="grid gap-6">
        <div>
          <h2 className="text-xl font-semibold">
            {isEditing ? "Edit Purchase Order" : "New Purchase Order"}
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Select the supplier and branch before adding order lines.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium">Supplier</span>

            <select
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              required
            >
              <option value="">Select supplier</option>

              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.supplier_name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Receiving Branch</span>

            <select
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              required
            >
              <option value="">Select branch</option>

              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.branch_name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">Expected Date</span>

            <input
              type="date"
              value={expectedDate}
              onChange={(event) => setExpectedDate(event.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <AppInput
            label="Supplier Reference"
            value={supplierReference}
            placeholder="Optional supplier quote/reference"
            onChange={setSupplierReference}
          />
        </div>

        <label className="grid gap-2">
          <span className="text-sm font-medium">Notes</span>

          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            placeholder="Optional purchasing notes"
            className="rounded-md border bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
        />
        </label>

        {suppliers.length === 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p4 text-sm text-amber-700">
            No suppliers exist yet. Create a supplier from Inventory → Suppliers first.
          </div>
        )}

        {branches.length === 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            No branches exist yet. Create a branch before creating a purchase order.
          </div>
        )}

        {errorMessage && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p4 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            disabled={saving || suppliers.length === 0 || branches.length === 0}
          >
            {saving
              ? "Saving..."
              : isEditing
                ? "Save Changes"
                : "Create Purchase Order"}
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
