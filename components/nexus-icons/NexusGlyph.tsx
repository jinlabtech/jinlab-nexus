import NexusIllustration from "@/components/nexus-icons/NexusIllustration";


const names = new Set([
  "dashboard",
  "email",
  "email-sent",
  "whatsapp",
  "timebook",

  "shipping",
  "shipping-shipments",
  "shipping-history",
  "shipping-new",
  "shipping-tracking",
  "shipping-connections",

  "sales",
  "customers",
  "quotations",
  "sales-orders",
  "invoices",

  "pos",
  "pos-approvals",
  "pos-receipts",
  "pos-cash-up",
  "pos-pricing",
  "pos-returns",

  "repairs",

  "inventory",
  "inventory-scanner",
  "inventory-barcodes",
  "purchasing",

  "finance",
  "accounting",
  "payroll",
  "payroll-runs",
  "payroll-compliance",

  "hr",
  "users",

  "companies",
  "branches",
  "reports",
  "administration",
  "security",

  "settings",
  "recycle",

  "ai",
  "core",
]);


export function canonicalNexusIconName(
  value: string
) {
  const name =
    value
      .toLowerCase()
      .trim()
      .replace(
        /[\s_/&]+/g,
        "-"
      );


  if (names.has(name)) {
    return name;
  }


  if (name.includes("shipping")) {
    return "shipping";
  }


  if (
    name.includes("repair") ||
    name.includes("job-card")
  ) {
    return "repairs";
  }


  if (
    name.includes("inventory") ||
    name.includes("purchas")
  ) {
    return "inventory";
  }


  if (name.includes("finance")) {
    return "finance";
  }


  if (
    name.includes("people") ||
    name.includes("human") ||
    name === "hr"
  ) {
    return "hr";
  }


  if (name.includes("admin")) {
    return "administration";
  }


  if (name.includes("sale")) {
    return "sales";
  }


  if (
    name.includes("recycle") ||
    name.includes("trash") ||
    name.includes("bin")
  ) {
    return "recycle";
  }


  if (name.includes("setting")) {
    return "settings";
  }


  return "core";
}


export default function NexusGlyph({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  const resolved =
    canonicalNexusIconName(
      name
    );


  return (
    <span
      className={[
        "nexus-illustration",
        className,
      ].join(" ")}
      aria-hidden="true"
    >
      <NexusIllustration
        name={resolved}
      />
    </span>
  );
}
