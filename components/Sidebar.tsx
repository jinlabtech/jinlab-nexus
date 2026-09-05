"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { usePermissions } from "@/hooks/usePermissions";
import type { PermissionName } from "@/types/permissions";

type NavigationItem = {
  name: string;
  href: string;
  permission: PermissionName;
};

const navigationItems: NavigationItem[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    permission: "dashboard.view",
  },
  {
    name: "Companies",
    href: "/companies",
    permission: "company.view",
  },
  {
    name: "Branches",
    href: "/branches",
    permission: "branch.view",
  },
  {
  name: "Inventory",
  href: "/inventory",
  permission: "inventory.view",
},
  {
    name: "Purchasing",
    href: "/purchasing",
    permission: "purchasing.view",
  },
  {
    name: "Customers",
    href: "/customers",
    permission: "customer.view",
  },
  {
    name: "Quotations",
    href: "/quotations",
    permission: "quotation.view",
  },
  {
    name: "Sales",
    href: "/sales",
    permission: "sales.view",
  },
  {
    name: "Invoices",
    href: "/invoices",
    permission: "invoice.view",
  },
  {
    name: "Accounting",
    href: "/accounting",
    permission: "accounting.view",
  },
  {
    name: "Users",
    href: "/users",
    permission: "user.view",
  },
  {
    name: "Settings",
    href: "/settings",
    permission: "settings.view",
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  const {
    can,
    loading,
    errorMessage,
  } = usePermissions();

  const visibleNavigationItems =
    navigationItems.filter((item) =>
      can(item.permission)
    );

  return (
    <aside className="w-full border-b bg-sidebar text-sidebar-foreground md:min-h-screen md:w-64 md:border-b-0 md:border-r">
      <div className="flex h-20 items-center border-b px-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            JINLAB Nexus
          </h2>

          <p className="text-xs text-muted-foreground">
            Business operating system
          </p>
        </div>
      </div>

      <nav className="flex gap-2 overflow-x-auto p-4 md:flex-col md:overflow-visible">
        {loading ? (
          <div className="px-4 py-3 text-sm text-muted-foreground">
            Loading navigation...
          </div>
        ) : errorMessage ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
            Navigation permissions could not be loaded.
          </div>
        ) : visibleNavigationItems.length === 0 ? (
          <div className="px-4 py-3 text-sm text-muted-foreground">
            No modules available.
          </div>
        ) : (
          visibleNavigationItems.map((item) => {
            const isActive =
              pathname === item.href ||
              pathname.startsWith(
                `${item.href}/`
              );

            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  isActive
                    ? "whitespace-nowrap rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
                    : "whitespace-nowrap rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }
              >
                {item.name}
              </Link>
            );
          })
        )}
      </nav>

      <div className="mt-auto hidden border-t p-4 md:block">
        <p className="text-xs text-muted-foreground">
          JINLAB Nexus
        </p>

        <p className="mt-1 text-xs text-muted-foreground">
          Alpha Platform
        </p>
      </div>
    </aside>
  );
}