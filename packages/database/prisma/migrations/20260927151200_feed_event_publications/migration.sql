-- AlterTable
ALTER TABLE "feeds" ADD COLUMN     "representation_generation" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "representation_hash" TEXT;

-- CreateTable
CREATE TABLE "feed_event_publications" (
    "id" UUID NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "organisation_id" UUID NOT NULL,
    "feed_id" UUID NOT NULL,
    "source_key" TEXT NOT NULL,
    "published_uid" TEXT NOT NULL,
    "representation_hash" TEXT NOT NULL,
    "published_sequence" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3) NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feed_event_publications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feed_event_publications_clerk_org_id_idx" ON "feed_event_publications"("clerk_org_id");

-- CreateIndex
CREATE INDEX "feed_event_publications_organisation_id_idx" ON "feed_event_publications"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "feed_event_publications_feed_id_source_key_key" ON "feed_event_publications"("feed_id", "source_key");

-- AddForeignKey
ALTER TABLE "feed_event_publications" ADD CONSTRAINT "feed_event_publications_feed_id_fkey" FOREIGN KEY ("feed_id") REFERENCES "feeds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

