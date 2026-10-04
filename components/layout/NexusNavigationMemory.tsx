"use client";

import {
  useEffect,
} from "react";

import {
  usePathname,
} from "next/navigation";

import {
  rememberNexusPath,
} from "@/lib/nexus/navigation-memory";


export default function NexusNavigationMemory() {

  const pathname =
    usePathname();


  useEffect(
    () => {

      rememberNexusPath(
        pathname
      );

    },
    [
      pathname,
    ]
  );


  return null;
}
