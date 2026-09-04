// Ambient declarations for the package build.
//
// Note what is deliberately absent: `vite/client`. Pulling in Vite's client types
// would declare `import.meta.env`, and this package must never read build-time
// environment — all configuration arrives through props. Leaving it untyped means
// TypeScript rejects `import.meta.env` before ESLint even sees it.
declare module "*.css";
