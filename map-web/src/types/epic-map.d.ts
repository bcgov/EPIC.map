/**
 * The federated map remote, as TypeScript sees it.
 *
 * `epicMap/MapWidget` is resolved by Module Federation at runtime, so there is
 * no package on disk for the compiler to read a type from. @bcgov/epic-map-types
 * is that type, published from packages/epic-map-types alongside the remote and
 * installed here as a devDependency - it is types only and contributes nothing
 * to the bundle.
 *
 * The alias on the left must match the remote's name in vite.config.ts.
 */
declare module "epicMap/MapWidget" {
  export { MapWidget, default } from "@bcgov/epic-map-types";
}
