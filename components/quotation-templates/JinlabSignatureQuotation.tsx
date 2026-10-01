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
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").toUpperCase();
}

function dateLabel(value?: string | null) {
  if (!value) return "—";

  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(
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
  const companyName = company.document_display_name || company.company_name;
  const isJinlabCompany =
    company.company_name.trim().toUpperCase() === "JINLAB" ||
    companyName.trim().toUpperCase() === "JINLAB";

  return (
    <>
      <style>{`
        @page {
          size: A4 portrait;
          margin: 10mm;
        }

        @media print {
          html, body {
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .jinlab-a4-quotation {
            width: 190mm !important;
            max-width: 190mm !important;
            min-height: 277mm !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
          }

          .jinlab-a4-quotation thead {
            display: table-header-group;
          }

          .jinlab-a4-quotation tr,
          .jinlab-a4-quotation .avoid-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .jinlab-a4-quotation * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <article className="jinlab-a4-quotation mx-auto flex min-h-[297mm] w-[210mm] flex-col bg-white p-[10mm] text-black shadow-sm print:shadow-none">
        <header className="avoid-break border-b border-black pb-[5mm]">
          {isJinlabCompany ? (
            <>
              {/* Exact JINLAB letterhead supplied by the company. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/branding/jinlab-letterhead.jpg"
                alt="JINLAB letterhead"
                className="block h-auto w-full object-contain object-left"
              />

              <div className="sr-only">
                <p>{companyName}</p>
                {company.registration_number && (
                  <p>Registration: {company.registration_number}</p>
                )}
                {company.address && <p>{company.address}</p>}
                {company.phone && <p>{company.phone}</p>}
                {company.email && <p>{company.email}</p>}
              </div>

              <div className="mt-[4mm] flex items-start justify-between gap-[8mm]">
                <div className="text-[8pt] text-gray-600">
                  {branch?.branch_name && (
                    <p className="font-semibold text-black">
                      Branch: {branch.branch_name}
                    </p>
                  )}
                </div>

                <div className="w-[70mm] shrink-0 text-right">
                  <h1 className="text-[26pt] font-light leading-none">
                    QUOTATION
                  </h1>
                  <p className="mt-[2mm] text-[10pt] font-black">
                    {quotation.quotation_number}
                  </p>
                  <p className="mt-[2mm] text-[7.5pt] font-bold uppercase tracking-[0.1em]">
                    {statusLabel(quotation.status)}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-start justify-between gap-[10mm]">
              <div className="max-w-[105mm]">
                {company.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={company.logo_url}
                    alt={`${companyName} logo`}
                    className="mb-[3mm] max-h-[18mm] max-w-[48mm] object-contain object-left"
                  />
                ) : (
                  <p className="text-[20pt] font-black">{companyName}</p>
                )}

                <div className="mt-[2mm] space-y-[0.7mm] text-[8.5pt] leading-[1.35]">
                  {company.registration_number && (
                    <p>Reg: {company.registration_number}</p>
                  )}
                  {company.address && (
                    <p className="whitespace-pre-line">{company.address}</p>
                  )}
                  {company.phone && <p>{company.phone}</p>}
                  {company.email && <p>{company.email}</p>}
                  {branch?.branch_name && <p>{branch.branch_name}</p>}
                </div>
              </div>

              <div className="w-[70mm] shrink-0 text-right">
                <h1 className="text-[26pt] font-light leading-none">
                  QUOTATION
                </h1>
                <p className="mt-[2mm] text-[10pt] font-black">
                  {quotation.quotation_number}
                </p>
                <p className="mt-[2mm] text-[7.5pt] font-bold uppercase tracking-[0.1em]">
                  {statusLabel(quotation.status)}
                </p>
              </div>
            </div>
          )}
        </header>

        <section className="avoid-break mt-[6mm] grid grid-cols-[1.2fr_1fr] gap-[10mm]">
          <div>
            <p className="text-[7.5pt] font-black uppercase tracking-[0.12em]">
              Quote To
            </p>
            <p className="mt-[2mm] text-[11pt] font-black leading-tight">
              {customer.customer_name}
            </p>
            {customer.address && (
              <p className="mt-[1.5mm] whitespace-pre-line text-[8.5pt] leading-[1.35]">
                {customer.address}
              </p>
            )}
            {customer.phone && <p className="text-[8.5pt]">{customer.phone}</p>}
            {customer.email && <p className="text-[8.5pt]">{customer.email}</p>}
          </div>

          <div className="grid grid-cols-[1fr_auto] content-start gap-x-[5mm] gap-y-[1.6mm] text-[8.5pt]">
            <span className="text-gray-600">Quotation Date</span>
            <span className="text-right font-semibold">
              {dateLabel(quotation.quotation_date)}
            </span>

            <span className="text-gray-600">Valid Until</span>
            <span className="text-right font-semibold">
              {dateLabel(quotation.valid_until)}
            </span>

            {quotation.customer_reference && (
              <>
                <span className="text-gray-600">Reference</span>
                <span className="max-w-[35mm] break-words text-right font-semibold">
                  {quotation.customer_reference}
                </span>
              </>
            )}
          </div>
        </section>

        <section className="mt-[7mm]">
          <table className="w-full table-fixed border-collapse text-[8pt] leading-[1.3]">
            <colgroup>
              <col />
              <col className="w-[14mm]" />
              <col className="w-[30mm]" />
              <col className="w-[24mm]" />
              <col className="w-[21mm]" />
              <col className="w-[31mm]" />
            </colgroup>

            <thead>
              <tr className="border-y border-black bg-gray-100">
                <th className="px-[1.5mm] py-[2.3mm] text-left">Description</th>
                <th className="px-[1.5mm] py-[2.3mm] text-right">Qty</th>
                <th className="px-[1.5mm] py-[2.3mm] text-right">Price</th>
                <th className="px-[1.5mm] py-[2.3mm] text-right">Discount</th>
                <th className="px-[1.5mm] py-[2.3mm] text-right">VAT</th>
                <th className="px-[1.5mm] py-[2.3mm] text-right">Total</th>
              </tr>
            </thead>

            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-gray-300 align-top">
                  <td className="break-words px-[1.5mm] py-[2.4mm] font-medium">
                    {item.description}
                  </td>
                  <td className="px-[1.5mm] py-[2.4mm] text-right">
                    {Number(item.quantity)}
                  </td>
                  <td className="px-[1.5mm] py-[2.4mm] text-right tabular-nums">
                    {money(Number(item.unit_price))}
                  </td>
                  <td className="px-[1.5mm] py-[2.4mm] text-right tabular-nums">
                    {Number(item.line_discount) > 0
                      ? money(Number(item.line_discount))
                      : "—"}
                  </td>
                  <td className="px-[1.5mm] py-[2.4mm] text-right tabular-nums">
                    {Number(item.line_tax) > 0
                      ? money(Number(item.line_tax))
                      : "—"}
                  </td>
                  <td className="px-[1.5mm] py-[2.4mm] text-right font-bold tabular-nums">
                    {money(Number(item.line_total))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="avoid-break mt-[6mm] flex justify-end">
          <div className="w-[72mm] text-[8.5pt]">
            <div className="grid grid-cols-[1fr_auto] gap-x-[5mm] py-[1mm]">
              <span>Subtotal</span>
              <span>{money(Number(quotation.subtotal))}</span>
            </div>

            {Number(quotation.discount_amount) > 0 && (
              <div className="grid grid-cols-[1fr_auto] gap-x-[5mm] py-[1mm]">
                <span>Discount</span>
                <span>-{money(Number(quotation.discount_amount))}</span>
              </div>
            )}

            {Number(quotation.tax_amount) > 0 && (
              <div className="grid grid-cols-[1fr_auto] gap-x-[5mm] py-[1mm]">
                <span>VAT / Tax</span>
                <span>{money(Number(quotation.tax_amount))}</span>
              </div>
            )}

            <div className="mt-[1mm] grid grid-cols-[1fr_auto] gap-x-[5mm] border-y-2 border-black py-[1.8mm] text-[10pt] font-black">
              <span>Total</span>
              <span>{money(Number(quotation.total_amount))}</span>
            </div>
          </div>
        </section>

        {(quotation.notes || quotation.terms) && (
          <section className="mt-[6mm] grid gap-[6mm] print:grid-cols-2 md:grid-cols-2">
            {quotation.notes && (
              <div className="avoid-break">
                <h3 className="text-[7.5pt] font-black uppercase tracking-[0.1em]">
                  Notes
                </h3>
                <p className="mt-[1.5mm] whitespace-pre-line text-[7.5pt] leading-[1.45]">
                  {quotation.notes}
                </p>
              </div>
            )}

            {quotation.terms && (
              <div className="avoid-break">
                <h3 className="text-[7.5pt] font-black uppercase tracking-[0.1em]">
                  Terms & Conditions
                </h3>
                <p className="mt-[1.5mm] whitespace-pre-line text-[7.3pt] leading-[1.45]">
                  {quotation.terms}
                </p>
              </div>
            )}
          </section>
        )}

        <footer className="avoid-break mt-auto pt-[7mm]">
          <div className="border-t border-gray-400 pt-[3mm] text-center text-[7pt] text-gray-600">
            <p>Quotation generated by JINLAB Nexus</p>
          </div>
        </footer>
      </article>
    </>
  );
}
