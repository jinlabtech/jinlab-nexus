"use client";

import { useEffect, useState } from "react";

import AppCard from "@/components/ui/AppCard";
import AppInput from "@/components/ui/AppInput";
import { Button } from "@/components/ui/button";

import type {
  Supplier,
  SupplierFormData,
} from "@/types/inventory";

type SupplierFormProps = {
  supplier?: Supplier | null;
  onSave: (data: SupplierFormData) => Promise<void>;
  onCancel: () => void;
};

export default function SupplierForm({
  supplier,
  onSave,
  onCancel,
}: SupplierFormProps) {
  const [supplierName, setSupplierName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isEditing = Boolean(supplier);

  useEffect(() => {
    setSupplierName(supplier?.supplier_name ?? "");
    setContactPerson(supplier?.contact_person ?? "");
    setEmail(supplier?.email ?? "");
    setPhone(supplier?.phone ?? "");
    setAddress(supplier?.address ?? "");
    setErrorMessage("");
  }, [supplier]);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!supplierName.trim()) {
      setErrorMessage("Supplier name is required.");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await onSave({
        supplier_name: supplierName.trim(),
        contact_person: contactPerson.trim(),
        email: email.trim(),
        phone: phone.trim(),
        address: address.trim(),
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The supplier could not be saved."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppCard>
      <form onSubmit={handleSubmit} className="grid gap-5">
        <div>
          <h2 className="text-xl font-semibold">
            {isEditing ? "Edit Supplier" : "Add Supplier"}
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Maintain supplier and procurement information.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <AppInput
            label="Supplier Name"
            value={supplierName}
            placeholder="Example: Mustek"
            required
            onChange={setSupplierName}
          />

          <AppInput
            label="Contact Person"
            value={contactPerson}
            placeholder="Optional contact"
            onChange={setContactPerson}
          />

          <AppInput
            label="Email"
            value={email}
            type="email"
            placeholder="supplier@example.com"
            onChange={setEmail}
          />

          <AppInput
            label="Phone"
            value={phone}
            type="tel"
            placeholder="012 345 6789"
            onChange={setPhone}
          />
        </div>

        <label className="grid gap-2">
          <span className="text-sm font-medium">
            Address
          </span>

          <textarea
            value={address}
            onChange={(event) =>
              setAddress(event.target.value)
            }
            placeholder="Supplier address"
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
          <Button type="submit" disabled={saving}>
            {saving
              ? "Saving..."
              : isEditing
                ? "Save Changes"
                : "Save Supplier"}
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
