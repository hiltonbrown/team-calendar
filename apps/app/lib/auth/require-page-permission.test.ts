import { beforeEach, describe, expect, it, vi } from "vitest";

const hasPermission = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@repo/auth/server", () => ({ hasPermission }));
const { PermissionDeniedError, requirePagePermission } = await import(
  "./require-page-permission"
);

describe("requirePagePermission", () => {
  beforeEach(() => vi.clearAllMocks());
  it("checks the requested permission", async () => {
    hasPermission.mockResolvedValue(true);
    await expect(
      requirePagePermission({ reports: ["read"] })
    ).resolves.toBeUndefined();
    expect(hasPermission).toHaveBeenCalledWith({ reports: ["read"] });
  });
  it("denies access when the permission is absent", async () => {
    hasPermission.mockResolvedValue(false);
    await expect(
      requirePagePermission({ reports: ["read"] })
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });
  it("propagates operational failures", async () => {
    const error = new Error("Session lookup failed");
    hasPermission.mockRejectedValue(error);
    await expect(requirePagePermission({ reports: ["read"] })).rejects.toBe(
      error
    );
  });
});
