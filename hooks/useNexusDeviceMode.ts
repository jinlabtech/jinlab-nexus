"use client";

import {
  useEffect,
  useState,
} from "react";

export function useNexusDeviceMode() {
  const [isTouch, setIsTouch] =
    useState(false);

  const [isCompact, setIsCompact] =
    useState(false);

  const [canHover, setCanHover] =
    useState(true);

  useEffect(() => {
    const touch =
      window.matchMedia(
        "(pointer: coarse)"
      );

    const compact =
      window.matchMedia(
        "(max-width: 767px)"
      );

    const hover =
      window.matchMedia(
        "(hover: hover) and (pointer: fine)"
      );

    function update() {
      setIsTouch(
        touch.matches
      );

      setIsCompact(
        compact.matches
      );

      setCanHover(
        hover.matches
      );
    }

    update();

    touch.addEventListener(
      "change",
      update
    );

    compact.addEventListener(
      "change",
      update
    );

    hover.addEventListener(
      "change",
      update
    );

    return () => {
      touch.removeEventListener(
        "change",
        update
      );

      compact.removeEventListener(
        "change",
        update
      );

      hover.removeEventListener(
        "change",
        update
      );
    };
  }, []);

  return {
    isTouch,
    isCompact,
    canHover,
  };
}
