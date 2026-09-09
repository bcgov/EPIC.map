import { defineConfig } from "cypress";
import registerCodeCoverageTasks from "@cypress/code-coverage/task";

/**
 * Component testing only. There is no `e2e` block because nothing here drives a
 * running application; the harness mounts components directly.
 *
 * There are no specs yet, and `cypress run` treats an empty spec set as an
 * error, so CI guards this step on a spec actually existing - see the testing
 * job in .github/workflows/web.ci.yml. Adding the first `*.cy.tsx` under `src`
 * is all it takes to turn the job on.
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
      return config;
    },
  },
});
