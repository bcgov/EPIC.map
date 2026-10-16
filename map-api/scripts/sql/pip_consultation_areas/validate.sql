-- What must be true of a staged extract before it may replace the stored one.
--
-- Runs inside the ingest's transaction before anything is written, so a
-- failure leaves the previous load untouched. These are the checks that are
-- true or false on their own terms; anything needing comparison against what
-- is stored is decided in Python, where it can have a threshold.

-- The extract loaded at all: ogr2ogr reports success for a file it found
-- nothing in.
DO $$
DECLARE staged bigint;
BEGIN
    SELECT count(*) INTO staged FROM cache.pip_consultation_areas_src;
    IF staged = 0 THEN
        RAISE EXCEPTION 'the extract staged no rows at all';
    END IF;
END $$;

-- Geometry on every row, and geometry PostGIS accepts. A select that forgot
-- the geometry column loads null shapes without complaint.
DO $$
DECLARE bad bigint;
BEGIN
    SELECT count(*) INTO bad
    FROM cache.pip_consultation_areas_src
    WHERE geom IS NULL OR ST_IsEmpty(geom) OR NOT ST_IsValid(geom);

    IF bad > 0 THEN
        RAISE EXCEPTION
            '% staged rows have a missing, empty or invalid geometry', bad;
    END IF;
END $$;

-- The projection the rest of the pipeline assumes. ST_AsMVTGeom needs both
-- its arguments in one SRS, and a mismatch draws an empty map, not a wrong
-- one, which takes longer to notice.
DO $$
DECLARE wrong bigint;
BEGIN
    SELECT count(*) INTO wrong
    FROM cache.pip_consultation_areas_src
    WHERE ST_SRID(geom) <> 3857;

    IF wrong > 0 THEN
        RAISE EXCEPTION
            '% staged rows are not in EPSG:3857; check the -t_srs argument', wrong;
    END IF;
END $$;

-- The identifiers the rest depends on: the GUID is the key it groups by, and
-- a blank name draws in the style's default symbol and looks deliberate.
DO $$
DECLARE bad bigint;
BEGIN
    SELECT count(*) INTO bad
    FROM cache.pip_consultation_areas_src
    WHERE cnsltn_area_guid IS NULL OR btrim(cnsltn_area_guid) = ''
       OR cnsltn_area_name IS NULL OR btrim(cnsltn_area_name) = '';

    IF bad > 0 THEN
        RAISE EXCEPTION
            '% staged rows are missing a consultation area id or name', bad;
    END IF;
END $$;

-- One name per GUID and one GUID per name: the transform folds the name with
-- min(), and the style keys on it, so a shared name is two indistinguishable
-- areas.
DO $$
DECLARE ambiguous bigint;
BEGIN
    SELECT count(*) INTO ambiguous FROM (
        SELECT cnsltn_area_guid
        FROM cache.pip_consultation_areas_src
        GROUP BY cnsltn_area_guid
        HAVING count(DISTINCT cnsltn_area_name) > 1
    ) t;
    IF ambiguous > 0 THEN
        RAISE EXCEPTION '% consultation area ids carry more than one name', ambiguous;
    END IF;

    SELECT count(*) INTO ambiguous FROM (
        SELECT cnsltn_area_name
        FROM cache.pip_consultation_areas_src
        GROUP BY cnsltn_area_name
        HAVING count(DISTINCT cnsltn_area_guid) > 1
    ) t;
    IF ambiguous > 0 THEN
        RAISE EXCEPTION '% consultation area names are used by more than one id', ambiguous;
    END IF;
END $$;

-- The rows of a group carry the same polygon, which is what makes keeping one
-- exact rather than a choice. Checked because the warehouse does not promise
-- it.
DO $$
DECLARE disagreeing bigint;
BEGIN
    SELECT count(*) INTO disagreeing FROM (
        SELECT cnsltn_area_guid
        FROM cache.pip_consultation_areas_src
        GROUP BY cnsltn_area_guid
        HAVING count(DISTINCT md5(ST_AsBinary(geom))) > 1
    ) t;

    IF disagreeing > 0 THEN
        RAISE EXCEPTION
            '% consultation areas carry more than one geometry; the '
            'representative-geometry dedupe is not valid for this extract',
            disagreeing;
    END IF;
END $$;
