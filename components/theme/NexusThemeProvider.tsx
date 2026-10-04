"use client";

import {
  useEffect,
} from "react";

import {
  supabase,
} from "@/lib/supabase";


export type NexusThemeKey =
  | "jinlab_blue"
  | "jinlab_blue_dark"
  | "jinlab_frost"
  | "jinlab_graphite"
  | "jinlab_glass"
  | "system";


const STORAGE_KEY =
  "jinlab-nexus-theme";


function isThemeKey(
  value: unknown
): value is NexusThemeKey {

  return (
    value === "jinlab_blue" ||
    value === "jinlab_blue_dark" ||
    value === "jinlab_frost" ||
    value === "jinlab_graphite" ||
    value === "jinlab_glass" ||
    value === "system"
  );
}


function getCachedTheme():
  NexusThemeKey |
  null {

  if (
    typeof window ===
    "undefined"
  ) {
    return null;
  }


  const value =
    window.localStorage
      .getItem(
        STORAGE_KEY
      );


  return isThemeKey(
    value
  )
    ? value
    : null;
}


function resolvedTheme(
  selected:
    NexusThemeKey
) {

  if (
    selected !==
    "system"
  ) {
    return selected;
  }


  return window.matchMedia(
    "(prefers-color-scheme: dark)"
  ).matches
    ? "jinlab_blue_dark"
    : "jinlab_blue";
}


function applyTheme(
  selected:
    NexusThemeKey,
  persist = true
) {

  if (
    typeof document ===
      "undefined" ||
    typeof window ===
      "undefined"
  ) {
    return;
  }


  const resolved =
    resolvedTheme(
      selected
    );


  const root =
    document.documentElement;


  root.dataset.nexusTheme =
    resolved;


  root.classList.toggle(
    "dark",
    (
      resolved === "jinlab_blue_dark" ||
      resolved === "jinlab_graphite"
    )
  );


  root.style.colorScheme =
    (
      resolved === "jinlab_blue_dark" ||
      resolved === "jinlab_graphite"
    )
      ? "dark"
      : "light";


  if (persist) {

    root.classList.remove(
      "nexus-theme-transition"
    );

    void root.offsetWidth;

    root.classList.add(
      "nexus-theme-transition"
    );

    window.setTimeout(
      () =>
        root.classList.remove(
          "nexus-theme-transition"
        ),
      340
    );
  }


  if (persist) {

    window.localStorage
      .setItem(
        STORAGE_KEY,
        selected
      );
  }
}


export function changeNexusTheme(
  selected:
    NexusThemeKey
) {

  applyTheme(
    selected,
    true
  );
}


export function getNexusThemePreference():
  NexusThemeKey |
  null {

  return getCachedTheme();
}


export default function NexusThemeProvider({
  children,
}: {
  children:
    React.ReactNode;
}) {

  useEffect(
    () => {

      const cached =
        getCachedTheme();


      if (cached) {
        applyTheme(
          cached,
          false
        );
      }


      let cancelled =
        false;


      async function loadCompanyTheme() {

        /*
         * Personal appearance always wins.
         * Company appearance is only the fallback for a user
         * who has never chosen a personal Nexus theme.
         */
        const personalTheme =
          getCachedTheme();

        if (personalTheme) {
          applyTheme(
            personalTheme,
            false
          );

          return;
        }


        const {
          data: {
            user,
          },
        } =
          await supabase.auth
            .getUser();


        if (
          cancelled ||
          !user
        ) {
          return;
        }


        const {
          data,
          error,
        } =
          await supabase.rpc(
            "get_company_ui_settings"
          );


        if (
          cancelled ||
          error
        ) {
          return;
        }


        const theme =
          data?.theme_key;


        if (
          isThemeKey(
            theme
          )
        ) {

          /*
           * Company default is a fallback only.
           * Do NOT save it as the user's personal preference.
           */
          applyTheme(
            theme,
            false
          );
        }
      }


      void loadCompanyTheme();


      const {
        data:
          authSubscription,
      } =
        supabase.auth
          .onAuthStateChange(
            (
              _event,
              session
            ) => {

              if (
                session
              ) {

                window.setTimeout(
                  () => {
                    void loadCompanyTheme();
                  },
                  0
                );

              } else {

                applyTheme(
                  "jinlab_blue",
                  false
                );
              }
            }
          );


      const media =
        window.matchMedia(
          "(prefers-color-scheme: dark)"
        );


      function handleDeviceTheme() {

        if (
          getCachedTheme() ===
          "system"
        ) {

          applyTheme(
            "system",
            false
          );
        }
      }


      media.addEventListener(
        "change",
        handleDeviceTheme
      );


      function handleStorage(
        event:
          StorageEvent
      ) {

        if (
          event.key !==
          STORAGE_KEY
        ) {
          return;
        }


        if (
          isThemeKey(
            event.newValue
          )
        ) {

          applyTheme(
            event.newValue,
            false
          );
        }
      }


      window.addEventListener(
        "storage",
        handleStorage
      );


      return () => {

        cancelled =
          true;


        authSubscription
          .subscription
          .unsubscribe();


        media.removeEventListener(
          "change",
          handleDeviceTheme
        );


        window.removeEventListener(
          "storage",
          handleStorage
        );
      };

    },
    []
  );


  useEffect(() => {

    const nexusSystemAppearanceListener =
      window.matchMedia(
        "(prefers-color-scheme: dark)"
      );


    const handleSystemAppearanceChange =
      () => {

        if (
          getCachedTheme() ===
          "system"
        ) {
          applyTheme(
            "system",
            false
          );
        }
      };


    nexusSystemAppearanceListener
      .addEventListener(
        "change",
        handleSystemAppearanceChange
      );


    return () => {
      nexusSystemAppearanceListener
        .removeEventListener(
          "change",
          handleSystemAppearanceChange
        );
    };

  }, []);



  return (
    <>
      {
        children
      }
    </>
  );
}
