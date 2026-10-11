import { createActivationEvent } from "@repo/analytics/activation-events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureXeroConnected } from "./activation";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  findFirst: vi.fn(),
  flush: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => {
  const exports = {
    database: { xeroConnection: { findFirst: mocks.findFirst } },
  };
  return {
    ...exports,
    getScopedXeroConnection: vi.fn(async (bindingScope) => ({
      ok: true,
      value: {
        authorisation: { status: "active" },
        id: bindingScope.connectionId,
      },
    })),
    systemDatabase: exports.database,
    tenantDatabase: vi.fn(() => exports.database),
    tenantTransaction: vi.fn((_clerkOrgId, callback) =>
      "$transaction" in exports.database
        ? exports.database.$transaction(callback)
        : callback(exports.database)
    ),
  };
});
vi.mock("@repo/analytics/server", () => ({
  analytics: { capture: mocks.capture, flush: mocks.flush },
}));

const input = {
  clerkOrgId: "org_1",
  connectionId: "connection-1",
  organisationId: "organisation-1",
};
const createdAt = new Date("2026-09-18T03:04:05.000Z");

describe("captureXeroConnected", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findFirst.mockResolvedValue({ created_at: createdAt });
  });

  it("uses the scoped durable creation time and stable activation identity", async () => {
    await captureXeroConnected(input);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      select: { created_at: true },
      where: {
        clerk_org_id: input.clerkOrgId,
        id: input.connectionId,
        organisation_id: input.organisationId,
      },
    });
    const expectedEvent = createActivationEvent({
      deduplicationKey: `${input.clerkOrgId}:${input.organisationId}`,
      name: "Xero Connected",
      occurredAt: createdAt,
      subjectId: input.clerkOrgId,
    });
    expect(mocks.capture).toHaveBeenCalledWith(expectedEvent);
    await captureXeroConnected({ ...input, connectionId: "replacement-link" });
    expect(mocks.capture.mock.calls[1]?.[0]).toEqual(expectedEvent);
    expect(mocks.flush).toHaveBeenCalledTimes(2);
  });

  it("does not emit an activation event for an absent scoped connection", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expect(captureXeroConnected(input)).resolves.toBeUndefined();
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.flush).not.toHaveBeenCalled();
  });

  it.each(["lookup", "capture", "flush"])(
    "keeps activation best effort when %s fails",
    async (failure) => {
      const error = new Error("ancillary service unavailable");
      if (failure === "lookup") {
        mocks.findFirst.mockRejectedValue(error);
      } else if (failure === "capture") {
        mocks.capture.mockImplementation(() => {
          throw error;
        });
      } else {
        mocks.flush.mockRejectedValue(error);
      }
      await expect(captureXeroConnected(input)).resolves.toBeUndefined();
    }
  );
});
