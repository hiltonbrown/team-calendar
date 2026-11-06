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
const branchManifest = () => {
  const input = manifest();
  return parseReleaseManifest({
    ...input,
    consumerIsolation: {
      ...input.consumerIsolation,
      environmentId: "branch-4a3b3c7c",
      environmentType: "BRANCH",
    },
    mode: "database-fixture",
  });
};
const branchEnvironment = {
  createdAt,
  id: "branch-4a3b3c7c",
  name: "branch",
  type: "BRANCH",
};
const verifyBranch = () =>
  assertConsumerIsolationReadBack(branchManifest(), {
    signingKey: "signkey-branch-test",
  });
afterEach(() => vi.unstubAllGlobals());

describe("unregistered Inngest isolation", () => {
  it.each([
    { ...branchEnvironment, id: "branch-other" },
    { ...branchEnvironment, type: "PRODUCTION" },
    { createdAt, id: "branch-4a3b3c7c", name: "branch" },
  ])(
    "still binds owned recovery to the exact authenticated branch identity/type: %j",
    async (environment) => {
      const input = branchManifest();
      if (!input.consumerIsolation) {
        throw new Error("Missing test evidence");
      }
      input.consumerIsolation.observedAt = "2020-01-01T00:00:00.000Z";
      installResponses({ 0: envelope([environment]) });
      await expect(
        assertConsumerIsolationReadBack(input, {
          ownershipVerifiedForRunId: input.runId,
          signingKey: "signkey-branch-test",
        })
      ).rejects.toThrow("environment");
    }
  );

  it("revalidates an owned older run using fresh authenticated provider inventories", async () => {
    const input = manifest();
    if (!input.consumerIsolation) {
      throw new Error("Missing test evidence");
    }
    input.consumerIsolation.observedAt = "2020-01-01T00:00:00.000Z";
    const fetchMock = installResponses();
    await expect(
      assertConsumerIsolationReadBack(input, {
        ownershipVerifiedForRunId: input.runId,
        signingKey: "signkey-prod-test",
      })
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not waive admission age for another run's ownership proof", async () => {
    const input = manifest();
    if (!input.consumerIsolation) {
      throw new Error("Missing test evidence");
    }
    input.consumerIsolation.observedAt = "2020-01-01T00:00:00.000Z";
    const fetchMock = installResponses();
    await expect(
      assertConsumerIsolationReadBack(input, {
        ownershipVerifiedForRunId: "another-run",
        signingKey: "signkey-prod-test",
      })
    ).rejects.toThrow("stale");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a future admission sample even with matching owned-run proof", async () => {
    const input = manifest();
    if (!input.consumerIsolation) {
      throw new Error("Missing test evidence");
    }
    input.consumerIsolation.observedAt = new Date(
      Date.now() + 60_000
    ).toISOString();
    const fetchMock = installResponses();
    await expect(
      assertConsumerIsolationReadBack(input, {
        ownershipVerifiedForRunId: input.runId,
        signingKey: "signkey-prod-test",
      })
    ).rejects.toThrow("future");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2, 3])(
    "requires fresh provider metadata for owned recovery at request %i",
    async (index) => {
      const input = manifest();
      if (!input.consumerIsolation) {
        throw new Error("Missing test evidence");
      }
      input.consumerIsolation.observedAt = "2020-01-01T00:00:00.000Z";
      const fetchMock = installResponses({
        [index]: envelope(
          index === 0
            ? [{ createdAt, id: "production-test", name: "production" }]
            : [],
          { metadata: { fetchedAt: "2020-01-01T00:00:00.000Z" } }
        ),
      });
      await expect(
        assertConsumerIsolationReadBack(input, {
          ownershipVerifiedForRunId: input.runId,
          signingKey: "signkey-prod-test",
        })
      ).rejects.toThrow("stale");
      expect(fetchMock).toHaveBeenCalledTimes(index + 1);
    }
  );

  it("requires fresh non-terminal run range evidence for owned recovery", async () => {
    const input = manifest();
    if (!input.consumerIsolation) {
      throw new Error("Missing test evidence");
    }
    input.consumerIsolation.observedAt = "2020-01-01T00:00:00.000Z";
    const fetchMock = installResponses({
      3: envelope([], {
        metadata: {
          fetchedAt: now,
          timeRange: { from: createdAt, until: "2020-01-01T00:00:00.000Z" },
        },
      }),
    });
    await expect(
      assertConsumerIsolationReadBack(input, {
        ownershipVerifiedForRunId: input.runId,
        signingKey: "signkey-prod-test",
      })
    ).rejects.toThrow("stale");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it.each([1, 2, 3])(
    "still rejects a nonempty owned-recovery inventory at request %i",
    async (index) => {
      const input = manifest();
      if (!input.consumerIsolation) {
        throw new Error("Missing test evidence");
      }
      input.consumerIsolation.observedAt = "2020-01-01T00:00:00.000Z";
      installResponses({ [index]: envelope([{ id: "unexpected" }]) });
      await expect(
        assertConsumerIsolationReadBack(input, {
          ownershipVerifiedForRunId: input.runId,
          signingKey: "signkey-prod-test",
        })
      ).rejects.toThrow("requires zero");
    }
  );

  it("still rejects future provider metadata for owned recovery", async () => {
    const input = manifest();
    if (!input.consumerIsolation) {
      throw new Error("Missing test evidence");
    }
    input.consumerIsolation.observedAt = "2020-01-01T00:00:00.000Z";
    installResponses({
      1: envelope([], {
        metadata: { fetchedAt: new Date(Date.now() + 60_000).toISOString() },
      }),
    });
    await expect(
      assertConsumerIsolationReadBack(input, {
        ownershipVerifiedForRunId: input.runId,
        signingKey: "signkey-prod-test",
      })
    ).rejects.toThrow("future");
  });

  it("admits the authenticated empty branch envelope only for an explicit fixture run", async () => {
    const fetchMock = installResponses({
      0: envelope([branchEnvironment]),
      1: envelope([], { data: undefined }),
      2: envelope([], { data: undefined }),
      3: envelope([], { data: undefined }),
    });
    await expect(verifyBranch()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer signkey-branch-test" },
    });
  });

  it("rejects branch evidence in a default release manifest", () => {
    const input = branchManifest();
    input.mode = undefined;
    expect(() => parseReleaseManifest(input)).toThrow("database-fixture");
  });

  it("retains the fixture-only restriction when a parsed manifest is modified", async () => {
    const input = branchManifest();
    input.mode = undefined;
    const fetchMock = installResponses();
    await expect(
      assertConsumerIsolationReadBack(input, {
        signingKey: "signkey-branch-test",
      })
    ).rejects.toThrow("database-fixture");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { ...branchEnvironment, id: "branch-other" },
    { ...branchEnvironment, type: "PRODUCTION" },
    { createdAt, id: "branch-4a3b3c7c", name: "branch" },
  ])(
    "rejects a mismatched or missing branch identity/type: %j",
    async (environment) => {
      installResponses({ 0: envelope([environment]) });
      await expect(verifyBranch()).rejects.toThrow("environment");
    }
  );

  it("does not admit branch credentials to default production evidence", async () => {
    const fetchMock = installResponses();
    await expect(
      assertConsumerIsolationReadBack(manifest(), {
        signingKey: "signkey-branch-test",
      })
    ).rejects.toThrow("Production Inngest signing key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([undefined, "signkey-prod-test", "arbitrary-token"])(
    "requires branch signing credentials for branch evidence: %s",
    async (signingKey) => {
      const fetchMock = installResponses();
      await expect(
        assertConsumerIsolationReadBack(branchManifest(), { signingKey })
      ).rejects.toThrow("Branch Inngest signing key");
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each([1, 2, 3])(
    "rejects a nonempty branch inventory at request %i",
    async (index) => {
      installResponses({
        0: envelope([branchEnvironment]),
        [index]: envelope([{ id: "unexpected" }]),
      });
      await expect(verifyBranch()).rejects.toThrow("requires zero");
    }
  );

  it("rejects a branch credential rejected by the provider", async () => {
    installResponses({ 0: new Response(null, { status: 401 }) });
    await expect(verifyBranch()).rejects.toThrow("read-back failed");
  });

  it("revalidates production identity, all app inventories and non-terminal runs", async () => {
    const fetchMock = installResponses();
    await expect(verify()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[2]?.[0]).toContain("archived=true");
    expect(fetchMock.mock.calls[3]?.[0]).toContain("status=RUNNING");
    expect(fetchMock.mock.calls[3]?.[0]).toContain("status=QUEUED");
    expect(fetchMock.mock.calls[3]?.[0]).toContain("status=PAUSED");
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

  it("rejects missing non-terminal run time-range evidence", async () => {
    installResponses({
      3: envelope([], {
        metadata: { fetchedAt: now },
      }),
    });
    await expect(verify()).rejects.toThrow("no time range");
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
