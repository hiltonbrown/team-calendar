import { config } from "dotenv";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

config({ path: new URL("../database/.env", import.meta.url).pathname });
// getFeedDetail builds the masked subscribe URL from the API origin and now
// requires it to be configured. Provide one for the integration environment.
process.env.NEXT_PUBLIC_API_URL ||= "https://api.test.local";
vi.mock("server-only", () => ({}));

let createFeed: typeof import("./index")["createFeed"];
let hashFeedToken: typeof import("./index")["hashFeedToken"];
let pauseFeed: typeof import("./index")["pauseFeed"];
let renderFeedForToken: typeof import("./index")["renderFeedForToken"];
let revokeAllFeedTokens: typeof import("./index")["revokeAllFeedTokens"];
let revokeToken: typeof import("./index")["revokeToken"];
let rotateToken: typeof import("./index")["rotateToken"];
let database: typeof import("@repo/database")["database"];

const describeWithDatabase = process.env.DATABASE_URL
  ? describe
  : describe.skip;

if (process.env.DATABASE_URL) {
  ({
    createFeed,
    hashFeedToken,
    pauseFeed,
    renderFeedForToken,
    revokeAllFeedTokens,
    revokeToken,
    rotateToken,
  } = await import("./index"));
  ({ database } = await import("@repo/database"));
}

const tenant = {
  clerkOrgId: "org_test_feed_services_a",
  organisationId: "51000000-0000-4000-8000-000000000001",
};
const otherTenant = {
  clerkOrgId: "org_test_feed_services_b",
  organisationId: "52000000-0000-4000-8000-000000000001",
};
const clerkOrgIds = [tenant.clerkOrgId, otherTenant.clerkOrgId];
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40}$/;

describeWithDatabase("feed services", () => {
  beforeEach(async () => {
    await cleanTestData();
    await createTenant(tenant);
    await createTenant(otherTenant);
  });

  afterAll(async () => {
    await cleanTestData();
    await database.$disconnect();
  });

  test("creates feeds with a one-time plaintext token and persisted hash", async () => {
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

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.token.plaintext).toMatch(TOKEN_PATTERN);
    expect(result.value.token.hint).toBe(
      result.value.token.plaintext.slice(-4)
    );

    const tokenRows = await database.feedToken.findMany({
      where: { feed_id: result.value.feedId },
    });
    expect(tokenRows).toHaveLength(1);
    expect(tokenRows[0]?.token_hash).toBe(
      hashFeedToken(result.value.token.plaintext)
    );
    expect(tokenRows[0]?.token_hash).not.toBe(result.value.token.plaintext);
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
      ok: false,
      error: { code: "cross_org_leak" },
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
      ok: false,
      error: { code: "cross_org_leak" },
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
    const initialToken = await database.feedToken.findUnique({
      where: { token_hash: hashFeedToken(created.plaintext) },
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
      where: { token_hash: hashFeedToken(created.plaintext) },
    });
    const newToken = await database.feedToken.findUnique({
      where: { token_hash: hashFeedToken(rotated.value.plaintext) },
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
      ok: false,
      error: { code: "cross_org_leak" },
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
