-- DropForeignKey
ALTER TABLE "public_holiday_assignments" DROP CONSTRAINT "public_holiday_assignments_organisation_id_fkey";

-- DropForeignKey
ALTER TABLE "public_holiday_assignments" DROP CONSTRAINT "public_holiday_assignments_public_holiday_id_fkey";

-- DropForeignKey
ALTER TABLE "public_holiday_jurisdictions" DROP CONSTRAINT "public_holiday_jurisdictions_organisation_id_fkey";

-- DropForeignKey
ALTER TABLE "public_holidays" DROP CONSTRAINT "public_holidays_jurisdiction_id_fkey";

-- DropIndex
DROP INDEX "public_holidays_jurisdiction_id_idx";

-- AlterTable
ALTER TABLE "public_holidays" DROP COLUMN "jurisdiction_id",
DROP COLUMN "source_payload_json";

-- DropTable
DROP TABLE "public_holiday_assignments";

-- DropTable
DROP TABLE "public_holiday_jurisdictions";

-- DropEnum
DROP TYPE "public_holiday_assignment_scope_type";

