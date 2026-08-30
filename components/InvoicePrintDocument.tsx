"use client";

import type {
  Invoice,
  InvoiceItem,
} from "@/lib/services/invoiceService";

type CompanyInfo = {
  company_name: string;
  registration_number?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
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

export default function InvoicePrintDocument({
  invoice,
  items,
  company,
  customer,
  branch,
}: Props) {
  return (
    <div className="mx-auto min-h-[297mm] max-w-[210mm] bg-white p-10 text-black print:min-h-0 print:max-w-none print:p-0">
      <header className="flex items-start justify-between gap-8 border-b-2 border-black pb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight">
            {company.company_name}
          </h1>

          {company.registration_number && (
            <p className="mt-2 text-sm">
              Registration:{" "}
              {company.registration_number}
            </p>
          )}

          {company.email && (
            <p className="text-sm">
              {company.email}
            </p>
          )}

          {company.phone && (
            <p className="text-sm">
              {company.phone}
            </p>
          )}

          {company.address && (
            <p className="mt-1 max-w-xs whitespace-pre-line text-sm">
              {company.address}
            </p>
          )}
        </div>

        <div className="text-right">
          <h2 className="text-4xl font-light uppercase tracking-widest">
            Invoice
          </h2>

          <p className="mt-3 text-lg font-bold">
            {invoice.invoice_number}
          </p>

          <p className="mt-1 text-sm uppercase">
            {invoice.status.replaceAll(
              "_",
              " "
            )}
          </p>
        </div>
      </header>

      <section className="mt-8 grid grid-cols-2 gap-10">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider">
            Bill To
          </p>

          <p className="mt-2 text-lg font-bold">
            {customer.customer_name}
          </p>

          {customer.email && (
            <p className="text-sm">
              {customer.email}
            </p>
          )}

          {customer.phone && (
            <p className="text-sm">
              {customer.phone}
            </p>
          )}

          {customer.address && (
            <p className="mt-1 whitespace-pre-line text-sm">
              {customer.address}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <span className="font-semibold">
            Invoice Date
          </span>

          <span className="text-right">
            {invoice.invoice_date}
          </span>

          <span className="font-semibold">
            Due Date
          </span>

          <span className="text-right">
            {invoice.due_date ?? "-"}
          </span>

          <span className="font-semibold">
            Branch
          </span>

          <span className="text-right">
            {branch?.branch_name ?? "-"}
          </span>

          {invoice.customer_reference && (
            <>
              <span className="font-semibold">
                Reference
              </span>

              <span className="text-right">
                {invoice.customer_reference}
              </span>
            </>
          )}
        </div>
      </section>

      <section className="mt-10">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y-2 border-black">
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
                Discount
              </th>

              <th className="py-3 text-right">
                Tax
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
                  {Number(item.quantity)}
                </td>

                <td className="py-4 text-right">
                  {money(
                    Number(
                      item.unit_price
                    )
                  )}
                </td>

                <td className="py-4 text-right">
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

                <td className="py-4 text-right">
                  {item.tax_mode === "vat"
                    ? `${Number(
                        item.tax_rate
                      )}%`
                    : "No Tax"}
                </td>

                <td className="py-4 text-right font-semibold">
                  {money(
                    Number(
                      item.line_total
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-8 flex justify-end">
        <div className="w-full max-w-sm">
          <div className="flex justify-between py-2">
            <span>Subtotal</span>

            <span>
              {money(
                Number(
                  invoice.subtotal
                )
              )}
            </span>
          </div>

          <div className="flex justify-between py-2">
            <span>Discount</span>

            <span>
              -
              {money(
                Number(
                  invoice.discount_amount
                )
              )}
            </span>
          </div>

          <div className="flex justify-between py-2">
            <span>Tax</span>

            <span>
              {money(
                Number(
                  invoice.tax_amount
                )
              )}
            </span>
          </div>

          <div className="flex justify-between border-t-2 border-black py-3 text-lg font-bold">
            <span>Total</span>

            <span>
              {money(
                Number(
                  invoice.total_amount
                )
              )}
            </span>
          </div>

          <div className="flex justify-between py-2">
            <span>Paid</span>

            <span>
              {money(
                Number(
                  invoice.amount_paid
                )
              )}
            </span>
          </div>

          <div className="flex justify-between border-t py-3 text-lg font-black">
            <span>Balance Due</span>

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

      {invoice.notes && (
        <section className="mt-10">
          <h3 className="text-sm font-bold uppercase">
            Notes
          </h3>

          <p className="mt-2 whitespace-pre-line text-sm">
            {invoice.notes}
          </p>
        </section>
      )}

      {invoice.terms && (
        <section className="mt-6">
          <h3 className="text-sm font-bold uppercase">
            Terms & Conditions
          </h3>

          <p className="mt-2 whitespace-pre-line text-xs leading-relaxed">
            {invoice.terms}
          </p>
        </section>
      )}

      <footer className="mt-12 border-t pt-4 text-center text-xs">
        Generated by JINLAB Nexus
      </footer>
    </div>
  );
}
