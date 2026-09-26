import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  binding: vi.fn(),
  bindings: vi.fn(),
  create: vi.fn(),
  feeds: vi.fn(),
  subscription: vi.fn(),
}));
vi.mock("../client", () => ({
  database: {
    auditEvent: { findFirst: mocks.audit },
    clerkOrgSubscription: { findUnique: mocks.subscription },
    feed: { findMany: mocks.feeds },
    xeroInactivityClassification: { create: mocks.create },
    xeroTenant: { findFirst: mocks.binding, findMany: mocks.bindings },
  },
}));

import {
  listXeroInactivitySignals,
  recordXeroInactivityClassification,
} from "./xero-inactivity-signals";

const input = {
  clerkOrgId: "org",
  now: new Date("2026-09-26"),
  organisationId: "entity",
};
const where = { clerk_org_id: "org", organisation_id: "entity" };
describe("scoped minimal inactivity signals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bindings.mockResolvedValue([
      {
        id: "tenant",
        ...where,
        organisation: { archived_at: null },
        sync_paused_at: null,
      },
    ]);
    mocks.subscription.mockResolvedValue(null);
    mocks.feeds.mockResolvedValue([]);
    mocks.audit.mockResolvedValue(null);
    mocks.binding.mockResolvedValue({ id: "tenant" });
    mocks.create.mockResolvedValue({});
  });
  it("enumerates reserved unretired bindings and selects no credentials or names", async () => {
    await listXeroInactivitySignals(input);
    expect(mocks.bindings).toHaveBeenCalledWith({
      select: {
        clerk_org_id: true,
        id: true,
        organisation: { select: { archived_at: true } },
        organisation_id: true,
        sync_paused_at: true,
      },
      where: {
        ...where,
        active_slot: 1,
        organisation: { clerk_org_id: "org", id: "entity" },
        retired_at: null,
      },
    });
    expect(mocks.audit).toHaveBeenCalledWith({
      orderBy: { created_at: "desc" },
      select: { created_at: true },
      where: { ...where, actor_user_id: { not: null } },
    });
    expect(mocks.feeds).toHaveBeenCalledWith({
      select: {
        tokens: {
          select: {
            expires_at: true,
            last_used_at: true,
            revoked_at: true,
            status: true,
          },
          where,
        },
      },
      where: { ...where, archived_at: null, status: "active" },
    });
    expect(mocks.subscription).toHaveBeenCalledWith({
      select: { status: true },
      where: { clerk_org_id: "org" },
    });
  });
  it("missing and unrecognised subscription/human/feed coverage stays unknown", async () => {
    for (const status of [null, "past_due", "unpaid", "incomplete"]) {
      mocks.subscription.mockResolvedValue(status ? { status } : null);
      expect((await listXeroInactivitySignals(input))[0]).toMatchObject({
        feedLastUsedAt: "unknown",
        lastHumanActivityAt: "unknown",
        onboardingComplete: "unknown",
        subscriptionActive: "unknown",
      });
    }
  });
  it("known active never-used tokens prove a known null, expired tokens do not", async () => {
    mocks.feeds.mockResolvedValue([
      {
        tokens: [
          {
            expires_at: null,
            last_used_at: null,
            revoked_at: null,
            status: "active",
          },
        ],
      },
    ]);
    expect(
      (await listXeroInactivitySignals(input))[0]?.feedLastUsedAt
    ).toBeNull();
    mocks.feeds.mockResolvedValue([
      {
        tokens: [
          {
            expires_at: new Date("2026-09-25"),
            last_used_at: null,
            revoked_at: null,
            status: "active",
          },
        ],
      },
    ]);
    expect((await listXeroInactivitySignals(input))[0]?.feedLastUsedAt).toBe(
      "unknown"
    );
  });
  it("preserves recent historical consumption after token rotation", async () => {
    const recent = new Date("2026-09-25");
    mocks.feeds.mockResolvedValue([
      {
        tokens: [
          {
            expires_at: null,
            last_used_at: recent,
            revoked_at: recent,
            status: "revoked",
          },
          {
            expires_at: null,
            last_used_at: null,
            revoked_at: null,
            status: "active",
          },
        ],
      },
    ]);
    expect((await listXeroInactivitySignals(input))[0]?.feedLastUsedAt).toEqual(
      recent
    );
  });
  it.each(["feeds", "audit", "subscription"] as const)(
    "unreadable %s becomes unknown without losing other known activity",
    async (signal) => {
      mocks[signal].mockRejectedValue(new Error("secret"));
      const [row] = await listXeroInactivitySignals(input);
      expect(row).toBeDefined();
      expect(row).toMatchObject({
        [{
          audit: "lastHumanActivityAt",
          feeds: "feedLastUsedAt",
          subscription: "subscriptionActive",
        }[signal]]: "unknown",
      });
    }
  );
  it("validates tenant membership before inserting both scope IDs", async () => {
    const row = {
      ...input,
      kind: "unknown" as const,
      policyVersion: 1,
      reason: "unknown",
      xeroTenantId: "tenant",
    };
    await recordXeroInactivityClassification(row);
    expect(mocks.binding).toHaveBeenCalledWith({
      select: { id: true },
      where: { ...where, id: "tenant" },
    });
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        ...where,
        classified_at: input.now,
        kind: "unknown",
        policy_version: 1,
        reason: "unknown",
        xero_tenant_id: "tenant",
      },
    });
    mocks.binding.mockResolvedValue(null);
    mocks.create.mockClear();
    await expect(recordXeroInactivityClassification(row)).rejects.toThrow(
      "owned tenant"
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
