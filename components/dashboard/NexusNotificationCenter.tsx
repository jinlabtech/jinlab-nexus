"use client";

import {
  BellRing,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  MessageCircle,
  Package,
  Users,
  Wrench,
} from "lucide-react";

import {
  useMemo,
} from "react";

import {
  useRouter,
} from "next/navigation";

import type {
  CoreFinding,
} from "@/lib/intelligence/types";

import NexusShippingAlerts from "@/components/dashboard/NexusShippingAlerts";

type Props = {
  findings: CoreFinding[];
  checking?: boolean;
};

function icon(
  module: string
) {
  if (
    module ===
    "receivables"
  ) {
    return (
      <Users className="size-4" />
    );
  }

  if (
    module ===
    "whatsapp"
  ) {
    return (
      <MessageCircle className="size-4" />
    );
  }

  if (
    module ===
    "repairs"
  ) {
    return (
      <Wrench className="size-4" />
    );
  }

  return (
    <Package className="size-4" />
  );
}

export default function NexusNotificationCenter({
  findings,
  checking = false,
}: Props) {
  const router =
    useRouter();

  const notifications =
    useMemo(
      () =>
        [...findings]
          .sort((a, b) => {
            const rank = {
              high: 0,
              medium: 1,
              low: 2,
            };

            return (
              rank[a.severity] -
              rank[b.severity]
            );
          })
          .slice(0, 8),
      [findings]
    );

  const urgent =
    notifications.filter(
      (item) =>
        item.severity ===
        "high"
    ).length;

  return (
    <section className="h-full overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
      <header className="flex items-start justify-between gap-3 border-b p-4">
        <div className="flex items-center gap-3">
          <span className="relative flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <BellRing className="size-5" />

            {urgent >
              0 && (
              <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                {urgent}
              </span>
            )}
          </span>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">
              Nexus Notifications
            </p>

            <h3 className="mt-1 font-semibold">
              Business attention
            </h3>
          </div>
        </div>

        {checking ? (
          <span className="text-xs text-muted-foreground">
            Reading…
          </span>
        ) : (
          <CheckCheck className="size-4 text-muted-foreground" />
        )}
      </header>

      <NexusShippingAlerts />

      <div className="max-h-[400px] overflow-y-auto">
        {notifications.length ===
        0 ? (
          <div className="p-6 text-center">
            <CheckCheck className="mx-auto size-6 text-muted-foreground" />

            <p className="mt-3 text-sm font-semibold">
              No current priorities
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              New Nexus findings will appear here.
            </p>
          </div>
        ) : (
          notifications.map(
            (
              finding
            ) => (
              <button
                key={
                  finding.id
                }
                type="button"
                onClick={() =>
                  router.push(
                    finding.href
                  )
                }
                className="flex w-full items-start gap-3 border-b p-4 text-left transition last:border-b-0 hover:bg-muted/40"
              >
                <span
                  className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${
                    finding.severity ===
                    "high"
                      ? "bg-destructive/10 text-destructive"
                      : finding.severity ===
                          "medium"
                        ? "bg-amber-500/10 text-amber-600"
                        : "bg-primary/10 text-primary"
                  }`}
                >
                  {finding.severity ===
                  "high" ? (
                    <CircleAlert className="size-4" />
                  ) : (
                    icon(
                      finding.module
                    )
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                    {
                      finding.module
                    }
                  </span>

                  <strong className="mt-1 block text-sm">
                    {
                      finding.title
                    }
                  </strong>

                  <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {
                      finding.summary
                    }
                  </span>
                </span>

                <ChevronRight className="mt-2 size-4 shrink-0 text-muted-foreground" />
              </button>
            )
          )
        )}
      </div>
    </section>
  );
}
