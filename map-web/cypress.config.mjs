import { defineConfig } from "cypress";
import registerCodeCoverageTasks from "@cypress/code-coverage/task";

/**
 * Component testing only. There is no `e2e` block because nothing here drives a
 * running application; the harness mounts components directly.
 *
 * Plain ESM rather than TypeScript, and that is load-bearing. This package is
 * `"type": "module"`, but no tsconfig in this directory covers this file, so
 * Cypress's ts-node fell back to its own default of CommonJS and emitted an
 * `exports` assignment into a file Node then read as ESM. The config failed to
 * load with "exports is not defined in ES module scope" - which nothing noticed
 * for as long as there were no specs to run.
 *
 * `cypress/support/component.ts` imports "@cypress/code-coverage/support",
 * whose node-side half has to be registered here or the support file throws on
 * load. The instrumentation itself comes from vite-plugin-istanbul, already
 * configured in vite.config.ts.
 */
export default defineConfig({
  component: {
    devServer: {
      framework: "react",
      bundler: "vite",
    },
    setupNodeEvents(on, config) {
      registerCodeCoverageTasks(on, config);

      // WebGL, on a machine with no GPU.
      //
      // The map is drawn with it, so a browser that cannot hand out a WebGL2
      // context has no map to test. CI runners have no GPU, and Chrome stopped
      // letting WebGL quietly fall back to its software renderer - it now
      // refuses the context unless this flag says that is wanted. Without it
      // maplibre returns a map with no painter and the map surface reports
      // itself unsupported, which is correct behaviour and an untested seam.
      //
      // Ignored by a browser that has a GPU, so this stays a CI concession
      // rather than something that changes what developers see locally.
      on("before:browser:launch", (browser, launchOptions) => {
        if (browser.family === "chromium" && browser.name !== "electron") {
          launchOptions.args.push("--enable-unsafe-swiftshader");
        }
        return launchOptions;
      });

      return config;
    },
  },
});
