import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canViewFeed: vi.fn(),
  feedFindFirst: vi.fn(),
  personFindFirst: vi.fn(() =>
    Promise.resolve({ id: "30000000-0000-4000-8000-000000000003" })
  ),
  projectFeedEvents: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {
    feed: {
      findFirst: mocks.feedFindFirst,
    },
    person: { findFirst: mocks.personFindFirst },
  },
}));

vi.mock("../scope/feed-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../scope/feed-scope")>();
  return {
    ...actual,
    canViewFeed: mocks.canViewFeed,
  };
});

vi.mock("../projection/feed-projection", () => ({
  projectFeedEvents: mocks.projectFeedEvents,
}));

const { previewFeed } = await import("./preview-service");

const validFeedId = "10000000-0000-4000-8000-000000000001";
const validOrgId = "20000000-0000-4000-8000-000000000002";
const validClerkOrgId = "org_123";
const validUserId = "user_123";
const validPersonId = "30000000-0000-4000-8000-000000000003";

const baseInput = {
  actingPersonId: validPersonId,
  actingRole: "org:admin",
  actingUserId: validUserId,
  clerkOrgId: validClerkOrgId,
  feedId: validFeedId,
  organisationId: validOrgId,
};

const mockFeedRecord = {
  created_by_user_id: validUserId,
  privacy_mode: "named",
  scopes: [{ scope_type: "org", scope_value: null }],
};

const sampleEvent = {
  allDay: true,
  contactabilityStatus: null,
  description: "On Leave",
  displayName: "Jane Doe",
  endsAt: new Date("2026-08-15"),
  isPublicHoliday: false,
  location: null,
  publishedSequence: 1,
  publishedUid: "uid-1",
  recordType: "xero_leave",
  sourceRecordId: "rec-1",
  startsAt: new Date("2026-08-10"),
  summary: "Jane Doe - On Leave",
};

describe("previewFeed", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.personFindFirst.mockResolvedValue({ id: validPersonId });
  });

  it.each(
    ["org:viewer", "org:manager"].flatMap((actingRole) =>
      [undefined, "30000000-0000-4000-8000-000000000099"].map(
        (actingPersonId) => ({ actingPersonId, actingRole })
      )
    )
  )(
    "resolves the active scoped identity for $actingRole with caller identity $actingPersonId",
    async ({ actingRole, actingPersonId }) => {
      mocks.feedFindFirst.mockResolvedValueOnce(mockFeedRecord);
      mocks.canViewFeed.mockResolvedValueOnce({ ok: true, value: true });
      mocks.projectFeedEvents.mockResolvedValueOnce({ ok: true, value: [] });
      const result = await previewFeed({
        ...baseInput,
        actingPersonId,
        actingRole,
      });
      expect(result.ok).toBe(true);
      expect(mocks.personFindFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          archived_at: null,
          clerk_org_id: validClerkOrgId,
          clerk_user_id: validUserId,
          is_active: true,
          organisation_id: validOrgId,
        },
      });
      expect(mocks.canViewFeed).toHaveBeenCalledWith(
        expect.objectContaining({ actingPersonId: validPersonId })
      );
      expect(mocks.projectFeedEvents).toHaveBeenCalledWith(
        expect.objectContaining({ actingPersonId: validPersonId })
      );
    }
  );

  it.each(["org:viewer", "org:manager"])(
    "denies missing, foreign or inactive identity for %s without projecting",
    async (actingRole) => {
      mocks.feedFindFirst.mockResolvedValueOnce(mockFeedRecord);
      mocks.personFindFirst.mockResolvedValueOnce(null);
      mocks.canViewFeed.mockResolvedValueOnce({ ok: true, value: false });
      const result = await previewFeed({
        ...baseInput,
        actingPersonId: undefined,
        actingRole,
      });
      expect(result.ok).toBe(false);
      expect(mocks.personFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            archived_at: null,
            clerk_org_id: validClerkOrgId,
            is_active: true,
            organisation_id: validOrgId,
          }),
        })
      );
      expect(mocks.canViewFeed).toHaveBeenCalledWith(
        expect.objectContaining({ actingPersonId: null })
      );
      expect(mocks.projectFeedEvents).not.toHaveBeenCalled();
    }
  );

  it("happy path: produces expected preview payload", async () => {
    mocks.feedFindFirst.mockResolvedValueOnce(mockFeedRecord);
    mocks.canViewFeed.mockResolvedValueOnce({ ok: true, value: true });
    mocks.projectFeedEvents.mockResolvedValueOnce({
      ok: true,
      value: [sampleEvent],
    });

    const result = await previewFeed(baseInput);

    expect(result).toEqual({ ok: true, value: [sampleEvent] });
  });

  it("tenant scoping: carries clerk_org_id and organisation_id in database query", async () => {
    mocks.feedFindFirst.mockResolvedValueOnce(mockFeedRecord);
    mocks.canViewFeed.mockResolvedValueOnce({ ok: true, value: true });
    mocks.projectFeedEvents.mockResolvedValueOnce({ ok: true, value: [] });

    await previewFeed(baseInput);

    expect(mocks.feedFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clerk_org_id: validClerkOrgId,
          id: validFeedId,
          organisation_id: validOrgId,
        },
      })
    );
  });

  describe("privacy modes", () => {
    it.each(["named", "masked", "private"] as const)(
      "admin can request privacy mode %s",
      async (privacyMode) => {
        mocks.feedFindFirst.mockResolvedValueOnce({
          ...mockFeedRecord,
          privacy_mode: "named",
        });
        mocks.canViewFeed.mockResolvedValueOnce({ ok: true, value: true });
        mocks.projectFeedEvents.mockResolvedValueOnce({ ok: true, value: [] });

        const result = await previewFeed({
          ...baseInput,
          actingRole: "org:admin",
          privacyMode,
        });

        expect(result.ok).toBe(true);
        expect(mocks.projectFeedEvents).toHaveBeenCalledWith(
          expect.objectContaining({
            privacyMode,
          })
        );
      }
    );

    it("uses default feed privacy mode if omitted", async () => {
      mocks.feedFindFirst.mockResolvedValueOnce({
        ...mockFeedRecord,
        privacy_mode: "masked",
      });
      mocks.canViewFeed.mockResolvedValueOnce({ ok: true, value: true });
      mocks.projectFeedEvents.mockResolvedValueOnce({ ok: true, value: [] });

      const result = await previewFeed({
        ...baseInput,
        privacyMode: undefined,
      });

      expect(result.ok).toBe(true);
      expect(mocks.projectFeedEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          privacyMode: "masked",
        })
      );
    });

    it("denies non-admin trying to change privacy mode", async () => {
      mocks.feedFindFirst.mockResolvedValueOnce({
        ...mockFeedRecord,
        privacy_mode: "masked",
      });

      const result = await previewFeed({
        ...baseInput,
        actingRole: "org:viewer",
        privacyMode: "named",
      });

      expect(result).toEqual({
        error: {
          code: "not_authorised",
          message: "You do not have permission to preview this feed.",
        },
        ok: false,
      });
      expect(mocks.canViewFeed).not.toHaveBeenCalled();
    });

    it("lets the owner of a personal feed preview other privacy modes", async () => {
      mocks.feedFindFirst.mockResolvedValueOnce({
        ...mockFeedRecord,
        created_by_user_id: "user_owner",
        privacy_mode: "masked",
        scopes: [{ scope_type: "self", scope_value: null }],
      });
      mocks.canViewFeed.mockResolvedValueOnce({ ok: true, value: true });
      mocks.projectFeedEvents.mockResolvedValueOnce({ ok: true, value: [] });

      const result = await previewFeed({
        ...baseInput,
        actingRole: "org:viewer",
        actingUserId: "user_owner",
        privacyMode: "named",
      });

      expect(result.ok).toBe(true);
    });

    it("allows non-admin requesting feed standard privacy mode", async () => {
      mocks.feedFindFirst.mockResolvedValueOnce({
        ...mockFeedRecord,
        privacy_mode: "masked",
      });
      mocks.canViewFeed.mockResolvedValueOnce({ ok: true, value: true });
      mocks.projectFeedEvents.mockResolvedValueOnce({ ok: true, value: [] });

      const result = await previewFeed({
        ...baseInput,
        actingRole: "org:viewer",
        privacyMode: "masked",
      });

      expect(result.ok).toBe(true);
    });
  });

  describe("PreviewServiceError variants", () => {
    it("returns validation_error for invalid input schema", async () => {
      const result = await previewFeed({
        ...baseInput,
        feedId: "invalid-uuid",
      });

      expect(result).toEqual({
        error: {
          code: "validation_error",
          message: expect.any(String),
        },
        ok: false,
      });
    });

    it("returns feed_not_found when feed does not exist", async () => {
      mocks.feedFindFirst
        .mockResolvedValueOnce(null) // feed lookup
        .mockResolvedValueOnce(null); // feedNotFoundOrLeak lookup

      const result = await previewFeed(baseInput);

      expect(result).toEqual({
        error: {
          code: "feed_not_found",
          message: "Feed not found.",
        },
        ok: false,
      });
    });

    it("returns feed_not_found when feed belongs to another org", async () => {
      mocks.feedFindFirst
        .mockResolvedValueOnce(null) // initial lookup filtered by org
        .mockResolvedValueOnce({
          clerk_org_id: "other_clerk_org",
          organisation_id: validOrgId,
        }); // lookup by id only

      const result = await previewFeed(baseInput);

      expect(result).toEqual({
        error: {
          code: "feed_not_found",
          message: "Feed not found.",
        },
        ok: false,
      });
    });

    it("returns not_authorised when user cannot view feed", async () => {
      mocks.feedFindFirst.mockResolvedValueOnce(mockFeedRecord);
      mocks.canViewFeed.mockResolvedValueOnce({ ok: true, value: false });

      const result = await previewFeed(baseInput);

      expect(result).toEqual({
        error: {
          code: "not_authorised",
          message: "You do not have permission to preview this feed.",
        },
        ok: false,
      });
    });

    it("returns unknown_error when unexpected exception is thrown", async () => {
      mocks.feedFindFirst.mockRejectedValueOnce(new Error("DB failure"));

      const result = await previewFeed(baseInput);

      expect(result).toEqual({
        error: {
          code: "unknown_error",
          message: "Failed to load feed preview.",
        },
        ok: false,
      });
    });

    it("passes through error from canViewFeed failure", async () => {
      mocks.feedFindFirst.mockResolvedValueOnce(mockFeedRecord);
      mocks.canViewFeed.mockResolvedValueOnce({
        error: { code: "invalid_scope", message: "Invalid scope parameter" },
        ok: false,
      });

      const result = await previewFeed(baseInput);

      expect(result).toEqual({
        error: { code: "invalid_scope", message: "Invalid scope parameter" },
        ok: false,
      });
    });
  });

  it("empty scope: produces empty preview list", async () => {
    mocks.feedFindFirst.mockResolvedValueOnce(mockFeedRecord);
    mocks.canViewFeed.mockResolvedValueOnce({ ok: true, value: true });
    mocks.projectFeedEvents.mockResolvedValueOnce({ ok: true, value: [] });

    const result = await previewFeed(baseInput);

    expect(result).toEqual({ ok: true, value: [] });
  });
});
