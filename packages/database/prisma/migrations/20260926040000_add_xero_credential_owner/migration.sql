-- CreateEnum
CREATE TYPE "xero_credential_usability" AS ENUM ('usable', 'reauthorisation_required');

-- CreateEnum
CREATE TYPE "xero_refresh_attempt_outcome" AS ENUM ('pending', 'superseded', 'committed', 'lost_response', 'failed');

-- CreateEnum
CREATE TYPE "xero_provider_connection_status" AS ENUM ('present', 'absent_confirmed', 'unknown');

-- CreateEnum
CREATE TYPE "xero_oauth_intent_kind" AS ENUM ('initial_binding', 'same_file_reauthorisation');

-- CreateEnum
CREATE TYPE "xero_token_exchange_status" AS ENUM ('not_started', 'dispatching', 'exchanged', 'unknown');

-- AlterTable
ALTER TABLE "xero_tenants" ADD COLUMN     "xero_credential_owner_id" UUID,
ADD COLUMN     "xero_provider_connection_id" UUID;

-- AlterTable
ALTER TABLE "xero_oauth_sessions" ADD COLUMN     "intent_kind" "xero_oauth_intent_kind",
ADD COLUMN     "nonce_hash" TEXT,
ADD COLUMN     "requested_scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "token_exchange_status" "xero_token_exchange_status",
ALTER COLUMN "token_expires_at" DROP NOT NULL,
ALTER COLUMN "available_tenants_json" DROP NOT NULL;

-- CreateTable
CREATE TABLE "xero_credential_owners" (
    "id" UUID NOT NULL,
    "provider_app_id" TEXT NOT NULL,
    "xero_user_id" TEXT NOT NULL,
    "identity_evidence" TEXT NOT NULL,
    "access_token_encrypted" TEXT NOT NULL,
    "access_token_iv" TEXT NOT NULL,
    "access_token_auth_tag" TEXT NOT NULL,
    "refresh_token_encrypted" TEXT NOT NULL,
    "refresh_token_iv" TEXT NOT NULL,
    "refresh_token_auth_tag" TEXT NOT NULL,
    "token_key_version" INTEGER NOT NULL,
    "token_version" INTEGER NOT NULL DEFAULT 1,
    "last_refresh_attempt_id" UUID,
    "token_expires_at" TIMESTAMP(3) NOT NULL,
    "granted_scopes" TEXT[],
    "granted_scopes_known" BOOLEAN NOT NULL DEFAULT false,
    "usability" "xero_credential_usability" NOT NULL DEFAULT 'usable',
    "last_verified_at" TIMESTAMP(3),
    "last_adopted_at" TIMESTAMP(3),
    "last_rotated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xero_credential_owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_refresh_attempts" (
    "id" UUID NOT NULL,
    "xero_credential_owner_id" UUID NOT NULL,
    "expected_token_version" INTEGER NOT NULL,
    "dispatched_at" TIMESTAMP(3),
    "uncertain_since" TIMESTAMP(3),
    "recovery_deadline" TIMESTAMP(3),
    "outcome" "xero_refresh_attempt_outcome" NOT NULL DEFAULT 'pending',
    "recovery_token_encrypted" TEXT,
    "recovery_token_iv" TEXT,
    "recovery_token_auth_tag" TEXT,
    "recovery_key_version" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xero_refresh_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xero_provider_connections" (
    "id" UUID NOT NULL,
    "provider_app_id" TEXT NOT NULL,
    "remote_connection_id" TEXT NOT NULL,
    "xero_tenant_id" TEXT NOT NULL,
    "tenant_type" TEXT,
    "xero_credential_owner_id" UUID,
    "auth_event_id" TEXT,
    "provider_created_at" TIMESTAMP(3),
    "provider_updated_at" TIMESTAMP(3),
    "observed_at" TIMESTAMP(3) NOT NULL,
    "observed_via" TEXT NOT NULL,
    "remote_status" "xero_provider_connection_status" NOT NULL DEFAULT 'present',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xero_provider_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "xero_credential_owners_provider_app_id_xero_user_id_key" ON "xero_credential_owners"("provider_app_id", "xero_user_id");

-- CreateIndex
CREATE INDEX "xero_refresh_attempts_outcome_recovery_deadline_idx" ON "xero_refresh_attempts"("outcome", "recovery_deadline");

-- CreateIndex
CREATE INDEX "xero_refresh_attempts_xero_credential_owner_id_idx" ON "xero_refresh_attempts"("xero_credential_owner_id");

-- CreateIndex
CREATE INDEX "xero_provider_connections_provider_app_id_xero_tenant_id_idx" ON "xero_provider_connections"("provider_app_id", "xero_tenant_id");

-- CreateIndex
CREATE INDEX "xero_provider_connections_xero_credential_owner_id_idx" ON "xero_provider_connections"("xero_credential_owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "xero_provider_connections_provider_app_id_remote_connection_key" ON "xero_provider_connections"("provider_app_id", "remote_connection_id");

-- CreateIndex
CREATE INDEX "xero_tenants_xero_credential_owner_id_idx" ON "xero_tenants"("xero_credential_owner_id");

-- CreateIndex
CREATE INDEX "xero_tenants_xero_provider_connection_id_idx" ON "xero_tenants"("xero_provider_connection_id");

-- AddForeignKey
ALTER TABLE "xero_refresh_attempts" ADD CONSTRAINT "xero_refresh_attempts_xero_credential_owner_id_fkey" FOREIGN KEY ("xero_credential_owner_id") REFERENCES "xero_credential_owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_provider_connections" ADD CONSTRAINT "xero_provider_connections_xero_credential_owner_id_fkey" FOREIGN KEY ("xero_credential_owner_id") REFERENCES "xero_credential_owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_tenants" ADD CONSTRAINT "xero_tenants_xero_credential_owner_id_fkey" FOREIGN KEY ("xero_credential_owner_id") REFERENCES "xero_credential_owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_tenants" ADD CONSTRAINT "xero_tenants_xero_provider_connection_id_fkey" FOREIGN KEY ("xero_provider_connection_id") REFERENCES "xero_provider_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
