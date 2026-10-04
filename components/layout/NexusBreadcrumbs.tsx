"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

const labels: Record<string, string> = {
  dashboard: "Dashboard",
  whatsapp: "WhatsApp",
  email: "Email",
  pos: "Point of Sale",
  sales: "Sales",
  invoices: "Invoices",
  quotations: "Quotations",
  customers: "Customers",
  inventory: "Inventory",
  purchasing: "Purchasing",
  repairs: "Repairs",
  hr: "People & HR",
  timebook: "Timebook",
  "my-schedule": "My Schedule",
  devices: "Devices",
  accounting: "Accounting",
  debtors: "Debtors",
  payables: "Payables",
  payroll: "Payroll",
  compliance: "Compliance",
  shipping: "Shipping",
  settings: "Settings",
  users: "Users",
  companies: "Companies",
  branches: "Branches",
};

function labelFor(value: string) {
  if (labels[value]) return labels[value];

  if (
    /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value) ||
    /^\d{8,}$/.test(value)
  ) {
    return "Record";
  }

  try {
    return decodeURIComponent(value)
      .replaceAll("-", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch {
    return value;
  }
}

export default function NexusBreadcrumbs() {
  const pathname = usePathname();

  const parts = pathname
    .split("/")
    .filter(Boolean);

  return (
    <nav
      aria-label="Current Nexus location"
      className="flex min-w-0 items-center gap-0.5 overflow-hidden whitespace-nowrap text-xs"
    >
      <Link
        href="/dashboard"
        className="shrink-0 font-semibold text-foreground/80 transition hover:text-primary"
      >
        Nexus
      </Link>

      {parts.map((part, index) => {
        const href =
          "/" +
          parts
            .slice(0, index + 1)
            .join("/");

        const last =
          index === parts.length - 1;

        return (
          <div
            key={href}
            className="flex min-w-0 items-center gap-0.5"
          >
            <ChevronRight className="size-3 shrink-0 text-muted-foreground/40" />

            {last ? (
              <span className="truncate font-medium text-foreground">
                {labelFor(part)}
              </span>
            ) : (
              <Link
                href={href}
                className="truncate text-muted-foreground transition hover:text-foreground"
              >
                {labelFor(part)}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
