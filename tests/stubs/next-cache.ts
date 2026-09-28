/** Test stub: run cached functions directly. */
export function unstable_cache<T extends (...args: never[]) => unknown>(fn: T): T {
  return fn;
}
