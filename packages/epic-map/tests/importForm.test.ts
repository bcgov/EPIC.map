import { describe, expect, it } from "vitest";
import {
  crsName,
  hasProblem,
  isWgs84,
  reprojectedFrom,
  SENSITIVE_REQUIRED,
  validateImportForm,
  type SensitiveChoice,
} from "@/components/Layers/UserLayers/importUtils";

const BC_ALBERS =
  'PROJCS["NAD_1983_BC_Environment_Albers",GEOGCS["GCS_North_American_1983",' +
  'DATUM["D_North_American_1983",SPHEROID["GRS_1980",6378137.0,298.257222101]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],' +
  'PROJECTION["Albers"],UNIT["Meter",1.0]]';

const WGS84 =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,' +
  '298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

const NAD83 =
  'GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983",' +
  'SPHEROID["GRS_1980",6378137.0,298.257222101]]]';

describe("crsName", () => {
  it("reads the outermost system's name, with underscores as spaces", () => {
    expect(crsName(BC_ALBERS)).toBe("NAD 1983 BC Environment Albers");
    expect(crsName(WGS84)).toBe("GCS WGS 1984");
  });

  it("has no name for something that is not WKT", () => {
    expect(crsName("")).toBeNull();
    expect(crsName("not a projection")).toBeNull();
  });
});

describe("isWgs84", () => {
  it("is true only for the coordinates the map already draws in", () => {
    expect(isWgs84(WGS84)).toBe(true);
    expect(isWgs84(BC_ALBERS)).toBe(false);
    expect(isWgs84(NAD83)).toBe(false);
  });

  it("treats a projected system as converted whatever its datum", () => {
    expect(isWgs84('PROJCS["WGS_1984_UTM_Zone_10N"]')).toBe(false);
  });
});

describe("reprojectedFrom", () => {
  it("names what a converted file came from", () => {
    expect(reprojectedFrom(BC_ALBERS)).toBe("NAD 1983 BC Environment Albers");
  });

  it("says nothing about a file that was already WGS 84", () => {
    expect(reprojectedFrom(WGS84)).toBeNull();
  });

  it("says nothing when there is no projection to speak of", () => {
    expect(reprojectedFrom(null)).toBeNull();
    expect(reprojectedFrom("   ")).toBeNull();
  });

  it("still warns when the system is unreadable but not WGS 84", () => {
    expect(reprojectedFrom("PROJCS[]")).toBe("an unnamed coordinate system");
  });
});

const validate = (
  name: string,
  sensitive: SensitiveChoice,
  existingNames: string[],
  description = "",
) => validateImportForm({ name, description, sensitive }, existingNames);

describe("validateImportForm", () => {
  it("passes a named layer with a choice made", () => {
    const problems = validate("Roads", "no", []);
    expect(hasProblem(problems)).toBe(false);
  });

  it("asks for a name that is missing or only spaces", () => {
    expect(validate("", "yes", []).name).toBe("Enter a layer name.");
    expect(validate("   ", "yes", []).name).toBe(
      "Enter a layer name.",
    );
  });

  it("refuses a name the user has already used, however it is cased", () => {
    expect(validate("roads ", "yes", ["Roads"]).name).toBe(
      'You already have a layer named "roads". Enter a different name.',
    );
  });

  it("asks for a sensitivity choice until one is made", () => {
    expect(validate("Roads", "", []).sensitive).toBe(
      SENSITIVE_REQUIRED,
    );
    expect(validate("Roads", "yes", []).sensitive).toBeNull();
  });

  it("refuses a name or description longer than map-api stores", () => {
    expect(validate("x".repeat(101), "yes", []).name).toBe(
      "Enter a layer name of 100 characters or fewer.",
    );
    expect(validate("x".repeat(100), "yes", []).name).toBeNull();
    expect(validate("Roads", "yes", [], "x".repeat(1001)).description).toBe(
      "Enter a description of 1000 characters or fewer.",
    );
    expect(validate("Roads", "yes", [], "x".repeat(1000)).description).toBeNull();
  });

  it("reports both problems at once", () => {
    const problems = validate("", "", []);
    expect(problems.name).not.toBeNull();
    expect(problems.sensitive).not.toBeNull();
  });
});
