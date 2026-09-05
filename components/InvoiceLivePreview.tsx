"use client";

import type {
  Invoice,
  InvoiceItem,
} from "@/lib/services/invoiceService";

import type {
  InvoicePayment,
} from "@/lib/services/paymentService";

import type {
  Customer,
} from "@/types/customer";

import {
  Fragment,
  useEffect,
  useState,
} from "react";

import { Button } from "@/components/ui/button";

import type {
  UpdateInvoiceDetailsInput,
  UpdateInvoiceItemFinancialsInput,
  InvoiceChangeLog,
} from "@/lib/services/invoiceService";

type BranchInfo = {
  id: string;
  branch_name: string;
};

type Props = {
  invoice: Invoice;
  items: InvoiceItem[];
  customer: Customer | null;
  branch: BranchInfo | null;
  companyName: string;
  companyLogoUrl?: string | null;
  payments: InvoicePayment[];
  saving?: boolean;
  onUpdateInvoice: (
    input: UpdateInvoiceDetailsInput
  ) => Promise<void>;

  onUpdateItemFinancials: (
    itemId: string,
    input: UpdateInvoiceItemFinancialsInput
  ) => Promise<void>;

  changeLog: InvoiceChangeLog[];
};

function money(value: number) {
  return new Intl.NumberFormat(
    "en-ZA",
    {
      style: "currency",
      currency: "ZAR",
    }
  ).format(value);
}

function status(value: string) {
  return value
    .split("_")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(" ");
}

export default function InvoiceLivePreview({
  invoice,
  items,
  customer,
  branch,
  companyName,
  companyLogoUrl,
  payments,
  saving = false,
  onUpdateInvoice,
  onUpdateItemFinancials,
  changeLog,
}: Props) {
  const [editing, setEditing] =
    useState<string | null>(null);

  const [draftValue, setDraftValue] =
    useState("");

  const editable =
    invoice.status !== "cancelled";

  const financialEditable =
    invoice.status !== "cancelled";

  const [
    editingItemId,
    setEditingItemId,
  ] =
    useState<string | null>(
      null
    );

  const [
    itemPrice,
    setItemPrice,
  ] = useState("");

  const [
    itemDiscountMode,
    setItemDiscountMode,
  ] = useState<
    "percentage" | "fixed"
  >("percentage");

  const [
    itemDiscountValue,
    setItemDiscountValue,
  ] = useState("");

  const [
    itemChangeReason,
    setItemChangeReason,
  ] = useState("");

  function beginFinancialEdit(
    item: InvoiceItem
  ) {
    if (!financialEditable) {
      return;
    }

    setEditingItemId(
      item.id
    );

    setItemPrice(
      String(
        Number(
          item.unit_price
        )
      )
    );

    setItemDiscountMode(
      item.discount_mode
    );

    setItemDiscountValue(
      String(
        Number(
          item.discount_value
        )
      )
    );

    setItemChangeReason("");
  }

  function cancelFinancialEdit() {
    setEditingItemId(
      null
    );

    setItemPrice("");
    setItemDiscountValue("");
    setItemChangeReason("");
  }

  async function saveFinancialEdit(
    item: InvoiceItem
  ) {
    const price =
      Number(itemPrice);

    const discount =
      Number(
        itemDiscountValue
      );

    if (
      !Number.isFinite(price) ||
      price < 0
    ) {
      return;
    }

    if (
      !Number.isFinite(discount) ||
      discount < 0
    ) {
      return;
    }

    if (
      itemDiscountMode ===
        "percentage" &&
      discount > 100
    ) {
      return;
    }

    await onUpdateItemFinancials(
      item.id,
      {
        unit_price: price,
        discount_mode:
          itemDiscountMode,
        discount_value:
          discount,
        reason:
          itemChangeReason,
      }
    );

    cancelFinancialEdit();
  }

  function beginEdit(
    field: string,
    value: string | null
  ) {
    if (!editable) {
      return;
    }

    setEditing(field);
    setDraftValue(value ?? "");
  }

  function cancelEdit() {
    setEditing(null);
    setDraftValue("");
  }

  async function saveField() {
    if (!editing) {
      return;
    }

    const update: UpdateInvoiceDetailsInput = {};

    if (editing === "invoice_date") {
      update.invoice_date = draftValue;
    }

    if (editing === "due_date") {
      update.due_date =
        draftValue || null;
    }

    if (editing === "customer_reference") {
      update.customer_reference =
        draftValue.trim() || null;
    }

    if (editing === "notes") {
      update.notes =
        draftValue.trim() || null;
    }

    if (editing === "terms") {
      update.terms =
        draftValue.trim() || null;
    }

    await onUpdateInvoice(update);

    setEditing(null);
    setDraftValue("");
  }

  useEffect(() => {
    cancelEdit();
  }, [invoice.id]);
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b bg-neutral-50 px-5 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Live Invoice Preview
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          LIVE
        </div>
      </div>

      <div className="p-6 text-neutral-950 sm:p-8">
        <div className="flex items-start justify-between gap-6 border-b pb-6">
          <div>
            {companyLogoUrl ? (
              <div className="mb-3 flex min-h-16 items-center">
                <img
                  src={companyLogoUrl}
                  alt={`${companyName} logo`}
                  className="max-h-16 max-w-[180px] object-contain"
                />
              </div>
            ) : (
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-black text-xl font-bold text-white">
                {companyName
                  .charAt(0)
                  .toUpperCase()}
              </div>
            )}

            <h2 className="text-xl font-bold">
              {companyName}
            </h2>

            <p className="mt-1 text-xs text-neutral-500">
              {branch?.branch_name ??
                ""}
            </p>
          </div>

          <div className="text-right">
            <p className="text-2xl font-black tracking-tight">
              INVOICE
            </p>

            <p className="mt-1 text-sm font-semibold">
              {invoice.invoice_number}
            </p>

            <span className="mt-3 inline-block rounded-full border px-3 py-1 text-xs font-semibold">
              {status(invoice.status)}
            </span>
          </div>
        </div>

        <div className="grid gap-6 border-b py-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Bill To
            </p>

            <p className="mt-2 font-bold">
              {customer?.customer_name ??
                "Customer"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:text-right">
            <div>
              <p className="text-xs text-neutral-400">
                Invoice Date
              </p>

              {editing ===
              "invoice_date" ? (
                <div className="mt-2 grid gap-2">
                  <input
                    type="date"
                    value={draftValue}
                    onChange={(event) =>
                      setDraftValue(
                        event.target.value
                      )
                    }
                    className="rounded-md border px-2 py-1 text-sm"
                    autoFocus
                  />

                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      onClick={saveField}
                      disabled={saving}
                      className="bg-black text-white"
                    >
                      Save
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={cancelEdit}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    beginEdit(
                      "invoice_date",
                      invoice.invoice_date
                    )
                  }
                  className={`mt-1 text-sm font-semibold ${
                    editable
                      ? "cursor-pointer rounded px-1 hover:bg-neutral-100"
                      : ""
                  }`}
                >
                  {invoice.invoice_date}
                  {editable && " ✎"}
                </button>
              )}
            </div>

            <div>
              <p className="text-xs text-neutral-400">
                Due Date
              </p>

              {editing ===
              "due_date" ? (
                <div className="mt-2 grid gap-2">
                  <input
                    type="date"
                    value={draftValue}
                    onChange={(event) =>
                      setDraftValue(
                        event.target.value
                      )
                    }
                    className="rounded-md border px-2 py-1 text-sm"
                    autoFocus
                  />

                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      onClick={saveField}
                      disabled={saving}
                      className="bg-black text-white"
                    >
                      Save
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={cancelEdit}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    beginEdit(
                      "due_date",
                      invoice.due_date
                    )
                  }
                  className={`mt-1 text-sm font-semibold ${
                    editable
                      ? "cursor-pointer rounded px-1 hover:bg-neutral-100"
                      : ""
                  }`}
                >
                  {invoice.due_date ??
                    "Set due date"}
                  {editable && " ✎"}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="py-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-neutral-400">
                  <th className="pb-3 text-left">
                    Description
                  </th>

                  <th className="pb-3 text-right">
                    Qty
                  </th>

                  <th className="pb-3 text-right">
                    Price
                  </th>

                  <th className="pb-3 text-right">
                    Discount
                  </th>

                  <th className="pb-3 text-right">
                    Total
                  </th>
                </tr>
              </thead>

              <tbody>
                {items.map((item) => (
                  <Fragment key={item.id}>
                    <tr
                      key={item.id}
                      className="border-b"
                    >
                      <td className="py-3 font-medium">
                        {item.description}
                      </td>

                      <td className="py-3 text-right">
                        {Number(
                          item.quantity
                        )}
                      </td>

                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            beginFinancialEdit(
                              item
                            )
                          }
                          disabled={
                            !financialEditable
                          }
                          className={`rounded px-2 py-1 font-semibold ${
                            financialEditable
                              ? "cursor-pointer hover:bg-neutral-100"
                              : ""
                          }`}
                        >
                          {money(
                            Number(
                              item.unit_price
                            )
                          )}
                          {financialEditable &&
                            " ✎"}
                        </button>
                      </td>

                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            beginFinancialEdit(
                              item
                            )
                          }
                          disabled={
                            !financialEditable
                          }
                          className={`rounded px-2 py-1 ${
                            financialEditable
                              ? "cursor-pointer hover:bg-neutral-100"
                              : ""
                          }`}
                        >
                          {item.discount_mode ===
                          "percentage"
                            ? `${Number(
                                item.discount_value
                              )}%`
                            : money(
                                Number(
                                  item.discount_value
                                )
                              )}

                          {financialEditable &&
                            " ✎"}
                        </button>
                      </td>

                      <td className="py-3 text-right font-semibold">
                        {money(
                          Number(
                            item.line_total
                          )
                        )}
                      </td>
                    </tr>

                    {editingItemId ===
                      item.id && (
                      <tr
                        key={`${item.id}-editor`}
                        className="border-b bg-neutral-50"
                      >
                        <td
                          colSpan={5}
                          className="p-4"
                        >
                          <div className="grid gap-4">
                            <div>
                              <p className="font-semibold">
                                Edit{" "}
                                {
                                  item.description
                                }
                              </p>

                              <p className="mt-1 text-xs text-neutral-500">
                                Changes are saved to the invoice database and audit log.
                              </p>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-3">
                              <label className="grid gap-1">
                                <span className="text-xs font-semibold">
                                  Unit Price
                                </span>

                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={
                                    itemPrice
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    setItemPrice(
                                      event
                                        .target
                                        .value
                                    )
                                  }
                                  className="rounded-md border bg-white px-3 py-2 text-sm"
                                />
                              </label>

                              <label className="grid gap-1">
                                <span className="text-xs font-semibold">
                                  Discount Type
                                </span>

                                <select
                                  value={
                                    itemDiscountMode
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    setItemDiscountMode(
                                      event
                                        .target
                                        .value as
                                        | "percentage"
                                        | "fixed"
                                    )
                                  }
                                  className="rounded-md border bg-white px-3 py-2 text-sm"
                                >
                                  <option value="percentage">
                                    Percentage %
                                  </option>

                                  <option value="fixed">
                                    Fixed Rand R
                                  </option>
                                </select>
                              </label>

                              <label className="grid gap-1">
                                <span className="text-xs font-semibold">
                                  Discount
                                </span>

                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={
                                    itemDiscountValue
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    setItemDiscountValue(
                                      event
                                        .target
                                        .value
                                    )
                                  }
                                  className="rounded-md border bg-white px-3 py-2 text-sm"
                                />
                              </label>
                            </div>

                            <label className="grid gap-1">
                              <span className="text-xs font-semibold">
                                Reason for change
                              </span>

                              <input
                                value={
                                  itemChangeReason
                                }
                                onChange={(
                                  event
                                ) =>
                                  setItemChangeReason(
                                    event
                                      .target
                                      .value
                                  )
                                }
                                placeholder="Example: Customer approved revised price"
                                className="rounded-md border bg-white px-3 py-2 text-sm"
                              />
                            </label>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                onClick={() =>
                                  saveFinancialEdit(
                                    item
                                  )
                                }
                                disabled={
                                  saving
                                }
                                className="bg-black text-white hover:bg-black/85"
                              >
                                {saving
                                  ? "Saving..."
                                  : "Save Price & Discount"}
                              </Button>

                              <Button
                                type="button"
                                variant="outline"
                                onClick={
                                  cancelFinancialEdit
                                }
                                disabled={
                                  saving
                                }
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-4 border-t py-5 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Customer Reference
            </p>

            {editing ===
            "customer_reference" ? (
              <div className="mt-2 grid gap-2">
                <input
                  value={draftValue}
                  onChange={(event) =>
                    setDraftValue(
                      event.target.value
                    )
                  }
                  className="rounded-md border px-3 py-2 text-sm"
                  placeholder="PO number / reference"
                  autoFocus
                />

                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={saveField}
                    disabled={saving}
                    className="bg-black text-white"
                  >
                    {saving
                      ? "Saving..."
                      : "Save"}
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={cancelEdit}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() =>
                  beginEdit(
                    "customer_reference",
                    invoice.customer_reference
                  )
                }
                className={`mt-2 text-left text-sm font-semibold ${
                  editable
                    ? "rounded px-1 py-1 hover:bg-neutral-100"
                    : ""
                }`}
              >
                {invoice.customer_reference ||
                  "Add reference"}
                {editable && " ✎"}
              </button>
            )}
          </div>

          <div className="text-sm sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Edit Status
            </p>

            <p className="mt-2 font-semibold">
              {editable
                ? "Draft • Click fields to edit"
                : "Locked after issue"}
            </p>
          </div>
        </div>

        <div className="grid gap-4 border-t py-5 sm:grid-cols-2">
          {[
            {
              key: "notes",
              label: "Notes",
              value: invoice.notes,
            },
            {
              key: "terms",
              label: "Terms",
              value: invoice.terms,
            },
          ].map((field) => (
            <div key={field.key}>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {field.label}
              </p>

              {editing === field.key ? (
                <div className="mt-2 grid gap-2">
                  <textarea
                    value={draftValue}
                    onChange={(event) =>
                      setDraftValue(
                        event.target.value
                      )
                    }
                    rows={4}
                    className="rounded-md border px-3 py-2 text-sm"
                    autoFocus
                  />

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={saveField}
                      disabled={saving}
                      className="bg-black text-white"
                    >
                      {saving
                        ? "Saving..."
                        : "Save"}
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={cancelEdit}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    beginEdit(
                      field.key,
                      field.value
                    )
                  }
                  className={`mt-2 block w-full whitespace-pre-wrap text-left text-sm ${
                    editable
                      ? "rounded p-2 hover:bg-neutral-100"
                      : ""
                  }`}
                >
                  {field.value ||
                    `Add ${field.label.toLowerCase()}`}
                  {editable && " ✎"}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="ml-auto grid max-w-sm gap-2 border-t pt-5 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-500">
              Invoice Total
            </span>

            <span className="font-semibold">
              {money(
                Number(
                  invoice.total_amount
                )
              )}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-neutral-500">
              Paid
            </span>

            <span className="font-semibold">
              {money(
                Number(
                  invoice.amount_paid
                )
              )}
            </span>
          </div>

          <div className="mt-2 flex justify-between border-t pt-3">
            <span className="font-bold">
              BALANCE DUE
            </span>

            <span className="text-lg font-black">
              {money(
                Number(
                  invoice.balance_due
                )
              )}
            </span>
          </div>
        </div>

        {changeLog.length > 0 && (
          <div className="mt-7 border-t pt-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Invoice Change Log
              </p>

              <span className="text-xs text-neutral-400">
                {changeLog.length} changes
              </span>
            </div>

            <div className="mt-3 divide-y rounded-lg border">
              {changeLog
                .slice(0, 6)
                .map((entry) => (
                  <div
                    key={entry.id}
                    className="p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {entry.field_name ===
                        "unit_price"
                          ? "Price changed"
                          : entry.field_name ===
                            "discount_value"
                          ? "Discount changed"
                          : entry.field_name ===
                            "discount_mode"
                          ? "Discount type changed"
                          : entry.field_name}
                      </p>

                      <span className="text-[10px] text-neutral-400">
                        {new Date(
                          entry.created_at
                        ).toLocaleString()}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-neutral-600">
                      {entry.old_value ??
                        "—"}{" "}
                      →{" "}
                      {entry.new_value ??
                        "—"}
                    </p>

                    {entry.reason && (
                      <p className="mt-1 text-xs text-neutral-400">
                        {entry.reason}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {payments.length > 0 && (
          <div className="mt-7 border-t pt-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  Payment History
                </p>

                <p className="mt-1 text-xs text-neutral-500">
                  {payments.length} payment
                  {payments.length === 1
                    ? ""
                    : "s"}{" "}
                  recorded against this invoice.
                </p>
              </div>

              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                  Last Payment
                </p>

                <p className="mt-1 text-sm font-semibold">
                  {new Date(
                    payments[0].payment_date +
                      "T00:00:00"
                  ).toLocaleDateString(
                    "en-ZA",
                    {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    }
                  )}
                </p>
              </div>
            </div>

            <div className="mt-4 divide-y rounded-lg border">
              {payments.map(
                (payment) => (
                  <div
                    key={payment.id}
                    className="grid gap-3 p-3 sm:grid-cols-[140px_1fr_auto]"
                  >
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                        Date Paid
                      </p>

                      <p className="mt-1 text-sm font-semibold">
                        {new Date(
                          payment.payment_date +
                            "T00:00:00"
                        ).toLocaleDateString(
                          "en-ZA",
                          {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          }
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                        Payment Method
                      </p>

                      <p className="mt-1 text-sm font-semibold capitalize">
                        {
                          payment.payment_method
                        }
                      </p>

                      {payment.reference && (
                        <p className="mt-1 text-xs text-neutral-500">
                          Ref:{" "}
                          {
                            payment.reference
                          }
                        </p>
                      )}

                      {payment.notes && (
                        <p className="mt-1 text-xs text-neutral-400">
                          {payment.notes}
                        </p>
                      )}
                    </div>

                    <div className="sm:text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                        Amount Paid
                      </p>

                      <p className="mt-1 text-base font-bold">
                        {money(
                          Number(
                            payment.amount
                          )
                        )}
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>

            <div className="mt-4 grid gap-2 border-t pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500">
                  Total Invoice
                </span>

                <span className="font-semibold">
                  {money(
                    Number(
                      invoice.total_amount
                    )
                  )}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-neutral-500">
                  Total Paid
                </span>

                <span className="font-semibold">
                  {money(
                    Number(
                      invoice.amount_paid
                    )
                  )}
                </span>
              </div>

              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold">
                  Balance Due
                </span>

                <span className="text-lg font-bold">
                  {money(
                    Number(
                      invoice.balance_due
                    )
                  )}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
