import {
  BadgeCheck,
  Banknote,
  Barcode,
  Boxes,
  Building2,
  Calculator,
  Cable,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  LayoutDashboard,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  PackageCheck,
  PackagePlus,
  ReceiptText,
  RotateCcw,
  ScanLine,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
  UserRoundCog,
  UsersRound,
  WalletCards,
  Wrench,
  Sparkles,
  type LucideIcon,
} from "lucide-react";


const icons:
  Record<string, LucideIcon> = {

  dashboard:
    LayoutDashboard,

  email:
    Mail,

  "email-sent":
    Mail,

  whatsapp:
    MessageCircle,


  /* SHIPPING */

  shipping:
    Truck,

  "shipping-shipments":
    Package,

  "shipping-history":
    Clock3,

  "shipping-new":
    PackagePlus,

  "shipping-tracking":
    MapPin,

  "shipping-connections":
    Cable,


  /* SALES */

  sales:
    ShoppingBag,

  customers:
    UsersRound,

  quotations:
    FileText,

  "sales-orders":
    ClipboardCheck,

  invoices:
    ReceiptText,


  /* POS */

  pos:
    Store,

  "pos-approvals":
    BadgeCheck,

  "pos-receipts":
    ReceiptText,

  "pos-cash-up":
    Banknote,

  "pos-pricing":
    CircleDollarSign,

  "pos-returns":
    RotateCcw,


  /* REPAIRS */

  repairs:
    Wrench,


  /* INVENTORY */

  inventory:
    Boxes,

  "inventory-scanner":
    ScanLine,

  "inventory-barcodes":
    Barcode,

  purchasing:
    PackageCheck,


  /* FINANCE */

  finance:
    WalletCards,

  accounting:
    Calculator,

  payroll:
    Banknote,

  "payroll-runs":
    Banknote,

  "payroll-compliance":
    FileCheck2,


  /* PEOPLE */

  hr:
    UsersRound,

  users:
    UserRoundCog,


  /* ADMIN */

  companies:
    Building2,

  branches:
    Building2,

  reports:
    FileText,

  administration:
    ShieldCheck,

  security:
    ShieldCheck,

  settings:
    Settings,

  recycle:
    Trash2,

  ai:
    Sparkles,

  core:
    Sparkles,
};


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


  if (
    icons[name]
  ) {
    return name;
  }


  if (
    name.includes("shipping")
  ) {
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


  if (
    name.includes("finance")
  ) {
    return "finance";
  }


  if (
    name.includes("people") ||
    name.includes("human") ||
    name === "hr"
  ) {
    return "hr";
  }


  if (
    name.includes("admin")
  ) {
    return "administration";
  }


  if (
    name.includes("sale")
  ) {
    return "sales";
  }


  if (
    name.includes("recycle") ||
    name.includes("trash") ||
    name.includes("bin")
  ) {
    return "recycle";
  }


  if (
    name.includes("setting")
  ) {
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

  const Glyph =
    icons[resolved] ??
    Sparkles;


  return (
    <Glyph
      className={[
        "nexus-icon__glyph",
        "nexus-semantic-glyph",
        className,
      ].join(" ")}
      strokeWidth={1.8}
    />
  );
}
