-- What the ingest reads out of the extract. The only file that changes if the
-- source format changes again.
--
-- Per contact, only the fields the map shows. The extract also carries titles,
-- emails, fax numbers, organisation ids, both comment fields, metadata and
-- additional information, and none of it is drawn, searched or identified;
-- PRIVATE_CONTACT_COMMENT is not ours to publish at all. A field that is never
-- selected cannot be served by mistake, and the gate in front of this layer is
-- an IDIR token in the realm rather than a decision about who may read contact
-- details. Adding one back is a line here, a line in transform.sql, a line in
-- the schema, and the next daily load.
--
-- FEATURE_AREA_SQM and FEATURE_LENGTH_M are left out because PostGIS
-- recomputes them from the geometry.
--
-- FirstNationsOutlines by name: the GeoPackage also holds FirstNationsLabels,
-- a byte-for-byte duplicate, and the default would load both.
SELECT
    -- Named explicitly: the SQLITE dialect carries the geometry only if it is
    -- selected, and omitting it loads null shapes without complaint.
    Shape,

    -- Per area: the same on every row of a group, so the transform can fold
    -- them onto one row without choosing.
    CNSLTN_AREA_GUID,
    -- What the .lyrx keys its 299 classes on. A trailing space here is real
    -- and matches the style; do not trim.
    CNSLTN_AREA_NAME,
    CNSLTN_AREA_LABEL,
    CNSLTN_AREA_MAPSOURCE,
    CNSLTN_AREA_VERIFIED_IND,
    CNSLTN_AREA_LOW_CONFIDENCE_IND,
    CNSLTN_AREA_SENSITIVITY,
    CNSLTN_AREA_ASSERTED_AGG_IND,
    CNSLTN_AREA_UPDATE_DATE,
    CONTACT_TYPE,
    FEATURE_CODE,

    -- Per contact: these differ within a group, so the transform collects one
    -- JSON record each. ORGANIZATION_TYPE included, because 21 areas have
    -- contacts of more than one type.
    ORGANIZATION_TYPE,
    -- The identity the popup pages the nations by, not a contact detail.
    CONTACT_GUID,
    -- CONTACT_NAME because an area whose record names a person rather than an
    -- organisation would otherwise have nothing to show.
    CONTACT_NAME,
    CONTACT_ORGANIZATION_NAME,
    CONTACT_ADDRESS,
    CONTACT_CITY,
    CONTACT_PROVINCE,
    CONTACT_POSTAL_CODE,
    CONTACT_PHONE_NUMBER
FROM FirstNationsOutlines
