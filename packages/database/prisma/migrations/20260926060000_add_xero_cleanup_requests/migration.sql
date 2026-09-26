-- CreateEnum
CREATE TYPE "xero_cleanup_data_action_status" AS ENUM ('not_requested', 'pending', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "xero_cleanup_attempt_state" AS ENUM ('pending', 'claimed', 'dispatching', 'confirmed_deleted', 'confirmed_absent', 'unknown', 'blocked_authorisation', 'cancelled');

-- CreateTable
CREATE TABLE "xero_cleanup_requests" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "xero_tenant_id" UUID NOT NULL,
    "binding_generation" INTEGER NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "destructive" BOOLEAN NOT NULL,
    "data_action_status" "xero_cleanup_data_action_status" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xero_cleanup_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_cleanup_attempts" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "xero_cleanup_request_id" UUID NOT NULL,
    "provider_app_id" TEXT NOT NULL,
    "remote_connection_id" TEXT NOT NULL,
    "expected_binding_generation" INTEGER NOT NULL,
    "state" "xero_cleanup_attempt_state" NOT NULL DEFAULT 'pending',
    "lease_owner" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "dispatched_at" TIMESTAMP(3),
    "deadline_at" TIMESTAMP(3),
    "next_attempt_at" TIMESTAMP(3),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "outcome_reason" TEXT,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xero_cleanup_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "xero_cleanup_requests_clerk_org_id_idx" ON "xero_cleanup_requests"("clerk_org_id");

-- CreateIndex
CREATE INDEX "xero_cleanup_requests_organisation_id_idx" ON "xero_cleanup_requests"("organisation_id");

-- CreateIndex
CREATE INDEX "xero_cleanup_attempts_state_next_attempt_at_idx" ON "xero_cleanup_attempts"("state", "next_attempt_at");

-- CreateIndex
CREATE INDEX "xero_cleanup_attempts_organisation_id_idx" ON "xero_cleanup_attempts"("organisation_id");

-- CreateIndex
CREATE INDEX "xero_cleanup_attempts_clerk_org_id_idx" ON "xero_cleanup_attempts"("clerk_org_id");

-- CreateIndex
CREATE UNIQUE INDEX "xero_cleanup_attempts_xero_cleanup_request_id_remote_connec_key" ON "xero_cleanup_attempts"("xero_cleanup_request_id", "remote_connection_id");

-- AddForeignKey
ALTER TABLE "xero_cleanup_requests" ADD CONSTRAINT "xero_cleanup_requests_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_cleanup_requests" ADD CONSTRAINT "xero_cleanup_requests_xero_tenant_id_fkey" FOREIGN KEY ("xero_tenant_id") REFERENCES "xero_tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_cleanup_attempts" ADD CONSTRAINT "xero_cleanup_attempts_xero_cleanup_request_id_fkey" FOREIGN KEY ("xero_cleanup_request_id") REFERENCES "xero_cleanup_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
