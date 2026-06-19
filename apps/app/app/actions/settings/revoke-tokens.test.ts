import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getActiveOrgContext: vi.fn(),
  revalidatePath: vi.fn(),
  revokeAllFeedTokens: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
}));
vi.mock("@repo/feeds", () => ({
  revokeAllFeedTokens: mocks.revokeAllFeedTokens,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));

const { revokeAllTokens } = await import("./revoke-tokens");

const organisationId = "00000000-0000-4000-8000-000000000001";

describe("revokeAllTokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      orgId: "org_1",
      orgRole: "org:viewer",
    });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: {
        clerkOrgId: "org_1",
        organisationId,
      },
    });
    mocks.revokeAllFeedTokens.mockResolvedValue({
      ok: true,
      value: { revokedCount: 2 },
    });
  });

  it("rejects viewers before revoking feed tokens", async () => {
    const result = await revokeAllTokens({ organisationId });

    expect(result.ok).toBe(false);
    expect(mocks.getActiveOrgContext).not.toHaveBeenCalled();
    expect(mocks.revokeAllFeedTokens).not.toHaveBeenCalled();
  });

  it("allows admins to revoke feed tokens", async () => {
    mocks.auth.mockResolvedValue({
      orgId: "org_1",
      orgRole: "org:admin",
    });

    const result = await revokeAllTokens({ organisationId });

    expect(result).toEqual({
      ok: true,
      value: { revokedCount: 2 },
    });
    expect(mocks.revokeAllFeedTokens).toHaveBeenCalledWith({
      clerkOrgId: "org_1",
      organisationId,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings/feeds");
  });
});
