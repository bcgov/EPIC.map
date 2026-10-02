-- Everything that must be true of a staged extract before it is allowed to
-- replace the one already loaded.
--
-- Runs inside the ingest's transaction, before anything is written, so a
-- failure here leaves the previous load exactly as it was. That is the whole
-- point: the extract is refreshed occasionally by hand, and a re-export that
-- came out short or malformed must not be able to destroy a good one.
--
-- These are the checks that are true or false on their own terms. Anything
-- that needs comparing against what is already stored - a suspicious drop in
-- the number of areas, say - is decided in Python, where it can be given a
-- threshold and an override.

-- The extract loaded at all. ogr2ogr reports success for a file it read and
-- found nothing in, so an empty staging table is a real and silent outcome.
DO $$
DECLARE staged bigint;
BEGIN
    SELECT count(*) INTO staged FROM cache.pip_consultation_areas_src;
    IF staged = 0 THEN
        RAISE EXCEPTION 'the extract staged no rows at all';
    END IF;
END $$;

-- Geometry on every row, and geometry PostGIS will accept. A null shape is
-- what a source SELECT that forgot the geometry column produces, and it loads
-- without complaint.
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

-- The projection the rest of the pipeline assumes. ST_AsMVTGeom needs the
-- geometry and the tile envelope in one SRS, and a mismatch draws a map that
-- is empty rather than wrong, which takes longer to notice.
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

-- The identifiers the rest of this depends on. The GUID is the primary key and
-- the grouping key; the name is what the style matches on, so a blank one
-- would draw in the default symbol and look deliberate.
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

-- One name per GUID and one GUID per name. The transform folds the name onto
-- the row with min(), which is only honest if the group agrees; and the style
-- keys on the name, so two areas sharing one would be indistinguishable on the
-- map.
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
-- of them and discarding the rest exact rather than a choice. Checked here
-- rather than assumed, because it is a property of how the warehouse flattens
-- the join and not something it promises.
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
