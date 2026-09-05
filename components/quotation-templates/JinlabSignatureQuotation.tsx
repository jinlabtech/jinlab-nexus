"use client";

import type {
  Quotation,
  QuotationItem,
} from "@/types/quotation";

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
  quotation: Quotation;
  items: QuotationItem[];
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

function statusLabel(
  value: string
) {
  return value
    .replaceAll("_", " ")
    .toUpperCase();
}

function dateLabel(
  value?: string | null
) {
  if (!value) {
    return "—";
  }

  return new Date(
    `${value.slice(0, 10)}T00:00:00`
  ).toLocaleDateString(
    "en-ZA",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}

export default function JinlabSignatureQuotation({
  quotation,
  items,
  company,
  customer,
  branch,
}: Props) {
  return (
    <article className="mx-auto min-h-[297mm] max-w-[210mm] bg-white px-12 py-10 text-black print:min-h-0 print:max-w-none print:px-0 print:py-0">
      <header className="min-h-[190px]">
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
                  {company.registration_number}
                </p>
              )}

              {company.address && (
                <p className="whitespace-pre-line">
                  {company.address}
                </p>
              )}

              {company.phone && (
                <p>{company.phone}</p>
              )}

              {company.email && (
                <p>{company.email}</p>
              )}

              {branch?.branch_name && (
                <p className="pt-1 font-semibold">
                  {branch.branch_name}
                </p>
              )}
            </div>
          </div>

          <div className="text-right">
            <h1 className="text-5xl font-light tracking-tight">
              QUOTATION
            </h1>

            <p className="mt-3 text-base font-bold">
              # {quotation.quotation_number}
            </p>

            <p className="mt-4 text-xs font-semibold text-gray-500">
              {statusLabel(
                quotation.status
              )}
            </p>
          </div>
        </div>
      </header>

      <section className="mt-8 grid grid-cols-2 gap-12">
        <div>
          <p className="text-sm font-bold">
            Quote To
          </p>

          <p className="mt-3 text-base font-bold">
            {customer.customer_name}
          </p>

          {customer.address && (
            <p className="mt-2 whitespace-pre-line text-sm">
              {customer.address}
            </p>
          )}

          {customer.phone && (
            <p className="mt-1 text-sm">
              {customer.phone}
            </p>
          )}

          {customer.email && (
            <p className="mt-1 text-sm">
              {customer.email}
            </p>
          )}
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between gap-6">
            <span className="text-gray-500">
              Quotation Date
            </span>

            <span className="font-semibold">
              {dateLabel(
                quotation.quotation_date
              )}
            </span>
          </div>

          <div className="flex justify-between gap-6">
            <span className="text-gray-500">
              Valid Until
            </span>

            <span className="font-semibold">
              {dateLabel(
                quotation.valid_until
              )}
            </span>
          </div>

          {quotation.customer_reference && (
            <div className="flex justify-between gap-6">
              <span className="text-gray-500">
                Reference
              </span>

              <span className="font-semibold">
                {
                  quotation.customer_reference
                }
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="mt-10">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-gray-300 text-left">
              <th className="py-3">
                Description
              </th>

              <th className="py-3 text-right">
                Qty
              </th>

              <th className="py-3 text-right">
                Price
              </th>

              <th className="py-3 text-right">
                Discount
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
            {items.map(
              (item) => (
                <tr
                  key={item.id}
                  className="border-b border-gray-200"
                >
                  <td className="py-4 pr-4">
                    <p className="font-semibold">
                      {item.description}
                    </p>
                  </td>

                  <td className="py-4 text-right">
                    {Number(
                      item.quantity
                    ).toFixed(2)}
                  </td>

                  <td className="py-4 text-right">
                    {money(
                      Number(
                        item.unit_price
                      )
                    )}
                  </td>

                  <td className="py-4 text-right">
                    {money(
                      Number(
                        item.line_discount
                      )
                    )}
                  </td>

                  <td className="py-4 text-right">
                    {money(
                      Number(
                        item.line_tax
                      )
                    )}
                  </td>

                  <td className="py-4 text-right font-bold">
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

      <section className="mt-8 grid grid-cols-2 gap-12">
        <div>
          {quotation.notes && (
            <div>
              <p className="text-sm font-bold">
                Notes
              </p>

              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-600">
                {quotation.notes}
              </p>
            </div>
          )}

          {quotation.terms && (
            <div className="mt-6">
              <p className="text-sm font-bold">
                Terms
              </p>

              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-600">
                {quotation.terms}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>

            <span className="font-semibold">
              {money(
                Number(
                  quotation.subtotal
                )
              )}
            </span>
          </div>

          {Number(
            quotation.discount_amount
          ) > 0 && (
            <div className="flex justify-between">
              <span>
                Discount
              </span>

              <span className="font-semibold">
                -{" "}
                {money(
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
            <div className="flex justify-between">
              <span>
                VAT / Tax
              </span>

              <span className="font-semibold">
                {money(
                  Number(
                    quotation.tax_amount
                  )
                )}
              </span>
            </div>
          )}

          <div className="border-t border-gray-300 pt-4">
            <div className="flex items-end justify-between">
              <span className="font-bold">
                Total
              </span>

              <span className="text-2xl font-black">
                {money(
                  Number(
                    quotation.total_amount
                  )
                )}
              </span>
            </div>
          </div>
        </div>
      </section>

      <footer className="mt-12 border-t border-gray-200 pt-4 text-center text-[10px] text-gray-500">
        Quotation generated by JINLAB Nexus
      </footer>
    </article>
  );
}
