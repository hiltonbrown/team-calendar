import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  feed: vi.fn(),
  feedUpdate: vi.fn(),
  ledger: vi.fn(),
  project: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: { $transaction: mocks.transaction },
}));
vi.mock("../projection/feed-projection", () => ({
  projectFeedEvents: mocks.project,
}));
const { establishFeedRepresentation, hashEventRepresentation } = await import(
  "./feed-representation"
);
const { Prisma } = await import("@repo/database/generated/client");
const input = {
  clerkOrgId: "org_ledger",
  feedId: "10000000-0000-4000-8000-000000000002",
  organisationId: "10000000-0000-4000-8000-000000000001",
};
const tx = {
  feed: { findFirst: mocks.feed, updateMany: mocks.feedUpdate },
  feedEventPublication: {
    create: mocks.create,
    findMany: mocks.ledger,
    updateMany: mocks.update,
  },
};
function event() {
  return {
    allDay: true,
    contactabilityStatus: null,
    description: null,
    displayName: "Jane",
    endsAt: new Date("2026-06-03"),
    eventClass: "PUBLIC" as const,
    hasPublication: false,
    isPublicHoliday: false,
    location: "Brisbane",
    publishedAt: new Date("2026-06-01"),
    publishedSequence: 0,
    publishedUid: "stable@ical.teamcalendar.online",
    recordType: "wfh",
    sourceRecordId: "record",
    startsAt: new Date("2026-06-02"),
    summary: "Jane: WFH",
  };
}
function existing(overrides: Record<string, unknown> = {}) {
  return {
    id: "ledger",
    present: true,
    published_at: new Date("2026-05-01"),
    published_sequence: 3,
    published_uid: event().publishedUid,
    representation_hash: hashEventRepresentation(event()),
    source_key: "availability:record",
    ...overrides,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation((fn) => fn(tx));
  mocks.feed.mockResolvedValue({
    last_etag: null,
    name: "Team",
    representation_generation: 1,
    representation_hash: null,
  });
  mocks.ledger.mockResolvedValue([]);
  mocks.project.mockResolvedValue({ ok: true, value: [event()] });
});
describe("durable feed representation", () => {
  it("uses a single serializable client for scoped projection and ledger writes", async () => {
    expect(await establishFeedRepresentation(input)).toMatchObject({
      ok: true,
    });
    expect(mocks.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "Serializable" })
    );
    expect(mocks.project).toHaveBeenCalledWith(
      expect.objectContaining({ ...input, client: tx })
    );
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clerk_org_id: input.clerkOrgId,
          feed_id: input.feedId,
          organisation_id: input.organisationId,
          published_sequence: 0,
        }),
      })
    );
  });
  it("upgrades an existing sequence-zero publication and keeps its UID", async () => {
    mocks.project.mockResolvedValue({
      ok: true,
      value: [{ ...event(), hasPublication: true }],
    });
    const result = await establishFeedRepresentation(input);
    expect(result.ok && result.value.events[0]?.publishedSequence).toBe(1);
    expect(result.ok && result.value.events[0]?.publishedUid).toBe(
      event().publishedUid
    );
  });
  it("keeps unchanged UID, sequence and timestamp across clocks", async () => {
    mocks.ledger.mockResolvedValue([existing()]);
    const first = await establishFeedRepresentation(input);
    expect(first.ok).toBe(true);
    mocks.feed.mockResolvedValue({
      last_etag: "etag",
      name: "Team",
      representation_generation: 2,
      representation_hash: first.ok ? first.value.fingerprint : null,
    });
    const second = await establishFeedRepresentation(input);
    expect(second.ok).toBe(true);
    expect(second).toEqual(
      first.ok
        ? { ok: true, value: { ...first.value, cacheEtag: "etag" } }
        : first
    );
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.feedUpdate).toHaveBeenCalledTimes(1);
  });
  it.each(["summary", "location", "description", "eventClass"])(
    "versions changed %s even if canonical materialisation was missed",
    async (field) => {
      mocks.ledger.mockResolvedValue([existing()]);
      mocks.project.mockResolvedValue({
        ok: true,
        value: [{ ...event(), [field]: "PRIVATE" }],
      });
      const result = await establishFeedRepresentation(input);
      expect(result.ok && result.value.events[0]?.publishedSequence).toBe(4);
      expect(result.ok && result.value.events[0]?.publishedUid).toBe(
        event().publishedUid
      );
    }
  );
  it("preserves assigned ledger UID when an older writer changes its source UID", async () => {
    mocks.ledger.mockResolvedValue([existing()]);
    mocks.project.mockResolvedValue({
      ok: true,
      value: [{ ...event(), publishedUid: "rewritten" }],
    });
    const result = await establishFeedRepresentation(input);
    expect(result.ok && result.value.events[0]?.publishedUid).toBe(
      event().publishedUid
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("advances removal only once and re-entry retains UID with a newer version", async () => {
    mocks.ledger.mockResolvedValue([existing()]);
    mocks.project.mockResolvedValue({ ok: true, value: [] });
    await establishFeedRepresentation(input);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          present: false,
          published_sequence: { increment: 1 },
        }),
      })
    );
    mocks.update.mockClear();
    mocks.ledger.mockResolvedValue([
      existing({ present: false, published_sequence: 4 }),
    ]);
    await establishFeedRepresentation(input);
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.project.mockResolvedValue({ ok: true, value: [event()] });
    const reentry = await establishFeedRepresentation(input);
    expect(reentry.ok && reentry.value.events[0]?.publishedSequence).toBe(5);
  });
  it("versions horizon turnover once while preserving the unchanged surviving event", async () => {
    const departing = {
      ...event(),
      publishedUid: "departing@ical.teamcalendar.online",
      sourceRecordId: "departing",
    };
    const arriving = {
      ...event(),
      publishedUid: "arriving@ical.teamcalendar.online",
      sourceRecordId: "arriving",
    };
    mocks.ledger.mockResolvedValue([
      existing(),
      existing({
        id: "departing-ledger",
        published_uid: departing.publishedUid,
        representation_hash: hashEventRepresentation(departing),
        source_key: "availability:departing",
      }),
    ]);
    mocks.project.mockResolvedValueOnce({
      ok: true,
      value: [event(), departing],
    });
    const before = await establishFeedRepresentation(input);
    expect(before.ok).toBe(true);
    if (!before.ok) {
      throw new Error("Initial representation failed");
    }
    mocks.feed.mockResolvedValue({
      last_etag: "old",
      name: "Team",
      representation_generation: before.value.generation,
      representation_hash: before.value.fingerprint,
    });
    mocks.project.mockResolvedValueOnce({
      ok: true,
      value: [event(), arriving],
    });
    const after = await establishFeedRepresentation(input);
    expect(after.ok).toBe(true);
    if (!after.ok) {
      throw new Error("Turnover representation failed");
    }
    expect(after.value.generation).toBe(before.value.generation + 1);
    expect(
      after.value.events.find((value) => value.sourceRecordId === "record")
    ).toEqual(
      before.value.events.find((value) => value.sourceRecordId === "record")
    );
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          present: false,
          published_sequence: { increment: 1 },
        }),
        where: expect.objectContaining({ id: "departing-ledger" }),
      })
    );
    const arrived = after.value.events.find(
      (value) => value.sourceRecordId === "arriving"
    );
    expect(arrived?.publishedSequence).toBe(0);
    mocks.ledger.mockResolvedValue([
      existing(),
      existing({
        id: "departing-ledger",
        present: false,
        source_key: "availability:departing",
      }),
      existing({
        id: "arriving-ledger",
        published_at: arrived?.publishedAt,
        published_sequence: 0,
        published_uid: arriving.publishedUid,
        representation_hash: hashEventRepresentation(arriving),
        source_key: "availability:arriving",
      }),
    ]);
    mocks.feed.mockResolvedValue({
      last_etag: null,
      name: "Team",
      representation_generation: after.value.generation,
      representation_hash: after.value.fingerprint,
    });
    mocks.project.mockResolvedValueOnce({
      ok: true,
      value: [event(), arriving],
    });
    const repeated = await establishFeedRepresentation(input);
    expect(repeated.ok).toBe(true);
    expect(repeated.ok && repeated.value.generation).toBe(
      after.value.generation
    );
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
  it("versions holiday edits under their separate source identity", async () => {
    const holiday = {
      ...event(),
      isPublicHoliday: true,
      recordType: "public_holiday",
      summary: "Public holiday: renamed",
    };
    mocks.project.mockResolvedValue({ ok: true, value: [holiday] });
    mocks.ledger.mockResolvedValue([
      existing({ source_key: "holiday:record" }),
    ]);
    const result = await establishFeedRepresentation(input);
    expect(result.ok && result.value.events[0]?.publishedSequence).toBe(4);
  });
  it("changes generation for feed name without churning event versions", async () => {
    mocks.ledger.mockResolvedValue([existing()]);
    const first = await establishFeedRepresentation(input);
    mocks.feed.mockResolvedValue({
      last_etag: "old",
      name: "Renamed",
      representation_generation: 2,
      representation_hash: first.ok ? first.value.fingerprint : null,
    });
    const second = await establishFeedRepresentation(input);
    expect(second.ok && second.value.generation).toBe(3);
    expect(second.ok && second.value.cacheEtag).toBeNull();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("retries serialization conflicts then fails safely on exhaustion", async () => {
    mocks.transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("conflict", {
        clientVersion: "7.10.0",
        code: "P2034",
      })
    );
    expect(await establishFeedRepresentation(input)).toMatchObject({
      ok: false,
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(3);
  });
  it("fails safely when authoritative projection cannot be established", async () => {
    mocks.project.mockResolvedValue({
      error: { code: "unknown_error", message: "Unavailable" },
      ok: false,
    });
    expect(await establishFeedRepresentation(input)).toMatchObject({
      ok: false,
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
