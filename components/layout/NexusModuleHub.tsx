"use client";

import {
  useEffect,
  useState,
} from "react";

import Link from "next/link";

import {
  ChevronRight, Plus, ShoppingBag, Users, FileText, Receipt, Store, ChartColumn, Package, Settings, Wrench, ScanLine, Barcode, Tags, Shapes, ArrowLeftRight, Truck, Archive, RotateCcw, Wallet, ShieldCheck, BadgeDollarSign, Lightbulb, Landmark, BookOpen, Coins, CalendarDays, Calculator, NotebookPen, CircleAlert, Play, History, BriefcaseBusiness, BrainCircuit, Bell, Clock, Monitor, SlidersHorizontal, FolderOpen, Tablet, type LucideIcon,
} from "lucide-react";

import {
  useRouter,
} from "next/navigation";

import {
  NexusIcon,
  nexusIconForRoute,
} from "@/components/nexus-icons/NexusIcon";

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


const featureIcons: Record<NexusHubIcon, LucideIcon> = {
  new:Plus,sales:ShoppingBag,customers:Users,quotes:FileText,invoices:Receipt,pos:Store,analytics:ChartColumn,inventory:Package,settings:Settings,repairs:Wrench,scanner:ScanLine,barcode:Barcode,labels:Tags,categories:Shapes,movements:ArrowLeftRight,suppliers:Truck,archive:Archive,receipts:Receipt,returns:RotateCcw,cashup:Wallet,approvals:ShieldCheck,pricing:BadgeDollarSign,recommendations:Lightbulb,purchasing:ShoppingBag,accounting:Calculator,bank:Landmark,accounts:BookOpen,debtors:Coins,expenses:Wallet,calendar:CalendarDays,costing:Calculator,journals:NotebookPen,payables:Coins,exceptions:CircleAlert,payroll:BriefcaseBusiness,runs:Play,compliance:ShieldCheck,history:History,payslips:FileText,hr:Users,intelligence:BrainCircuit,notifications:Bell,reports:ChartColumn,time:Clock,devices:Monitor,manage:SlidersHorizontal,users:Users,records:FolderOpen,documents:FileText,kiosk:Tablet,
};
function FeatureIcon({name}:{name:NexusHubIcon}) {
  const Icon = featureIcons[name] ?? Package;
  return <span className="nexus-feature-icon" aria-hidden="true"><Icon /></span>;
}

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
    <section
      className="nexus-module-hub w-full px-4 pb-8 pt-5"
      data-nexus-module={
        moduleId ??
        undefined
      }
    >

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

          <NexusIcon
            name={
              nexusIconForRoute(
                memory.href
              )
            }
            size="lg"
            className="nexus-module-continue-icon"
          />


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
          (item) => (

            <Link
              key={
                item.href +
                item.label
              }
              href={item.href}
              prefetch={false}
              data-nexus-feature={
                item.icon
              }
              data-nexus-tone={
                item.tone ??
                "blue"
              }
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

              <FeatureIcon name={item.icon} />

              <span className="nexus-feature-label w-full px-1 text-[12px] font-medium text-foreground">
                {item.label}
              </span>

            </Link>

          )
        )}

      </div>

    </section>
  );
}
