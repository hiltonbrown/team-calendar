import { executeRedisRestCommand } from "@repo/core";
import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

// getFeedDetail builds the full subscribe URL from the API origin and
// requires it to be configured. Provide one for the integration environment.
process.env.NEXT_PUBLIC_API_URL ||= "https://api.test.local";
vi.mock("server-only", () => ({}));

const fixture = allocateLiveTestFixture(
  "packages/feeds/index.integration.test.ts"
);
const {
  materialiseAvailabilityPublication,
  archiveFeed,
  restoreFeed,
  resumeFeed,
  issueToken,
  purgeFeedCacheEntries,
  setFeedCacheClientForTests,
  feedCacheKey,
  getCachedFeedBody,
  setCachedFeedBody,
  createFeed,
  createInitialTokenWithClient,
  ensureDefaultCalendarFeed,
  getFeedDetail,
  pauseFeed,
  renderFeedForToken,
  revokeAllFeedTokens,
  revokeToken,
  rotateToken,
  signedFeedTokenId,
} = await import("./index");
const { database } = await import("@repo/database");

const { url: fixtureKvUrl, token: fixtureKvToken } = z
  .object({ token: z.string().min(1), url: z.string().url() })
  .parse({
    token: process.env.TC_TEST_KV_REST_API_TOKEN,
    url: process.env.TC_TEST_KV_REST_API_URL,
  });
async function listOwnedFeedCacheKeys(input: {
  feedIds: string[];
}): Promise<string[]> {
  const keys = new Set<string>();
  for (const feedId of input.feedIds) {
    z.string().uuid().parse(feedId);
    let cursor = 0;
    do {
      const [next, entries] = z
        .tuple([z.coerce.number().int().nonnegative(), z.array(z.string())])
        .parse(
          await fixtureRedis([
            "SCAN",
            cursor,
            "MATCH",
            `feed:${feedId}:*`,
            "COUNT",
            100,
          ])
        );
      for (const key of entries) {
        expect(key.startsWith(`feed:${feedId}:`)).toBe(true);
        keys.add(key);
      }
      cursor = next;
    } while (cursor !== 0);
  }
  return [...keys];
}
async function purgeOwnedFeedCacheKeys(input: {
  feedIds: string[];
}): Promise<void> {
  for (const feedId of input.feedIds) {
    const result = await purgeFeedCacheEntries({ feedId });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
  }
  expect(await listOwnedFeedCacheKeys(input)).toEqual([]);
}
async function fixtureRedis<T>(command: Array<string | number>): Promise<T> {
  const result = await executeRedisRestCommand<T>({
    command,
    token: fixtureKvToken,
    url: fixtureKvUrl,
  });
  if (!result.ok) {
    throw new Error("Owned feed Redis command failed");
  }
  return result.value;
}
setFeedCacheClientForTests({
  del: (...keys) => fixtureRedis(["DEL", ...keys]),
  get: async <T>(key: string): Promise<T | null> => {
    const value = await fixtureRedis<string | null>(["GET", key]);
    // The shared cache client contract parses its stored JSON envelope.
    return value === null ? null : JSON.parse(value);
  },
  scan: async (cursor, options) =>
    z
      .tuple([z.coerce.number(), z.array(z.string())])
      .parse(
        await fixtureRedis<unknown>([
          "SCAN",
          cursor,
          "MATCH",
          options.match ?? "*",
          "COUNT",
          options.count ?? 100,
        ])
      ),
  set: (key, value, options) =>
    fixtureRedis([
      "SET",
      key,
      JSON.stringify(value),
      ...(options?.ex ? ["EX", options.ex] : []),
    ]),
});

const tenant = {
  ...fixture.tenants[0],
};
const otherTenant = {
  ...fixture.tenants[1],
};
if (!(tenant.clerkOrgId && otherTenant.clerkOrgId && fixture.tenants[2])) {
  throw new Error("Feeds live fixture tenants were not allocated");
}
const clerkOrgIds = [tenant.clerkOrgId, otherTenant.clerkOrgId];
const TOKEN_PATTERN = /^tc1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/;
const INITIAL_TOKEN_EXISTS_PATTERN =
  /^This feed already has (an active )?token\.$/;

describe("feed services", () => {
  beforeEach(async () => {
    await cleanTestData();
    await createTenant(tenant);
    await createTenant(otherTenant);
  });

  afterAll(async () => {
    await cleanTestData();
    await expect(
      database.organisation.count({
        where: { clerk_org_id: { in: clerkOrgIds } },
      })
    ).resolves.toBe(0);
    await database.$disconnect();
  });

  test("keeps current event bytes stable and versions missed canonical edits per feed", async () => {
    const created = await createTestFeed();
    const seeded = await seedRepresentationRecord();
    const first = await renderFeedForToken(created.plaintext);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw new Error(first.error.message);
    }
    const firstLedger = await database.feedEventPublication.findFirstOrThrow({
      where: { ...seeded.scope, feed_id: created.feedId },
    });
    expect(firstLedger.published_sequence).toBe(0);
    const repeated = await Promise.all([
      renderFeedForToken(created.plaintext),
      renderFeedForToken(created.plaintext),
    ]);
    for (const result of repeated) {
      expect(result.ok && result.value.body).toBe(first.value.body);
      expect(result.ok && result.value.etag).toBe(first.value.etag);
    }
    await database.availabilityRecord.updateMany({
      data: {
        ends_at: new Date(seeded.startsAt.getTime() + 86_400_000),
        starts_at: new Date(seeded.startsAt.getTime() + 86_400_000),
        title: "Changed without canonical materialisation",
      },
      where: { ...seeded.scope, id: seeded.recordId },
    });
    const changed = await renderFeedForToken(created.plaintext);
    expect(changed.ok && changed.value.body).toContain(
      "Changed without canonical"
    );
    const changedLedger = await database.feedEventPublication.findFirstOrThrow({
      where: { ...seeded.scope, feed_id: created.feedId },
    });
    expect(changedLedger.published_uid).toBe(firstLedger.published_uid);
    expect(changedLedger.published_sequence).toBe(1);
    expect(changedLedger.published_at.getTime()).toBeGreaterThanOrEqual(
      firstLedger.published_at.getTime()
    );
    await expect(
      database.feedEventPublication.count({
        where: {
          clerk_org_id: otherTenant.clerkOrgId,
          organisation_id: otherTenant.organisationId,
        },
      })
    ).resolves.toBe(0);
  });

  test("upgrades historical record and holiday sequence zero while new materialised records start zero", async () => {
    const created = await createTestFeed();
    const old = await seedRepresentationRecord();
    await database.availabilityRecord.updateMany({
      data: { created_at: new Date("2020-01-01") },
      where: { ...old.scope, id: old.recordId },
    });
    expect(
      await materialiseAvailabilityPublication({
        availabilityRecordId: old.recordId,
        clerkOrgId: tenant.clerkOrgId,
        organisationId: tenant.organisationId,
      })
    ).toMatchObject({ ok: true });
    const holiday = await database.publicHoliday.create({
      data: {
        ...old.scope,
        country_code: "AU",
        created_at: new Date("2020-01-01"),
        holiday_date: old.startsAt,
        holiday_type: "custom",
        name: "Historical holiday",
        source: "manual",
      },
    });
    const fresh = await seedRepresentationRecord();
    expect(
      await materialiseAvailabilityPublication({
        availabilityRecordId: fresh.recordId,
        clerkOrgId: tenant.clerkOrgId,
        organisationId: tenant.organisationId,
      })
    ).toMatchObject({ ok: true });
    await database.feed.updateMany({
      data: {
        includes_public_holidays: true,
        last_rendered_at: new Date("2025-01-01"),
      },
      where: { ...old.scope, id: created.feedId },
    });
    expect(await renderFeedForToken(created.plaintext)).toMatchObject({
      ok: true,
    });
    const rows = await database.feedEventPublication.findMany({
      where: { ...old.scope, feed_id: created.feedId },
    });
    expect(
      rows.find((row) => row.source_key === `availability:${old.recordId}`)
        ?.published_sequence
    ).toBe(1);
    expect(
      rows.find((row) => row.source_key === `holiday:custom:${holiday.id}`)
        ?.published_sequence
    ).toBe(1);
    expect(
      rows.find((row) => row.source_key === `availability:${fresh.recordId}`)
        ?.published_sequence
    ).toBe(0);
  });

  test("uses real Redis while fencing a stale immutable write after privacy changes", async () => {
    const created = await createTestFeed();
    const seeded = await seedRepresentationRecord();
    const initial = await renderFeedForToken(created.plaintext);
    if (!initial.ok) {
      throw new Error(initial.error.message);
    }
    const oldKey = feedCacheKey({
      etag: initial.value.etag,
      feedId: created.feedId,
    });
    expect(await getCachedFeedBody(oldKey)).toMatchObject({
      ok: true,
      value: { etag: initial.value.etag },
    });
    await database.feed.updateMany({
      data: { privacy_mode: "private" },
      where: { ...seeded.scope, id: created.feedId },
    });
    const privateBody = await renderFeedForToken(created.plaintext);
    if (!privateBody.ok) {
      throw new Error(privateBody.error.message);
    }
    expect(privateBody.value.body).not.toContain("Owned Person");
    const lateWrite = await setCachedFeedBody({
      body: initial.value.body,
      etag: initial.value.etag,
      key: oldKey,
      ttlSeconds: 3600,
    });
    expect(lateWrite.ok).toBe(true);
    expect(await getCachedFeedBody(oldKey)).toMatchObject({
      ok: true,
      value: { body: initial.value.body, etag: initial.value.etag },
    });
    const revalidated = await renderFeedForToken(created.plaintext);
    expect(revalidated.ok && revalidated.value.body).toBe(
      privateBody.value.body
    );
    expect(revalidated.ok && revalidated.value.etag).toBe(
      privateBody.value.etag
    );
    const ownedCache = {
      feedIds: [created.feedId],
    };
    expect(
      (await listOwnedFeedCacheKeys(ownedCache)).length
    ).toBeGreaterThanOrEqual(2);
    await purgeOwnedFeedCacheKeys(ownedCache);
    expect(await listOwnedFeedCacheKeys(ownedCache)).toEqual([]);
  });

  test("versions person, location and privacy output and retains removal history", async () => {
    const created = await createTestFeed();
    const seeded = await seedRepresentationRecord();
    await renderFeedForToken(created.plaintext);
    await database.person.updateMany({
      data: { display_name: "Renamed Person" },
      where: { ...seeded.scope, id: seeded.personId },
    });
    const renamed = await renderFeedForToken(created.plaintext);
    expect(renamed.ok && renamed.value.body).toContain("Renamed Person");
    await database.location.updateMany({
      data: { name: "Sydney" },
      where: { ...seeded.scope, id: seeded.locationId },
    });
    const relocated = await renderFeedForToken(created.plaintext);
    expect(relocated.ok && relocated.value.body).toContain("LOCATION:Sydney");
    await database.feed.updateMany({
      data: { privacy_mode: "private" },
      where: { ...seeded.scope, id: created.feedId },
    });
    const privateBody = await renderFeedForToken(created.plaintext);
    expect(privateBody.ok && privateBody.value.body).toContain("SUMMARY:Busy");
    expect(privateBody.ok && privateBody.value.body).not.toContain(
      "Renamed Person"
    );
    expect(privateBody.ok && privateBody.value.body).not.toContain(
      "LOCATION:Sydney"
    );
    const beforeRemoval = await database.feedEventPublication.findFirstOrThrow({
      where: { ...seeded.scope, feed_id: created.feedId },
    });
    await database.availabilityRecord.updateMany({
      data: { archived_at: new Date() },
      where: { ...seeded.scope, id: seeded.recordId },
    });
    const removed = await renderFeedForToken(created.plaintext);
    expect(removed.ok && removed.value.body).not.toContain("BEGIN:VEVENT");
    await database.availabilityRecord.updateMany({
      data: { archived_at: null },
      where: { ...seeded.scope, id: seeded.recordId },
    });
    await renderFeedForToken(created.plaintext);
    const returned = await database.feedEventPublication.findFirstOrThrow({
      where: { ...seeded.scope, feed_id: created.feedId },
    });
    expect(returned.published_uid).toBe(beforeRemoval.published_uid);
    expect(returned.published_sequence).toBe(
      beforeRemoval.published_sequence + 2
    );
  });

  test("versions holiday edits and membership when feed settings change", async () => {
    const created = await createTestFeed();
    const seeded = await seedRepresentationRecord();
    await database.feed.updateMany({
      data: { includes_public_holidays: true },
      where: { ...seeded.scope, id: created.feedId },
    });
    const holiday = await database.publicHoliday.create({
      data: {
        ...seeded.scope,
        country_code: "AU",
        holiday_date: seeded.startsAt,
        holiday_type: "custom",
        name: "Owned holiday",
        source: "manual",
      },
    });
    const first = await renderFeedForToken(created.plaintext);
    expect(first.ok && first.value.body).toContain("Owned holiday");
    await database.publicHoliday.updateMany({
      data: { name: "Renamed holiday" },
      where: { ...seeded.scope, id: holiday.id },
    });
    const second = await renderFeedForToken(created.plaintext);
    expect(second.ok && second.value.body).toContain("Renamed holiday");
    const ledger = await database.feedEventPublication.findFirstOrThrow({
      where: {
        ...seeded.scope,
        feed_id: created.feedId,
        source_key: `holiday:custom:${holiday.id}`,
      },
    });
    expect(ledger.published_sequence).toBe(1);
    await database.feed.updateMany({
      data: { includes_public_holidays: false },
      where: { ...seeded.scope, id: created.feedId },
    });
    const excluded = await renderFeedForToken(created.plaintext);
    expect(excluded.ok && excluded.value.body).not.toContain("Renamed holiday");
  });

  test("restores, issues exactly one new token, resumes, and keeps predecessor revoked", async () => {
    const created = await createTestFeed();
    const input = {
      actingRole: "org:admin",
      actingUserId: "user_admin",
      clerkOrgId: tenant.clerkOrgId,
      feedId: created.feedId,
      organisationId: tenant.organisationId,
    };
    expect(await archiveFeed(input)).toMatchObject({ ok: true });
    expect(await restoreFeed(input)).toMatchObject({ ok: true });
    const issued = await Promise.all([issueToken(input), issueToken(input)]);
    expect(issued.filter((result) => result.ok)).toHaveLength(1);
    const fresh = issued.find((result) => result.ok);
    if (!fresh?.ok) {
      throw new Error("Owned token issuance failed");
    }
    expect(await resumeFeed(input)).toMatchObject({ ok: true });
    expect(await renderFeedForToken(created.plaintext)).toMatchObject({
      ok: true,
      value: { status: "revoked" },
    });
    expect(await renderFeedForToken(fresh.value.plaintext)).toMatchObject({
      ok: true,
      value: { status: "active" },
    });
    expect(
      await issueToken({
        ...input,
        clerkOrgId: otherTenant.clerkOrgId,
        organisationId: otherTenant.organisationId,
      })
    ).toMatchObject({ ok: false });
  });

  test("serialises token issuance with archive so restore cannot resurrect an issued token", async () => {
    const feed = await createFeedWithoutToken();
    const input = {
      actingRole: "org:admin",
      actingUserId: "user_admin",
      clerkOrgId: tenant.clerkOrgId,
      feedId: feed.id,
      organisationId: tenant.organisationId,
    };
    const [issued, archived] = await Promise.all([
      issueToken(input),
      archiveFeed(input),
    ]);
    expect(archived.ok).toBe(true);
    await expect(
      database.feedToken.count({
        where: {
          clerk_org_id: tenant.clerkOrgId,
          feed_id: feed.id,
          organisation_id: tenant.organisationId,
          status: "active",
        },
      })
    ).resolves.toBe(0);
    expect(await restoreFeed(input)).toMatchObject({ ok: true });
    if (issued.ok) {
      expect(await renderFeedForToken(issued.value.plaintext)).toMatchObject({
        ok: true,
        value: { status: "revoked" },
      });
    }
  });

  test("exposes the one-active-token partial unique index", async () => {
    const indexes = await database.$queryRaw<
      Array<{ indexdef: string; indexname: string }>
    >`
      SELECT indexdef::text AS indexdef, indexname::text AS indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'feed_tokens'
        AND indexname = 'feed_tokens_one_active_per_feed_key'
    `;

    expect(indexes).toHaveLength(1);
    expect(indexes[0]?.indexdef).toContain("UNIQUE INDEX");
    expect(indexes[0]?.indexdef).toContain("WHERE (status = 'active'");
  });

  test("allows only one concurrent initial token", async () => {
    const feed = await createFeedWithoutToken();
    const input = {
      actingUserId: "user_admin",
      clerkOrgId: tenant.clerkOrgId,
      feedId: feed.id,
      organisationId: tenant.organisationId,
    };

    const results = await Promise.all([
      database.$transaction((tx) => createInitialTokenWithClient(tx, input)),
      database.$transaction((tx) => createInitialTokenWithClient(tx, input)),
    ]);

    const failures = results.filter((result) => !result.ok);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.error.code).toBe("initial_token_exists");
    expect(failures[0]?.error.message).toMatch(INITIAL_TOKEN_EXISTS_PATTERN);
    await expect(
      database.feedToken.count({
        where: { feed_id: feed.id, status: "active" },
      })
    ).resolves.toBe(1);
  });

  test("keeps one active token across concurrent rotations", async () => {
    const created = await createTestFeed();
    const initialTokenId = signedFeedTokenId(created.plaintext);
    const input = {
      actingRole: "owner",
      actingUserId: "user_owner",
      clerkOrgId: tenant.clerkOrgId,
      feedId: created.feedId,
      organisationId: tenant.organisationId,
    };

    const results = await Promise.all([rotateToken(input), rotateToken(input)]);
    const tokens = await database.feedToken.findMany({
      orderBy: { created_at: "asc" },
      where: { feed_id: created.feedId },
    });
    const activeTokens = tokens.filter((token) => token.status === "active");

    expect(activeTokens).toHaveLength(1);
    expect(tokens.find((token) => token.id === initialTokenId)).toMatchObject({
      status: "revoked",
    });
    expect(
      results.every(
        (result) => result.ok || result.error.code === "active_token_conflict"
      )
    ).toBe(true);
    await expect(renderFeedForToken(created.plaintext)).resolves.toMatchObject({
      ok: true,
      value: { status: "revoked" },
    });

    for (const result of results) {
      if (!result.ok && result.error.code === "active_token_conflict") {
        continue;
      }
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      const tokenId = signedFeedTokenId(result.value.plaintext);
      const stored = tokens.find((token) => token.id === tokenId);
      expect(stored?.status).toBe(
        tokenId === activeTokens[0]?.id ? "active" : "revoked"
      );
    }
  });

  test("creates feeds with a signed URL that can be loaded again", async () => {
    const result = await createFeed({
      actingRole: "org:admin",
      actingUserId: "user_admin",
      clerkOrgId: tenant.clerkOrgId,
      includesPublicHolidays: false,
      name: "All staff",
      organisationId: tenant.organisationId,
      privacyMode: "masked",
      scopes: [{ scopeType: "org", scopeValue: null }],
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(result.value.token.plaintext).toMatch(TOKEN_PATTERN);
    expect(result.value.token.hint).toBe(
      result.value.token.plaintext.slice(-4)
    );

    const tokenRows = await database.feedToken.findMany({
      where: { feed_id: result.value.feedId },
    });
    expect(tokenRows).toHaveLength(1);
    expect(tokenRows[0]?.token_hash).not.toBe(result.value.token.plaintext);

    const detail = await getFeedDetail({
      actingRole: "org:admin",
      actingUserId: "user_admin",
      clerkOrgId: tenant.clerkOrgId,
      feedId: result.value.feedId,
      organisationId: tenant.organisationId,
    });
    expect(detail).toMatchObject({
      ok: true,
      value: {
        subscribeUrl: `https://api.test.local/ical/${result.value.token.plaintext}.ics`,
      },
    });
  });

  test("provisions a default all-staff feed with an org scope and active token", async () => {
    const result = await ensureDefaultCalendarFeed({
      clerkOrgId: tenant.clerkOrgId,
      organisationId: tenant.organisationId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toMatchObject({ created: true });
    expect(result.value.token?.plaintext).toMatch(TOKEN_PATTERN);

    const feed = await database.feed.findUnique({
      where: { id: result.value.feedId },
    });
    expect(feed).toMatchObject({
      clerk_org_id: tenant.clerkOrgId,
      includes_public_holidays: false,
      name: "All staff",
      organisation_id: tenant.organisationId,
      privacy_mode: "named",
      slug: "all-staff",
      status: "active",
    });

    const scopes = await database.feedScope.findMany({
      where: { feed_id: result.value.feedId },
    });
    expect(scopes).toHaveLength(1);
    expect(scopes[0]).toMatchObject({
      clerk_org_id: tenant.clerkOrgId,
      organisation_id: tenant.organisationId,
      scope_type: "org",
      scope_value: null,
    });

    const tokens = await database.feedToken.findMany({
      where: { feed_id: result.value.feedId },
    });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      clerk_org_id: tenant.clerkOrgId,
      organisation_id: tenant.organisationId,
      status: "active",
    });
    expect(tokens[0]?.token_hash).not.toBe(result.value.token?.plaintext);
  });

  test("does not duplicate the default feed, scope, or token", async () => {
    const first = await ensureDefaultCalendarFeed({
      clerkOrgId: tenant.clerkOrgId,
      organisationId: tenant.organisationId,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const second = await ensureDefaultCalendarFeed({
      clerkOrgId: tenant.clerkOrgId,
      organisationId: tenant.organisationId,
    });

    expect(second).toMatchObject({
      ok: true,
      value: { created: false, feedId: first.value.feedId },
    });
    await expect(
      database.feed.count({
        where: {
          clerk_org_id: tenant.clerkOrgId,
          organisation_id: tenant.organisationId,
        },
      })
    ).resolves.toBe(1);
    await expect(
      database.feedScope.count({
        where: {
          clerk_org_id: tenant.clerkOrgId,
          organisation_id: tenant.organisationId,
        },
      })
    ).resolves.toBe(1);
    await expect(
      database.feedToken.count({
        where: {
          clerk_org_id: tenant.clerkOrgId,
          organisation_id: tenant.organisationId,
        },
      })
    ).resolves.toBe(1);
  });

  test("serialises concurrent default-feed provisioning", async () => {
    const results = await Promise.all([
      ensureDefaultCalendarFeed({
        clerkOrgId: tenant.clerkOrgId,
        organisationId: tenant.organisationId,
      }),
      ensureDefaultCalendarFeed({
        clerkOrgId: tenant.clerkOrgId,
        organisationId: tenant.organisationId,
      }),
    ]);

    expect(results.every((result) => result.ok)).toBe(true);
    expect(
      results.filter((result) => result.ok && result.value.created)
    ).toHaveLength(1);
    await expect(
      database.feed.count({
        where: {
          clerk_org_id: tenant.clerkOrgId,
          organisation_id: tenant.organisationId,
        },
      })
    ).resolves.toBe(1);
  });

  test("rejects at the exact feed limit despite a stale reporting counter", async () => {
    await Promise.all([
      seedActiveFeed(fixture.id("feed", 1), "first-limit"),
      seedActiveFeed(fixture.id("feed", 2), "second-limit"),
    ]);
    await database.usageCounter.create({
      data: {
        clerk_org_id: tenant.clerkOrgId,
        counter_type: "feeds",
        current_value: 0,
        metric_key: "feeds",
        period_end: new Date("9999-12-31T23:59:59.999Z"),
        period_start: new Date("1970-01-01T00:00:00.000Z"),
      },
    });

    await expect(
      createFeed({
        actingRole: "org:admin",
        actingUserId: "user_admin",
        clerkOrgId: tenant.clerkOrgId,
        includesPublicHolidays: false,
        name: "Blocked feed",
        organisationId: tenant.organisationId,
        privacyMode: "named",
        scopes: [{ scopeType: "org", scopeValue: null }],
      })
    ).resolves.toMatchObject({
      error: {
        code: "validation_error",
        message: "Your current plan has reached its active feed limit.",
      },
      ok: false,
    });
  });

  test("serialises concurrent feed creation at the final available slot", async () => {
    await seedActiveFeed(fixture.id("feed", 3), "existing-limit");

    const results = await Promise.all([
      createFeed({
        actingRole: "org:admin",
        actingUserId: "user_admin",
        clerkOrgId: tenant.clerkOrgId,
        includesPublicHolidays: false,
        name: "Concurrent one",
        organisationId: tenant.organisationId,
        privacyMode: "named",
        scopes: [{ scopeType: "org", scopeValue: null }],
      }),
      createFeed({
        actingRole: "org:admin",
        actingUserId: "user_admin",
        clerkOrgId: tenant.clerkOrgId,
        includesPublicHolidays: false,
        name: "Concurrent two",
        organisationId: tenant.organisationId,
        privacyMode: "named",
        scopes: [{ scopeType: "org", scopeValue: null }],
      }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results).toContainEqual({
      error: {
        code: "validation_error",
        message: "Your current plan has reached its active feed limit.",
      },
      ok: false,
    });
    await expect(
      database.feed.count({
        where: {
          archived_at: null,
          clerk_org_id: tenant.clerkOrgId,
          status: "active",
        },
      })
    ).resolves.toBe(2);
  }, 20_000);

  test("suffixes default feed slugs across organisations in one Clerk org", async () => {
    const secondOrganisationId = fixture.tenants[2]?.organisationId as string;
    await createTenant({
      clerkOrgId: tenant.clerkOrgId,
      organisationId: secondOrganisationId,
    });

    const first = await ensureDefaultCalendarFeed({
      clerkOrgId: tenant.clerkOrgId,
      organisationId: tenant.organisationId,
    });
    const second = await ensureDefaultCalendarFeed({
      clerkOrgId: tenant.clerkOrgId,
      organisationId: secondOrganisationId,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!(first.ok && second.ok)) {
      return;
    }

    const feeds = await database.feed.findMany({
      orderBy: { slug: "asc" },
      select: { organisation_id: true, slug: true },
      where: { clerk_org_id: tenant.clerkOrgId },
    });
    expect(feeds).toEqual([
      { organisation_id: tenant.organisationId, slug: "all-staff" },
      { organisation_id: secondOrganisationId, slug: "all-staff-2" },
    ]);
  });

  test("does not recreate a default feed after an admin archived one", async () => {
    const archived = await database.feed.create({
      data: {
        archived_at: new Date("2026-01-01T00:00:00.000Z"),
        clerk_org_id: tenant.clerkOrgId,
        name: "Archived all staff",
        organisation_id: tenant.organisationId,
        privacy_mode: "named",
        slug: "archived-all-staff",
        status: "archived",
      },
      select: { id: true },
    });

    const result = await ensureDefaultCalendarFeed({
      clerkOrgId: tenant.clerkOrgId,
      organisationId: tenant.organisationId,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { created: false, feedId: archived.id },
    });
    await expect(
      database.feed.count({
        where: {
          clerk_org_id: tenant.clerkOrgId,
          organisation_id: tenant.organisationId,
        },
      })
    ).resolves.toBe(1);
  });

  test("rotates tokens and revokes the old active token", async () => {
    const created = await createTestFeed();
    const rotated = await rotateToken({
      actingRole: "owner",
      actingUserId: "user_owner",
      clerkOrgId: tenant.clerkOrgId,
      feedId: created.feedId,
      organisationId: tenant.organisationId,
    });

    expect(rotated.ok).toBe(true);
    if (!rotated.ok) {
      return;
    }
    expect(rotated.value.plaintext).not.toBe(created.plaintext);

    const tokens = await database.feedToken.findMany({
      orderBy: { created_at: "asc" },
      where: { feed_id: created.feedId },
    });
    expect(tokens.map((token) => token.status)).toEqual(["revoked", "active"]);
    expect(tokens[1]?.rotated_from_token_id).toBe(tokens[0]?.id);
  });

  test("preserves token isolation when another org rotates or revokes", async () => {
    const created = await createTestFeed();
    const token = await database.feedToken.findFirstOrThrow({
      where: {
        clerk_org_id: tenant.clerkOrgId,
        feed_id: created.feedId,
        organisation_id: tenant.organisationId,
        status: "active",
      },
    });

    await expect(
      rotateToken({
        actingRole: "org:admin",
        actingUserId: "user_admin",
        clerkOrgId: otherTenant.clerkOrgId,
        feedId: created.feedId,
        organisationId: otherTenant.organisationId,
      })
    ).resolves.toMatchObject({
      error: { code: "feed_not_found" },
      ok: false,
    });

    await expect(
      revokeToken({
        actingRole: "org:admin",
        actingUserId: "user_admin",
        clerkOrgId: otherTenant.clerkOrgId,
        organisationId: otherTenant.organisationId,
        tokenId: token.id,
      })
    ).resolves.toMatchObject({
      error: { code: "token_not_found" },
      ok: false,
    });

    const activeToken = await database.feedToken.findUnique({
      where: { id: token.id },
    });
    expect(activeToken).toMatchObject({
      clerk_org_id: tenant.clerkOrgId,
      feed_id: created.feedId,
      organisation_id: tenant.organisationId,
      status: "active",
    });
    expect(activeToken?.revoked_at).toBeNull();
  });

  test("supports token lookup, rotation, and revoke-all round trip", async () => {
    const created = await createTestFeed();
    const initialTokenId = signedFeedTokenId(created.plaintext);
    expect(initialTokenId).not.toBeNull();
    const initialToken = await database.feedToken.findUnique({
      where: { id: initialTokenId ?? "" },
    });
    expect(initialToken).toMatchObject({
      clerk_org_id: tenant.clerkOrgId,
      feed_id: created.feedId,
      organisation_id: tenant.organisationId,
      status: "active",
    });

    const rotated = await rotateToken({
      actingRole: "owner",
      actingUserId: "user_owner",
      clerkOrgId: tenant.clerkOrgId,
      feedId: created.feedId,
      organisationId: tenant.organisationId,
    });
    expect(rotated.ok).toBe(true);
    if (!rotated.ok) {
      return;
    }

    const oldToken = await database.feedToken.findUnique({
      where: { id: initialTokenId ?? "" },
    });
    const newTokenId = signedFeedTokenId(rotated.value.plaintext);
    const newToken = await database.feedToken.findUnique({
      where: { id: newTokenId ?? "" },
    });
    expect(oldToken).toMatchObject({
      feed_id: created.feedId,
      status: "revoked",
    });
    expect(newToken).toMatchObject({
      feed_id: created.feedId,
      rotated_from_token_id: oldToken?.id,
      status: "active",
    });

    const revoked = await revokeAllFeedTokens({
      clerkOrgId: tenant.clerkOrgId,
      organisationId: tenant.organisationId,
    });
    expect(revoked).toMatchObject({
      ok: true,
      value: { revokedCount: 1 },
    });

    const activeTokens = await database.feedToken.findMany({
      where: {
        clerk_org_id: tenant.clerkOrgId,
        feed_id: created.feedId,
        organisation_id: tenant.organisationId,
        status: "active",
      },
    });
    expect(activeTokens).toHaveLength(0);
  });

  test("pauses feeds and preserves tenant isolation", async () => {
    const created = await createTestFeed();

    await expect(
      pauseFeed({
        actingRole: "org:admin",
        actingUserId: "user_admin",
        clerkOrgId: otherTenant.clerkOrgId,
        feedId: created.feedId,
        organisationId: otherTenant.organisationId,
      })
    ).resolves.toMatchObject({
      error: { code: "feed_not_found" },
      ok: false,
    });

    const paused = await pauseFeed({
      actingRole: "org:admin",
      actingUserId: "user_admin",
      clerkOrgId: tenant.clerkOrgId,
      feedId: created.feedId,
      organisationId: tenant.organisationId,
    });
    expect(paused).toMatchObject({
      ok: true,
      value: { status: "paused" },
    });

    await expect(renderFeedForToken(created.plaintext)).resolves.toMatchObject({
      ok: true,
      value: { status: "revoked" },
    });
  });
});

async function seedRepresentationRecord() {
  const scope = {
    clerk_org_id: tenant.clerkOrgId,
    organisation_id: tenant.organisationId,
  };
  const startsAt = new Date();
  startsAt.setUTCHours(0, 0, 0, 0);
  startsAt.setUTCDate(startsAt.getUTCDate() + 2);
  const location = await database.location.create({
    data: {
      ...scope,
      country_code: "AU",
      name: "Brisbane",
      timezone: "Australia/Brisbane",
    },
  });
  const person = await database.person.create({
    data: {
      ...scope,
      email: `owned-${crypto.randomUUID()}@example.test`,
      employment_type: "employee",
      first_name: "Owned",
      last_name: "Person",
      location_id: location.id,
      source_system: "MANUAL",
    },
  });
  const record = await database.availabilityRecord.create({
    data: {
      ...scope,
      approval_status: "approved",
      contactability: "contactable",
      derived_uid_key: `${crypto.randomUUID()}@ical.teamcalendar.online`,
      ends_at: startsAt,
      person_id: person.id,
      privacy_mode: "named",
      record_type: "wfh",
      source_type: "manual",
      starts_at: startsAt,
      title: "Owned availability",
    },
  });
  return {
    locationId: location.id,
    personId: person.id,
    recordId: record.id,
    scope,
    startsAt,
  };
}

async function createTestFeed() {
  const result = await createFeed({
    actingRole: "org:admin",
    actingUserId: "user_admin",
    clerkOrgId: tenant.clerkOrgId,
    includesPublicHolidays: false,
    name: "Calendar feed",
    organisationId: tenant.organisationId,
    privacyMode: "named",
    scopes: [{ scopeType: "org", scopeValue: null }],
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return {
    feedId: result.value.feedId,
    plaintext: result.value.token.plaintext,
  };
}

async function createFeedWithoutToken() {
  return await database.feed.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      created_by_user_id: "user_admin",
      name: "Concurrent token feed",
      organisation_id: tenant.organisationId,
      privacy_mode: "named",
      slug: `concurrent-token-${crypto.randomUUID()}`,
      status: "active",
    },
    select: { id: true },
  });
}

async function seedActiveFeed(id: string, slug: string) {
  await database.feed.create({
    data: {
      clerk_org_id: tenant.clerkOrgId,
      id,
      name: slug,
      organisation_id: tenant.organisationId,
      privacy_mode: "named",
      slug,
      status: "active",
    },
  });
}

async function createTenant(input: typeof tenant) {
  await database.organisation.create({
    data: {
      clerk_org_id: input.clerkOrgId,
      country_code: "AU",
      id: input.organisationId,
      name: `Feed services ${input.clerkOrgId}`,
    },
  });
}

async function cleanTestData() {
  const feeds = await database.feed.findMany({
    select: { id: true },
    where: {
      clerk_org_id: { in: clerkOrgIds },
      organisation_id: {
        in: [tenant.organisationId, otherTenant.organisationId],
      },
    },
  });
  await purgeOwnedFeedCacheKeys({
    feedIds: feeds.map((feed) => feed.id),
  });

  await database.clerkOrgSubscription.deleteMany({
    where: { clerk_org_id: { in: clerkOrgIds } },
  });
  await database.usageCounter.deleteMany({
    where: { clerk_org_id: { in: clerkOrgIds } },
  });
  await database.auditEvent.deleteMany({
    where: { clerk_org_id: { in: clerkOrgIds } },
  });
  await database.publicHolidayPreference.deleteMany({
    where: { clerk_org_id: { in: clerkOrgIds } },
  });
  await database.publicHoliday.deleteMany({
    where: { clerk_org_id: { in: clerkOrgIds } },
  });
  await database.feedEventPublication.deleteMany({
    where: { clerk_org_id: { in: clerkOrgIds } },
  });
  await database.feedToken.deleteMany({
    where: { clerk_org_id: { in: clerkOrgIds } },
  });
  await database.feedScope.deleteMany({
    where: { clerk_org_id: { in: clerkOrgIds } },
  });
  await database.feed.deleteMany({
    where: { clerk_org_id: { in: clerkOrgIds } },
  });
  await database.availabilityPublication.deleteMany({
    where: { clerk_org_id: { in: clerkOrgIds } },
  });
  await database.availabilityRecord.deleteMany({
    where: { clerk_org_id: { in: clerkOrgIds } },
  });
  await database.person.deleteMany({
    where: { clerk_org_id: { in: clerkOrgIds } },
  });
  await database.location.deleteMany({
    where: { clerk_org_id: { in: clerkOrgIds } },
  });
  await database.organisation.deleteMany({
    where: { clerk_org_id: { in: clerkOrgIds } },
  });
}
