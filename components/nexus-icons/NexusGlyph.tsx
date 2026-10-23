import { BadgeCheck, Banknote, Barcode, Boxes, Building2, Calculator, CalendarCheck, ChartColumn, ChartNoAxesCombined, ClipboardCheck, ClipboardList, Clock, ContactRound, FileCheck2, FileText, HandCoins, History, LayoutDashboard, Mail, MapPin, MessageCircle, Network, Orbit, Package, PackagePlus, Plug, Receipt, ScanLine, Send, Settings, ShieldCheck, ShoppingBag, ShoppingCart, SlidersHorizontal, Sparkles, Tags, Trash2, Truck, Undo2, UserRoundCog, UsersRound, Wallet, Wrench, type LucideIcon } from "lucide-react";

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


const glyphs: Record<string, LucideIcon> = {
  "dashboard": LayoutDashboard,
  "email": Mail,
  "email-sent": Send,
  "whatsapp": MessageCircle,
  "timebook": Clock,
  "shipping": Truck,
  "shipping-shipments": Package,
  "shipping-history": History,
  "shipping-new": PackagePlus,
  "shipping-tracking": MapPin,
  "shipping-connections": Plug,
  "sales": ChartNoAxesCombined,
  "customers": ContactRound,
  "quotations": FileText,
  "sales-orders": ClipboardList,
  "invoices": FileCheck2,
  "pos": ShoppingCart,
  "pos-approvals": BadgeCheck,
  "pos-receipts": Receipt,
  "pos-cash-up": Banknote,
  "pos-pricing": Tags,
  "pos-returns": Undo2,
  "repairs": Wrench,
  "inventory": Boxes,
  "inventory-scanner": ScanLine,
  "inventory-barcodes": Barcode,
  "purchasing": ShoppingBag,
  "finance": Wallet,
  "accounting": Calculator,
  "payroll": HandCoins,
  "payroll-runs": CalendarCheck,
  "payroll-compliance": ClipboardCheck,
  "hr": UsersRound,
  "users": UserRoundCog,
  "companies": Building2,
  "branches": Network,
  "reports": ChartColumn,
  "administration": SlidersHorizontal,
  "security": ShieldCheck,
  "settings": Settings,
  "recycle": Trash2,
  "ai": Sparkles,
  "core": Orbit,
};

export default function NexusGlyph({ name, className = "" }: { name: string; className?: string }) {
  const Glyph = glyphs[canonicalNexusIconName(name)] ?? Orbit;
  return <Glyph className={`nexus-icon__glyph ${className}`} aria-hidden="true" strokeWidth={1.8} />;
}
