import {
  localFeatureRef,
  type LocalFeatureDetail,
  type LocalFeatureQuery,
} from "@/api/useLocalLayerFeatures";
import type {
  MetaDataAttribute,
  MetaDataLayer,
  MetaDataRecord,
  MetaDataRow,
} from "@/components/MetaData/metaDataUtils";
import { PIP_OBJECT_NAME } from "@/utils/localLayers";

/**
 * What the popup shows for a layer map-api hosts.
 *
 * The click is answered in two halves. Which features are under the pointer is
 * answered by the map, from tiles it already has; what is recorded against them
 * comes from map-api, because the tile carries only what the style matches on.
 * This turns the pair into the rows the popup lists.
 */

/** One hosted feature under a click, as the map reported it. */
export interface LocalHit {
  key: string;
  name: string;
}

const text = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const string = String(value).trim();
  return string === "" ? null : string;
};

/** A contact's postal address on one line, skipping the parts it has none of. */
const postalAddress = (contact: Record<string, unknown>): string | null => {
  const line = [
    contact.address,
    contact.city,
    contact.province,
    contact.postalCode,
  ]
    .map(text)
    .filter(Boolean)
    .join(", ");
  return line === "" ? null : line;
};

/**
 * The warehouse's organisation types, as a reader would say them.
 *
 * ORGANIZATION_TYPE is stored as a code, and "TRIBALCOUNCIL" in a field headed
 * Type is the data showing through. Anything not listed is shown as it is
 * stored, which is better than hiding a type we have not met yet.
 */
const ORGANIZATION_TYPES: Readonly<Record<string, string>> = {
  BAND: "Band",
  HOUSE: "House",
  TRIBALCOUNCIL: "Tribal Council",
  FIRST_NATION_GROUP: "First Nation Group",
};

const organizationType = (value: unknown): string | null => {
  const code = text(value);
  return code === null ? null : ORGANIZATION_TYPES[code] ?? code;
};

/**
 * One nation's entry on a consultation area.
 *
 * Six fields rather than everything the record holds: the rest is either
 * identifiers nobody reads or contact details that have not been reviewed for
 * display, including the private comment field, which stays out of the UI.
 *
 * A field this nation has no value for is left out rather than shown empty: the
 * grid is short enough that a missing phone number reads as missing, and a
 * column of dashes reads as a fault in the data.
 *
 * Source and Contact Type are the area's rather than the contact's. They repeat
 * across the nations on one area because that is what they describe - the
 * warehouse records one mapping source and one contact type per area - and they
 * belong beside the contact who is being looked at.
 */
const pipAttributes = (
  detail: LocalFeatureDetail,
  contact: Record<string, unknown>,
): MetaDataAttribute[] =>
  [
    {
      label: "Nation / Council",
      // The organisation, or the person recorded where there is none.
      value: text(contact.organizationName) ?? text(contact.contactName),
    },
    { label: "Type", value: organizationType(contact.organizationType) },
    { label: "Source", value: text(detail.mapSource) },
    { label: "Contact Type", value: text(detail.contactType) },
    { label: "Address", value: postalAddress(contact) },
    { label: "Phone", value: text(contact.phoneNumber) },
  ].filter((attribute) => attribute.value !== null);

/**
 * The records on one hosted feature.
 *
 * A consultation area is one shape with a contact per nation, so it is several
 * records over one geometry - the case the pager in the detail exists for.
 */
export const localRecords = (
  objectName: string,
  detail: LocalFeatureDetail,
): MetaDataRecord[] => {
  // One hosted layer, so one mapping. A second would bring its own, and the
  // guess that used to stand in for it - every scalar field, labelled by
  // de-camel-casing its name - read as a layer nobody had got to yet rather
  // than as a layer that was finished.
  if (objectName !== PIP_OBJECT_NAME) return [];

  const contacts = detail.contacts ?? [];
  if (contacts.length === 0) return [];

  return contacts.map((contact, index) => ({
    id: text(contact.contactGuid) ?? String(index),
    attributes: pipAttributes(detail, contact),
  }));
};

/**
 * One row for a hosted layer, holding every feature the click landed on.
 *
 * Several where outlines overlap, which on the consultation areas is the norm
 * rather than the exception.
 */
export const localRows = (
  layer: MetaDataLayer,
  objectName: string,
  hits: readonly LocalHit[],
  details: Readonly<Record<string, LocalFeatureQuery>>,
): MetaDataRow[] => {
  if (hits.length === 0) return [];

  return [
    {
      layer,
      status: "found",
      retrying: false,
      features: hits.map((hit) => {
        const answer = details[localFeatureRef(objectName, hit.key)];
        const detail = answer?.detail ?? null;
        return {
          key: hit.key,
          name: hit.name,
          records: detail ? localRecords(objectName, detail) : [],
          // The tile's key is the feature's identity on both sides.
          id: hit.key,
          // Highlighted by filtering its own tiles, not from a copy of its
          // shape: see showLocalHighlight.
          geometry: null,
          bounds: detail?.bounds ?? null,
          pending: Boolean(answer?.isPending),
          failed: Boolean(answer?.isError),
        };
      }),
    },
  ];
};
