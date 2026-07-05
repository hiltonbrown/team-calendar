import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  archiveFeed: vi.fn(),
  auth: vi.fn(),
  createFeed: vi.fn(),
  currentUser: vi.fn(),
  getActiveOrgContext: vi.fn(),
  pauseFeed: vi.fn(),
  restoreFeed: vi.fn(),
  resumeFeed: vi.fn(),
  revokeToken: vi.fn(),
  rotateToken: vi.fn(),
  updateFeed: vi.fn(),
  revalidatePath: vi.fn(),
  dispatchNotification: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/feeds", () => ({
  archiveFeed: mocks.archiveFeed,
  createFeed: mocks.createFeed,
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
vi.mock("@repo/notifications", () => ({
  dispatchNotification: mocks.dispatchNotification,
}));
vi.mock("@repo/observability/log", () => ({
  log: {
    error: mocks.logError,
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const {
  createFeedAction,
  pauseFeedAction,
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
      value: { inAppDelivered: true, emailQueued: false },
    });
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

  describe("rotateTokenAction - notifications", () => {
    it("dispatches a notification on successful token rotation", async () => {
      mocks.dispatchNotification.mockResolvedValue({
        ok: true,
        value: { inAppDelivered: true, emailQueued: false },
      });

      const result = await rotateTokenAction({ feedId, organisationId });

      expect(result.ok).toBe(true);
      expect(mocks.dispatchNotification).toHaveBeenCalledTimes(1);
      expect(mocks.dispatchNotification).toHaveBeenCalledWith({
        actionUrl: `/feeds/${feedId}`,
        actorUserId: "user_1",
        clerkOrgId: "org_1",
        organisationId,
        objectId: feedId,
        objectType: "feed",
        body: "A calendar feed token has been rotated.",
        recipientPersonId: null,
        recipientUserId: "user_1",
        title: "Feed token rotated",
        type: "feed_token_rotated",
      });
    });

    it("does not fail token rotation if notification dispatch fails and logs the error", async () => {
      mocks.dispatchNotification.mockResolvedValue({
        ok: false,
        error: { code: "unknown_error", message: "Failed to dispatch" },
      });

      const result = await rotateTokenAction({ feedId, organisationId });

      expect(result.ok).toBe(true);
      expect(mocks.dispatchNotification).toHaveBeenCalledTimes(1);
      expect(mocks.logError).toHaveBeenCalledWith(
        "Failed to dispatch feed_token_rotated notification",
        expect.objectContaining({
          feedId,
          error: { code: "unknown_error", message: "Failed to dispatch" },
        })
      );
    });

    it("does not dispatch a notification if token rotation fails", async () => {
      mocks.rotateToken.mockResolvedValue({
        ok: false,
        error: { code: "not_found", message: "Feed not found" },
      });

      const result = await rotateTokenAction({ feedId, organisationId });

      expect(result.ok).toBe(false);
      expect(mocks.dispatchNotification).not.toHaveBeenCalled();
    });
  });
});
