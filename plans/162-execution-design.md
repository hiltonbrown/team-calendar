# Plan 162 reviewed execution design

Reviewer approved 27 September 2026.

## Durable feed representation

Add FeedEventPublication, scoped by clerk_org_id and organisation_id, unique on feed_id and source_key. Source identity uses availability:<record id> or holiday:<holiday id>. Persist immutable published_uid, representation_hash, published_sequence, published_at and present. Retain absent identities so re-entry does not reuse old versions. Feed gains representation_hash and representation_generation. One generated additive migration creates the ledger and adds nullable/defaulted feed fields.

Every subscriber render and job rebuild establishes authoritative projection inside a serializable transaction. All feed, scope, people, location, holiday and publication queries receive that same client and both tenant identifiers. Material hashes cover every serialised field, including CLASS. Existing publication UIDs remain stable. A source created before the feed last rendered is conservatively treated as potentially published, and starts its first ledger version at prior sequence plus one, including sequence-zero records and holidays. This rendering/creation bound is not proof the event appeared in the prior scope or horizon. Newly created sources and never-rendered feeds start at zero. Ledger identity governs subsequent versions, including events first encountered after migration. No-op snapshots retain sequence and timestamp. Membership removal advances once; re-entry advances again. Horizon rollover changes membership without versioning surviving events.

Snapshot fingerprint covers feed name and ordered event output. Generation changes only when output changes. Immutable cache lookup and writes use feed_id plus ETag. A current fingerprint validates last_etag metadata before cache lookup; generation fences metadata writes. Old writes cannot populate a current key. After rendering or cache lookup, obtain a second authoritative snapshot, because a generation read alone misses unreconciled canonical writes. Bounded retries return a safe error when coherence cannot be established. Fence last_etag updates by generation. Recheck token validity before response. Cache failures remain best effort for an established valid representation.

Prisma serialization/unique conflicts retry at most three times. Unexpected database/projection failures return Result; job boundaries throw failures for queue retries. Preview remains a non-mutating current projection. Canonical materialisation failure cannot emit current content with an old version.

## Schema and live proof

Changes: packages/database/prisma/schema.prisma, one Prisma-generated migration, packages/database/src/queries/feeds.ts if needed, feeds publication/projection/scope/render/cache and tests. Existing feeds integration suite is extended, inventory unchanged. Ledger cleanup precedes feeds and the ledger joins outside-owned-content verification. Reviewer must inspect complete SQL before deployment under current online target/restore/ownership protections. No migrate dev, db push, reset, local database or new Neon branch.

## Calendar slot contract

Reviewer approved adjacent plans/_schemas.ts, _actions.ts, plan-form-time.ts and tests. Date-only inputs keep all-day semantics. Timed slots carry explicit wall-clock YYYY-MM-DDTHH:mm without a Z suffix. Server resolves organisation timezone using both scopes; conversion rejects DST gaps and chooses earliest repeated-time instant. Form displays saved instants in the organisation timezone and preserves no-op timed edits. Calendar details use the same explicit timezone.
