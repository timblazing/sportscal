"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, apiFetch } from "@/lib/client/api";

type State<T> =
  | { status: "idle"; data?: undefined; error?: undefined }
  | { status: "loading"; data?: T; error?: undefined }
  | { status: "success"; data: T; error?: undefined }
  | { status: "error"; data?: T; error: ApiError };

/**
 * How long a response counts as fresh. Matches the schedule API's `s-maxage`
 * (300s, lib/http.ts): refetching sooner could only return the CDN's copy.
 */
export const DEFAULT_TTL_MS = 5 * 60_000;

interface Entry {
  data: unknown;
  at: number;
}

/** Small per-session memo so switching back to a league/team is instant. */
const memo = new Map<string, Entry>();

const isFresh = (entry: Entry, ttlMs: number) => Date.now() - entry.at < ttlMs;

/** Prime the memo with server-rendered data so the first render needs no fetch. */
export function seedJson(url: string, data: unknown) {
  if (!memo.has(url)) memo.set(url, { data, at: Date.now() });
}

/**
 * Fetch JSON for `url` (null = idle). Cached data renders immediately; once it
 * is older than `ttlMs` it is refetched in the background (stale-while-
 * revalidate) when the URL is revisited or the tab regains focus. There is no
 * polling. A failed refresh keeps the last good data and exposes `retry`.
 */
export function useJson<T>(url: string | null, { ttlMs = DEFAULT_TTL_MS }: { ttlMs?: number } = {}) {
  const [state, setState] = useState<State<T>>(() => {
    const entry = url ? memo.get(url) : undefined;
    return entry ? { status: "success", data: entry.data as T } : { status: "idle" };
  });
  const [attempt, setAttempt] = useState(0);
  const [revalidations, setRevalidations] = useState(0);
  const [prevKey, setPrevKey] = useState<string | null>(null);
  const inFlight = useRef(false);

  const key = url ? `${url}#${attempt}` : null;
  if (key !== prevKey) {
    setPrevKey(key);
    const entry = url ? memo.get(url) : undefined;
    if (!url) setState({ status: "idle" });
    else if (entry && attempt === 0) setState({ status: "success", data: entry.data as T });
    else setState((s) => ({ status: "loading", data: s.data }));
  }

  useEffect(() => {
    if (!url) return;
    const entry = memo.get(url);
    if (entry && attempt === 0 && isFresh(entry, ttlMs)) return;
    const controller = new AbortController();
    inFlight.current = true;
    apiFetch<T>(url, { signal: controller.signal })
      .then((data) => {
        inFlight.current = false;
        memo.set(url, { data, at: Date.now() });
        setState({ status: "success", data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        inFlight.current = false;
        const apiError =
          error instanceof ApiError ? error : new ApiError("Something unexpected happened.", 0);
        setState((s) => ({ status: "error", data: s.data, error: apiError }));
      });
    return () => {
      inFlight.current = false;
      controller.abort();
    };
  }, [url, attempt, revalidations, ttlMs]);

  // Returning to a long-lived tab: refresh anything that has gone stale.
  useEffect(() => {
    if (!url) return;
    const revalidate = () => {
      if (document.visibilityState !== "visible" || inFlight.current) return;
      const entry = memo.get(url);
      if (entry && !isFresh(entry, ttlMs)) setRevalidations((n) => n + 1);
    };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [url, ttlMs]);

  const retry = useCallback(() => {
    if (url) memo.delete(url);
    setAttempt((a) => a + 1);
  }, [url]);

  return { ...state, retry };
}
