"use client";

import {
  useMemo,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  NexusIcon,
  nexusIconForRoute,
} from "@/components/nexus-icons/NexusIcon";

import {
  usePermissions,
} from "@/hooks/usePermissions";

import {
  getNexusSearchEntries,
} from "@/lib/nexus/registry";


type Props = {
  query: string;
  onOpen: () => void;
};


export default function NexusSearchResults({
  query,
  onOpen,
}: Props) {

  const router =
    useRouter();

  const {
    can,
    loading,
  } =
    usePermissions();


  const results =
    useMemo(
      () => {

        const term =
          query
            .trim()
            .toLowerCase();


        if (
          !term ||
          loading
        ) {
          return [];
        }


        return getNexusSearchEntries()
          .filter(
            (entry) =>
              !entry.permission ||
              can(
                entry.permission
              )
          )
          .map(
            (entry) => {

              const label =
                entry.label
                  .toLowerCase();

              const keywords =
                (
                  entry.keywords ??
                  []
                )
                  .join(" ")
                  .toLowerCase();

              const parent =
                (
                  entry.parentLabel ??
                  ""
                )
                  .toLowerCase();

              const href =
                entry.href
                  .toLowerCase();


              let score =
                0;


              if (
                label === term
              ) {
                score += 100;
              }


              if (
                label.startsWith(
                  term
                )
              ) {
                score += 70;
              }


              if (
                label.includes(
                  term
                )
              ) {
                score += 50;
              }


              if (
                keywords.includes(
                  term
                )
              ) {
                score += 30;
              }


              if (
                parent.includes(
                  term
                )
              ) {
                score += 20;
              }


              if (
                href.includes(
                  term
                )
              ) {
                score += 10;
              }


              return {
                entry,
                score,
              };

            }
          )
          .filter(
            ({ score }) =>
              score > 0
          )
          .sort(
            (a, b) =>
              b.score -
              a.score
          )
          .slice(
            0,
            12
          );

      },
      [
        query,
        can,
        loading,
      ]
    );


  const term =
    query.trim();


  if (!term) {

    return (
      <div className="mt-5 rounded-2xl border border-dashed border-border/50 px-5 py-8 text-center">

        <p className="text-sm font-medium">
          Search all of Nexus
        </p>

        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Try “new sale”, “invoice”, “customer”, “POS” or “time”.
        </p>

      </div>
    );

  }


  if (
    results.length === 0
  ) {

    return (
      <div className="mt-5 rounded-2xl border border-dashed border-border/50 px-5 py-8 text-center">

        <p className="text-sm font-medium">
          Nothing found
        </p>

        <p className="mt-1 text-xs text-muted-foreground">
          Try another Nexus app or action.
        </p>

      </div>
    );

  }


  return (
    <div className="mt-4 space-y-1">

      {results.map(
        ({
          entry,
        }) => (

          <button
            key={entry.id}
            type="button"
            onPointerEnter={() =>
              router.prefetch(
                entry.href
              )
            }
            onTouchStart={() =>
              router.prefetch(
                entry.href
              )
            }
            onClick={() => {

              router.push(
                entry.href
              );

              onOpen();

            }}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-muted active:scale-[0.985]"
          >

            <NexusIcon
              name={
                nexusIconForRoute(
                  entry.href
                )
              }
              size="sm"
            />


            <span className="min-w-0 flex-1">

              <span className="block truncate text-sm font-medium">
                {entry.label}
              </span>

              {entry.parentLabel ? (
                <span className="block truncate text-[11px] text-muted-foreground">
                  {entry.parentLabel}
                </span>
              ) : null}

            </span>

          </button>

        )
      )}

    </div>
  );
}
