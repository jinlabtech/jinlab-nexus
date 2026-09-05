"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  useParams,
} from "next/navigation";

import {
  getPublicQuotation,
  respondToPublicQuotation,
  type PublicQuotationAction,
  type PublicQuotationData,
} from "@/lib/services/publicQuotationService";

function formatCurrency(
  value: number
) {
  return new Intl.NumberFormat(
    "en-ZA",
    {
      style: "currency",
      currency: "ZAR",
    }
  ).format(value);
}

function formatDate(
  value:
    | string
    | null
    | undefined
) {
  if (!value) {
    return "—";
  }

  const dateOnly =
    value.slice(0, 10);

  return new Intl.DateTimeFormat(
    "en-ZA",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  ).format(
    new Date(
      `${dateOnly}T00:00:00`
    )
  );
}

function formatStatus(
  value: string
) {
  return value
    .split("_")
    .map(
      (part) =>
        part
          .charAt(0)
          .toUpperCase() +
        part.slice(1)
    )
    .join(" ");
}

export default function PublicQuotationPage() {
  const params = useParams();

  const token =
    String(params.token);

  const [
    data,
    setData,
  ] =
    useState<PublicQuotationData | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );

  const [
    message,
    setMessage,
  ] =
    useState("");

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

  const [
    responseMessage,
    setResponseMessage,
  ] =
    useState<string | null>(
      null
    );

  const loadQuotation =
    useCallback(
      async () => {
        try {
          setLoading(true);
          setError(null);

          const result =
            await getPublicQuotation(
              token
            );

          setData(result);
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load quotation."
          );
        } finally {
          setLoading(false);
        }
      },
      [token]
    );

  useEffect(() => {
    loadQuotation();
  }, [loadQuotation]);

  async function submitResponse(
    action:
      PublicQuotationAction
  ) {
    if (
      !data?.quotation
    ) {
      return;
    }

    if (
      action ===
        "accepted" &&
      !window.confirm(
        "Accept this quotation?"
      )
    ) {
      return;
    }

    if (
      action ===
        "declined" &&
      !window.confirm(
        "Decline this quotation?"
      )
    ) {
      return;
    }

    try {
      setSubmitting(true);
      setResponseMessage(
        null
      );

      const result =
        await respondToPublicQuotation(
          token,
          action,
          message
        );

      if (!result.ok) {
        throw new Error(
          result.reason
            ? formatStatus(
                result.reason
              )
            : "Unable to save response."
        );
      }

      if (
        action ===
        "accepted"
      ) {
        setResponseMessage(
          "Quotation accepted successfully."
        );
      } else if (
        action ===
        "declined"
      ) {
        setResponseMessage(
          "Quotation declined."
        );
      } else {
        setResponseMessage(
          "Your requested changes have been sent."
        );
      }

      setMessage("");

      await loadQuotation();
    } catch (err) {
      setResponseMessage(
        err instanceof Error
          ? err.message
          : "Unable to save response."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-50 px-4 py-10">
        <div className="mx-auto max-w-4xl rounded-2xl border bg-white p-8 shadow-sm">
          Loading quotation...
        </div>
      </main>
    );
  }

  if (
    error ||
    !data ||
    !data.ok ||
    !data.quotation ||
    !data.company
  ) {
    const reason =
      data?.reason;

    return (
      <main className="min-h-screen bg-neutral-50 px-4 py-10">
        <div className="mx-auto max-w-xl rounded-2xl border bg-white p-8 shadow-sm">
          <h1 className="text-xl font-bold text-neutral-950">
            Quotation Unavailable
          </h1>

          <p className="mt-3 text-sm leading-6 text-neutral-600">
            {error ??
              (reason ===
              "expired"
                ? "This quotation link has expired."
                : reason ===
                    "quotation_cancelled"
                  ? "This quotation has been cancelled."
                  : "This quotation is no longer available.")}
          </p>
        </div>
      </main>
    );
  }

  const quotation =
    data.quotation;

  const items =
    data.items ?? [];

  const terminal =
    quotation.status ===
      "accepted" ||
    quotation.status ===
      "declined" ||
    quotation.status ===
      "expired" ||
    quotation.status ===
      "cancelled";

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <header className="border-b border-neutral-200 px-6 py-6 sm:px-8">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
              <div>
                <p className="text-xl font-bold tracking-tight text-neutral-950">
                  {data.company.name}
                </p>

                {data.company
                  .branch_name && (
                  <p className="mt-1 text-sm text-neutral-500">
                    {
                      data
                        .company
                        .branch_name
                    }
                  </p>
                )}
              </div>

              <div className="sm:text-right">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                  Quotation
                </p>

                <p className="mt-1 text-lg font-bold text-neutral-950">
                  {
                    quotation
                      .quotation_number
                  }
                </p>

                <span className="mt-2 inline-flex rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold">
                  {formatStatus(
                    quotation.status
                  )}
                </span>
              </div>
            </div>
          </header>

          <section className="grid gap-6 border-b border-neutral-200 px-6 py-6 sm:grid-cols-2 sm:px-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Prepared For
              </p>

              <p className="mt-2 font-semibold text-neutral-950">
                {data.customer?.name ??
                  "Customer"}
              </p>

              {quotation.customer_reference && (
                <p className="mt-1 text-sm text-neutral-500">
                  Ref:{" "}
                  {
                    quotation
                      .customer_reference
                  }
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 sm:text-right">
              <div>
                <p className="text-xs text-neutral-500">
                  Quotation Date
                </p>

                <p className="mt-1 text-sm font-semibold text-neutral-950">
                  {formatDate(
                    quotation.quotation_date
                  )}
                </p>
              </div>

              <div>
                <p className="text-xs text-neutral-500">
                  Valid Until
                </p>

                <p className="mt-1 text-sm font-semibold text-neutral-950">
                  {formatDate(
                    quotation.valid_until
                  )}
                </p>
              </div>
            </div>
          </section>

          <section className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-6 py-3 sm:px-8">
                    Description
                  </th>

                  <th className="px-4 py-3 text-right">
                    Qty
                  </th>

                  <th className="px-4 py-3 text-right">
                    Price
                  </th>

                  <th className="px-4 py-3 text-right">
                    Discount
                  </th>

                  <th className="px-6 py-3 text-right sm:px-8">
                    Total
                  </th>
                </tr>
              </thead>

              <tbody>
                {items.map(
                  (item) => (
                    <tr
                      key={
                        item.id
                      }
                      className="border-b border-neutral-100"
                    >
                      <td className="px-6 py-4 font-medium text-neutral-900 sm:px-8">
                        {
                          item.description
                        }
                      </td>

                      <td className="px-4 py-4 text-right text-neutral-600">
                        {Number(
                          item.quantity
                        )}
                      </td>

                      <td className="px-4 py-4 text-right text-neutral-600">
                        {formatCurrency(
                          Number(
                            item.unit_price
                          )
                        )}
                      </td>

                      <td className="px-4 py-4 text-right text-neutral-600">
                        {formatCurrency(
                          Number(
                            item.line_discount
                          )
                        )}
                      </td>

                      <td className="px-6 py-4 text-right font-semibold text-neutral-950 sm:px-8">
                        {formatCurrency(
                          Number(
                            item.line_total
                          )
                        )}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </section>

          <section className="grid gap-8 px-6 py-7 sm:grid-cols-2 sm:px-8">
            <div>
              {quotation.notes && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Notes
                  </p>

                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-600">
                    {
                      quotation.notes
                    }
                  </p>
                </div>
              )}

              {quotation.terms && (
                <div className="mt-6">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Terms
                  </p>

                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-600">
                    {
                      quotation.terms
                    }
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-neutral-500">
                  Subtotal
                </span>

                <span className="font-medium">
                  {formatCurrency(
                    Number(
                      quotation.subtotal
                    )
                  )}
                </span>
              </div>

              {Number(
                quotation.discount_amount
              ) > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-500">
                    Discount
                  </span>

                  <span className="font-medium">
                    -
                    {formatCurrency(
                      Number(
                        quotation.discount_amount
                      )
                    )}
                  </span>
                </div>
              )}

              {Number(
                quotation.tax_amount
              ) > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-500">
                    VAT / Tax
                  </span>

                  <span className="font-medium">
                    {formatCurrency(
                      Number(
                        quotation.tax_amount
                      )
                    )}
                  </span>
                </div>
              )}

              <div className="border-t border-neutral-200 pt-3">
                <div className="flex items-end justify-between gap-4">
                  <span className="font-semibold text-neutral-950">
                    Total
                  </span>

                  <span className="text-2xl font-bold tracking-tight text-neutral-950">
                    {formatCurrency(
                      Number(
                        quotation.total_amount
                      )
                    )}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="border-t border-neutral-200 bg-neutral-50 px-6 py-7 sm:px-8">
            {quotation.status ===
              "accepted" && (
              <div className="rounded-xl border border-emerald-200 bg-white p-5">
                <p className="font-bold text-emerald-700">
                  ✓ Quotation Accepted
                </p>

                <p className="mt-1 text-sm text-neutral-600">
                  This quotation has
                  been accepted and
                  recorded.
                </p>
              </div>
            )}

            {quotation.status ===
              "declined" && (
              <div className="rounded-xl border border-neutral-300 bg-white p-5">
                <p className="font-bold text-neutral-900">
                  Quotation Declined
                </p>

                <p className="mt-1 text-sm text-neutral-600">
                  This response has
                  been recorded.
                </p>
              </div>
            )}

            {!terminal && (
              <>
                <div>
                  <h2 className="text-lg font-bold text-neutral-950">
                    Respond to this quotation
                  </h2>

                  <p className="mt-1 text-sm text-neutral-600">
                    Accept the quotation,
                    request changes, or
                    decline it.
                  </p>
                </div>

                <textarea
                  value={message}
                  onChange={(
                    event
                  ) =>
                    setMessage(
                      event
                        .target
                        .value
                    )
                  }
                  rows={4}
                  placeholder="Optional message or requested changes..."
                  className="mt-5 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm outline-none focus:border-neutral-900"
                />

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() =>
                      submitResponse(
                        "accepted"
                      )
                    }
                    disabled={
                      submitting
                    }
                    className="rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-black/85 disabled:opacity-50"
                  >
                    Accept Quotation
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      submitResponse(
                        "requested_changes"
                      )
                    }
                    disabled={
                      submitting
                    }
                    className="rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 hover:bg-neutral-100 disabled:opacity-50"
                  >
                    Request Changes
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      submitResponse(
                        "declined"
                      )
                    }
                    disabled={
                      submitting
                    }
                    className="rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-900 hover:bg-neutral-100 disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              </>
            )}

            {responseMessage && (
              <p className="mt-4 text-sm font-medium text-neutral-700">
                {
                  responseMessage
                }
              </p>
            )}
          </section>
        </div>

        <p className="mt-4 text-center text-xs text-neutral-400">
          Secure document powered by
          JINLAB Nexus
        </p>
      </div>
    </main>
  );
}
