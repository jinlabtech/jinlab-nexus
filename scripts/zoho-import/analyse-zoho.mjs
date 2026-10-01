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

function money(value) {
  if (value === null || value === undefined || value === "") return 0;

  const cleaned = String(value)
    .replace(/[A-Za-z]/g, "")
    .replace(/,/g, "")
    .trim();

  const number = Number(cleaned);

  return Number.isFinite(number) ? number : 0;
}

const contacts = readCsv("Contacts.csv");
const items = readCsv("Item.csv");
const invoiceRows = readCsv("Invoice.csv");

const invoiceMap = new Map();

for (const row of invoiceRows) {
  const id = String(row["Invoice ID"] || "").trim();

  if (!id) {
    console.warn("Invoice row without Invoice ID:", row["Invoice Number"]);
    continue;
  }

  if (!invoiceMap.has(id)) {
    invoiceMap.set(id, {
      invoiceId: id,
      invoiceNumber: row["Invoice Number"],
      customerId: row["Customer ID"],
      customerName: row["Customer Name"],
      invoiceDate: row["Invoice Date"],
      dueDate: row["Due Date"],
      status: row["Invoice Status"],
      subtotal: money(row["SubTotal"]),
      total: money(row["Total"]),
      balance: money(row["Balance"]),
      branchId: row["Branch ID"],
      branchName: row["Branch Name"],
      lines: [],
    });
  }

  invoiceMap.get(id).lines.push({
    itemName: row["Item Name"],
    sku: row["SKU"],
    description: row["Item Desc"],
    quantity: money(row["Quantity"]),
    unitPrice: money(row["Item Price"]),
    discount: money(row["Discount"]),
    discountAmount: money(row["Discount Amount"]),
    lineTotal: money(row["Item Total"]),
  });
}

const invoices = [...invoiceMap.values()];

const contactIds = new Set(
  contacts.map(x => String(x["Customer ID"] || "").trim()).filter(Boolean)
);

const invoiceCustomerIds = new Set(
  invoices.map(x => String(x.customerId || "").trim()).filter(Boolean)
);

const missingCustomers = [...invoiceCustomerIds].filter(
  id => !contactIds.has(id)
);

const totalZohoInvoiceValue = invoices.reduce(
  (sum, invoice) => sum + invoice.total,
  0
);

const totalBalance = invoices.reduce(
  (sum, invoice) => sum + invoice.balance,
  0
);

const totalPaid = totalZohoInvoiceValue - totalBalance;

const statusCounts = {};

for (const invoice of invoices) {
  const status = invoice.status || "Unknown";
  statusCounts[status] = (statusCounts[status] || 0) + 1;
}

console.log("");
console.log("================================================");
console.log(" JINLAB NEXUS — ZOHO MIGRATION DRY RUN");
console.log("================================================");
console.log("");
console.log(`Contacts:                ${contacts.length}`);
console.log(`Items:                   ${items.length}`);
console.log(`Invoice CSV rows:        ${invoiceRows.length}`);
console.log(`Unique invoices:         ${invoices.length}`);
console.log(`Invoice line items:      ${invoiceRows.length}`);
console.log(`Missing customers:       ${missingCustomers.length}`);
console.log("");
console.log(`Invoice total:           R ${totalZohoInvoiceValue.toFixed(2)}`);
console.log(`Outstanding balance:     R ${totalBalance.toFixed(2)}`);
console.log(`Implied historical paid: R ${totalPaid.toFixed(2)}`);
console.log("");
console.log("ZOHO INVOICE STATUSES");
console.log(statusCounts);
console.log("");

if (missingCustomers.length) {
  console.log("Customer IDs used by invoices but absent from Contacts.csv:");
  console.log(missingCustomers);
}

const report = {
  generatedAt: new Date().toISOString(),
  contacts: contacts.length,
  items: items.length,
  invoiceRows: invoiceRows.length,
  uniqueInvoices: invoices.length,
  missingCustomerIds: missingCustomers,
  invoiceTotal: totalZohoInvoiceValue,
  outstandingBalance: totalBalance,
  impliedHistoricalPaid: totalPaid,
  statuses: statusCounts,
};

fs.writeFileSync(
  "scripts/zoho-import/reports/dry-run.json",
  JSON.stringify(report, null, 2)
);

console.log("No database records were changed.");
console.log(
  "Report: scripts/zoho-import/reports/dry-run.json"
);
console.log("");
