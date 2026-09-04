import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import dts from "vite-plugin-dts";

/**
 * Everything the host application provides. Peer dependencies must be external or
 * the host ends up with two copies of React and every hook throws "invalid hook
 * call"; runtime dependencies are external so the host's bundler can dedupe them
 * against its own copy instead of shipping maplibre twice.
 *
 * `react/jsx-runtime` is listed explicitly: the JSX transform imports it directly,
 * and leaving it bundled is the usual cause of the duplicate-React failure even
 * when plain "react" is external.
 */
const EXTERNAL = [
  "react",
  "react-dom",
  "react/jsx-runtime",
  "@mui/material",
  "@mui/icons-material",
  "@emotion/react",
  "@emotion/styled",
  "epic.theme",
  "@tanstack/react-query",
  "axios",
  "maplibre-gl",
];

/**
 * Import MUI components from the "@mui/material" barrel, never from
 * "@mui/material/Box" and friends.
 *
 * The host excludes this package from Vite's dependency optimizer, so every bare
 * import left in `dist/index.js` becomes an optimizeDeps entry of its own. A deep
 * component path next to the barrel gives esbuild two entries into one module
 * graph; it then splits the shared MUI code into chunks and emits
 * `@mui/material/Box`'s top-level `createTheme()` call without the lazy
 * initialiser that assigns it, and the host dies on
 * "createTheme_default is not a function" before the widget ever renders.
 *
 * "@mui/material/styles" and the "@mui/icons-material/*" paths are safe - they
 * are separate module graphs, not a second door into this one.
 */

/**
 * Match a package and its deep imports (`@mui/material/Button`), but never CSS.
 * maplibre-gl's stylesheet is deliberately pulled into our own bundle — see the
 * "Styles" section of the README — so `maplibre-gl/dist/maplibre-gl.css` has to
 * stay internal even though `maplibre-gl` itself is external.
 */
const isExternal = (id: string) =>
  !id.endsWith(".css") &&
  EXTERNAL.some((dep) => id === dep || id.startsWith(`${dep}/`));

export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ["src"],
      exclude: ["src/**/*.d.ts"],
    }),
  ],
  // Mirrors the "@/*" path in tsconfig.json. vite-plugin-dts reads the same
  // tsconfig and rewrites these back to relative specifiers in the emitted .d.ts,
  // so nothing aliased ever reaches a consumer.
  resolve: {
    alias: [
      {
        find: /^@\//,
        replacement: `${fileURLToPath(new URL("./src", import.meta.url))}/`,
      },
    ],
  },
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: isExternal,
      output: {
        // Vite names the extracted lib stylesheet `style.css`; publish it under the
        // package name so the host's import reads `@bcgov/epic-map/styles.css`.
        assetFileNames: (asset) =>
          asset.name === "style.css" ? "epic-map.css" : "[name][extname]",
      },
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
