import { config } from "dotenv";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

config({ path: new URL("../database/.env", import.meta.url).pathname });
vi.mock("server-only", () => ({}));

const {
  createFeed,
  hashFeedToken,
  pauseFeed,
  renderFeedForToken,
  rotateToken,
} = await import("./index");
const { database } = await import("@repo/database");

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

beforeEach(async () => {
  await cleanTestData();
  await createTenant(tenant);
  await createTenant(otherTenant);
});

afterAll(async () => {
  await cleanTestData();
  await database.$disconnect();
});

describe("feed services", () => {
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
