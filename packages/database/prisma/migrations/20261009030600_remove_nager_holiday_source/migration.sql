-- AlterEnum
BEGIN;
CREATE TYPE "public_holiday_source_new" AS ENUM ('manual');
ALTER TABLE "public_holidays" ALTER COLUMN "source" TYPE "public_holiday_source_new" USING ("source"::text::"public_holiday_source_new");
ALTER TYPE "public_holiday_source" RENAME TO "public_holiday_source_old";
ALTER TYPE "public_holiday_source_new" RENAME TO "public_holiday_source";
DROP TYPE "public"."public_holiday_source_old";
COMMIT;

