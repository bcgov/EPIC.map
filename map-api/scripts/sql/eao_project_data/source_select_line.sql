-- The line feature class. Same shape as the polygon select; the differences
-- are the class name and the id column.
--
-- The id is GlobalID_1 since the 06/11/2026 delivery, which also regenerated
-- every line's value. ArcGIS cannot rename the field, so it is read as
-- delivered; a further rename most likely means new ids, and should fail here.
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
    GlobalID_1   AS global_id
FROM EAOLine
