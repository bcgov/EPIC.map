// Ambient declarations for the remote build.
//
// Note what is deliberately absent: `vite/client`. Pulling in Vite's client types
// would declare `import.meta.env`, and this package must never read build-time
// environment — all configuration arrives through props. Leaving it untyped means
// TypeScript rejects `import.meta.env` before ESLint even sees it.

// `?inline` gives the processed stylesheet as a string instead of emitting a
// file, which is how the widget carries its one stylesheet inside the federated
// bundle. It is the only form declared: a plain `.css` import would emit a file
// the remote has no way to get a host to load. See src/styles/injectWidgetStyles.ts.
declare module "*.css?inline" {
  const css: string;
  export default css;
}

// shpjs ships no types of its own, and the published @types package describes
// its v3 API. Only the one entry point the widget uses is declared: a zipped
// shapefile in, GeoJSON out - an array of collections when the zip holds more
// than one shapefile. Coordinates arrive in WGS84, reprojected from the `.prj`.
declare module "shpjs" {
  import type { FeatureCollection } from "geojson";
  export function parseZip(
    buffer: ArrayBuffer | Uint8Array,
  ): Promise<FeatureCollection | FeatureCollection[]>;
}
