import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

// getFeedDetail builds the full subscribe URL from the API origin and
// requires it to be configured. Provide one for the integration environment.
process.env.NEXT_PUBLIC_API_URL ||= "https://api.test.local";
vi.mock("server-only", () => ({}));

const fixture = allocateLiveTestFixture(
  "packages/feeds/index.integration.test.ts"
);
const {
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
  await database.clerkOrgSubscription.deleteMany({
    where: { clerk_org_id: { in: clerkOrgIds } },
  });
  await database.usageCounter.deleteMany({
    where: { clerk_org_id: { in: clerkOrgIds } },
  });
  await database.auditEvent.deleteMany({
    where: { clerk_org_id: { in: clerkOrgIds } },
  });
  await database.publicHolidayAssignment.deleteMany({
    where: { clerk_org_id: { in: clerkOrgIds } },
  });
  await database.publicHoliday.deleteMany({
    where: { clerk_org_id: { in: clerkOrgIds } },
  });
  await database.publicHolidayJurisdiction.deleteMany({
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
  await database.organisation.deleteMany({
    where: { clerk_org_id: { in: clerkOrgIds } },
  });
}
