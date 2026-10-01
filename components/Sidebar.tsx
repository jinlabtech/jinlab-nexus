"use client";

import {
  NexusIcon,
  nexusIconForRoute,
} from "@/components/nexus-icons/NexusIcon";

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
  Mail,
  MessageCircle,
  Package,
  ShoppingCart,
  Wrench,
  Truck,
} from "lucide-react";

import {
  usePermissions,
} from "@/hooks/usePermissions";

import type {
  PermissionName,
} from "@/types/permissions";

import {
  supabase,
} from "@/lib/supabase";


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

const recycleBinItem: NavigationItem = {
  name: "Recycle Bin",
  href: "/settings/recycle-bin",
  permission: "settings.view",
};

const navigationGroups: NavigationGroup[] = [
  {
    key: "email",
    name: "Email",
    icon: (
      <Mail className="h-4 w-4" />
    ),
    items: [
      {
        name: "Inbox",
        href: "/email",
        permission: "email.view",
      },
      {
        name: "Mailboxes",
        href: "/email/mailboxes",
        permission: "email.manage",
      },
      {
        name: "Templates",
        href: "/email/templates",
        permission: "templates.view",
      },
      {
        name: "Marketing",
        href: "/email/marketing",
        permission: "marketing.view",
      },
      {
        name: "Schedules",
        href: "/email/marketing/recurring",
        permission: "marketing.view",
      },
      {
        name: "Bulk Email",
        href: "/email/bulk",
        permission: "email.send",
      },
    ],
  },

  {
    key: "whatsapp",
    name: "WhatsApp",
    icon: (
      <MessageCircle className="h-4 w-4" />
    ),
    items: [
      {
        name: "WhatsApp Workspace",
        href: "/whatsapp",
        permission: "whatsapp.view",
      },
    ],
  },

  {
    key: "shipping",
    name: "Shipping",
    icon: <Truck className="h-4 w-4" />,
    items: [
      { name: "Overview", href: "/shipping", permission: "shipping.view" },
      { name: "Shipments", href: "/shipping/shipments", permission: "shipping.view" },
      { name: "History", href: "/shipping/history", permission: "shipping.view" },
      { name: "New Shipment", href: "/shipping/new", permission: "shipping.manage" },
      { name: "Tracking", href: "/shipping/tracking", permission: "shipping.view" },
      { name: "Courier Connections", href: "/shipping/connections", permission: "shipping.manage" },
    ],
  },

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
      {
        name: "Returns & Exchanges",
        href: "/pos/returns",
        permission: "pos.return.view",
      },
      {
        name: "POS Approvals",
        href: "/pos/approvals",
        permission: "pos.discount.approve",
      },
      {
        name: "Pricing & Promotions",
        href: "/pos/pricing",
        permission: "pos.pricing.view",
      },
      {
        name: "Receipts",
        href: "/pos/receipts",
        permission: "pos.view",
      },
      {
        name: "Cash-up & Reconciliation",
        href: "/pos/cashup",
        permission: "pos.cashup.view",
      },
      {
        name: "POS Analytics",
        href: "/pos/analytics",
        permission: "pos.analytics.view",
      },
    ],
  },

  {
    key: "repairs",
    name: "Repairs & Job Cards",
    icon: (
      <Wrench className="h-4 w-4" />
    ),
    items: [
      {
        name: "Job Cards & Scanner",
        href: "/repairs/scanner",
        permission: "repair.view" as PermissionName,
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
        name: "Barcodes & Labels",
        href: "/inventory/barcodes",
        permission: "inventory.view",
      },
      {
        name: "Mobile Scanner",
        href: "/inventory/scan",
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
      {
        name: "Payroll",
        href: "/payroll",
        permission: "payroll.view" as PermissionName,
      },
      {
        name: "Payroll Runs",
        href: "/payroll/runs",
        permission: "payroll.run" as PermissionName,
      },
      {
        name: "Payroll Compliance",
        href: "/payroll/compliance",
        permission: "payroll.view" as PermissionName,
      },
      {
        name: "My Payslips",
        href: "/payroll/my-payslips",
        permission: "payroll.self",
      },
    ],
  },

  {
    key: "hr",
    name: "People & HR",
    icon: (
      <Building2 className="h-4 w-4" />
    ),
    items: [
      {
        name: "Human Resources",
        href: "/hr",
        permission: "hr.self" as PermissionName,
      },
      {
        name: "HR Intelligence",
        href: "/hr/intelligence",
        permission: "hr.view" as PermissionName,
      },
      {
        name: "HR Notifications",
        href: "/hr/notifications",
        permission: "hr.self" as PermissionName,
      },
      {
        name: "HR Reports",
        href: "/hr/reports",
        permission: "hr.view" as PermissionName,
      },
      {
        name: "My Schedule",
        href: "/hr/my-schedule",
        permission: "hr.self" as PermissionName,
      },
      {
        name: "Digital Time Book",
        href: "/hr/timebook",
        permission: "hr.self" as PermissionName,
      },
      {
        name: "Attendance Devices",
        href: "/hr/devices",
        permission: "hr.attendance.manage" as PermissionName,
      },
      {
        name: "HR Management",
        href: "/hr/manage",
        permission: "hr.view" as PermissionName,
      },
      {
        name: "User Linking",
        href: "/hr/link-users",
        permission: "hr.employee.manage" as PermissionName,
      },
      {
        name: "HR Records",
        href: "/hr/records",
        permission: "hr.self" as PermissionName,
      },
      {
        name: "Secure Documents",
        href: "/hr/documents",
        permission: "hr.documents.manage" as PermissionName,
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


const sidebarRouteHrefs = [
  dashboardItem.href,
  settingsItem.href,
  recycleBinItem.href,
  ...navigationGroups.flatMap(
    (group) =>
      group.items.map(
        (item) =>
          item.href
      )
  ),
];


function routeIsActive(
  pathname: string,
  href: string
) {

  const activeHref =
    sidebarRouteHrefs
      .filter(
        (candidate) =>
          pathname === candidate ||
          pathname.startsWith(
            `${candidate}/`
          )
      )
      .sort(
        (a, b) =>
          b.length -
          a.length
      )[0] ??
    null;


  return (
    href ===
    activeHref
  );
}


export default function Sidebar() {

  const pathname =
    usePathname();

  const [
    isOwner,
    setIsOwner,
  ] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadOwnerStatus() {
      const {
        data,
      } = await supabase.rpc(
        "current_user_is_owner"
      );

      if (!cancelled) {
        setIsOwner(
          Boolean(data)
        );
      }
    }

    void loadOwnerStatus();

    return () => {
      cancelled = true;
    };
  }, []);


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


  function toggleGroup(
    key: string
  ) {

    setOpenGroups(
      (
        current
      ) => {

        const currentlyOpen =
          current[key] ??
          (
            activeGroupKey ===
            key
          );


        return {
          ...current,

          [key]:
            !currentlyOpen,
        };
      }
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

  const recycleBinVisible =
    isOwner &&
    can(
      recycleBinItem.permission
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
    <aside className="flex w-full flex-col border-b bg-sidebar text-sidebar-foreground md:h-screen md:w-64 md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-r">

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
                        ? "flex items-center gap-3 rounded-xl bg-primary/10 px-4 py-3 text-sm font-semibold text-primary"
                        : "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }
                  >

                    <NexusIcon
                  name="dashboard"
                  active={
                    routeIsActive(
                      pathname,
                      dashboardItem.href
                    )
                  }
                  size="sidebar"
                />

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
                      openGroups[
                        group.key
                      ] ??
                      (
                        activeGroupKey ===
                        group.key
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

                            <NexusIcon
                              name={group.key}
                              active={groupActive}
                              size="sidebar"
                            />

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
                                            ? "flex items-center gap-2.5 rounded-lg bg-primary/10 px-3 py-2.5 text-sm font-semibold text-primary"
                                            : "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                        }
                                      >
                                        <NexusIcon
                                          name={
                                            nexusIconForRoute(
                                              item.href
                                            )
                                          }
                                          active={
                                            active
                                          }
                                          size="sm"
                                        />

                                        <span className="truncate">
                                          {
                                            item.name
                                          }
                                        </span>
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
                recycleBinVisible && (
                  <>
                    <div className="my-3 border-t" />

                    <Link
                      href={recycleBinItem.href}
                      className={
                        routeIsActive(
                          pathname,
                          recycleBinItem.href
                        )
                          ? "flex items-center gap-3 rounded-xl bg-primary/10 px-4 py-3 text-sm font-semibold text-primary"
                          : "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      }
                    >
                      <NexusIcon
                        name="recycle"
                        active={
                          routeIsActive(
                            pathname,
                            recycleBinItem.href
                          )
                        }
                        size="sidebar"
                      />

                      Recycle Bin
                    </Link>
                  </>
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
                          ? "flex items-center gap-3 rounded-xl bg-primary/10 px-4 py-3 text-sm font-semibold text-primary"
                          : "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      }
                    >
                      <NexusIcon
                        name="settings"
                        active={
                          routeIsActive(
                            pathname,
                            settingsItem.href
                          )
                        }
                        size="sidebar"
                      />

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
