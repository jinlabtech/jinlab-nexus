"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { NexusIcon } from "@/components/nexus-icons/NexusIcon";

import {
  getMobileNexusApps,
} from "@/lib/nexus/registry";


export default function NexusMobileHome() {

  const router =
    useRouter();

  const apps =
    getMobileNexusApps();


  function prepareRoute(
    href: string
  ) {

    router.prefetch(
      href
    );

  }


  return (
    <section className="nexus-phone-home md:hidden">

      <div className="px-5 pb-4 pt-5">

        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Nexus
        </p>

        <h1 className="mt-1 text-[28px] font-bold tracking-tight">
          Applications
        </h1>

      </div>


      <div className="nexus-phone-app-grid">

        {apps.map(
          (app) => (

            <Link
              key={app.id}
              href={app.href}
              prefetch={false}
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
              className="nexus-phone-app"
            >

              <div className="nexus-phone-app-icon">

                <NexusIcon
                  name={app.icon as never}
                  size="lg"
                />

              </div>


              <span className="nexus-phone-app-label">
                {app.label}
              </span>

            </Link>

          )
        )}

      </div>

    </section>
  );
}
