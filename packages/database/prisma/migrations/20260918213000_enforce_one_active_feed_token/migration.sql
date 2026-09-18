-- CreateIndex (raw SQL: partial unique for the one-active-token-per-feed invariant)
-- Prisma schema syntax cannot express a partial index. Keep this definition in
-- sync with the FeedToken model documentation in schema.prisma.
CREATE UNIQUE INDEX "feed_tokens_one_active_per_feed_key"
ON "feed_tokens"("feed_id")
WHERE "status" = 'active';
