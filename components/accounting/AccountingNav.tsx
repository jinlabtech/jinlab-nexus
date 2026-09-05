"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  {
    name: "Overview",
    href: "/accounting",
  },
  {
    name: "Customers / Debtors",
    href: "/accounting/debtors",
  },
  {
    name: "Chart of Accounts",
    href: "/accounting/chart-of-accounts",
  },
  {
    name: "Journals",
    href: "/accounting/journals",
  },
  {
    name: "Exceptions",
    href: "/accounting/exceptions",
  },
  {
    name: "Financial Years",
    href: "/accounting/financial-years",
  },
];

export default function AccountingNav() {
  const pathname =
    usePathname();

  return (
    <nav className="mb-8 flex flex-wrap gap-2 border-b pb-4">
      {items.map(
        (item) => {
          const active =
            pathname ===
              item.href ||
            (
              item.href !==
                "/accounting" &&
              pathname.startsWith(
                `${item.href}/`
              )
            );

          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                active
                  ? "rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
                  : "rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
              }
            >
              {item.name}
            </Link>
          );
        }
      )}
    </nav>
  );
}
