-- What the ingest reads out of the extract, and the only file that changes if
-- the source format changes again.
--
-- Everything the warehouse publishes for this layer is carried, contact details
-- included: names, addresses, phone and fax numbers, email addresses, and both
-- the public and private comments. That is deliberate. The layer is served only
-- to callers holding an IDIR token, which is the protection this data is
-- required to have, and the people using the map need the contacts - a
-- consultation area without a way to reach the nation is half an answer.
--
-- The two fields that are not carried are FEATURE_AREA_SQM and FEATURE_LENGTH_M
-- from the source, which PostGIS recomputes from the geometry more accurately
-- than a copied number stays true.
--
-- Read FirstNationsOutlines by name. The GeoPackage also carries
-- FirstNationsLabels, which is a byte-for-byte duplicate of it - same geometry
-- blobs in the same row order, 36.6MB - and letting the layer default would
-- load both.
SELECT
    -- Named explicitly: under the SQLITE dialect the geometry is carried only
    -- if it is selected, and a SELECT without it loads every row with a null
    -- shape and no complaint from ogr2ogr. `-lco GEOMETRY_NAME=geom` is what
    -- renames it on the way into PostgreSQL.
    Shape,

    -- Per area. These are the same on every row of a group, which is what lets
    -- the transform fold them onto one row without choosing.
    CNSLTN_AREA_GUID,
    -- What the .lyrx keys its 299 classes on. Values can carry a trailing
    -- space, which is real and matches the style; do not trim anywhere.
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

    -- Per contact. These differ between the rows of a group, so the transform
    -- collects them into one JSON record each rather than folding them away.
    -- ORGANIZATION_TYPE is in here for that reason: 21 areas have contacts of
    -- more than one type, so it is not a property of the area.
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
    -- 4000 characters in the GeoPackage, and truncated to 254 in the shapefile
    -- this layer first arrived as. Four rows were cut mid-sentence there, one
    -- of them through a URL.
    PUBLIC_CONTACT_COMMENT,
    PRIVATE_CONTACT_COMMENT,
    CONTACT_METADATA,
    CONTACT_ADDITIONAL_INFORMATION
FROM FirstNationsOutlines
