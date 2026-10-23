"use client";

import {
  Activity,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Gauge,
  Lightbulb,
  Sparkles,
  Target,
  Waypoints,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import type {
  CoreFinding,
  CoreMetric,
} from "@/lib/intelligence/types";

import NexusWidgetBoard from "@/components/dashboard/NexusWidgetBoard";


type Props = {
  findings: CoreFinding[];
  metrics: CoreMetric[];
  checking: boolean;
  analysisReady: boolean;
};


const tips = [
  {
    title:
      "Nexus can review supported business records for you.",
    detail:
      "Core converts operational conditions into findings so you can focus on exceptions and priorities.",
  },

  {
    title:
      "WhatsApp activity can become a Nexus signal.",
    detail:
      "Unread messages, follow-ups and unassigned customer conversations can be surfaced through Intelligence.",
  },

  {
    title:
      "Shipping exceptions can become owner attention.",
    detail:
      "Failed, uncertain and exception delivery states can be surfaced instead of remaining buried in courier tracking.",
  },

  {
    title:
      "Nexus mobile remembers your recent apps.",
    detail:
      "Applications you use recently appear on the phone Home screen so common work stays close.",
  },

  {
    title:
      "You can rearrange Nexus Core.",
    detail:
      "Tap Edit layout above these widgets to move, hide or restore Core surfaces for the way you run your business.",
  },

  {
    title:
      "Nexus Pulse is designed for action.",
    detail:
      "A business finding can take you directly into the relevant Nexus workspace instead of only displaying an alert.",
  },
];


function moduleLabel(
  value: string
) {
  return value
    .replaceAll(
      "_",
      " "
    )
    .replace(
      /\b\w/g,
      (
        letter
      ) =>
        letter.toUpperCase()
    );
}


function severityRank(
  severity: string
) {
  return severity ===
    "high"
    ? 0
    : severity ===
        "medium"
      ? 1
      : 2;
}


export default function NexusCoreExperience({
  findings,
  metrics,
  checking,
  analysisReady,
}: Props) {
  const router =
    useRouter();

  const [
    tipIndex,
    setTipIndex,
  ] =
    useState(0);


  const urgent =
    findings.filter(
      (
        finding
      ) =>
        finding.severity ===
        "high"
    );


  const topFinding =
    useMemo(
      () =>
        [...findings]
          .sort(
            (
              a,
              b
            ) =>
              severityRank(
                a.severity
              ) -
                severityRank(
                  b.severity
                ) ||
              a.id.localeCompare(
                b.id
              )
          )[0] ??
        null,
      [
        findings,
      ]
    );


  const moduleActivity =
    useMemo(
      () => {
        const map =
          new Map<
            string,
            number
          >();

        for (
          const finding
          of findings
        ) {
          map.set(
            finding.module,
            (
              map.get(
                finding.module
              ) ??
              0
            ) +
              1
          );
        }

        return [
          ...map.entries(),
        ]
          .sort(
            (
              a,
              b
            ) =>
              b[1] -
              a[1]
          )
          .slice(
            0,
            6
          );
      },
      [
        findings,
      ]
    );


  useEffect(() => {
    const timer =
      window.setInterval(
        () => {
          if (
            window.matchMedia(
              "(prefers-reduced-motion: reduce)"
            ).matches
          ) {
            return;
          }

          setTipIndex(
            (
              current
            ) =>
              (
                current +
                1
              ) %
              tips.length
          );
        },
        10_000
      );

    return () =>
      window.clearInterval(
        timer
      );
  }, []);


  const tip =
    tips[
      tipIndex
    ];


  const statusWidget = (
    <article className="relative h-full overflow-hidden rounded-2xl border bg-card p-5 text-card-foreground shadow-sm">

      <div className="absolute -right-12 -top-12 size-36 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative">

        <div className="flex items-start justify-between gap-3">

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
              Nexus Core
            </p>

            <h2 className="mt-1 text-lg font-semibold">
              Live status
            </h2>
          </div>


          <span
            className={`flex size-11 items-center justify-center rounded-2xl ${
              urgent.length
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary"
            }`}
          >
            {checking ? (
              <Activity className="size-5 animate-pulse" />
            ) : urgent.length ? (
              <CircleAlert className="size-5" />
            ) : (
              <BrainCircuit className="size-5" />
            )}
          </span>

        </div>


        <strong className="mt-5 block text-2xl tracking-tight">
          {checking
            ? "Reading business"
            : urgent.length
              ? "Needs attention"
              : analysisReady
                ? "Business in view"
                : "Ready"}
        </strong>


        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {checking
            ? "Connecting current business signals."
            : urgent.length
              ? `${urgent.length} high-priority ${
                  urgent.length ===
                  1
                    ? "item needs"
                    : "items need"
                } attention.`
              : "No high-priority finding is currently active."}
        </p>


        <div className="mt-5 grid grid-cols-3 gap-2">

          {[
            [
              findings.length,
              "Signals",
            ],
            [
              urgent.length,
              "Urgent",
            ],
            [
              metrics.length,
              "Measures",
            ],
          ].map(
            (
              item
            ) => (
              <div
                key={
                  item[1]
                }
                className="rounded-xl border bg-background/70 p-3"
              >
                <strong className="block text-xl">
                  {
                    item[0]
                  }
                </strong>

                <small className="text-[9px] text-muted-foreground">
                  {
                    item[1]
                  }
                </small>
              </div>
            )
          )}

        </div>

      </div>

    </article>
  );


  const focusWidget = (
    <article className="h-full rounded-2xl border bg-card p-5 text-card-foreground shadow-sm">

      <div className="flex items-center gap-3">

        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Target className="size-5" />
        </span>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Focus
          </p>

          <h2 className="text-base font-semibold">
            Next best action
          </h2>
        </div>

      </div>


      {topFinding ? (

        <button
          type="button"
          onClick={() =>
            router.push(
              topFinding.href
            )
          }
          className="mt-5 w-full rounded-xl border bg-background/70 p-4 text-left transition hover:bg-muted/60 active:scale-[0.98]"
        >

          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
            {moduleLabel(
              topFinding.module
            )}
          </span>

          <strong className="mt-2 block text-sm">
            {
              topFinding.title
            }
          </strong>

          <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
            {
              topFinding.summary
            }
          </p>

          <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">
            Open action
            <ChevronRight className="size-3.5" />
          </span>

        </button>

      ) : (

        <div className="mt-5 rounded-xl border border-dashed p-5">

          <Sparkles className="size-5 text-primary" />

          <strong className="mt-3 block text-sm">
            Nothing urgent right now
          </strong>

          <p className="mt-1 text-xs text-muted-foreground">
            Nexus will place the next important finding here.
          </p>

        </div>

      )}

    </article>
  );


  const modulesWidget = (
    <article className="h-full rounded-2xl border bg-card p-5 text-card-foreground shadow-sm">

      <div className="flex items-center gap-3">

        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Waypoints className="size-5" />
        </span>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Activity
          </p>

          <h2 className="text-base font-semibold">
            Nexus modules
          </h2>
        </div>

      </div>


      {moduleActivity.length ? (

        <div className="mt-5 flex flex-wrap gap-2">

          {moduleActivity.map(
            ([
              module,
              count,
            ]) => (

              <button
                key={
                  module
                }
                type="button"
                onClick={() => {
                  const finding =
                    findings.find(
                      (
                        item
                      ) =>
                        item.module ===
                        module
                    );

                  if (
                    finding?.href
                  ) {
                    router.push(
                      finding.href
                    );
                  }
                }}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border bg-background/70 px-3 text-xs font-medium transition active:scale-95"
              >

                <span className="size-1.5 rounded-full bg-primary" />

                {
                  moduleLabel(
                    module
                  )
                }

                <strong className="rounded-full bg-muted px-1.5 py-0.5 text-[9px]">
                  {
                    count
                  }
                </strong>

              </button>

            )
          )}

        </div>

      ) : (

        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
          Module activity appears here as Nexus identifies business findings.
        </p>

      )}


      {metrics.length >
        0 && (

        <div className="mt-5 border-t pt-4">

          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Live measures
          </p>

          <div className="space-y-2">

            {metrics
              .slice(
                0,
                4
              )
              .map(
                (
                  metric
                ) => (

                  <div
                    key={
                      metric.id
                    }
                    className="flex items-center justify-between gap-3 rounded-lg bg-muted/35 px-3 py-2"
                  >

                    <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                      {
                        metric.label
                      }
                    </span>

                    <strong className="shrink-0 text-xs">
                      {
                        metric.value
                      }
                    </strong>

                  </div>

                )
              )}

          </div>

        </div>

      )}

    </article>
  );


  const learnWidget = (
    <article className="relative h-full overflow-hidden rounded-2xl border bg-card p-5 text-card-foreground shadow-sm">

      <div className="absolute right-0 top-0 size-40 rounded-full bg-primary/[0.06] blur-3xl" />

      <div className="relative">

        <div className="flex items-center justify-between gap-3">

          <div className="flex items-center gap-3">

            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Lightbulb className="size-5" />
            </span>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                Learn Nexus
              </p>

              <h2 className="text-base font-semibold">
                Did you know?
              </h2>
            </div>

          </div>


          <span className="text-[10px] text-muted-foreground">
            {tipIndex +
              1}
            /
            {
              tips.length
            }
          </span>

        </div>


        <div
          key={
            tipIndex
          }
          className="mt-5 animate-in fade-in duration-300"
        >

          <strong className="text-lg leading-tight">
            {
              tip.title
            }
          </strong>

          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {
              tip.detail
            }
          </p>

        </div>


        <div className="mt-5 flex items-center gap-2">

          <button
            type="button"
            onClick={() =>
              setTipIndex(
                (
                  current
                ) =>
                  (
                    current -
                    1 +
                    tips.length
                  ) %
                  tips.length
              )
            }
            className="flex size-9 items-center justify-center rounded-xl border bg-background active:scale-90"
          >
            <ChevronLeft className="size-4" />
          </button>


          <div className="flex flex-1 gap-1">

            {tips.map(
              (
                _,
                index
              ) => (

                <button
                  key={
                    index
                  }
                  type="button"
                  aria-label={`Tip ${
                    index +
                    1
                  }`}
                  onClick={() =>
                    setTipIndex(
                      index
                    )
                  }
                  className={`h-1.5 flex-1 rounded-full ${
                    index ===
                    tipIndex
                      ? "bg-primary"
                      : "bg-muted"
                  }`}
                />

              )
            )}

          </div>


          <button
            type="button"
            onClick={() =>
              setTipIndex(
                (
                  current
                ) =>
                  (
                    current +
                    1
                  ) %
                  tips.length
              )
            }
            className="flex size-9 items-center justify-center rounded-xl border bg-background active:scale-90"
          >
            <ChevronRight className="size-4" />
          </button>

        </div>

      </div>

    </article>
  );


  const stateWidget = (
    <article className="h-full rounded-2xl border bg-card p-5 text-card-foreground shadow-sm">

      <div className="flex items-center gap-3">

        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Gauge className="size-5" />
        </span>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Core
          </p>

          <h2 className="text-base font-semibold">
            Intelligence state
          </h2>
        </div>

      </div>


      <div className="mt-5 flex items-center justify-between">

        <span className="text-xs text-muted-foreground">
          Business review
        </span>

        <strong className="text-xs">
          {checking
            ? "Reading"
            : analysisReady
              ? "Ready"
              : "Waiting"}
        </strong>

      </div>


      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">

        <div
          className={`h-full rounded-full bg-primary transition-all duration-500 ${
            checking
              ? "w-2/3 animate-pulse"
              : analysisReady
                ? "w-full"
                : "w-1/4"
          }`}
        />

      </div>


      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        Core combines supported records into one operational view so important conditions can come to you.
      </p>

    </article>
  );


  return (
    <NexusWidgetBoard
      storageKey="nexus.core.widget-layout.v1"
      eyebrow="Customize Core"
      description="Move, hide or restore your Nexus Core widgets."
      items={[
        {
          id:
            "core-status",
          title:
            "Core Status",
          content:
            statusWidget,
        },

        {
          id:
            "core-focus",
          title:
            "Next Best Action",
          content:
            focusWidget,
        },

        {
          id:
            "core-modules",
          title:
            "Module Activity",
          content:
            modulesWidget,
        },

        {
          id:
            "core-learn",
          title:
            "Learn Nexus",
          content:
            learnWidget,
          className:
            "lg:col-span-2",
        },

        {
          id:
            "core-state",
          title:
            "Intelligence State",
          content:
            stateWidget,
        },
      ]}
    />
  );
}
