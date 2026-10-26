import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";

/**
 * Separate from vite.config.ts: its federation plugin would have Vitest resolve
 * `epicMap/MapWidget` against a remote that is not running. The "@/" alias is
 * repeated because this config resolves the module graph under Vitest.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@\//,
        replacement: `${fileURLToPath(new URL("./src", import.meta.url))}/`,
      },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
