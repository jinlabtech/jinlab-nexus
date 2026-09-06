"use client";

import {
  useMemo,
  useState,
} from "react";

import {
  Building2,
  ChevronRight,
  CircleDollarSign,
  Layers3,
  Plug,
  ShieldCheck,
  ShoppingCart,
  Users,
} from "lucide-react";

import {
  useRouter,
} from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";

import {
  usePermissions,
} from "@/hooks/usePermissions";

import {
  supabase,
} from "@/lib/supabase";

import type {
  PermissionName,
} from "@/types/permissions";


type SettingsCard = {
  name: string;
  description: string;
  href: string;
  permission: PermissionName;
  status?: string;
};


type SettingsSection = {
  key: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  cards: SettingsCard[];
};


const sections: SettingsSection[] = [
  {
    key: "company",
    title: "Company",
    description:
      "Identity, branding and business presentation.",
    icon: (
      <Building2 className="h-5 w-5" />
    ),
    cards: [
      {
        name: "Company Profile",
        description:
          "Business identity, registration, addresses and contact information.",
        href: "/settings/company",
        permission: "settings.company.manage",
      },
      {
        name: "Branding & Documents",
        description:
          "Logo, invoice appearance, quotation appearance and document defaults.",
        href: "/settings/branding",
        permission: "settings.branding.manage",
      },
    ],
  },

  {
    key: "organisation",
    title: "Organisation",
    description:
      "Branches, roles, access and operating structure.",
    icon: (
      <Users className="h-5 w-5" />
    ),
    cards: [
      {
        name: "Roles & Permissions",
        description:
          "Control who can sell, approve, configure and administer Nexus.",
        href: "/settings/roles",
        permission: "settings.roles.manage",
      },
      {
        name: "Branch Policies",
        description:
          "Stock isolation, branch sales, customer visibility and transfer rules.",
        href: "/settings/branches",
        permission: "settings.branches.manage",
      },
    ],
  },

  {
    key: "finance",
    title: "Finance",
    description:
      "Financial configuration and connected Accounting controls.",
    icon: (
      <CircleDollarSign className="h-5 w-5" />
    ),
    cards: [
      {
        name: "Financial Control Centre",
        description:
          "Currency, financial year, VAT, credit rules and accounting automation.",
        href: "/settings/finance",
        permission: "settings.finance.view",
        status: "Core Settings",
      },
      {
        name: "Accounting",
        description:
          "Open the full Accounting workspace and business performance controls.",
        href: "/accounting",
        permission: "accounting.view",
        status: "Live",
      },
      {
        name: "Expenses & Bills",
        description:
          "Operating expenses such as salaries, rent, fuel and utilities.",
        href: "/accounting/expenses",
        permission: "accounting.view",
      },
      {
        name: "What We Owe",
        description:
          "Supplier bills, unpaid stock purchases and supplier liabilities.",
        href: "/accounting/payables",
        permission: "accounting.view",
      },
      {
        name: "Bank & Clearing",
        description:
          "Card settlements, payment clearing and bank reconciliation.",
        href: "/accounting/bank-reconciliation",
        permission: "accounting.view",
      },
      {
        name: "Inventory Costing",
        description:
          "Weighted-average stock value and Cost of Sales controls.",
        href: "/accounting/inventory-costing",
        permission: "accounting.view",
        status: "Active",
      },
      {
        name: "Performance & Budget",
        description:
          "Profit, margins, forecasts and business budgets.",
        href: "/accounting/performance",
        permission: "accounting.view",
      },
    ],
  },

  {
    key: "pos",
    title: "Sales & POS",
    description:
      "Configure the adaptive selling experience.",
    icon: (
      <ShoppingCart className="h-5 w-5" />
    ),
    cards: [
      {
        name: "Adaptive POS Setup",
        description:
          "Choose Retail, Repair, School, Wholesale, Hospitality or General POS capabilities.",
        href: "/settings/pos",
        permission: "pos.manage",
        status: "Adaptive",
      },
      {
        name: "Open Point of Sale",
        description:
          "Launch the live POS checkout workspace.",
        href: "/pos",
        permission: "pos.view",
        status: "Live",
      },
    ],
  },

  {
    key: "security",
    title: "Security",
    description:
      "Govern sensitive actions and configuration changes.",
    icon: (
      <ShieldCheck className="h-5 w-5" />
    ),
    cards: [
      {
        name: "Security",
        description:
          "Approvals, session controls, escalation protection and safeguards.",
        href: "/settings/security",
        permission: "settings.security.manage",
      },
      {
        name: "Settings Audit",
        description:
          "See who changed configuration and when.",
        href: "/settings/audit",
        permission: "settings.audit.view",
      },
    ],
  },

  {
    key: "system",
    title: "System",
    description:
      "Connections, communications and integrations.",
    icon: (
      <Plug className="h-5 w-5" />
    ),
    cards: [
      {
        name: "System & Integrations",
        description:
          "Email, WhatsApp, banking, APIs, notifications and external systems.",
        href: "/settings/system",
        permission: "settings.integrations.manage",
      },
    ],
  },

  {
    key: "nexus",
    title: "JINLAB Nexus",
    description:
      "Platform ownership, portability and subscription.",
    icon: (
      <Layers3 className="h-5 w-5" />
    ),
    cards: [
      {
        name: "Data & Portability",
        description:
          "Export records, backups and portable business data.",
        href: "/settings/data",
        permission: "data.export",
      },
      {
        name: "Plan & Billing",
        description:
          "Subscription, modules, usage, add-ons and Nexus capabilities.",
        href: "/settings/subscription",
        permission: "settings.subscription.manage",
      },
    ],
  },
];


export default function SettingsPage() {

  const router =
    useRouter();


  const {
    can,
    loading,
    errorMessage,
  } =
    usePermissions();


  const visibleSections =
    useMemo(
      () =>
        sections
          .map(
            (
              section
            ) => ({
              ...section,

              cards:
                section.cards.filter(
                  (
                    card
                  ) =>
                    can(
                      card.permission
                    )
                ),
            })
          )
          .filter(
            (
              section
            ) =>
              section.cards.length >
              0
          ),
      [
        can,
      ]
    );


  const [
    selectedKey,
    setSelectedKey,
  ] =
    useState(
      "company"
    );


  const activeSection =
    visibleSections.find(
      (
        section
      ) =>
        section.key ===
        selectedKey
    ) ??
    visibleSections[0] ??
    null;


  async function logout() {

    await supabase.auth
      .signOut();

    router.replace(
      "/login"
    );
  }


  if (loading) {

    return (
      <DashboardLayout>

        <Navbar
          companyName="JINLAB Nexus"
          userName="Admin"
          onLogout={
            logout
          }
        />


        <main className="mx-auto max-w-7xl p-6 lg:p-8">

          <p className="text-sm text-muted-foreground">
            Loading Settings...
          </p>

        </main>

      </DashboardLayout>
    );
  }


  return (
    <DashboardLayout>

      <Navbar
        companyName="JINLAB Nexus"
        userName="Admin"
        onLogout={
          logout
        }
      />


      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">

        <div className="mb-8">

          <p className="text-sm font-medium text-muted-foreground">
            Company Administration
          </p>


          <h1 className="mt-1 text-3xl font-bold">
            Settings
          </h1>


          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Configure Nexus by area. Select a category instead of scrolling
            through every system setting.
          </p>

        </div>


        {
          errorMessage && (
            <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {
                errorMessage
              }
            </div>
          )
        }


        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">

          <aside className="h-fit rounded-2xl border bg-card p-2 lg:sticky lg:top-4">

            <div className="flex gap-2 overflow-x-auto lg:block lg:space-y-1">

              {
                visibleSections.map(
                  (
                    section
                  ) => {

                    const selected =
                      activeSection?.key ===
                      section.key;


                    return (
                      <button
                        key={
                          section.key
                        }
                        type="button"
                        onClick={() =>
                          setSelectedKey(
                            section.key
                          )
                        }
                        className={
                          selected
                            ? "flex min-w-fit items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-left text-sm font-semibold text-emerald-800 lg:w-full"
                            : "flex min-w-fit items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-muted-foreground transition hover:bg-muted lg:w-full"
                        }
                      >

                        {
                          section.icon
                        }


                        <span className="flex-1 whitespace-nowrap">
                          {
                            section.title
                          }
                        </span>


                        <ChevronRight className="hidden h-4 w-4 lg:block" />

                      </button>
                    );
                  }
                )
              }

            </div>

          </aside>


          {
            activeSection && (
              <section>

                <div className="mb-5">

                  <div className="flex items-center gap-3">

                    <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
                      {
                        activeSection.icon
                      }
                    </div>


                    <div>

                      <h2 className="text-2xl font-bold">
                        {
                          activeSection.title
                        }
                      </h2>


                      <p className="mt-1 text-sm text-muted-foreground">
                        {
                          activeSection.description
                        }
                      </p>

                    </div>

                  </div>

                </div>


                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">

                  {
                    activeSection.cards.map(
                      (
                        card
                      ) => (
                        <button
                          key={
                            card.href
                          }
                          type="button"
                          onClick={() =>
                            router.push(
                              card.href
                            )
                          }
                          className="group rounded-2xl border bg-card p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-sm"
                        >

                          <div className="flex items-start justify-between gap-3">

                            <h3 className="font-semibold">
                              {
                                card.name
                              }
                            </h3>


                            {
                              card.status && (
                                <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wide">
                                  {
                                    card.status
                                  }
                                </span>
                              )
                            }

                          </div>


                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {
                              card.description
                            }
                          </p>


                          <div className="mt-5 border-t pt-3">

                            <span className="text-xs font-semibold text-emerald-700">
                              Open →
                            </span>

                          </div>

                        </button>
                      )
                    )
                  }

                </div>

              </section>
            )
          }

        </div>

      </main>

    </DashboardLayout>
  );
}
