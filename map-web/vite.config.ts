import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import istanbul from "vite-plugin-istanbul";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

/**
 * Widget source, for the fast development loop.
 *
 * With EPIC_MAP_SOURCE=1 the host compiles @bcgov/epic-map straight from
 * `packages/epic-map/src` instead of its built `dist`. That gives HMR and real
 * source stack traces, at the cost of bypassing everything that makes the
 * package a package - the externals in its vite.config, the extracted
 * stylesheet, the `exports` map, the emitted types. Leave the flag unset (the
 * default, and what CI does) to exercise the published artifact instead.
 */
const widgetSrc = fileURLToPath(
  new URL("../packages/epic-map/src", import.meta.url),
);

const hostSrc = fileURLToPath(new URL("./src", import.meta.url));

const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".json", ".css"];

/**
 * Resolve an "@/..." specifier under `root`, the way Vite resolves a relative
 * one: the exact path, then each extension, then an index file in a directory.
 */
const resolveUnder = (root: string, rest: string): string | null => {
  const target = path.resolve(root, rest);
  const candidates = [
    target,
    ...RESOLVE_EXTENSIONS.map((ext) => `${target}${ext}`),
    ...RESOLVE_EXTENSIONS.map((ext) => path.join(target, `index${ext}`)),
  ];
  return (
    candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null
  );
};

/**
 * "@/..." means two different roots at once in EPIC_MAP_SOURCE=1 mode.
 *
 * Both this application and @bcgov/epic-map alias "@" to their own `src`. Compiling
 * the widget from source puts both trees in one Vite module graph, where a single
 * static replacement would send the widget's `@/api/client` into *this* app's src
 * and fail the build. So resolve against whichever root the importing file lives
 * in. Only installed in source mode; the default path keeps the plain alias below.
 */
const widgetAwareSrcAlias = {
  find: /^@\/(.*)$/,
  replacement: "$1",
  customResolver: (rest: string, importer: string | undefined) =>
    resolveUnder(
      importer?.startsWith(`${widgetSrc}${path.sep}`) ? widgetSrc : hostSrc,
      rest,
    ),
};

// https://vitejs.dev/config/

export default defineConfig(() => {
  const useWidgetSource = process.env.EPIC_MAP_SOURCE === "1";

  return {
    plugins: [
      TanStackRouterVite(),
      react(),
      istanbul({
        cypress: true,
        requireEnv: false,
      }),
    ],
    resolve: {
      alias: [
        useWidgetSource ? widgetAwareSrcAlias : { find: "@", replacement: "/src" },
        // Aliases are matched by prefix, so the stylesheet subpath has to be
        // listed before the bare package id or it gets rewritten as well.
        // The widget's only stylesheet is maplibre's, which `src/index.ts`
        // already imports; Vite dedupes the two references to it.
        ...(useWidgetSource
          ? [
              {
                find: "@bcgov/epic-map/styles.css",
                replacement: "maplibre-gl/dist/maplibre-gl.css",
              },
              { find: "@bcgov/epic-map", replacement: `${widgetSrc}/index.ts` },
            ]
          : []),
      ],
      // The widget's peer dependencies are external in the built artifact. When
      // it is compiled from source they still have to resolve to the host's
      // single copy, or React sees two renderers and every hook throws.
      dedupe: [
        "react",
        "react-dom",
        "@emotion/react",
        "@emotion/styled",
        "@mui/material",
        "@tanstack/react-query",
      ],
    },
    // Never pre-bundle the widget. In source mode there is nothing to bundle; in
    // dist mode Vite would cache a copy of dist/index.js and keep serving it
    // after `vite build --watch` rewrites the file, so the browser would show
    // stale widget code until a manual restart.
    optimizeDeps: {
      exclude: ["@bcgov/epic-map"],
    },
    server: {
      watch: {
        // The package is reached through a node_modules symlink, which the
        // watcher ignores by default; follow it so a rebuilt dist triggers a
        // reload in the host.
        ignored: ["!**/packages/epic-map/dist/**"],
      },
    },
  };
});
