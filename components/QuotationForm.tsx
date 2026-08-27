"use client";

import {
  useEffect,
  useState,
} from "react";

import AppCard from "@/components/ui/AppCard";
import AppInput from "@/components/ui/AppInput";
import { Button } from "@/components/ui/button";

import type {
  Branch,
} from "@/types/branch";

import type {
  Customer,
} from "@/types/customer";

import type {
  Quotation,
  QuotationFormData,
} from "@/types/quotation";

type QuotationFormProps = {
  quotation?: Quotation | null;
  customers: Customer[];
  branches: Branch[];

  onSave: (
    data: QuotationFormData
  ) => Promise<void>;

  onCancel: () => void;
};

export default function QuotationForm({
  quotation,
  customers,
  branches,
  onSave,
  onCancel,
}: QuotationFormProps) {
  const [
    customerId,
    setCustomerId,
  ] = useState("");

  const [
    branchId,
    setBranchId,
  ] = useState("");

  const [
    validUntil,
    setValidUntil,
  ] = useState("");

  const [
    customerReference,
    setCustomerReference,
  ] = useState("");

  const [
    notes,
    setNotes,
  ] = useState("");

  const [
    terms,
    setTerms,
  ] = useState(
    "Quotation valid until the stated expiry date. Prices are subject to availability."
  );

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const isEditing =
    Boolean(quotation);

  useEffect(() => {
    setCustomerId(
      quotation?.customer_id ??
        ""
    );

    setBranchId(
      quotation?.branch_id ??
        ""
    );

    setValidUntil(
      quotation?.valid_until ??
        ""
    );

    setCustomerReference(
      quotation?.customer_reference ??
        ""
    );

    setNotes(
      quotation?.notes ??
        ""
    );

    setTerms(
      quotation?.terms ??
        "Quotation valid until the stated expiry date. Prices are subject to availability."
    );

    setErrorMessage("");
  }, [quotation]);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!customerId) {
      setErrorMessage(
        "Select a customer."
      );
      return;
    }

    if (!branchId) {
      setErrorMessage(
        "Select a branch."
      );
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await onSave({
        customer_id:
          customerId,

        branch_id:
          branchId,

        valid_until:
          validUntil,

        customer_reference:
          customerReference.trim(),

        notes:
          notes.trim(),

        terms:
          terms.trim(),
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Quotation could not be saved."
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
              ? "Edit Quotation"
              : "New Quotation"}
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Create a quotation for an existing customer.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium">
              Customer
            </span>

            <select
              value={
                customerId
              }
              onChange={(event) =>
                setCustomerId(
                  event.target.value
                )
              }
              className="h-10 rounded-md border bg-background px-3 text-sm"
              required
            >
              <option value="">
                Select customer
              </option>

              {customers.map(
                (customer) => (
                  <option
                    key={
                      customer.id
                    }
                    value={
                      customer.id
                    }
                  >
                    {
                      customer.customer_name
                    }{" "}—{" "}
                    {
                      customer.customer_number
                    }
                  </option>
                )
              )}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">
              Branch
            </span>

            <select
              value={
                branchId
              }
              onChange={(event) =>
                setBranchId(
                  event.target.value
                )
              }
              className="h-10 rounded-md border bg-background px-3 text-sm"
              required
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

          <label className="grid gap-2">
            <span className="text-sm font-medium">
              Valid Until
            </span>

            <input
              type="date"
              value={
                validUntil
              }
              onChange={(event) =>
                setValidUntil(
                  event.target.value
                )
              }
              className="h-10 rounded-md border bg-background px-3 text-sm"
            />
          </label>

          <AppInput
            label="Customer Reference"
            value={
              customerReference
            }
            placeholder="Optional PO, RFQ or customer reference"
            onChange={
              setCustomerReference
            }
          />
        </div>

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
            rows={3}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium">
            Terms
          </span>

          <textarea
            value={terms}
            onChange={(event) =>
              setTerms(
                event.target.value
              )
            }
            rows={4}
            className="rounded-md border bg-background px-3 py-2 text-sm"
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
                : "Create Quotation"}
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
