-- CreateIndex
CREATE INDEX "availability_records_organisation_id_approval_status_submit_idx" ON "availability_records"("organisation_id", "approval_status", "submitted_at");
