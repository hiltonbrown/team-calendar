import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AuthLifecycleEvent,
  emitAuthLifecycleEvent,
} from "./lifecycle-events";

const mocks = vi.hoisted(() => ({
  analytics: {
    capture: vi.fn(),
    flush: vi.fn(),
    groupIdentify: vi.fn(),
    identify: vi.fn(),
  },
  error: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/analytics/server", () => ({ analytics: mocks.analytics }));
vi.mock("@repo/observability/log", () => ({ log: { error: mocks.error } }));
const eventUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const identity = {
  auditId: "ce2b6f3c-80d8-4fd7-b20b-2b9fb28f9c83",
  occurredAt: new Date("2026-10-25T05:00:00.000Z"),
};
const membership = {
  ...identity,
  accountId: "account-id",
  kind: "membership.created",
  role: "owner",
  userId: "user-id",
} as const satisfies AuthLifecycleEvent;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.analytics.flush.mockResolvedValue(undefined);
});

describe("committed auth lifecycle analytics", () => {
  it.each(["user.created", "user.updated"] as const)(
    "identifies %s with neutral allowlisted profile fields",
    async (kind) => {
      const user = {
        createdAt: identity.occurredAt,
        email: "person@example.test",
        image: null,
        name: "One Name",
        password: "must-never-leak",
        phone: "must-never-leak",
      };
      await emitAuthLifecycleEvent({
        ...identity,
        kind,
        user,
        userId: "user-id",
      });
      expect(mocks.analytics.identify).toHaveBeenCalledWith({
        distinctId: "user-id",
        properties: {
          avatar: null,
          createdAt: identity.occurredAt,
          email: user.email,
          name: user.name,
        },
      });
      expect(mocks.analytics.capture).toHaveBeenCalledWith({
        distinctId: "user-id",
        event: kind === "user.created" ? "User Created" : "User Updated",
        timestamp: identity.occurredAt,
        uuid: expect.stringMatching(eventUuidPattern),
      });
      expect(JSON.stringify(mocks.analytics.identify.mock.calls)).not.toContain(
        "must-never-leak"
      );
      expect(mocks.analytics.flush).toHaveBeenCalledOnce();
    }
  );
  it("marks deletion at the durable event time", async () => {
    await emitAuthLifecycleEvent({
      ...identity,
      kind: "user.deleted",
      userId: "user-id",
    });
    expect(mocks.analytics.identify).toHaveBeenCalledWith({
      distinctId: "user-id",
      properties: { deleted: identity.occurredAt },
    });
  });
  it("deduplicates Account provisioning by Account identity across callback retries", async () => {
    const event = {
      ...identity,
      account: { image: null, name: "Example Account" },
      accountId: "account-id",
      createdBy: "owner-id",
      kind: "account.created",
    } as const satisfies AuthLifecycleEvent;
    await emitAuthLifecycleEvent(event);
    const activation = mocks.analytics.capture.mock.calls[1]?.[0];
    await emitAuthLifecycleEvent({ ...event, auditId: "different-audit-id" });
    expect(mocks.analytics.capture.mock.calls[3]?.[0]).toEqual(activation);
    expect(activation).toMatchObject({
      event: "Organisation Provisioned",
      properties: { event_id: expect.any(String), event_version: 1 },
      timestamp: identity.occurredAt,
    });
    expect(mocks.analytics.groupIdentify).toHaveBeenCalledWith({
      distinctId: "owner-id",
      groupKey: "account-id",
      groupType: "company",
      properties: { avatar: null, name: "Example Account" },
    });
  });
  it("updates Account grouping without repeating provisioning activation", async () => {
    await emitAuthLifecycleEvent({
      ...identity,
      account: { name: "Renamed Account" },
      accountId: "account-id",
      createdBy: "owner-id",
      kind: "account.updated",
    });
    expect(mocks.analytics.capture).toHaveBeenCalledOnce();
    expect(mocks.analytics.capture).toHaveBeenCalledWith(
      expect.objectContaining({ event: "Organisation Updated" })
    );
  });
  it("can update a group without inventing an actor", async () => {
    await emitAuthLifecycleEvent({
      ...identity,
      account: { name: "Account" },
      accountId: "account-id",
      kind: "account.updated",
    });
    expect(mocks.analytics.groupIdentify).toHaveBeenCalledOnce();
    expect(mocks.analytics.capture).not.toHaveBeenCalled();
  });
  it("reuses lifecycle and owner admission identifiers when a committed event is retried", async () => {
    await emitAuthLifecycleEvent(membership);
    const first = [...mocks.analytics.capture.mock.calls];
    await emitAuthLifecycleEvent(membership);
    expect(mocks.analytics.capture.mock.calls.slice(2)).toEqual(first);
    expect(first.map(([event]) => event.event)).toEqual([
      "Organisation Member Created",
      "Customer Admitted",
    ]);
    expect(first[1]?.[0]).toMatchObject({
      properties: { event_id: expect.any(String), event_version: 1 },
      timestamp: identity.occurredAt,
    });
  });
  it.each(["admin", "manager", "viewer"] as const)(
    "does not report %s membership as owner admission",
    async (role) => {
      await emitAuthLifecycleEvent({ ...membership, role });
      expect(mocks.analytics.capture).toHaveBeenCalledOnce();
    }
  );
  it("reports membership removal without re-admitting owners", async () => {
    await emitAuthLifecycleEvent({ ...membership, kind: "membership.deleted" });
    expect(mocks.analytics.capture).toHaveBeenCalledOnce();
    expect(mocks.analytics.capture).toHaveBeenCalledWith(
      expect.objectContaining({ event: "Organisation Member Deleted" })
    );
    expect(mocks.analytics.groupIdentify).not.toHaveBeenCalled();
  });
  it.each(["capture", "flush"] as const)(
    "logs safe diagnostics when %s fails without rejecting committed mutation",
    async (method) => {
      if (method === "flush") {
        mocks.analytics.flush.mockRejectedValue(new Error("private-token"));
      } else {
        mocks.analytics.capture.mockImplementation(() => {
          throw new Error("private-token");
        });
      }
      await expect(emitAuthLifecycleEvent(membership)).resolves.toBeUndefined();
      expect(mocks.error).toHaveBeenCalledWith(
        "Auth lifecycle analytics delivery failed",
        { auditId: identity.auditId, eventKind: membership.kind }
      );
      expect(JSON.stringify(mocks.error.mock.calls)).not.toContain(
        "private-token"
      );
    }
  );
});
