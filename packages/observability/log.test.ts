import { afterEach, describe, expect, it, vi } from "vitest";

const transports = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@logtail/next", () => ({ log: transports }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.resetModules();
});

describe("log", () => {
  it("scrubs production context recursively", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { log } = await import("./log");
    log.error("Fixed message", {
      accountId: "org_1",
      nested: { token: "secret" },
    });
    expect(transports.error).toHaveBeenCalledWith("Fixed message", {
      accountId: "org_1",
      nested: { token: "[SCRUBBED]" },
    });
  });

  it("does not forward a production error canary", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { log } = await import("./log");
    const error = new Error("LEAK_CANARY");
    error.stack = "LEAK_CANARY";
    log.error("Fixed message", { error });
    const payload = JSON.stringify(transports.error.mock.calls);
    expect(payload).not.toContain("LEAK_CANARY");
    expect(transports.error).toHaveBeenCalledWith("Fixed message", {
      error: { name: "Error" },
    });
  });

  it("preserves benign production context", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { log } = await import("./log");
    log.info("Fixed message", { operation: "sync", retries: 2 });
    expect(transports.info).toHaveBeenCalledWith("Fixed message", {
      operation: "sync",
      retries: 2,
    });
  });

  it("passes the original development context and error through", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { log } = await import("./log");
    const error = new Error("development detail");
    const context = { error };
    log.error("Message", context);
    expect(consoleError).toHaveBeenCalledWith("Message", context);
    expect(consoleError.mock.calls[0]?.[1]).toBe(context);
    expect(error.stack).toBeTruthy();
  });

  it("uses one argument for development message-only calls", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const { log } = await import("./log");
    log.warn("Message");
    expect(consoleWarn).toHaveBeenCalledWith("Message");
    expect(consoleWarn.mock.calls[0]).toHaveLength(1);
  });
});
