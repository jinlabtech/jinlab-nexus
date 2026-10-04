"use client";

import type { Invoice, InvoiceItem } from "@/lib/services/invoiceService";
import type { InvoicePayment } from "@/lib/services/paymentService";
import type { InvoicePaymentPlan } from "@/lib/services/paymentPlanService";
import type { BankAccountInfo, BranchInfo, CompanyInfo, CustomerInfo } from "./InvoiceTemplateRenderer";

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

const warranty = "All devices are sold with a warranty as per the Consumer Protection Act. If this Device is defective within 6 months of purchase, the customer may return it for repair, replacement, or refund, subject to CPA provisions. Warranty does not cover accidental or liquid damage. Where Apple manufacturer warranty applies, the customer must present this invoice and the device IMEI/serial number.";
const standardTerms = [
  "Proof of purchase (this invoice) must be kept for warranty claims.",
  "Devices must be checked at the time of purchase; JINLAB is not responsible for later-reported physical damages.",
  "Refunds/repairs/replacements will comply with the Consumer Protection Act.",
  "All sales are subject to stock availability and supplier terms.",
  "Customer data backup is the responsibility of the buyer before handing in any phone for repairs.",
];

function amount(value: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(value || 0)).replace(/[\u00a0\u202f]/g, " ");
}
function money(value: number) { return `R${amount(value)}`; }
function date(value?: string | null) {
  if (!value) return "-";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year.slice(-2)}`;
}

export default function JinlabA4Invoice({ invoice, items, company, customer, payments = [], paymentPlan = null, bankAccounts = [], paymentTermsLabel = "Due on Receipt" }: Props) {
  const companyName = company.document_display_name || company.company_name;
  const isJinlab = company.company_name.trim().toUpperCase() === "JINLAB";
  const logo = company.logo_url || (isJinlab ? "/branding/jinlab-invoice-logo.jpg" : null);
  const banks = bankAccounts.filter((bank) => bank.bank_name && bank.account_number);
  const showDiscount = items.some((item) => Number(item.line_discount) > 0);
  const showTax = items.some((item) => Number(item.line_tax) > 0);
  const footer = company.invoice_footer || company.document_footer;
  const showPaymentHistory = paymentPlan && payments.length > 0;

  return <>
    <style>{`
      @font-face{font-family:NexusInvoice;src:url('/fonts/open-sans-400.ttf') format('truetype');font-weight:400;font-display:swap}
      @font-face{font-family:NexusInvoice;src:url('/fonts/open-sans-700.ttf') format('truetype');font-weight:700;font-display:swap}
      @page{size:A4 portrait;margin:20mm 12.5mm 17mm 16mm}
      .jinlab-classic-invoice{box-sizing:border-box;width:210mm;min-height:297mm;margin:0 auto;padding:20mm 12.5mm 17mm 16mm;background:#fff;color:#111;font-family:NexusInvoice,'Open Sans',Arial,sans-serif;font-size:9pt;line-height:1.35;box-shadow:0 1px 8px #0001}
      .jinlab-classic-invoice *{box-sizing:border-box}
      .jinlab-classic-invoice p,.jinlab-classic-invoice h1,.jinlab-classic-invoice h2{margin:0}
      .jinlab-classic-invoice .masthead{display:flex;justify-content:space-between;gap:24pt;break-inside:avoid}
      .jinlab-classic-invoice .brand{max-width:58%}
      .jinlab-classic-invoice .logo{display:block;width:180pt;height:107pt;object-fit:contain;object-position:left center;margin:0 0 3pt}
      .jinlab-classic-invoice .company-name{font-size:10pt;font-weight:700;margin-bottom:1pt}
      .jinlab-classic-invoice .company-details{font-size:9pt;line-height:12pt;white-space:pre-line;overflow-wrap:anywhere}
      .jinlab-classic-invoice .heading{text-align:right;padding-top:3pt;min-width:150pt}
      .jinlab-classic-invoice h1{font-size:28pt;font-weight:400;line-height:1.3}
      .jinlab-classic-invoice .number{font-weight:700;margin-top:3pt}
      .jinlab-classic-invoice .balance-label{font-size:8pt;font-weight:700;margin-top:16pt}
      .jinlab-classic-invoice .balance-amount{font-size:12pt;font-weight:700;margin-top:2pt}
      .jinlab-classic-invoice .status{font-weight:700;margin-top:10pt}
      .jinlab-classic-invoice .billing{display:flex;align-items:flex-end;justify-content:space-between;gap:24pt;margin-top:28pt;break-inside:avoid}
      .jinlab-classic-invoice .customer{max-width:52%;white-space:pre-line;overflow-wrap:anywhere}
      .jinlab-classic-invoice .customer strong{font-weight:700}
      .jinlab-classic-invoice .customer-details{font-size:8pt;margin-top:3pt}
      .jinlab-classic-invoice .dates{display:grid;grid-template-columns:1fr auto;gap:10pt 35pt;font-size:10pt;text-align:right}
      .jinlab-classic-invoice .items{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:16pt;font-size:9pt}
      .jinlab-classic-invoice .items th{background:#333;color:white;font-weight:400;text-align:right;padding:7pt 7pt}
      .jinlab-classic-invoice .items td{padding:8pt 7pt;border-bottom:1px solid #aaa;text-align:right;vertical-align:top;overflow-wrap:anywhere}
      .jinlab-classic-invoice .items .description{text-align:left;white-space:pre-line}
      .jinlab-classic-invoice .items .index{text-align:center;width:32pt}
      .jinlab-classic-invoice .items .quantity{width:48pt}
      .jinlab-classic-invoice .items .rate{width:68pt}
      .jinlab-classic-invoice .items .amount{width:78pt}
      .jinlab-classic-invoice .items .adjustment{width:48pt}
      .jinlab-classic-invoice thead{display:table-header-group}
      .jinlab-classic-invoice tr{break-inside:avoid}
      .jinlab-classic-invoice .totals{width:50%;margin-left:auto;margin-top:1pt;break-inside:avoid}
      .jinlab-classic-invoice .total-row{display:grid;grid-template-columns:1fr 95pt;gap:10pt;text-align:right;align-items:center;padding:8pt 7pt;min-height:27pt}
      .jinlab-classic-invoice .paid-amount{color:#e33}
      .jinlab-classic-invoice .due{background:#f0f1f2;font-weight:700;min-height:31pt}
      .jinlab-classic-invoice .document-notes{margin-top:54pt;font-size:8pt;line-height:10.6pt}
      .jinlab-classic-invoice .document-notes h2{font-size:8pt;font-weight:400}
      .jinlab-classic-invoice .notes-text{white-space:pre-line;overflow-wrap:anywhere}
      .jinlab-classic-invoice .banks{margin-top:10pt;font-size:9pt;line-height:12pt}
      .jinlab-classic-invoice .bank{break-inside:avoid;margin-bottom:5pt}
      .jinlab-classic-invoice .conditions{margin-top:45pt;font-size:8pt;line-height:10.6pt;white-space:pre-line;overflow-wrap:anywhere}
      .jinlab-classic-invoice .conditions ol{list-style:decimal;margin:0;padding-left:12pt}
      .jinlab-classic-invoice .conditions li{padding-left:0;break-inside:avoid}
      .jinlab-classic-invoice .signatures{display:flex;gap:36pt;margin-top:35pt;font-size:10pt;break-inside:avoid}
      .jinlab-classic-invoice .signature{width:150pt;border-top:1px solid #222;padding-top:4pt}
      .jinlab-classic-invoice .history{margin-top:20pt;font-size:8pt;break-inside:avoid}
      .jinlab-classic-invoice .history-row{display:flex;justify-content:space-between;gap:10pt;padding:4pt 0;border-bottom:1px solid #ddd}
      .jinlab-classic-invoice .footer{margin-top:24pt;white-space:pre-line;font-size:8pt;break-inside:avoid}
      @media print{
        html,body{margin:0!important;padding:0!important;background:#fff!important}
        .jinlab-classic-invoice{width:100%!important;min-height:0!important;margin:0!important;padding:0!important;box-shadow:none!important}
        .jinlab-classic-invoice *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      }
    `}</style>
    <article className="nexus-document jinlab-classic-invoice" aria-label={`Invoice ${invoice.invoice_number}`}>
      <header className="masthead">
        <div className="brand">
          {logo && <img className="logo" src={logo} alt={`${companyName} logo`} /* eslint-disable-line @next/next/no-img-element */ />}
          <p className="company-name">{companyName}</p>
          <div className="company-details">
            {company.show_company_address !== false && company.address && <p>{company.address}</p>}
            {company.show_company_phone !== false && company.phone && <p>{company.phone}</p>}
            {company.show_company_email !== false && company.email && <p>{company.email}</p>}
            {company.show_company_website && company.website && <p>{company.website}</p>}
            {company.show_registration_number !== false && company.registration_number && <p>Reg: {company.registration_number}</p>}
            {company.show_vat_number !== false && company.vat_number && <p>VAT: {company.vat_number}</p>}
          </div>
        </div>
        <div className="heading">
          <h1>INVOICE</h1>
          <p className="number"># {invoice.invoice_number}</p>
          <p className="balance-label">Balance Due</p>
          <p className="balance-amount">{money(invoice.balance_due)}</p>
          {(invoice.status === "draft" || invoice.status === "cancelled") && <p className="status">{invoice.status.toUpperCase()}</p>}
        </div>
      </header>
      <section className="billing">
        <div className="customer">
          <strong>{customer.customer_name}</strong>
          {(customer.address || customer.email || customer.phone) && <div className="customer-details">{[customer.address, customer.phone, customer.email].filter(Boolean).join("\n")}</div>}
        </div>
        <div className="dates">
          <span>Invoice Date :</span><span>{date(invoice.invoice_date)}</span>
          <span>Terms :</span><span>{paymentTermsLabel}</span>
          <span>Due Date :</span><span>{date(invoice.due_date || invoice.invoice_date)}</span>
          {invoice.customer_reference && <><span>Reference :</span><span>{invoice.customer_reference}</span></>}
        </div>
      </section>
      <table className="items">
        <thead><tr><th className="index">#</th><th className="description">Description</th><th className="quantity">Qty</th><th className="rate">Rate</th>{showDiscount && <th className="adjustment">Discount</th>}{showTax && <th className="adjustment">Tax</th>}<th className="amount">Amount</th></tr></thead>
        <tbody>{items.map((item, index) => <tr key={item.id}>
          <td className="index">{index + 1}</td><td className="description">{item.description}</td><td>{amount(item.quantity)}</td><td>{amount(item.unit_price)}</td>
          {showDiscount && <td>{item.discount_mode === "percentage" ? `${Number(item.discount_value)}%` : amount(item.line_discount)}</td>}
          {showTax && <td>{item.tax_mode === "vat" ? `${Number(item.tax_rate)}%` : "-"}</td>}
          <td>{amount(item.line_total)}</td>
        </tr>)}</tbody>
      </table>
      <section className="totals" aria-label="Invoice totals">
        <div className="total-row"><span>Sub Total</span><span>{amount(invoice.subtotal)}</span></div>
        {Number(invoice.discount_amount) > 0 && <div className="total-row"><span>Discount</span><span>(-) {amount(invoice.discount_amount)}</span></div>}
        {Number(invoice.tax_amount) > 0 && <div className="total-row"><span>VAT / Tax</span><span>{amount(invoice.tax_amount)}</span></div>}
        <div className="total-row"><strong>Total</strong><strong>{money(invoice.total_amount)}</strong></div>
        {Number(invoice.amount_paid) > 0 && <div className="total-row"><span>Payment Made</span><span className="paid-amount">(-) {amount(invoice.amount_paid)}</span></div>}
        <div className="total-row due"><span>Balance Due</span><span>{money(invoice.balance_due)}</span></div>
      </section>
      {(isJinlab || invoice.notes) && <section className="document-notes">
        {isJinlab && <><h2>Warranty &amp; Returns</h2><p>{warranty}</p></>}
        {invoice.notes && <p className="notes-text" style={{ marginTop: isJinlab ? "8pt" : 0 }}>{invoice.notes}</p>}
      </section>}
      {banks.length > 0 && <section className="banks" aria-label="Banking details">
        {banks.map((bank) => <div className="bank" key={`${bank.bank_name}-${bank.account_number}`}>
          <p>Bank : {bank.bank_name}{bank.account_type ? ` ${bank.account_type}` : ""}</p>
          <p>Account name : {bank.account_name}</p>
          <p>Account number : {bank.account_number}</p>
          {bank.branch_code && <p>Branch code : {bank.branch_code}</p>}
          {bank.swift_code && <p>SWIFT : {bank.swift_code}</p>}
        </div>)}
      </section>}
      {(invoice.terms || isJinlab) && <section className="conditions" aria-label="Terms and conditions">
        {invoice.terms ? <p>{invoice.terms}</p> : <ol>{standardTerms.map((term) => <li key={term}>{term}</li>)}</ol>}
      </section>}
      {showPaymentHistory && <section className="history"><strong>Payment History</strong>{payments.map((payment) => <div className="history-row" key={payment.id}><span>{date(payment.payment_date)} · {payment.payment_method} {payment.reference}</span><span>{money(payment.amount)}</span></div>)}</section>}
      {isJinlab && <section className="signatures" aria-label="Signatures"><div className="signature">Sales person</div><div className="signature">Client</div></section>}
      {footer && <footer className="footer">{footer}</footer>}
    </article>
  </>;
}
