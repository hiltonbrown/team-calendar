import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configs: [] as Record<string, unknown>[],
  init: vi.fn((config: Record<string, unknown>) => {
    mocks.configs.push(config);
  }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureRouterTransitionStart: vi.fn(),
  init: mocks.init,
  replayIntegration: vi.fn(() => ({ name: "replay" })),
}));
vi.mock("./keys", () => ({
  keys: () => ({ NEXT_PUBLIC_SENTRY_DSN: "https://example.invalid/1" }),
}));

const { initializeSentry: initializeClient } = await import("./client");
const { initializeSentry: initializeEdge } = await import("./edge");
const { initializeSentry: initializeServer } = await import("./server");

describe("Sentry privacy initialisation", () => {
  beforeEach(() => {
    mocks.configs.length = 0;
    mocks.init.mockClear();
  });

  it("installs scrubbers in every runtime", () => {
    initializeClient();
    initializeEdge();
    initializeServer();

    expect(mocks.configs).toHaveLength(3);
    for (const config of mocks.configs) {
      expect(config.beforeSend).toBeTypeOf("function");
      expect(config.beforeBreadcrumb).toBeTypeOf("function");
      expect(config.beforeSendLog).toBeTypeOf("function");
    }
  });

  it("disables server frame locals and console capture", () => {
    initializeServer();

    expect(mocks.configs[0]).toMatchObject({
      includeLocalVariables: false,
      integrations: [],
    });
  });
});
