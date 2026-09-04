# @bcgov/epic-map

## 0.1.0

### Minor Changes

- Initial extraction of the EPIC map into a publishable React component.

  `MapWidget` takes its API base URL and its access token from the host through
  props, renders its own QueryClient, and inherits the host's MUI theme. It adds
  no router, no auth client and no theme of its own.
