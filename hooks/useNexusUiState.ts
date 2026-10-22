"use client";

import { useCallback, useMemo, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import { useBrowserHydrated } from "@/lib/nexus/browser-storage";
import { writeNexusUiState } from "@/lib/nexus/ui-memory";

const prefix = "nexus-ui-state-v1:";
const values = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();
const serverSnapshot = () => null;

function readRaw(key: string): string | null {
  if (values.has(key)) return values.get(key)!;
  try { return window.sessionStorage.getItem(prefix + key); }
  catch { return null; }
}

function decode<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    const stored: unknown = JSON.parse(raw);
    if (stored && typeof stored === "object" && "value" in stored) {
      return stored.value as T;
    }
  } catch { /* UI memory is optional. */ }
  return fallback;
}

function subscribe(key: string, listener: () => void) {
  const group = listeners.get(key) ?? new Set<() => void>();
  listeners.set(key, group);
  group.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === prefix + key) {
      values.delete(key);
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    group.delete(listener);
    if (!group.size) listeners.delete(key);
    window.removeEventListener("storage", onStorage);
  };
}

export function useNexusUiState<T>(key: string, initialValue: T) {
  const onSubscribe = useCallback((listener: () => void) => subscribe(key, listener), [key]);
  const snapshot = useCallback(() => readRaw(key), [key]);
  const raw = useSyncExternalStore(onSubscribe, snapshot, serverSnapshot);
  const value = useMemo(() => decode(raw, initialValue), [initialValue, raw]);
  const hydrated = useBrowserHydrated();
  const setValue = useCallback<Dispatch<SetStateAction<T>>>((update) => {
    const previous = decode(readRaw(key), initialValue);
    const next = typeof update === "function" ? (update as (value: T) => T)(previous) : update;
    writeNexusUiState(key, next);
    // Keep edits usable when the browser blocks session storage.
    values.set(key, JSON.stringify({ value: next }));
    listeners.get(key)?.forEach((listener) => listener());
  }, [initialValue, key]);

  return [value, setValue, hydrated] as const;
}
