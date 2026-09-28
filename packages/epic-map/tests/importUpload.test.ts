import { AxiosError, type AxiosResponse } from "axios";
import type { FeatureCollection } from "geojson";
import { describe, expect, it } from "vitest";
import { formatUploadedDate, toImportedLayer } from "@/api/useImportedLayers";
import type { ImportDraft } from "@/components/Layers/UserLayers/ImportFileDialog";
import {
  buildImportForm,
  CONNECTION_INTERRUPTED,
  describeUploadFailure,
  FEATURES_FIELD,
  formatUploadSize,
  gzip,
  toFeatureLines,
  uploadPercent,
  uploadStatusLabel,
  type UploadRow,
} from "@/components/Layers/UserLayers/uploadUtils";

const collection: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-123.37, 48.42] },
      properties: { NAME: "Legislature" },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-123.94, 49.17] },
      properties: { NAME: "Harbour" },
    },
  ],
};

const draft = (overrides: Partial<ImportDraft["parsed"]> = {}): ImportDraft => ({
  file: new File(["zip"], "roads.zip"),
  parsed: {
    format: "Shapefile",
    geojson: collection,
    geometryType: "Point",
    featureCount: 2,
    bounds: [-123.94, 48.42, -123.37, 49.17],
    reprojectedFrom: "NAD83 BC Environment Albers",
    ...overrides,
  },
  name: "Roads",
  description: "Resource roads",
  sensitive: true,
});

const gunzip = (blob: Blob): Promise<string> =>
  new Response(
    blob.stream().pipeThrough(new DecompressionStream("gzip")),
  ).text();

const row = (overrides: Partial<UploadRow> = {}): UploadRow => ({
  id: "0b8f6a57-3c0e-4c55-9d38-8e5a4c1c2f10",
  fileName: "roads.zip",
  layerName: "Roads",
  status: "uploading",
  loaded: 0,
  total: 0,
  error: null,
  retryable: false,
  ...overrides,
});

const httpError = (status: number, data: unknown = {}) =>
  new AxiosError("Request failed", "ERR_BAD_RESPONSE", undefined, undefined, {
    status,
    data,
  } as AxiosResponse);

const linesOf = (collection: FeatureCollection): Promise<string> =>
  new Response(toFeatureLines(collection)).text();

describe("toFeatureLines", () => {
  it("writes one feature per line, each whole on its own", async () => {
    const lines = (await linesOf(collection)).trimEnd().split("\n");

    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1])).toEqual(collection.features[1]);
  });

  it("writes every feature of a layer larger than one step", async () => {
    const many: FeatureCollection = {
      type: "FeatureCollection",
      features: Array.from({ length: 1201 }, (_, index) => ({
        ...collection.features[0],
        properties: { index },
      })),
    };

    const lines = (await linesOf(many)).trimEnd().split("\n");

    expect(lines).toHaveLength(1201);
    expect(JSON.parse(lines[1200]).properties).toEqual({ index: 1200 });
  });
});

describe("gzip", () => {
  it("round-trips the features exactly", async () => {
    expect(await gunzip(await gzip(toFeatureLines(collection)))).toBe(
      await linesOf(collection),
    );
  });
});

describe("buildImportForm", () => {
  it("carries the form fields map-api reads", () => {
    const form = buildImportForm(draft(), new Blob(["x"]));

    expect(form.get("name")).toBe("Roads");
    expect(form.get("description")).toBe("Resource roads");
    expect(form.get("is_sensitive")).toBe("true");
    expect(form.get("source_format")).toBe("Shapefile");
    expect(form.get("source_filename")).toBe("roads.zip");
    expect(form.get("source_crs")).toBe("NAD83 BC Environment Albers");
  });

  it("sends the features as a file", () => {
    const form = buildImportForm(draft(), new Blob(["x"]));

    expect((form.get(FEATURES_FIELD) as File).name).toBe("features.geojsonl.gz");
  });

  it("leaves the source system out when nothing was converted", () => {
    const form = buildImportForm(draft({ reprojectedFrom: null }), new Blob());

    expect(form.has("source_crs")).toBe(false);
  });
});

describe("formatUploadSize", () => {
  it("reads the way the design shows it", () => {
    expect(formatUploadSize(19.6 * 1024 * 1024, 28.5 * 1024 * 1024)).toBe(
      "19.6 of 28.5 MB",
    );
  });
});

describe("uploadPercent", () => {
  it("rounds down, so 100% means every byte", () => {
    expect(uploadPercent(row({ loaded: 999, total: 1000 }))).toBe(99);
  });

  it("is 0 before the size is known", () => {
    expect(uploadPercent(row({ loaded: 0, total: 0 }))).toBe(0);
  });

  it("holds at 100 while map-api stores the layer", () => {
    expect(uploadPercent(row({ status: "processing", loaded: 5, total: 10 }))).toBe(100);
  });
});

describe("uploadStatusLabel", () => {
  it("says a stalled upload is waiting, in the design's words", () => {
    expect(uploadStatusLabel("stalled")).toBe("Stalled - waiting for connection");
  });
});

describe("describeUploadFailure", () => {
  it("calls a request that got no answer an interrupted connection, worth retrying", () => {
    const dropped = new AxiosError("Network Error", "ERR_NETWORK");

    expect(describeUploadFailure(dropped)).toEqual({
      message: CONNECTION_INTERRUPTED,
      retryable: true,
    });
  });

  it("offers a retry for a fault on the server", () => {
    expect(describeUploadFailure(httpError(500)).retryable).toBe(true);
  });

  it("passes map-api's refusal on, and does not offer to repeat it", () => {
    const taken = httpError(409, {
      message: 'You already have a layer named "Roads". Enter a different name.',
    });

    expect(describeUploadFailure(taken)).toEqual({
      message: 'You already have a layer named "Roads". Enter a different name.',
      retryable: false,
    });
  });

  it("shows the field message of a validation failure, not its summary", () => {
    const invalid = httpError(400, {
      message: "Invalid request",
      errors: { name: ["Enter a layer name."] },
    });

    expect(describeUploadFailure(invalid).message).toBe("Enter a layer name.");
  });

  it("says a sign-in has lapsed rather than that the layer was refused", () => {
    const expired = httpError(401, {
      code: "token_expired",
      description: "token is expired",
    });

    expect(describeUploadFailure(expired)).toEqual({
      message: "Your session has expired. Sign in again, then try again.",
      retryable: true,
    });
  });

  it("says a user without access cannot import", () => {
    expect(describeUploadFailure(httpError(403, {})).message).toBe(
      "You do not have permission to import layers.",
    );
  });

  it("says a layer is too large when map-api gives no reason", () => {
    expect(describeUploadFailure(httpError(413, "")).message).toBe(
      "This layer is too large to upload.",
    );
  });

  it("does not retry a failure before anything was sent", () => {
    expect(describeUploadFailure(new Error("no CompressionStream")).retryable).toBe(
      false,
    );
  });
});

describe("toImportedLayer", () => {
  it("carries the name, description and sensitivity map-api stored", () => {
    const layer = toImportedLayer({
      id: "0b8f6a57-3c0e-4c55-9d38-8e5a4c1c2f10",
      name: "Roads",
      description: "Resource roads",
      is_sensitive: true,
      source_format: "Shapefile",
      source_filename: "roads.zip",
      source_crs: null,
      geometry_type: "Line",
      feature_count: 12,
      extent: [-124, 48, -123, 49],
      created_date: "2026-09-25T00:00:00",
    });

    expect(layer).toMatchObject({
      name: "Roads",
      description: "Resource roads",
      isSensitive: true,
      featureCount: 12,
    });
  });
});

describe("upload dates", () => {
  const stored = (created_date: string) =>
    toImportedLayer({
      id: "0b8f6a57-3c0e-4c55-9d38-8e5a4c1c2f10",
      name: "Roads",
      description: null,
      is_sensitive: false,
      source_format: "GeoJSON",
      source_filename: "roads.geojson",
      source_crs: null,
      geometry_type: "Line",
      feature_count: 1,
      extent: null,
      created_date,
    });

  it("reads map-api's zoneless timestamp as UTC", () => {
    expect(stored("2026-04-21T12:00:00.123456").uploadedAt).toBe(
      "2026-04-21T12:00:00.123456Z",
    );
  });

  it("leaves a timestamp that already names its zone alone", () => {
    expect(stored("2026-04-21T12:00:00+00:00").uploadedAt).toBe(
      "2026-04-21T12:00:00+00:00",
    );
  });

  it("formats the date the way catalogue dates read", () => {
    // Midday UTC is the same calendar day from Hawaii to New Zealand.
    expect(formatUploadedDate("2026-04-21T12:00:00Z")).toBe("Apr 21, 2026");
  });

  it("shows nothing for a date it cannot read", () => {
    expect(formatUploadedDate("not a date")).toBe("");
  });
});
