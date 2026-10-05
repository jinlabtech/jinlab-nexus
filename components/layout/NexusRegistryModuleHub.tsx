"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

function subscribeDesktop(callback: () => void) {
  const query = window.matchMedia("(min-width: 768px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const desktopSnapshot = () => window.matchMedia("(min-width: 768px)").matches;
const serverSnapshot = () => false;

import NexusModuleHub, {
  type NexusHubIcon,
} from "@/components/layout/NexusModuleHub";

import {
  usePermissions,
} from "@/hooks/usePermissions";

import {
  getNexusApp,
  getNexusModuleChildren,
  type NexusAppId,
} from "@/lib/nexus/registry";


type Props = {
  moduleId: NexusAppId;
  subtitle?: string;
};


export default function NexusRegistryModuleHub({
  moduleId,
  subtitle,
}: Props) {

  const {
    can,
    loading,
  } =
    usePermissions();


  const app =
    getNexusApp(
      moduleId
    );


  const router = useRouter();
  const desktop = useSyncExternalStore(subscribeDesktop, desktopSnapshot, serverSnapshot);
  const desktopHref = app?.href.endsWith("/hub") ? app.href.slice(0, -4) : null;
  useEffect(() => {
    if (desktop && desktopHref) router.replace(desktopHref);
  }, [desktop, desktopHref, router]);

  const features =
    loading
      ? []
      : getNexusModuleChildren(
          moduleId
        )
          .filter(
            (feature) =>
              !feature.permission ||
              can(
                feature.permission
              )
          );


  if (!app || (desktop && desktopHref)) {
    return null;
  }


  return (
    <NexusModuleHub
      moduleId={moduleId}
      title={app.label}
      subtitle={
        subtitle ??
        `Choose what you want to do in ${app.label}.`
      }
      items={
        features.map(
          (feature) => ({
            label:
              feature.label,

            href:
              feature.href,

            icon:
              feature.icon as
                NexusHubIcon,

            tone:
              feature.tone,
          })
        )
      }
    />
  );
}
