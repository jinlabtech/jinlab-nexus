"use client";

import Link from "next/link";

import {
  useRouter,
} from "next/navigation";

import {
  createPortal,
} from "react-dom";

import {
  useEffect,
  useState,
} from "react";

import {
  Activity,
  ChevronRight,
  Clock3,
  Plus,
  Sparkles,
  X,
} from "lucide-react";

import {
  NexusIcon,
} from "@/components/nexus-icons/NexusIcon";

import {
  getMobileNexusApps,
} from "@/lib/nexus/registry";


const RECENT_KEY =
  "nexus-mobile-recent-apps-v1";


const quickActions = [
  {
    id: "pos",
    label: "Open POS",
    detail: "Start selling",
    href: "/pos",
    icon: "pos",
  },
  {
    id: "customers",
    label: "Customers",
    detail: "Open customer records",
    href: "/customers",
    icon: "customers",
  },
  {
    id: "repairs",
    label: "Repairs",
    detail: "Open repair workspace",
    href: "/repairs",
    icon: "repairs",
  },
  {
    id: "shipment",
    label: "New Shipment",
    detail: "Prepare a delivery",
    href: "/shipping/new",
    icon: "shipping-new",
  },
] as const;


export default function NexusMobileHome() {
  const router =
    useRouter();

  const apps =
    getMobileNexusApps();

  const [
    mounted,
    setMounted,
  ] =
    useState(false);

  const [
    quickOpen,
    setQuickOpen,
  ] =
    useState(false);

  const [
    recentIds,
    setRecentIds,
  ] =
    useState<string[]>(
      []
    );

  const [
    now,
    setNow,
  ] =
    useState<Date | null>(
      null
    );


  useEffect(() => {
    setMounted(true);
    setNow(
      new Date()
    );

    try {
      const saved =
        window.localStorage.getItem(
          RECENT_KEY
        );

      if (saved) {
        const parsed =
          JSON.parse(saved);

        if (
          Array.isArray(parsed)
        ) {
          setRecentIds(
            parsed.filter(
              (value) =>
                typeof value ===
                "string"
            )
          );
        }
      }
    } catch {
      // Mobile home still works
      // when local storage is unavailable.
    }
  }, []);


  useEffect(() => {
    const timer =
      window.setInterval(
        () => {
          setNow(
            new Date()
          );
        },
        30_000
      );

    return () =>
      window.clearInterval(
        timer
      );
  }, []);


  useEffect(() => {
    if (!quickOpen) {
      return;
    }

    const previous =
      document.body.style
        .overflow;

    document.body.style
      .overflow =
      "hidden";

    return () => {
      document.body.style
        .overflow =
        previous;
    };
  }, [quickOpen]);


  function prepareRoute(
    href: string
  ) {
    router.prefetch(
      href
    );
  }


  function rememberApp(
    id: string
  ) {
    setRecentIds(
      (current) => {
        const next =
          [
            id,
            ...current.filter(
              (item) =>
                item !== id
            ),
          ].slice(
            0,
            6
          );

        try {
          window.localStorage
            .setItem(
              RECENT_KEY,
              JSON.stringify(
                next
              )
            );
        } catch {
          // Ignore storage failure.
        }

        return next;
      }
    );
  }


  function openQuick(
    href: string
  ) {
    setQuickOpen(
      false
    );

    router.push(
      href
    );
  }


  const recentApps =
    recentIds
      .map(
        (id) =>
          apps.find(
            (app) =>
              app.id === id
          )
      )
      .filter(
        Boolean
      )
      .slice(
        0,
        4
      );


  const hour =
    now?.getHours() ??
    12;

  const greeting =
    !now
      ? "Nexus is ready"
      : hour < 12
        ? "Good morning"
        : hour < 18
          ? "Good afternoon"
          : "Good evening";


  const time =
    now
      ? now.toLocaleTimeString(
          [],
          {
            hour:
              "2-digit",
            minute:
              "2-digit",
          }
        )
      : "Live";


  return (
    <>
      <section className="nexus-phone-home md:hidden">

        <div className="nexus-phone-home-ambient" aria-hidden="true">
          <span />
          <span />
        </div>


        <div className="nexus-phone-home-hero">

          <div className="nexus-phone-home-heading">

            <div>
              <p className="nexus-phone-home-eyebrow">
                JINLAB NEXUS
              </p>

              <h1>
                {greeting}
              </h1>

              <p className="nexus-phone-home-subtitle">
                Your business workspace is live.
              </p>
            </div>


            <button
              type="button"
              className="nexus-phone-quick-button"
              onClick={() =>
                setQuickOpen(
                  true
                )
              }
              aria-label="Open Nexus quick actions"
            >
              <Plus />
            </button>

          </div>


          <div className="nexus-phone-live-card">

            <div className="nexus-phone-live-identity">

              <span className="nexus-phone-live-orb">
                <Activity />
              </span>

              <span>
                <strong>
                  Nexus Now
                </strong>

                <small>
                  System active
                </small>
              </span>

            </div>


            <div className="nexus-phone-live-time">

              <Clock3 />

              <span>
                {time}
              </span>

            </div>


            <div className="nexus-phone-live-wave" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>

          </div>

        </div>


        <div className="nexus-phone-quick-strip">

          <button
            type="button"
            onClick={() =>
              setQuickOpen(
                true
              )
            }
            className="nexus-phone-quick-chip nexus-phone-quick-chip--primary"
          >
            <Sparkles />
            Quick actions
          </button>


          {quickActions
            .slice(
              0,
              3
            )
            .map(
              (
                action
              ) => (
                <button
                  key={
                    action.id
                  }
                  type="button"
                  className="nexus-phone-quick-chip"
                  onPointerEnter={() =>
                    prepareRoute(
                      action.href
                    )
                  }
                  onTouchStart={() =>
                    prepareRoute(
                      action.href
                    )
                  }
                  onClick={() =>
                    openQuick(
                      action.href
                    )
                  }
                >
                  <NexusIcon
                    name={
                      action.icon as never
                    }
                    size="sm"
                  />

                  {action.label}
                </button>
              )
            )}

        </div>


        {recentApps.length >
          0 && (
          <section className="nexus-phone-recent">

            <div className="nexus-phone-section-heading">

              <div>
                <strong>
                  Recent
                </strong>

                <small>
                  Continue where you left off
                </small>
              </div>

            </div>


            <div className="nexus-phone-recent-grid">

              {recentApps.map(
                (
                  app
                ) =>
                  app ? (
                    <Link
                      key={
                        app.id
                      }
                      href={
                        app.href
                      }
                      prefetch={
                        false
                      }
                      onTouchStart={() =>
                        prepareRoute(
                          app.href
                        )
                      }
                      onClick={() =>
                        rememberApp(
                          app.id
                        )
                      }
                      className="nexus-phone-recent-app"
                    >

                      <span className="nexus-phone-recent-icon">
                        <NexusIcon
                          name={
                            app.icon as never
                          }
                          size="sm"
                        />
                      </span>

                      <span>
                        {
                          app.label
                        }
                      </span>

                    </Link>
                  ) : null
              )}

            </div>

          </section>
        )}


        <section className="nexus-phone-app-library">

          <div className="nexus-phone-section-heading">

            <div>
              <strong>
                Applications
              </strong>

              <small>
                Your Nexus workspace
              </small>
            </div>

          </div>


          <div className="nexus-phone-app-grid">

            {apps.map(
              (
                app,
                index
              ) => (

                <Link
                  key={
                    app.id
                  }
                  href={
                    app.href
                  }
                  prefetch={
                    false
                  }
                  onPointerEnter={() =>
                    prepareRoute(
                      app.href
                    )
                  }
                  onTouchStart={() =>
                    prepareRoute(
                      app.href
                    )
                  }
                  onFocus={() =>
                    prepareRoute(
                      app.href
                    )
                  }
                  onClick={() =>
                    rememberApp(
                      app.id
                    )
                  }
                  style={{
                    animationDelay:
                      `${
                        70 +
                        Math.min(
                          index,
                          14
                        ) *
                          34
                      }ms`,
                  }}
                  className="nexus-phone-app nexus-phone-app--arrive"
                >

                  <div className="nexus-phone-app-icon">

                    <NexusIcon
                      name={
                        app.icon as never
                      }
                      size="lg"
                    />

                  </div>


                  <span className="nexus-phone-app-label">
                    {
                      app.label
                    }
                  </span>

                </Link>

              )
            )}

          </div>

        </section>

      </section>


      {mounted &&
        quickOpen &&
        createPortal(
          <div
            className="nexus-phone-sheet-backdrop md:hidden"
            role="presentation"
            onPointerDown={(
              event
            ) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setQuickOpen(
                  false
                );
              }
            }}
          >

            <section
              role="dialog"
              aria-modal="true"
              aria-label="Nexus quick actions"
              className="nexus-phone-sheet"
            >

              <div className="nexus-phone-sheet-handle" />


              <header className="nexus-phone-sheet-header">

                <div>

                  <p>
                    NEXUS
                  </p>

                  <h2>
                    Quick Actions
                  </h2>

                  <span>
                    Jump straight into work.
                  </span>

                </div>


                <button
                  type="button"
                  onClick={() =>
                    setQuickOpen(
                      false
                    )
                  }
                  aria-label="Close quick actions"
                  className="nexus-phone-sheet-close"
                >
                  <X />
                </button>

              </header>


              <div className="nexus-phone-sheet-actions">

                {quickActions.map(
                  (
                    action,
                    index
                  ) => (

                    <button
                      key={
                        action.id
                      }
                      type="button"
                      style={{
                        animationDelay:
                          `${
                            90 +
                            index *
                              55
                          }ms`,
                      }}
                      className="nexus-phone-sheet-action"
                      onPointerEnter={() =>
                        prepareRoute(
                          action.href
                        )
                      }
                      onClick={() =>
                        openQuick(
                          action.href
                        )
                      }
                    >

                      <span className="nexus-phone-sheet-action-icon">
                        <NexusIcon
                          name={
                            action.icon as never
                          }
                          size="lg"
                        />
                      </span>


                      <span className="nexus-phone-sheet-action-copy">

                        <strong>
                          {
                            action.label
                          }
                        </strong>

                        <small>
                          {
                            action.detail
                          }
                        </small>

                      </span>


                      <ChevronRight />

                    </button>

                  )
                )}

              </div>

            </section>

          </div>,
          document.body
        )}

    </>
  );
}
