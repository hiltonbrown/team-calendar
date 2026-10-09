-- CreateIndex
CREATE UNIQUE INDEX "public_holiday_preferences_organisation_wide_key" ON "public_holiday_preferences"("organisation_id", "holiday_key") WHERE (location_id IS NULL);

