"use client";

import {
  useEffect,
} from "react";

import {
  usePathname,
  useRouter,
} from "next/navigation";

import {
  getNexusDockApps,
} from "@/lib/nexus/registry";


const PINS_KEY =
  "nexus-dock-pins-v3";

const RECENT_KEY =
  "nexus-dock-recent-v3";


function readIds(
  key: string
): string[] {

  try {

    const raw =
      window.localStorage
        .getItem(key);


    if (!raw) {
      return [];
    }


    const parsed =
      JSON.parse(raw);


    return Array.isArray(parsed)
      ? parsed.filter(
          (
            item
          ): item is string =>
            typeof item ===
            "string"
        )
      : [];

  } catch {

    return [];

  }

}


export default function NexusNavigationWarmup() {

  const router =
    useRouter();

  const pathname =
    usePathname();


  useEffect(
    () => {

      /*
       * Never compete with the screen that is currently loading.
       * Give Nexus a short quiet period first.
       */
      const timer =
        window.setTimeout(
          () => {

            if (
              document.visibilityState !==
              "visible"
            ) {
              return;
            }


            const applications =
              getNexusDockApps();


            const byId =
              new Map(
                applications.map(
                  (app) => [
                    app.id,
                    app,
                  ]
                )
              );


            const recent =
              readIds(
                RECENT_KEY
              );

            const pinned =
              readIds(
                PINS_KEY
              );


            const candidateIds = [
              ...recent,
              ...pinned,
            ];


            const prepared =
              new Set<string>();


            for (
              const id
              of candidateIds
            ) {

              const app =
                byId.get(id);


              if (!app) {
                continue;
              }


              if (
                pathname ===
                  app.href ||
                pathname.startsWith(
                  `${app.href}/`
                )
              ) {
                continue;
              }


              if (
                prepared.has(
                  app.href
                )
              ) {
                continue;
              }


              router.prefetch(
                app.href
              );


              prepared.add(
                app.href
              );


              /*
               * Three likely routes are enough.
               * Nexus must remain lightweight.
               */
              if (
                prepared.size >=
                3
              ) {
                break;
              }

            }

          },
          800
        );


      return () =>
        window.clearTimeout(
          timer
        );

    },
    [
      pathname,
      router,
    ]
  );


  return null;
}
