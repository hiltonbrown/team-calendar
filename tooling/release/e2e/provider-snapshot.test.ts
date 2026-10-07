import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const execute = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFileSync: execute }));

import {
  type ProviderSnapshot,
  readProviderSnapshot,
  requireExactProviderState,
} from "./provider-snapshot.js";

const snapshot = (
  overrides: Partial<ProviderSnapshot> = {}
): ProviderSnapshot => ({
  approvalStatus: "submitted",
  knownRemoteId: "remote-1",
  matches: [{ approvalStatus: "submitted", remoteId: "remote-1" }],
  ...overrides,
});

describe("requireExactProviderState", () => {
  it("returns the canonical remote ID for one matching provider record", () => {
    expect(requireExactProviderState(snapshot(), "submitted")).toBe("remote-1");
  });

  it("rejects duplicate matching provider records", () => {
    expect(() =>
      requireExactProviderState(
        snapshot({
          matches: [
            { approvalStatus: "submitted", remoteId: "remote-1" },
            { approvalStatus: "submitted", remoteId: "remote-2" },
          ],
        }),
        "submitted"
      )
    ).toThrow("Provider state is not exact");
  });

  it("rejects a status or remote ID that differs from the canonical operation", () => {
    expect(() =>
      requireExactProviderState(
        snapshot({
          matches: [{ approvalStatus: "approved", remoteId: "remote-2" }],
        }),
        "approved"
      )
    ).toThrow("Provider state does not match the canonical operation");
  });
});

describe("ordinary provider snapshot command", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("uses the surviving reader even with a stale campaign environment", () => {
    vi.stubEnv("TC_XERO_MANIFEST", "obsolete-manifest");
    execute.mockReturnValue(JSON.stringify(snapshot()));
    expect(
      readProviderSnapshot("11111111-1111-4111-8111-111111111111")
    ).toEqual(snapshot());
    expect(execute.mock.calls[0]?.[1]).toContain(
      resolve("tooling/release/e2e/provider-snapshot-cli.ts")
    );
  });
});
