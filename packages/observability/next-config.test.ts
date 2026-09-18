import { beforeEach, describe, expect, it, vi } from "vitest";

const withSentryConfig = vi.fn((config: object) => config);
const withLogtail = vi.fn((config: object) => config);

vi.mock("@sentry/nextjs/config", () => ({ withSentryConfig }));
vi.mock("@logtail/next", () => ({ withLogtail }));

const { sentryConfig, withLogging, withSentry } = await import("./next-config");

describe("observability Next.js configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the supported Sentry config export and preserves upload options", () => {
    const sourceConfig = { reactStrictMode: true };

    expect(withSentry(sourceConfig)).toEqual({
      reactStrictMode: true,
      transpilePackages: ["@sentry/nextjs"],
    });
    expect(withSentryConfig).toHaveBeenCalledWith(
      {
        reactStrictMode: true,
        transpilePackages: ["@sentry/nextjs"],
      },
      sentryConfig
    );
    expect(sentryConfig).toMatchObject({
      tunnelRoute: "/monitoring",
      webpack: {
        automaticVercelMonitors: true,
        treeshake: { removeDebugLogging: true },
      },
      widenClientFileUpload: true,
    });
  });

  it("retains the Better Stack wrapper", () => {
    const sourceConfig = { poweredByHeader: false };

    expect(withLogging(sourceConfig)).toEqual(sourceConfig);
    expect(withLogtail).toHaveBeenCalledWith(sourceConfig);
  });
});
