"use client";

import {
  useEffect,
  useRef,
} from "react";

type Props = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

export function useNexusSidebarSwipe({
  open,
  setOpen,
}: Props) {
  const touchStart = useRef<{
    x: number;
    y: number;
  } | null>(null);

  /*
   * Phone always starts with the navigation drawer closed.
   * Desktop state remains independent.
   */
  useEffect(() => {
    if (
      !window.matchMedia(
        "(max-width: 767px)"
      ).matches
    ) {
      return;
    }

    const timer =
      window.setTimeout(
        () => setOpen(false),
        0
      );

    return () =>
      window.clearTimeout(timer);
  }, [setOpen]);

  useEffect(() => {
    const mobile =
      window.matchMedia(
        "(max-width: 767px)"
      );

    function onTouchStart(
      event: TouchEvent
    ) {
      if (!mobile.matches) {
        return;
      }

      const touch =
        event.touches[0];

      if (!touch) return;

      /*
       * Closed sidebar:
       * only detect a swipe beginning near the left edge.
       *
       * Open sidebar:
       * allow swipe-left from anywhere.
       */
      if (
        !open &&
        touch.clientX > 48
      ) {
        touchStart.current =
          null;

        return;
      }

      touchStart.current = {
        x: touch.clientX,
        y: touch.clientY,
      };
    }

    function onTouchEnd(
      event: TouchEvent
    ) {
      const start =
        touchStart.current;

      touchStart.current =
        null;

      if (
        !mobile.matches ||
        !start
      ) {
        return;
      }

      const touch =
        event.changedTouches[0];

      if (!touch) return;

      const dx =
        touch.clientX -
        start.x;

      const dy =
        touch.clientY -
        start.y;

      /*
       * Don't interfere with normal vertical scrolling.
       */
      if (
        Math.abs(dx) <
        Math.abs(dy) * 1.25
      ) {
        return;
      }

      if (
        !open &&
        dx > 65
      ) {
        setOpen(true);
        return;
      }

      if (
        open &&
        dx < -65
      ) {
        setOpen(false);
      }
    }

    window.addEventListener(
      "touchstart",
      onTouchStart,
      {
        passive: true,
      }
    );

    window.addEventListener(
      "touchend",
      onTouchEnd,
      {
        passive: true,
      }
    );

    return () => {
      window.removeEventListener(
        "touchstart",
        onTouchStart
      );

      window.removeEventListener(
        "touchend",
        onTouchEnd
      );
    };
  }, [
    open,
    setOpen,
  ]);
}
