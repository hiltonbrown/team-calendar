import { describe, expect, it, vi } from "vitest";
import { reconcileReleaseTeardown } from "./release-teardown.js";

describe("ordinary release teardown", () => {
  it("attempts safe inspection before an unresolved-ledger assertion and retains credentials", () => {
    const hooks = {
      applyCleanup: vi.fn(),
      assertClean: vi.fn(),
      assertLedger: vi.fn(() => {
        throw new Error("Unresolved");
      }),
      inspectCleanup: vi.fn(),
    };
    expect(() => reconcileReleaseTeardown(hooks)).toThrow("Unresolved");
    expect(hooks.inspectCleanup).toHaveBeenCalledOnce();
    expect(hooks.applyCleanup).not.toHaveBeenCalled();
  });
  it("expected dirty inspection does not skip safe final cleanup", () => {
    const hooks = {
      applyCleanup: vi.fn(),
      assertClean: vi.fn(),
      assertLedger: vi.fn(),
      inspectCleanup: vi.fn(() => {
        throw new Error("Dirty");
      }),
    };
    reconcileReleaseTeardown(hooks);
    expect(hooks.applyCleanup).toHaveBeenCalledOnce();
    expect(hooks.assertClean).toHaveBeenCalledOnce();
  });
});
