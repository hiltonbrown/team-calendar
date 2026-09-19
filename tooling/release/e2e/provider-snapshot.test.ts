import { describe, expect, it } from "vitest";
import {
  type ProviderSnapshot,
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
