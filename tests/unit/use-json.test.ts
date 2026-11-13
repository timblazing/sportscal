// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { seedJson, useJson } from "@/hooks/use-json";

const MINUTE = 60_000;
const TTL = 5 * MINUTE;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fetchMock = vi.fn<(input: string) => Promise<Response>>();

/** Let pending promises and state updates settle without moving the clock. */
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const setVisibility = (state: "visible" | "hidden") =>
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });

// The memo is module-level, so every test uses its own URLs.
let n = 0;
const urls = () => {
  n += 1;
  return { a: `/api/schedule?team=a${n}`, b: `/api/schedule?team=b${n}` };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  setVisibility("visible");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useJson freshness", () => {
  it("reuses a fresh value without fetching again", async () => {
    const { a } = urls();
    fetchMock.mockResolvedValue(json({ games: 1 }));
    const first = renderHook(() => useJson<{ games: number }>(a));
    await settle();
    expect(first.result.current.data).toEqual({ games: 1 });
    first.unmount();

    await advance(TTL - 1);
    const second = renderHook(() => useJson<{ games: number }>(a));
    expect(second.result.current).toMatchObject({ status: "success", data: { games: 1 } });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves an expired value immediately, then refetches in the background", async () => {
    const { a } = urls();
    fetchMock.mockResolvedValueOnce(json({ games: 1 }));
    const first = renderHook(() => useJson<{ games: number }>(a));
    await settle();
    first.unmount();

    await advance(TTL);
    fetchMock.mockResolvedValueOnce(json({ games: 2 }));
    const second = renderHook(() => useJson<{ games: number }>(a));
    // Stale data is on screen straight away, with no loading state.
    expect(second.result.current).toMatchObject({ status: "success", data: { games: 1 } });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(second.result.current).toMatchObject({ status: "success", data: { games: 2 } });
  });

  it("picks up changes when revisiting a team after the value expired", async () => {
    const { a, b } = urls();
    fetchMock.mockImplementation(async (url) => json({ url, games: 1 }));
    const hook = renderHook(({ url }) => useJson<{ games: number }>(url), { initialProps: { url: a } });
    await settle();
    hook.rerender({ url: b });
    await settle();

    await advance(TTL + MINUTE);
    fetchMock.mockImplementation(async (url) => json({ url, games: 2 }));
    hook.rerender({ url: a });
    expect(hook.result.current.data).toMatchObject({ games: 1 });
    await settle();
    expect(hook.result.current).toMatchObject({ status: "success", data: { games: 2 } });
  });

  it("does not refetch when revisiting a team within the freshness window", async () => {
    const { a, b } = urls();
    fetchMock.mockImplementation(async (url) => json({ url }));
    const hook = renderHook(({ url }) => useJson(url), { initialProps: { url: a } });
    await settle();
    hook.rerender({ url: b });
    await settle();
    await advance(MINUTE);
    hook.rerender({ url: a });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats seeded data as fresh for the same window", async () => {
    const { a } = urls();
    seedJson(a, { games: 0 });
    const hook = renderHook(() => useJson(a));
    await settle();
    expect(hook.result.current).toMatchObject({ status: "success", data: { games: 0 } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("useJson focus revalidation", () => {
  it("refetches an expired value when the window regains focus", async () => {
    const { a } = urls();
    fetchMock.mockResolvedValueOnce(json({ games: 1 }));
    const hook = renderHook(() => useJson<{ games: number }>(a));
    await settle();

    await advance(TTL + MINUTE);
    fetchMock.mockResolvedValueOnce(json({ games: 2 }));
    act(() => { window.dispatchEvent(new Event("focus")); });
    await settle();
    expect(hook.result.current).toMatchObject({ status: "success", data: { games: 2 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refetches an expired value when the tab becomes visible", async () => {
    const { a } = urls();
    fetchMock.mockResolvedValueOnce(json({ games: 1 }));
    const hook = renderHook(() => useJson<{ games: number }>(a));
    await settle();

    setVisibility("hidden");
    await advance(TTL + MINUTE);
    fetchMock.mockResolvedValueOnce(json({ games: 2 }));
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1); // still hidden: nothing yet

    setVisibility("visible");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await settle();
    expect(hook.result.current.data).toEqual({ games: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores focus while the value is still fresh, and never polls", async () => {
    const { a } = urls();
    fetchMock.mockResolvedValue(json({ games: 1 }));
    renderHook(() => useJson(a));
    await settle();

    await advance(TTL - MINUTE);
    act(() => { window.dispatchEvent(new Event("focus")); });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await advance(6 * 60 * MINUTE); // hours pass with no focus or navigation
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not stack requests when focus fires repeatedly during a refresh", async () => {
    const { a } = urls();
    fetchMock.mockResolvedValueOnce(json({ games: 1 }));
    renderHook(() => useJson(a));
    await settle();

    await advance(TTL + MINUTE);
    fetchMock.mockImplementationOnce(() => new Promise(() => {})); // never settles
    act(() => { window.dispatchEvent(new Event("focus")); });
    act(() => { window.dispatchEvent(new Event("focus")); });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("useJson failed refresh", () => {
  it("keeps the last good data and lets retry recover", async () => {
    const { a } = urls();
    fetchMock.mockResolvedValueOnce(json({ games: 1 }));
    const hook = renderHook(() => useJson<{ games: number }>(a));
    await settle();

    await advance(TTL + MINUTE);
    fetchMock.mockResolvedValueOnce(json({ error: { message: "ESPN is down" } }, 502));
    act(() => { window.dispatchEvent(new Event("focus")); });
    await settle();
    expect(hook.result.current.status).toBe("error");
    expect(hook.result.current.error?.message).toBe("ESPN is down");
    expect(hook.result.current.data).toEqual({ games: 1 });

    fetchMock.mockResolvedValueOnce(json({ games: 2 }));
    act(() => hook.result.current.retry());
    // Last good data stays on screen while the retry is in flight.
    expect(hook.result.current).toMatchObject({ status: "loading", data: { games: 1 } });
    await settle();
    expect(hook.result.current).toMatchObject({ status: "success", data: { games: 2 } });
  });

  it("keeps stale data on a failed background refresh after revisiting", async () => {
    const { a } = urls();
    fetchMock.mockResolvedValueOnce(json({ games: 1 }));
    const first = renderHook(() => useJson<{ games: number }>(a));
    await settle();
    first.unmount();

    await advance(TTL);
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    const second = renderHook(() => useJson<{ games: number }>(a));
    await settle();
    expect(second.result.current.status).toBe("error");
    expect(second.result.current.data).toEqual({ games: 1 });

    // The next focus tries again without needing the retry button.
    fetchMock.mockResolvedValueOnce(json({ games: 3 }));
    act(() => { window.dispatchEvent(new Event("focus")); });
    await settle();
    expect(second.result.current).toMatchObject({ status: "success", data: { games: 3 } });
  });
});
