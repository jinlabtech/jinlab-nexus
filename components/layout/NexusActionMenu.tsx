"use client";

import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Home,
  Pin,
  PinOff,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  usePathname,
  useRouter,
} from "next/navigation";

import {
  useNexusDeviceMode,
} from "@/hooks/useNexusDeviceMode";

const PINS_KEY = "nexus-dock-pins-v3";
const MAX_PINS = 9;

const dockRoutes = [
  { id: "dashboard", label: "Home", href: "/dashboard" },
  { id: "whatsapp", label: "WhatsApp", href: "/whatsapp" },
  { id: "pos", label: "POS", href: "/pos" },
  { id: "time", label: "Time", href: "/hr/timebook" },
  { id: "email", label: "Email", href: "/email" },
  { id: "inventory", label: "Inventory", href: "/inventory" },
  { id: "customers", label: "Customers", href: "/customers" },
  { id: "quotations", label: "Quotes", href: "/quotations" },
  { id: "invoices", label: "Invoices", href: "/invoices" },
  { id: "sales", label: "Sales", href: "/sales" },
  { id: "repairs", label: "Repairs", href: "/repairs/scanner" },
  { id: "purchasing", label: "Purchasing", href: "/purchasing" },
  { id: "accounting", label: "Accounting", href: "/accounting" },
  { id: "payroll", label: "Payroll", href: "/payroll" },
  { id: "shipping", label: "Shipping", href: "/shipping" },
  { id: "hr", label: "People", href: "/hr" },
  { id: "settings", label: "Settings", href: "/settings" },
];

type MenuState = {
  x: number;
  y: number;
  href: string;
  label: string;
  appId: string | null;
  selectedText: string | null;
};

function routePath(href: string) {
  try {
    return new URL(
      href,
      window.location.origin
    ).pathname;
  } catch {
    return href;
  }
}

function dockAppFor(href: string) {
  const path = routePath(href);

  return (
    dockRoutes
      .filter(
        (app) =>
          path === app.href ||
          path.startsWith(`${app.href}/`)
      )
      .sort(
        (a, b) =>
          b.href.length - a.href.length
      )[0] ?? null
  );
}

function parentFor(href: string) {
  const path = routePath(href);

  const parts = path
    .split("/")
    .filter(Boolean);

  if (parts.length <= 1) {
    return "/dashboard";
  }

  return `/${parts
    .slice(0, -1)
    .join("/")}`;
}

function loadPins() {
  try {
    const raw =
      window.localStorage.getItem(
        PINS_KEY
      );

    if (!raw) return [];

    const parsed =
      JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed.filter(
          (value) =>
            typeof value === "string"
        )
      : [];
  } catch {
    return [];
  }
}

export default function NexusActionMenu() {
  const pathname = usePathname();
  const router = useRouter();

  const {
    isTouch,
    isCompact,
  } = useNexusDeviceMode();

  const [menu, setMenu] =
    useState<MenuState | null>(null);

  const [pins, setPins] =
    useState<string[]>([]);

  const pressTimer =
    useRef<number | null>(null);

  const pressStart =
    useRef({
      x: 0,
      y: 0,
    });

  const suppressClickUntil =
    useRef(0);

  useEffect(() => {
    function syncPins() {
      setPins(loadPins());
    }

    syncPins();

    window.addEventListener(
      "nexus:dock-pins-changed",
      syncPins
    );

    return () => {
      window.removeEventListener(
        "nexus:dock-pins-changed",
        syncPins
      );
    };
  }, []);

  useEffect(() => {
    function isEditable(
      target: HTMLElement
    ) {
      return Boolean(
        target.closest(
          "input, textarea, select, [contenteditable='true']"
        )
      );
    }

    function openMenu(
      target: HTMLElement,
      clientX: number,
      clientY: number
    ) {
      const contextNode =
        target.closest<HTMLElement>(
          "[data-nexus-context]"
        );

      const anchor =
        target.closest<HTMLAnchorElement>(
          "a[href]"
        );

      const rawHref =
        contextNode?.dataset.nexusHref ??
        anchor?.getAttribute("href") ??
        pathname;

      const href =
        rawHref &&
        (
          rawHref.startsWith("/") ||
          rawHref.startsWith("http")
        )
          ? rawHref
          : pathname;

      const app =
        dockAppFor(href);

      const label =
        contextNode?.dataset.nexusLabel ??
        anchor?.textContent?.trim() ??
        app?.label ??
        "Current Nexus view";

      const selection =
        window
          .getSelection()
          ?.toString()
          .trim() ?? "";

      const x =
        Math.max(
          8,
          Math.min(
            clientX,
            window.innerWidth - 296
          )
        );

      const y =
        Math.max(
          8,
          Math.min(
            clientY,
            window.innerHeight - 390
          )
        );

      setMenu({
        x,
        y,
        href,
        label:
          label.length > 50
            ? `${label.slice(0, 50)}…`
            : label,
        appId:
          contextNode?.dataset
            .nexusAppId ??
          app?.id ??
          null,
        selectedText:
          selection || null,
      });
    }

    function cancelLongPress() {
      if (
        pressTimer.current !== null
      ) {
        window.clearTimeout(
          pressTimer.current
        );

        pressTimer.current = null;
      }
    }

    function onContextMenu(
      event: MouseEvent
    ) {
      const target =
        event.target as HTMLElement | null;

      if (
        !target ||
        isEditable(target)
      ) {
        return;
      }

      event.preventDefault();

      openMenu(
        target,
        event.clientX,
        event.clientY
      );
    }

    function onPointerDown(
      event: PointerEvent
    ) {
      const target =
        event.target as HTMLElement | null;

      if (
        !target ||
        event.pointerType === "mouse" ||
        isEditable(target)
      ) {
        return;
      }

      pressStart.current = {
        x: event.clientX,
        y: event.clientY,
      };

      cancelLongPress();

      pressTimer.current =
        window.setTimeout(
          () => {
            suppressClickUntil.current =
              Date.now() + 350;

            openMenu(
              target,
              event.clientX,
              event.clientY
            );

            pressTimer.current =
              null;
          },
          575
        );
    }

    function onPointerMove(
      event: PointerEvent
    ) {
      const dx =
        event.clientX -
        pressStart.current.x;

      const dy =
        event.clientY -
        pressStart.current.y;

      if (
        Math.hypot(dx, dy) > 10
      ) {
        cancelLongPress();
      }
    }

    function onClick(
      event: MouseEvent
    ) {
      if (
        Date.now() <
        suppressClickUntil.current
      ) {
        event.preventDefault();
        event.stopPropagation();
        suppressClickUntil.current = 0;
        return;
      }

      const target =
        event.target as HTMLElement | null;

      if (
        menu &&
        target &&
        !target.closest(
          "#nexus-action-menu"
        )
      ) {
        setMenu(null);
      }
    }

    function onKeyDown(
      event: KeyboardEvent
    ) {
      if (
        event.key === "Escape"
      ) {
        setMenu(null);
      }
    }

    function closeMenu() {
      setMenu(null);
      cancelLongPress();
    }

    document.addEventListener(
      "contextmenu",
      onContextMenu
    );

    document.addEventListener(
      "pointerdown",
      onPointerDown
    );

    document.addEventListener(
      "pointermove",
      onPointerMove
    );

    document.addEventListener(
      "pointerup",
      cancelLongPress
    );

    document.addEventListener(
      "pointercancel",
      cancelLongPress
    );

    document.addEventListener(
      "click",
      onClick,
      true
    );

    window.addEventListener(
      "keydown",
      onKeyDown
    );

    window.addEventListener(
      "resize",
      closeMenu
    );

    window.addEventListener(
      "scroll",
      closeMenu,
      true
    );

    return () => {
      cancelLongPress();

      document.removeEventListener(
        "contextmenu",
        onContextMenu
      );

      document.removeEventListener(
        "pointerdown",
        onPointerDown
      );

      document.removeEventListener(
        "pointermove",
        onPointerMove
      );

      document.removeEventListener(
        "pointerup",
        cancelLongPress
      );

      document.removeEventListener(
        "pointercancel",
        cancelLongPress
      );

      document.removeEventListener(
        "click",
        onClick,
        true
      );

      window.removeEventListener(
        "keydown",
        onKeyDown
      );

      window.removeEventListener(
        "resize",
        closeMenu
      );

      window.removeEventListener(
        "scroll",
        closeMenu,
        true
      );
    };
  }, [
    menu,
    pathname,
  ]);

  function close() {
    setMenu(null);
  }

  function togglePin() {
    if (
      !menu?.appId
    ) {
      return;
    }

    const current =
      loadPins();

    const alreadyPinned =
      current.includes(
        menu.appId
      );

    let next: string[];

    if (alreadyPinned) {
      next =
        current.filter(
          (id) =>
            id !== menu.appId
        );
    } else {
      if (
        current.length >=
        MAX_PINS
      ) {
        close();
        return;
      }

      next = [
        ...current,
        menu.appId,
      ];
    }

    window.localStorage.setItem(
      PINS_KEY,
      JSON.stringify(next)
    );

    setPins(next);

    window.dispatchEvent(
      new Event(
        "nexus:dock-pins-changed"
      )
    );

    close();
  }

  async function copyLink() {
    if (!menu) return;

    try {
      const url =
        new URL(
          menu.href,
          window.location.origin
        ).toString();

      await navigator.clipboard.writeText(
        url
      );
    } catch {
      // Clipboard may be unavailable.
    }

    close();
  }

  function askNexus() {
    if (!menu) return;

    window.dispatchEvent(
      new CustomEvent(
        "nexus:helper-open",
        {
          detail: {
            href: menu.href,
            label: menu.label,
            selectedText:
              menu.selectedText,
          },
        }
      )
    );

    close();
  }

  if (!menu) {
    return null;
  }

  const isPinned =
    Boolean(
      menu.appId &&
      pins.includes(
        menu.appId
      )
    );

  const dockFull =
    pins.length >= MAX_PINS &&
    !isPinned;

  const sheetMode =
    isTouch ||
    isCompact;

  return (
    <div
      id="nexus-action-menu"
      role="menu"
      style={
        sheetMode
          ? undefined
          : {
              left: menu.x,
              top: menu.y,
            }
      }
      className={
        sheetMode
          ? "fixed inset-x-2 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[120] max-h-[70dvh] overflow-y-auto rounded-2xl border border-border/50 bg-background/95 shadow-2xl backdrop-blur-2xl"
          : "fixed z-[120] w-72 overflow-hidden rounded-2xl border border-border/50 bg-background/90 shadow-2xl backdrop-blur-2xl"
      }
    >
      <div className="border-b border-border/40 px-3 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Nexus Actions
        </p>

        <p className="mt-1 truncate text-sm font-semibold">
          {menu.label}
        </p>

        {menu.selectedText && (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            “{menu.selectedText}”
          </p>
        )}
      </div>

      <div className="p-1.5">
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            router.push(
              routePath(
                menu.href
              )
            );
            close();
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-muted"
        >
          <ExternalLink className="size-4 text-muted-foreground" />
          Open
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            window.open(
              menu.href,
              "_blank",
              "noopener,noreferrer"
            );
            close();
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-muted"
        >
          <ExternalLink className="size-4 text-muted-foreground" />
          Open in new tab
        </button>

        {menu.appId && (
          <button
            type="button"
            role="menuitem"
            onClick={togglePin}
            disabled={dockFull}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-muted disabled:opacity-40"
          >
            {isPinned ? (
              <PinOff className="size-4 text-muted-foreground" />
            ) : (
              <Pin className="size-4 text-muted-foreground" />
            )}

            {isPinned
              ? "Unpin from dock"
              : dockFull
                ? "Dock is full"
                : "Pin to dock"}
          </button>
        )}

        <div className="my-1 border-t border-border/40" />

        <button
          type="button"
          role="menuitem"
          onClick={askNexus}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-primary transition hover:bg-primary/10"
        >
          <Sparkles className="size-4" />

          {menu.selectedText
            ? "Ask Nexus about selection"
            : "Ask Nexus about this"}
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            router.push(
              parentFor(
                menu.href
              )
            );
            close();
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-muted"
        >
          <ArrowLeft className="size-4 text-muted-foreground" />
          Parent directory
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            router.push(
              "/dashboard"
            );
            close();
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-muted"
        >
          <Home className="size-4 text-muted-foreground" />
          Nexus Home
        </button>

        <div className="my-1 border-t border-border/40" />

        <button
          type="button"
          role="menuitem"
          onClick={copyLink}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-muted"
        >
          <Copy className="size-4 text-muted-foreground" />
          Copy link
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            router.refresh();
            close();
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-muted"
        >
          <RefreshCw className="size-4 text-muted-foreground" />
          Refresh view
        </button>
      </div>
    </div>
  );
}
