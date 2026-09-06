"use client";

import {
  useEffect,
  useState,
} from "react";

import Link from "next/link";

import {
  usePathname,
} from "next/navigation";

import {
  Building2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Settings as SettingsIcon,
} from "lucide-react";

import {
  usePermissions,
} from "@/hooks/usePermissions";

import type {
  PermissionName,
} from "@/types/permissions";


type NavigationItem = {
  name: string;
  href: string;
  permission: PermissionName;
};


type NavigationGroup = {
  key: string;
  name: string;
  icon: React.ReactNode;
  items: NavigationItem[];
};


const dashboardItem: NavigationItem = {
  name: "Dashboard",
  href: "/dashboard",
  permission: "dashboard.view",
};



const settingsItem: NavigationItem = {
  name: "Settings",
  href: "/settings",
  permission: "settings.view",
};

const navigationGroups: NavigationGroup[] = [
  {
    key: "sales",
    name: "Sales",
    icon: (
      <ShoppingCart className="h-4 w-4" />
    ),
    items: [
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
        name: "Sales Orders",
        href: "/sales",
        permission: "sales.view",
      },
      {
        name: "Invoices",
        href: "/invoices",
        permission: "invoice.view",
      },

      {
        name: "Point of Sale",
        href: "/pos",
        permission: "pos.view",
      },
    ],
  },

  {
    key: "inventory",
    name: "Inventory & Purchasing",
    icon: (
      <Package className="h-4 w-4" />
    ),
    items: [
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
    ],
  },

  {
    key: "finance",
    name: "Finance",
    icon: (
      <CircleDollarSign className="h-4 w-4" />
    ),
    items: [
      {
        name: "Accounting",
        href: "/accounting",
        permission: "accounting.view",
      },
    ],
  },

  {
    key: "administration",
    name: "Administration",
    icon: (
      <Building2 className="h-4 w-4" />
    ),
    items: [
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
        name: "Users",
        href: "/users",
        permission: "user.view",
      },
    ],
  },
];


function routeIsActive(
  pathname: string,
  href: string
) {

  return (
    pathname === href ||
    pathname.startsWith(
      `${href}/`
    )
  );
}


export default function Sidebar() {

  const pathname =
    usePathname();


  const {
    can,
    loading,
    errorMessage,
  } =
    usePermissions();


  const activeGroupKey =
    navigationGroups.find(
      (
        group
      ) =>
        group.items.some(
          (
            item
          ) =>
            routeIsActive(
              pathname,
              item.href
            )
        )
    )?.key ??
    null;


  const [
    openGroups,
    setOpenGroups,
  ] =
    useState<
      Record<
        string,
        boolean
      >
    >({});


  useEffect(
    () => {

      if (
        !activeGroupKey
      ) {
        return;
      }


      setOpenGroups(
        (
          current
        ) => ({
          ...current,
          [activeGroupKey]:
            true,
        })
      );

    },
    [
      activeGroupKey,
    ]
  );


  function toggleGroup(
    key: string
  ) {

    setOpenGroups(
      (
        current
      ) => ({
        ...current,
        [key]:
          !current[key],
      })
    );
  }


  const dashboardVisible =
    can(
      dashboardItem.permission
    );


  const settingsVisible =
    can(
      settingsItem.permission
    );


  const visibleGroups =
    navigationGroups
      .map(
        (
          group
        ) => ({
          ...group,

          items:
            group.items.filter(
              (
                item
              ) =>
                can(
                  item.permission
                )
            ),
        })
      )
      .filter(
        (
          group
        ) =>
          group.items.length >
          0
      );


  return (
    <aside className="flex w-full flex-col border-b bg-sidebar text-sidebar-foreground md:min-h-screen md:w-64 md:border-b-0 md:border-r">

      <div className="flex h-20 shrink-0 items-center border-b px-6">

        <div>

          <h2 className="text-xl font-bold tracking-tight">
            JINLAB Nexus
          </h2>


          <p className="text-xs text-muted-foreground">
            Business operating system
          </p>

        </div>

      </div>


      <nav className="flex-1 space-y-2 overflow-y-auto p-3">

        {
          loading ? (

            <div className="px-4 py-3 text-sm text-muted-foreground">
              Loading navigation...
            </div>

          ) : errorMessage ? (

            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
              Navigation permissions could not be loaded.
            </div>

          ) : (

            <>

              {
                dashboardVisible && (

                  <Link
                    href={
                      dashboardItem.href
                    }
                    className={
                      routeIsActive(
                        pathname,
                        dashboardItem.href
                      )
                        ? "flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
                        : "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }
                  >

                    <LayoutDashboard className="h-4 w-4" />

                    Dashboard

                  </Link>

                )
              }


              <div className="my-3 border-t" />


              {
                visibleGroups.map(
                  (
                    group
                  ) => {

                    const isOpen =
                      Boolean(
                        openGroups[
                          group.key
                        ]
                      );


                    const groupActive =
                      group.items.some(
                        (
                          item
                        ) =>
                          routeIsActive(
                            pathname,
                            item.href
                          )
                      );


                    return (

                      <div
                        key={
                          group.key
                        }
                        className="rounded-xl"
                      >

                        <button
                          type="button"
                          onClick={() =>
                            toggleGroup(
                              group.key
                            )
                          }
                          className={
                            groupActive
                              ? "flex w-full items-center justify-between rounded-xl bg-muted/60 px-4 py-3 text-left text-sm font-semibold"
                              : "flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm font-semibold text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          }
                        >

                          <span className="flex min-w-0 items-center gap-3">

                            {
                              group.icon
                            }

                            <span className="truncate">
                              {
                                group.name
                              }
                            </span>

                          </span>


                          {
                            isOpen ? (
                              <ChevronDown className="h-4 w-4 shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0" />
                            )
                          }

                        </button>


                        {
                          isOpen && (

                            <div className="ml-5 mt-1 space-y-1 border-l pl-3">

                              {
                                group.items.map(
                                  (
                                    item
                                  ) => {

                                    const active =
                                      routeIsActive(
                                        pathname,
                                        item.href
                                      );


                                    return (

                                      <Link
                                        key={
                                          item.href
                                        }
                                        href={
                                          item.href
                                        }
                                        className={
                                          active
                                            ? "block rounded-lg bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800"
                                            : "block rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                        }
                                      >
                                        {
                                          item.name
                                        }
                                      </Link>

                                    );
                                  }
                                )
                              }

                            </div>

                          )
                        }

                      </div>

                    );
                  }
                )
              }


              {
                !dashboardVisible &&
                visibleGroups.length ===
                  0 &&
                !settingsVisible && (

                  <div className="px-4 py-3 text-sm text-muted-foreground">
                    No modules available.
                  </div>

                )
              }


              {
                settingsVisible && (
                  <>
                    <div className="my-3 border-t" />

                    <Link
                      href={settingsItem.href}
                      className={
                        routeIsActive(
                          pathname,
                          settingsItem.href
                        )
                          ? "flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
                          : "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      }
                    >
                      <SettingsIcon className="h-4 w-4" />

                      Settings
                    </Link>
                  </>
                )
              }

            </>

          )
        }

      </nav>


      <div className="hidden shrink-0 border-t p-4 md:block">

        <p className="text-xs font-medium text-muted-foreground">
          JINLAB Nexus
        </p>


        <p className="mt-1 text-xs text-muted-foreground">
          Alpha Platform
        </p>

      </div>

    </aside>
  );
}
