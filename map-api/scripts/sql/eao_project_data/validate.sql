-- What must be true of a staged EAO extract before it may replace the stored one.
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
    SELECT count(*) INTO staged FROM cache.eao_project_data_src;
    IF staged = 0 THEN
        RAISE EXCEPTION 'the extract staged no rows at all';
    END IF;
END $$;

-- All three feature classes arrived. The selects append into one table, so a
-- class that failed to stage is a silently smaller layer rather than an error.
DO $$
DECLARE missing text;
BEGIN
    SELECT string_agg(expected, ', ' ORDER BY expected) INTO missing
    FROM (VALUES ('poly'), ('line'), ('point')) AS classes(expected)
    WHERE NOT EXISTS (
        SELECT 1 FROM cache.eao_project_data_src
        WHERE source_layer = classes.expected
    );

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'the extract staged no rows for: %', missing;
    END IF;
END $$;

-- Geometry on every row, and geometry PostGIS accepts. A select that forgot
-- the geometry column loads null shapes without complaint.
DO $$
DECLARE bad bigint;
BEGIN
    SELECT count(*) INTO bad
    FROM cache.eao_project_data_src
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
    FROM cache.eao_project_data_src
    WHERE ST_SRID(geom) <> 3857;

    IF wrong > 0 THEN
        RAISE EXCEPTION
            '% staged rows are not in EPSG:3857; check the -t_srs argument', wrong;
    END IF;
END $$;

-- Two dimensions. The delivery is ZM, and without -dim XY the Z and M would
-- be stored, doubling the geometry and making a re-export that perturbs Z
-- look like a table of new features.
DO $$
DECLARE wrong bigint;
BEGIN
    SELECT count(*) INTO wrong
    FROM cache.eao_project_data_src
    WHERE ST_NDims(geom) <> 2;

    IF wrong > 0 THEN
        RAISE EXCEPTION
            '% staged rows carry a Z or M ordinate; check the -dim argument', wrong;
    END IF;
END $$;

-- The join to EPIC.Track, which is the whole point of the layer: a footprint
-- with no project is a shape nothing can open. Numeric because the column is
-- text in the delivery and the target is an integer.
DO $$
DECLARE bad bigint;
BEGIN
    SELECT count(*) INTO bad
    FROM cache.eao_project_data_src
    WHERE btrim(coalesce(track_id, '')) = ''
       OR btrim(track_id) !~ '^[0-9]+$';

    IF bad > 0 THEN
        RAISE EXCEPTION
            '% staged rows have a missing or non-numeric TrackID', bad;
    END IF;
END $$;

-- The identifier every row is stored under. Delivered, not derived, since the
-- 16/10/2026 delivery: a blank would fail the insert as a null primary key, and
-- a duplicate would fail it as a collision - both part way through, after the
-- transaction had already truncated the stored rows.
DO $$
DECLARE bad bigint;
BEGIN
    SELECT count(*) INTO bad
    FROM cache.eao_project_data_src
    WHERE btrim(coalesce(global_id, '')) = '';

    IF bad > 0 THEN
        RAISE EXCEPTION '% staged rows have no GlobalID', bad;
    END IF;
END $$;

DO $$
DECLARE repeated bigint;
BEGIN
    SELECT count(*) INTO repeated
    FROM (
        SELECT btrim(global_id)
        FROM cache.eao_project_data_src
        GROUP BY 1 HAVING count(*) > 1
    ) AS collisions;

    IF repeated > 0 THEN
        RAISE EXCEPTION
            '% GlobalID(s) appear on more than one staged row; they identify '
            'a feature across all three classes', repeated;
    END IF;
END $$;

-- What a reader identifies a feature by in the panel and the popup.
DO $$
DECLARE bad bigint;
BEGIN
    SELECT count(*) INTO bad
    FROM cache.eao_project_data_src
    WHERE btrim(coalesce(label, '')) = ''
       OR btrim(coalesce(project_name, '')) = '';

    IF bad > 0 THEN
        RAISE EXCEPTION
            '% staged rows have no label or no project name', bad;
    END IF;
END $$;
