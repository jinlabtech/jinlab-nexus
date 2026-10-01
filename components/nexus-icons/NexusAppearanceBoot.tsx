"use client";

import { useEffect } from "react";

export const NEXUS_ICON_STYLE_KEY =
  "jinlab-nexus-icon-style";

export const NEXUS_ICON_STYLES = [
  "lumina",
  "ceramic",
  "titanium",
  "aurora",
  "mono",
] as const;

export type NexusIconStyle =
  (typeof NEXUS_ICON_STYLES)[number];

export function isNexusIconStyle(
  value: string | null
): value is NexusIconStyle {
  return NEXUS_ICON_STYLES.includes(
    value as NexusIconStyle
  );
}

export function applyNexusIconStyle(
  style: NexusIconStyle
) {
  document.documentElement.dataset.nexusIconStyle =
    style;

  window.localStorage.setItem(
    NEXUS_ICON_STYLE_KEY,
    style
  );

  window.dispatchEvent(
    new CustomEvent(
      "nexus-icon-style-change",
      {
        detail: style,
      }
    )
  );
}

export default function NexusAppearanceBoot() {
  useEffect(() => {
    const stored =
      window.localStorage.getItem(
        NEXUS_ICON_STYLE_KEY
      );

    const resolved =
      isNexusIconStyle(stored)
        ? stored
        : "lumina";

    document.documentElement.dataset.nexusIconStyle =
      resolved;
  }, []);

  return null;
}
