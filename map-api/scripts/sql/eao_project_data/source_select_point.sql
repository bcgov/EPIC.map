-- The point feature class, whose field names differ from the other two: it
-- spells them Project_Na, Sub_catego, Date_recei, GIS_Adjust, GIS_Commen,
-- Sensitive_, Data_restr and Source_of_, and calls Number "Amendment".
--
-- It has no Footprint column at all, so the footprint branch of the category
-- rule cannot apply here - which matches the prototype, where points take the
-- component colours only.
SELECT
    Shape,

    'point'      AS source_layer,
    TrackID      AS track_id,
    EngageId     AS engage_id,
    Project_Na   AS project_name,
    Proponent    AS proponent,
    Category     AS category,
    Sub_catego   AS subcategory,
    Component    AS component_type,
    Amendment    AS amendment_number,
    Label        AS label,
    Comment      AS comment,
    NULL         AS footprint,
    Sensitive_   AS sensitive,
    Data_restr   AS data_restriction,
    Source_of_   AS source_of_spatial,
    GIS_Adjust   AS gis_adjusted,
    GIS_Commen   AS gis_comment,
    Date_recei   AS date_received,
    FromEngage   AS from_engage,
    GlobalID     AS global_id
FROM EAOPoint
