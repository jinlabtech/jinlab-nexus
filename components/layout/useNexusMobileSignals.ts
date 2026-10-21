"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  coreIntelligenceService,
} from "@/lib/services/coreIntelligenceService";

import {
  supabase,
} from "@/lib/supabase";

import type {
  Shipment,
} from "@/lib/shipping/types";

import type {
  CoreAnalysis,
  CoreFinding,
  CoreMetric,
} from "@/lib/intelligence/types";


export type NexusMobileSignals = {
  urgent: number;
  total: number;

  whatsapp: number;
  receivables: number;
  repairs: number;
  inventory: number;

  shipping: number;
  shippingAttention: number;
};


const emptySignals:
  NexusMobileSignals = {
    urgent: 0,
    total: 0,

    whatsapp: 0,
    receivables: 0,
    repairs: 0,
    inventory: 0,

    shipping: 0,
    shippingAttention: 0,
  };


function record(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}


function extractAnalysis(
  value: unknown
): CoreAnalysis | null {
  if (!record(value)) {
    return null;
  }

  const candidate =
    record(value.analysis)
      ? value.analysis
      : value;

  if (
    !Array.isArray(
      candidate.findings
    ) ||
    !Array.isArray(
      candidate.metrics
    )
  ) {
    return null;
  }

  return candidate as unknown as CoreAnalysis;
}


function metricNumber(
  value: unknown
) {
  const match =
    String(
      value ?? ""
    ).match(
      /-?[\d,.]+/
    );

  if (!match) {
    return 0;
  }

  const parsed =
    Number(
      match[0]
        .replaceAll(
          ",",
          ""
        )
    );

  return Number.isFinite(
    parsed
  )
    ? Math.max(
        0,
        Math.round(
          parsed
        )
      )
    : 0;
}


export function useNexusMobileSignals() {
  const [
    signals,
    setSignals,
  ] =
    useState<NexusMobileSignals>(
      emptySignals
    );

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);


  const refresh =
    useCallback(
      async () => {
        const controller =
          new AbortController();

        setRefreshing(
          true
        );

        let next:
          NexusMobileSignals = {
            ...emptySignals,
          };

        try {
          const response =
            await coreIntelligenceService
              .review(
                controller.signal
              );

          const analysis =
            extractAnalysis(
              response
            );

          const findings:
            CoreFinding[] =
              analysis?.findings ??
              [];

          const metrics:
            CoreMetric[] =
              analysis?.metrics ??
              [];


          function count(
            module: string
          ) {
            return findings
              .filter(
                (
                  finding
                ) =>
                  finding.module ===
                  module
              )
              .length;
          }


          function metric(
            id: string
          ) {
            return metricNumber(
              metrics.find(
                (
                  item
                ) =>
                  item.id === id
              )?.value
            );
          }


          next = {
            ...next,

            urgent:
              findings.filter(
                (
                  finding
                ) =>
                  finding.severity ===
                  "high"
              ).length,

            total:
              findings.length,

            whatsapp:
              Math.max(
                count(
                  "whatsapp"
                ),
                metric(
                  "whatsapp.waiting"
                ),
                metric(
                  "whatsapp.followup"
                ),
                metric(
                  "whatsapp.unassigned"
                )
              ),

            receivables:
              count(
                "receivables"
              ),

            repairs:
              count(
                "repairs"
              ),

            inventory:
              count(
                "inventory"
              ),
          };

        } catch {
          /*
           * Core Intelligence may not be available
           * to every role.
           *
           * Mobile navigation must still work.
           */
        }


        try {
          const {
            data: {
              session,
            },
          } =
            await supabase.auth
              .getSession();

          if (session) {
            const response =
              await fetch(
                "/api/shipping",
                {
                  headers: {
                    Authorization:
                      `Bearer ${session.access_token}`,
                  },

                  cache:
                    "no-store",

                  signal:
                    controller.signal,
                }
              );


            if (
              response.ok
            ) {
              const workspace =
                await response.json() as {
                  shipments?: Shipment[];
                };

              const shipments =
                Array.isArray(
                  workspace.shipments
                )
                  ? workspace.shipments
                  : [];


              const active =
                shipments.filter(
                  (
                    shipment
                  ) =>
                    ![
                      "draft",
                      "delivered",
                      "cancelled",
                      "returned",
                    ].includes(
                      shipment.status
                    )
                );


              const attention =
                shipments.filter(
                  (
                    shipment
                  ) =>
                    [
                      "sending",
                      "uncertain",
                    ].includes(
                      shipment.booking_state ??
                      ""
                    ) ||
                    [
                      "failed",
                      "exception",
                      "returned",
                    ].includes(
                      shipment.status
                    )
                );


              next.shipping =
                active.length;

              next.shippingAttention =
                attention.length;
            }
          }

        } catch {
          // Shipping badge simply remains hidden.
        }


        setSignals(
          next
        );

        setRefreshing(
          false
        );


        return () =>
          controller.abort();
      },
      []
    );


  // NEXUS DESKTOP STABILITY: mobile-only signal polling
  useEffect(() => {
    const mobileMedia = window.matchMedia(
      "(max-width: 767px)"
    );

    let refreshTimer: number | undefined;

    const refreshVisibleMobile = () => {
      if (
        mobileMedia.matches &&
        document.visibilityState === "visible"
      ) {
        void refresh();
      }
    };

    const syncViewport = () => {
      if (mobileMedia.matches) {
        if (refreshTimer === undefined) {
          refreshVisibleMobile();

          refreshTimer = window.setInterval(
            refreshVisibleMobile,
            90_000
          );
        }
      } else if (refreshTimer !== undefined) {
        window.clearInterval(refreshTimer);
        refreshTimer = undefined;
      }
    };

    window.addEventListener(
      "focus",
      refreshVisibleMobile
    );

    document.addEventListener(
      "visibilitychange",
      refreshVisibleMobile
    );

    mobileMedia.addEventListener(
      "change",
      syncViewport
    );

    syncViewport();

    return () => {
      window.removeEventListener(
        "focus",
        refreshVisibleMobile
      );

      document.removeEventListener(
        "visibilitychange",
        refreshVisibleMobile
      );

      mobileMedia.removeEventListener(
        "change",
        syncViewport
      );

      if (refreshTimer !== undefined) {
        window.clearInterval(refreshTimer);
      }
    };
  }, [refresh]);


  return {
    signals,
    refreshing,
    refresh,
  };
}
