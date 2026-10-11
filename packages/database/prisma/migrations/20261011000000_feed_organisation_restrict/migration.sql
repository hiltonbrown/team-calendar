-- DropForeignKey
ALTER TABLE "feed_tokens" DROP CONSTRAINT "feed_tokens_organisation_id_fkey";

-- DropForeignKey
ALTER TABLE "feeds" DROP CONSTRAINT "feeds_organisation_id_fkey";

-- AddForeignKey
ALTER TABLE "feeds" ADD CONSTRAINT "feeds_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_tokens" ADD CONSTRAINT "feed_tokens_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

