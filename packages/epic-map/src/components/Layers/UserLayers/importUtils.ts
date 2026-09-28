import type { Feature, FeatureCollection } from "geojson";
import type { MapExtent } from "@/types";
import { BC_EXTENT, MAX_IMPORT_FILE_MB } from "@/utils/config";
import { geoBounds } from "@/utils/geo";

/**
 * Everything that happens to an imported file before Upload: whether the
 * panel will take it, what coordinate system it came in, what it holds, and
 * whether the form it is saved under is complete.
 */

// Formats and file checks

const MAX_IMPORT_FILE_BYTES = MAX_IMPORT_FILE_MB * 1024 * 1024;

/** What the panel calls a format, which is not one name per extension. */
export type ImportFormat = "KML" | "GeoJSON" | "Shapefile";

/**
 * Extension to the format it carries. A shapefile arrives zipped because the
 * format is several sibling files that only mean anything together, and
 * GeoJSON is published under both of its conventional extensions.
 */
const FORMATS = new Map<string, ImportFormat>([
  [".kml", "KML"],
  [".geojson", "GeoJSON"],
  [".json", "GeoJSON"],
  [".zip", "Shapefile"],
]);

/** The `accept` attribute of the file input. */
export const IMPORT_ACCEPT = [...FORMATS.keys()].join(",");

/** How the panel names the formats, which is not one per extension. */
export const IMPORT_FORMATS_LABEL = "KML, GeoJSON, Shapefile (.zip)";

/** Enough of a file to judge it; `File` satisfies this, so tests need no DOM. */
export type ImportCandidate = { name: string; size: number };

export type ImportRejection = { name: string; reason: string };

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
};

/** The format a file's extension claims, or `null` for one we cannot read. */
export const formatOf = (name: string): ImportFormat | null =>
  FORMATS.get(extensionOf(name)) ?? null;

/** The file name without its extension, which prefills the layer name. */
export const layerNameFromFile = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return (dot > 0 ? name.slice(0, dot) : name).trim();
};

/** Why a file cannot be imported, or `null` when it can. */
export const rejectImportFile = (file: ImportCandidate): string | null => {
  if (!formatOf(file.name))
    return `Unsupported format. Accepts ${IMPORT_FORMATS_LABEL}.`;
  if (file.size > MAX_IMPORT_FILE_BYTES)
    return `Larger than the ${MAX_IMPORT_FILE_MB} MB limit.`;
  if (file.size === 0) return "This file is empty.";
  return null;
};

/**
 * Splits a drop into what may be imported and what may not, so one bad file
 * among several does not sink the rest.
 */
export const triageImportFiles = <T extends ImportCandidate>(
  files: readonly T[],
): { accepted: T[]; rejected: ImportRejection[] } => {
  const accepted: T[] = [];
  const rejected: ImportRejection[] = [];

  for (const file of files) {
    const reason = rejectImportFile(file);
    if (reason) rejected.push({ name: file.name, reason });
    else accepted.push(file);
  }

  return { accepted, rejected };
};

// Coordinate systems

/**
 * What a shapefile's `.prj` says its coordinates are in.
 *
 * Only enough of the WKT is read to name the system and tell whether it is
 * already WGS 84 - the conversion itself is proj4's job, inside shpjs.
 */

/** The name the WKT gives its outermost coordinate system. */
export const crsName = (wkt: string): string | null => {
  const named = /\b(?:PROJCS|GEOGCS|GEOGCRS|PROJCRS)\s*\[\s*"([^"]+)"/i.exec(
    wkt,
  );
  // Underscores are how WKT spells spaces: NAD_1983_BC_Environment_Albers.
  return named ? named[1].replace(/_/g, " ").trim() || null : null;
};

/** Whether the file is already in the coordinates the map draws in. */
export const isWgs84 = (wkt: string): boolean => {
  if (/\bPROJCS\s*\[|\bPROJCRS\s*\[/i.test(wkt)) return false;
  const name = crsName(wkt);
  return name !== null && /\bWGS\s*(19)?84\b/i.test(name);
};

/**
 * The system the coordinates were converted from, or `null` when nothing was
 * converted. Named so the warning can say what the file was drawn in.
 */
export const reprojectedFrom = (wkt: string | null): string | null => {
  if (!wkt?.trim() || isWgs84(wkt)) return null;
  return crsName(wkt) ?? "an unnamed coordinate system";
};

// Reading a file

/** What the panel reports about a file, once it has been read. */
export type ParsedImport = {
  format: ImportFormat;
  geojson: FeatureCollection;
  geometryType: string;
  featureCount: number;
  bounds: MapExtent | null;
  reprojectedFrom: string | null;
};

/** What a reader hands back: the GeoJSON, and what it had to do to get there. */
type ReadFile = {
  data: unknown;
  reprojectedFrom: string | null;
};

const GEOMETRY_LABELS: Record<string, string> = {
  Point: "Point",
  MultiPoint: "Point",
  LineString: "Line",
  MultiLineString: "Line",
  Polygon: "Polygon",
  MultiPolygon: "Polygon",
};

/** One label for the file, or "Mixed" when its features disagree. */
export const geometrySummary = (features: readonly Feature[]): string => {
  const labels = new Set(
    features.map(
      (feature) => GEOMETRY_LABELS[feature.geometry?.type ?? ""] ?? "Mixed",
    ),
  );
  if (labels.size === 0) return "None";
  return labels.size === 1 ? [...labels][0] : "Mixed";
};

/** Whether any part of the extent overlaps the province. */
export const touchesBc = ([west, south, east, north]: MapExtent): boolean => {
  const [bcWest, bcSouth, bcEast, bcNorth] = BC_EXTENT;
  return west <= bcEast && east >= bcWest && south <= bcNorth && north >= bcSouth;
};

const isFeature = (value: unknown): value is Feature =>
  !!value && typeof value === "object" && (value as Feature).type === "Feature";

/**
 * Everything a parser may hand back, flattened into one collection: a bare
 * geometry, a single feature, or - from a zip holding several shapefiles - an
 * array of collections.
 */
export const asFeatureCollection = (value: unknown): FeatureCollection => {
  const features: Feature[] = [];

  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!candidate || typeof candidate !== "object") return;

    const entry = candidate as { type?: string; features?: unknown };
    if (entry.type === "FeatureCollection") visit(entry.features);
    else if (isFeature(entry)) features.push(entry);
    else if (entry.type)
      // A bare geometry, which GeoJSON allows as a whole document.
      features.push({
        type: "Feature",
        geometry: candidate as Feature["geometry"],
        properties: {},
      });
  };

  visit(value);
  return { type: "FeatureCollection", features };
};

const unreadable = (format: ImportFormat) =>
  new Error(`This file could not be read as ${format}.`);

/** GeoJSON is WGS 84 by specification, so nothing is ever converted. */
const readGeoJson = async (file: File): Promise<ReadFile> => {
  try {
    return { data: JSON.parse(await file.text()), reprojectedFrom: null };
  } catch {
    throw unreadable("GeoJSON");
  }
};

/** KML is WGS 84 by specification, the same way GeoJSON is. */
const readKml = async (file: File): Promise<ReadFile> => {
  // Loaded on demand: the parsers are only worth their weight to someone who
  // is actually importing a file.
  const { kml } = await import("@tmcw/togeojson");
  const document = new DOMParser().parseFromString(
    await file.text(),
    "application/xml",
  );
  if (document.getElementsByTagName("parsererror").length)
    throw unreadable("KML");
  return { data: kml(document), reprojectedFrom: null };
};

/** A zip entry macOS adds beside the real one, holding none of its data. */
const isMacMetadata = (filename: string) => filename.includes("__MACOSX");

/**
 * The `.prj` beside the shapefile, and whether there is a shapefile at all.
 *
 * shpjs reads the zip itself but says nothing about what it found, and the
 * difference between "converted from BC Albers" and "there was no coordinate
 * system to convert from" is the difference between a warning and a refusal.
 */
const readZipContents = async (
  bytes: Uint8Array,
): Promise<{ hasShapefile: boolean; prj: string | null }> => {
  const { iter } = await import("but-unzip");

  let hasShapefile = false;
  let prj: string | null = null;

  for (const entry of iter(bytes)) {
    if (isMacMetadata(entry.filename)) continue;
    const filename = entry.filename.toLowerCase();
    if (filename.endsWith(".shp")) hasShapefile = true;
    else if (filename.endsWith(".prj"))
      prj = new TextDecoder().decode(await entry.read());
  }

  return { hasShapefile, prj };
};

const readShapefile = async (file: File): Promise<ReadFile> => {
  const bytes = new Uint8Array(await file.arrayBuffer());

  let contents: { hasShapefile: boolean; prj: string | null };
  try {
    contents = await readZipContents(bytes);
  } catch {
    throw unreadable("Shapefile");
  }

  if (contents.hasShapefile && !contents.prj)
    throw new Error(
      "No coordinate system was found. Re-export the shapefile.",
    );

  const { parseZip } = await import("shpjs");
  try {
    return {
      data: await parseZip(bytes),
      reprojectedFrom: reprojectedFrom(contents.prj),
    };
  } catch {
    throw unreadable("Shapefile");
  }
};

const READERS: Record<ImportFormat, (file: File) => Promise<ReadFile>> = {
  GeoJSON: readGeoJson,
  KML: readKml,
  Shapefile: readShapefile,
};

/**
 * Reads a dropped file into the features the preview draws and the summary
 * counts. Coordinates come back in WGS84 — shpjs reprojects from the `.prj`
 * beside the shapefile, and the other two formats are WGS84 by definition.
 */
export const parseImportFile = async (file: File): Promise<ParsedImport> => {
  const format = formatOf(file.name);
  if (!format) throw new Error(`Accepts ${IMPORT_FORMATS_LABEL}.`);

  const read = await READERS[format](file);
  const geojson = asFeatureCollection(read.data);
  if (geojson.features.length === 0)
    throw new Error("This file holds no features to import.");

  const bounds = geoBounds(geojson.features);
  // map-api refuses such a layer too, but only once the whole file has been
  // sent and stored - saying so here spares the user the upload.
  if (bounds && !touchesBc(bounds))
    throw new Error("This layer lies entirely outside British Columbia.");

  return {
    format,
    geojson,
    geometryType: geometrySummary(geojson.features),
    featureCount: geojson.features.length,
    bounds,
    reprojectedFrom: read.reprojectedFrom,
  };
};

// The form it is saved under

/** Shown under the radios when neither has been chosen. */
export const SENSITIVE_REQUIRED =
  "Select whether this layer contains sensitive information";

export type SensitiveChoice = "yes" | "no" | "";

/** What is wrong with the form, field by field; `null` where nothing is. */
export type ImportFormProblems = {
  name: string | null;
  sensitive: string | null;
};

const nameProblem = (
  name: string,
  existingNames: readonly string[],
): string | null => {
  if (!name) return "Enter a layer name.";

  const taken = existingNames.some(
    (existing) => existing.trim().toLowerCase() === name.toLowerCase(),
  );
  return taken
    ? `You already have a layer named "${name}". Enter a different name.`
    : null;
};

/**
 * Checked on Upload rather than as the user types: the form opens with an
 * empty name and no choice made, and neither is a mistake until they submit.
 */
export const validateImportForm = (
  name: string,
  sensitive: SensitiveChoice,
  existingNames: readonly string[],
): ImportFormProblems => ({
  name: nameProblem(name.trim(), existingNames),
  sensitive: sensitive === "" ? SENSITIVE_REQUIRED : null,
});

export const hasProblem = (problems: ImportFormProblems): boolean =>
  problems.name !== null || problems.sensitive !== null;
