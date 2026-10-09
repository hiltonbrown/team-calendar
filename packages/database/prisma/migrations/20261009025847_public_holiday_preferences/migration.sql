-- CreateEnum
CREATE TYPE "public_holiday_setting" AS ENUM ('hidden', 'working', 'non_working');

-- CreateTable
CREATE TABLE "public_holiday_preferences" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "holiday_key" TEXT NOT NULL,
    "location_id" UUID,
    "setting" "public_holiday_setting" NOT NULL,
    "created_by_user_id" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_holiday_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "public_holiday_preferences_clerk_org_id_idx" ON "public_holiday_preferences"("clerk_org_id");

-- CreateIndex
CREATE INDEX "public_holiday_preferences_organisation_id_idx" ON "public_holiday_preferences"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "public_holiday_preferences_organisation_id_holiday_key_loca_key" ON "public_holiday_preferences"("organisation_id", "holiday_key", "location_id");

-- AddForeignKey
ALTER TABLE "public_holiday_preferences" ADD CONSTRAINT "public_holiday_preferences_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_holiday_preferences" ADD CONSTRAINT "public_holiday_preferences_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
