"use client";

import {
  ArrowLeft,
  PanelLeftOpen,
} from "lucide-react";

import {
  usePathname,
  useRouter,
} from "next/navigation";

import NexusBreadcrumbs from "@/components/layout/NexusBreadcrumbs";
import NexusSystemClock from "@/components/layout/NexusSystemClock";

type NexusSystemBarProps = {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
};

export default function NexusSystemBar({
  sidebarOpen,
  onToggleSidebar,
}: NexusSystemBarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const parts = pathname
    .split("/")
    .filter(Boolean);

  const isDashboard =
    pathname === "/dashboard";

  function goBackDirectory() {
    if (isDashboard) {
      return;
    }

    if (parts.length <= 1) {
      router.push("/dashboard");
      return;
    }

    const parent =
      "/" +
      parts
        .slice(0, -1)
        .join("/");

    router.push(parent);
  }

  return (
    <div className="sticky top-0 z-[60] w-full border-b border-border/40 bg-background/75 backdrop-blur-xl">
      <div className="grid h-11 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-2 sm:px-4">

        <div className="flex min-w-0 items-center gap-1 justify-self-start">

          {!sidebarOpen && (
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label="Open Nexus sidebar"
              title="Open sidebar"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <PanelLeftOpen className="size-[18px]" />
            </button>
          )}

          <button
            type="button"
            onClick={goBackDirectory}
            disabled={isDashboard}
            aria-label="Go back one Nexus directory"
            title="Back"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-25"
          >
            <ArrowLeft className="size-4" />
          </button>

          <div className="min-w-0 pl-1">
            <NexusBreadcrumbs />
          </div>

        </div>

        <div className="justify-self-center">
          <div className="hidden sm:block">
          <NexusSystemClock />
        </div>
        </div>

        <div className="flex items-center justify-self-end gap-2">
          <span className="size-1.5 rounded-full bg-emerald-500" />

          <span className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:block">
            Nexus Live
          </span>
        </div>

      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
    </div>
  );
}
