// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const configuredKeys = {
  NEXT_PUBLIC_POSTHOG_HOST: "https://analytics.example.com",
  NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
};

const client = {
  capture: vi.fn(),
  group: vi.fn(),
  identify: vi.fn(),
  init: vi.fn(),
};

let idleCallback: (() => void) | undefined;
const originalPushState = window.history.pushState;
const originalReplaceState = window.history.replaceState;

const loadInstrumentation = async (
  configuration: Partial<typeof configuredKeys>,
  importer: () => unknown = () => ({ default: client })
) => {
  const importFactory = vi.fn(importer);
  vi.doMock("./keys", () => ({ keys: () => configuration }));
  vi.doMock(import("posthog-js"), () => importFactory() as never);
  const instrumentation = await import("./instrumentation-client");
  return { importFactory, instrumentation };
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  idleCallback = undefined;
  Object.defineProperty(document, "readyState", {
    configurable: true,
    value: "complete",
  });
  Object.defineProperty(document, "referrer", {
    configurable: true,
    value: "https://search.example/",
  });
  window.history.replaceState({}, "", "/start");
  window.requestIdleCallback = vi.fn((callback) => {
    idleCallback = () =>
      callback({ didTimeout: false, timeRemaining: () => 50 });
    return 1;
  });
});

afterEach(() => {
  window.__teamCalendarAnalyticsCleanup?.();
  window.history.pushState = originalPushState;
  window.history.replaceState = originalReplaceState;
  vi.doUnmock("./keys");
  vi.doUnmock("posthog-js");
});

describe("client analytics initialisation", () => {
  it("does not import PostHog without complete public configuration", async () => {
    const { importFactory, instrumentation } = await loadInstrumentation({});
    await instrumentation.initializeAnalytics();
    expect(importFactory).not.toHaveBeenCalled();
    expect(idleCallback).toBeUndefined();
    for (let index = 0; index < 150; index += 1) {
      instrumentation.identifyAnalytics(`ignored-${index}`);
      instrumentation.groupAnalytics("organisation", `ignored-${index}`);
    }
    expect(client.identify).not.toHaveBeenCalled();
    expect(client.group).not.toHaveBeenCalled();
  });

  it("uses one initialisation promise and disables automatic page views", async () => {
    const { importFactory, instrumentation } =
      await loadInstrumentation(configuredKeys);
    const first = instrumentation.initializeAnalytics();
    const second = instrumentation.initializeAnalytics();
    expect(first).toBe(second);
    idleCallback?.();
    await first;
    expect(importFactory).toHaveBeenCalledTimes(1);
    expect(client.init).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({
        api_host: "https://analytics.example.com",
        autocapture: false,
        capture_pageview: false,
      })
    );
  });

  it("preserves the first page attribution and a navigation before load", async () => {
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: "https://search.example/results?auth=secret",
    });
    window.history.replaceState({}, "", "/start?invitation=secret#token");
    const { instrumentation } = await loadInstrumentation(configuredKeys);
    const initialized = instrumentation.initializeAnalytics();
    window.history.pushState({}, "", "/next");
    idleCallback?.();
    await initialized;
    expect(client.capture.mock.calls).toEqual([
      [
        "$pageview",
        {
          $current_url: "http://localhost:3000/start",
          $referrer: "https://search.example/results",
        },
      ],
      [
        "$pageview",
        {
          $current_url: "http://localhost:3000/next",
          $referrer: "http://localhost:3000/start",
        },
      ],
    ]);
  });

  it("tracks navigation after ready and popstate without query parameters", async () => {
    const { instrumentation } = await loadInstrumentation(configuredKeys);
    const initialized = instrumentation.initializeAnalytics();
    idleCallback?.();
    await initialized;

    window.history.pushState({}, "", "/ready?feed=secret");
    originalReplaceState.call(window.history, {}, "", "/back?leave=private");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(client.capture.mock.calls.slice(-2)).toEqual([
      [
        "$pageview",
        {
          $current_url: "http://localhost:3000/ready",
          $referrer: "http://localhost:3000/start",
        },
      ],
      [
        "$pageview",
        {
          $current_url: "http://localhost:3000/back",
          $referrer: "http://localhost:3000/ready",
        },
      ],
    ]);
  });

  it("associates queued identity and group details after load", async () => {
    const { instrumentation } = await loadInstrumentation(configuredKeys);
    const initialized = instrumentation.initializeAnalytics();
    instrumentation.identifyAnalytics("user_1", { role: "owner" });
    instrumentation.groupAnalytics("organisation", "org_1", {
      plan: "early_access",
    });
    idleCallback?.();
    await initialized;
    expect(client.identify).toHaveBeenCalledWith("user_1", { role: "owner" });
    expect(client.group).toHaveBeenCalledWith("organisation", "org_1", {
      plan: "early_access",
    });
  });

  it("contains a rejected PostHog import instead of rejecting initialisation", async () => {
    const { instrumentation } = await loadInstrumentation(
      configuredKeys,
      () => {
        throw new Error("load failed");
      }
    );
    const initialized = instrumentation.initializeAnalytics();
    idleCallback?.();
    await expect(initialized).resolves.toBeUndefined();
    for (let index = 0; index < 150; index += 1) {
      instrumentation.identifyAnalytics(`ignored-after-failure-${index}`);
      instrumentation.groupAnalytics(
        "organisation",
        `ignored-after-failure-${index}`
      );
    }
    expect(client.identify).not.toHaveBeenCalled();
    expect(client.group).not.toHaveBeenCalled();
  });
});
