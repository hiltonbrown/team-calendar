// biome-ignore-all lint/style/useFilenamingConvention: Co-located integration suite naming.
import {
  initialiseLiveCampaignFixture,
  isProtectedLiveRun,
} from "@repo/database/live-campaign-fixture";
import { allocateLiveTestFixture } from "@repo/database/live-test-fixture";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

describe.skipIf(!isProtectedLiveRun())("protected campaign integration", () => {
  if (!isProtectedLiveRun()) {
    it.skip("requires the protected live runner", () => {
      /* Collection does not allocate fixtures outside protected runs. */
    });
    return;
  }

  const fixture = allocateLiveTestFixture(
    "packages/xero/src/oauth/inactivity-report.integration.test.ts"
  );
  const now = new Date("2026-09-26T00:00:00Z");
  const [first, second] = fixture.tenants;
  if (!(first && second)) {
    throw new Error("Missing owned inactivity fixture slots");
  }
  const slots = [first, second];
  let sameAccount = false;
  let database: typeof import("@repo/database")["database"];
  let report: typeof import("./inactivity-report");
  const scope = (index = 0) => {
    const slot = slots[index];
    if (!slot) {
      throw new Error("Missing fixture slot");
    }
    return {
      clerkOrgId:
        index === 1 && sameAccount ? first.clerkOrgId : slot.clerkOrgId,
      now,
      organisationId: slot.organisationId,
    };
  };
  const where = (index = 0) => ({
    clerk_org_id: scope(index).clerkOrgId,
    organisation_id: scope(index).organisationId,
  });
  async function cleanup() {
    if (!database) {
      return;
    }
    for (const clerk of slots) {
      for (const entity of slots) {
        const w = {
          clerk_org_id: clerk.clerkOrgId,
          organisation_id: entity.organisationId,
        };
        await database.xeroInactivityClassification.deleteMany({ where: w });
        await database.auditEvent.deleteMany({ where: w });
        await database.feedToken.deleteMany({ where: w });
        await database.feed.deleteMany({ where: w });
        await database.xeroTenant.deleteMany({ where: w });
        await database.xeroConnection.deleteMany({ where: w });
        await database.organisation.deleteMany({
          where: { clerk_org_id: w.clerk_org_id, id: w.organisation_id },
        });
      }
    }
  }
  async function seed() {
    for (let i = 0; i < slots.length; i += 1) {
      const w = where(i);
      await database.organisation.create({
        data: {
          clerk_org_id: w.clerk_org_id,
          country_code: "AU",
          id: w.organisation_id,
          name: "Inactivity fixture",
        },
      });
      await database.xeroConnection.create({
        data: {
          ...w,
          access_token_encrypted: "synthetic",
          expires_at: now,
          id: fixture.id("connection", i),
          refresh_token_encrypted: "synthetic",
          status: "disconnected",
        },
      });
      await database.xeroTenant.create({
        data: {
          ...w,
          active_slot: 1,
          id: fixture.id("tenant", i),
          payroll_region: "AU",
          provider_app_id: fixture.globalKey("provider_app"),
          xero_connection_id: fixture.id("connection", i),
          xero_tenant_id: fixture.id("external", i),
        },
      });
    }
  }
  async function feedUsage(index: number, date: Date) {
    const w = where(index);
    const feedId = fixture.id("feed", index);
    await database.feed.create({
      data: {
        ...w,
        id: feedId,
        name: "Fixture feed",
        slug: fixture.key("feed", index),
      },
    });
    await database.feedToken.create({
      data: {
        ...w,
        feed_id: feedId,
        id: fixture.id("old-token", index),
        last_used_at: date,
        revoked_at: now,
        status: "revoked",
        token_hash: fixture.key("old-token", index),
        token_hint: "fixture",
      },
    });
    await database.feedToken.create({
      data: {
        ...w,
        feed_id: feedId,
        id: fixture.id("new-token", index),
        status: "active",
        token_hash: fixture.key("new-token", index),
        token_hint: "fixture",
      },
    });
  }
  describe("owned report-only inactivity persistence", () => {
    beforeAll(async () => {
      ({ database } = await import("@repo/database"));
      report = await import("./inactivity-report");
    });
    beforeEach(async () => {
      await cleanup();
      sameAccount = false;
      await seed();
    });
    afterAll(async () => {
      await cleanup();
      await database?.$disconnect();
    });
    it("recent historical feed consumption remains active despite rotation and absent human evidence", async () => {
      await feedUsage(0, new Date("2026-09-25"));
      await database.auditEvent.create({
        data: {
          ...where(),
          action: "fixture",
          actor_user_id: "fixture-user",
          created_at: new Date("2026-03-25"),
          resource_type: "fixture",
        },
      });
      expect(await report.buildXeroInactivityReport(scope())).toEqual({
        ok: true,
        value: { active: 1, candidate: 0, unknown: 0 },
      });
      expect(
        await database.xeroInactivityClassification.findFirst({
          where: where(),
        })
      ).toMatchObject({
        kind: "active",
        policy_version: 1,
        review_status: "unreviewed",
        xero_tenant_id: fixture.id("tenant", 0),
      });
      expect(
        await database.xeroTenant.findFirst({ where: where() })
      ).toMatchObject({ active_slot: 1, retired_at: null });
      expect(
        await database.xeroConnection.findFirst({ where: where() })
      ).toMatchObject({ status: "disconnected" });
    });
    it("missing evidence stays unknown and wrong scope creates no foreign classification", async () => {
      expect(await report.buildXeroInactivityReport(scope())).toEqual({
        ok: true,
        value: { active: 0, candidate: 0, unknown: 1 },
      });
      const wrong = { ...scope(), organisationId: scope(1).organisationId };
      expect(await report.buildXeroInactivityReport(wrong)).toEqual({
        ok: true,
        value: { active: 0, candidate: 0, unknown: 0 },
      });
      const { recordXeroInactivityClassification } = await import(
        "@repo/database/queries/xero-inactivity-signals"
      );
      await expect(
        recordXeroInactivityClassification({
          ...scope(),
          kind: "candidate",
          policyVersion: 1,
          reason: "fixture",
          xeroTenantId: fixture.id("tenant", 1),
        })
      ).rejects.toThrow("owned tenant");
      expect(
        await database.xeroInactivityClassification.count({ where: where(1) })
      ).toBe(0);
    });
    it("another organisation in the same Clerk account cannot supply feed or human activity", async () => {
      await cleanup();
      sameAccount = true;
      await seed();
      await feedUsage(1, new Date("2026-09-25"));
      await database.auditEvent.create({
        data: {
          ...where(1),
          action: "fixture",
          actor_user_id: "fixture-user",
          created_at: now,
          resource_type: "fixture",
        },
      });
      await database.auditEvent.create({
        data: {
          ...where(),
          action: "sync",
          actor_user_id: null,
          created_at: now,
          resource_type: "fixture",
        },
      });
      expect(await report.buildXeroInactivityReport(scope())).toEqual({
        ok: true,
        value: { active: 0, candidate: 0, unknown: 1 },
      });
    });
    it("paused reserved binding is active and retired binding is not reported", async () => {
      await database.xeroTenant.updateMany({
        data: { sync_paused_at: now },
        where: where(),
      });
      expect(await report.buildXeroInactivityReport(scope())).toMatchObject({
        ok: true,
        value: { active: 1 },
      });
      await database.xeroTenant.updateMany({
        data: {
          active_slot: null,
          retired_at: now,
          retirement_reason: "fixture",
        },
        where: where(),
      });
      expect(await report.buildXeroInactivityReport(scope())).toMatchObject({
        ok: true,
        value: { active: 0, candidate: 0, unknown: 0 },
      });
    });
  });

  // The protected runner owns this real isolated campaign control namespace.
  beforeAll(() => initialiseLiveCampaignFixture(fixture));
});
