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


export const NEXUS_ICON_ART_KEY =
  "jinlab-nexus-icon-art";

export const NEXUS_ICON_ART_STYLES = [
  "studio",
  "sculpted",
  "prism",
] as const;

export type NexusIconArtStyle =
  (typeof NEXUS_ICON_ART_STYLES)[number];


export function isNexusIconStyle(
  value: string | null
): value is NexusIconStyle {
  return NEXUS_ICON_STYLES.includes(
    value as NexusIconStyle
  );
}


export function isNexusIconArtStyle(
  value: string | null
): value is NexusIconArtStyle {
  return NEXUS_ICON_ART_STYLES.includes(
    value as NexusIconArtStyle
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


export function applyNexusIconArtStyle(
  style: NexusIconArtStyle
) {
  document.documentElement.dataset.nexusIconArt =
    style;

  window.localStorage.setItem(
    NEXUS_ICON_ART_KEY,
    style
  );

  window.dispatchEvent(
    new CustomEvent(
      "nexus-icon-art-change",
      {
        detail: style,
      }
    )
  );
}


export default function NexusAppearanceBoot() {
  useEffect(() => {
    const storedMaterial =
      window.localStorage.getItem(
        NEXUS_ICON_STYLE_KEY
      );

    const material =
      isNexusIconStyle(
        storedMaterial
      )
        ? storedMaterial
        : "lumina";


    const storedArt =
      window.localStorage.getItem(
        NEXUS_ICON_ART_KEY
      );

    const art =
      isNexusIconArtStyle(
        storedArt
      )
        ? storedArt
        : "studio";


    document.documentElement.dataset.nexusIconStyle =
      material;

    document.documentElement.dataset.nexusIconArt =
      art;
  }, []);

  return null;
}
