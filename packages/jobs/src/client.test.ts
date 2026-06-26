import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };
const SIGNING_KEY_ERROR = /INNGEST_SIGNING_KEY/;
const EVENT_KEY_ERROR = /INNGEST_EVENT_KEY/;

beforeEach(() => {
  vi.resetModules();
  delete process.env.INNGEST_EVENT_KEY;
  delete process.env.INNGEST_SIGNING_KEY;
  delete process.env.INNGEST_DEV;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("inngest client configuration", () => {
  it("loads when neither Inngest key is set (local development)", async () => {
    process.env.INNGEST_DEV = "1";

    const mod = await import("./client");

    expect(mod.inngest).toBeDefined();
  });

  it("accepts an explicit Inngest dev server URL", async () => {
    process.env.INNGEST_DEV = "http://localhost:8288";

    const mod = await import("./client");

    expect(mod.inngest).toBeDefined();
  });

  it("fails fast when the event key is set without the signing key", async () => {
    process.env.INNGEST_EVENT_KEY = "event-key";

    await expect(import("./client")).rejects.toThrow(SIGNING_KEY_ERROR);
  });

  it("fails fast when the signing key is set without the event key", async () => {
    process.env.INNGEST_SIGNING_KEY = "signkey-prod-example";

    await expect(import("./client")).rejects.toThrow(EVENT_KEY_ERROR);
  });
});
