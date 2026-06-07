-- AlterTable
ALTER TABLE "availability_publications" ADD COLUMN "published_all_day" BOOLEAN NOT NULL DEFAULT false;

-- Backfill the emitted all-day flag from the source availability record so existing
-- publications do not register a spurious material change on their next materialisation.
UPDATE "availability_publications" AS p
SET "published_all_day" = r."all_day"
FROM "availability_records" AS r
WHERE p."availability_record_id" = r."id";
