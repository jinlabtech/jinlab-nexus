"use client";

import { FormEvent, useMemo, useState } from "react";

import AppInput from "@/components/ui/AppInput";
import { Button } from "@/components/ui/button";

import {
  calculateExpectedCompletionDate,
  calculateInstallmentCount,
  type PaymentFrequency,
  type PaymentPlanType,
} from "@/lib/services/paymentPlanService";

type Props = {
  balanceDue: number;
  saving?: boolean;
  onSave: (data: {
    plan_type: PaymentPlanType;
    deposit_amount: number;
    instalment_amount: number;
    frequency: PaymentFrequency;
    start_date: string;
    first_payment_date: string;
    expected_completion_date: string;
    notes: string;
  }) => Promise<void>;
  onCancel: () => void;
};

export default function InvoicePaymentPlanForm({
  balanceDue,
  saving = false,
  onSave,
  onCancel,
}: Props) {
  const today = new Date().toISOString().slice(0, 10);

  const [planType, setPlanType] =
    useState<PaymentPlanType>("layby");

  const [depositAmount, setDepositAmount] =
    useState("0");

  const [instalmentAmount, setInstalmentAmount] =
    useState("");

  const [frequency, setFrequency] =
    useState<PaymentFrequency>("monthly");

  const [startDate, setStartDate] =
    useState(today);

  const [firstPaymentDate, setFirstPaymentDate] =
    useState(today);

  const [notes, setNotes] =
    useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  const deposit = Number(depositAmount || 0);
  const instalment = Number(instalmentAmount || 0);

  const remaining = Math.max(
    balanceDue - deposit,
    0
  );

  const installmentCount = useMemo(() => {
    return calculateInstallmentCount(
      balanceDue,
      deposit,
      instalment
    );
  }, [
    balanceDue,
    deposit,
    instalment,
  ]);

  const expectedCompletionDate = useMemo(() => {
    if (
      !firstPaymentDate ||
      instalment <= 0
    ) {
      return "";
    }

    return calculateExpectedCompletionDate(
      balanceDue,
      deposit,
      instalment,
      frequency,
      firstPaymentDate
    );
  }, [
    balanceDue,
    deposit,
    instalment,
    frequency,
    firstPaymentDate,
  ]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      Number.isNaN(deposit) ||
      deposit < 0 ||
      deposit > balanceDue
    ) {
      setErrorMessage(
        "Deposit amount is invalid."
      );
      return;
    }

    if (
      remaining > 0 &&
      (
        Number.isNaN(instalment) ||
        instalment <= 0
      )
    ) {
      setErrorMessage(
        "Instalment amount must be greater than zero."
      );
      return;
    }

    if (!firstPaymentDate) {
      setErrorMessage(
        "Select the first payment date."
      );
      return;
    }

    setErrorMessage("");

    try {
      await onSave({
        plan_type: planType,
        deposit_amount: deposit,
        instalment_amount: instalment,
        frequency,
        start_date: startDate,
        first_payment_date:
          firstPaymentDate,
        expected_completion_date:
          expectedCompletionDate,
        notes,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Payment plan could not be created."
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
          Create Payment Plan
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Create a lay-by, instalment or account payment arrangement.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-sm font-medium">
            Plan Type
          </span>

          <select
            value={planType}
            onChange={(event) =>
              setPlanType(
                event.target.value as PaymentPlanType
              )
            }
            className="h-10 rounded-md border bg-background px-3 text-sm"
            disabled={saving}
          >
            <option value="layby">
              Lay-by
            </option>

            <option value="instalment">
              Instalment
            </option>

            <option value="account">
              Customer Account
            </option>
          </select>
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium">
            Frequency
          </span>

          <select
            value={frequency}
            onChange={(event) =>
              setFrequency(
                event.target.value as PaymentFrequency
              )
            }
            className="h-10 rounded-md border bg-background px-3 text-sm"
            disabled={saving}
          >
            <option value="weekly">
              Weekly
            </option>

            <option value="fortnightly">
              Every 2 Weeks
            </option>

            <option value="monthly">
              Monthly
            </option>

            <option value="custom">
              Custom
            </option>
          </select>
        </label>

        <AppInput
          label="Deposit"
          type="number"
          min={0}
          max={balanceDue}
          step="0.01"
          value={depositAmount}
          onChange={setDepositAmount}
        />

        <AppInput
          label="Instalment Amount"
          type="number"
          min={0.01}
          max={balanceDue}
          step="0.01"
          value={instalmentAmount}
          onChange={setInstalmentAmount}
        />

        <label className="grid gap-2">
          <span className="text-sm font-medium">
            Start Date
          </span>

          <input
            type="date"
            value={startDate}
            onChange={(event) =>
              setStartDate(event.target.value)
            }
            className="h-10 rounded-md border bg-background px-3 text-sm"
            disabled={saving}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium">
            First Instalment Date
          </span>

          <input
            type="date"
            value={firstPaymentDate}
            onChange={(event) =>
              setFirstPaymentDate(
                event.target.value
              )
            }
            className="h-10 rounded-md border bg-background px-3 text-sm"
            disabled={saving}
          />
        </label>
      </div>

      <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 md:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">
            Invoice Balance
          </p>

          <p className="mt-1 font-semibold">
            R {balanceDue.toFixed(2)}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">
            Remaining After Deposit
          </p>

          <p className="mt-1 font-semibold">
            R {remaining.toFixed(2)}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">
            Number of Payments
          </p>

          <p className="mt-1 font-semibold">
            {installmentCount}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">
            Expected Completion
          </p>

          <p className="mt-1 font-semibold">
            {expectedCompletionDate ||
              "—"}
          </p>
        </div>
      </div>

      <label className="grid gap-2">
        <span className="text-sm font-medium">
          Notes
        </span>

        <textarea
          value={notes}
          onChange={(event) =>
            setNotes(event.target.value)
          }
          rows={3}
          placeholder="Optional payment arrangement notes..."
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
          className="bg-black text-white hover:bg-black/85"
        >
          {saving
            ? "Creating..."
            : "Create Payment Plan"}
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
