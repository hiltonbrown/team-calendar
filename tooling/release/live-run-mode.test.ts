import { describe, expect, it } from "vitest";
import { resolveLiveRunAction } from "./live-run-mode.js";

describe("live release run modes", () => {
  it("runs a newly acquired or pre-acquired release", () => {
    expect(resolveLiveRunAction("acquired", "new")).toBe("run");
    expect(resolveLiveRunAction("acquired", "preacquired")).toBe("run");
  });

  it("requires explicit recovery for an interrupted owner", () => {
    expect(() => resolveLiveRunAction("interrupted", "new")).toThrow(
      "Interrupted release run"
    );
    expect(resolveLiveRunAction("interrupted", "recover")).toBe("cleanup");
    expect(resolveLiveRunAction("interrupted", "recover-if-owned")).toBe(
      "cleanup"
    );
  });

  it("does not clean fixtures when recover-if-owned acquires an empty slot", () => {
    expect(resolveLiveRunAction("acquired", "recover-if-owned")).toBe(
      "release-noop"
    );
    expect(() => resolveLiveRunAction("acquired", "recover")).toThrow(
      "No interrupted release run"
    );
  });
});
