// @vitest-environment jsdom
//
// What's here outside the panel: its state, grouping, map highlight and popup.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, useRef, type ReactNode } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { importedFeaturesKey } from "@/api/useImportedLayers";
import {
  INITIAL_STATE,
  SelectAreaProvider,
  selectAreaReducer,
  useSelectArea,
  type ResultGroup,
  type SelectAreaState,
} from "@/components/MapTools/SelectAreaContext";
import { searchedLayers, toGroups } from "@/components/MapTools/whatsHere";
import { RESULT_HIGHLIGHT_COLOR } from "@/utils/config";

const CARIBOU = "WHSE_WILDLIFE_INVENTORY.GCPB_CARIBOU_POPULATION_SP";
const PIP = "WHSE_ADMIN_BOUNDARIES.PIP_CONSULTATION_AREAS_SP";

const showHighlight = vi.fn();
const showLocalHighlight = vi.fn();
const hideHighlight = vi.fn();

vi.mock("@/components/Layers/layerUtils", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  showHighlight,
  showLocalHighlight,
  hideHighlight,
  localDrawnIds: () => ["drawn-pip-fill"],
}));

vi.mock("@/components/Layers/LayersContext", () => ({
  useLayers: () => ({ layerFloors: { caribou: 9 } }),
}));

const warehouseBounds = vi.fn();
vi.mock("@/api/useWhatsHere", () => ({
  useWhatsHereApi: () => ({ search: vi.fn(), warehouseBounds }),
}));

const api = { get: vi.fn() };
vi.mock("@/widget/MapWidgetContext", () => ({ useMapWidget: () => ({ api }) }));

const popup = vi.fn();
vi.mock("@/components/MetaData/MetaDataPopup", () => ({
  default: (props: Record<string, unknown>) => {
    popup(props);
    return null;
  },
}));

const { useResultHighlight } = await import("@/components/MapTools/useResultHighlight");
const { default: ResultInfoPopup } = await import("@/components/MapTools/ResultInfoPopup");

const group = (overrides: Partial<ResultGroup>): ResultGroup => ({
  key: `catalogue:${CARIBOU}`,
  kind: "catalogue",
  layerId: "caribou",
  objectName: CARIBOU,
  name: "Caribou Herd Locations for BC",
  matched: 1,
  listed: 1,
  error: null,
  features: [
    {
      key: `${CARIBOU}.2`,
      id: `${CARIBOU}.2`,
      name: "Wells Gray South",
      properties: [{ name: "HERD_NAME", value: "Wells Gray South" }],
    },
  ],
  ...overrides,
});

const PIP_GROUP = group({
  key: `hosted:${PIP}`,
  kind: "hosted",
  layerId: `local-${PIP}`,
  objectName: PIP,
  name: "PIP",
  features: [{ key: "{P1}", id: "{P1}", name: "Adams Lake Indian Band", properties: [] }],
});

const WELLS_GROUP = group({
  key: "imported:wells",
  kind: "imported",
  layerId: "wells",
  objectName: null,
  name: "My wells",
  features: [{ key: "7", id: "7", name: "My wells", properties: [] }],
});

describe("the Select area state", () => {
  const withResults = (groups: ResultGroup[]): SelectAreaState => {
    const started = selectAreaReducer(INITIAL_STATE, { type: "startQuery", queryId: 1 });
    return selectAreaReducer(started, { type: "finishQuery", queryId: 1, groups });
  };

  it("drops the answer to a query that was superseded", () => {
    let state = selectAreaReducer(INITIAL_STATE, { type: "startQuery", queryId: 1 });
    state = selectAreaReducer(state, { type: "startQuery", queryId: 2 });

    state = selectAreaReducer(state, { type: "finishQuery", queryId: 1, groups: [group({})] });

    expect(state.results).toBeNull();
    expect(state.queryId).toBe(2);
  });

  it("drops the answer to a query whose selection has since changed", () => {
    let state = selectAreaReducer(INITIAL_STATE, { type: "startQuery", queryId: 1 });
    state = selectAreaReducer(state, {
      type: "add",
      features: [{ featureId: "{F2}", label: "Access Route" }],
    });

    state = selectAreaReducer(state, { type: "finishQuery", queryId: 1, groups: [group({})] });

    expect(state.results).toBeNull();
  });

  it("adds several features at once, skipping any already in", () => {
    let state = selectAreaReducer(INITIAL_STATE, {
      type: "add",
      features: [{ featureId: "{F1}", label: "Tailings Facility" }],
    });

    state = selectAreaReducer(state, {
      type: "add",
      features: [
        { featureId: "{F1}", label: "Tailings Facility" },
        { featureId: "{F2}", label: "Tailings Facility" },
      ],
    });

    expect(state.selected.map(({ featureId }) => featureId)).toEqual(["{F1}", "{F2}"]);
  });

  it("keeps the results when everything added is already in", () => {
    const feature = { featureId: "{F1}", label: "Tailings Facility" };
    const state = selectAreaReducer(
      { ...withResults([group({})]), selected: [feature] },
      { type: "add", features: [feature] },
    );

    expect(state.results).toHaveLength(1);
  });

  it("keeps a failed layer's group though it has no features to remove", () => {
    const failed = group({ key: "catalogue:BROKEN", features: [], error: "Took too long." });
    let state = withResults([group({}), failed]);

    state = selectAreaReducer(state, {
      type: "removeResult",
      groupKey: `catalogue:${CARIBOU}`,
      featureKey: `${CARIBOU}.2`,
    });

    expect(state.results?.map(({ key }) => key)).toEqual(["catalogue:BROKEN"]);
  });

  it("lets go of the highlight and details of a cleared group", () => {
    let state = withResults([group({}), PIP_GROUP]);
    state = selectAreaReducer(state, {
      type: "focus",
      focus: { kind: "result", groupKey: PIP_GROUP.key, featureKey: "{P1}" },
    });
    state = selectAreaReducer(state, {
      type: "showInfo",
      target: { groupKey: PIP_GROUP.key, featureKey: "{P1}", right: 0, top: 0 },
    });

    state = selectAreaReducer(state, { type: "clearGroup", groupKey: PIP_GROUP.key });

    expect(state.focused).toBeNull();
    expect(state.info).toBeNull();
  });
});

describe("map-api's answer as groups", () => {
  const layers = searchedLayers({
    appliedLayers: [
      { id: "caribou", objectName: CARIBOU, name: "Caribou Herd Locations for BC" },
    ] as never,
    favourites: [{ id: `local-${PIP}`, name: "PIP" }] as never,
    visibleIds: new Set(["caribou", `local-${PIP}`, "local-EAO.PROJECT_DATA"]),
    importedLayers: [{ id: "wells", name: "My wells" }] as never,
    importedShownIds: new Set(["wells"]),
  });

  it("searches every layer on but the EAO layer the selection comes from", () => {
    expect(layers.map(({ kind, layer }) => [kind, layer])).toEqual([
      ["catalogue", CARIBOU],
      ["hosted", PIP],
      ["imported", "wells"],
    ]);
  });

  it("names a feature with no name of its own by its layer", () => {
    const [imported] = toGroups(
      [
        {
          kind: "imported",
          layer: "wells",
          status: "found",
          matched: 1,
          error: null,
          features: [{ id: "7", name: null, properties: [] }],
        },
      ],
      layers,
    );

    expect(imported.features[0]).toMatchObject({ key: "7", name: "My wells" });
  });
});

/** Loads `groups`, then focuses or opens the named group's first feature. */
const Drive = ({
  groups,
  focus,
  info,
}: {
  groups: ResultGroup[];
  focus?: string;
  info?: string;
}) => {
  const area = useSelectArea();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const queryId = area.startQuery();
    area.finishQuery(queryId, groups);
    const target = groups.find(({ key }) => key === (focus ?? info));
    if (!target) return;
    const featureKey = target.features[0].key;
    if (focus) area.focusResult(target.key, featureKey);
    if (info) area.showInfo({ groupKey: target.key, featureKey, right: 600, top: 120 });
  }, [area, groups, focus, info]);
  return null;
};

const Highlight = ({ map }: { map: unknown }) => {
  useResultHighlight(map as never);
  return null;
};

/** A map with the feature out of view unless `inView`. */
const fakeMap = (inView = false) => ({
  project: ([lng, lat]: [number, number]) =>
    inView ? { x: (lng + 121) * 400, y: (53 - lat) * 400 } : { x: -5000, y: -5000 },
  getContainer: () => ({ clientWidth: 1000, clientHeight: 800 }),
  getLayer: () => ({ sourceLayer: "pip_consultation_areas" }),
  cameraForBounds: () => ({ center: [-120, 52], zoom: 7 }),
  easeTo: vi.fn(),
});

let queryClient: QueryClient;

const wrap = (children: ReactNode) => (
  <QueryClientProvider client={queryClient}>
    <SelectAreaProvider>{children}</SelectAreaProvider>
  </QueryClientProvider>
);

beforeEach(() => {
  queryClient = new QueryClient();
  [showHighlight, showLocalHighlight, hideHighlight, warehouseBounds, api.get, popup].forEach(
    (mock) => mock.mockReset(),
  );
});
afterEach(cleanup);

describe("a focused result on the map", () => {
  it("draws a warehouse feature by id in navy, and frames it out of view above its layer's floor", async () => {
    warehouseBounds.mockResolvedValue([-120.5, 51.5, -119.5, 52.5]);
    const map = fakeMap();

    render(wrap(<><Drive groups={[group({})]} focus={`catalogue:${CARIBOU}`} /><Highlight map={map} /></>));

    expect(showHighlight).toHaveBeenCalledWith(
      map,
      { objectName: CARIBOU, featureId: `${CARIBOU}.2`, geometry: null },
      RESULT_HIGHLIGHT_COLOR,
    );
    await waitFor(() => expect(map.easeTo).toHaveBeenCalled());
    expect(map.easeTo.mock.calls[0][0].zoom).toBe(9);
  });

  it("leaves the camera alone for a feature already in view", async () => {
    warehouseBounds.mockResolvedValue([-120.5, 51.5, -119.5, 52.5]);
    const map = fakeMap(true);

    render(wrap(<><Drive groups={[group({})]} focus={`catalogue:${CARIBOU}`} /><Highlight map={map} /></>));

    await waitFor(() => expect(warehouseBounds).toHaveBeenCalled());
    expect(map.easeTo).not.toHaveBeenCalled();
  });

  it("draws a hosted feature from its own tiles, and frames it from its record", async () => {
    api.get.mockResolvedValue({ data: { bounds: [-120.5, 51.5, -119.5, 52.5] } });
    const map = fakeMap();

    render(wrap(<><Drive groups={[PIP_GROUP]} focus={PIP_GROUP.key} /><Highlight map={map} /></>));

    expect(showLocalHighlight).toHaveBeenCalledWith(
      map,
      {
        layerId: `local-${PIP}`,
        sourceLayer: "pip_consultation_areas",
        keyProperty: "cnsltn_area_guid",
        keys: ["{P1}"],
      },
      RESULT_HIGHLIGHT_COLOR,
    );
    await waitFor(() => expect(map.easeTo).toHaveBeenCalled());
  });

  it("draws an imported feature from the layer's own data", () => {
    const geometry = { type: "Point", coordinates: [-120, 52] };
    queryClient.setQueryData(importedFeaturesKey("wells"), {
      type: "FeatureCollection",
      features: [{ type: "Feature", id: 7, geometry, properties: {} }],
    });
    const map = fakeMap();

    render(wrap(<><Drive groups={[WELLS_GROUP]} focus={WELLS_GROUP.key} /><Highlight map={map} /></>));

    expect(showHighlight).toHaveBeenCalledWith(
      map,
      { objectName: null, featureId: null, geometry },
      RESULT_HIGHLIGHT_COLOR,
    );
  });

  it("takes the highlight off when the result is no longer focused", () => {
    warehouseBounds.mockResolvedValue(null);
    const map = fakeMap();
    const view = render(
      wrap(<><Drive groups={[group({})]} focus={`catalogue:${CARIBOU}`} /><Highlight map={map} /></>),
    );

    view.unmount();

    expect(hideHighlight).toHaveBeenCalledWith(map);
  });
});

describe("a result's details", () => {
  const map = {
    getContainer: () => ({ clientWidth: 1000, clientHeight: 800 }),
  };

  it("lists a warehouse feature's attributes, beside the panel", () => {
    render(wrap(<><Drive groups={[group({})]} info={`catalogue:${CARIBOU}`} /><ResultInfoPopup map={map as never} /></>));

    const props = popup.mock.calls.at(-1)?.[0] as {
      placement: { left: number; top: number; width: number };
      title: string;
      rows: { features: { records: { attributes: unknown[] }[] }[] }[];
    };
    expect(props.title).toBe("1 feature at this point");
    expect(props.placement).toEqual({ left: 600 - 8 - 320, top: 120, width: 320 });
    expect(props.rows[0].features[0].records[0].attributes).toEqual([
      { label: "Herd Name", value: "Wells Gray South" },
    ]);
  });

  it("lists an imported feature's properties from the layer's own data", () => {
    queryClient.setQueryData(importedFeaturesKey("wells"), {
      type: "FeatureCollection",
      features: [
        { type: "Feature", id: 7, geometry: null, properties: { well_tag: "W-12" } },
      ],
    });

    render(wrap(<><Drive groups={[WELLS_GROUP]} info={WELLS_GROUP.key} /><ResultInfoPopup map={map as never} /></>));

    const props = popup.mock.calls.at(-1)?.[0] as {
      rows: { features: { records: { attributes: unknown[] }[] }[] }[];
    };
    expect(props.rows[0].features[0].records[0].attributes).toEqual([
      { label: "Well Tag", value: "W-12" },
    ]);
  });
});
