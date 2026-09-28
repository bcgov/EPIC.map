import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Feature } from "geojson";
import {
  asFeatureCollection,
  formatOf,
  geometrySummary,
  layerNameFromFile,
  parseImportFile,
  touchesBc,
} from "@/components/Layers/UserLayers/importUtils";
import { geoBounds } from "@/utils/geo";

const feature = (type: string, coordinates: unknown): Feature =>
  ({
    type: "Feature",
    properties: {},
    geometry: { type, coordinates },
  }) as Feature;

describe("formatOf", () => {
  it("names the format an extension carries", () => {
    expect(formatOf("a.zip")).toBe("Shapefile");
    expect(formatOf("a.KML")).toBe("KML");
    expect(formatOf("a.json")).toBe("GeoJSON");
    expect(formatOf("a.geojson")).toBe("GeoJSON");
    expect(formatOf("a.txt")).toBeNull();
  });
});

describe("layerNameFromFile", () => {
  it("drops the extension and keeps the rest of the name", () => {
    expect(layerNameFromFile("EA_2025_Surface_Footprint.zip")).toBe(
      "EA_2025_Surface_Footprint",
    );
    expect(layerNameFromFile("my.layer.v2.geojson")).toBe("my.layer.v2");
  });

  it("leaves a name that is all extension alone", () => {
    expect(layerNameFromFile(".kml")).toBe(".kml");
  });
});

describe("geometrySummary", () => {
  it("collapses a multi-geometry onto the shape it is made of", () => {
    expect(geometrySummary([feature("MultiPolygon", [])])).toBe("Polygon");
    expect(geometrySummary([feature("MultiLineString", [])])).toBe("Line");
  });

  it("reports one label when the features agree", () => {
    expect(
      geometrySummary([feature("Polygon", []), feature("MultiPolygon", [])]),
    ).toBe("Polygon");
  });

  it("reports Mixed when they do not", () => {
    expect(
      geometrySummary([feature("Polygon", []), feature("Point", [0, 0])]),
    ).toBe("Mixed");
  });

  it("reports None for a file with no features", () => {
    expect(geometrySummary([])).toBe("None");
  });
});

describe("geoBounds", () => {
  it("spans every coordinate, however deeply nested", () => {
    expect(
      geoBounds([
        feature("Point", [-123, 49]),
        feature("Polygon", [
          [
            [-125, 48],
            [-120, 48],
            [-120, 51],
            [-125, 48],
          ],
        ]),
      ]),
    ).toEqual([-125, 48, -120, 51]);
  });

  it("has no bounds for a file with no coordinates", () => {
    expect(geoBounds([])).toBeNull();
    expect(geoBounds([feature("Polygon", [])])).toBeNull();
  });
});

describe("asFeatureCollection", () => {
  it("wraps a lone feature", () => {
    const { features } = asFeatureCollection(feature("Point", [0, 0]));
    expect(features).toHaveLength(1);
  });

  it("wraps a bare geometry, which GeoJSON allows as a whole document", () => {
    const { features } = asFeatureCollection({
      type: "Point",
      coordinates: [0, 0],
    });
    expect(features[0].geometry.type).toBe("Point");
  });

  it("merges the collections a zip of several shapefiles returns", () => {
    const { features } = asFeatureCollection([
      { type: "FeatureCollection", features: [feature("Point", [0, 0])] },
      {
        type: "FeatureCollection",
        features: [feature("Point", [1, 1]), feature("Point", [2, 2])],
      },
    ]);
    expect(features).toHaveLength(3);
  });

  it("ignores what is not GeoJSON at all", () => {
    expect(asFeatureCollection(null).features).toEqual([]);
    expect(asFeatureCollection({ hello: "world" }).features).toEqual([]);
  });
});

/** Only the GeoJSON reader is exercised here: the other two need a browser. */
describe("parseImportFile", () => {
  const geoJsonFile = (body: unknown, name = "footprint.geojson") =>
    new File([JSON.stringify(body)], name, { type: "application/geo+json" });

  it("summarises a collection the way the dialog reports it", async () => {
    const parsed = await parseImportFile(
      geoJsonFile({
        type: "FeatureCollection",
        features: [
          feature("Polygon", [
            [
              [-125, 48],
              [-120, 48],
              [-120, 51],
              [-125, 48],
            ],
          ]),
        ],
      }),
    );

    expect(parsed).toMatchObject({
      format: "GeoJSON",
      geometryType: "Polygon",
      featureCount: 1,
      bounds: [-125, 48, -120, 51],
    });
  });

  it("refuses a file that is not JSON at all", async () => {
    await expect(
      parseImportFile(new File(["<kml/>"], "a.geojson")),
    ).rejects.toThrow(/could not be read as GeoJSON/);
  });

  it("refuses a layer with more features than map-api will store", async () => {
    const victoria = { type: "Point", coordinates: [-123.37, 48.42] };
    const tooMany = {
      type: "FeatureCollection",
      features: Array.from({ length: 50_001 }, () => ({
        type: "Feature",
        geometry: victoria,
        properties: {},
      })),
    };

    await expect(parseImportFile(geoJsonFile(tooMany))).rejects.toThrow(
      "This layer has more than 50,000 features. Split it into smaller files.",
    );
  });

  it("refuses a layer with nothing inside British Columbia", async () => {
    const london = { type: "Point", coordinates: [-0.13, 51.51] };

    await expect(parseImportFile(geoJsonFile(london))).rejects.toThrow(
      "This layer lies entirely outside British Columbia.",
    );
  });

  it("takes a layer with only part of it inside British Columbia", async () => {
    const crossing = {
      type: "LineString",
      coordinates: [
        [-0.13, 51.51],
        [-123.37, 48.42],
      ],
    };

    await expect(parseImportFile(geoJsonFile(crossing))).resolves.toMatchObject({
      featureCount: 1,
    });
  });

  it("refuses a collection with nothing in it", async () => {
    await expect(
      parseImportFile(geoJsonFile({ type: "FeatureCollection", features: [] })),
    ).rejects.toThrow(/no features/);
  });
});

/**
 * The shapefile path end to end: our reading of the zip, shpjs, and the
 * reprojection proj4 does from the `.prj`. The fixtures are built by hand -
 * one point, in BC Albers metres - so what comes back is checked against
 * coordinates nobody could have got by accident.
 */
describe("parseImportFile, shapefiles", () => {
  const fixture = (name: string) =>
    new File(
      [readFileSync(new URL(`./fixtures/${name}`, import.meta.url))],
      name,
    );

  it("converts BC Albers metres into the degrees the map draws in", async () => {
    const parsed = await parseImportFile(fixture("point-bc-albers.zip"));

    expect(parsed.format).toBe("Shapefile");
    expect(parsed.geometryType).toBe("Point");
    expect(parsed.featureCount).toBe(1);
    expect(parsed.reprojectedFrom).toBe("NAD 1983 BC Environment Albers");

    const [west, south] = parsed.bounds ?? [];
    expect(west).toBeCloseTo(-123.1, 0);
    expect(south).toBeCloseTo(49.1, 0);
  });

  it("refuses a shapefile that brought no coordinate system", async () => {
    // The only .prj in this zip is macOS metadata, which is not one at all.
    await expect(parseImportFile(fixture("point-no-prj.zip"))).rejects.toThrow(
      /No coordinate system was found/,
    );
  });
});

describe("touchesBc", () => {
  it("counts an extent that only overlaps the province's edge", () => {
    // Straddling the Alberta border.
    expect(touchesBc([-115, 50, -110, 52])).toBe(true);
  });

  it("refuses an extent wholly beyond it", () => {
    expect(touchesBc([-80, 43, -79, 44])).toBe(false);
  });
});
