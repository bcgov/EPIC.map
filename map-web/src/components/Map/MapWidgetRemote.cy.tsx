import MapWidgetRemote from "@/components/Map/MapWidgetRemote";

/**
 * The host/remote seam, exercised for real.
 *
 * Everything else in CI checks one side or the other. Nothing else checks that
 * they fit: the map is built, deployed and versioned separately, and the first
 * moment the two meet is a browser with both loaded. This test is that browser.
 *
 * It needs the remote actually running - `npm run dev:widget`, or `npm run
 * build:widget && npm run preview:widget` - on the origin in VITE_MAP_WIDGET_URL.
 * That is the point rather than an inconvenience: a test that stubbed the remote
 * would pass on exactly the misconfigurations this is here to catch.
 *
 * No API is stubbed. The widget's requests fail, which is fine and is not what
 * is under test - the map surface and its controls render either way.
 */
describe("the federated map remote", () => {
  const mountMap = () =>
    cy.mount(
      <div style={{ height: "600px" }}>
        <MapWidgetRemote
          apiBaseUrl="/api"
          getAccessToken={() => Promise.resolve("component-test-token")}
        />
      </div>,
    );

  it("loads the map over Module Federation and mounts it", () => {
    mountMap();

    // The widget's own chrome. Reaching this at all means the remote entry was
    // fetched cross-origin, the exposed module resolved, and the component
    // rendered - which it could not do if React were loaded twice, because
    // every hook in it would have thrown "invalid hook call" first.
    cy.get('input[placeholder="Search projects and places..."]', {
      timeout: 30000,
    }).should("exist");
  });

  it("styles itself without the host importing a stylesheet", () => {
    mountMap();

    // The remote carries maplibre's CSS inside its bundle and injects it on
    // load. A host that has to import a stylesheet to make the map legible has
    // a build-time dependency on the map again, which is the thing federation
    // was adopted to remove.
    cy.get("head style#epic-map-widget-styles", { timeout: 30000 })
      .should("exist")
      .and((style) => {
        expect(style.text()).to.contain("maplibregl");
      });
  });

  it("uses the host's MUI, not a second copy of it", () => {
    mountMap();

    // MUI's theme crosses the seam through React context, which only works if
    // both sides resolved to the same @mui/material module. A second copy does
    // not throw - it renders against MUI's default theme - so the observable
    // difference is emotion actually having styled the input at all.
    cy.get('input[placeholder="Search projects and places..."]', {
      timeout: 30000,
    })
      .parents(".MuiInputBase-root")
      .should("exist");
  });
});
