"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import { Button } from "@/components/ui/button";

import type { Customer } from "@/types/customer";

type BranchOption = {
  id: string;
  branch_name: string;
};

type SalesOrderFormValues = {
  customer_id: string;
  branch_id: string;
  expected_delivery: string | null;
  notes: string | null;
};

type Props = {
  customers: Customer[];
  branches: BranchOption[];
  submitting?: boolean;
  onSubmit: (
    data: SalesOrderFormValues
  ) => Promise<void> | void;
};

export default function SalesOrderForm({
  customers,
  branches,
  submitting = false,
  onSubmit,
}: Props) {
  const [
    customerId,
    setCustomerId,
  ] = useState("");

  const [
    branchId,
    setBranchId,
  ] = useState("");

  const [
    expectedDelivery,
    setExpectedDelivery,
  ] = useState("");

  const [
    notes,
    setNotes,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  useEffect(() => {
    if (
      !branchId &&
      branches.length === 1
    ) {
      setBranchId(
        branches[0].id
      );
    }
  }, [
    branchId,
    branches,
  ]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setErrorMessage("");

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

    try {
      await onSubmit({
        customer_id:
          customerId,
        branch_id:
          branchId,
        expected_delivery:
          expectedDelivery ||
          null,
        notes:
          notes.trim() ||
          null,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Sales order could not be created."
      );
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6"
    >
      {errorMessage && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <div>
        <label className="mb-2 block text-sm font-medium">
          Customer
        </label>

        <select
          value={customerId}
          onChange={(event) =>
            setCustomerId(
              event.target.value
            )
          }
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          disabled={submitting}
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
                }
              </option>
            )
          )}
        </select>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">
          Branch
        </label>

        <select
          value={branchId}
          onChange={(event) =>
            setBranchId(
              event.target.value
            )
          }
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          disabled={submitting}
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
                {
                  branch.branch_name
                }
              </option>
            )
          )}
        </select>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">
          Expected Delivery
        </label>

        <input
          type="date"
          value={
            expectedDelivery
          }
          onChange={(event) =>
            setExpectedDelivery(
              event.target.value
            )
          }
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          disabled={submitting}
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">
          Notes
        </label>

        <textarea
          value={notes}
          onChange={(event) =>
            setNotes(
              event.target.value
            )
          }
          rows={5}
          placeholder="Optional sales order notes..."
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          disabled={submitting}
        />
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={submitting}
        >
          {submitting
            ? "Creating..."
            : "Create Draft Sales Order"}
        </Button>
      </div>
    </form>
  );
}
