import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyticsCapture: vi.fn(),
  analyticsFlush: vi.fn(),
  archiveFeed: vi.fn(),
  auth: vi.fn(),
  createFeed: vi.fn(),
  createOwnFeed: vi.fn(),
  currentUser: vi.fn(),
  database: {
    feed: {
      findFirst: vi.fn(),
    },
  },
  dispatchNotification: vi.fn(),
  getActiveOrgContext: vi.fn(),
  issueToken: vi.fn(),
  log: {
    error: vi.fn(),
    warn: vi.fn(),
  },
  pauseFeed: vi.fn(),
  restoreFeed: vi.fn(),
  resumeFeed: vi.fn(),
  revalidatePath: vi.fn(),
  revokeToken: vi.fn(),
  rotateToken: vi.fn(),
  updateFeed: vi.fn(),
}));

vi.mock("@repo/analytics/server", () => ({
  analytics: { capture: mocks.analyticsCapture, flush: mocks.analyticsFlush },
}));
vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/feeds", () => ({
  archiveFeed: mocks.archiveFeed,
  buildFeedSubscribeUrl: (token: string) =>
    `https://calendar.example/ical/${token}.ics`,
  createFeed: mocks.createFeed,
  createOwnFeed: mocks.createOwnFeed,
  issueToken: mocks.issueToken,
  normaliseRole: (role: string | null | undefined) =>
    role?.replace("org:", "") ?? "viewer",
  pauseFeed: mocks.pauseFeed,
  restoreFeed: mocks.restoreFeed,
  resumeFeed: mocks.resumeFeed,
  revokeToken: mocks.revokeToken,
  rotateToken: mocks.rotateToken,
  updateFeed: mocks.updateFeed,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));
vi.mock("@repo/database", () => ({
  database: mocks.database,
}));
vi.mock("@repo/observability/log", () => ({
  log: mocks.log,
}));
vi.mock("@repo/notifications", () => ({
  dispatchNotification: mocks.dispatchNotification,
}));

const {
  archiveFeedAction,
  createFeedAction,
  createOwnFeedAction,
  issueTokenAction,
  pauseFeedAction,
  restoreFeedAction,
  rotateTokenAction,
  updateFeedAction,
} = await import("./_actions");

const organisationId = "00000000-0000-4000-8000-000000000001";
const feedId = "00000000-0000-4000-8000-000000000101";

describe("feed actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ orgRole: "org:admin" });
    mocks.currentUser.mockResolvedValue({ id: "user_1" });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { clerkOrgId: "org_1", organisationId },
    });
    mocks.createFeed.mockResolvedValue({
      ok: true,
      value: {
        feedId,
        token: { hint: "abcd", plaintext: "token_plaintext" },
      },
    });
    mocks.updateFeed.mockResolvedValue({ ok: true, value: { feedId } });
    mocks.pauseFeed.mockResolvedValue({ ok: true, value: { feedId } });
    mocks.rotateToken.mockResolvedValue({
      ok: true,
      value: { hint: "wxyz", plaintext: "new_plaintext", tokenId: feedId },
    });
    mocks.dispatchNotification.mockResolvedValue({
      ok: true,
      value: { emailQueued: true, inAppDelivered: true },
    });
    mocks.database.feed.findFirst.mockResolvedValue({
      name: "Internal Calendar",
    });
  });

  it.each(["org:admin", "org:owner"])(
    "issues a usable URL with authorised %s identity and both tenant scopes",
    async (orgRole) => {
      mocks.auth.mockResolvedValue({ orgRole });
      mocks.issueToken.mockResolvedValue({
        ok: true,
        value: { plaintext: "issued_plaintext", tokenId: "token-issued" },
      });
      const result = await issueTokenAction({ feedId, organisationId });
      expect(result).toEqual({
        ok: true,
        value: {
          subscribeUrl: "https://calendar.example/ical/issued_plaintext.ics",
          tokenId: "token-issued",
        },
      });
      expect(mocks.issueToken).toHaveBeenCalledWith({
        actingRole: orgRole.replace("org:", ""),
        actingUserId: "user_1",
        clerkOrgId: "org_1",
        feedId,
        organisationId,
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/feeds");
      expect(mocks.revalidatePath).toHaveBeenCalledWith(`/feeds/${feedId}`);
    }
  );

  it.each(["org:viewer", "org:manager", null])(
    "denies token issuance to %s without calling the service",
    async (orgRole) => {
      mocks.auth.mockResolvedValue({ orgRole });
      expect(await issueTokenAction({ feedId, organisationId })).toMatchObject({
        error: { code: "not_authorised" },
        ok: false,
      });
      expect(mocks.issueToken).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    }
  );

  it("rejects an inaccessible organisation before token issuance", async () => {
    mocks.getActiveOrgContext.mockResolvedValue({
      error: { message: "Organisation is not available" },
      ok: false,
    });
    expect(await issueTokenAction({ feedId, organisationId })).toMatchObject({
      error: { code: "not_authorised" },
      ok: false,
    });
    expect(mocks.issueToken).not.toHaveBeenCalled();
  });

  it("returns issuance failures without revalidation or a URL receipt", async () => {
    const failure = {
      error: { code: "conflict", message: "An active token already exists" },
      ok: false,
    };
    mocks.issueToken.mockResolvedValue(failure);
    expect(await issueTokenAction({ feedId, organisationId })).toEqual(failure);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects malformed token issuance input", async () => {
    expect(
      await issueTokenAction({ feedId: "invalid", organisationId })
    ).toMatchObject({ error: { code: "validation_error" }, ok: false });
    expect(mocks.issueToken).not.toHaveBeenCalled();
  });

  it("revalidates feed and settings paths after create", async () => {
    const result = await createFeedAction({
      includesPublicHolidays: false,
      name: "Team availability",
      organisationId,
      privacyMode: "named",
      scopes: [{ scopeType: "org" }],
    });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({
      value: {
        feedId,
        subscribeUrl: "https://calendar.example/ical/token_plaintext.ics",
      },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/feeds");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/feeds/${feedId}`);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings/feeds");
  });

  it("revalidates settings after feed lifecycle updates", async () => {
    await updateFeedAction({
      feedId,
      organisationId,
      patch: { name: "Updated feed" },
    });
    await pauseFeedAction({ feedId, organisationId });

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings/feeds");
  });

  it("does not revalidate settings after token rotation", async () => {
    await rotateTokenAction({ feedId, organisationId });

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/feeds");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/feeds/${feedId}`);
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/settings/feeds");
  });

  describe("rotateTokenAction notification", () => {
    it("dispatches notification on successful rotation with feed name in body", async () => {
      const result = await rotateTokenAction({ feedId, organisationId });

      expect(result.ok).toBe(true);
      expect(result).toMatchObject({
        value: {
          subscribeUrl: "https://calendar.example/ical/new_plaintext.ics",
          tokenId: feedId,
        },
      });
      expect(mocks.database.feed.findFirst).toHaveBeenCalledWith({
        select: { name: true },
        where: {
          clerk_org_id: "org_1",
          id: feedId,
          organisation_id: organisationId,
        },
      });
      expect(mocks.dispatchNotification).toHaveBeenCalledWith({
        actionUrl: `/feeds/${feedId}?org=${organisationId}`,
        actorUserId: "user_1",
        body: 'The token for calendar feed "Internal Calendar" has been rotated.',
        clerkOrgId: "org_1",
        objectId: feedId,
        objectType: "feed",
        organisationId,
        recipientPersonId: null,
        recipientUserId: "user_1",
        title: "Feed token rotated",
        type: "feed_token_rotated",
      });
    });

    it("falls back to body without name when feed name query fails or returns null", async () => {
      mocks.database.feed.findFirst.mockResolvedValue(null);

      const result = await rotateTokenAction({ feedId, organisationId });

      expect(result.ok).toBe(true);
      expect(mocks.dispatchNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "A calendar feed token has been rotated.",
        })
      );
    });

    it("does not fail rotation action and logs error when dispatch fails", async () => {
      mocks.dispatchNotification.mockResolvedValue({
        error: { code: "unknown_error", message: "Dispatch failed" },
        ok: false,
      });

      const result = await rotateTokenAction({ feedId, organisationId });

      expect(result.ok).toBe(true);
      expect(mocks.log.error).toHaveBeenCalledWith(
        "Failed to dispatch feed token rotation notification",
        expect.objectContaining({
          error: { code: "unknown_error", message: "Dispatch failed" },
          feedId,
        })
      );
    });

    it("does not dispatch notification when token rotation itself fails", async () => {
      mocks.rotateToken.mockResolvedValue({
        error: { code: "token_not_found", message: "Feed has no active token" },
        ok: false,
      });

      const result = await rotateTokenAction({ feedId, organisationId });

      expect(result.ok).toBe(false);
      expect(mocks.dispatchNotification).not.toHaveBeenCalled();
    });
  });

  describe("owner self-service", () => {
    beforeEach(() => {
      mocks.auth.mockResolvedValue({ orgRole: "org:viewer" });
    });

    it.each([
      ["pause", () => pauseFeedAction({ feedId, organisationId }), "pauseFeed"],
      [
        "archive",
        () => archiveFeedAction({ feedId, organisationId }),
        "archiveFeed",
      ],
      [
        "rotate",
        () => rotateTokenAction({ feedId, organisationId }),
        "rotateToken",
      ],
      [
        "update",
        () =>
          updateFeedAction({
            feedId,
            organisationId,
            patch: { privacyMode: "private" },
          }),
        "updateFeed",
      ],
    ] as const)(
      "lets the feed service decide whether a member may %s",
      async (_name, run, service) => {
        mocks[service].mockResolvedValue({
          error: { code: "not_authorised", message: "No" },
          ok: false,
        });
        expect(await run()).toMatchObject({
          error: { code: "not_authorised" },
          ok: false,
        });
        expect(mocks[service]).toHaveBeenCalledWith(
          expect.objectContaining({
            actingRole: "viewer",
            actingUserId: "user_1",
          })
        );
      }
    );

    it("keeps restore and admin creation admin only", async () => {
      expect(await restoreFeedAction({ feedId, organisationId })).toMatchObject(
        { error: { code: "not_authorised" }, ok: false }
      );
      expect(mocks.restoreFeed).not.toHaveBeenCalled();
      expect(
        await createFeedAction({
          includesPublicHolidays: false,
          name: "Everyone",
          organisationId,
          privacyMode: "named",
          scopes: [{ scopeType: "org", scopeValue: null }],
        })
      ).toMatchObject({ error: { code: "not_authorised" }, ok: false });
      expect(mocks.createFeed).not.toHaveBeenCalled();
    });

    it("rejects callers without an organisation role", async () => {
      mocks.auth.mockResolvedValue({ orgRole: null });
      expect(
        await createOwnFeedAction({ kind: "personal", organisationId })
      ).toMatchObject({ error: { code: "not_authorised" }, ok: false });
      expect(mocks.createOwnFeed).not.toHaveBeenCalled();
    });

    it("creates an own feed, records it once and revalidates", async () => {
      mocks.createOwnFeed.mockResolvedValue({
        ok: true,
        value: { created: true, feedId },
      });
      expect(
        await createOwnFeedAction({ kind: "team", organisationId })
      ).toEqual({ ok: true, value: { created: true, feedId } });
      expect(mocks.createOwnFeed).toHaveBeenCalledWith({
        actingRole: "viewer",
        actingUserId: "user_1",
        clerkOrgId: "org_1",
        kind: "team",
        organisationId,
      });
      expect(mocks.analyticsCapture).toHaveBeenCalledWith({
        distinctId: "user_1",
        event: "Personal Feed Created",
        properties: { kind: "team" },
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/feeds");

      mocks.analyticsCapture.mockClear();
      mocks.createOwnFeed.mockResolvedValue({
        ok: true,
        value: { created: false, feedId },
      });
      await createOwnFeedAction({ kind: "team", organisationId });
      expect(mocks.analyticsCapture).not.toHaveBeenCalled();
    });
  });
});
