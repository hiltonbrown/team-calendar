/*
  Warnings:

  - The values [pending,pending_tenant_selection,stale] on the enum `xero_connection_status` will be removed. If these variants are still used in the database, this will fail.
  - The values [expired] on the enum `xero_oauth_session_status` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `xero_tenant_id` on the `leave_balances` table. All the data in the column will be lost.
  - You are about to drop the column `xero_tenant_id` on the `sync_runs` table. All the data in the column will be lost.
  - You are about to drop the column `access_token_auth_tag` on the `xero_connections` table. All the data in the column will be lost.
  - You are about to drop the column `access_token_encrypted` on the `xero_connections` table. All the data in the column will be lost.
  - You are about to drop the column `access_token_iv` on the `xero_connections` table. All the data in the column will be lost.
  - You are about to drop the column `expires_at` on the `xero_connections` table. All the data in the column will be lost.
  - You are about to drop the column `last_refreshed_at` on the `xero_connections` table. All the data in the column will be lost.
  - You are about to drop the column `refresh_token_auth_tag` on the `xero_connections` table. All the data in the column will be lost.
  - You are about to drop the column `refresh_token_encrypted` on the `xero_connections` table. All the data in the column will be lost.
  - You are about to drop the column `refresh_token_iv` on the `xero_connections` table. All the data in the column will be lost.
  - You are about to drop the column `revoked_at` on the `xero_connections` table. All the data in the column will be lost.
  - You are about to drop the column `stale_since` on the `xero_connections` table. All the data in the column will be lost.
  - You are about to drop the column `token_encrypted_at` on the `xero_connections` table. All the data in the column will be lost.
  - You are about to drop the column `token_key_version` on the `xero_connections` table. All the data in the column will be lost.
  - You are about to drop the column `xero_authorisation_connection_id` on the `xero_connections` table. All the data in the column will be lost.
  - You are about to drop the column `access_token_auth_tag` on the `xero_oauth_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `access_token_encrypted` on the `xero_oauth_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `access_token_iv` on the `xero_oauth_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `expected_binding_generation` on the `xero_oauth_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `intent_kind` on the `xero_oauth_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `refresh_token_auth_tag` on the `xero_oauth_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `refresh_token_encrypted` on the `xero_oauth_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `refresh_token_iv` on the `xero_oauth_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `token_encrypted_at` on the `xero_oauth_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `token_exchange_status` on the `xero_oauth_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `token_expires_at` on the `xero_oauth_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `token_key_version` on the `xero_oauth_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `cursor_value` on the `xero_sync_cursors` table. All the data in the column will be lost.
  - You are about to drop the column `xero_tenant_id` on the `xero_sync_cursors` table. All the data in the column will be lost.
  - You are about to drop the `xero_cleanup_attempts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `xero_cleanup_requests` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `xero_credential_owners` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `xero_inactivity_classifications` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `xero_provider_connections` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `xero_refresh_attempts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `xero_tenants` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[person_id,xero_connection_id,leave_type_xero_id]` on the table `leave_balances` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[person_id,leave_type_xero_id]` on the table `leave_balances` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id,clerk_org_id]` on the table `organisations` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[xero_tenant_id]` on the table `xero_connections` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[remote_connection_id]` on the table `xero_connections` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id,clerk_org_id,organisation_id]` on the table `xero_connections` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organisation_id,clerk_org_id]` on the table `xero_connections` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[state_hash]` on the table `xero_oauth_sessions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[xero_connection_id,entity_type]` on the table `xero_sync_cursors` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `payroll_region` to the `xero_connections` table without a default value. This is not possible if the table is not empty.
  - Added the required column `xero_tenant_id` to the `xero_connections` table without a default value. This is not possible if the table is not empty.
  - Added the required column `xero_connection_id` to the `xero_sync_cursors` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `entity_type` on the `xero_sync_cursors` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "xero_cursor_entity_type" AS ENUM ('people', 'leave_records');

-- CreateEnum
CREATE TYPE "xero_authorisation_status" AS ENUM ('active', 'reconnect_required');

-- AlterEnum
BEGIN;
CREATE TYPE "xero_connection_status_new" AS ENUM ('active', 'reconnect_required', 'disconnected');
ALTER TABLE "public"."xero_connections" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "xero_connections" ALTER COLUMN "status" TYPE "xero_connection_status_new" USING ("status"::text::"xero_connection_status_new");
ALTER TYPE "xero_connection_status" RENAME TO "xero_connection_status_old";
ALTER TYPE "xero_connection_status_new" RENAME TO "xero_connection_status";
DROP TYPE "public"."xero_connection_status_old";
ALTER TABLE "xero_connections" ALTER COLUMN "status" SET DEFAULT 'active';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "xero_oauth_session_status_new" AS ENUM ('pending', 'exchanging', 'selecting', 'completed', 'cancelled');
ALTER TABLE "public"."xero_oauth_sessions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "xero_oauth_sessions" ALTER COLUMN "status" TYPE "xero_oauth_session_status_new" USING ("status"::text::"xero_oauth_session_status_new");
ALTER TYPE "xero_oauth_session_status" RENAME TO "xero_oauth_session_status_old";
ALTER TYPE "xero_oauth_session_status_new" RENAME TO "xero_oauth_session_status";
DROP TYPE "public"."xero_oauth_session_status_old";
ALTER TABLE "xero_oauth_sessions" ALTER COLUMN "status" SET DEFAULT 'pending';
COMMIT;

-- DropForeignKey
ALTER TABLE "leave_balances" DROP CONSTRAINT "leave_balances_xero_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "sync_runs" DROP CONSTRAINT "sync_runs_xero_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "xero_cleanup_attempts" DROP CONSTRAINT "xero_cleanup_attempts_xero_cleanup_request_id_fkey";

-- DropForeignKey
ALTER TABLE "xero_cleanup_requests" DROP CONSTRAINT "xero_cleanup_requests_organisation_id_fkey";

-- DropForeignKey
ALTER TABLE "xero_cleanup_requests" DROP CONSTRAINT "xero_cleanup_requests_xero_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "xero_connections" DROP CONSTRAINT "xero_connections_organisation_id_fkey";

-- DropForeignKey
ALTER TABLE "xero_inactivity_classifications" DROP CONSTRAINT "xero_inactivity_classifications_organisation_id_fkey";

-- DropForeignKey
ALTER TABLE "xero_inactivity_classifications" DROP CONSTRAINT "xero_inactivity_classifications_xero_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "xero_oauth_sessions" DROP CONSTRAINT "xero_oauth_sessions_organisation_id_fkey";

-- DropForeignKey
ALTER TABLE "xero_provider_connections" DROP CONSTRAINT "xero_provider_connections_xero_credential_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "xero_refresh_attempts" DROP CONSTRAINT "xero_refresh_attempts_xero_credential_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "xero_sync_cursors" DROP CONSTRAINT "xero_sync_cursors_xero_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "xero_tenants" DROP CONSTRAINT "xero_tenants_organisation_id_fkey";

-- DropForeignKey
ALTER TABLE "xero_tenants" DROP CONSTRAINT "xero_tenants_xero_connection_id_fkey";

-- DropForeignKey
ALTER TABLE "xero_tenants" DROP CONSTRAINT "xero_tenants_xero_credential_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "xero_tenants" DROP CONSTRAINT "xero_tenants_xero_provider_connection_id_fkey";

-- DropIndex
DROP INDEX "leave_balances_person_id_leave_type_xero_id_manual_key";

-- DropIndex
DROP INDEX "leave_balances_person_id_xero_tenant_id_leave_type_xero_id_key";

-- DropIndex
DROP INDEX "leave_balances_xero_tenant_id_idx";

-- DropIndex
DROP INDEX "sync_runs_clerk_org_id_organisation_id_xero_tenant_id_run_t_idx";

-- DropIndex
DROP INDEX "xero_sync_cursors_xero_tenant_id_entity_type_key";

-- DropIndex
DROP INDEX "xero_sync_cursors_xero_tenant_id_idx";

-- AlterTable
ALTER TABLE "leave_balances" DROP COLUMN "xero_tenant_id",
ADD COLUMN     "xero_connection_id" UUID;

-- AlterTable
ALTER TABLE "sync_runs" DROP COLUMN "xero_tenant_id",
ADD COLUMN     "xero_connection_id" UUID;

-- AlterTable
ALTER TABLE "xero_connections" DROP COLUMN "access_token_auth_tag",
DROP COLUMN "access_token_encrypted",
DROP COLUMN "access_token_iv",
DROP COLUMN "expires_at",
DROP COLUMN "last_refreshed_at",
DROP COLUMN "refresh_token_auth_tag",
DROP COLUMN "refresh_token_encrypted",
DROP COLUMN "refresh_token_iv",
DROP COLUMN "revoked_at",
DROP COLUMN "stale_since",
DROP COLUMN "token_encrypted_at",
DROP COLUMN "token_key_version",
DROP COLUMN "xero_authorisation_connection_id",
ADD COLUMN     "approval_state_stale_since" TIMESTAMP(3),
ADD COLUMN     "auth_event_id" TEXT,
ADD COLUMN     "balance_next_person_id" UUID,
ADD COLUMN     "initial_sync_completed_at" TIMESTAMP(3),
ADD COLUMN     "initial_sync_requested_at" TIMESTAMP(3),
ADD COLUMN     "last_approval_state_reconciled_at" TIMESTAMP(3),
ADD COLUMN     "last_full_leave_records_sync_at" TIMESTAMP(3),
ADD COLUMN     "last_full_people_sync_at" TIMESTAMP(3),
ADD COLUMN     "last_leave_balances_sync_at" TIMESTAMP(3),
ADD COLUMN     "last_leave_records_sync_at" TIMESTAMP(3),
ADD COLUMN     "last_people_sync_at" TIMESTAMP(3),
ADD COLUMN     "last_sync_error_code" TEXT,
ADD COLUMN     "last_sync_error_message" TEXT,
ADD COLUMN     "leave_balances_stale_since" TIMESTAMP(3),
ADD COLUMN     "leave_next_person_id" UUID,
ADD COLUMN     "leave_records_stale_since" TIMESTAMP(3),
ADD COLUMN     "payroll_region" "payroll_region" NOT NULL,
ADD COLUMN     "people_stale_since" TIMESTAMP(3),
ADD COLUMN     "remote_connection_id" TEXT,
ADD COLUMN     "sync_paused_at" TIMESTAMP(3),
ADD COLUMN     "tenant_name" TEXT,
ADD COLUMN     "tenant_type" TEXT,
ADD COLUMN     "xero_authorisation_id" UUID,
ADD COLUMN     "xero_tenant_id" TEXT NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'active';

-- AlterTable
ALTER TABLE "xero_oauth_sessions" DROP COLUMN "access_token_auth_tag",
DROP COLUMN "access_token_encrypted",
DROP COLUMN "access_token_iv",
DROP COLUMN "expected_binding_generation",
DROP COLUMN "intent_kind",
DROP COLUMN "refresh_token_auth_tag",
DROP COLUMN "refresh_token_encrypted",
DROP COLUMN "refresh_token_iv",
DROP COLUMN "token_encrypted_at",
DROP COLUMN "token_exchange_status",
DROP COLUMN "token_expires_at",
DROP COLUMN "token_key_version",
ADD COLUMN     "callback_claimed_at" TIMESTAMP(3),
ADD COLUMN     "state_hash" TEXT,
ADD COLUMN     "xero_authorisation_id" UUID;

-- AlterTable
ALTER TABLE "xero_sync_cursors" DROP COLUMN "cursor_value",
DROP COLUMN "xero_tenant_id",
ADD COLUMN     "modified_since" TIMESTAMP(3),
ADD COLUMN     "xero_connection_id" UUID NOT NULL,
DROP COLUMN "entity_type",
ADD COLUMN     "entity_type" "xero_cursor_entity_type" NOT NULL;

-- DropTable
DROP TABLE "xero_cleanup_attempts";

-- DropTable
DROP TABLE "xero_cleanup_requests";

-- DropTable
DROP TABLE "xero_credential_owners";

-- DropTable
DROP TABLE "xero_inactivity_classifications";

-- DropTable
DROP TABLE "xero_provider_connections";

-- DropTable
DROP TABLE "xero_refresh_attempts";

-- DropTable
DROP TABLE "xero_tenants";

-- DropEnum
DROP TYPE "xero_cleanup_attempt_state";

-- DropEnum
DROP TYPE "xero_cleanup_data_action_status";

-- DropEnum
DROP TYPE "xero_credential_usability";

-- DropEnum
DROP TYPE "xero_inactivity_kind";

-- DropEnum
DROP TYPE "xero_inactivity_review_status";

-- DropEnum
DROP TYPE "xero_oauth_intent_kind";

-- DropEnum
DROP TYPE "xero_provider_connection_status";

-- DropEnum
DROP TYPE "xero_refresh_attempt_outcome";

-- DropEnum
DROP TYPE "xero_token_exchange_status";

-- CreateTable
CREATE TABLE "xero_authorisations" (
    "id" UUID NOT NULL,
    "provider_app_id" TEXT NOT NULL,
    "xero_user_id" TEXT NOT NULL,
    "access_token_encrypted" TEXT NOT NULL,
    "access_token_iv" TEXT NOT NULL,
    "access_token_auth_tag" TEXT NOT NULL,
    "refresh_token_encrypted" TEXT NOT NULL,
    "refresh_token_iv" TEXT NOT NULL,
    "refresh_token_auth_tag" TEXT NOT NULL,
    "token_key_version" INTEGER NOT NULL,
    "token_encrypted_at" TIMESTAMP(3) NOT NULL,
    "access_token_expires_at" TIMESTAMP(3) NOT NULL,
    "granted_scopes" TEXT[],
    "status" "xero_authorisation_status" NOT NULL DEFAULT 'active',
    "last_refreshed_at" TIMESTAMP(3) NOT NULL,
    "last_refresh_error_code" TEXT,
    "last_refresh_error_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xero_authorisations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "xero_authorisations_provider_app_id_xero_user_id_key" ON "xero_authorisations"("provider_app_id", "xero_user_id");

-- CreateIndex
CREATE INDEX "leave_balances_xero_connection_id_idx" ON "leave_balances"("xero_connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_person_id_xero_connection_id_leave_type_xero_key" ON "leave_balances"("person_id", "xero_connection_id", "leave_type_xero_id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_person_id_leave_type_xero_id_manual_key" ON "leave_balances"("person_id", "leave_type_xero_id") WHERE (xero_connection_id IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "organisations_id_clerk_org_id_key" ON "organisations"("id", "clerk_org_id");

-- CreateIndex
CREATE INDEX "sync_runs_clerk_org_id_organisation_id_xero_connection_id_r_idx" ON "sync_runs"("clerk_org_id", "organisation_id", "xero_connection_id", "run_type", "status", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "xero_connections_xero_tenant_id_key" ON "xero_connections"("xero_tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "xero_connections_remote_connection_id_key" ON "xero_connections"("remote_connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "xero_connections_id_clerk_org_id_organisation_id_key" ON "xero_connections"("id", "clerk_org_id", "organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "xero_connections_organisation_id_clerk_org_id_key" ON "xero_connections"("organisation_id", "clerk_org_id");

-- CreateIndex
CREATE UNIQUE INDEX "xero_oauth_sessions_state_hash_key" ON "xero_oauth_sessions"("state_hash");

-- CreateIndex
CREATE INDEX "xero_sync_cursors_xero_connection_id_idx" ON "xero_sync_cursors"("xero_connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "xero_sync_cursors_xero_connection_id_entity_type_key" ON "xero_sync_cursors"("xero_connection_id", "entity_type");

-- AddForeignKey
ALTER TABLE "xero_connections" ADD CONSTRAINT "xero_connections_organisation_id_clerk_org_id_fkey" FOREIGN KEY ("organisation_id", "clerk_org_id") REFERENCES "organisations"("id", "clerk_org_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_connections" ADD CONSTRAINT "xero_connections_xero_authorisation_id_fkey" FOREIGN KEY ("xero_authorisation_id") REFERENCES "xero_authorisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_oauth_sessions" ADD CONSTRAINT "xero_oauth_sessions_organisation_id_clerk_org_id_fkey" FOREIGN KEY ("organisation_id", "clerk_org_id") REFERENCES "organisations"("id", "clerk_org_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_oauth_sessions" ADD CONSTRAINT "xero_oauth_sessions_xero_authorisation_id_fkey" FOREIGN KEY ("xero_authorisation_id") REFERENCES "xero_authorisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xero_sync_cursors" ADD CONSTRAINT "xero_sync_cursors_xero_connection_id_clerk_org_id_organisa_fkey" FOREIGN KEY ("xero_connection_id", "clerk_org_id", "organisation_id") REFERENCES "xero_connections"("id", "clerk_org_id", "organisation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_xero_connection_id_clerk_org_id_organisatio_fkey" FOREIGN KEY ("xero_connection_id", "clerk_org_id", "organisation_id") REFERENCES "xero_connections"("id", "clerk_org_id", "organisation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_xero_connection_id_clerk_org_id_organisation_id_fkey" FOREIGN KEY ("xero_connection_id", "clerk_org_id", "organisation_id") REFERENCES "xero_connections"("id", "clerk_org_id", "organisation_id") ON DELETE RESTRICT ON UPDATE CASCADE;
