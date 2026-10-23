"use client";

import {
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  X,
} from "lucide-react";

import {
  useSyncExternalStore,
  useMemo,
  useState,
} from "react";

import {
  usePathname,
  useRouter,
} from "next/navigation";


type Tip = {
  title: string;
  detail: string;
  href?: string;
  action?: string;
};


const general: Tip[] = [
  {
    title:
      "Nexus keeps your business modules connected.",
    detail:
      "Use the phone Home screen to jump between recent applications and return to work faster.",
  },

  {
    title:
      "Nexus Core watches supported business records.",
    detail:
      "Important findings can be surfaced as priorities instead of requiring you to inspect every module manually.",
    href:
      "/dashboard",
    action:
      "Open Nexus Core",
  },

  {
    title:
      "The Nexus dock stays available while you work.",
    detail:
      "Use it to move between the applications you use most often without returning to the main menu.",
  },
];


const routeTips:
  Array<{
    prefix: string;
    tips: Tip[];
  }> = [

    {
      prefix:
        "/pos",

      tips: [
        {
          title:
            "POS connects sales with Nexus operations.",
          detail:
            "Sales activity can feed stock, controls, approvals and business intelligence instead of living in a separate till system.",
        },

        {
          title:
            "Nexus POS includes owner controls.",
          detail:
            "Use approvals and control workflows for sensitive sales actions rather than relying only on staff discretion.",
          href:
            "/pos/approvals",
          action:
            "Open approvals",
        },
      ],
    },


    {
      prefix:
        "/customers",

      tips: [
        {
          title:
            "Customer records connect to receivables.",
          detail:
            "Nexus can surface customer-account attention through its receivables intelligence instead of treating customers as a simple contact list.",
        },

        {
          title:
            "Use one customer record across Nexus.",
          detail:
            "Keep customer information linked to the operational work around that customer instead of creating disconnected records.",
        },
      ],
    },


    {
      prefix:
        "/whatsapp",

      tips: [
        {
          title:
            "Nexus can identify WhatsApp conversations needing attention.",
          detail:
            "Unread messages, follow-ups and unassigned conversations can become business signals in Nexus Intelligence.",
        },

        {
          title:
            "WhatsApp can become a controlled company channel.",
          detail:
            "Keeping business conversations inside Nexus creates a stronger operational record than relying on personal staff messaging.",
        },
      ],
    },


    {
      prefix:
        "/shipping",

      tips: [
        {
          title:
            "Nexus knows which shipments are still active.",
          detail:
            "Booked, collected, in-transit and out-for-delivery shipments stay in the live operational view until completed.",
          href:
            "/shipping/shipments",
          action:
            "View shipments",
        },

        {
          title:
            "Delivery exceptions deserve attention.",
          detail:
            "Failed, exception and uncertain courier states can be highlighted so a delivery problem does not disappear inside a tracking list.",
          href:
            "/shipping/shipments",
          action:
            "Review shipping",
        },
      ],
    },


    {
      prefix:
        "/repairs",

      tips: [
        {
          title:
            "Repair work should have a traceable lifecycle.",
          detail:
            "Use Nexus job cards and handover controls so devices move through the repair process with a clear operational record.",
        },

        {
          title:
            "Nexus Intelligence can surface repair attention.",
          detail:
            "Repair findings can appear alongside other business priorities instead of staying isolated inside the Repairs module.",
        },
      ],
    },


    {
      prefix:
        "/inventory",

      tips: [
        {
          title:
            "Inventory is part of Nexus Intelligence.",
          detail:
            "Stock-control information can contribute to purchasing needs and operational stock-risk signals.",
        },

        {
          title:
            "Stock movement matters as much as stock quantity.",
          detail:
            "Use inventory records together with sales and purchasing activity to understand why stock changed.",
        },
      ],
    },


    {
      prefix:
        "/accounting",

      tips: [
        {
          title:
            "Nexus Accounting is designed to hide complexity from ordinary users.",
          detail:
            "The system can preserve proper financial records while presenting operational users with simpler workflows.",
        },

        {
          title:
            "Receivables can become owner intelligence.",
          detail:
            "Customer balances and debtor risk can be surfaced as actionable attention instead of being buried inside reports.",
        },
      ],
    },


    {
      prefix:
        "/hr",

      tips: [
        {
          title:
            "HR has its own notification workflow.",
          detail:
            "Workforce notifications can remain detailed inside HR while Nexus Core provides the broader owner-level operating view.",
          href:
            "/hr/notifications",
          action:
            "Open HR notifications",
        },

        {
          title:
            "HR Intelligence is separate from ordinary records.",
          detail:
            "Use intelligence to interpret workforce signals while preserving the underlying employee and attendance records.",
          href:
            "/hr/intelligence",
          action:
            "Open HR Intelligence",
        },
      ],
    },


    {
      prefix:
        "/payroll",

      tips: [
        {
          title:
            "Payroll Compliance has controlled workflow stages.",
          detail:
            "Nexus separates testing, live processing, SARS submission evidence and filing closure so compliance work remains traceable.",
          href:
            "/payroll/compliance",
          action:
            "Open compliance",
        },
      ],
    },


    {
      prefix:
        "/dashboard",

      tips: [
        {
          title:
            "Nexus Core is your business command layer.",
          detail:
            "It combines findings, measures, coverage and priority signals so you can see where attention is needed first.",
        },

        {
          title:
            "You can customize your Core widgets.",
          detail:
            "Use Edit layout to move, hide and restore widgets so Nexus Core matches the way you run the business.",
        },
      ],
    },
  ];



const dismissKey = "nexus-core-tips-dismissed-v1";
function readDismissed() { try { return window.localStorage.getItem(dismissKey) === "yes"; } catch { return false; } }
function subscribe(callback:()=>void) {
  window.addEventListener("storage",callback);window.addEventListener("nexus:tips-changed",callback);
  return ()=>{window.removeEventListener("storage",callback);window.removeEventListener("nexus:tips-changed",callback)};
}
export default function NexusContextCoach() {
  const pathname=usePathname(),router=useRouter();
  const [index,setIndex]=useState(0);
  const [hiddenHere,setHiddenHere]=useState(false);
  const dismissed=useSyncExternalStore(subscribe,readDismissed,()=>false);
  const tips=useMemo(()=>routeTips.find(item=>pathname.startsWith(item.prefix))?.tips??general,[pathname]);
  const tip=tips[index%tips.length];
  function hide(value:boolean){setHiddenHere(value);try{window.localStorage.setItem(dismissKey,value?"yes":"no")}catch{}window.dispatchEvent(new Event("nexus:tips-changed"));}
  if(dismissed||hiddenHere)return <button type="button" className="m-3 min-h-11 rounded-lg border px-3 text-sm" onClick={()=>hide(false)}>Show Nexus tips</button>;
  return <section aria-label="Nexus Core tips" className="m-3 rounded-xl border bg-background/80 p-3 text-foreground">
    <div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold"><Lightbulb className="size-4"/>Did you know?</h3><button type="button" aria-label="Dismiss Nexus tips" className="flex size-11 items-center justify-center rounded-lg border" onClick={()=>hide(true)}><X className="size-4"/></button></div>
    <p className="mt-2 text-sm font-medium">{tip.title}</p><p className="mt-2 text-sm text-muted-foreground">{tip.detail}</p>
    {tip.href&&<button className="mt-2 min-h-11 rounded-lg border px-3 text-sm" type="button" onClick={()=>router.push(tip.href!)}>{tip.action}</button>}
    <div className="mt-2 flex items-center justify-between"><button type="button" aria-label="Previous Nexus tip" className="size-11" onClick={()=>setIndex(i=>(i-1+tips.length)%tips.length)}><ChevronLeft/></button><span className="text-xs">{index%tips.length+1} / {tips.length}</span><button type="button" aria-label="Next Nexus tip" className="size-11" onClick={()=>setIndex(i=>(i+1)%tips.length)}><ChevronRight/></button></div>
  </section>;
}
