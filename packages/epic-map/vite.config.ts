import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import { federation } from "@module-federation/vite";
// The shared-module contract, in its own file so scripts/check-shared-modules.mjs
// can read it and each host's copy of it. See that file for why every entry is
// there.
import { sharedModules } from "./federation.shared.mjs";

const require = createRequire(import.meta.url);

/**
 * The EPIC map as a Module Federation remote.
 *
 * The output of this build is a static directory - `remoteEntry.js` and its
 * chunks - served over HTTP from its own origin. Host applications (map-web,
 * and EPIC.centre and EPIC.submit after it) fetch it at runtime; none of them
 * compile a line of this source, and none of them has to be rebuilt when it
 * changes.
 */

/** The global the remote registers itself under. Must be a JS identifier. */
const REMOTE_NAME = "epicMap";

/** Where the public contract is served, relative to the remote's root. */
const CONTRACT_FILE = "epic-map.d.ts";


/**
 * The public contract, served next to the bundle it describes.
 *
 * Host applications live in other repositories and cannot resolve the workspace
 * package, so they keep a copy of this file in their own source tree. Serving it
 * from the remote's own origin makes that copy checkable: a host diffs what it
 * vendored against the environment it actually loads the map from, with curl and
 * diff, no registry and no token. See README.md, "Types for a host outside this
 * repository".
 *
 * Copied byte for byte from packages/epic-map-types, which is the single
 * definition the widget itself compiles against. Nothing is generated or
 * rewritten here, because a diff is only worth running if a match means
 * identical.
 */
const contractTypes = (): Plugin => ({
  name: "epic-map-contract-types",
  apply: "build",
  generateBundle() {
    const contract = path.join(
      path.dirname(require.resolve("@bcgov/epic-map-types/package.json")),
      "index.d.ts",
    );
    this.emitFile({
      type: "asset",
      fileName: CONTRACT_FILE,
      source: fs.readFileSync(contract, "utf8"),
    });
  },
});


/**
 * maplibre's web worker, emitted next to the chunk that looks for it.
 *
 * maplibre-gl 6 finds its worker by resolving "./maplibre-gl-worker.mjs" against
 * its own `import.meta.url`. Bundling relocates that module and leaves the
 * sibling behind, so the request 404s.
 *
 * The failure is quiet and easy to misread: the style, its TileJSON and the
 * sprite are fetched on the main thread and all succeed, so the map mounts with
 * working controls, a scale bar and attribution over an empty canvas. Vector
 * tiles and glyphs are the worker's job, and the worker never started.
 *
 * Under federation there is a second half to this. The worker is now on the
 * remote's origin while the document is on the host's, and a cross-origin
 * `new Worker(url, {type:"module"})` is blocked outright. maplibre 6.6 handles
 * that itself - it detects the origin mismatch and starts a same-origin blob
 * worker whose only statement imports the real URL - but that import is a
 * cross-origin module fetch, so the worker files have to be served with CORS.
 * That is what the `Access-Control-Allow-Origin` header in nginx/nginx.conf is
 * for; without it the map fails exactly the way described above.
 *
 * Development is handled by keeping maplibre out of optimizeDeps below, which
 * leaves it served from its real path with its siblings intact.
 */
const maplibreWorkerAssets = (): Plugin => {
  // Both, in this order. The worker imports the shared chunk by relative path,
  // so shipping one without the other only moves the 404.
  const WORKER_FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

  let assetsDir = "assets";

  return {
    name: "maplibre-worker-assets",
    apply: "build",
    configResolved(config) {
      assetsDir = config.build.assetsDir;
    },
    generateBundle() {
      const distDir = path.join(
        path.dirname(require.resolve("maplibre-gl/package.json")),
        "dist",
      );
      for (const file of WORKER_FILES) {
        this.emitFile({
          type: "asset",
          // Verbatim names, not hashed: the worker's import of the shared chunk
          // is written into maplibre's source and cannot be rewritten here.
          fileName: path.posix.join(assetsDir, file),
          source: fs.readFileSync(path.join(distDir, file), "utf8"),
        });
      }
    },
  };
};

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: REMOTE_NAME,
      filename: "remoteEntry.js",
      exposes: {
        "./MapWidget": "./src/exposes/MapWidget.ts",
      },
      shared: sharedModules,
      // Federation's own type transport has hosts fetch an @mf-types.zip from
      // this origin during their build, which means a host cannot compile
      // unless the widget is deployed and reachable - a build-time dependency
      // on a running service, inside Docker and CI both. contractTypes() below
      // serves the same types as one file a host vendors and diffs on its own
      // schedule, so a build never blocks on this origin being up.
      dts: false,
    }),
    maplibreWorkerAssets(),
    contractTypes(),
  ],

  // Relative, because the remote does not know where it will be mounted. Every
  // asset URL the bundle emits is resolved against the chunk that references it,
  // so the same dist works behind a route at the origin root and behind a path
  // prefix, without a build-time public path to keep in sync with the chart.
  base: "./",

  // Mirrors the "@/*" path in tsconfig.json.
  resolve: {
    alias: [
      {
        find: /^@\//,
        replacement: `${fileURLToPath(new URL("./src", import.meta.url))}/`,
      },
    ],
  },

  // Optimizing maplibre rewrites it to node_modules/.vite/deps, and it looks for
  // its web worker next to itself. See maplibreWorkerAssets above.
  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },

  server: {
    // Fixed, because a host's runtime config names this port. Vite picking the
    // next free one on a clash would leave the host pointed at nothing.
    port: 5174,
    strictPort: true,
    // Explicit, and not "localhost". On a machine with IPv6 enabled Vite binds
    // "localhost" to ::1 alone, and anything that resolves the name to
    // 127.0.0.1 - Cypress's Electron among them - gets a connection refused
    // that surfaces as a bare "Failed to fetch" with nothing to suggest the
    // server is running and listening one address over.
    host: "127.0.0.1",
    // The host runs on a different origin even locally, and every federated
    // request - remoteEntry, its chunks, maplibre's worker - is cross-origin.
    cors: true,
  },

  preview: {
    port: 5174,
    strictPort: true,
    host: "127.0.0.1",
    cors: true,
  },

  build: {
    // Module Federation's generated entry uses top-level await. The default
    // target predates it and the build fails outright.
    target: "chrome89",
    sourcemap: true,
    emptyOutDir: true,
  },
});
