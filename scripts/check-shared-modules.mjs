#!/usr/bin/env node
/**
 * Checks that every Module Federation host in this repository declares the same
 * shared modules as the map remote.
 *
 * Why this exists: the host and the remote are built separately, deployed
 * separately, and never see each other until a browser has both. Nothing in
 * either build can notice that one of them stopped sharing `@emotion/react` -
 * Module Federation simply does not share a module only one side declares, and
 * loads a second copy instead.
 *
 * The failure that follows is expensive to diagnose from its symptom. A second
 * copy of React is "invalid hook call" from inside the remote's stack, pointing
 * at the widget's code, which is fine. A second emotion cache is a map rendered
 * in MUI's default palette instead of the host's theme, with no error at all.
 * Both are one missing line in one of two files that look nothing alike.
 *
 * So: one comparison, run in CI, that fails with the missing line.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The remote is the reference. Its shared list is the set of modules the map
 * needs to receive from whoever mounts it; a host is checked against it, not
 * the other way round.
 */
const REMOTE = {
  label: "packages/epic-map (remote)",
  path: "packages/epic-map/federation.shared.mjs",
};

const HOSTS = [
  { label: "map-web (host)", path: "map-web/federation.shared.mjs" },
];

const load = async ({ label, path }) => {
  const module = await import(resolve(root, path));
  const shared = module.sharedModules ?? module.default;
  if (!shared || typeof shared !== "object") {
    throw new Error(`${path} does not export a sharedModules object`);
  }
  return { label, path, shared };
};

/**
 * Compare the two fields that change behaviour. `requiredVersion` is
 * deliberately not compared: the host's floor and the remote's floor are
 * separate claims about what each of them needs, and they are allowed to differ
 * - that negotiation is the whole point. `singleton` is not, because it is the
 * two sides agreeing on whether one copy is mandatory, and half an agreement is
 * the same bug as no agreement.
 */
const diff = (remote, host) => {
  const problems = [];

  for (const [name, spec] of Object.entries(remote.shared)) {
    const hostSpec = host.shared[name];

    if (!hostSpec) {
      problems.push(
        `${name} is shared by the remote but not by ${host.label}.\n` +
          `    The remote will load its own copy. Add it to ${host.path}.`,
      );
      continue;
    }

    if (Boolean(spec.singleton) !== Boolean(hostSpec.singleton)) {
      problems.push(
        `${name} is singleton:${Boolean(spec.singleton)} in the remote but ` +
          `singleton:${Boolean(hostSpec.singleton)} in ${host.label}.\n` +
          `    Both sides have to agree. Fix whichever is wrong.`,
      );
    }
  }

  // A host may legitimately share more than the map needs - it has other
  // remotes, or it simply lists more. Only report it, and only as information.
  const extra = Object.keys(host.shared).filter((name) => !remote.shared[name]);

  return { problems, extra };
};

const remote = await load(REMOTE);
let failed = false;

for (const entry of HOSTS) {
  const host = await load(entry);
  const { problems, extra } = diff(remote, host);

  if (extra.length) {
    console.log(
      `note: ${host.label} also shares ${extra.join(", ")}, which the map does not use.`,
    );
  }

  if (problems.length) {
    failed = true;
    console.error(`\n${host.label} disagrees with ${remote.label}:\n`);
    for (const problem of problems) console.error(`  - ${problem}\n`);
  } else {
    console.log(`ok: ${host.label} agrees with ${remote.label}.`);
  }
}

if (failed) {
  console.error(
    "Shared modules must match, or Module Federation loads two copies at runtime.\n" +
      "See packages/epic-map/federation.shared.mjs for what each entry is for.\n",
  );
  process.exit(1);
}
