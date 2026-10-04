"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  Activity,
  Menu,
} from "lucide-react";

import {
  usePathname,
  useRouter,
} from "next/navigation";

import Sidebar from "@/components/Sidebar";
import NexusMobileDrawer from "@/components/layout/NexusMobileDrawer";
import NexusNavigationWarmup from "@/components/layout/NexusNavigationWarmup";
import NexusNavigationMemory from "@/components/layout/NexusNavigationMemory";
import NexusWorkspaceMemory from "@/components/layout/NexusWorkspaceMemory";

import {
  getNexusBackTarget,
  getNexusRouteLabel,
} from "@/lib/nexus/registry";
import NexusSystemBar from "@/components/layout/NexusSystemBar";
import NexusDock from "@/components/layout/NexusDock";
import NexusActionMenu from "@/components/layout/NexusActionMenu";
import NexusAppearanceBoot from "@/components/nexus-icons/NexusAppearanceBoot";
import NexusHelper from "@/components/NexusHelper";
import NexusPageMotion from "@/components/layout/NexusPageMotion";
import { NexusIcon } from "@/components/nexus-icons/NexusIcon";
import { useNexusSidebarSwipe } from "@/hooks/useNexusSidebarSwipe";



const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/accept-invite",
  "/auth",
];


function usesNexusShell(
  pathname: string
) {

  if (
    pathname === "/"
  ) {
    return false;
  }


  if (
    PUBLIC_PREFIXES.some(
      (prefix) =>
        pathname.startsWith(
          prefix
        )
    )
  ) {
    return false;
  }


  /*
   * Printed documents should remain clean documents,
   * without Nexus navigation around them.
   */
  if (
    pathname.includes(
      "/print"
    )
  ) {
    return false;
  }


  return true;
}



export default function NexusPersistentShell({
  children,
}: {
  children: React.ReactNode;
}) {

  const pathname =
    usePathname();

  const router =
    useRouter();


  const [
    sidebarOpen,
    setSidebarOpen,
  ] =
    useState(false);


  const shellEnabled =
    usesNexusShell(
      pathname
    );


  const title =
    useMemo(
      () =>
        getNexusRouteLabel(
          pathname
        ),
      [
        pathname,
      ]
    );


  const backTarget =
    useMemo(
      () =>
        getNexusBackTarget(
          pathname
        ),
      [
        pathname,
      ]
    );


  useEffect(
    () => {

      if (
        !shellEnabled
      ) {
        return;
      }


      const mobile =
        window.matchMedia(
          "(max-width: 767px)"
        ).matches;


      if (mobile) {

        setSidebarOpen(
          false
        );

        return;
      }


      const saved =
        window.localStorage
          .getItem(
            "nexus-sidebar-open"
          );


      setSidebarOpen(
        saved !==
          "false"
      );

    },
    [
      shellEnabled,
    ]
  );


  useEffect(
    () => {

      if (
        !shellEnabled
      ) {
        return;
      }


      const mobile =
        window.matchMedia(
          "(max-width: 767px)"
        ).matches;


      if (!mobile) {

        window.localStorage
          .setItem(
            "nexus-sidebar-open",
            String(
              sidebarOpen
            )
          );
      }

    },
    [
      sidebarOpen,
      shellEnabled,
    ]
  );


  useEffect(
    () => {

      /*
       * Opening another module on phone closes the drawer.
       * The shell itself remains mounted.
       */
      if (
        window.matchMedia(
          "(max-width: 767px)"
        ).matches
      ) {
        setSidebarOpen(
          false
        );
      }

    },
    [
      pathname,
    ]
  );


  useNexusSidebarSwipe({
    open: sidebarOpen,
    setOpen: setSidebarOpen,
  });

  if (
    !shellEnabled
  ) {
    return (
      <>
        {children}
      </>
    );
  }


  function toggleSidebar() {

    setSidebarOpen(
      (current) =>
        !current
    );
  }


  return (
    <div className="nexus-shell min-h-[100dvh] overflow-x-hidden bg-muted/30 md:flex md:h-screen md:overflow-hidden">

      {/* MOBILE SWIPE DRAWER */}
      <button
        type="button"
        aria-label="Close Nexus navigation"
        onClick={() => setSidebarOpen(false)}
        className={`fixed inset-0 z-[89] bg-black/35 backdrop-blur-[2px] transition-opacity duration-200 md:hidden ${
          sidebarOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        className={`nexus-mobile-sidebar fixed inset-y-0 left-0 z-[90] w-[min(86vw,19rem)] transform transition-transform duration-200 ease-out md:hidden ${
          sidebarOpen
            ? "translate-x-0"
            : "-translate-x-full"
        }`}
      >
        <NexusMobileDrawer
          onNavigate={() =>
            setSidebarOpen(false)
          }
        />
      </aside>


      {/* DESKTOP SIDEBAR */}
      {sidebarOpen && (
        <div className="hidden shrink-0 md:block">
          <Sidebar
            onToggleSidebar={
              toggleSidebar
            }
          />
        </div>
      )}


      <div className="nexus-shell-workspace min-w-0 flex-1 md:h-screen md:overflow-y-auto">

        {/* DESKTOP SYSTEM BAR */}
        <div className="hidden md:block">
          <NexusSystemBar
            sidebarOpen={
              sidebarOpen
            }
            onToggleSidebar={
              toggleSidebar
            }
          />
        </div>


        {/* MOBILE APP HEADER */}
        <header className="nexus-mobile-app-header sticky top-0 z-[70] grid h-[56px] grid-cols-[44px_minmax(0,1fr)_88px] items-center border-b border-border/40 bg-background/94 px-2 backdrop-blur-xl md:hidden">

          {!backTarget ? (
            <button type="button" onClick={toggleSidebar} aria-label="Open navigation" className="flex size-11 items-center justify-center rounded-full"><Menu className="size-5" /></button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (backTarget) {
                  router.push(
                    backTarget
                  );
                }
              }}
              className="flex size-10 items-center justify-center rounded-full transition active:scale-90"
              aria-label="Back"
            >
              <ArrowLeft className="size-5" />
            </button>
          )}


          <div className="min-w-0 text-center">
            <p className="truncate text-[17px] font-semibold tracking-tight">
              {title}
            </p>
          </div>


          <div className="flex items-center">
            <button type="button" aria-label="Open Nexus Core helper" aria-controls="nexus-core-helper" onClick={() => window.dispatchEvent(new Event("nexus:helper-open"))} className="flex size-11 items-center justify-center rounded-full text-primary"><Activity className="size-5" /></button>
          <button
            type="button"
            onClick={() =>
              router.push("/dashboard")
            }
            className="flex size-10 items-center justify-center rounded-full transition active:scale-90"
            aria-label="Nexus Home"
          >
            <NexusIcon
              name="core"
              size="sm"
            />
          </button>
          </div>

        </header>


        {/* APP WORKSPACE */}
        <div
          role="main"
          className="nexus-app-workspace min-w-0 md:pb-32"
        >

          <NexusPageMotion>
            {children}
          </NexusPageMotion>

        </div>

      </div>


      {/* PERSISTENT NAVIGATION */}
      <NexusNavigationMemory />

      <NexusWorkspaceMemory />

      <NexusNavigationWarmup />

      <NexusDock />

      <NexusActionMenu />

      <NexusAppearanceBoot />

      <NexusHelper />

    </div>
  );
}
