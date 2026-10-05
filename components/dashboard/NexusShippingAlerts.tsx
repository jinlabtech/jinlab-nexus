"use client";

import {
  AlertTriangle,
  Package,
  RefreshCw,
  Truck,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  supabase,
} from "@/lib/supabase";

import type {
  Shipment,
} from "@/lib/shipping/types";

type Workspace = {
  shipments?: Shipment[];
};

export default function NexusShippingAlerts() {
  const router =
    useRouter();

  const [
    shipments,
    setShipments,
  ] =
    useState<Shipment[]>([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  const load =
    useCallback(
      async () => {
        setLoading(true);
        setError("");

        try {
          const {
            data: {
              session,
            },
          } =
            await supabase.auth
              .getSession();

          if (!session) {
            throw new Error(
              "Please sign in to Nexus."
            );
          }

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
              }
            );

          const result =
            await response.json();

          if (!response.ok) {
            throw new Error(
              result.error ||
                "Shipping could not be loaded."
            );
          }

          const workspace =
            result as Workspace;

          setShipments(
            Array.isArray(
              workspace.shipments
            )
              ? workspace.shipments
              : []
          );
        } catch (failure) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Shipping unavailable."
          );
        } finally {
          setLoading(false);
        }
      },
      []
    );

  useEffect(() => {
    void load();
  }, [load]);

  const active =
    useMemo(
      () =>
        shipments.filter(
          (shipment) =>
            ![
              "draft",
              "delivered",
              "cancelled",
              "returned",
            ].includes(
              shipment.status
            )
        ),
      [shipments]
    );

  const attention =
    useMemo(
      () =>
        shipments.filter(
          (shipment) =>
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
        ),
      [shipments]
    );

  const awaiting =
    active.filter(
      (shipment) =>
        shipment.status ===
        "booked"
    );

  const moving =
    active.filter(
      (shipment) =>
        [
          "collected",
          "in_transit",
          "out_for_delivery",
        ].includes(
          shipment.status
        )
    );

  if (loading) {
    return (
      <div className="flex items-center gap-2 border-b px-4 py-4 text-xs text-muted-foreground">
        <RefreshCw className="size-4 animate-spin" />
        Checking shipments…
      </div>
    );
  }

  return (
    <div className="border-b p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Shipping
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Live delivery operations
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            router.push(
              "/shipping/shipments"
            )
          }
          className="text-xs font-semibold text-primary"
        >
          Open
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          {error}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border bg-background p-3">
              <Truck className="size-4 text-primary" />
              <strong className="mt-2 block text-xl">
                {active.length}
              </strong>
              <small className="text-muted-foreground">
                Outstanding
              </small>
            </div>

            <div className="rounded-xl border bg-background p-3">
              <Package className="size-4 text-primary" />
              <strong className="mt-2 block text-xl">
                {moving.length}
              </strong>
              <small className="text-muted-foreground">
                In transit
              </small>
            </div>

            <div className="rounded-xl border bg-background p-3">
              <Package className="size-4 text-primary" />
              <strong className="mt-2 block text-xl">
                {awaiting.length}
              </strong>
              <small className="text-muted-foreground">
                Awaiting collection
              </small>
            </div>

            <div
              className={`rounded-xl border p-3 ${
                attention.length
                  ? "border-destructive/30 bg-destructive/5"
                  : "bg-background"
              }`}
            >
              <AlertTriangle
                className={`size-4 ${
                  attention.length
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              />

              <strong className="mt-2 block text-xl">
                {attention.length}
              </strong>

              <small className="text-muted-foreground">
                Need attention
              </small>
            </div>
          </div>

          {attention.length >
            0 && (
            <div className="mt-3 space-y-2">
              {attention
                .slice(0, 3)
                .map(
                  (
                    shipment
                  ) => (
                    <button
                      key={
                        shipment.id
                      }
                      type="button"
                      onClick={() =>
                        router.push(
                          "/shipping/shipments"
                        )
                      }
                      className="flex w-full items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-left"
                    >
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />

                      <span>
                        <strong className="block text-xs">
                          {
                            shipment.shipment_number
                          }
                        </strong>

                        <small className="text-muted-foreground">
                          {
                            shipment.recipient_name
                          }
                          {" · "}
                          {shipment.status.replaceAll(
                            "_",
                            " "
                          )}
                        </small>
                      </span>
                    </button>
                  )
                )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
