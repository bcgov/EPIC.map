-- Turn the staged extract into one row per consultation area.
--
-- Runs after ogr2ogr has loaded cache.pip_consultation_areas_src and after
-- pip_validate.sql has passed, inside the ingest's transaction. It speaks only
-- the warehouse's real column names, so it does not change when the source
-- format does.
--
-- No BEGIN or COMMIT here: the ingest owns the transaction, so that validating
-- the extract, replacing the rows and storing the style either all happen or
-- none of them do. A file that fails anywhere leaves the previous load intact.

TRUNCATE cache.pip_consultation_areas;

-- The extract is a flattened area x contact join: 415 rows carrying 298
-- distinct areas, so Sto:lo Writ's 68,302-vertex polygon is stored 19 times and
-- Nlaka'pamux Writ's 16. Folding them takes roughly 2,283,000 vertices to
-- 1,530,000 and, more visibly, stops 19 translucent copies of one outline
-- stacking into an opaque one that reads far heavier than its neighbours.
INSERT INTO cache.pip_consultation_areas (
    cnsltn_area_guid, cnsltn_area_name, cnsltn_area_label,
    cnsltn_area_mapsource, cnsltn_area_verified_ind,
    cnsltn_area_low_confidence_ind, cnsltn_area_sensitivity,
    cnsltn_area_asserted_agg_ind, cnsltn_area_update_date,
    contact_type, feature_code, feature_area_sqm, feature_length_m,
    contact_count, contacts, geom
)
SELECT
    s.cnsltn_area_guid,
    -- min() over a value that is the same on every row of the group, which the
    -- check above has already established. It is an aggregate because the
    -- GROUP BY requires one, not because there is a choice being made.
    min(s.cnsltn_area_name),
    min(s.cnsltn_area_label),
    min(s.cnsltn_area_mapsource),
    min(s.cnsltn_area_verified_ind),
    min(s.cnsltn_area_low_confidence_ind),
    min(s.cnsltn_area_sensitivity),
    min(s.cnsltn_area_asserted_agg_ind),
    min(s.cnsltn_area_update_date),
    min(s.contact_type),
    min(s.feature_code),
    -- Recomputed rather than carried. The warehouse's own figures are in the
    -- extract, but these rows are stored in Web Mercator, where an area in
    -- square metres is wrong by a factor of about three at BC latitudes.
    -- Measuring on the geography type gives metres on the ellipsoid, which is
    -- what the column claims to hold. The transform to 4326 is required rather
    -- than cosmetic: geography is defined only on lon/lat.
    ST_Area(ST_Transform((array_agg(s.geom ORDER BY s.ogc_fid))[1], 4326)::geography),
    ST_Perimeter(ST_Transform((array_agg(s.geom ORDER BY s.ogc_fid))[1], 4326)::geography),
    count(*),
    -- One record per contact, in full. Nulls are preserved rather than turned
    -- into empty strings: the GeoPackage distinguishes them and the shapefile
    -- this layer first arrived as could not, so it is a distinction worth
    -- keeping now that we finally have it.
    jsonb_agg(
        jsonb_build_object(
            'contactGuid',          s.contact_guid,
            'contactUpdateDate',    s.contact_update_date,
            'organizationGuid',     s.organization_guid,
            'organizationType',     s.organization_type,
            'contactName',          s.contact_name,
            'contactTitle',         s.contact_title,
            'organizationName',     s.contact_organization_name,
            'address',              s.contact_address,
            'city',                 s.contact_city,
            'province',             s.contact_province,
            'postalCode',           s.contact_postal_code,
            'phoneNumber',          s.contact_phone_number,
            'faxNumber',            s.contact_fax_number,
            'emailAddress',         s.contact_email_address,
            'publicComment',        s.public_contact_comment,
            'privateComment',       s.private_contact_comment,
            'metadata',             s.contact_metadata,
            'additionalInformation', s.contact_additional_information
        ) ORDER BY s.contact_organization_name, s.contact_guid
    ),
    -- Not ST_Union. The rows of a group hold the same polygon rather than
    -- neighbouring ones, so there is nothing to merge, and unioning a
    -- 68,302-vertex polygon with 18 copies of itself costs a full overlay and
    -- can move a vertex. Taking the first is exact and free; the check above is
    -- what makes it safe.
    (array_agg(s.geom ORDER BY s.ogc_fid))[1]
FROM cache.pip_consultation_areas_src s
GROUP BY s.cnsltn_area_guid;

-- A simplified copy for the zooms where the whole province is a handful of
-- tiles. ST_AsMVTGeom otherwise reads every one of 1.5 million vertices before
-- snapping them onto a 4096-unit grid where most land on the same integer.
--
-- 250 is metres in EPSG:3857, which at 54N is about 147 metres on the ground -
-- well under one tile unit at z6, and around one at z9, which is where the tile
-- SQL switches back to full geometry. MakeValid and CollectionExtract because
-- SimplifyPreserveTopology can still emit a degenerate ring.
UPDATE cache.pip_consultation_areas
   SET geom_generalized = ST_Multi(ST_CollectionExtract(
           ST_MakeValid(ST_SimplifyPreserveTopology(geom, 250)), 3));

-- The staging table is dropped by the ingest after the transaction closes, not
-- here: on a dry run the transaction is rolled back, and a DROP inside it would
-- be rolled back with everything else, leaving the table behind anyway.
--
-- ANALYZE is left to the ingest too. It cannot run inside a transaction block
-- to any useful effect, so it belongs after the commit.
