"use client";

import Link from "next/link";

import {
  usePathname,
  useRouter,
} from "next/navigation";

import {
  NexusIcon,
} from "@/components/nexus-icons/NexusIcon";

import {
  usePermissions,
} from "@/hooks/usePermissions";

import {
  getNexusDrawerApps,
} from "@/lib/nexus/registry";


type Props = {
  onNavigate?: () => void;
};


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


export default function NexusMobileDrawer({
  onNavigate,
}: Props) {

  const pathname =
    usePathname();

  const router =
    useRouter();

  const {
    can,
    loading,
  } =
    usePermissions();


  const applications =
    loading
      ? []
      : getNexusDrawerApps()
          .filter(
            (app) =>
              !app.permission ||
              can(
                app.permission
              )
          );


  return (
    <div className="nexus-mobile-drawer flex min-h-full flex-col bg-background">

      <div className="border-b border-border/40 px-5 pb-4 pt-[calc(18px+env(safe-area-inset-top))]">

        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          JINLAB
        </p>

        <h2 className="mt-1 text-2xl font-bold tracking-tight">
          Nexus
        </h2>

        <p className="mt-1 text-xs text-muted-foreground">
          Applications
        </p>

      </div>


      <nav className="flex-1 overflow-y-auto px-3 py-4">

        <div className="space-y-1">

          {applications.map(
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
                  onPointerEnter={() =>
                    router.prefetch(
                      app.href
                    )
                  }
                  onTouchStart={() =>
                    router.prefetch(
                      app.href
                    )
                  }
                  onClick={
                    onNavigate
                  }
                  className={
                    active
                      ? "flex min-h-[64px] items-center gap-3 rounded-2xl bg-primary/10 px-3 text-primary"
                      : "flex min-h-[64px] items-center gap-3 rounded-2xl px-3 text-foreground transition active:bg-muted"
                  }
                >

                  <div className="flex size-12 shrink-0 items-center justify-center">

                    <NexusIcon
                      name={
                        app.icon as never
                      }
                      active={active}
                      size="lg"
                    />

                  </div>


                  <div className="min-w-0 flex-1">

                    <p className="truncate text-sm font-semibold">
                      {app.label}
                    </p>

                  </div>

                </Link>
              );

            }
          )}

        </div>

      </nav>


      <div className="border-t border-border/40 px-5 py-4">

        <p className="text-[10px] text-muted-foreground">
          Swipe left to close
        </p>

      </div>

    </div>
  );
}
