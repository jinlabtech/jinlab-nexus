"use client";

import "@/components/layout/nexus-dock.css";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Link from "next/link";

import {
  usePathname,
  useRouter,
} from "next/navigation";

import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Home,
  Pin,
  PinOff,
  RotateCcw,
  Search,
  Settings,
  X,
} from "lucide-react";

import {
  NexusIcon,
  nexusIconForRoute,
} from "@/components/nexus-icons/NexusIcon";

import NexusSearchResults from "@/components/layout/NexusSearchResults";

import {
  usePermissions,
} from "@/hooks/usePermissions";

import {
  useNexusDeviceMode,
} from "@/hooks/useNexusDeviceMode";

import type {
  PermissionName,
} from "@/types/permissions";

import {
  getNexusDockApps,
} from "@/lib/nexus/registry";


type DockMode =
  | "collapsed"
  | "normal"
  | "expanded";

type DockApp = {
  id: string;
  label: string;
  href: string;
  activeRoot?: string;
  icon: string;
  permission?: PermissionName;
  keywords?: string[];
};

const apps: DockApp[] =
  getNexusDockApps();


const defaultPins = [
  "dashboard",
  "whatsapp",
  "pos",
  "time",
  "inventory",
];

const PINS_KEY = "nexus-dock-pins-v3";
const MODE_KEY = "nexus-dock-mode-v3";
const RECENT_KEY = "nexus-dock-recent-v3";

const MAX_PINS = 9;

function activeRoute(
  pathname: string,
  href: string,
  activeRoot?: string
) {

  const root =
    activeRoot ??
    href;


  return (
    pathname === href ||
    pathname === root ||
    pathname.startsWith(
      `${root}/`
    )
  );
}

export default function NexusDock() {
  const pathname = usePathname();
  const router = useRouter();

  const {
    isTouch,
    isCompact,
  } = useNexusDeviceMode();

  const {
    can,
    loading,
  } = usePermissions();

  const [mode, setMode] =
    useState<DockMode>("normal");

  const [pins, setPins] =
    useState<string[]>(defaultPins);

  const [recent, setRecent] =
    useState<string[]>([]);

  const [dragging, setDragging] =
    useState<string | null>(null);

  const [query, setQuery] =
    useState("");

  const [
    launcherView,
    setLauncherView,
  ] = useState<"apps" | "search">(
    "apps"
  );

  const searchRef =
    useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const savedPins =
        window.localStorage.getItem(PINS_KEY);

      const savedMode =
        window.localStorage.getItem(MODE_KEY);

      const savedRecent =
        window.localStorage.getItem(RECENT_KEY);

      if (savedPins) {
        const parsed = JSON.parse(savedPins);

        if (Array.isArray(parsed)) {
          setPins(
            parsed.filter(
              (item) =>
                typeof item === "string"
            )
          );
        }
      }

      if (
        savedMode === "collapsed" ||
        savedMode === "normal" ||
        savedMode === "expanded"
      ) {
        setMode(savedMode);
      }

      if (savedRecent) {
        const parsed =
          JSON.parse(savedRecent);

        if (Array.isArray(parsed)) {
          setRecent(
            parsed.filter(
              (item) =>
                typeof item === "string"
            )
          );
        }
      }
    } catch {
      // Keep defaults.
    }
  }, []);

  useEffect(() => {
    function syncPinsFromStorage() {
      try {
        const raw =
          window.localStorage.getItem(
            PINS_KEY
          );

        if (!raw) {
          return;
        }

        const parsed =
          JSON.parse(raw);

        if (Array.isArray(parsed)) {
          setPins(
            parsed.filter(
              (item) =>
                typeof item === "string"
            )
          );
        }
      } catch {
        // Keep current dock state.
      }
    }

    window.addEventListener(
      "nexus:dock-pins-changed",
      syncPinsFromStorage
    );

    return () => {
      window.removeEventListener(
        "nexus:dock-pins-changed",
        syncPinsFromStorage
      );
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target =
        event.target as HTMLElement | null;

      const editing =
        target?.closest(
          "input, textarea, select, [contenteditable='true']"
        );

      if (editing) {
        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();

        setLauncherView(
          "search"
        );

        setQuery("");

        saveMode("expanded");

        window.setTimeout(() => {
          searchRef.current?.focus();
        }, 50);
      }

      if (
        event.key === "Escape" &&
        mode === "expanded"
      ) {
        saveMode("normal");
      }
    }

    window.addEventListener(
      "keydown",
      onKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        onKeyDown
      );
    };
  }, [mode]);

  const visibleApps =
    useMemo(
      () =>
        loading
          ? []
          : apps.filter(
              (app) =>
                !app.permission ||
                can(app.permission)
            ).map((app) => ({
              ...app,
              href: !isCompact && app.href.endsWith("/hub")
                ? app.href.slice(0, -4)
                : app.href,
            })),
      [can, loading, isCompact]
    );

  useEffect(() => {
    const current =
      apps
        .filter((app) =>
          activeRoute(
                            pathname,
                            app.href,
                            app.activeRoot
                          )
        )
        .sort(
          (a, b) =>
            b.href.length -
            a.href.length
        )[0];

    if (!current) return;

    setRecent((existing) => {
      const next = [
        current.id,
        ...existing.filter(
          (id) =>
            id !== current.id
        ),
      ].slice(0, 6);

      try {
        window.localStorage.setItem(
          RECENT_KEY,
          JSON.stringify(next)
        );
      } catch {}

      return next;
    });
  }, [pathname]);

  const launcherApps =
    useMemo(() => {
      const term =
        query
          .trim()
          .toLowerCase();

      if (!term) {
        return visibleApps;
      }

      return visibleApps.filter(
        (app) =>
          app.label
            .toLowerCase()
            .includes(term) ||
          app.href
            .toLowerCase()
            .includes(term)
      );
    }, [
      query,
      visibleApps,
    ]);

  const pinnedApps =
    useMemo(
      () =>
        pins
          .map((id) =>
            visibleApps.find(
              (app) =>
                app.id === id
            )
          )
          .filter(
            (
              app
            ): app is DockApp =>
              Boolean(app)
          ),
      [pins, visibleApps]
    );

  const recentApps =
    useMemo(
      () =>
        recent
          .map((id) =>
            visibleApps.find(
              (app) =>
                app.id === id
            )
          )
          .filter(
            (
              app
            ): app is DockApp =>
              Boolean(app)
          ),
      [recent, visibleApps]
    );

  const currentApp =
    visibleApps
      .filter((app) =>
        activeRoute(
                            pathname,
                            app.href,
                            app.activeRoot
                          )
      )
      .sort(
        (a, b) =>
          b.href.length -
          a.href.length
      )[0];

  function saveMode(
    next: DockMode
  ) {
    setMode(next);

    try {
      window.localStorage.setItem(
        MODE_KEY,
        next
      );
    } catch {}
  }

  function savePins(
    next: string[]
  ) {
    const limited =
      next.slice(0, MAX_PINS);

    setPins(limited);

    try {
      window.localStorage.setItem(
        PINS_KEY,
        JSON.stringify(limited)
      );
    } catch {}
  }

  function togglePin(
    id: string
  ) {
    if (pins.includes(id)) {
      savePins(
        pins.filter(
          (item) =>
            item !== id
        )
      );

      return;
    }

    if (
      pins.length >=
      MAX_PINS
    ) {
      return;
    }

    savePins([
      ...pins,
      id,
    ]);
  }

  function movePin(
    id: string,
    direction: -1 | 1
  ) {
    const from =
      pins.indexOf(id);

    const to =
      from + direction;

    if (
      from < 0 ||
      to < 0 ||
      to >= pins.length
    ) {
      return;
    }

    const next = [...pins];

    [
      next[from],
      next[to],
    ] = [
      next[to],
      next[from],
    ];

    savePins(next);
  }

  function dropOn(
    target: string
  ) {
    if (
      !dragging ||
      dragging === target
    ) {
      setDragging(null);
      return;
    }

    const next = [...pins];

    const from =
      next.indexOf(dragging);

    const to =
      next.indexOf(target);

    if (
      from < 0 ||
      to < 0
    ) {
      setDragging(null);
      return;
    }

    next.splice(from, 1);

    next.splice(
      to,
      0,
      dragging
    );

    savePins(next);
    setDragging(null);
  }

  function openSearch() {

    setLauncherView(
      "search"
    );

    setQuery("");

    saveMode(
      "expanded"
    );

    window.setTimeout(
      () => {
        searchRef.current?.focus();
      },
      60
    );
  }


  function openApps() {

    setLauncherView(
      "apps"
    );

    setQuery("");

    saveMode(
      "expanded"
    );
  }


  if (
    mode === "collapsed" &&
    !isTouch
  ) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[80] flex justify-center px-3">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border/40 bg-background/40 p-1 shadow-lg backdrop-blur-2xl">

          <button
            type="button"
            onClick={() =>
              saveMode("normal")
            }
            className="flex h-10 items-center gap-2 rounded-full px-3 transition hover:bg-background/60"
            aria-label="Expand Nexus Dock"
          >
            <NexusIcon
              name={
                currentApp
                  ? nexusIconForRoute(
                      currentApp.href
                    )
                  : "core"
              }
              active
              size="sm"
            />

            <span className="hidden max-w-28 truncate text-xs font-medium sm:block">
              {currentApp?.label ?? "Nexus"}
            </span>

            <ChevronUp className="size-4 text-muted-foreground" />
          </button>

          <div
            className="mx-1 h-8 w-px shrink-0 bg-border/45"
            aria-hidden="true"
          />

          <button
            type="button"
            onClick={openSearch}
            className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
            aria-label="Search Nexus"
          >
            <Search className="size-5" />
          </button>

        </div>
      </div>
    );
  }

  return (
    <>
      {mode === "expanded" && (
        <div className="nexus-launcher-shell pointer-events-none fixed inset-x-0 bottom-[calc(7.25rem+env(safe-area-inset-bottom))] z-[79] flex justify-center px-3">
          <section
            data-launcher-view={launcherView}
            className="nexus-launcher-glass pointer-events-auto max-h-[calc(100dvh-9rem)] w-full max-w-4xl overflow-y-auto rounded-[26px] p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">
                  Search Nexus
                </p>

                <p className="mt-0.5 text-xs text-muted-foreground">
                  Applications, records, files and actions in one place.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  saveMode("normal")
                }
                className="flex size-9 items-center justify-center rounded-xl transition hover:bg-muted"
                aria-label="Close Nexus launcher"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="nexus-launcher-search relative mt-4">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />

              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) =>
                  setQuery(event.target.value)
                }
                placeholder="Search Nexus, records and files..."
                className="h-14 w-full rounded-2xl border border-border/50 bg-background/55 pl-12 pr-16 text-base outline-none transition placeholder:text-muted-foreground focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
              />

              <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground md:block">
                ⌘K
              </span>
            </div>

            {query.trim() && (
              <NexusSearchResults
                query={query}
                onOpen={() =>
                  saveMode("normal")
                }
              />
            )}

            {recentApps.length > 0 &&
              !query.trim() && (
              <div className="mt-4">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Recent
                </p>

                <div className="flex flex-wrap gap-2">
                  {recentApps.map(
                    (app) => (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => {
                          router.push(
                            app.href
                          );

                          saveMode(
                            "normal"
                          );
                        }}
                        className="flex items-center gap-2 rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-xs font-medium transition hover:bg-muted"
                      >
                        <NexusIcon
                          name={app.icon as never}
                          active={activeRoute(
                            pathname,
                            app.href,
                            app.activeRoot
                          )}
                          size="sm"
                        />

                        {app.label}
                      </button>
                    )
                  )}
                </div>
              </div>
            )}

            <div
              className={
                query.trim()
                  ? "hidden"
                  : "mt-4"
              }
            >
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Applications
              </p>

              {launcherApps.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/50 px-4 py-8 text-center">
                  <Search className="mx-auto size-5 text-muted-foreground" />

                  <p className="mt-2 text-sm font-medium">
                    No Nexus app found
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Try another app or module name.
                  </p>
                </div>
              ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                {launcherApps.map(
                  (app) => {
                    const pinned =
                      pins.includes(
                        app.id
                      );

                    const active =
                      activeRoute(
                            pathname,
                            app.href,
                            app.activeRoot
                          );

                    return (
                      <div
                        key={app.id}
                        draggable={!isTouch}
                        data-nexus-context="app"
                        data-nexus-app-id={app.id}
                        data-nexus-href={app.href}
                        data-nexus-label={app.label}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed =
                            "copyMove";

                          event.dataTransfer.setData(
                            "application/x-nexus-app",
                            app.id
                          );
                        }}
                        className={
                          active
                            ? "nexus-launcher-tile nexus-launcher-tile-active flex min-w-0 items-center gap-2 rounded-2xl p-2"
                            : "nexus-launcher-tile flex min-w-0 items-center gap-2 rounded-2xl p-2"
                        }
                      >
                        <button
                          type="button"
                          onClick={() => {
                            router.push(
                              app.href
                            );

                            saveMode(
                              "normal"
                            );
                          }}
                          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-2.5 py-2.5 text-left"
                        >
                          <NexusIcon
                            name={app.icon as never}
                            active={active}
                            size="lg"
                          />

                          <span className="truncate text-xs font-medium">
                            {app.label}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            togglePin(
                              app.id
                            )
                          }
                          disabled={
                            !pinned &&
                            pins.length >=
                              MAX_PINS
                          }
                          className={
                            pinned
                              ? "flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                              : "flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-25"
                          }
                          aria-label={
                            pinned
                              ? `Unpin ${app.label}`
                              : `Pin ${app.label}`
                          }
                        >
                          {pinned ? (
                            <PinOff className="size-3.5" />
                          ) : (
                            <Pin className="size-3.5" />
                          )}
                        </button>
                      </div>
                    );
                  }
                )}
              </div>
              )}
            </div>

            {!query.trim() &&
              pinnedApps.length > 0 && (
              <div className="mt-4 border-t border-border/40 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Pinned order
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      savePins(
                        defaultPins
                      )
                    }
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
                  >
                    <RotateCcw className="size-3" />
                    Reset
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {pinnedApps.map(
                    (
                      app,
                      index
                    ) => (
                      <div
                        key={app.id}
                        className="flex items-center rounded-xl border border-border/40 bg-background/35 p-1"
                      >
                        <span className="flex items-center gap-2 px-2 text-xs font-medium">
                          <NexusIcon
                            name={app.icon as never}
                            active={activeRoute(
                            pathname,
                            app.href,
                            app.activeRoot
                          )}
                            size="sm"
                          />

                          {app.label}
                        </span>

                        <button
                          type="button"
                          disabled={
                            index === 0
                          }
                          onClick={() =>
                            movePin(
                              app.id,
                              -1
                            )
                          }
                          className="flex size-7 items-center justify-center rounded-md transition hover:bg-muted disabled:opacity-20"
                        >
                          <ArrowLeft className="size-3" />
                        </button>

                        <button
                          type="button"
                          disabled={
                            index ===
                            pinnedApps.length -
                              1
                          }
                          onClick={() =>
                            movePin(
                              app.id,
                              1
                            )
                          }
                          className="flex size-7 items-center justify-center rounded-md transition hover:bg-muted disabled:opacity-20"
                        >
                          <ArrowRight className="size-3" />
                        </button>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-3">
              <span className="text-xs text-muted-foreground">
                {pins.length}/{MAX_PINS} pinned
              </span>

              <span className="text-xs text-muted-foreground">
                Drag icons directly on the dock to reorder
              </span>
            </div>
          </section>
        </div>
      )}

      {/* ==================================================
          PHONE SYSTEM DOCK
          Core · Home · Settings · Search
          ================================================== */}
      <div className="nexus-phone-system-dock pointer-events-none fixed z-[80] md:hidden">
        <nav
          aria-label="Nexus phone navigation"
          className="pointer-events-auto grid grid-cols-4 items-end"
        >

          <button
            type="button"
            onClick={() => {
              saveMode("normal");
              window.dispatchEvent(
                new Event("nexus:helper-open")
              );
            }}
            className="nexus-phone-system-item"
            aria-label="Nexus Core"
            aria-controls="nexus-core-helper"
          >
            <NexusIcon
              name="core"
              size="lg"
            />

            <span>
              Core
            </span>
          </button>


          <Link
            href="/dashboard"
            prefetch={false}
            className="nexus-phone-system-item"
            aria-label="Home"
          >
            <Home className="size-[21px]" />

            <span>
              Home
            </span>
          </Link>


          <Link
            href="/settings"
            prefetch={false}
            className="nexus-phone-system-item"
            aria-label="Settings"
          >
            <Settings className="size-[21px]" />

            <span>
              Settings
            </span>
          </Link>


          <button
            type="button"
            onClick={openSearch}
            className="nexus-phone-system-item"
            aria-label="Search Nexus"
          >
            <Search className="size-[21px]" />

            <span>
              Search
            </span>
          </button>

        </nav>
      </div>


      {/* Desktop / tablet dock */}
      <div className="nexus-dock-shell pointer-events-none fixed inset-x-0 bottom-3 z-[80] hidden justify-center px-2 md:flex">
        <nav
          aria-label="Nexus Dock"
          onDragOver={(event) => {
            if (
              event.dataTransfer.types.includes(
                "application/x-nexus-app"
              )
            ) {
              event.preventDefault();
              event.dataTransfer.dropEffect =
                "copy";
            }
          }}
          onDrop={(event) => {
            const appId =
              event.dataTransfer.getData(
                "application/x-nexus-app"
              );

            if (
              appId &&
              visibleApps.some(
                (app) =>
                  app.id === appId
              ) &&
              !pins.includes(appId) &&
              pins.length < MAX_PINS
            ) {
              savePins([
                ...pins,
                appId,
              ]);
            }
          }}
          className="nexus-dock-glass pointer-events-auto flex max-w-[calc(100vw-1rem)] items-center gap-1 overflow-x-auto rounded-[26px] p-2"
        >
          {pinnedApps.map(
            (app) => {
              const active =
                activeRoute(
                            pathname,
                            app.href,
                            app.activeRoot
                          );

              return (
                <Link
                  key={app.id}
                  href={app.href}
                  prefetch={false}
                  draggable={!isTouch}
                  data-nexus-context="app"
                  data-nexus-app-id={app.id}
                  data-nexus-href={app.href}
                  data-nexus-label={app.label}
                  onDragStart={(event) => {
                    setDragging(
                      app.id
                    );

                    event.dataTransfer.effectAllowed =
                      "move";

                    event.dataTransfer.setData(
                      "application/x-nexus-app",
                      app.id
                    );
                  }}
                  onDragOver={(
                    event
                  ) =>
                    event.preventDefault()
                  }
                  onDrop={() =>
                    dropOn(
                      app.id
                    )
                  }
                  className={
                    active
                      ? "nexus-dock-app nexus-dock-app-active relative flex min-w-[66px] flex-col items-center justify-center gap-1 rounded-2xl bg-primary/10 px-2 py-2 text-primary"
                      : "nexus-dock-app relative flex min-w-[66px] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-muted-foreground hover:bg-background/40 hover:text-foreground"
                  }
                >
                  <NexusIcon
                    name={app.icon as never}
                    active={active}
                    size="lg"
                  />

                  <span className="max-w-[72px] truncate text-[10px] font-medium">
                    {app.label}
                  </span>

                  {active && (
                    <span className="absolute -bottom-px h-0.5 w-4 rounded-full bg-primary" />
                  )}
                </Link>
              );
            }
          )}

          <button
            type="button"
            onClick={openSearch}
            className="nexus-dock-app flex min-w-[66px] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
            aria-label="Search Nexus"
          >
            <Search className="size-[18px]" />

            <span className="text-[9px] font-medium">
              Search
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (
                mode === "expanded" &&
                launcherView === "apps"
              ) {
                saveMode(
                  "normal"
                );

                return;
              }

              openApps();
            }}
            className={
              mode === "expanded"
                ? "mx-0.5 hidden size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary md:flex"
                : "mx-0.5 hidden size-11 shrink-0 items-center justify-center rounded-2xl text-primary transition hover:bg-primary/10 md:flex"
            }
            aria-label="Open Nexus applications"
          >
            <NexusIcon
              name="core"
              active={
                mode === "expanded"
              }
              size="lg"
            />
          </button>

          <button
            type="button"
            onClick={() =>
              saveMode(
                "collapsed"
              )
            }
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
            aria-label="Collapse Nexus Dock"
          >
            <ChevronDown className="size-4" />
          </button>
        </nav>
      </div>
    </>
  );
}
