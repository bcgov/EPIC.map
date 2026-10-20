-- The line feature class. Same shape as the polygon select; the only
-- difference is the class name.
--
-- Footprint is selected but the transform does not apply it to lines: the
-- prototype gives line features the component colours only. One feature in
-- the first delivery is flagged.
SELECT
    Shape,

    'line'       AS source_layer,
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
FROM EAOLine
