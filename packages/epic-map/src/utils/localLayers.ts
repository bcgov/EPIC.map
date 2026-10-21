/**
 * The layers map-api hosts itself, as the panel needs to know them.
 *
 * Mirrors LOCAL_LAYERS on the server, repeated here because a hosted layer is
 * drawn, identified and labelled differently from a warehouse one, and those
 * decisions are made before any request goes out.
 *
 * Keyed on the object name, which both sides call them, rather than the
 * favourite's row id, which differs per user.
 */

export interface HostedLayerSpec {
  objectName: string;
  /**
   * The BC Data Catalogue page, or null where there is none.
   *
   * map-api seeds the favourite with an empty package, having only an object
   * name, but the dataset is published and "View full metadata" should open
   * it. By slug, which is as stable as the uuid and readable besides.
   */
  metadataUrl: string | null;
  /** What the dataset is, for the expanded layer info. */
  description: string | null;
  /** The tile property identifying a feature, as the detail endpoint keys on. */
  keyProperty: string;
  /** The tile property the popup names a feature by. */
  nameProperty: string;
  /** What one set of attributes is called: "Nation 3 of 12" in the pager. */
  recordNoun: string;
  /**
   * Whether the layer is drawn whatever the panel says.
   *
   * True for the EAO footprints, which are how a project is represented on the
   * map: they follow the filter bar, have no row in the panel and cannot be
   * switched off. A reference layer like PIP is starred, listed and toggled.
   */
  alwaysDrawn?: boolean;
}

export const PIP_OBJECT_NAME = "WHSE_ADMIN_BOUNDARIES.PIP_CONSULTATION_AREAS_SP";
export const EAO_OBJECT_NAME = "EAO.PROJECT_DATA";

/** Every layer served from map-api rather than from openmaps. */
export const HOSTED_LAYERS: readonly HostedLayerSpec[] = [
  {
    objectName: PIP_OBJECT_NAME,
    keyProperty: "cnsltn_area_guid",
    nameProperty: "cnsltn_area_name",
    recordNoun: "Nation",
    metadataUrl:
      "https://catalogue.data.gov.bc.ca/dataset/" +
      "profiles-of-indigenous-people-pip-first-nation-consultation-areas",
    // The warehouse's own words for the layer, which is what the catalogue page
    // the link above opens says.
    description:
      "This layer geographically depicts, as understood by the Province, " +
      "where a First Nation has treaty or established or is asserting " +
      "aboriginal rights or title. It identifies geographically where the " +
      "duty to consult with First Nations may be triggered, based on where " +
      "the Crown has knowledge of an asserted or established aboriginal or " +
      "treaty right.",
  },
  {
    objectName: EAO_OBJECT_NAME,
    keyProperty: "feature_id",
    nameProperty: "label",
    recordNoun: "Feature",
    // The footprint is how a project is drawn, not a layer to opt into: it is
    // on whenever the map is, and the filter bar is what hides it.
    alwaysDrawn: true,
    // Not a catalogue dataset: EAO delivers it to us directly, so there is no
    // published page for "View full metadata" to open.
    metadataUrl: null,
    description:
      "Project footprints, project components and valued components for " +
      "projects under environmental assessment, as delivered by the EAO GIS " +
      "team. Each feature is linked to its EPIC.Track project.",
  },
];

export const LOCAL_LAYER_OBJECT_NAMES: readonly string[] = HOSTED_LAYERS.map(
  (layer) => layer.objectName,
);


/**
 * The panel's id for a hosted layer, spelled as the favourites list gives it,
 * so the row, the map layer and the popup address one layer by one name.
 */
export const localLayerId = (objectName: string): string =>
  `local-${objectName}`;

/** Whether this layer is drawn whatever the panel says. */
export const isAlwaysDrawn = (objectName: string | null | undefined): boolean =>
  Boolean(hostedLayer(objectName)?.alwaysDrawn);

/** The hosted layer this object name names, or undefined for any other. */
export const hostedLayer = (
  objectName: string | null | undefined,
): HostedLayerSpec | undefined =>
  HOSTED_LAYERS.find((layer) => layer.objectName === objectName);

/** Whether this layer is drawn from our own vector tiles. */
export const isLocalLayer = (objectName: string | null | undefined): boolean =>
  Boolean(hostedLayer(objectName));

/** What to call one set of attributes on a feature of this layer. */
export const recordNoun = (objectName: string | null | undefined): string =>
  hostedLayer(objectName)?.recordNoun ?? "Record";
