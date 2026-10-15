-- What the ingest reads out of the extract. The only file that changes if the
-- source format changes again.
--
-- Every field is carried, contacts included: the layer needs an IDIR token to
-- reach, and a consultation area with no way to contact the nation is half an
-- answer. FEATURE_AREA_SQM and FEATURE_LENGTH_M are left out because PostGIS
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
    ORGANIZATION_GUID,
    ORGANIZATION_TYPE,
    CONTACT_GUID,
    CONTACT_UPDATE_DATE,
    CONTACT_NAME,
    CONTACT_TITLE,
    CONTACT_ORGANIZATION_NAME,
    CONTACT_ADDRESS,
    CONTACT_CITY,
    CONTACT_PROVINCE,
    CONTACT_POSTAL_CODE,
    CONTACT_PHONE_NUMBER,
    CONTACT_FAX_NUMBER,
    CONTACT_EMAIL_ADDRESS,
    -- 4000 characters here, truncated to 254 in the shapefile this layer first
    -- arrived as.
    PUBLIC_CONTACT_COMMENT,
    PRIVATE_CONTACT_COMMENT,
    CONTACT_METADATA,
    CONTACT_ADDITIONAL_INFORMATION
FROM FirstNationsOutlines
