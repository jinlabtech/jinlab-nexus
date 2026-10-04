"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getNexusScreenPosition, saveNexusScreenPosition } from "@/lib/nexus/screen-memory";

export default function NexusWorkspaceMemory() {
  const pathname = usePathname();

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    const container = document.querySelector<HTMLElement>(
      mobile ? ".nexus-app-workspace" : ".nexus-shell-workspace"
    );
    if (!container) return;

    const target = getNexusScreenPosition(pathname);
    let restoring = true;
    let saveFrame = 0;
    const timers: number[] = [];
    function restore() {
      if (restoring) container!.scrollTo({ top: target, behavior: "auto" });
    }
    function stopRestoring() {
      restoring = false;
      timers.forEach(window.clearTimeout);
    }
    function remember() {
      if (saveFrame) return;
      saveFrame = window.requestAnimationFrame(() => {
        saveFrame = 0;
        saveNexusScreenPosition(pathname, container!.scrollTop);
      });
    }

    restore();
    const restoreFrame = window.requestAnimationFrame(restore);
    // Brief retries allow asynchronous lists to load, but never fight a user's swipe.
    for (const delay of [80, 250, 700]) timers.push(window.setTimeout(restore, delay));
    container.addEventListener("scroll", remember, { passive: true });
    for (const event of ["pointerdown", "touchstart", "wheel", "keydown"]) {
      container.addEventListener(event, stopRestoring, { passive: true });
    }
    return () => {
      saveNexusScreenPosition(pathname, container.scrollTop);
      stopRestoring();
      window.cancelAnimationFrame(restoreFrame);
      if (saveFrame) window.cancelAnimationFrame(saveFrame);
      container.removeEventListener("scroll", remember);
      for (const event of ["pointerdown", "touchstart", "wheel", "keydown"]) {
        container.removeEventListener(event, stopRestoring);
      }
    };
  }, [pathname]);

  return null;
}
