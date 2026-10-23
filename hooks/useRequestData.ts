"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RequestState<T> = {
  key: string;
  enabled: boolean;
  data?: T;
  errorMessage: string;
  pending: boolean;
};

/** Keep results scoped to their request and ignore superseded responses. */
export function useRequestData<T>(
  key: string,
  enabled: boolean,
  load: () => Promise<T>,
  failureMessage: string
) {
  const [state, setState] = useState<RequestState<T>>({
    key,
    enabled,
    errorMessage: "",
    pending: enabled,
  });

  if (state.key !== key || state.enabled !== enabled) {
    setState({ key, enabled, errorMessage: "", pending: enabled });
  }

  const requestVersion = useRef(0);

  const loadData = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!enabled) return;

    try {
      const data = await load();
      if (version !== requestVersion.current) return;
      setState({ key, enabled, data, errorMessage: "", pending: false });
    } catch (error) {
      if (version !== requestVersion.current) return;
      setState((previous) => ({
        key,
        enabled,
        data: previous.key === key && previous.enabled ? previous.data : undefined,
        errorMessage: error instanceof Error ? error.message : failureMessage,
        pending: false,
      }));
    }
  }, [enabled, failureMessage, key, load]);

  useEffect(() => {
    void loadData();
    return () => { requestVersion.current += 1; };
  }, [loadData]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setState((previous) => ({
      key,
      enabled,
      data: previous.key === key && previous.enabled ? previous.data : undefined,
      errorMessage: "",
      pending: true,
    }));
    await loadData();
  }, [enabled, key, loadData]);

  // A scope change immediately hides the previous scope's data and errors.
  const current = enabled && state.enabled && state.key === key;
  return {
    data: current ? state.data : undefined,
    loading: enabled && (!current || state.pending),
    errorMessage: current ? state.errorMessage : "",
    refresh,
  };
}
