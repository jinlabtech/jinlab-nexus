"use client";

import {
  useEffect,
} from "react";

import {
  usePathname,
} from "next/navigation";

import {
  getNexusScreenPosition,
  saveNexusScreenPosition,
} from "@/lib/nexus/screen-memory";


export default function NexusWorkspaceMemory() {

  const pathname =
    usePathname();


  useEffect(
    () => {

      const workspace =
        document.querySelector<HTMLElement>(
          ".nexus-app-workspace"
        );


      if (!workspace) {
        return;
      }


      const scrollContainer: HTMLElement =
        workspace;


      const target =
        getNexusScreenPosition(
          pathname
        );


      let scrollFrame:
        number |
        null =
        null;


      let saveFrame:
        number |
        null =
        null;


      const timers:
        number[] = [];


      function restore() {

        /*
         * Some Nexus screens populate asynchronously.
         * Retry briefly while content settles.
         */
        scrollContainer.scrollTo({
          top: target,
          behavior: "auto",
        });

      }


      restore();


      scrollFrame =
        window.requestAnimationFrame(
          restore
        );


      for (
        const delay
        of [
          80,
          250,
          700,
        ]
      ) {

        timers.push(
          window.setTimeout(
            restore,
            delay
          )
        );

      }


      function remember() {

        if (
          saveFrame !==
          null
        ) {
          return;
        }


        saveFrame =
          window.requestAnimationFrame(
            () => {

              saveFrame =
                null;


              saveNexusScreenPosition(
                pathname,
                scrollContainer.scrollTop
              );

            }
          );

      }


      scrollContainer.addEventListener(
        "scroll",
        remember,
        {
          passive: true,
        }
      );


      return () => {

        saveNexusScreenPosition(
          pathname,
          scrollContainer.scrollTop
        );


        scrollContainer.removeEventListener(
          "scroll",
          remember
        );


        if (
          scrollFrame !==
          null
        ) {
          window.cancelAnimationFrame(
            scrollFrame
          );
        }


        if (
          saveFrame !==
          null
        ) {
          window.cancelAnimationFrame(
            saveFrame
          );
        }


        for (
          const timer
          of timers
        ) {
          window.clearTimeout(
            timer
          );
        }

      };

    },
    [
      pathname,
    ]
  );


  return null;
}
