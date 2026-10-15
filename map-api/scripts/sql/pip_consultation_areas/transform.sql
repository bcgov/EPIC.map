-- Turn the staged extract into one row per consultation area.
--
-- Runs inside the ingest's transaction, after validate.sql. No BEGIN or COMMIT
-- here: the ingest owns the transaction, so a file that fails anywhere leaves
-- the previous load intact.

TRUNCATE cache.pip_consultation_areas;

-- The extract is a flattened area x contact join: 415 rows, 298 areas. Folding
-- them drops ~2,283,000 vertices to ~1,530,000 and stops 19 translucent copies
-- of one outline stacking into an opaque one.
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
    -- min() over a value validate.sql has shown to be the same across the
    -- group. An aggregate because GROUP BY needs one, not a choice.
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
    -- Recomputed, not carried: these rows are in Web Mercator, where square
    -- metres are wrong by about three at BC latitudes. geography gives metres
    -- on the ellipsoid, and is defined only on lon/lat, hence the 4326.
    ST_Area(ST_Transform((array_agg(s.geom ORDER BY s.ogc_fid))[1], 4326)::geography),
    ST_Perimeter(ST_Transform((array_agg(s.geom ORDER BY s.ogc_fid))[1], 4326)::geography),
    count(*),
    -- One record per contact, nulls preserved: the GeoPackage distinguishes
    -- them where the old shapefile could not.
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
    -- Not ST_Union: the group holds the same polygon, not neighbouring ones,
    -- and unioning 19 copies costs an overlay that can move a vertex. Taking
    -- the first is exact, and validate.sql is what makes it safe.
    (array_agg(s.geom ORDER BY s.ogc_fid))[1]
FROM cache.pip_consultation_areas_src s
GROUP BY s.cnsltn_area_guid;

-- A simplified copy for the zooms where the province is a handful of tiles,
-- where ST_AsMVTGeom would otherwise read 1.5 million vertices to snap most of
-- them onto the same integer. 250 is metres in EPSG:3857, about 147m on the
-- ground at 54N: under a tile unit at z6, around one at z9, where the tile SQL
-- switches back. MakeValid because SimplifyPreserveTopology can emit a
-- degenerate ring.
UPDATE cache.pip_consultation_areas
   SET geom_generalized = ST_Multi(ST_CollectionExtract(
           ST_MakeValid(ST_SimplifyPreserveTopology(geom, 250)), 3));

-- The staging table and ANALYZE are the ingest's, after the commit: a DROP in
-- here would roll back with a dry run, and ANALYZE does nothing useful inside
-- a transaction.
