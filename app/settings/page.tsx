"use client";

import { useRouter } from "next/navigation";

import DashboardLayout from "@/components/layout/DashboardLayout";
import Navbar from "@/components/Navbar";

import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/lib/supabase";

import type { PermissionName } from "@/types/permissions";

type SettingsCard = {
  name: string;
  description: string;
  href: string;
  permission: PermissionName;
  status?: string;
};

type SettingsSection = {
  title: string;
  description: string;
  cards: SettingsCard[];
};

const sections: SettingsSection[] = [
  {
    title: "Company",
    description:
      "Your organisation's identity and document presentation.",
    cards: [
      {
        name: "Company Profile",
        description:
          "Legal business identity, trading information, registration details, addresses and contact information.",
        href: "/settings/company",
        permission: "settings.company.manage",
      },
      {
        name: "Branding & Documents",
        description:
          "Logo, document display name, invoice and quotation appearance, footers and document defaults.",
        href: "/settings/branding",
        permission: "settings.branding.manage",
      },
    ],
  },

  {
    title: "Organisation",
    description:
      "Control staff authority and how branches operate.",
    cards: [
      {
        name: "Roles & Permissions",
        description:
          "Control who can view, create, approve, manage or administer sensitive areas of Nexus.",
        href: "/settings/roles",
        permission: "settings.roles.manage",
      },
      {
        name: "Branch Policies",
        description:
          "Stock isolation, customer visibility, branch requirements, transfers and branch document rules.",
        href: "/settings/branches",
        permission: "settings.branches.manage",
      },
    ],
  },

  {
    title: "Finance & Accounting",
    description:
      "The financial rules that control transactions and Nexus Accountant.",
    cards: [
      {
        name: "Financial Control Centre",
        description:
          "Financial year, currency, VAT, payment terms, accounting policies, automation and Nexus Accountant.",
        href: "/settings/finance",
        permission: "settings.finance.view",
        status: "Database Connected",
      },
    ],
  },

  {
    title: "Security & Governance",
    description:
      "Protect the company and review administrative activity.",
    cards: [
      {
        name: "Security",
        description:
          "Sensitive action approvals, session rules, role escalation protection and administrative safeguards.",
        href: "/settings/security",
        permission: "settings.security.manage",
      },
      {
        name: "Settings Audit",
        description:
          "See configuration changes, who changed them and when they were changed.",
        href: "/settings/audit",
        permission: "settings.audit.view",
      },
    ],
  },

  {
    title: "System & Connections",
    description:
      "Communication and external systems connected to Nexus.",
    cards: [
      {
        name: "System & Integrations",
        description:
          "Notifications, email, WhatsApp, banking connections, APIs and external services.",
        href: "/settings/system",
        permission: "settings.integrations.manage",
      },
    ],
  },

  {
    title: "JINLAB Nexus",
    description:
      "Subscription ownership and enabled Nexus capabilities.",
    cards: [
      {
        name: "Data & Portability",
        description:
          "Export company records, download portable backups and prepare business data for migration to another system.",
        href: "/settings/data",
        permission: "data.export",
      },
      {
        name: "Plan & Billing",
        description:
          "Subscription, modules, usage, add-ons, Nexus Vision and platform branding entitlement.",
        href: "/settings/subscription",
        permission: "settings.subscription.manage",
      },
    ],
  },
];

export default function SettingsPage() {
  const router = useRouter();

  const {
    can,
    loading,
    errorMessage,
  } = usePermissions();

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const allCards = sections.flatMap(
    (section) => section.cards
  );

  const accessibleCards = allCards.filter(
    (card) => can(card.permission)
  );

  if (loading) {
    return (
      <DashboardLayout>
        <Navbar
          companyName="JINLAB Nexus"
          userName="Admin"
          onLogout={logout}
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
        onLogout={logout}
      />

      <main className="mx-auto max-w-7xl p-6 lg:p-8">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Company Administration
            </p>

            <h1 className="mt-1 text-3xl font-bold">
              Settings
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Configure how your company operates
              across JINLAB Nexus. Each area below
              controls a distinct part of the system.
            </p>
          </div>

          <div className="rounded-xl border bg-card px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Access
            </p>

            <p className="mt-1 text-2xl font-bold">
              {accessibleCards.length}/{allCards.length}
            </p>

            <p className="text-xs text-muted-foreground">
              settings areas available
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        <div className="space-y-10">
          {sections.map((section) => {
            const visibleCards =
              section.cards.filter(
                (card) => can(card.permission)
              );

            if (visibleCards.length === 0) {
              return null;
            }

            return (
              <section key={section.title}>
                <div className="mb-4">
                  <h2 className="text-lg font-semibold">
                    {section.title}
                  </h2>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {section.description}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {visibleCards.map((card) => (
                    <button
                      key={card.name}
                      type="button"
                      onClick={() =>
                        router.push(card.href)
                      }
                      className="group rounded-xl border bg-card p-5 text-left transition hover:border-foreground/30 hover:bg-muted/30"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold">
                          {card.name}
                        </h3>

                        {card.status && (
                          <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wide">
                            {card.status}
                          </span>
                        )}
                      </div>

                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {card.description}
                      </p>

                      <div className="mt-5 border-t pt-3">
                        <span className="text-xs font-medium">
                          Configure →
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </DashboardLayout>
  );
}
