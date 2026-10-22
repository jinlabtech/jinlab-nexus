"use client";

import { useCallback, useMemo, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";

const listeners = new Map<string, Set<() => void>>();
const sessionValues = new Map<string, string>();
const serverSnapshot = () => null;
const subscribeHydration = () => () => {};
const clientHydrated = () => true;
const serverHydrated = () => false;

export function useBrowserHydrated() {
  return useSyncExternalStore(subscribeHydration, clientHydrated, serverHydrated);
}

function read(key: string): string | null {
  if (sessionValues.has(key)) return sessionValues.get(key)!;
  try { return window.localStorage.getItem(key); }
  catch { return null; }
}

function subscribe(key: string, listener: () => void) {
  const group = listeners.get(key) ?? new Set<() => void>();
  listeners.set(key, group);
  group.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) {
      sessionValues.delete(key);
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  // The existing dock pin picker writes directly to localStorage.
  window.addEventListener("nexus:dock-pins-changed", listener);
  window.addEventListener("nexus:navigation-memory", listener);
  return () => {
    group.delete(listener);
    if (!group.size) listeners.delete(key);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("nexus:dock-pins-changed", listener);
    window.removeEventListener("nexus:navigation-memory", listener);
  };
}

/** Subscribe to browser storage instead of copying it into state after mount. */
export function useBrowserStorage<T>(key: string, fallback: T, decode: (raw: string) => T): [T, Dispatch<SetStateAction<T>>] {
  const onSubscribe = useCallback((listener: () => void) => subscribe(key, listener), [key]);
  const snapshot = useCallback(() => read(key), [key]);
  const raw = useSyncExternalStore(onSubscribe, snapshot, serverSnapshot);
  const parse = useCallback((value: string | null): T => {
    if (value === null) return fallback;
    try { return decode(value); } catch { return fallback; }
  }, [decode, fallback]);
  const value = useMemo(() => parse(raw), [parse, raw]);
  const setValue = useCallback<Dispatch<SetStateAction<T>>>((update) => {
    const current = parse(read(key));
    const next = typeof update === "function" ? (update as (previous: T) => T)(current) : update;
    const serialized = JSON.stringify(next);
    if (serialized === read(key)) return;
    try { window.localStorage.setItem(key, serialized); sessionValues.delete(key); }
    catch { sessionValues.set(key, serialized); }
    listeners.get(key)?.forEach(listener => listener());
  }, [key, parse]);
  return [value, setValue];
}

export function decodeStringList(raw: string): string[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

let clock: number | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;
const clockListeners = new Set<() => void>();
function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  if (!clockTimer) {
    clock = Date.now();
    clockTimer = setInterval(() => {
      clock = Date.now();
      clockListeners.forEach(callback => callback());
    }, 30_000);
  }
  return () => {
    clockListeners.delete(listener);
    if (!clockListeners.size && clockTimer) { clearInterval(clockTimer); clockTimer = null; clock = null; }
  };
}
const clockSnapshot = () => clock;
export function useBrowserClock() {
  return useSyncExternalStore(subscribeClock, clockSnapshot, serverSnapshot);
}
