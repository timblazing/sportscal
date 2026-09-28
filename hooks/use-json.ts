"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError, apiFetch } from "@/lib/client/api";

type State<T> =
  | { status: "idle"; data?: undefined; error?: undefined }
  | { status: "loading"; data?: T; error?: undefined }
  | { status: "success"; data: T; error?: undefined }
  | { status: "error"; data?: T; error: ApiError };

/** Small per-session memo so switching back to a league/team is instant. */
const memo = new Map<string, unknown>();

/** Prime the memo with server-rendered data so the first render needs no fetch. */
export function seedJson(url: string, data: unknown) {
  if (!memo.has(url)) memo.set(url, data);
}

/**
 * Fetch JSON for `url` (null = idle). Keeps the last good data while
 * refetching and exposes `retry` for error states.
 */
export function useJson<T>(url: string | null) {
  const [state, setState] = useState<State<T>>(() =>
    url && memo.has(url) ? { status: "success", data: memo.get(url) as T } : { status: "idle" },
  );
  const [attempt, setAttempt] = useState(0);
  const [prevKey, setPrevKey] = useState<string | null>(null);

  const key = url ? `${url}#${attempt}` : null;
  if (key !== prevKey) {
    setPrevKey(key);
    if (!url) setState({ status: "idle" });
    else if (memo.has(url) && attempt === 0) setState({ status: "success", data: memo.get(url) as T });
    else setState((s) => ({ status: "loading", data: s.data }));
  }

  useEffect(() => {
    if (!url || (memo.has(url) && attempt === 0)) return;
    const controller = new AbortController();
    apiFetch<T>(url, { signal: controller.signal })
      .then((data) => {
        memo.set(url, data);
        setState({ status: "success", data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const apiError =
          error instanceof ApiError ? error : new ApiError("Something unexpected happened.", 0);
        setState((s) => ({ status: "error", data: s.data, error: apiError }));
      });
    return () => controller.abort();
  }, [url, attempt]);

  const retry = useCallback(() => {
    if (url) memo.delete(url);
    setAttempt((a) => a + 1);
  }, [url]);

  return { ...state, retry };
}
