"use client";

import type {
  Invoice,
  InvoiceItem,
} from "@/lib/services/invoiceService";

import type {
  InvoicePayment,
} from "@/lib/services/paymentService";

import type {
  InvoicePaymentPlan,
} from "@/lib/services/paymentPlanService";

type CompanyInfo = {
  company_name: string;
  registration_number?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  logo_url?: string | null;
  document_display_name?: string | null;
};

type CustomerInfo = {
  customer_name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

type BranchInfo = {
  branch_name: string;
};

type Props = {
  invoice: Invoice;
  items: InvoiceItem[];
  company: CompanyInfo;
  customer: CustomerInfo;
  branch: BranchInfo | null;
  payments?: InvoicePayment[];
  paymentPlan?: InvoicePaymentPlan | null;
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

function statusLabel(
  value: string
) {
  return value
    .replaceAll("_", " ")
    .toUpperCase();
}

export default function JinlabSignatureInvoice({
  invoice,
  items,
  company,
  customer,
  branch,
  payments = [],
  paymentPlan = null,
}: Props) {
  const paid =
    Number(invoice.balance_due) <= 0;

  const isPaymentPlanInvoice =
    paymentPlan?.plan_type === "layby" ||
    paymentPlan?.plan_type === "instalment" ||
    paymentPlan?.plan_type === "account";

  const compactPaidInvoice =
    paid && !isPaymentPlanInvoice;

  const finalPaymentDate =
    payments.length > 0
      ? payments
          .map(
            (payment) =>
              payment.payment_date
          )
          .filter(Boolean)
          .sort(
            (a, b) =>
              b.localeCompare(a)
          )[0] ?? null
      : null;

  return (
    <article className="mx-auto min-h-[297mm] max-w-[210mm] bg-white px-12 py-10 text-black print:min-h-0 print:max-w-none print:px-0 print:py-0">

      <header className="relative min-h-[190px]">
        {paid && (
          <div className="absolute right-0 top-[150px]">
            <div className="rotate-[-4deg] rounded-md border-2 border-red-600 px-4 py-2 text-center text-red-600">
              <div className="max-w-[150px] truncate text-[8px] font-black uppercase tracking-[0.12em]">
                {company.document_display_name ||
                  company.company_name}
              </div>

              <div className="mt-0.5 text-sm font-black uppercase tracking-[0.16em]">
                PAID
              </div>

              <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.08em]">
                {new Date(
                  (
                    finalPaymentDate ||
                    invoice.invoice_date
                  ) + "T00:00:00"
                ).toLocaleDateString(
                  "en-ZA",
                  {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  }
                )}
              </div>
            </div>
          </div>
        )}


        <div className="flex justify-between gap-12">
          <div className="max-w-sm">
            <div className="mb-5">
              {company.logo_url ? (
                <img
                  src={company.logo_url}
                  alt={`${company.company_name} logo`}
                  className="mb-4 max-h-20 max-w-[220px] object-contain object-left"
                />
              ) : (
                <div className="mb-4 text-5xl font-black tracking-[0.25em]">
                  {company.company_name
                    .charAt(0)
                    .toUpperCase()}
                </div>
              )}

              <div className="text-2xl font-black tracking-[0.12em]">
                {company.document_display_name ||
                  company.company_name}
              </div>
            </div>

            <div className="space-y-1 text-sm">
              {company.registration_number && (
                <p>
                  Reg:{" "}
                  {
                    company.registration_number
                  }
                </p>
              )}

              {company.address && (
                <p className="whitespace-pre-line">
                  {company.address}
                </p>
              )}

              {company.phone && (
                <p>
                  {company.phone}
                </p>
              )}

              {company.email && (
                <p>
                  {company.email}
                </p>
              )}

              {branch?.branch_name && (
                <p className="pt-1 font-semibold">
                  {
                    branch.branch_name
                  }
                </p>
              )}
            </div>
          </div>

          <div className="text-right">
            <h1 className="text-5xl font-light tracking-tight">
              INVOICE
            </h1>

            <p className="mt-3 text-base font-bold">
              #{" "}
              {
                invoice.invoice_number
              }
            </p>

            <div className="ml-auto mt-4 w-[235px] text-[11px] leading-snug">
              <p className="text-xs font-semibold">
                BALANCE DUE
              </p>

              <p className="mt-1 text-2xl font-bold">
                {money(
                  Number(
                    invoice.balance_due
                  )
                )}
              </p>
            </div>

            <p className="mt-4 text-xs font-semibold text-gray-500">
              {!paid
              ? statusLabel(
                  invoice.status
                )
              : null}
            </p>
          </div>
        </div>
      </header>

      <section className="mt-8 grid grid-cols-2 gap-12">
        <div>
          <p className="text-sm font-bold">
            Bill To
          </p>

          <p className="mt-3 text-base font-bold">
            {
              customer.customer_name
            }
          </p>

          {customer.address && (
            <p className="mt-2 whitespace-pre-line text-sm">
              {
                customer.address
              }
            </p>
          )}

          {customer.phone && (
            <p className="mt-1 text-sm">
              {
                customer.phone
              }
            </p>
          )}

          {customer.email && (
            <p className="text-sm">
              {
                customer.email
              }
            </p>
          )}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-x-10 gap-y-3 text-sm">
          <span>
            Invoice Date
          </span>

          <span className="text-right">
            {
              invoice.invoice_date
            }
          </span>

          <span>
            Terms
          </span>

          <span className="text-right">
            {invoice.terms
              ? "As Agreed"
              : "Due on Receipt"}
          </span>

          <span>
            Due Date
          </span>

          <span className="text-right">
            {
              invoice.due_date ??
              invoice.invoice_date
            }
          </span>

          {invoice.customer_reference && (
            <>
              <span>
                Reference
              </span>

              <span className="text-right">
                {
                  invoice.customer_reference
                }
              </span>
            </>
          )}
        </div>
      </section>

      <section className="mt-8">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-gray-300 bg-gray-50 text-black">
              <th className="w-12 px-4 py-3 text-left">
                #
              </th>

              <th className="px-4 py-3 text-left">
                Description
              </th>

              <th className="px-4 py-3 text-right">
                Qty
              </th>

              <th className="px-4 py-3 text-right">
                Rate
              </th>

              <th className="px-4 py-3 text-right">
                Discount
              </th>

              <th className="px-4 py-3 text-right">
                Tax
              </th>

              <th className="px-4 py-3 text-right">
                Amount
              </th>
            </tr>
          </thead>

          <tbody>
            {items.map(
              (
                item,
                index
              ) => (
                <tr
                  key={item.id}
                  className="border-b"
                >
                  <td className="px-4 py-4">
                    {index + 1}
                  </td>

                  <td className="px-4 py-4 font-medium">
                    {
                      item.description
                    }
                  </td>

                  <td className="px-4 py-4 text-right">
                    {Number(
                      item.quantity
                    )}
                  </td>

                  <td className="px-4 py-4 text-right">
                    {money(
                      Number(
                        item.unit_price
                      )
                    )}
                  </td>

                  <td className="px-4 py-4 text-right">
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
                  </td>

                  <td className="px-4 py-4 text-right">
                    {item.tax_mode ===
                    "vat"
                      ? `VAT ${Number(
                          item.tax_rate
                        )}%`
                      : "No Tax"}
                  </td>

                  <td className="px-4 py-4 text-right font-semibold">
                    {money(
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

      <section className="mt-8 flex justify-end">
        <div className="w-full max-w-md">

          <div className="grid grid-cols-[1fr_auto] gap-x-6 py-1.5">
            <span>
              Subtotal
            </span>

            <span>
              {money(
                Number(
                  invoice.subtotal
                )
              )}
            </span>
          </div>

          {Number(
            invoice.discount_amount
          ) > 0 && (
            <div className="grid grid-cols-[1fr_auto] gap-x-6 py-1.5">
              <span>
                Discount
              </span>

              <span>
                -
                {money(
                  Number(
                    invoice.discount_amount
                  )
                )}
              </span>
            </div>
          )}

          {Number(
            invoice.tax_amount
          ) > 0 && (
            <div className="grid grid-cols-[1fr_auto] gap-x-6 py-1.5">
              <span>
                VAT / Tax
              </span>

              <span>
                {money(
                  Number(
                    invoice.tax_amount
                  )
                )}
              </span>
            </div>
          )}

          <div className="grid grid-cols-[1fr_auto] gap-x-6 border-t py-1.5 font-semibold">
            <span>
              Total
            </span>

            <span>
              {money(
                Number(
                  invoice.total_amount
                )
              )}
            </span>
          </div>

          {Number(
            invoice.amount_paid
          ) > 0 && (
            <div className="grid grid-cols-[1fr_auto] gap-x-6 py-1.5">
              <span>
                Payments Made
              </span>

              <span>
                -
                {money(
                  Number(
                    invoice.amount_paid
                  )
                )}
              </span>
            </div>
          )}

          <div className="mt-1 grid grid-cols-[1fr_auto] gap-x-6 border-t px-0 py-2 text-xs font-black">
            <span>
              Balance Due
            </span>

            <span>
              {money(
                Number(
                  invoice.balance_due
                )
              )}
            </span>
          </div>
        </div>
      </section>

      {payments.length > 0 &&
        (!paid || isPaymentPlanInvoice) && (
        <section className="mt-10 border-t pt-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold">
                Payment History
              </h3>

              <p className="mt-1 text-xs text-gray-500">
                {payments.length} payment
                {payments.length === 1
                  ? ""
                  : "s"}{" "}
                recorded
              </p>
            </div>

            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                Total Paid
              </p>

              <p className="font-bold">
                {money(
                  Number(
                    invoice.amount_paid
                  )
                )}
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-hidden border">
            <div className="grid grid-cols-[1.2fr_1fr_1.5fr_1fr] gap-3 bg-gray-100 px-3 py-2 text-[10px] font-bold uppercase tracking-wide">
              <span>
                Date Paid
              </span>

              <span>
                Method
              </span>

              <span>
                Reference
              </span>

              <span className="text-right">
                Amount
              </span>
            </div>

            {payments.map(
              (payment) => (
                <div
                  key={payment.id}
                  className="grid grid-cols-[1.2fr_1fr_1.5fr_1fr] gap-3 border-t px-3 py-3 text-xs"
                >
                  <span className="font-medium">
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
                  </span>

                  <span className="capitalize">
                    {
                      payment.payment_method
                    }
                  </span>

                  <span>
                    {payment.reference ||
                      "—"}
                  </span>

                  <span className="text-right font-bold">
                    {money(
                      Number(
                        payment.amount
                      )
                    )}
                  </span>
                </div>
              )
            )}
          </div>

          <div className="ml-auto mt-4 max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <span>
                Total Paid
              </span>

              <span className="font-bold">
                {money(
                  Number(
                    invoice.amount_paid
                  )
                )}
              </span>
            </div>

            <div className="flex justify-between border-t pt-2">
              <span className="font-bold">
                Balance Due
              </span>

              <span className="font-black">
                {money(
                  Number(
                    invoice.balance_due
                  )
                )}
              </span>
            </div>
          </div>
        </section>
      )}

      {compactPaidInvoice &&
        payments.length > 0 && (
        <section className="mt-6 border-t pt-4">
          <div className="flex items-center justify-between gap-6 rounded border px-4 py-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide">
                Paid in Full
              </p>

              <p className="mt-1 text-xs text-gray-500">
                Final payment:{" "}
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

            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                Amount Paid
              </p>

              <p className="text-base font-black">
                {money(
                  Number(
                    invoice.amount_paid
                  )
                )}
              </p>
            </div>

            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                Balance
              </p>

              <p className="text-base font-black">
                {money(0)}
              </p>
            </div>
          </div>
        </section>
      )}

      {invoice.notes && (
        <section className={paid ? "mt-6" : "mt-12"}>
          <h3 className="text-sm font-bold">
            Notes
          </h3>

          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">
            {
              invoice.notes
            }
          </p>
        </section>
      )}

      {invoice.terms && (
        <section className={paid ? "mt-5" : "mt-8"}>
          <h3 className="text-sm font-bold">
            Terms & Conditions
          </h3>

          <p className="mt-2 whitespace-pre-line text-xs leading-5">
            {invoice.terms}
          </p>
        </section>
      )}

      <section className={paid ? "mt-6" : "mt-10"}>
        <h3 className="text-sm font-bold">
          Warranty & Returns
        </h3>

        <p className="mt-2 text-xs leading-5">
          Goods and services are supplied subject to applicable consumer protection legislation and the seller's warranty terms. Warranty claims must be accompanied by proof of purchase. Physical or liquid damage is excluded unless otherwise stated.
        </p>
      </section>

      <section className={paid ? "mt-4" : "mt-6"}>
        {!paid && (
          <div>
            <h3 className="text-sm font-bold">
              Banking Details
            </h3>

            <div className="mt-3 space-y-1 text-xs">
              <p>
                Account Name: JINLAB
              </p>

              <p>
                Bank: Configure in Nexus Settings
              </p>

              <p>
                Reference: {
                  invoice.invoice_number
                }
              </p>
            </div>
          </div>
        )}


      </section>



      <footer className="mt-12 border-t pt-4 text-center text-xs text-gray-500">
        <p>
          Thank you for your business.
        </p>

        <p className="mt-1">
          Generated by JINLAB Nexus
        </p>
      </footer>
    </article>
  );
}
