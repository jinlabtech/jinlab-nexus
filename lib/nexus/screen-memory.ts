const STORAGE_KEY =
  "nexus-screen-memory-v1";


type ScreenMemory = {
  scrollTop: number;
  updatedAt: number;
};


type ScreenMemoryStore =
  Record<
    string,
    ScreenMemory
  >;


function readStore():
  ScreenMemoryStore {

  if (
    typeof window ===
    "undefined"
  ) {
    return {};
  }


  try {

    const raw =
      window.sessionStorage
        .getItem(
          STORAGE_KEY
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
  store: ScreenMemoryStore
) {

  try {

    window.sessionStorage
      .setItem(
        STORAGE_KEY,
        JSON.stringify(
          store
        )
      );

  } catch {
    // Screen memory is an enhancement only.
  }

}


export function saveNexusScreenPosition(
  pathname: string,
  scrollTop: number
) {

  const store =
    readStore();


  store[pathname] = {
    scrollTop:
      Math.max(
        0,
        scrollTop
      ),

    updatedAt:
      Date.now(),
  };


  /*
   * Keep screen memory small.
   * Retain only the 40 most recently used screens.
   */
  const trimmed =
    Object.fromEntries(
      Object.entries(store)
        .sort(
          (
            [, a],
            [, b]
          ) =>
            b.updatedAt -
            a.updatedAt
        )
        .slice(
          0,
          40
        )
    );


  writeStore(
    trimmed
  );

}


export function getNexusScreenPosition(
  pathname: string
) {

  return (
    readStore()[
      pathname
    ]?.scrollTop ??
    0
  );

}
