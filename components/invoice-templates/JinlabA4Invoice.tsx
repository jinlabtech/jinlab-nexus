"use client";

import type { Invoice, InvoiceItem } from "@/lib/services/invoiceService";
import type { InvoicePayment } from "@/lib/services/paymentService";
import type { InvoicePaymentPlan } from "@/lib/services/paymentPlanService";

import type {
  BankAccountInfo,
  BranchInfo,
  CompanyInfo,
  CustomerInfo,
} from "@/components/invoice-templates/InvoiceTemplateRenderer";

type Props = {
  invoice: Invoice;
  items: InvoiceItem[];
  company: CompanyInfo;
  customer: CustomerInfo;
  branch: BranchInfo | null;
  payments?: InvoicePayment[];
  paymentPlan?: InvoicePaymentPlan | null;
  bankAccounts?: BankAccountInfo[];
  paymentTermsLabel?: string;
};

function money(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value?: string | null) {
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

function statusLabel(value: string) {
  return value.replaceAll("_", " ").toUpperCase();
}

function displayDiscount(item: InvoiceItem) {
  if (Number(item.line_discount) <= 0) return "—";

  if (item.discount_mode === "percentage") {
    return `${Number(item.discount_value)}%`;
  }

  return money(Number(item.line_discount));
}

export default function JinlabA4Invoice({
  invoice,
  items,
  company,
  customer,
  branch,
  payments = [],
  paymentPlan = null,
  bankAccounts = [],
  paymentTermsLabel = "",
}: Props) {
  const paid = Number(invoice.balance_due) <= 0;

  const paymentPlanInvoice =
    paymentPlan?.plan_type === "layby" ||
    paymentPlan?.plan_type === "instalment" ||
    paymentPlan?.plan_type === "account";

  const sortedPayments = [...payments].sort(
    (a, b) =>
      b.payment_date.localeCompare(a.payment_date) ||
      b.created_at.localeCompare(a.created_at)
  );

  const finalPaymentDate = sortedPayments[0]?.payment_date ?? null;

  const companyName = company.document_display_name || company.company_name;

  const isJinlabCompany =
    company.company_name.trim().toUpperCase() === "JINLAB" ||
    companyName.trim().toUpperCase() === "JINLAB";

  const showRegistration =
    company.show_registration_number !== false &&
    Boolean(company.registration_number);

  const showVat =
    company.show_vat_number !== false && Boolean(company.vat_number);

  const showAddress =
    company.show_company_address !== false && Boolean(company.address);

  const showPhone =
    company.show_company_phone !== false && Boolean(company.phone);

  const showEmail =
    company.show_company_email !== false && Boolean(company.email);

  const showWebsite =
    company.show_company_website === true && Boolean(company.website);

  const footerText =
    company.invoice_footer ||
    company.document_footer ||
    "Thank you for your business.";

  const visibleBankAccounts = bankAccounts.filter(
    (account) =>
      Boolean(account.bank_name && account.account_name && account.account_number)
  );

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

          .jinlab-a4-invoice {
            width: 190mm !important;
            max-width: 190mm !important;
            min-height: 277mm !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
          }

          .jinlab-a4-invoice thead {
            display: table-header-group;
          }

          .jinlab-a4-invoice tr,
          .jinlab-a4-invoice .avoid-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .jinlab-a4-invoice * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <article className="jinlab-a4-invoice mx-auto flex min-h-[297mm] w-[210mm] flex-col bg-white p-[10mm] text-black shadow-sm print:shadow-none">
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
                {showRegistration && <p>Registration: {company.registration_number}</p>}
                {showAddress && <p>{company.address}</p>}
                {showPhone && <p>{company.phone}</p>}
                {showEmail && <p>{company.email}</p>}
              </div>

              <div className="mt-[4mm] flex items-start justify-between gap-[8mm]">
                <div className="text-[8pt] leading-[1.4] text-gray-600">
                  {branch?.branch_name && (
                    <p className="font-semibold text-black">
                      Branch: {branch.branch_name}
                    </p>
                  )}
                  {showVat && <p>VAT: {company.vat_number}</p>}
                </div>

                <div className="w-[68mm] shrink-0 text-right">
                  <h1 className="text-[27pt] font-light leading-none tracking-[-0.03em]">
                    INVOICE
                  </h1>

                  <p className="mt-[2mm] text-[10pt] font-black">
                    {invoice.invoice_number}
                  </p>

                  <div className="mt-[3mm] border-y border-black py-[2mm]">
                    <p className="text-[7pt] font-bold uppercase tracking-[0.12em]">
                      Balance Due
                    </p>
                    <p className="mt-[0.8mm] text-[17pt] font-black leading-none">
                      {money(Number(invoice.balance_due))}
                    </p>
                  </div>

                  <div className="mt-[2.5mm] flex justify-end">
                    {paid ? (
                      <div className="inline-flex items-center gap-[2mm] border-2 border-black px-[3mm] py-[1.3mm] text-[8pt] font-black uppercase tracking-[0.12em]">
                        PAID
                        <span className="font-semibold tracking-normal">
                          {formatDate(finalPaymentDate || invoice.invoice_date)}
                        </span>
                      </div>
                    ) : (
                      <p className="text-[8pt] font-bold uppercase tracking-[0.1em]">
                        {statusLabel(invoice.status)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-start justify-between gap-[10mm]">
              <div className="min-w-0 flex-1">
                {company.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={company.logo_url}
                    alt={`${companyName} logo`}
                    className="mb-[3mm] max-h-[18mm] max-w-[48mm] object-contain object-left"
                  />
                ) : (
                  <div className="mb-[3mm] text-[20pt] font-black tracking-[0.16em]">
                    {companyName}
                  </div>
                )}

                {company.logo_url && (
                  <p className="text-[13pt] font-black tracking-[0.08em]">
                    {companyName}
                  </p>
                )}

                <div className="mt-[2.5mm] space-y-[0.7mm] text-[8.5pt] leading-[1.35]">
                  {showRegistration && <p>Reg: {company.registration_number}</p>}
                  {showVat && <p>VAT: {company.vat_number}</p>}
                  {showAddress && (
                    <p className="whitespace-pre-line">{company.address}</p>
                  )}
                  {showPhone && <p>{company.phone}</p>}
                  {showEmail && <p>{company.email}</p>}
                  {showWebsite && <p>{company.website}</p>}
                  {branch?.branch_name && (
                    <p className="pt-[0.8mm] font-semibold">
                      Branch: {branch.branch_name}
                    </p>
                  )}
                </div>
              </div>

              <div className="w-[62mm] shrink-0 text-right">
                <h1 className="text-[28pt] font-light leading-none tracking-[-0.03em]">
                  INVOICE
                </h1>
                <p className="mt-[3mm] text-[10pt] font-black">
                  {invoice.invoice_number}
                </p>
                <div className="mt-[4mm] border-y border-black py-[2.5mm]">
                  <p className="text-[7.5pt] font-bold uppercase tracking-[0.12em]">
                    Balance Due
                  </p>
                  <p className="mt-[1mm] text-[18pt] font-black leading-none">
                    {money(Number(invoice.balance_due))}
                  </p>
                </div>
                <div className="mt-[3mm] flex justify-end">
                  {paid ? (
                    <div className="inline-flex items-center gap-[2mm] border-2 border-black px-[3mm] py-[1.5mm] text-[8pt] font-black uppercase tracking-[0.12em]">
                      PAID
                      <span className="font-semibold tracking-normal">
                        {formatDate(finalPaymentDate || invoice.invoice_date)}
                      </span>
                    </div>
                  ) : (
                    <p className="text-[8pt] font-bold uppercase tracking-[0.1em]">
                      {statusLabel(invoice.status)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </header>

        <section className="avoid-break mt-[6mm] grid grid-cols-[1.2fr_1fr] gap-[10mm]">
          <div>
            <p className="text-[7.5pt] font-black uppercase tracking-[0.12em]">
              Bill To
            </p>

            <p className="mt-[2mm] text-[11pt] font-black leading-tight">
              {customer.customer_name}
            </p>

            <div className="mt-[1.5mm] space-y-[0.7mm] text-[8.5pt] leading-[1.35]">
              {customer.address && (
                <p className="whitespace-pre-line">{customer.address}</p>
              )}
              {customer.phone && <p>{customer.phone}</p>}
              {customer.email && <p>{customer.email}</p>}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto] content-start gap-x-[5mm] gap-y-[1.6mm] text-[8.5pt]">
            <span className="text-gray-600">Invoice Date</span>
            <span className="text-right font-semibold">
              {formatDate(invoice.invoice_date)}
            </span>

            <span className="text-gray-600">Payment Terms</span>
            <span className="max-w-[35mm] text-right font-semibold">
              {paymentTermsLabel || "As Agreed"}
            </span>

            <span className="text-gray-600">Due Date</span>
            <span className="text-right font-semibold">
              {formatDate(invoice.due_date || invoice.invoice_date)}
            </span>

            {invoice.customer_reference && (
              <>
                <span className="text-gray-600">Reference</span>
                <span className="max-w-[35mm] break-words text-right font-semibold">
                  {invoice.customer_reference}
                </span>
              </>
            )}
          </div>
        </section>

        <section className="mt-[7mm]">
          <table className="w-full table-fixed border-collapse text-[8pt] leading-[1.3]">
            <colgroup>
              <col className="w-[7mm]" />
              <col />
              <col className="w-[13mm]" />
              <col className="w-[27mm]" />
              <col className="w-[22mm]" />
              <col className="w-[18mm]" />
              <col className="w-[29mm]" />
            </colgroup>

            <thead>
              <tr className="border-y border-black bg-gray-100">
                <th className="px-[1.5mm] py-[2.3mm] text-left">#</th>
                <th className="px-[1.5mm] py-[2.3mm] text-left">
                  Description
                </th>
                <th className="px-[1.5mm] py-[2.3mm] text-right">Qty</th>
                <th className="px-[1.5mm] py-[2.3mm] text-right">Rate</th>
                <th className="px-[1.5mm] py-[2.3mm] text-right">Disc.</th>
                <th className="px-[1.5mm] py-[2.3mm] text-right">Tax</th>
                <th className="px-[1.5mm] py-[2.3mm] text-right">Amount</th>
              </tr>
            </thead>

            <tbody>
              {items.map((item, index) => (
                <tr
                  key={item.id}
                  className="border-b border-gray-300 align-top"
                >
                  <td className="px-[1.5mm] py-[2.4mm]">{index + 1}</td>

                  <td className="break-words px-[1.5mm] py-[2.4mm] font-medium">
                    {item.description}
                  </td>

                  <td className="px-[1.5mm] py-[2.4mm] text-right">
                    {Number(item.quantity)}
                  </td>

                  <td className="px-[1.5mm] py-[2.4mm] text-right tabular-nums">
                    {money(Number(item.unit_price))}
                  </td>

                  <td className="px-[1.5mm] py-[2.4mm] text-right">
                    {displayDiscount(item)}
                  </td>

                  <td className="px-[1.5mm] py-[2.4mm] text-right">
                    {item.tax_mode === "vat"
                      ? `${Number(item.tax_rate)}%`
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
              <span className="tabular-nums">
                {money(Number(invoice.subtotal))}
              </span>
            </div>

            {Number(invoice.discount_amount) > 0 && (
              <div className="grid grid-cols-[1fr_auto] gap-x-[5mm] py-[1mm]">
                <span>Discount</span>
                <span className="tabular-nums">
                  -{money(Number(invoice.discount_amount))}
                </span>
              </div>
            )}

            {Number(invoice.tax_amount) > 0 && (
              <div className="grid grid-cols-[1fr_auto] gap-x-[5mm] py-[1mm]">
                <span>VAT / Tax</span>
                <span className="tabular-nums">
                  {money(Number(invoice.tax_amount))}
                </span>
              </div>
            )}

            <div className="mt-[1mm] grid grid-cols-[1fr_auto] gap-x-[5mm] border-t border-black py-[1.5mm] font-bold">
              <span>Total</span>
              <span className="tabular-nums">
                {money(Number(invoice.total_amount))}
              </span>
            </div>

            {Number(invoice.amount_paid) > 0 && (
              <div className="grid grid-cols-[1fr_auto] gap-x-[5mm] py-[1mm]">
                <span>Payments</span>
                <span className="tabular-nums">
                  -{money(Number(invoice.amount_paid))}
                </span>
              </div>
            )}

            <div className="mt-[1mm] grid grid-cols-[1fr_auto] gap-x-[5mm] border-y-2 border-black py-[1.8mm] text-[10pt] font-black">
              <span>Balance Due</span>
              <span className="tabular-nums">
                {money(Number(invoice.balance_due))}
              </span>
            </div>
          </div>
        </section>

        {payments.length > 0 && (!paid || paymentPlanInvoice) && (
          <section className="avoid-break mt-[6mm] border-t pt-[4mm]">
            <div className="flex items-end justify-between gap-[4mm]">
              <div>
                <h3 className="text-[8pt] font-black uppercase tracking-[0.1em]">
                  Payment History
                </h3>
                <p className="mt-[0.8mm] text-[7.5pt] text-gray-500">
                  {payments.length} payment{payments.length === 1 ? "" : "s"} recorded
                </p>
              </div>

              <p className="text-[8.5pt] font-black">
                Total Paid: {money(Number(invoice.amount_paid))}
              </p>
            </div>

            <div className="mt-[2.5mm] border">
              <div className="grid grid-cols-[1.1fr_0.8fr_1.5fr_1fr] gap-[2mm] bg-gray-100 px-[2mm] py-[1.5mm] text-[7pt] font-bold uppercase tracking-wide">
                <span>Date</span>
                <span>Method</span>
                <span>Reference</span>
                <span className="text-right">Amount</span>
              </div>

              {sortedPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="grid grid-cols-[1.1fr_0.8fr_1.5fr_1fr] gap-[2mm] border-t px-[2mm] py-[1.5mm] text-[7.5pt]"
                >
                  <span>{formatDate(payment.payment_date)}</span>
                  <span className="capitalize">{payment.payment_method}</span>
                  <span className="break-words">
                    {payment.reference || "—"}
                  </span>
                  <span className="text-right font-bold tabular-nums">
                    {money(Number(payment.amount))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {paid && payments.length > 0 && !paymentPlanInvoice && (
          <section className="avoid-break mt-[5mm] border-t pt-[3mm]">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-[6mm] text-[8pt]">
              <div>
                <p className="font-black uppercase tracking-[0.1em]">
                  Paid in Full
                </p>
                <p className="mt-[0.8mm] text-gray-500">
                  Final payment: {formatDate(finalPaymentDate)}
                </p>
              </div>

              <div className="text-right">
                <p className="text-[7pt] uppercase text-gray-500">
                  Amount Paid
                </p>
                <p className="font-black">
                  {money(Number(invoice.amount_paid))}
                </p>
              </div>

              <div className="text-right">
                <p className="text-[7pt] uppercase text-gray-500">Balance</p>
                <p className="font-black">{money(0)}</p>
              </div>
            </div>
          </section>
        )}

        {(invoice.notes || invoice.terms) && (
          <section className="mt-[6mm] grid gap-[6mm] md:grid-cols-2 print:grid-cols-2">
            {invoice.notes && (
              <div className="avoid-break">
                <h3 className="text-[7.5pt] font-black uppercase tracking-[0.1em]">
                  Notes
                </h3>
                <p className="mt-[1.5mm] whitespace-pre-line text-[7.5pt] leading-[1.45]">
                  {invoice.notes}
                </p>
              </div>
            )}

            {invoice.terms && (
              <div className="avoid-break">
                <h3 className="text-[7.5pt] font-black uppercase tracking-[0.1em]">
                  Terms & Conditions
                </h3>
                <p className="mt-[1.5mm] whitespace-pre-line text-[7.3pt] leading-[1.45]">
                  {invoice.terms}
                </p>
              </div>
            )}
          </section>
        )}

        {!paid && visibleBankAccounts.length > 0 && (
          <section className="avoid-break mt-[6mm] border-t pt-[3.5mm]">
            <h3 className="text-[7.5pt] font-black uppercase tracking-[0.1em]">
              Banking Details
            </h3>

            <div className="mt-[2mm] grid gap-[3mm] sm:grid-cols-2 print:grid-cols-2">
              {visibleBankAccounts.map((account, index) => (
                <div
                  key={`${account.bank_name}-${account.account_number}-${index}`}
                  className="text-[7.5pt] leading-[1.45]"
                >
                  <p className="font-black">
                    {account.bank_name}
                    {account.is_default ? " · Default" : ""}
                  </p>
                  <p>Account: {account.account_name}</p>
                  <p>Number: {account.account_number}</p>
                  {account.account_type && <p>Type: {account.account_type}</p>}
                  {account.branch_code && <p>Branch: {account.branch_code}</p>}
                  {account.swift_code && <p>SWIFT: {account.swift_code}</p>}
                  <p>Reference: {invoice.invoice_number}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="avoid-break mt-auto pt-[7mm]">
          <div className="border-t border-gray-400 pt-[3mm] text-center text-[7pt] leading-[1.4] text-gray-600">
            <p className="whitespace-pre-line">{footerText}</p>
            <p className="mt-[1mm] font-semibold">Generated by JINLAB Nexus</p>
          </div>
        </footer>
      </article>
    </>
  );
}
