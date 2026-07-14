-- AlterTable
ALTER TABLE "availability_publications" ADD COLUMN "published_starts_at" TIMESTAMP(3);
ALTER TABLE "availability_publications" ADD COLUMN "published_ends_at" TIMESTAMP(3);

-- Backfill
UPDATE "availability_publications" p
  SET "published_starts_at" = r."starts_at",
      "published_ends_at"   = r."ends_at"
  FROM "availability_records" r
  WHERE r."id" = p."availability_record_id";
