-- CreateEnum
CREATE TYPE "outbound_operation_action" AS ENUM ('submit');

-- CreateEnum
CREATE TYPE "outbound_operation_status" AS ENUM ('prepared', 'outcome_unknown', 'provider_accepted', 'completed', 'definitive_failure');

-- CreateTable
CREATE TABLE "outbound_operations" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "availability_record_id" UUID NOT NULL,
    "action" "outbound_operation_action" NOT NULL,
    "status" "outbound_operation_status" NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "attempt_generation" INTEGER NOT NULL DEFAULT 1,
    "safe_error_code" TEXT,
    "known_remote_id" TEXT,
    "prepared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatch_started_at" TIMESTAMP(3),
    "provider_accepted_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbound_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbound_operations_clerk_org_id_idx" ON "outbound_operations"("clerk_org_id");

-- CreateIndex
CREATE INDEX "outbound_operations_organisation_id_idx" ON "outbound_operations"("organisation_id");

-- CreateIndex
CREATE INDEX "outbound_operations_organisation_id_status_updated_at_idx" ON "outbound_operations"("organisation_id", "status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_operations_availability_record_id_action_key" ON "outbound_operations"("availability_record_id", "action");

-- AddForeignKey
ALTER TABLE "outbound_operations" ADD CONSTRAINT "outbound_operations_availability_record_id_fkey" FOREIGN KEY ("availability_record_id") REFERENCES "availability_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbound_operations" ADD CONSTRAINT "outbound_operations_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

