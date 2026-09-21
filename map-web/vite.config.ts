import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import istanbul from "vite-plugin-istanbul";
import { federation } from "@module-federation/vite";
// The shared-module contract. Must stay in agreement with the widget's copy;
// scripts/check-shared-modules.mjs is what enforces that.
import { sharedModules } from "./federation.shared.mjs";

/**
 * Where the map remote is fetched from when nothing says otherwise.
 *
 * Module Federation needs an entry at build time, but this application is built
 * once and promoted through dev, test and prod, each of which runs the map from
 * its own namespace. So this is only the default: src/federation/remoteEntryUrl.ts
 * replaces it at runtime from window._env_. The default is the widget's local
 * dev server, which is what makes `npm run dev` work with no configuration.
 */
const WIDGET_DEV_ENTRY = "http://127.0.0.1:5174/remoteEntry.js";

// The plugin prefetches any absolute entry at startup, before runtime plugins
// run, so a build would send every user's browser to 127.0.0.1. A relative
// placeholder is never prefetched; remoteEntryUrl.ts always replaces it.
const WIDGET_BUILD_ENTRY = "/epic-map-remote-entry-set-at-runtime.js";

// https://vitejs.dev/config/

export default defineConfig(({ command }) => ({
  plugins: [
    TanStackRouterVite(),
    react(),
    istanbul({
      cypress: true,
      requireEnv: false,
    }),
    federation({
      name: "mapWeb",
      remotes: {
        epicMap: {
          type: "module",
          name: "epicMap",
          entry: command === "build" ? WIDGET_BUILD_ENTRY : WIDGET_DEV_ENTRY,
        },
      },
      shared: sharedModules,
      runtimePlugins: ["./src/federation/remoteEntryUrl.ts"],
      // Types come from the @bcgov/epic-map-types package, declared against the
      // remote in src/types/epic-map.d.ts. Without this the build tries to pull
      // an @mf-types.zip off the widget's origin and fails when it is not up.
      dts: false,
    }),
  ],

  resolve: {
    alias: [{ find: "@", replacement: "/src" }],
    // The remote receives these from the share scope, but this application still
    // has to resolve to one copy of each itself - a second copy here would be
    // offered to the remote as a different module and defeat `singleton`.
    dedupe: ["react", "react-dom", "@emotion/react", "@emotion/styled", "@mui/material"],
  },

  build: {
    // Module Federation's generated entry uses top-level await. The default
    // target predates it and the build fails outright.
    target: "chrome89",
  },
}));
