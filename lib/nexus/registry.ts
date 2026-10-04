import type {
  PermissionName,
} from "@/types/permissions";


export type NexusAppId =
  | "whatsapp"
  | "sales"
  | "inventory"
  | "invoices"
  | "repairs"
  | "customers"
  | "pos"
  | "shipping"
  | "purchasing"
  | "accounting"
  | "payroll"
  | "hr"
  | "email"
  | "settings";


export type NexusTone =
  | "blue"
  | "green"
  | "violet"
  | "amber"
  | "cyan"
  | "rose";


export type NexusFeatureItem = {
  id: string;
  label: string;
  href: string;
  icon: string;

  permission?: PermissionName;
  tone?: NexusTone;
  keywords?: string[];
};


export type NexusAppItem = {
  id: NexusAppId;
  label: string;

  /*
   * href = where tapping the main app icon opens.
   *
   * activeRoot = route family belonging to this app.
   * Example:
   * Sales opens /sales/hub,
   * but /sales/new still belongs to Sales.
   */
  href: string;
  activeRoot?: string;

  icon: string;
  permission?: PermissionName;

  dockable?: boolean;
  mobile?: boolean;

  keywords?: string[];
  children?: NexusFeatureItem[];
};


export type NexusNavigationItem = {
  id: string;
  label: string;
  href: string;
  icon: string;

  activeRoot?: string;
  permission?: PermissionName;

  keywords?: string[];
  parentLabel?: string;
};


export const nexusApps:
  NexusAppItem[] = [

  {
    id: "whatsapp",
    label: "WhatsApp",
    href: "/whatsapp",
    activeRoot: "/whatsapp",
    icon: "whatsapp",
    permission: "whatsapp.view",
    dockable: true,
    mobile: true,
    keywords: [
      "messages",
      "chat",
      "customers",
    ],
  },


  {
    id: "sales",
    label: "Sales",
    href: "/sales/hub",
    activeRoot: "/sales",
    icon: "sales",
    permission: "sales.view",
    dockable: true,
    mobile: true,
    keywords: [
      "sales",
      "orders",
      "quotes",
      "invoices",
    ],

    children: [
      {
        id: "new-sale",
        label: "New Sale",
        href: "/sales/new",
        icon: "new",
        tone: "green",
        permission: "sales.view",
        keywords: [
          "new",
          "sale",
          "order",
        ],
      },

      {
        id: "sales-orders",
        label: "Sales Orders",
        href: "/sales",
        icon: "sales",
        tone: "blue",
        permission: "sales.view",
        keywords: [
          "sales",
          "orders",
        ],
      },

      {
        id: "customers",
        label: "Customers",
        href: "/customers",
        icon: "customers",
        tone: "violet",
        permission: "customer.view",
      },

      {
        id: "quotations",
        label: "Quotations",
        href: "/quotations",
        icon: "quotes",
        tone: "amber",
        permission: "quotation.view",
      },

      {
        id: "invoices",
        label: "Invoices",
        href: "/invoices",
        icon: "invoices",
        tone: "cyan",
        permission: "invoice.view",
      },

      {
        id: "pos",
        label: "Point of Sale",
        href: "/pos/hub",
        icon: "pos",
        tone: "rose",
        permission: "pos.view",
      },
    ],
  },


  {
    id: "inventory",
    label: "Inventory",
    href: "/inventory/hub",
    activeRoot: "/inventory",
    icon: "inventory",
    permission: "inventory.view",
    dockable: true,
    mobile: true,
    keywords: [
      "inventory",
      "stock",
      "products",
      "items",
      "warehouse",
    ],

    children: [
      {
        id: "overview",
        label: "Inventory",
        href: "/inventory",
        icon: "inventory",
        tone: "blue",
        permission: "inventory.view",
      },

      {
        id: "scanner",
        label: "Scanner",
        href: "/inventory/scan",
        icon: "scanner",
        tone: "green",
        permission: "inventory.view",
      },

      {
        id: "barcodes",
        label: "Barcodes",
        href: "/inventory/barcodes",
        icon: "barcode",
        tone: "violet",
        permission: "inventory.view",
      },

      {
        id: "labels",
        label: "Labels",
        href: "/inventory/labels",
        icon: "labels",
        tone: "amber",
        permission: "inventory.view",
      },

      {
        id: "categories",
        label: "Categories",
        href: "/inventory/categories",
        icon: "categories",
        tone: "cyan",
        permission: "inventory.view",
      },

      {
        id: "movements",
        label: "Movements",
        href: "/inventory/movements",
        icon: "movements",
        tone: "blue",
        permission: "inventory.view",
      },

      {
        id: "suppliers",
        label: "Suppliers",
        href: "/inventory/suppliers",
        icon: "suppliers",
        tone: "green",
        permission: "inventory.view",
      },

      {
        id: "archived",
        label: "Archived",
        href: "/inventory/archived",
        icon: "archive",
        tone: "violet",
        permission: "inventory.view",
      },
    ],
  },


  {
    id: "invoices",
    label: "Invoices",
    href: "/invoices",
    activeRoot: "/invoices",
    icon: "invoices",
    permission: "invoice.view",
    dockable: true,
    mobile: true,
  },


  {
    id: "repairs",
    label: "Repairs",
    href: "/repairs/scanner",
    activeRoot: "/repairs",
    icon: "repairs",
    permission: "repair.view" as PermissionName,
    dockable: true,
    mobile: true,
  },


  {
    id: "customers",
    label: "Customers",
    href: "/customers",
    activeRoot: "/customers",
    icon: "customers",
    permission: "customer.view",
    dockable: true,
    mobile: true,
  },


  {
    id: "pos",
    label: "POS",
    href: "/pos/hub",
    activeRoot: "/pos",
    icon: "pos",
    permission: "pos.view",
    dockable: true,
    mobile: true,
    keywords: [
      "pos",
      "checkout",
      "cashier",
      "till",
    ],

    children: [
      {
        id: "workspace",
        label: "Point of Sale",
        href: "/pos",
        icon: "pos",
        tone: "green",
        permission: "pos.view",
      },

      {
        id: "receipts",
        label: "Receipts",
        href: "/pos/receipts",
        icon: "receipts",
        tone: "blue",
        permission: "pos.view",
      },

      {
        id: "returns",
        label: "Returns",
        href: "/pos/returns",
        icon: "returns",
        tone: "rose",
        permission:
          "pos.return.view",
      },

      {
        id: "cashup",
        label: "Cash-up",
        href: "/pos/cashup",
        icon: "cashup",
        tone: "amber",
        permission:
          "pos.cashup.view",
      },

      {
        id: "approvals",
        label: "Approvals",
        href: "/pos/approvals",
        icon: "approvals",
        tone: "violet",
        permission:
          "pos.discount.approve",
      },

      {
        id: "pricing",
        label: "Pricing",
        href: "/pos/pricing",
        icon: "pricing",
        tone: "cyan",
        permission:
          "pos.pricing.view",
      },

      {
        id: "analytics",
        label: "Analytics",
        href: "/pos/analytics",
        icon: "analytics",
        tone: "blue",
        permission:
          "pos.analytics.view",
      },
    ],
  },


  {
    id: "shipping",
    label: "Shipping",
    href: "/shipping",
    activeRoot: "/shipping",
    icon: "shipping",
    permission: "shipping.view",
    dockable: true,
    mobile: true,
  },


  {
    id: "purchasing",
    label: "Purchasing",
    href: "/purchasing/hub",
    activeRoot: "/purchasing",
    icon: "purchasing",
    permission: "purchasing.view",
    dockable: true,
    mobile: true,

    children: [
      {
        id: "overview",
        label: "Purchasing",
        href: "/purchasing",
        icon: "purchasing",
        tone: "blue",
        permission:
          "purchasing.view",
      },

      {
        id: "receipts",
        label: "Goods Receipts",
        href: "/purchasing/receipts",
        icon: "receipts",
        tone: "green",
        permission:
          "purchasing.view",
      },

      {
        id: "recommendations",
        label: "Recommendations",
        href: "/purchasing/recommendations",
        icon: "recommendations",
        tone: "violet",
        permission:
          "purchasing.view",
      },
    ],
  },


  {
    id: "accounting",
    label: "Accounting",
    href: "/accounting/hub",
    activeRoot: "/accounting",
    icon: "accounting",
    permission: "accounting.view",
    dockable: true,
    mobile: true,

    children: [
      {
        id: "overview",
        label: "Accounting",
        href: "/accounting",
        icon: "accounting",
        tone: "blue",
        permission: "accounting.view",
      },

      {
        id: "bank-reconciliation",
        label: "Bank Reconciliation",
        href: "/accounting/bank-reconciliation",
        icon: "bank",
        tone: "green",
        permission: "accounting.view",
      },

      {
        id: "chart-of-accounts",
        label: "Chart of Accounts",
        href: "/accounting/chart-of-accounts",
        icon: "accounts",
        tone: "violet",
        permission: "accounting.view",
      },

      {
        id: "debtors",
        label: "Debtors",
        href: "/accounting/debtors",
        icon: "debtors",
        tone: "amber",
        permission: "accounting.view",
      },

      {
        id: "expenses",
        label: "Expenses",
        href: "/accounting/expenses",
        icon: "expenses",
        tone: "rose",
        permission: "accounting.view",
      },

      {
        id: "financial-years",
        label: "Financial Years",
        href: "/accounting/financial-years",
        icon: "calendar",
        tone: "cyan",
        permission: "accounting.view",
      },

      {
        id: "inventory-costing",
        label: "Inventory Costing",
        href: "/accounting/inventory-costing",
        icon: "costing",
        tone: "green",
        permission: "accounting.view",
      },

      {
        id: "journals",
        label: "Journals",
        href: "/accounting/journals",
        icon: "journals",
        tone: "blue",
        permission: "accounting.view",
      },

      {
        id: "payables",
        label: "Payables",
        href: "/accounting/payables",
        icon: "payables",
        tone: "violet",
        permission: "accounting.view",
      },

      {
        id: "exceptions",
        label: "Exceptions",
        href: "/accounting/exceptions",
        icon: "exceptions",
        tone: "rose",
        permission: "accounting.view",
      },

      {
        id: "performance",
        label: "Performance",
        href: "/accounting/performance",
        icon: "analytics",
        tone: "cyan",
        permission: "accounting.view",
      },
    ],
  },


  {
    id: "payroll",
    label: "Payroll",
    href: "/payroll/hub",
    activeRoot: "/payroll",
    icon: "payroll",
    permission:
      "payroll.view" as PermissionName,
    dockable: true,
    mobile: true,

    children: [
      {
        id: "overview",
        label: "Payroll",
        href: "/payroll",
        icon: "payroll",
        tone: "blue",
        permission:
          "payroll.view" as PermissionName,
      },

      {
        id: "runs",
        label: "Payroll Runs",
        href: "/payroll/runs",
        icon: "runs",
        tone: "green",
        permission:
          "payroll.run" as PermissionName,
      },

      {
        id: "compliance",
        label: "Compliance",
        href: "/payroll/compliance",
        icon: "compliance",
        tone: "violet",
        permission:
          "payroll.view" as PermissionName,
      },

      {
        id: "history",
        label: "History",
        href: "/payroll/history",
        icon: "history",
        tone: "amber",
        permission:
          "payroll.view" as PermissionName,
      },

      {
        id: "my-payslips",
        label: "My Payslips",
        href: "/payroll/my-payslips",
        icon: "payslips",
        tone: "cyan",
        permission:
          "payroll.self",
      },
    ],
  },


  {
    id: "hr",
    label: "People",
    href: "/hr/hub",
    activeRoot: "/hr",
    icon: "hr",
    permission:
      "hr.self" as PermissionName,
    dockable: true,
    mobile: true,
    keywords: [
      "people",
      "hr",
      "employees",
      "staff",
    ],

    children: [
      {
        id: "overview",
        label: "Human Resources",
        href: "/hr",
        icon: "hr",
        tone: "blue",
        permission:
          "hr.self" as PermissionName,
      },

      {
        id: "intelligence",
        label: "HR Intelligence",
        href: "/hr/intelligence",
        icon: "intelligence",
        tone: "violet",
        permission:
          "hr.view" as PermissionName,
      },

      {
        id: "notifications",
        label: "Notifications",
        href: "/hr/notifications",
        icon: "notifications",
        tone: "amber",
        permission:
          "hr.self" as PermissionName,
      },

      {
        id: "reports",
        label: "Reports",
        href: "/hr/reports",
        icon: "reports",
        tone: "cyan",
        permission:
          "hr.view" as PermissionName,
      },

      {
        id: "schedule",
        label: "My Schedule",
        href: "/hr/my-schedule",
        icon: "calendar",
        tone: "green",
        permission:
          "hr.self" as PermissionName,
      },

      {
        id: "timebook",
        label: "Time Book",
        href: "/hr/timebook",
        icon: "time",
        tone: "blue",
        permission:
          "hr.self" as PermissionName,
      },

      {
        id: "devices",
        label: "Attendance Devices",
        href: "/hr/devices",
        icon: "devices",
        tone: "violet",
        permission:
          "hr.attendance.manage" as PermissionName,
      },

      {
        id: "manage",
        label: "HR Management",
        href: "/hr/manage",
        icon: "manage",
        tone: "amber",
        permission:
          "hr.view" as PermissionName,
      },

      {
        id: "link-users",
        label: "User Linking",
        href: "/hr/link-users",
        icon: "users",
        tone: "cyan",
        permission:
          "hr.employee.manage" as PermissionName,
      },

      {
        id: "records",
        label: "HR Records",
        href: "/hr/records",
        icon: "records",
        tone: "green",
        permission:
          "hr.self" as PermissionName,
      },

      {
        id: "documents",
        label: "Secure Documents",
        href: "/hr/documents",
        icon: "documents",
        tone: "violet",
        permission:
          "hr.documents.manage" as PermissionName,
      },

      {
        id: "kiosk",
        label: "Kiosk",
        href: "/hr/kiosk",
        icon: "kiosk",
        tone: "blue",
        permission:
          "hr.self" as PermissionName,
      },
    ],
  },


  {
    id: "email",
    label: "Email",
    href: "/email",
    activeRoot: "/email",
    icon: "email",
    permission: "email.view",
    dockable: true,
    mobile: true,
  },


  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    activeRoot: "/settings",
    icon: "settings",
    permission: "settings.view",
    dockable: true,
    mobile: true,
  },

];


const nexusSystemNavigation:
  NexusNavigationItem[] = [

  {
    id: "dashboard",
    label: "Home",
    href: "/dashboard",
    activeRoot: "/dashboard",
    icon: "core",
    permission: "dashboard.view",
    keywords: [
      "home",
      "dashboard",
      "nexus",
    ],
  },

  {
    id: "time",
    label: "Time",
    href: "/hr/timebook",
    activeRoot: "/hr/timebook",
    icon: "hr",
    permission:
      "hr.self" as PermissionName,
    keywords: [
      "time",
      "attendance",
      "clock",
      "timebook",
    ],
  },

  {
    id: "quotations",
    label: "Quotes",
    href: "/quotations",
    activeRoot: "/quotations",
    icon: "invoices",
    permission: "quotation.view",
    keywords: [
      "quote",
      "quotation",
      "estimate",
    ],
  },

];


export function getNexusApp(
  id: NexusAppId
) {

  return nexusApps.find(
    (app) =>
      app.id === id
  );

}


export function getMobileNexusApps() {

  return nexusApps.filter(
    (app) =>
      app.mobile !== false
  );

}


export function getDockableNexusApps() {

  return nexusApps.filter(
    (app) =>
      app.dockable === true
  );

}


export function getNexusModuleChildren(
  id: NexusAppId
) {

  return (
    getNexusApp(id)?.children ??
    []
  );

}


export function getNexusDockApps():
  NexusNavigationItem[] {

  const home =
    nexusSystemNavigation[0];

  const time =
    nexusSystemNavigation[1];

  const quotes =
    nexusSystemNavigation[2];


  return [
    home,

    ...getDockableNexusApps()
      .map(
        (app) => ({
          id: app.id,
          label: app.label,
          href: app.href,
          activeRoot:
            app.activeRoot,
          icon: app.icon,
          permission:
            app.permission,
          keywords:
            app.keywords ?? [],
        })
      ),

    time,
    quotes,
  ];

}


export function getNexusDrawerApps():
  NexusNavigationItem[] {

  const home =
    nexusSystemNavigation[0];


  return [
    home,

    ...nexusApps.map(
      (app) => ({
        id: app.id,
        label: app.label,
        href: app.href,
        activeRoot:
          app.activeRoot,
        icon: app.icon,
        permission:
          app.permission,
        keywords:
          app.keywords ?? [],
      })
    ),
  ];

}


export function getNexusSearchEntries():
  NexusNavigationItem[] {

  const appEntries =
    nexusApps.map(
      (app) => ({
        id:
          `app:${app.id}`,

        label:
          app.label,

        href:
          app.href,

        activeRoot:
          app.activeRoot,

        icon:
          app.icon,

        permission:
          app.permission,

        keywords:
          app.keywords ?? [],
      })
    );


  const featureEntries =
    nexusApps.flatMap(
      (app) =>
        (app.children ?? [])
          .map(
            (feature) => ({
              id:
                `feature:${app.id}:${feature.id}`,

              label:
                feature.label,

              href:
                feature.href,

              icon:
                feature.icon,

              permission:
                feature.permission ??
                app.permission,

              keywords:
                feature.keywords ??
                [],

              parentLabel:
                app.label,
            })
          )
    );


  return [
    ...nexusSystemNavigation,
    ...appEntries,
    ...featureEntries,
  ];

}


export function nexusNavigationMatchesRoute(
  pathname: string,
  item: {
    href: string;
    activeRoot?: string;
  }
) {

  const root =
    item.activeRoot ??
    item.href;


  return (
    pathname === root ||
    pathname.startsWith(
      `${root}/`
    ) ||
    pathname === item.href
  );

}


/* =========================================================
   NEXUS ROUTE HIERARCHY
   Native-style labels and deterministic Back navigation.
   ========================================================= */

export function getNexusRouteLabel(
  pathname: string
) {

  if (
    pathname === "/dashboard"
  ) {
    return "Home";
  }


  const featureMatches =
    nexusApps
      .flatMap(
        (app) =>
          (app.children ?? []).map(
            (feature) => ({
              app,
              feature,
            })
          )
      )
      .filter(
        ({
          feature,
        }) =>
          pathname ===
            feature.href ||
          pathname.startsWith(
            `${feature.href}/`
          )
      )
      .sort(
        (a, b) =>
          b.feature.href.length -
          a.feature.href.length
      );


  if (
    featureMatches.length >
    0
  ) {
    return (
      featureMatches[0]
        .feature.label
    );
  }


  const appMatches =
    nexusApps
      .filter(
        (app) => {

          const root =
            app.activeRoot ??
            app.href;


          return (
            pathname ===
              app.href ||
            pathname ===
              root ||
            pathname.startsWith(
              `${root}/`
            )
          );

        }
      )
      .sort(
        (a, b) =>
          (
            b.activeRoot ??
            b.href
          ).length -
          (
            a.activeRoot ??
            a.href
          ).length
      );


  if (
    appMatches.length >
    0
  ) {
    return appMatches[0].label;
  }


  return "Nexus";
}


export function getNexusBackTarget(
  pathname: string
):
  string |
  null {

  if (
    pathname ===
    "/dashboard"
  ) {
    return null;
  }


  /*
   * First detect the most specific feature.
   */
  const featureMatches =
    nexusApps
      .flatMap(
        (app) =>
          (app.children ?? []).map(
            (feature) => ({
              app,
              feature,
            })
          )
      )
      .filter(
        ({
          feature,
        }) =>
          pathname ===
            feature.href ||
          pathname.startsWith(
            `${feature.href}/`
          )
      )
      .sort(
        (a, b) =>
          b.feature.href.length -
          a.feature.href.length
      );


  const match =
    featureMatches[0];


  if (match) {

    /*
     * Example:
     *
     * /accounting/debtors/123
     *       ↓
     * /accounting/debtors
     */
    if (
      pathname !==
      match.feature.href
    ) {
      return (
        match.feature.href
      );
    }


    /*
     * A feature goes back to
     * its module hub.
     */
    if (
      match.app.href.endsWith(
        "/hub"
      )
    ) {
      return match.app.href;
    }


    return "/dashboard";
  }


  const app =
    nexusApps
      .filter(
        (candidate) => {

          const root =
            candidate.activeRoot ??
            candidate.href;


          return (
            pathname ===
              candidate.href ||
            pathname ===
              root ||
            pathname.startsWith(
              `${root}/`
            )
          );

        }
      )
      .sort(
        (a, b) =>
          (
            b.activeRoot ??
            b.href
          ).length -
          (
            a.activeRoot ??
            a.href
          ).length
      )[0];


  if (!app) {
    return "/dashboard";
  }


  /*
   * Hub itself returns Home.
   */
  if (
    pathname === app.href
  ) {
    return "/dashboard";
  }


  /*
   * An unknown nested route returns
   * to its app entry point.
   */
  return app.href;
}
