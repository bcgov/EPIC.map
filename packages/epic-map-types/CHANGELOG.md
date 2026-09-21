# @bcgov/epic-map-types

Kept by hand, newest first. Nothing here is published; `version` is a label so a
copy someone vendored can be identified.

## Unreleased

### No longer published to a registry

The contract is no longer an npm package host teams install. The widget's build
copies `index.d.ts` into its own output, so every deployment serves it at
`/epic-map.d.ts` next to the `remoteEntry.js` it describes, and a host outside
this repository takes a copy with `curl` and diffs it against that URL.

No types changed. What went away is GitHub Packages, the `.npmrc` and token
every consuming repository needed for one `.d.ts` file, the release tag, and
changesets along with it.

Inside this repository nothing changes: it stays an npm workspace that `map-web`
and `@bcgov/epic-map` resolve from `packages/`.

## 0.1.0

- The EPIC map's public contract, split out of `@bcgov/epic-map` so that a host
  can type a remote it never imports.

  `MapWidgetProps` and everything it references, plus a declaration of the
  `MapWidget` component itself. Types only — no runtime, nothing in a host's
  bundle.

  This exists because the map stopped being an npm package. It is a Module
  Federation remote now, loaded over HTTP at runtime, so there is no import for
  TypeScript to infer anything from. The definitions are unchanged from the ones
  the package shipped at 0.1.0; `packages/epic-map/src/types.ts` re-exports this
  package, so the widget and its hosts are checked against one declaration.

  Its version tracks the map's public API rather than the map's implementation:
  a map release that changes no prop does not release this.
