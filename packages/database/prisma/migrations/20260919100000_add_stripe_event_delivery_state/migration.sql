-- CreateEnum
CREATE TYPE "stripe_event_delivery_state" AS ENUM ('failed', 'processed', 'ignored');

-- AlterTable
ALTER TABLE "stripe_events" ADD COLUMN     "attempt_count" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "clerk_org_id" TEXT,
ADD COLUMN     "delivery_state" "stripe_event_delivery_state" NOT NULL DEFAULT 'processed',
ADD COLUMN     "error_category" TEXT,
ADD COLUMN     "event_created_at" TIMESTAMP(3),
ADD COLUMN     "last_attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "stripe_customer_id" TEXT,
ALTER COLUMN "processed_at" DROP NOT NULL,
ALTER COLUMN "processed_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "stripe_events_clerk_org_id_delivery_state_event_created_at_idx" ON "stripe_events"("clerk_org_id", "delivery_state", "event_created_at");

-- CreateIndex
CREATE INDEX "stripe_events_delivery_state_updated_at_idx" ON "stripe_events"("delivery_state", "updated_at");

