import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${path.resolve(__dirname)}/` },
      { find: /^server-only$/, replacement: path.resolve(__dirname, "tests/stubs/server-only.ts") },
      { find: /^next\/cache$/, replacement: path.resolve(__dirname, "tests/stubs/next-cache.ts") },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", ...(process.env.LIVE_ESPN ? ["tests/live/**/*.test.ts"] : [])],
    // Pin the process time zone so date assertions don't depend on the machine.
    env: { TZ: "UTC" },
  },
});
