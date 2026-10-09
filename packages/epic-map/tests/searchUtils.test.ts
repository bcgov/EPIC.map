import { describe, expect, it } from "vitest";
import type { FilterOption, MapProject } from "@/components/Filters/filterUtils";
import {
  matchProjects,
  placeLocality,
  placeName,
  placePill,
  placeZoom,
  steppedIndex,
  toPlaceResults,
  toRows,
  type GeocoderProperties,
} from "@/components/Search/searchUtils";
import { splitOnMatches } from "@/utils/text";
import { DEFAULT_PLACE_ZOOM, PROJECT_ZOOM } from "@/utils/config";

/**
 * The fixtures below are real `addresses.json` responses, trimmed to the fields
 * this package reads. They are the point of this file: the geocoder populates a
 * different combination of fields for each shape of thing it finds, and the only
 * way a rule about those fields can be checked is against what it actually
 * sends.
 */

/** A bare locality: every street field present and empty. */
const carpenterLake: GeocoderProperties = {
  fullAddress: "Carpenter Lake, BC",
  civicNumber: "",
  streetName: "",
  streetType: "",
  streetDirection: "",
  localityName: "Carpenter Lake",
  localityType: "Unknown",
  matchPrecision: "LOCALITY",
};

/** A full civic address. */
const douglasSt: GeocoderProperties = {
  fullAddress: "1012 Douglas St, Victoria, BC",
  civicNumber: 1012,
  streetName: "Douglas",
  streetType: "St",
  streetDirection: "",
  localityName: "Victoria",
  localityType: "City",
  matchPrecision: "CIVIC_NUMBER",
};

/** A street in a locality that has no type: the design's "[Street] Ditidaht". */
const ditidahtStreet: GeocoderProperties = {
  fullAddress: "Ditidaht, Ditidaht, BC",
  civicNumber: "",
  streetName: "Ditidaht",
  streetType: "",
  streetDirection: "",
  localityName: "Ditidaht",
  localityType: "Unknown",
  matchPrecision: "STREET",
};

/** A street in a locality that does have a type. */
const kitimatAirport: GeocoderProperties = {
  fullAddress: "Kitimat Airport, Kitimat, BC",
  civicNumber: "",
  streetName: "Kitimat",
  streetType: "",
  streetDirection: "",
  localityName: "Kitimat",
  localityType: "District Municipality",
  matchPrecision: "STREET",
};

describe("placeName", () => {
  it("builds a civic address from its number and street", () => {
    expect(placeName(douglasSt)).toBe("1012 Douglas St");
  });

  it("includes a street direction when there is one", () => {
    expect(
      placeName({ ...douglasSt, streetDirection: "W" }),
    ).toBe("1012 Douglas St W");
  });

  it("falls back to the street when there is no civic number", () => {
    expect(placeName(kitimatAirport)).toBe("Kitimat");
  });

  it("falls back to the locality when there is no street", () => {
    expect(placeName(carpenterLake)).toBe("Carpenter Lake");
  });

  it("falls back to the leading part of fullAddress as a last resort", () => {
    expect(
      placeName({ fullAddress: "Somewhere Odd, BC", localityName: "" }),
    ).toBe("Somewhere Odd");
  });

  it("does not title a civic number that has no street to number", () => {
    expect(
      placeName({ civicNumber: 1012, localityName: "Victoria" }),
    ).toBe("Victoria");
  });
});

describe("placePill", () => {
  it("uses localityType verbatim, whatever it says", () => {
    expect(placePill(douglasSt)).toBe("City");
    expect(placePill(kitimatAirport)).toBe("District Municipality");
    expect(placePill({ ...carpenterLake, localityType: "Indian Reserve" })).toBe(
      "Indian Reserve",
    );
  });

  // The service sends the literal word rather than an empty string, and sends it
  // often — this is what makes the design's "[Street] Ditidaht" come out right.
  it("treats the literal 'Unknown' as no type at all", () => {
    expect(placePill(carpenterLake)).toBe("Locality");
    expect(placePill(ditidahtStreet)).toBe("Street");
  });

  it("maps each match precision when the locality has no type", () => {
    const bare = { localityType: "" };
    expect(placePill({ ...bare, matchPrecision: "CIVIC_NUMBER" })).toBe("Address");
    expect(placePill({ ...bare, matchPrecision: "BLOCK" })).toBe("Block");
    expect(placePill({ ...bare, matchPrecision: "STREET" })).toBe("Street");
    expect(placePill({ ...bare, matchPrecision: "LOCALITY" })).toBe("Locality");
  });

  it("has no pill rather than a raw code or a placeholder word", () => {
    expect(placePill({})).toBeNull();
    expect(placePill({ matchPrecision: "SOMETHING_NEW" })).toBeNull();
    expect(placePill({ localityType: "Unknown", matchPrecision: "" })).toBeNull();
  });
});

describe("placeLocality", () => {
  it("names the locality beside an address", () => {
    expect(placeLocality(douglasSt)).toBe("Victoria");
  });

  // "Carpenter Lake / Carpenter Lake" is what this rule exists to prevent.
  it("does not repeat a bare locality's own name", () => {
    expect(placeLocality(carpenterLake)).toBeNull();
  });

  // The title and the locality agreeing is fine when the title is a street:
  // this is the design's own example.
  it("still shows it when a street shares its locality's name", () => {
    expect(placeLocality(ditidahtStreet)).toBe("Ditidaht");
  });
});

describe("placeZoom", () => {
  it("frames an address closer than a street, and a street closer than a locality", () => {
    expect(placeZoom("CIVIC_NUMBER")).toBeGreaterThan(placeZoom("STREET"));
    expect(placeZoom("STREET")).toBeGreaterThan(placeZoom("LOCALITY"));
  });

  it("falls back for a precision it does not know", () => {
    expect(placeZoom("SOMETHING_NEW")).toBe(DEFAULT_PLACE_ZOOM);
    expect(placeZoom(undefined)).toBe(DEFAULT_PLACE_ZOOM);
  });
});

describe("toPlaceResults", () => {
  // `null` means a feature the geocoder located nowhere. Not `undefined`, which
  // a default parameter would quietly replace with the coordinate below.
  const feature = (
    properties: GeocoderProperties,
    coordinates: [number, number] | null = [-123.3, 48.4],
  ) => ({ properties, geometry: coordinates ? { coordinates } : undefined });

  it("reduces a response to drawable rows", () => {
    const [place] = toPlaceResults({ features: [feature(douglasSt)] });

    expect(place).toEqual({
      id: "place-0",
      name: "1012 Douglas St",
      pill: "City",
      locality: "Victoria",
      coordinates: [-123.3, 48.4],
      zoom: placeZoom("CIVIC_NUMBER"),
    });
  });

  // The geocoder has no "no results" response: a query it cannot place comes
  // back as one province-wide feature, which was being suggested for "tmo",
  // "zzzzz" and everything else that matched nothing.
  it("drops the province-wide feature the geocoder returns for a non-match", () => {
    const nonMatch: GeocoderProperties = {
      fullAddress: "BC Harbours Board Rwy, Surrey, BC",
      civicNumber: "",
      streetName: "BC Harbours Board",
      streetType: "Rwy",
      streetDirection: "",
      localityName: "Surrey",
      localityType: "City",
      matchPrecision: "PROVINCE",
    };

    expect(toPlaceResults({ features: [feature(nonMatch)] })).toEqual([]);
  });

  it("drops a feature with no coordinate, which could not be flown to", () => {
    expect(
      toPlaceResults({ features: [feature(douglasSt, null)] }),
    ).toHaveLength(0);
  });

  // Results are passed through verbatim, so two rows may agree on everything
  // shown. The index is what keeps their ids apart.
  it("gives every row its own id even when two look identical", () => {
    const places = toPlaceResults({
      features: [feature(carpenterLake), feature(carpenterLake)],
    });

    expect(places.map((place) => place.id)).toEqual(["place-0", "place-1"]);
  });

  it("survives a response with no features", () => {
    expect(toPlaceResults({})).toEqual([]);
    expect(toPlaceResults(undefined)).toEqual([]);
  });
});

describe("matchProjects", () => {
  const project = (
    id: number,
    name: string,
    typeId: number | null = 1,
  ): MapProject => ({
    id,
    name,
    latitude: 50,
    longitude: -123,
    typeId,
    regionId: null,
    certificateIssued: false,
    inProgressWorks: false,
    isClosed: false,
  });

  const types: FilterOption[] = [
    { id: 1, name: "Water Management" },
    { id: 2, name: "Mines" },
  ];

  const projects = [
    project(1, "Caribou Gas Processing Plant"),
    project(2, "Caribou Gold Project", 2),
    project(3, "Kitimat LNG"),
  ];

  it("matches a substring of the name, ignoring case", () => {
    expect(
      matchProjects(projects, types, "caribou").map((match) => match.name),
    ).toEqual(["Caribou Gas Processing Plant", "Caribou Gold Project"]);
  });

  it("resolves the type id against Track's code table", () => {
    const [gas, gold] = matchProjects(projects, types, "caribou");
    expect(gas.type).toBe("Water Management");
    expect(gold.type).toBe("Mines");
  });

  it("has no type rather than a wrong one when Track holds none", () => {
    const untyped = [project(4, "Untyped Project", null)];
    expect(matchProjects(untyped, types, "untyped")[0].type).toBeNull();
    // A type id the code table does not carry is equally not a name.
    const unknown = [project(5, "Unknown Type Project", 99)];
    expect(matchProjects(unknown, types, "unknown")[0].type).toBeNull();
  });

  it("carries coordinates in [lng, lat] order, as the map wants them", () => {
    expect(matchProjects(projects, types, "kitimat")[0]).toMatchObject({
      coordinates: [-123, 50],
      zoom: PROJECT_ZOOM,
    });
  });

  it("has no coordinates rather than a point at null island", () => {
    const placeless = [{ ...project(6, "Placeless"), latitude: null }];
    expect(matchProjects(placeless, types, "placeless")[0].coordinates).toBeNull();
  });

  it("matches nothing on an empty query", () => {
    expect(matchProjects(projects, types, "   ")).toEqual([]);
  });

  it("stops at the limit", () => {
    expect(matchProjects(projects, types, "caribou", 1)).toHaveLength(1);
  });
});

describe("toRows", () => {
  it("puts projects before places, as the dropdown draws them", () => {
    const places = toPlaceResults({
      features: [{ properties: carpenterLake, geometry: { coordinates: [-122, 50] } }],
    });
    const projects = matchProjects(
      [
        {
          id: 1,
          name: "Carpenter Project",
          latitude: 50,
          longitude: -123,
          typeId: null,
          regionId: null,
          certificateIssued: false,
          inProgressWorks: false,
          isClosed: false,
        },
      ],
      [],
      "carpenter",
    );

    expect(toRows(projects, places).map((row) => row.kind)).toEqual([
      "project",
      "place",
    ]);
  });
});

describe("steppedIndex", () => {
  it("starts at the first row", () => {
    expect(steppedIndex(-1, 1, 3)).toBe(0);
  });

  it("walks down and back up", () => {
    expect(steppedIndex(0, 1, 3)).toBe(1);
    expect(steppedIndex(2, -1, 3)).toBe(1);
  });

  // Up from the first row returns to the input rather than leaving the list,
  // so the user can get back to their own typing without closing the dropdown.
  it("returns to the input above the first row", () => {
    expect(steppedIndex(0, -1, 3)).toBe(-1);
  });

  it("wraps at both ends through the input", () => {
    expect(steppedIndex(2, 1, 3)).toBe(0);
    expect(steppedIndex(-1, -1, 3)).toBe(2);
  });

  it("has nothing to activate in an empty list", () => {
    expect(steppedIndex(-1, 1, 0)).toBe(-1);
    expect(steppedIndex(-1, -1, 0)).toBe(-1);
  });
});

describe("splitOnMatches", () => {
  it("alternates unmatched and matched runs", () => {
    expect(splitOnMatches("Caribou Gold", "cari")).toEqual([
      "",
      "Cari",
      "bou Gold",
    ]);
  });

  it("keeps the text's own casing on a matched run", () => {
    expect(splitOnMatches("Caribou", "CARIBOU")).toEqual(["", "Caribou", ""]);
  });

  it("finds every occurrence", () => {
    expect(splitOnMatches("aXaXa", "a")).toEqual(["", "a", "X", "a", "X", "a", ""]);
  });

  it("returns the whole string unmatched for an empty query", () => {
    expect(splitOnMatches("Caribou", "")).toEqual(["Caribou"]);
  });
});
