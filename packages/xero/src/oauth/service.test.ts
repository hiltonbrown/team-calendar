import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@repo/database", () => ({
  database: {},
}));

const { buildXeroOAuthStartUrl, isPreviewDeployment } = await import(
  "./service"
);

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.XERO_CLIENT_ID = "client-id";
  process.env.XERO_CLIENT_SECRET = "client-secret";
  process.env.XERO_REDIRECT_URI =
    "https://api.example.com/api/xero/oauth/callback";
  delete process.env.VERCEL_ENV;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("isPreviewDeployment", () => {
  it("is true only on a Vercel preview deployment", () => {
    process.env.VERCEL_ENV = "preview";
    expect(isPreviewDeployment()).toBe(true);

    process.env.VERCEL_ENV = "production";
    expect(isPreviewDeployment()).toBe(false);

    delete process.env.VERCEL_ENV;
    expect(isPreviewDeployment()).toBe(false);
  });
});

describe("buildXeroOAuthStartUrl", () => {
  it("disables Xero connect on preview deployments", () => {
    process.env.VERCEL_ENV = "preview";

    const result = buildXeroOAuthStartUrl({ clerkOrgId: "org_1" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("connect_disabled");
    }
  });

  it("returns oauth_not_configured when credentials are missing", () => {
    delete process.env.XERO_CLIENT_ID;
    delete process.env.XERO_CLIENT_SECRET;

    const result = buildXeroOAuthStartUrl({ clerkOrgId: "org_1" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("oauth_not_configured");
    }
  });

  it("uses the pre-registered redirect URI when configured", () => {
    const result = buildXeroOAuthStartUrl({ clerkOrgId: "org_1" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const redirectUrl = new URL(result.value.redirectUrl);
      expect(redirectUrl.searchParams.get("redirect_uri")).toBe(
        "https://api.example.com/api/xero/oauth/callback"
      );
    }
  });
});
