"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationItems = [
  {
    name: "Dashboard",
    href: "/dashboard",
  },
  {
    name: "Companies",
    href: "/companies",
  },
  {
    name: "Branches",
    href: "/branches",
  },
  {
    name: "Users",
    href: "/users",
  },
  {
    name: "Reports",
    href: "/reports",
  },
  {
    name: "Settings",
    href: "/settings",
  },
];

export default function Sidebar() {
  const pathname = usePathname();

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
        {navigationItems.map((item) => {
          const isActive = pathname === item.href;

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
        })}
      </nav>
    </aside>
  );
}
