const STORAGE_KEY =
  "nexus-pos-live-cart-v1";

const MAX_AGE_MS =
  2 * 60 * 60 * 1000;


export type PosDraftLine = {
  productId: string;
  quantity: number;
  discountPercent: number;
  overrideUnitPrice:
    number |
    null;
};


export type PosSessionDraft = {
  branchId: string;
  customerId:
    string |
    null;
  lines: PosDraftLine[];
  savedAt: number;
};


export function clearPosSessionDraft() {

  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  try {
    window.sessionStorage
      .removeItem(
        STORAGE_KEY
      );
  } catch {}

}


export function readPosSessionDraft():
  PosSessionDraft |
  null {

  if (
    typeof window ===
    "undefined"
  ) {
    return null;
  }

  try {

    const raw =
      window.sessionStorage
        .getItem(
          STORAGE_KEY
        );

    if (!raw) {
      return null;
    }

    const draft =
      JSON.parse(
        raw
      ) as PosSessionDraft;

    if (
      !draft ||
      !draft.branchId ||
      !Array.isArray(
        draft.lines
      ) ||
      !draft.savedAt
    ) {
      clearPosSessionDraft();
      return null;
    }

    if (
      Date.now() -
        draft.savedAt >
      MAX_AGE_MS
    ) {
      clearPosSessionDraft();
      return null;
    }

    return draft;

  } catch {

    clearPosSessionDraft();
    return null;

  }
}


export function savePosSessionDraft(
  draft:
    Omit<
      PosSessionDraft,
      "savedAt"
    >
) {

  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  if (
    draft.lines.length ===
    0
  ) {
    clearPosSessionDraft();
    return;
  }

  try {

    window.sessionStorage
      .setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...draft,
          savedAt:
            Date.now(),
        })
      );

  } catch {
    // Recovery must never block POS.
  }
}
