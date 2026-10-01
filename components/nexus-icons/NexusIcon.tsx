import NexusGlyph, {
  canonicalNexusIconName,
} from "@/components/nexus-icons/NexusGlyph";


type Props = {
  name: string;
  active?: boolean;
  size?:
    | "sm"
    | "md"
    | "sidebar"
    | "lg";
  className?: string;
};


export function NexusIcon({
  name,
  active = false,
  size = "md",
  className = "",
}: Props) {
  const resolvedName =
    canonicalNexusIconName(
      name
    );


  return (
    <span
      aria-hidden="true"
      data-nexus-icon={
        resolvedName
      }
      className={[
        "nexus-icon",
        `nexus-icon--${size}`,
        active
          ? "is-active"
          : "",
        className,
      ].join(" ")}
    >
      <NexusGlyph
        name={
          resolvedName
        }
      />
    </span>
  );
}


export function nexusIconForRoute(
  href: string
) {
  const path =
    href
      .split("?")[0]
      .replace(
        /\/+$/,
        ""
      ) ||
    "/";


  if (
    path === "/dashboard"
  ) {
    return "dashboard";
  }


  if (
    path.startsWith(
      "/email"
    )
  ) {
    if (
      path.includes(
        "sent"
      )
    ) {
      return "email-sent";
    }

    return "email";
  }


  if (
    path.startsWith(
      "/whatsapp"
    )
  ) {
    return "whatsapp";
  }


  /*
   * SHIPPING
   * Most-specific routes first.
   */

  if (
    path.startsWith(
      "/shipping/connections"
    )
  ) {
    return "shipping-connections";
  }


  if (
    path.startsWith(
      "/shipping/tracking"
    )
  ) {
    return "shipping-tracking";
  }


  if (
    path.startsWith(
      "/shipping/history"
    )
  ) {
    return "shipping-history";
  }


  if (
    path.startsWith(
      "/shipping/new"
    )
  ) {
    return "shipping-new";
  }


  if (
    path.startsWith(
      "/shipping/shipments"
    )
  ) {
    return "shipping-shipments";
  }


  if (
    path.startsWith(
      "/shipping"
    )
  ) {
    return "shipping";
  }


  /*
   * SALES
   */

  if (
    path === "/customers" ||
    path.startsWith(
      "/customers/"
    )
  ) {
    return "customers";
  }


  if (
    path.startsWith(
      "/quotations"
    )
  ) {
    return "quotations";
  }


  if (
    path.startsWith(
      "/sales-orders"
    ) ||
    path.startsWith(
      "/sales/orders"
    )
  ) {
    return "sales-orders";
  }


  if (
    path.startsWith(
      "/invoices"
    )
  ) {
    return "invoices";
  }


  if (
    path === "/sales"
  ) {
    return "sales";
  }


  /*
   * POS
   */

  if (
    path.startsWith(
      "/pos/approvals"
    )
  ) {
    return "pos-approvals";
  }


  if (
    path.includes(
      "/receipts"
    )
  ) {
    return "pos-receipts";
  }


  if (
    path.includes(
      "cash"
    )
  ) {
    return "pos-cash-up";
  }


  if (
    path.includes(
      "pricing"
    ) ||
    path.includes(
      "promotion"
    )
  ) {
    return "pos-pricing";
  }


  if (
    path.includes(
      "return"
    )
  ) {
    return "pos-returns";
  }


  if (
    path.startsWith(
      "/pos"
    )
  ) {
    return "pos";
  }


  /*
   * REPAIRS
   */

  if (
    path.startsWith(
      "/repairs"
    )
  ) {
    return "repairs";
  }


  /*
   * INVENTORY
   */

  if (
    path.startsWith(
      "/inventory/scanner"
    ) ||
    path.includes(
      "/scan"
    )
  ) {
    return "inventory-scanner";
  }


  if (
    path.includes(
      "barcode"
    )
  ) {
    return "inventory-barcodes";
  }


  if (
    path.startsWith(
      "/inventory"
    )
  ) {
    return "inventory";
  }


  if (
    path.startsWith(
      "/purchasing"
    )
  ) {
    return "purchasing";
  }


  /*
   * FINANCE
   */

  if (
    path.startsWith(
      "/accounting"
    )
  ) {
    return "accounting";
  }


  if (
    path.startsWith(
      "/payroll/compliance"
    )
  ) {
    return "payroll-compliance";
  }


  if (
    path.includes(
      "/payroll/run"
    )
  ) {
    return "payroll-runs";
  }


  if (
    path.startsWith(
      "/payroll"
    )
  ) {
    return "payroll";
  }


  if (
    path.startsWith(
      "/finance"
    )
  ) {
    return "finance";
  }


  /*
   * PEOPLE
   */

  if (
    path.startsWith(
      "/hr"
    )
  ) {
    return "hr";
  }


  if (
    path.startsWith(
      "/companies"
    )
  ) {
    return "companies";
  }


  if (
    path.startsWith(
      "/branches"
    )
  ) {
    return "branches";
  }


  if (
    path.startsWith(
      "/users"
    )
  ) {
    return "users";
  }


  if (
    path.startsWith(
      "/reports"
    )
  ) {
    return "reports";
  }


  /*
   * SETTINGS
   */

  if (
    path.startsWith(
      "/settings/recycle-bin"
    )
  ) {
    return "recycle";
  }


  if (
    path.startsWith(
      "/settings/security"
    )
  ) {
    return "security";
  }


  if (
    path.startsWith(
      "/settings"
    )
  ) {
    return "settings";
  }


  return "core";
}
