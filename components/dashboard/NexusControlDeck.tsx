"use client";

import {
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import type { CoreFinding } from "@/lib/intelligence/types";

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


      <div className="nexus-deck-grid">

        <button
          type="button"
          className="nexus-deck-card nexus-deck-card--hero"
          data-selected={
            selected ===
            "priorities"
          }
          onClick={() =>
            selectSurface(
              "priorities"
            )
          }
        >

          <span className="nexus-deck-card__icon">
            <Activity />
          </span>


          <span className="nexus-deck-card__content">

            <span className="nexus-deck-card__eyebrow">
              Business review
            </span>

            <strong className="nexus-deck-card__value">
              {
                findings
              }
            </strong>

            <span className="nexus-deck-card__label">
              {
                findings === 1
                  ? "finding"
                  : "findings"
              }
            </span>

            <small>
              Select to open your current priorities.
            </small>

          </span>

        </button>


        <button
          type="button"
          className="nexus-deck-card nexus-deck-card--urgent"
          data-selected={
            selected ===
              "priorities" &&
            urgent > 0
          }
          onClick={() =>
            selectSurface(
              "priorities"
            )
          }
        >

          <span className="nexus-deck-card__icon">
            <ShieldAlert />
          </span>

          <span className="nexus-deck-card__content">

            <span className="nexus-deck-card__eyebrow">
              Needs attention
            </span>

            <strong className="nexus-deck-card__value">
              {
                urgent
              }
            </strong>

            <span className="nexus-deck-card__label">
              High priority
            </span>

          </span>

        </button>


        <button
          type="button"
          className="nexus-deck-card nexus-deck-card--coverage"
          data-selected={
            selected ===
            "coverage"
          }
          onClick={() =>
            selectSurface(
              "coverage"
            )
          }
        >

          <span className="nexus-deck-card__icon">
            <Database />
          </span>


          <span className="nexus-deck-card__content">

            <span className="nexus-deck-card__eyebrow">
              Data coverage
            </span>

            <strong className="nexus-deck-card__value">
              {
                coveragePercentage
              }%
            </strong>

            <span className="nexus-deck-card__label">
              {
                readyCoverage
              }
              /
              {
                totalCoverage
              } areas ready
            </span>

            <span className="nexus-deck-progress">

              <span
                style={{
                  width:
                    `${coveragePercentage}%`,
                }}
              />

            </span>

          </span>

        </button>


        <button
          type="button"
          className="nexus-deck-card nexus-deck-card--metrics"
          data-selected={
            selected ===
            "metrics"
          }
          onClick={() =>
            selectSurface(
              "metrics"
            )
          }
        >

          <span className="nexus-deck-card__icon">
            <SlidersHorizontal />
          </span>


          <span className="nexus-deck-card__content">

            <span className="nexus-deck-card__eyebrow">
              Business measures
            </span>

            <strong className="nexus-deck-card__value">
              {
                metricCount
              }
            </strong>

            <span className="nexus-deck-card__label">
              Live measures
            </span>

            <small>
              Open the measures Nexus could calculate.
            </small>

          </span>

        </button>


        <button
          type="button"
          className="nexus-deck-card nexus-deck-card--refresh"
          data-selected={
            selected ===
            "refresh"
          }
          disabled={
            checking
          }
          onClick={
            refresh
          }
        >

          <span className="nexus-deck-card__icon">

            <RefreshCw
              className={
                checking
                  ? "animate-spin"
                  : ""
              }
            />

          </span>

          <span className="nexus-deck-card__content">

            <span className="nexus-deck-card__eyebrow">
              Nexus Core
            </span>

            <strong className="nexus-deck-card__action">
              {
                checking
                  ? "Reviewing…"
                  : "Refresh review"
              }
            </strong>

            <small>
              Recheck the latest business records.
            </small>

          </span>

        </button>

      </div>

    </section>

  );
}
