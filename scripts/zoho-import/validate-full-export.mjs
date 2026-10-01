import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

const DATA = path.resolve("scripts/zoho-import/data");

function readCsv(filename) {
  const filepath = path.join(DATA, filename);

  if (!fs.existsSync(filepath)) {
    throw new Error(`Missing file: ${filepath}`);
  }

  return parse(fs.readFileSync(filepath, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  });
}

function num(value) {
  if (value === null || value === undefined || value === "") return 0;

  const cleaned = String(value)
    .replace(/[A-Za-z]/g, "")
    .replace(/,/g, "")
    .trim();

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

const contacts = readCsv("Contacts.csv");
const items = readCsv("Item.csv");
const invoiceRows = readCsv("Invoice.csv");
const payments = readCsv("Customer_Payment.csv");

const invoices = new Map();

for (const row of invoiceRows) {
  const id = String(row["Invoice ID"] || "").trim();

  if (!id) continue;

  if (!invoices.has(id)) {
    invoices.set(id, {
      id,
      number: row["Invoice Number"],
      customerId: String(row["Customer ID"] || "").trim(),
      total: num(row["Total"]),
      balance: num(row["Balance"]),
      status: row["Invoice Status"],
      lines: [],
    });
  }

  invoices.get(id).lines.push(row);
}

const invoiceList = [...invoices.values()];

const contactIds = new Set(
  contacts
    .map(r => String(r["Customer ID"] || "").trim())
    .filter(Boolean)
);

const invoiceNumbers = new Set(
  invoiceList
    .map(r => String(r.number || "").trim())
    .filter(Boolean)
);

const missingInvoiceCustomers = invoiceList.filter(
  inv => inv.customerId && !contactIds.has(inv.customerId)
);

let paymentTotal = 0;
let paymentApplied = 0;
let paymentUnused = 0;

const missingPaymentInvoices = [];
const paymentModeCounts = {};

for (const row of payments) {
  const mode = String(row["Mode"] || "Unknown").trim();
  paymentModeCounts[mode] = (paymentModeCounts[mode] || 0) + 1;

  paymentTotal += num(row["Amount"]);

  const applied =
    num(row["Amount Applied to Invoice"]) ||
    num(row["Amount Applied"]);

  paymentApplied += applied;

  const unused =
    num(row["Unused Amount"]) ||
    num(row["Unused Amount in Base Currency"]);

  paymentUnused += unused;

  const invoiceNumber = String(row["Invoice Number"] || "").trim();

  if (invoiceNumber && !invoiceNumbers.has(invoiceNumber)) {
    missingPaymentInvoices.push(invoiceNumber);
  }
}

const invoiceTotal = invoiceList.reduce(
  (sum, inv) => sum + inv.total,
  0
);

const invoiceBalance = invoiceList.reduce(
  (sum, inv) => sum + inv.balance,
  0
);

const expectedPaid = invoiceTotal - invoiceBalance;

console.log("");
console.log("======================================================");
console.log(" JINLAB NEXUS — FULL ZOHO EXPORT VALIDATION");
console.log("======================================================");
console.log("");

console.log(`Contacts:                     ${contacts.length}`);
console.log(`Items:                        ${items.length}`);
console.log(`Unique invoices:              ${invoiceList.length}`);
console.log(`Invoice line items:           ${invoiceRows.length}`);
console.log(`Payment records:              ${payments.length}`);
console.log("");

console.log(`Invoice total:                R ${invoiceTotal.toFixed(2)}`);
console.log(`Invoice outstanding:          R ${invoiceBalance.toFixed(2)}`);
console.log(`Expected paid from invoices:  R ${expectedPaid.toFixed(2)}`);
console.log("");

console.log(`Payment export total:         R ${paymentTotal.toFixed(2)}`);
console.log(`Applied to invoices:          R ${paymentApplied.toFixed(2)}`);
console.log(`Unused/unapplied:             R ${paymentUnused.toFixed(2)}`);
console.log("");

console.log(`Missing invoice customers:    ${missingInvoiceCustomers.length}`);
console.log(`Missing payment invoices:     ${missingPaymentInvoices.length}`);
console.log("");

console.log("PAYMENT MODES");
console.log(paymentModeCounts);
console.log("");

const difference = Math.abs(expectedPaid - paymentApplied);

console.log(
  `Invoice/payment reconciliation difference: R ${difference.toFixed(2)}`
);

if (difference < 0.01) {
  console.log("STATUS: PASS — payments reconcile with invoices.");
} else {
  console.log("STATUS: REVIEW REQUIRED — totals do not reconcile.");
}

if (missingInvoiceCustomers.length) {
  console.log("");
  console.log("Missing customer IDs:");
  console.log(
    missingInvoiceCustomers.map(x => ({
      invoice: x.number,
      customerId: x.customerId,
    }))
  );
}

if (missingPaymentInvoices.length) {
  console.log("");
  console.log("Payment invoice numbers not found:");
  console.log([...new Set(missingPaymentInvoices)]);
}

const report = {
  generatedAt: new Date().toISOString(),
  counts: {
    contacts: contacts.length,
    items: items.length,
    uniqueInvoices: invoiceList.length,
    invoiceLines: invoiceRows.length,
    payments: payments.length,
  },
  money: {
    invoiceTotal,
    invoiceBalance,
    expectedPaid,
    paymentTotal,
    paymentApplied,
    paymentUnused,
    reconciliationDifference: difference,
  },
  paymentModes: paymentModeCounts,
  missingInvoiceCustomers,
  missingPaymentInvoices: [...new Set(missingPaymentInvoices)],
};

fs.writeFileSync(
  "scripts/zoho-import/reports/full-validation.json",
  JSON.stringify(report, null, 2)
);

console.log("");
console.log("No database records were changed.");
console.log(
  "Report: scripts/zoho-import/reports/full-validation.json"
);
console.log("");
