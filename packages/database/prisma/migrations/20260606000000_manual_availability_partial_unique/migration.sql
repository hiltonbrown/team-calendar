-- CreateIndex
-- Partial unique index guarding manual availability records. The Xero-oriented unique
-- index "availability_records_xero_remote_unique_idx" does not cover manual rows because
-- they have source_remote_id = NULL, and PostgreSQL treats NULL as distinct. Without this
-- index, duplicate manual records (and the duplicate ICS feed events they produce) are not
-- prevented at the database level, so concurrent submissions can race past the application
-- guard. Archived rows are excluded so a record can be recreated after it is soft-deleted.
-- Prisma @@unique cannot express a WHERE clause, so this is added via raw SQL; keep it in
-- sync with the comment on AvailabilityRecord in schema.prisma.
CREATE UNIQUE INDEX "availability_records_manual_identity_key" ON "availability_records"("organisation_id", "person_id", "record_type", "starts_at", "ends_at")
WHERE "source_type" = 'manual' AND "source_remote_id" IS NULL AND "archived_at" IS NULL;
