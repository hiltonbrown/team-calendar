import { afterEach, describe, expect, test, vi } from "vitest";
import {
  getBrowserApiUrl,
  getPublicApiOrigin,
  getPublicApiUrl,
} from "./public-api-url";

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
  test("uses same-origin browser routes for unrelated Preview hosts", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app-candidate.vercel.app");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api-candidate.vercel.app");
    expect(getBrowserApiUrl("/api/notifications/stream")).toBe(
      "/api/notifications/stream"
    );
    expect(getPublicApiUrl("/api/sync/dispatch")).toBe(
      "https://api-candidate.vercel.app/api/sync/dispatch"
    );
  });
  test("keeps the approved sibling-subdomain production API URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.teamcalendar.online");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.teamcalendar.online");
    expect(getBrowserApiUrl("/api/notifications/stream")).toBe(
      "https://api.teamcalendar.online/api/notifications/stream"
    );
  });
});
