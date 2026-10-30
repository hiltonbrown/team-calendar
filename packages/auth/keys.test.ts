import { afterEach, describe, expect, it, vi } from "vitest";
import { keys, parseBetterAuthEnvironment } from "./keys";

const valid = {
  BETTER_AUTH_SECRET: "separate-test-secret-32-characters-long",
  BETTER_AUTH_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "google-id",
  GOOGLE_CLIENT_SECRET: "google-secret",
  MICROSOFT_CLIENT_ID: "microsoft-id",
  MICROSOFT_CLIENT_SECRET: "microsoft-secret",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  XERO_AUTH_CLIENT_ID: "xero-sign-in-id",
  XERO_AUTH_CLIENT_SECRET: "xero-sign-in-secret",
  XERO_CLIENT_ID: "payroll-id",
  XERO_CLIENT_SECRET: "payroll-secret",
};

describe("Better Auth environment", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults shared configuration to local auth and supports the remote runtime", () => {
    vi.stubEnv("AUTH_CONTEXT_MODE", undefined);
    expect(keys().AUTH_CONTEXT_MODE).toBe("local");
    vi.stubEnv("AUTH_CONTEXT_MODE", "remote");
    expect(keys().AUTH_CONTEXT_MODE).toBe("remote");
  });

  it("requires local context when initialising the native auth server", () => {
    expect(() =>
      parseBetterAuthEnvironment({ ...valid, AUTH_CONTEXT_MODE: "remote" })
    ).toThrow("AUTH_CONTEXT_MODE");
  });

  it("defaults to multi-tenant Entra with Infrastructure and telemetry disabled", () => {
    expect(parseBetterAuthEnvironment(valid)).toMatchObject({
      BETTER_AUTH_INFRA_ENABLED: false,
      BETTER_AUTH_TELEMETRY: "0",
      MICROSOFT_TENANT_ID: "organizations",
    });
  });

  it.each(["XERO_AUTH_CLIENT_ID", "XERO_AUTH_CLIENT_SECRET"] as const)(
    "rejects payroll credential reuse in %s",
    (name) => {
      const payrollName =
        name === "XERO_AUTH_CLIENT_ID"
          ? "XERO_CLIENT_ID"
          : "XERO_CLIENT_SECRET";
      expect(() =>
        parseBetterAuthEnvironment({ ...valid, [name]: valid[payrollName] })
      ).toThrow(`${name} must be separate`);
    }
  );

  it("rejects cross-field payroll credential reuse too", () => {
    expect(() =>
      parseBetterAuthEnvironment({
        ...valid,
        XERO_AUTH_CLIENT_SECRET: valid.XERO_CLIENT_ID,
      })
    ).toThrow("XERO_AUTH_CLIENT_SECRET must be separate");
  });

  it.each(["true", "1", "yes", "FALSE"])(
    "rejects invalid Infrastructure setting %s without a key",
    (value) => {
      expect(() =>
        parseBetterAuthEnvironment({
          ...valid,
          BETTER_AUTH_INFRA_ENABLED: value,
        })
      ).toThrow();
    }
  );

  it("accepts an explicit Infrastructure opt-in with its server key", () => {
    expect(
      parseBetterAuthEnvironment({
        ...valid,
        BETTER_AUTH_API_KEY: "private-infrastructure-key",
        BETTER_AUTH_INFRA_ENABLED: "true",
      }).BETTER_AUTH_INFRA_ENABLED
    ).toBe(true);
  });

  it.each([
    "BETTER_AUTH_SECRET",
    "XERO_AUTH_CLIENT_ID",
    "XERO_AUTH_CLIENT_SECRET",
  ])("requires %s for the selected server", (name) => {
    expect(() =>
      parseBetterAuthEnvironment({ ...valid, [name]: undefined })
    ).toThrow(name);
  });

  it("treats Google and Microsoft credentials as optional", () => {
    const withoutProviders = parseBetterAuthEnvironment({
      ...valid,
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
      MICROSOFT_CLIENT_ID: undefined,
      MICROSOFT_CLIENT_SECRET: undefined,
    });
    expect(withoutProviders.BETTER_AUTH_SECRET).toBe(valid.BETTER_AUTH_SECRET);
  });

  it.each(["https://api.teamcalendar.online", "http://localhost:3002"])(
    "rejects an auth origin that differs from the app",
    (value) => {
      expect(() =>
        parseBetterAuthEnvironment({ ...valid, BETTER_AUTH_URL: value })
      ).toThrow("must match NEXT_PUBLIC_APP_URL");
    }
  );

  it.each([
    "invalid-origin",
    "https://app.example.com/api/auth",
    "http://app.example.com",
    "https://user:password@app.example.com",
    "https://app.example.com?key=private",
  ])("rejects unsafe auth origins", (value) => {
    expect(() =>
      parseBetterAuthEnvironment({ ...valid, BETTER_AUTH_URL: value })
    ).toThrow("exact HTTPS app origin");
  });

  it("does not report secret values on validation failure", () => {
    const secret = "secret-canary";
    try {
      parseBetterAuthEnvironment({ ...valid, BETTER_AUTH_SECRET: secret });
      expect.fail("Expected validation failure");
    } catch (error) {
      expect(String(error)).toContain("BETTER_AUTH_SECRET");
      expect(String(error)).not.toContain(secret);
    }
  });

  const preview = {
    ...valid,
    BETTER_AUTH_URL: "https://app-preview.vercel.app",
    NEXT_PUBLIC_API_URL: "https://api-preview.vercel.app",
    NEXT_PUBLIC_APP_URL: "https://app-preview.vercel.app",
    TC_API_CANDIDATE_URL: "https://api-preview.vercel.app",
    TC_APP_CANDIDATE_URL: "https://app-preview.vercel.app",
    VERCEL_ENV: "preview",
  };

  it("accepts an exact Preview app/API pair at auth-server initialisation", () => {
    expect(parseBetterAuthEnvironment(preview).BETTER_AUTH_URL).toBe(
      preview.BETTER_AUTH_URL
    );
  });

  it.each([
    "TC_APP_CANDIDATE_URL",
    "TC_API_CANDIDATE_URL",
    "NEXT_PUBLIC_API_URL",
  ])("rejects a Preview server missing %s", (name) => {
    expect(() =>
      parseBetterAuthEnvironment({ ...preview, [name]: undefined })
    ).toThrow("Preview auth requires an exact app/API candidate pair");
  });

  it.each([
    "TC_APP_CANDIDATE_URL",
    "TC_API_CANDIDATE_URL",
    "NEXT_PUBLIC_API_URL",
  ])("rejects a Preview server with mismatched %s", (name) => {
    expect(() =>
      parseBetterAuthEnvironment({
        ...preview,
        [name]: "https://different.vercel.app",
      })
    ).toThrow("Preview auth requires an exact app/API candidate pair");
  });

  it("rejects a Preview auth URL that differs from its exact candidate", () => {
    expect(() =>
      parseBetterAuthEnvironment({
        ...preview,
        BETTER_AUTH_URL: "https://different.vercel.app",
      })
    ).toThrow("BETTER_AUTH_URL must match NEXT_PUBLIC_APP_URL");
  });
});
