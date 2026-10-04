const PREFIX =
  "nexus-ui-state-v1:";


type StoredState<T> = {
  value: T;
  updatedAt: number;
};


export function readNexusUiState<T>(
  key: string,
  fallback: T
): T {

  if (
    typeof window ===
    "undefined"
  ) {
    return fallback;
  }


  try {

    const raw =
      window.sessionStorage
        .getItem(
          PREFIX + key
        );


    if (!raw) {
      return fallback;
    }


    const parsed =
      JSON.parse(raw) as
        StoredState<T>;


    if (
      !parsed ||
      typeof parsed !==
        "object" ||
      !("value" in parsed)
    ) {
      return fallback;
    }


    return parsed.value;

  } catch {

    return fallback;

  }

}


export function writeNexusUiState<T>(
  key: string,
  value: T
) {

  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }


  try {

    const payload:
      StoredState<T> = {
        value,
        updatedAt:
          Date.now(),
      };


    window.sessionStorage
      .setItem(
        PREFIX + key,
        JSON.stringify(
          payload
        )
      );

  } catch {
    // UI memory must never block the application.
  }

}


export function clearNexusUiState(
  key: string
) {

  try {

    window.sessionStorage
      .removeItem(
        PREFIX + key
      );

  } catch {}

}
