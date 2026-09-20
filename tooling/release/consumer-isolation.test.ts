import { afterEach, describe, expect, it, vi } from "vitest";
import { assertConsumerIsolationReadBack } from "./consumer-isolation.js";
import { parseReleaseManifest } from "./database-guard.js";

const now = new Date().toISOString();
const createdAt = new Date(Date.now() - 60_000).toISOString();
const manifest = () =>
  parseReleaseManifest({
    active: true,
    candidateSha: "abcdef1",
    consumerIsolation: {
      activeApps: 0,
      archivedApps: 0,
      environmentId: "production-test",
      kind: "unregistered-inngest-environment",
      observedAt: now,
      pausedRuns: 0,
      pendingRuns: 0,
      runningRuns: 0,
    },
    durableManifestConfirmed: true,
    namespace: "release:run:018f47d8-3c0a-7f95-8c77-44f4be5c3210",
    owned: {},
    restoreEvidence: { observedAt: now, reference: "restore" },
    runId: "018f47d8-3c0a-7f95-8c77-44f4be5c3210",
    target: {
      branchId: "branch",
      database: "db",
      endpointId: "endpoint",
      hostname: "host",
      projectId: "project",
      role: "role",
    },
    version: 1,
  });
const envelope = (data: unknown[] = [], extra = {}) => ({
  data,
  metadata: { fetchedAt: now, timeRange: { from: createdAt, until: now } },
  page: { limit: 100 },
  ...extra,
});
const installResponses = (overrides: Record<number, unknown> = {}) => {
  const responses = [
    envelope([{ createdAt, id: "production-test", name: "production" }]),
    envelope(),
    envelope(),
    envelope(),
  ];
  const fetchMock = vi.fn();
  for (const [index, value] of responses.entries()) {
    const body = overrides[index] ?? value;
    fetchMock.mockResolvedValueOnce(
      body instanceof Response ? body : Response.json(body)
    );
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};
const verify = () =>
  assertConsumerIsolationReadBack(manifest(), {
    signingKey: "signkey-prod-test",
  });
afterEach(() => vi.unstubAllGlobals());

describe("unregistered Inngest isolation", () => {
  it("revalidates the production identity, both app inventories and full-lifetime runs", async () => {
    const fetchMock = installResponses();
    await expect(verify()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[2]?.[0]).toContain("archived=true");
  });

  it.each([401, 403, 500])("fails closed on API status %i", async (status) => {
    installResponses({ 0: new Response(null, { status }) });
    await expect(verify()).rejects.toThrow("read-back failed");
  });

  it.each([1, 2, 3])(
    "rejects a nonempty inventory at request %i",
    async (index) => {
      installResponses({ [index]: envelope([{ id: "unexpected" }]) });
      await expect(verify()).rejects.toThrow("requires zero");
    }
  );

  it("rejects pagination even when the returned page is empty", async () => {
    installResponses({
      1: envelope([], { page: { hasMore: true, limit: 100 } }),
    });
    await expect(verify()).rejects.toThrow();
  });

  it("rejects a different environment", async () => {
    installResponses({
      0: envelope([{ createdAt, id: "production-other", name: "production" }]),
    });
    await expect(verify()).rejects.toThrow("does not match");
  });

  it("rejects missing provider response metadata", async () => {
    installResponses({ 1: {} });
    await expect(verify()).rejects.toThrow();
  });

  it("rejects incomplete run-history coverage", async () => {
    installResponses({
      3: envelope([], {
        metadata: { fetchedAt: now, timeRange: { from: now, until: now } },
      }),
    });
    await expect(verify()).rejects.toThrow("environment lifetime");
  });

  it("rejects stale manifest evidence before contacting the provider", async () => {
    const input = manifest();
    if (!input.consumerIsolation) {
      throw new Error("Missing test evidence");
    }
    input.consumerIsolation.observedAt = "2020-01-01T00:00:00.000Z";
    const fetchMock = installResponses();
    await expect(
      assertConsumerIsolationReadBack(input, {
        signingKey: "signkey-prod-test",
      })
    ).rejects.toThrow("stale");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects stale provider evidence", async () => {
    installResponses({
      1: envelope([], { metadata: { fetchedAt: "2020-01-01T00:00:00.000Z" } }),
    });
    await expect(verify()).rejects.toThrow("stale");
  });

  it("requires a production signing key", async () => {
    await expect(
      assertConsumerIsolationReadBack(manifest(), {})
    ).rejects.toThrow("signing key");
  });
});
