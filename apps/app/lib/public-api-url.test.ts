import { afterEach, describe, expect, test, vi } from "vitest";
import { getPublicApiOrigin, getPublicApiUrl } from "./public-api-url";

describe("public API URL helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("uses the configured public API origin without trailing slashes", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.teamcalendar.test/");

    expect(getPublicApiOrigin()).toBe("https://api.teamcalendar.test");
    expect(getPublicApiUrl("/api/notifications/stream")).toBe(
      "https://api.teamcalendar.test/api/notifications/stream"
    );
  });

  test("uses the local API app during development when no origin is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NODE_ENV", "development");

    expect(getPublicApiOrigin()).toBe("http://localhost:3002");
  });

  test("returns null outside development when no origin is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NODE_ENV", "production");

    expect(getPublicApiOrigin()).toBeNull();
    expect(getPublicApiUrl("/api/notifications/stream")).toBeNull();
  });
});
