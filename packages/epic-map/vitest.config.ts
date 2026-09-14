import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Separate from vite.config.ts on purpose: that file is the library build, and
 * its `build.lib` / dts plugin have nothing to say about running tests.
 *
 * The "@/*" alias is repeated here because it is resolved by whoever loads the
 * module graph, and under Vitest that is this config rather than the build one.
 */
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@\//,
        replacement: `${fileURLToPath(new URL("./src", import.meta.url))}/`,
      },
    ],
  },
  test: {
    // Everything under test here is pure - no DOM, so no jsdom to install.
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
