import { describe, expect, it } from "vitest";
import {
  rejectImportFile,
  triageImportFiles,
} from "@/components/Layers/UserLayers/importUtils";
import { MAX_IMPORT_FILE_MB } from "@/utils/config";

const MB = 1024 * 1024;

const file = (name: string, size = 1024) => ({ name, size });

describe("rejectImportFile", () => {
  it("takes every format the panel advertises, whatever the casing", () => {
    for (const name of ["a.kml", "b.geojson", "c.json", "d.zip", "E.KML"])
      expect(rejectImportFile(file(name))).toBeNull();
  });

  it("refuses a format it cannot read", () => {
    expect(rejectImportFile(file("roads.txt"))).toMatch(/Unsupported format/);
    expect(rejectImportFile(file("roads"))).toMatch(/Unsupported format/);
  });

  it("judges by the last extension, not the first", () => {
    expect(rejectImportFile(file("roads.kml.txt"))).toMatch(/Unsupported/);
    expect(rejectImportFile(file("roads.txt.kml"))).toBeNull();
  });

  it("refuses a file past the size limit but takes one exactly on it", () => {
    expect(rejectImportFile(file("big.zip", MAX_IMPORT_FILE_MB * MB + 1))).toMatch(
      /50 MB limit/,
    );
    expect(rejectImportFile(file("big.zip", MAX_IMPORT_FILE_MB * MB))).toBeNull();
  });

  it("refuses an empty file", () => {
    expect(rejectImportFile(file("empty.kml", 0))).toMatch(/empty/);
  });
});

describe("triageImportFiles", () => {
  it("keeps the good files when one in a drop is bad", () => {
    const { accepted, rejected } = triageImportFiles([
      file("a.kml"),
      file("notes.txt"),
      file("b.geojson"),
    ]);

    expect(accepted.map((entry) => entry.name)).toEqual(["a.kml", "b.geojson"]);
    expect(rejected.map((entry) => entry.name)).toEqual(["notes.txt"]);
  });
});
