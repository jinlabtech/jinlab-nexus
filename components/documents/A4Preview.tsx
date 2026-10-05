"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Scale the screen preview without changing the document's physical print layout. */
export default function A4Preview({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const [actualSize, setActualSize] = useState(false);
  useEffect(() => {
    const outer = container.current;
    const sheet = paper.current;
    if (!outer || !sheet) return;
    const resize = () => {
      const width = 210 * 96 / 25.4;
      sheet.style.zoom = String(actualSize ? 1 : Math.min(1, outer.clientWidth / width));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(outer);
    resize();
    return () => observer.disconnect();
  }, [actualSize]);
  return <>
    <div className="nexus-document-view-controls print:hidden">
      <button type="button" aria-pressed={!actualSize} onClick={() => setActualSize(false)}>Fit to screen</button>
      <button type="button" aria-pressed={actualSize} onClick={() => setActualSize(true)}>Full size</button>
      <span>A4 print layout · Full size lets you scroll across to read.</span>
    </div>
    <div ref={container} className="nexus-a4-fit">
      <div ref={paper} className="nexus-a4-paper">{children}</div>
    </div>
  </>;
}
