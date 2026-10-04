"use client";

import {
  useEffect,
  useState,
} from "react";

import Link from "next/link";

import {
  Archive,
  BarChart3,
  Barcode,
  Bell,
  BookOpen,
  Boxes,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  FileCheck2,
  FileClock,
  FileText,
  Landmark,
  PackageCheck,
  PackageSearch,
  Plus,
  Receipt,
  ReceiptText,
  RotateCcw,
  ScanBarcode,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tags,
  Truck,
  UserCog,
  Users,
  WalletCards,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import {
  useRouter,
} from "next/navigation";

import type {
  NexusAppId,
  NexusTone,
} from "@/lib/nexus/registry";

import {
  getNexusModuleMemory,
  type NexusModuleMemory,
} from "@/lib/nexus/navigation-memory";


export type NexusHubIcon =
  | "new"
  | "sales"
  | "customers"
  | "quotes"
  | "invoices"
  | "pos"
  | "analytics"
  | "inventory"
  | "settings"
  | "repairs"
  | "scanner"
  | "barcode"
  | "labels"
  | "categories"
  | "movements"
  | "suppliers"
  | "archive"
  | "receipts"
  | "returns"
  | "cashup"
  | "approvals"
  | "pricing"
  | "recommendations"
  | "purchasing"
  | "accounting"
  | "bank"
  | "accounts"
  | "debtors"
  | "expenses"
  | "calendar"
  | "costing"
  | "journals"
  | "payables"
  | "exceptions"
  | "payroll"
  | "runs"
  | "compliance"
  | "history"
  | "payslips"
  | "hr"
  | "intelligence"
  | "notifications"
  | "reports"
  | "time"
  | "devices"
  | "manage"
  | "users"
  | "records"
  | "documents"
  | "kiosk";


export type NexusHubItem = {
  label: string;
  href: string;
  icon: NexusHubIcon;
  tone?: NexusTone;
};


type Props = {
  title: string;
  subtitle?: string;
  moduleId?: NexusAppId;
  items: NexusHubItem[];
};


const icons:
  Record<
    NexusHubIcon,
    LucideIcon
  > = {

  new: Plus,
  sales: ShoppingBag,
  customers: Users,
  quotes: FileText,
  invoices: ReceiptText,
  pos: Store,

  analytics: BarChart3,

  inventory: Boxes,
  settings: Settings,
  repairs: Wrench,

  scanner: ScanBarcode,
  barcode: Barcode,
  labels: Tags,
  categories: Boxes,
  movements: PackageSearch,
  suppliers: Truck,
  archive: Archive,

  receipts: Receipt,
  returns: RotateCcw,
  cashup: CircleDollarSign,
  approvals: ClipboardCheck,
  pricing: Tags,

  recommendations:
    PackageCheck,

  purchasing:
    ShoppingBag,

  accounting:
    CircleDollarSign,

  bank: Landmark,
  accounts: BookOpen,
  debtors: Users,
  expenses: WalletCards,
  calendar: CalendarDays,
  costing: Boxes,
  journals: BookOpen,
  payables: ReceiptText,
  exceptions: FileCheck2,

  payroll:
    CircleDollarSign,

  runs: FileClock,
  compliance: ShieldCheck,
  history: FileClock,
  payslips: ReceiptText,

  hr: Building2,
  intelligence: BarChart3,
  notifications: Bell,
  reports: FileText,
  time: FileClock,
  devices: ScanBarcode,
  manage: UserCog,
  users: Users,
  records: BookOpen,
  documents: FileCheck2,
  kiosk: Store,
};


const tones:
  Record<
    NexusTone,
    string
  > = {

  blue:
    "bg-blue-500/12 text-blue-600 dark:text-blue-400",

  green:
    "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",

  violet:
    "bg-violet-500/12 text-violet-600 dark:text-violet-400",

  amber:
    "bg-amber-500/12 text-amber-600 dark:text-amber-400",

  cyan:
    "bg-cyan-500/12 text-cyan-600 dark:text-cyan-400",

  rose:
    "bg-rose-500/12 text-rose-600 dark:text-rose-400",
};


export default function NexusModuleHub({
  title,
  subtitle,
  moduleId,
  items,
}: Props) {

  const router =
    useRouter();


  const [
    memory,
    setMemory,
  ] =
    useState<
      NexusModuleMemory |
      null
    >(null);


  useEffect(
    () => {

      if (!moduleId) {
        setMemory(null);
        return;
      }


      setMemory(
        getNexusModuleMemory(
          moduleId
        )
      );

    },
    [
      moduleId,
    ]
  );


  function prepareRoute(
    href: string
  ) {

    router.prefetch(
      href
    );

  }


  return (
    <section className="nexus-module-hub w-full px-4 pb-8 pt-5">

      <div className="nexus-module-hub-header mb-6 px-1">

        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          Nexus Module
        </p>

        <h1 className="mt-1 text-[26px] font-bold tracking-tight">
          {title}
        </h1>

        {subtitle ? (
          <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        ) : null}

      </div>


      {memory ? (
        <Link
          href={memory.href}
          prefetch={false}
          onPointerEnter={() =>
            prepareRoute(
              memory.href
            )
          }
          onTouchStart={() =>
            prepareRoute(
              memory.href
            )
          }
          className="nexus-module-continue mb-6 flex items-center gap-3 rounded-[22px] border border-border/45 bg-card/70 p-3.5 shadow-sm transition active:scale-[0.985]"
        >

          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">

            {(() => {

              const Icon =
                icons[
                  memory.icon as
                    NexusHubIcon
                ];


              const DisplayIcon =
                Icon ??
                ShoppingBag;


              return (
                <DisplayIcon
                  className="size-6"
                  strokeWidth={1.8}
                />
              );

            })()}

          </div>


          <div className="min-w-0 flex-1">

            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Continue
            </p>

            <p className="truncate text-sm font-semibold">
              {memory.label}
            </p>

          </div>


          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />

        </Link>
      ) : null}


      <div className="nexus-module-hub-grid grid grid-cols-3 gap-x-3 gap-y-7">

        {items.map(
          (item) => {

            const Icon =
              icons[item.icon];

            const tone =
              tones[
                item.tone ??
                "blue"
              ];


            return (
              <Link
                key={
                  item.href +
                  item.label
                }
                href={item.href}
                prefetch={false}
                onPointerEnter={() =>
                  prepareRoute(
                    item.href
                  )
                }
                onTouchStart={() =>
                  prepareRoute(
                    item.href
                  )
                }
                onFocus={() =>
                  prepareRoute(
                    item.href
                  )
                }
                className="nexus-module-hub-item group flex min-w-0 flex-col items-center gap-2 text-center no-underline"
              >

                <div
                  className={`nexus-module-hub-icon flex size-[72px] items-center justify-center rounded-[22px] border border-current/10 shadow-sm transition duration-150 group-active:scale-[0.88] ${tone}`}
                >
                  <Icon
                    strokeWidth={1.8}
                    className="size-8"
                  />
                </div>


                <span className="w-full truncate px-1 text-[11px] font-medium text-foreground">
                  {item.label}
                </span>

              </Link>
            );

          }
        )}

      </div>

    </section>
  );
}
