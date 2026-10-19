import { describe, expect, it } from "vitest";
import {
  localFeatureRef,
  type LocalFeatureQuery,
} from "@/api/useLocalLayerFeatures";
import { localRecords, localRows } from "@/components/MetaData/localRows";
import { PIP_OBJECT_NAME, recordNoun } from "@/utils/localLayers";

const AREA_KEY = "44AD0BF7899D42CDBFC9597FA963A1CE";

const layer = {
  id: `local-${PIP_OBJECT_NAME}`,
  name: "Profiles of Indigenous People (PIP) - First Nation Consultation Areas",
  objectName: PIP_OBJECT_NAME,
};

/** One consultation area as map-api returns it, with two nations on it. */
const detail = {
  name: "Treaty 8 Area",
  mapSource: "Mapped by EAO",
  contactType: "Consultation Area Contact",
  bounds: [-123, 49, -122, 50] as [number, number, number, number],
  contacts: [
    {
      contactGuid: "C1",
      organizationName: "Doig River First Nation",
      organizationType: "First Nation",
      address: "PO Box 56",
      city: "Rose Prairie",
      province: "BC",
      postalCode: "V0C 2H0",
      phoneNumber: "2508277799",
      // Not served any more: the ingest leaves it in the warehouse and the
      // schema would drop it. Kept here because this mapping is a guard of its
      // own, and a stored row from an older load could still carry it.
      privateComment: "Not for display",
    },
    {
      contactGuid: "C2",
      organizationName: "Blueberry River First Nations",
      organizationType: "First Nation",
      address: null,
      city: "Buick",
      province: "BC",
      postalCode: null,
      phoneNumber: null,
    },
  ],
};

const answered = (
  state: Partial<LocalFeatureQuery> = {},
): Record<string, LocalFeatureQuery> => ({
  [localFeatureRef(PIP_OBJECT_NAME, AREA_KEY)]: {
    detail,
    isPending: false,
    isError: false,
    retry: () => undefined,
    ...state,
  },
});

describe("localRecords, for the consultation areas", () => {
  it("is one record per nation on the area", () => {
    expect(localRecords(PIP_OBJECT_NAME, detail)).toHaveLength(2);
  });

  it("has nothing to say about a layer it has no mapping for", () => {
    // A second hosted layer brings its own field mapping. Until it does, no
    // records is the honest answer - the fallback that used to list every
    // scalar field here rendered as a finished layer with odd labels.
    expect(localRecords("WHSE_SOMETHING.ELSE_SP", detail)).toEqual([]);
  });

  it("shows the six fields the design asks for, in that order", () => {
    const [first] = localRecords(PIP_OBJECT_NAME, detail);

    expect(first.attributes.map((one) => one.label)).toEqual([
      "Nation / Council",
      "Type",
      "Source",
      "Contact Type",
      "Address",
      "Phone",
    ]);
  });

  it("leaves out a field this nation has no value for", () => {
    const [, second] = localRecords(PIP_OBJECT_NAME, detail);

    // The second nation has no phone number recorded.
    expect(second.attributes.map((one) => one.label)).not.toContain("Phone");
  });

  it("reads the nation and its contact details off that nation's record", () => {
    const [first, second] = localRecords(PIP_OBJECT_NAME, detail);
    const value = (record: typeof first, label: string) =>
      record.attributes.find((one) => one.label === label)?.value;

    expect(value(first, "Nation / Council")).toBe("Doig River First Nation");
    expect(value(first, "Phone")).toBe("2508277799");
    expect(value(second, "Nation / Council")).toBe(
      "Blueberry River First Nations",
    );
    // Nothing of the first nation's carries over to the second.
    expect(value(second, "Phone")).toBeUndefined();
  });

  it("reads Source and Contact Type off the area, which is what they describe", () => {
    const [first, second] = localRecords(PIP_OBJECT_NAME, detail);
    const value = (record: typeof first, label: string) =>
      record.attributes.find((one) => one.label === label)?.value;

    expect(value(first, "Source")).toBe("Mapped by EAO");
    expect(value(second, "Source")).toBe("Mapped by EAO");
    expect(value(first, "Contact Type")).toBe("Consultation Area Contact");
  });

  it("writes the address as one line, leaving out what is missing", () => {
    const [first, second] = localRecords(PIP_OBJECT_NAME, detail);
    const address = (record: typeof first) =>
      record.attributes.find((one) => one.label === "Address")?.value;

    expect(address(first)).toBe("PO Box 56, Rose Prairie, BC, V0C 2H0");
    expect(address(second)).toBe("Buick, BC");
  });

  it("keeps the private comment out of the popup", () => {
    const labels = localRecords(PIP_OBJECT_NAME, detail).flatMap((record) =>
      record.attributes.map((one) => one.label),
    );

    expect(labels).not.toContain("Private comment");
    expect(
      localRecords(PIP_OBJECT_NAME, detail).flatMap((record) =>
        record.attributes.map((one) => one.value),
      ),
    ).not.toContain("Not for display");
  });

  it("has no records for an area with no contacts, rather than an empty one", () => {
    expect(localRecords(PIP_OBJECT_NAME, { ...detail, contacts: [] })).toEqual([]);
  });

  it("calls a record a Nation here, and a Record anywhere else", () => {
    expect(recordNoun(PIP_OBJECT_NAME)).toBe("Nation");
    expect(recordNoun("WHSE_TEST.SOMETHING")).toBe("Record");
  });
});

describe("localRows", () => {
  const hits = [{ key: AREA_KEY, name: "Treaty 8 Area" }];

  it("puts every feature the click hit under the one layer", () => {
    const [row] = localRows(layer, PIP_OBJECT_NAME, hits, answered());

    expect(row.layer.name).toBe(
      "Profiles of Indigenous People (PIP) - First Nation Consultation Areas",
    );
    expect(row.features.map((one) => one.name)).toEqual(["Treaty 8 Area"]);
    expect(row.features[0].records).toHaveLength(2);
  });

  it("carries the bounds the zoom needs, which no tile could tell it", () => {
    const [row] = localRows(layer, PIP_OBJECT_NAME, hits, answered());

    expect(row.features[0].bounds).toEqual([-123, 49, -122, 50]);
  });

  it("marks a feature whose records are still on their way", () => {
    const [row] = localRows(
      layer,
      PIP_OBJECT_NAME,
      hits,
      answered({ detail: null, isPending: true }),
    );

    expect(row.features[0].pending).toBe(true);
    expect(row.features[0].records).toEqual([]);
  });

  it("marks a feature whose records could not be fetched, for the Retry", () => {
    const [row] = localRows(
      layer,
      PIP_OBJECT_NAME,
      hits,
      answered({ detail: null, isError: true }),
    );

    expect(row.features[0].failed).toBe(true);
  });

  it("lists no layer at all when the click hit none of its features", () => {
    expect(localRows(layer, PIP_OBJECT_NAME, [], {})).toEqual([]);
  });
});

describe("localRecords, reading one nation's own fields", () => {
  const withContact = (contact: Record<string, unknown>) => ({
    ...detail,
    contacts: [contact],
  });
  const valueOf = (contact: Record<string, unknown>, label: string) =>
    localRecords(PIP_OBJECT_NAME, withContact(contact))[0].attributes.find(
      (one) => one.label === label,
    )?.value;

  it("says the organisation type in words, not the warehouse's code", () => {
    expect(valueOf({ organizationType: "TRIBALCOUNCIL" }, "Type")).toBe(
      "Tribal Council",
    );
    expect(valueOf({ organizationType: "BAND" }, "Type")).toBe("Band");
  });

  it("shows a type it has not met as it is stored, rather than hiding it", () => {
    expect(valueOf({ organizationType: "TREATY_GROUP" }, "Type")).toBe(
      "TREATY_GROUP",
    );
  });

  it("names the contact where the record has no organisation", () => {
    expect(
      valueOf({ contactName: "Chief and Council" }, "Nation / Council"),
    ).toBe("Chief and Council");
  });
});
