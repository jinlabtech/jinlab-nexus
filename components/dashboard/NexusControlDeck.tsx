"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import type { CoreFinding, CoreMetric, CoreModule } from "@/lib/intelligence/types";

import {
  Activity,
  Bell,
  CheckCircle2,
  ChevronDown,
  Database,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
} from "lucide-react";


export type DashboardSurface =
  | "priorities"
  | "metrics"
  | "coverage";


type SelectedSurface =
  | "pulse"
  | DashboardSurface
  | "refresh";


type Props = {
  findings: number;
  intelligenceFindings: CoreFinding[];
  intelligenceMetrics: CoreMetric[];
  urgent: number;

  metricCount: number;

  readyCoverage: number;
  totalCoverage: number;
  coverageGaps: number;

  checking: boolean;
  analysisReady: boolean;

  onRefresh: () => void;

  onSelect: (
    target: DashboardSurface
  ) => void;
};


type PulseTone =
  | "normal"
  | "attention"
  | "success"
  | "working";


type PulseItem = {
  id: string;
  title: string;
  detail: string;
  tone: PulseTone;
};


export default function NexusControlDeck({
  findings,
  intelligenceFindings,
  intelligenceMetrics,
  urgent,
  metricCount,
  readyCoverage,
  totalCoverage,
  coverageGaps,
  checking,
  analysisReady,
  onRefresh,
  onSelect,
}: Props) {

  const router = useRouter();
  const [
    selected,
    setSelected,
  ] =
    useState<SelectedSurface>(
      "pulse"
    );


  const [
    pulseOpen,
    setPulseOpen,
  ] =
    useState(false);


  const [arrivalVisible, setArrivalVisible] = useState(false);
  const hasArrived = useRef(false);

  const urgentFindings = useMemo(
    () =>
      intelligenceFindings
        .filter((item) => item.severity === "high")
        .slice(0, 3),
    [intelligenceFindings],
  );

  useEffect(() => {
    if (hasArrived.current || checking || !analysisReady) return;

    hasArrived.current = true;

    if (urgent > 0) {
      setPulseOpen(true);
    }

    if (urgentFindings.length > 0) {
      setArrivalVisible(true);

      const timer = window.setTimeout(
        () => setArrivalVisible(false),
        6500,
      );

      return () => window.clearTimeout(timer);
    }
  }, [analysisReady, checking, urgent, urgentFindings]);


  const coveragePercentage =
    totalCoverage > 0
      ? Math.round(
          (
            readyCoverage /
            totalCoverage
          ) * 100
        )
      : 0;


  const whatsappFindings = useMemo(() => intelligenceFindings.filter((item) => item.module === "whatsapp").slice(0, 4), [intelligenceFindings]);

  const canvasFindings = useMemo(() => {
    const severities = ["high", "medium", "low"] as const;
    const moduleOrder: CoreModule[] = [
      "receivables",
      "whatsapp",
      "repairs",
      "inventory",
      "purchasing",
      "quotations",
      "controls",
    ];

    const ordered: CoreFinding[] = [];

    for (const severity of severities) {
      const group = intelligenceFindings
        .filter((item) => item.severity === severity)
        .sort(
          (a, b) =>
            moduleOrder.indexOf(a.module) -
              moduleOrder.indexOf(b.module) ||
            a.id.localeCompare(b.id),
        );

      const seen = new Set<CoreModule>();

      for (const finding of group) {
        if (!seen.has(finding.module)) {
          ordered.push(finding);
          seen.add(finding.module);
        }
      }

      for (const finding of group) {
        if (!ordered.some((item) => item.id === finding.id)) {
          ordered.push(finding);
        }
      }
    }

    return ordered.slice(0, 5);
  }, [intelligenceFindings]);

  const whatsappMetric = (id: string) =>
    intelligenceMetrics.find((metric) => metric.id === id)?.value ?? "—";


  const pulseItems =
    useMemo<PulseItem[]>(
      () => {

        const items:
          PulseItem[] = [];


        if (checking) {

          items.push({
            id:
              "checking",

            title:
              "Nexus is reviewing your business",

            detail:
              "New information will appear here when the review finishes.",

            tone:
              "working",
          });

        }


        if (
          urgent > 0
        ) {

          items.push({
            id:
              "urgent",

            title:
              `${urgent} high-priority ${
                urgent === 1
                  ? "item"
                  : "items"
              }`,

            detail:
              "These deserve attention before the lower-priority findings.",

            tone:
              "attention",
          });

        }


        if (
          coverageGaps > 0
        ) {

          items.push({
            id:
              "coverage",

            title:
              `${coverageGaps} ${
                coverageGaps === 1
                  ? "area has"
                  : "areas have"
              } incomplete coverage`,

            detail:
              "Nexus will keep the limitation visible instead of assuming missing data.",

            tone:
              "normal",
          });

        }


        if (
          analysisReady &&
          findings > 0
        ) {

          items.push({
            id:
              "findings",

            title:
              `${findings} ${
                findings === 1
                  ? "finding"
                  : "findings"
              } ready to review`,

            detail:
              "Open priorities to see the evidence behind each finding.",

            tone:
              "normal",
          });

        }


        if (
          analysisReady &&
          !checking &&
          urgent === 0 &&
          coverageGaps === 0
        ) {

          items.push({
            id:
              "healthy",

            title:
              "Review completed",

            detail:
              "No high-priority exception or coverage gap is currently being surfaced.",

            tone:
              "success",
          });

        }


        if (
          items.length === 0
        ) {

          items.push({
            id:
              "ready",

            title:
              "Nexus is ready",

            detail:
              "Run a business review when you want an updated picture.",

            tone:
              "normal",
          });

        }


        return items.slice(
          0,
          4
        );

      },
      [
        checking,
        urgent,
        coverageGaps,
        analysisReady,
        findings,
      ]
    );


  function selectSurface(
    target:
      DashboardSurface
  ) {

    setSelected(
      target
    );

    onSelect(
      target
    );

  }


  function refresh() {

    setSelected(
      "refresh"
    );

    onRefresh();

  }


  return (

    <section
      className="nexus-control-deck"
      aria-label="Nexus Control Centre"
    >

      {arrivalVisible && urgentFindings.length > 0 && (
        <div
          className="nexus-arrival-notifications"
          aria-live="polite"
        >
          <div className="nexus-arrival-notifications__heading">
            <span className="nexus-arrival-notifications__signal">
              <Bell />
            </span>
            <span>
              <strong>Nexus Intelligence</strong>
              <small>New priorities detected</small>
            </span>
          </div>

          {urgentFindings.map((finding, index) => (
            <button
              key={finding.id}
              type="button"
              className="nexus-arrival-notification"
              style={{ animationDelay: `${160 + index * 120}ms` }}
              onClick={() => {
                setArrivalVisible(false);
                router.push(finding.href);
              }}
            >
              <span className="nexus-arrival-notification__dot" />
              <span>
                <strong>{finding.title}</strong>
                <small>{finding.summary}</small>
              </span>
            </button>
          ))}
        </div>
      )}

      <div
        className="nexus-pulse"
        data-open={
          pulseOpen
            ? "true"
            : "false"
        }
      >

        <button
          type="button"
          className="nexus-pulse__trigger"
          aria-expanded={
            pulseOpen
          }
          onClick={() => {
            setSelected(
              "pulse"
            );

            setPulseOpen(
              (
                value
              ) => !value
            );
          }}
        >

          <span className="nexus-pulse__identity">

            <span className="nexus-pulse__orb">
              <Bell />
            </span>

            <span className="min-w-0">

              <strong>
                Nexus Pulse
              </strong>

              <span
                className="nexus-pulse__summary"
                aria-live="polite"
              >

                {
                  checking
                    ? "Reviewing your business…"
                    : urgent > 0
                      ? `${urgent} high-priority ${
                          urgent === 1
                            ? "item"
                            : "items"
                        } need attention`
                      : coverageGaps > 0
                        ? `${coverageGaps} coverage ${
                            coverageGaps === 1
                              ? "gap"
                              : "gaps"
                          }`
                        : analysisReady
                          ? "Business review is up to date"
                          : "Ready when you are"
                }

              </span>

            </span>

          </span>


          <span className="nexus-pulse__right">

            {
              checking && (
                <RefreshCw className="nexus-pulse__spinner" />
              )
            }

            <ChevronDown
              className="nexus-pulse__chevron"
            />

          </span>

        </button>


        {
          pulseOpen && (

            <div
              className="nexus-pulse__stack"
              aria-live="polite"
            >

              {whatsappFindings.map((finding) => (
                <button
                  key={finding.id}
                  type="button"
                  className="nexus-pulse-item nexus-pulse-item--action"
                  data-tone={finding.severity === "high" || finding.severity === "medium" ? "attention" : "normal"}
                  onClick={() => router.push(finding.href)}
                >
                  <span className="nexus-pulse-item__icon"><Bell /></span>
                  <span>
                    <strong>{finding.title}</strong>
                    <small>{finding.summary}</small>
                  </span>
                </button>
              ))}

              {
                pulseItems.map(
                  (
                    item,
                    index
                  ) => (

                    <div
                      key={
                        item.id
                      }
                      className="nexus-pulse-item"
                      data-tone={
                        item.tone
                      }
                      style={{
                        animationDelay:
                          `${index * 55}ms`,
                      }}
                    >

                      <span className="nexus-pulse-item__icon">

                        {
                          item.tone ===
                            "attention"
                            ? (
                              <ShieldAlert />
                            )
                            : item.tone ===
                                "success"
                              ? (
                                <CheckCircle2 />
                              )
                              : item.tone ===
                                  "working"
                                ? (
                                  <RefreshCw className="animate-spin" />
                                )
                                : (
                                  <Activity />
                                )
                        }

                      </span>


                      <span>

                        <strong>
                          {
                            item.title
                          }
                        </strong>

                        <small>
                          {
                            item.detail
                          }
                        </small>

                      </span>

                    </div>

                  )
                )
              }

            </div>

          )
        }

      </div>


      <div
        className="nexus-intelligence-canvas"
        data-checking={checking ? "true" : "false"}
      >
        <div
          className="nexus-canvas__ambient"
          aria-hidden="true"
        />

        <div
          className="nexus-canvas__signal-field"
          aria-label="Live Nexus business signals"
        >
          {canvasFindings.map((finding, index) => (
            <button
              key={finding.id}
              type="button"
              className="nexus-canvas-signal"
              data-severity={finding.severity}
              style={{
                animationDelay: `${140 + index * 110}ms`,
              }}
              onClick={() => router.push(finding.href)}
            >
              <span className="nexus-canvas-signal__dot" />

              <span className="nexus-canvas-signal__copy">
                <small>{finding.module}</small>
                <strong>{finding.title}</strong>
              </span>
            </button>
          ))}
        </div>

        <div className="nexus-canvas__core">
          <div
            className="nexus-canvas__rings"
            aria-hidden="true"
          >
            <i />
            <i />
            <i />
          </div>

          <button
            type="button"
            className="nexus-canvas__orb"
            aria-label="Open Nexus priorities"
            onClick={() => selectSurface("priorities")}
          >
            {checking ? (
              <RefreshCw className="animate-spin" />
            ) : (
              <Activity />
            )}
          </button>

          <span className="nexus-canvas__live">
            <i />
            Nexus live
          </span>

          <strong className="nexus-canvas__headline">
            {checking
              ? "Reading your business"
              : urgent > 0
                ? `${urgent} priorities need your attention`
                : analysisReady
                  ? "Your business is in view"
                  : "Nexus is ready"}
          </strong>

          <p className="nexus-canvas__description">
            {checking
              ? "Connecting the latest business signals across Nexus."
              : urgent > 0
                ? "Tap a live signal or ask Nexus what deserves attention first."
                : "Explore a live signal or ask Nexus about what is happening."}
          </p>
        </div>

        <div
          className="nexus-canvas__dock"
          aria-label="Nexus business controls"
        >
          <button
            type="button"
            data-selected={selected === "priorities"}
            onClick={() => selectSurface("priorities")}
          >
            <ShieldAlert />
            <span>
              <strong>{urgent}</strong>
              <small>Urgent</small>
            </span>
          </button>

          <button
            type="button"
            data-selected={selected === "priorities"}
            onClick={() => selectSurface("priorities")}
          >
            <Activity />
            <span>
              <strong>{findings}</strong>
              <small>Signals</small>
            </span>
          </button>

          <button
            type="button"
            data-selected={selected === "metrics"}
            onClick={() => selectSurface("metrics")}
          >
            <SlidersHorizontal />
            <span>
              <strong>{metricCount}</strong>
              <small>Measures</small>
            </span>
          </button>

          <button
            type="button"
            data-selected={selected === "coverage"}
            onClick={() => selectSurface("coverage")}
          >
            <Database />
            <span>
              <strong>{coveragePercentage}%</strong>
              <small>Coverage</small>
            </span>
          </button>

          <button
            type="button"
            data-selected={selected === "refresh"}
            disabled={checking}
            onClick={refresh}
          >
            <RefreshCw className={checking ? "animate-spin" : ""} />
            <span>
              <strong>{checking ? "Reading" : "Refresh"}</strong>
              <small>Nexus</small>
            </span>
          </button>
        </div>

        <button
          type="button"
          className="nexus-whatsapp-rail"
          onClick={() => router.push("/whatsapp")}
        >
          <span>
            <strong>WhatsApp Sales</strong>
            <small>Live conversation intelligence</small>
          </span>

          <span><b>{whatsappMetric("whatsapp.open")}</b> open</span>
          <span><b>{whatsappMetric("whatsapp.followup")}</b> follow-up</span>
          <span><b>{whatsappMetric("whatsapp.unassigned")}</b> unassigned</span>
          <span><b>{whatsappMetric("whatsapp.waiting")}</b> waiting</span>
        </button>
      </div>

    </section>

  );
}
