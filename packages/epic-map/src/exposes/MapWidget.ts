// The federated entry point: everything a host reaches through
// `epicMap/MapWidget`.
//
// Named and default exports of the same component, because hosts want both -
// `React.lazy` resolves a module's `default`, while a host that loads the module
// itself reads `MapWidget` off it.

import "@/styles/injectWidgetStyles";

export { MapWidget } from "@/widget/MapWidget";
export { MapWidget as default } from "@/widget/MapWidget";
