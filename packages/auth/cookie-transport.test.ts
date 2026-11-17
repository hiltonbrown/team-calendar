import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authSessionCookieNames,
  forwardAuthCookies,
  getAuthOrigins,
} from "./cookie-transport";
import { authContextMode } from "./selection";

describe("fixed auth transport boundary", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3002");
  });
  afterEach(() => vi.unstubAllEnvs());
  it("defaults to local auth and accepts only supported context modes", () => {
    vi.stubEnv("AUTH_CONTEXT_MODE", undefined);
    expect(authContextMode()).toBe("local");
    vi.stubEnv("AUTH_CONTEXT_MODE", "remote");
    expect(authContextMode()).toBe("remote");
    vi.stubEnv("AUTH_CONTEXT_MODE", "unknown");
    expect(authContextMode).toThrow();
  });
  it("uses exact local and production origins with distinct cookie prefixes", () => {
    expect(getAuthOrigins()).toEqual({
      apiOrigin: "http://localhost:3002",
      appOrigin: "http://localhost:3000",
    });
    expect([...authSessionCookieNames("http://localhost:3000")]).toEqual([
      "team-calendar-dev-auth.session_token",
    ]);
    expect([
      ...authSessionCookieNames("https://app.teamcalendar.online"),
    ]).toEqual(["__Secure-team-calendar-auth.session_token"]);
  });
  it("forwards only the session cookie, without Authorization or arbitrary headers", () => {
    const forwarded = forwardAuthCookies(
      new Headers({
        authorization: "Bearer unused",
        cookie:
          "other=private; team-calendar-dev-auth.session_token=opaque; payroll_state=private",
        "x-forwarded-host": "attacker.test",
      }),
      "http://localhost:3000"
    );
    expect([...forwarded.entries()]).toEqual([
      ["cookie", "team-calendar-dev-auth.session_token=opaque"],
    ]);
    expect(
      forwardAuthCookies(
        new Headers({ cookie: "team-calendar-dev-auth.session_data=cache" }),
        "http://localhost:3000"
      ).has("cookie")
    ).toBe(false);
  });
  it("rejects duplicate or oversized cookies", () => {
    expect(() =>
      forwardAuthCookies(
        new Headers({
          cookie:
            "team-calendar-dev-auth.session_token=a; team-calendar-dev-auth.session_token=b",
        }),
        "http://localhost:3000"
      )
    ).toThrow("Duplicate");
    expect(() =>
      forwardAuthCookies(
        new Headers({ cookie: `other=${"a".repeat(16_384)}` }),
        "http://localhost:3000"
      )
    ).toThrow("size");
  });
  it("rejects unsafe or incomplete fixed-origin configuration", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.teamcalendar.online/path");
    expect(getAuthOrigins).toThrow();
    vi.stubEnv(
      "NEXT_PUBLIC_APP_URL",
      "https://user:pass@app.teamcalendar.online"
    );
    expect(getAuthOrigins).toThrow();
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(getAuthOrigins).toThrow("candidate");
  });
  it("requires the exact Preview deployment pair", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("TC_APP_CANDIDATE_URL", "https://app-preview.vercel.app");
    vi.stubEnv("TC_API_CANDIDATE_URL", "https://api-preview.vercel.app");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app-preview.vercel.app");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api-preview.vercel.app");
    expect(getAuthOrigins().appOrigin).toBe("https://app-preview.vercel.app");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://different.vercel.app");
    expect(getAuthOrigins).toThrow("match");
  });
});
