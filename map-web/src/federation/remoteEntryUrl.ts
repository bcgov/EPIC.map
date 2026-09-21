import type { ModuleFederationRuntimePlugin } from "@module-federation/runtime/types";
import { AppConfig } from "@/utils/config";

/**
 * Points the `epicMap` remote at whatever origin this deployment is configured
 * with, instead of the one that was known when the image was built.
 *
 * vite.config.ts has to name an entry for the remote at build time, and the URL
 * it names is the widget's local dev server. That is the right default for
 * `npm run dev` and the wrong one everywhere else: dev, test and prod each run
 * the map from their own namespace, and the whole point of promoting an image
 * through them is that it is not rebuilt on the way.
 *
 * So the build-time entry is a default, and this rewrites it from
 * `window._env_` - the same ConfigMap-mounted script the rest of AppConfig comes
 * from - before Module Federation fetches anything.
 *
 * A runtime plugin rather than `registerRemotes` at module scope, because this
 * runs inside the federation lifecycle: it cannot land before the runtime is
 * initialised or after the remote has already been requested.
 */
const remoteEntryUrl = (): ModuleFederationRuntimePlugin => ({
  name: "epic-map-remote-entry-url",

  beforeRequest(args) {
    const remote = args.options.remotes.find(
      (candidate) => candidate.name === "epicMap",
    );

    // `entry` is absent on a remote declared by manifest rather than by URL.
    // We declare ours by URL; the guard is here so a future manifest-based
    // remote falls through untouched rather than growing an `entry` field that
    // means nothing to it.
    if (remote && "entry" in remote) {
      remote.entry = AppConfig.mapWidgetEntry;
    }

    return args;
  },
});

export default remoteEntryUrl;
