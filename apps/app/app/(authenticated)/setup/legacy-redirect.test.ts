import { existsSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SetupPage from "./page";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

const organisationId = "00000000-0000-4000-8000-000000000001";

describe("legacy setup redirect", () => {
  beforeEach(() => {
    mocks.redirect.mockReset();
  });

  it.each([
    { expected: "/settings/getting-started", params: {} },
    {
      expected: `/settings/getting-started?org=${organisationId}`,
      params: { org: organisationId },
    },
    {
      expected: `/settings/getting-started?org=${organisationId}`,
      params: { org: ["invalid", organisationId] },
    },
    {
      expected: "/settings/getting-started",
      params: { org: "invalid" },
    },
  ])("normalises setup input to $expected", async ({ expected, params }) => {
    await SetupPage({ searchParams: Promise.resolve(params) });
    expect(mocks.redirect).toHaveBeenCalledWith(expected);
  });

  it("preserves repeated non-organisation values", async () => {
    await SetupPage({
      searchParams: Promise.resolve({
        from: "dashboard",
        org: organisationId,
        step: ["people", "holidays"],
      }),
    });

    expect(mocks.redirect).toHaveBeenCalledWith(
      `/settings/getting-started?from=dashboard&step=people&step=holidays&org=${organisationId}`
    );
  });

  it("keeps the unreachable organisation setup client deleted", () => {
    expect(
      existsSync(new URL("./onboarding-client.tsx", import.meta.url))
    ).toBe(false);
  });
});
