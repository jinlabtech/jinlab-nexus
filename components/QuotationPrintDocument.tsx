"use client";

import type { Customer } from "@/types/customer";
import type {
  Quotation,
  QuotationItem,
} from "@/types/quotation";

type CompanyInfo = {
  company_name: string;
  registration_number: string | null;
  email: string | null;
  phone: string | null;
};

type BranchInfo = {
  branch_name: string;
};

type Props = {
  quotation: Quotation;
  items: QuotationItem[];
  customer: Customer;
  company: CompanyInfo;
  branch: BranchInfo | null;
};

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
  value: string | null
) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(
    "en-ZA",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  ).format(new Date(value));
}

export default function QuotationPrintDocument({
  quotation,
  items,
  customer,
  company,
  branch,
}: Props) {
  const customerAddress = [
    customer.address_line_1,
    customer.address_line_2,
    customer.city,
    customer.province,
    customer.postal_code,
    customer.country,
  ].filter(Boolean);

  return (
    <article className="quotation-page mx-auto max-w-[210mm] border bg-white p-8 text-black shadow-lg sm:p-12">
      <header className="flex items-start justify-between gap-8 border-b pb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {company.company_name}
          </h1>

          {company.registration_number && (
            <p className="mt-2 text-sm text-gray-600">
              Reg No: {company.registration_number}
            </p>
          )}

          {company.email && (
            <p className="text-sm text-gray-600">
              {company.email}
            </p>
          )}

          {company.phone && (
            <p className="text-sm text-gray-600">
              {company.phone}
            </p>
          )}

          {branch?.branch_name && (
            <p className="mt-2 text-sm font-medium">
              {branch.branch_name}
            </p>
          )}
        </div>

        <div className="text-right">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            Quotation
          </p>

          <p className="mt-2 text-2xl font-bold">
            {quotation.quotation_number}
          </p>

          <p className="mt-2 text-sm text-gray-600">
            Date: {formatDate(quotation.quotation_date)}
          </p>

          <p className="text-sm text-gray-600">
            Valid Until: {formatDate(quotation.valid_until)}
          </p>
        </div>
      </header>

      <section className="grid gap-8 border-b py-8 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Quotation To
          </p>

          <h2 className="mt-2 text-xl font-bold">
            {customer.customer_name}
          </h2>

          {customer.contact_person && (
            <p className="mt-1 text-sm">
              Att: {customer.contact_person}
            </p>
          )}

          {customer.email && (
            <p className="text-sm text-gray-600">
              {customer.email}
            </p>
          )}

          {customer.phone && (
            <p className="text-sm text-gray-600">
              {customer.phone}
            </p>
          )}

          {customerAddress.length > 0 && (
            <div className="mt-3 text-sm text-gray-600">
              {customerAddress.map(
                (line, index) => (
                  <p key={index}>
                    {line}
                  </p>
                )
              )}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Customer Details
          </p>

          <div className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">
                Customer No.
              </span>

              <span className="font-medium">
                {customer.customer_number}
              </span>
            </div>

            {quotation.customer_reference && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">
                  Reference
                </span>

                <span className="font-medium">
                  {quotation.customer_reference}
                </span>
              </div>
            )}

            {customer.vat_number && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">
                  VAT No.
                </span>

                <span className="font-medium">
                  {customer.vat_number}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>
      <section className="py-8">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="py-3 text-left">
                Description
              </th>

              <th className="py-3 text-right">
                Qty
              </th>

              <th className="py-3 text-right">
                Unit Price
              </th>

              <th className="py-3 text-right">
                Disc.
              </th>

              <th className="py-3 text-right">
                VAT
              </th>

              <th className="py-3 text-right">
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className="border-b"
              >
                <td className="py-4 pr-4">
                  {item.description}
                </td>

                <td className="py-4 text-right">
                  {Number(item.quantity).toFixed(
                    Number(item.quantity) % 1 === 0
                      ? 0
                      : 3
                  )}
                </td>

                <td className="py-4 text-right">
                  {formatCurrency(
                    Number(item.unit_price)
                  )}
                </td>

                <td className="py-4 text-right">
                  {Number(
                    item.discount_rate
                  ).toFixed(1)}
                  %
                </td>

                <td className="py-4 text-right">
                  {Number(
                    item.tax_rate
                  ).toFixed(1)}
                  %
                </td>

                <td className="py-4 text-right font-medium">
                  {formatCurrency(
                    Number(item.line_total)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex justify-end border-t pt-6">
        <div className="w-full max-w-sm">
          <div className="flex justify-between py-2">
            <span className="text-gray-600">
              Subtotal
            </span>

            <span>
              {formatCurrency(
                Number(quotation.subtotal)
              )}
            </span>
          </div>

          <div className="flex justify-between py-2">
            <span className="text-gray-600">
              Discount
            </span>

            <span>
              -
              {formatCurrency(
                Number(
                  quotation.discount_amount
                )
              )}
            </span>
          </div>

          <div className="flex justify-between py-2">
            <span className="text-gray-600">
              VAT
            </span>

            <span>
              {formatCurrency(
                Number(
                  quotation.tax_amount
                )
              )}
            </span>
          </div>

          <div className="mt-2 flex justify-between border-t-2 border-black py-4 text-xl font-bold">
            <span>Total</span>

            <span>
              {formatCurrency(
                Number(
                  quotation.total_amount
                )
              )}
            </span>
          </div>
        </div>
      </section>

      {quotation.notes && (
        <section className="mt-8 border-t pt-6">
          <h3 className="text-sm font-bold uppercase tracking-wider">
            Notes
          </h3>

          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
            {quotation.notes}
          </p>
        </section>
      )}

      {quotation.terms && (
        <section className="mt-6">
          <h3 className="text-sm font-bold uppercase tracking-wider">
            Terms & Conditions
          </h3>

          <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-gray-600">
            {quotation.terms}
          </p>
        </section>
      )}

      <footer className="mt-12 border-t pt-6 text-center text-xs text-gray-500">
        <p>
          Thank you for the opportunity to quote.
        </p>

        <p className="mt-1">
          {company.company_name}
        </p>
      </footer>
    </article>
  );
}
