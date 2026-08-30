"use client";

import {
  FormEvent,
  useState,
} from "react";

import AppInput from "@/components/ui/AppInput";
import { Button } from "@/components/ui/button";

import type {
  PaymentFormData,
  PaymentMethod,
} from "@/lib/services/paymentService";

type Props = {
  balanceDue: number;
  saving?: boolean;
  onSave: (
    data: PaymentFormData
  ) => Promise<void>;
  onCancel: () => void;
};

export default function InvoicePaymentForm({
  balanceDue,
  saving = false,
  onSave,
  onCancel,
}: Props) {
  const today =
    new Date()
      .toISOString()
      .slice(0, 10);

  const [
    paymentDate,
    setPaymentDate,
  ] = useState(today);

  const [
    paymentMethod,
    setPaymentMethod,
  ] =
    useState<PaymentMethod>(
      "cash"
    );

  const [
    reference,
    setReference,
  ] = useState("");

  const [
    amount,
    setAmount,
  ] = useState(
    String(balanceDue)
  );

  const [
    notes,
    setNotes,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const parsedAmount =
      Number(amount);

    if (
      Number.isNaN(
        parsedAmount
      ) ||
      parsedAmount <= 0
    ) {
      setErrorMessage(
        "Payment amount must be greater than 0."
      );
      return;
    }

    if (
      parsedAmount >
      balanceDue
    ) {
      setErrorMessage(
        "Payment cannot exceed the outstanding balance."
      );
      return;
    }

    setErrorMessage("");

    try {
      await onSave({
        payment_date:
          paymentDate,
        payment_method:
          paymentMethod,
        reference:
          reference,
        amount:
          parsedAmount,
        notes,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Payment could not be recorded."
      );
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-5 rounded-xl border bg-card p-5"
    >
      <div>
        <h2 className="text-lg font-semibold">
          Record Payment
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Outstanding balance: R{" "}
          {balanceDue.toFixed(2)}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-sm font-medium">
            Payment Method
          </span>

          <select
            value={
              paymentMethod
            }
            onChange={(event) =>
              setPaymentMethod(
                event.target
                  .value as PaymentMethod
              )
            }
            className="h-10 rounded-md border bg-background px-3 text-sm"
            disabled={saving}
          >
            <option value="cash">
              Cash
            </option>

            <option value="eft">
              EFT
            </option>

            <option value="card">
              Card
            </option>

            <option value="other">
              Other
            </option>
          </select>
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium">
            Payment Date
          </span>

          <input
            type="date"
            value={
              paymentDate
            }
            onChange={(event) =>
              setPaymentDate(
                event.target.value
              )
            }
            className="h-10 rounded-md border bg-background px-3 text-sm"
            disabled={saving}
          />
        </label>

        <AppInput
          label="Amount"
          type="number"
          min={0.01}
          max={
            balanceDue
          }
          step="0.01"
          value={amount}
          onChange={setAmount}
        />

        <AppInput
          label="Reference"
          value={reference}
          placeholder="EFT ref, card slip, receipt no..."
          onChange={
            setReference
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
          disabled={saving}
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
            ? "Recording..."
            : "Save Payment"}
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
  );
}
