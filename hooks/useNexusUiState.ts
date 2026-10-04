"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  readNexusUiState,
  writeNexusUiState,
} from "@/lib/nexus/ui-memory";


export function useNexusUiState<T>(
  key: string,
  initialValue: T
) {

  const [
    value,
    setValue,
  ] =
    useState<T>(
      initialValue
    );


  const [
    hydrated,
    setHydrated,
  ] =
    useState(false);


  useEffect(
    () => {

      setValue(
        readNexusUiState(
          key,
          initialValue
        )
      );

      setHydrated(
        true
      );

    },
    [
      key,
    ]
  );


  useEffect(
    () => {

      if (!hydrated) {
        return;
      }


      writeNexusUiState(
        key,
        value
      );

    },
    [
      hydrated,
      key,
      value,
    ]
  );


  return [
    value,
    setValue,
    hydrated,
  ] as const;
}
