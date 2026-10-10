// lib/booker/useLoad.ts
// Minimal async-load hook for workspace pages: data, loading, error and reload.
// Ignores results from superseded loads so a slow earlier request can never
// overwrite a newer one.

import { useCallback, useEffect, useRef, useState } from 'react';

export interface LoadState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Runs `loader` on mount and whenever `key` changes.
 *
 * @param loader async function returning the page's data
 * @param key    a string that changes when the inputs to `loader` change
 */
export function useLoad<T>(loader: () => Promise<T>, key = ''): LoadState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const result = await loaderRef.current();
      if (mine === seq.current) setData(result);
    } catch (err) {
      if (mine === seq.current) setError(err instanceof Error ? err.message : 'Something went wrong loading this page.');
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [key, reload]);

  return { data, loading, error, reload };
}

/** Converts a row's nullable values to strings for controlled form inputs. */
export function toFormValues<K extends string>(row: Partial<Record<K, unknown>> | null | undefined, keys: readonly K[]): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of keys) {
    const v = row?.[k];
    out[k] = v === null || v === undefined ? '' : typeof v === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(v) ? v.slice(0, 5) : String(v);
  }
  return out;
}
