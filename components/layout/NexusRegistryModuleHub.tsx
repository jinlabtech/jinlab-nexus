"use client";

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


  if (!app) {
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
