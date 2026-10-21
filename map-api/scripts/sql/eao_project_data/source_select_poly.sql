-- The polygon feature class, aliased into the one shape all three selects
-- stage into. The three classes spell the same fields differently, which is
-- why there is a select per class rather than one for the file.
--
-- EAOPoly gained GlobalID in the 16/10/2026 delivery, EAO having added Global
-- IDs to the feature class. Before that the polygons had no stable identity at
-- all, the shapefiles they arrive as being unable to carry one.
SELECT
    -- Named explicitly: the SQLITE dialect carries the geometry only if it is
    -- selected, and omitting it loads null shapes without complaint.
    Shape,

    'poly'       AS source_layer,
    TrackID      AS track_id,
    EngageId     AS engage_id,
    ProjectNam   AS project_name,
    Proponent    AS proponent,
    Category     AS category,
    Subcategor   AS subcategory,
    Component    AS component_type,
    Number       AS amendment_number,
    Label        AS label,
    Comment      AS comment,
    Footprint    AS footprint,
    Sensitived   AS sensitive,
    Datarestri   AS data_restriction,
    SourceofSp   AS source_of_spatial,
    GISAdjuste   AS gis_adjusted,
    GISComment   AS gis_comment,
    DateReceiv   AS date_received,
    FromEngage   AS from_engage,
    GlobalID     AS global_id
FROM EAOPoly
