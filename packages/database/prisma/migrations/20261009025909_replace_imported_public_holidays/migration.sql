-- Data step for the switch to bundled public holidays (no DDL).
-- Imported Nager.Date holidays, their assignments and every jurisdiction are
-- removed. Custom holidays keep their scope and location overrides, now held in
-- public_holiday_preferences. Region codes are normalised to the registry in
-- packages/core/src/regions.ts.

-- 1. Custom holidays take their country and region from their jurisdiction.
UPDATE "public_holidays" AS h
SET "country_code" = j."country_code", "region_code" = j."region_code"
FROM "public_holiday_jurisdictions" AS j
WHERE h."jurisdiction_id" = j."id" AND h."source" = 'manual';

-- 2. Location overrides on custom holidays become preferences. Suppressed
-- holidays are skipped (step 3 hides them everywhere, and a location row would
-- override that), as are overrides equal to the default, which change nothing.
INSERT INTO "public_holiday_preferences"
  ("id", "clerk_org_id", "organisation_id", "holiday_key", "location_id", "setting",
   "created_by_user_id", "updated_by_user_id", "created_at", "updated_at")
SELECT gen_random_uuid(), h."clerk_org_id", h."organisation_id", 'custom:' || h."id",
       l."id", a."day_classification"::text::"public_holiday_setting",
       a."created_by_user_id", a."updated_by_user_id", a."created_at", CURRENT_TIMESTAMP
FROM "public_holiday_assignments" AS a
JOIN "public_holidays" AS h ON h."id" = a."public_holiday_id"
JOIN "locations" AS l ON l."id"::text = a."scope_value"
  AND l."organisation_id" = h."organisation_id"
  AND l."clerk_org_id" = h."clerk_org_id"
WHERE a."scope_type" = 'location' AND a."archived_at" IS NULL AND h."source" = 'manual'
  AND h."archived_at" IS NULL
  AND a."day_classification"::text <> h."default_classification"::text
ON CONFLICT DO NOTHING;

-- 3. Suppressed custom holidays become organisation-wide hidden preferences.
INSERT INTO "public_holiday_preferences"
  ("id", "clerk_org_id", "organisation_id", "holiday_key", "location_id", "setting",
   "created_by_user_id", "updated_by_user_id", "created_at", "updated_at")
SELECT gen_random_uuid(), h."clerk_org_id", h."organisation_id", 'custom:' || h."id",
       NULL, 'hidden', h."updated_by_user_id", h."updated_by_user_id",
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "public_holidays" AS h
WHERE h."source" = 'manual' AND h."archived_at" IS NOT NULL;

UPDATE "public_holidays" SET "archived_at" = NULL
WHERE "source" = 'manual' AND "archived_at" IS NOT NULL;

-- 4. Remove everything imported from Nager.Date, then all jurisdictions.
DELETE FROM "public_holiday_assignments"
WHERE "public_holiday_id" IN (SELECT "id" FROM "public_holidays" WHERE "source" = 'nager');

DELETE FROM "public_holidays" WHERE "source" = 'nager';

UPDATE "public_holidays" SET "jurisdiction_id" = NULL WHERE "jurisdiction_id" IS NOT NULL;

DELETE FROM "public_holiday_jurisdictions";

-- 5. Normalise region codes to the registry; unknown values become null.
CREATE TEMPORARY TABLE "tmp_region_map" ("country" TEXT, "value" TEXT, "code" TEXT);

INSERT INTO "tmp_region_map" ("country", "value", "code") VALUES
  ('AU', 'act', 'ACT'),
  ('AU', 'australian capital territory', 'ACT'),
  ('AU', 'nsw', 'NSW'),
  ('AU', 'new south wales', 'NSW'),
  ('AU', 'nt', 'NT'),
  ('AU', 'northern territory', 'NT'),
  ('AU', 'qld', 'QLD'),
  ('AU', 'queensland', 'QLD'),
  ('AU', 'sa', 'SA'),
  ('AU', 'south australia', 'SA'),
  ('AU', 'tas', 'TAS'),
  ('AU', 'tasmania', 'TAS'),
  ('AU', 'vic', 'VIC'),
  ('AU', 'victoria', 'VIC'),
  ('AU', 'wa', 'WA'),
  ('AU', 'western australia', 'WA'),
  ('NZ', 'auk', 'AUK'),
  ('NZ', 'auckland', 'AUK'),
  ('NZ', 'bop', 'BOP'),
  ('NZ', 'bay of plenty', 'BOP'),
  ('NZ', 'can', 'CAN'),
  ('NZ', 'canterbury', 'CAN'),
  ('NZ', 'cit', 'CIT'),
  ('NZ', 'chatham islands', 'CIT'),
  ('NZ', 'gis', 'GIS'),
  ('NZ', 'gisborne', 'GIS'),
  ('NZ', 'hkb', 'HKB'),
  ('NZ', 'hawke''s bay', 'HKB'),
  ('NZ', 'mbh', 'MBH'),
  ('NZ', 'marlborough', 'MBH'),
  ('NZ', 'mwt', 'MWT'),
  ('NZ', 'manawatū-whanganui', 'MWT'),
  ('NZ', 'nsn', 'NSN'),
  ('NZ', 'nelson', 'NSN'),
  ('NZ', 'ntl', 'NTL'),
  ('NZ', 'northland', 'NTL'),
  ('NZ', 'ota', 'OTA'),
  ('NZ', 'otago', 'OTA'),
  ('NZ', 'stl', 'STL'),
  ('NZ', 'southland', 'STL'),
  ('NZ', 'tas', 'TAS'),
  ('NZ', 'tasman', 'TAS'),
  ('NZ', 'tki', 'TKI'),
  ('NZ', 'taranaki', 'TKI'),
  ('NZ', 'wgn', 'WGN'),
  ('NZ', 'wellington', 'WGN'),
  ('NZ', 'wko', 'WKO'),
  ('NZ', 'waikato', 'WKO'),
  ('NZ', 'wtc', 'WTC'),
  ('NZ', 'west coast', 'WTC'),
  ('NZ', 'manawatu-whanganui', 'MWT'),
  ('NZ', 'manawatu whanganui', 'MWT'),
  ('UK', 'eaw', 'EAW'),
  ('UK', 'england and wales', 'EAW'),
  ('UK', 'sct', 'SCT'),
  ('UK', 'scotland', 'SCT'),
  ('UK', 'nir', 'NIR'),
  ('UK', 'northern ireland', 'NIR'),
  ('UK', 'england', 'EAW'),
  ('UK', 'wales', 'EAW'),
  ('UK', 'eng', 'EAW'),
  ('UK', 'wls', 'EAW');

-- Custom holidays copied their jurisdiction's raw region in step 1. Unknown
-- values are left as they are so a regional holiday never becomes national.
UPDATE "public_holidays" AS h
SET "region_code" = m."code"
FROM "tmp_region_map" AS m
WHERE m."country" = h."country_code" AND m."value" = lower(trim(h."region_code"));

UPDATE "organisations" AS o
SET "region_code" = m."code"
FROM "tmp_region_map" AS m
WHERE m."country" = o."country_code" AND m."value" = lower(trim(o."region_code"));

UPDATE "organisations" AS o
SET "region_code" = NULL
WHERE o."region_code" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "tmp_region_map" AS m
    WHERE m."country" = o."country_code" AND m."code" = o."region_code"
  );

UPDATE "locations" AS l
SET "region_code" = m."code"
FROM "organisations" AS o, "tmp_region_map" AS m
WHERE o."id" = l."organisation_id"
  AND m."country" = COALESCE(l."country_code", o."country_code")
  AND m."value" = lower(trim(l."region_code"));

UPDATE "locations" AS l
SET "region_code" = NULL
FROM "organisations" AS o
WHERE o."id" = l."organisation_id"
  AND l."region_code" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "tmp_region_map" AS m
    WHERE m."country" = COALESCE(l."country_code", o."country_code") AND m."code" = l."region_code"
  );

DROP TABLE "tmp_region_map";
