import {
  nexusApps,
  type NexusAppId,
  type NexusFeatureItem,
} from "@/lib/nexus/registry";


const MEMORY_KEY =
  "nexus-module-memory-v1";


export type NexusModuleMemory = {
  featureId: string;
  label: string;
  href: string;
  icon: string;
  tone?: NexusFeatureItem["tone"];
  visitedAt: number;
};


type MemoryStore =
  Partial<
    Record<
      NexusAppId,
      NexusModuleMemory
    >
  >;


function readStore():
  MemoryStore {

  if (
    typeof window ===
    "undefined"
  ) {
    return {};
  }


  try {

    const raw =
      window.localStorage
        .getItem(
          MEMORY_KEY
        );


    if (!raw) {
      return {};
    }


    const parsed =
      JSON.parse(raw);


    return (
      parsed &&
      typeof parsed ===
        "object"
    )
      ? parsed
      : {};

  } catch {

    return {};

  }

}


function writeStore(
  store: MemoryStore
) {

  try {

    window.localStorage
      .setItem(
        MEMORY_KEY,
        JSON.stringify(
          store
        )
      );

  } catch {
    // Navigation memory is an enhancement only.
  }

}


function routeMatches(
  pathname: string,
  href: string
) {

  return (
    pathname === href ||
    pathname.startsWith(
      `${href}/`
    )
  );

}


export function rememberNexusPath(
  pathname: string
) {

  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }


  const store =
    readStore();


  let changed =
    false;


  for (
    const app
    of nexusApps
  ) {

    /*
     * Opening the module hub itself
     * should not replace the remembered feature.
     */
    if (
      pathname === app.href
    ) {
      continue;
    }


    const matchingFeature =
      (app.children ?? [])
        .filter(
          (feature) =>
            routeMatches(
              pathname,
              feature.href
            )
        )
        .sort(
          (a, b) =>
            b.href.length -
            a.href.length
        )[0];


    if (
      !matchingFeature
    ) {
      continue;
    }


    store[app.id] = {
      featureId:
        matchingFeature.id,

      label:
        matchingFeature.label,

      href:
        matchingFeature.href,

      icon:
        matchingFeature.icon,

      tone:
        matchingFeature.tone,

      visitedAt:
        Date.now(),
    };


    changed =
      true;

  }


  if (changed) {

    writeStore(
      store
    );

    window.dispatchEvent(
      new Event(
        "nexus:navigation-memory"
      )
    );

  }

}


export function getNexusModuleMemory(
  moduleId: NexusAppId
):
  NexusModuleMemory |
  null {

  return (
    readStore()[
      moduleId
    ] ??
    null
  );

}
