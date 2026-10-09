-- CreateEnum
CREATE TYPE "onboarding_step" AS ENUM ('details', 'xero', 'people', 'invites', 'finish');

-- AlterTable
ALTER TABLE "organisations" ADD COLUMN     "onboarding_completed_at" TIMESTAMP(3),
ADD COLUMN     "onboarding_step" "onboarding_step" NOT NULL DEFAULT 'details',
ADD COLUMN     "xero_setup_skipped_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "people" ADD COLUMN     "welcome_completed_at" TIMESTAMP(3);
