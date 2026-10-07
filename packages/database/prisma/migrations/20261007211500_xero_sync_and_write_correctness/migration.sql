-- AlterEnum
BEGIN;
CREATE TYPE "outbound_operation_action_new" AS ENUM ('approve', 'decline', 'withdraw');
ALTER TABLE "outbound_operations" ALTER COLUMN "action" TYPE "outbound_operation_action_new" USING ("action"::text::"outbound_operation_action_new");
ALTER TYPE "outbound_operation_action" RENAME TO "outbound_operation_action_old";
ALTER TYPE "outbound_operation_action_new" RENAME TO "outbound_operation_action";
DROP TYPE "public"."outbound_operation_action_old";
COMMIT;

-- AlterTable
ALTER TABLE "outbound_operations" ADD COLUMN     "idempotency_first_dispatched_at" TIMESTAMP(3),
ADD COLUMN     "idempotency_key" UUID,
ADD COLUMN     "idempotency_replay_before" TIMESTAMP(3),
ADD COLUMN     "request_body_json" TEXT,
ADD COLUMN     "request_method" TEXT,
ADD COLUMN     "request_url" TEXT,
ADD COLUMN     "request_xero_tenant_id" TEXT;

-- AlterTable
ALTER TABLE "xero_connections" ADD COLUMN     "balance_sweep_failed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "leave_sweep_failed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "outbound_operations_idempotency_key_key" ON "outbound_operations"("idempotency_key");
