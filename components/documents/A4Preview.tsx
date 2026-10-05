"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Props = {
  children: ReactNode;
};

export default function A4Preview({
  children,
}: Props) {
  const containerRef =
    useRef<HTMLDivElement | null>(null);

  const paperRef =
    useRef<HTMLDivElement | null>(null);

  const [fitToScreen, setFitToScreen] =
    useState(true);

  const [scale, setScale] =
    useState(1);

  const [scaledHeight, setScaledHeight] =
    useState<number | null>(null);

  useEffect(() => {
    const container =
      containerRef.current;

    const paper =
      paperRef.current;

    if (!container || !paper) {
      return;
    }

    /*
     * Store non-null DOM references.
     *
     * TypeScript can now safely use these
     * inside updateScale().
     */
    const containerEl = container;
    const paperEl = paper;

    function updateScale() {
      /*
       * True A4 width:
       * 210 mm converted to CSS pixels
       * using 96 CSS px per inch.
       */
      const a4WidthPx =
        (210 / 25.4) * 96;

      if (!fitToScreen) {
        setScale(1);

        setScaledHeight(
          paperEl.scrollHeight
        );

        return;
      }

      /*
       * Leave a small amount of breathing
       * room around the page on mobile.
       */
      const availableWidth =
        Math.max(
          containerEl.clientWidth - 8,
          1
        );

      const nextScale =
        Math.min(
          1,
          availableWidth / a4WidthPx
        );

      setScale(nextScale);

      setScaledHeight(
        paperEl.scrollHeight *
          nextScale
      );
    }

    const observer =
      new ResizeObserver(
        updateScale
      );

    observer.observe(
      containerEl
    );

    observer.observe(
      paperEl
    );

    updateScale();

    return () => {
      observer.disconnect();
    };
  }, [fitToScreen]);

  return (
    <>
      <div className="nexus-document-view-controls print:hidden">
        <button
          type="button"
          aria-pressed={fitToScreen}
          onClick={() =>
            setFitToScreen(true)
          }
        >
          Fit A4 to screen
        </button>

        <button
          type="button"
          aria-pressed={!fitToScreen}
          onClick={() =>
            setFitToScreen(false)
          }
        >
          100% A4
        </button>

        <span>
          Preview is a real A4 page.
          Printing remains 210 × 297 mm.
        </span>
      </div>

      <div
        ref={containerRef}
        className={
          fitToScreen
            ? "nexus-a4-preview-stage nexus-a4-fit-screen"
            : "nexus-a4-preview-stage nexus-a4-full-size"
        }
      >
        <div
          className="nexus-a4-scale-holder"
          style={
            fitToScreen &&
            scaledHeight !== null
              ? {
                  height:
                    `${scaledHeight}px`,
                }
              : undefined
          }
        >
          <div
            ref={paperRef}
            className="nexus-a4-paper"
            style={
              fitToScreen
                ? {
                    transform:
                      `scale(${scale})`,
                    transformOrigin:
                      "top center",
                  }
                : undefined
            }
          >
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
