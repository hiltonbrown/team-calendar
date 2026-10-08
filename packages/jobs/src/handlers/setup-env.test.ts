import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    existsSync: () => true,
    readFileSync: () =>
      'DATABASE_URL="postgresql://fixture@configured.example/database"\nTC_SETUP_FIXTURE="file-value"',
  },
}));
const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});
describe("integration environment defaults", () => {
  it("preserves the explicitly supplied isolated database and fixture values", async () => {
    vi.resetModules();
    process.env.DATABASE_URL = "postgresql://fixture@127.0.0.1:55432/isolated";
    process.env.TC_SETUP_FIXTURE = "runner-value";
    await import("./setup-env");
    expect(process.env.DATABASE_URL).toBe(
      "postgresql://fixture@127.0.0.1:55432/isolated"
    );
    expect(process.env.TC_SETUP_FIXTURE).toBe("runner-value");
  });
  it("loads file defaults only when the runner supplied no value", async () => {
    vi.resetModules();
    delete process.env.DATABASE_URL;
    delete process.env.TC_SETUP_FIXTURE;
    await import("./setup-env");
    expect(process.env.DATABASE_URL).toBe(
      "postgresql://fixture@configured.example/database"
    );
    expect(process.env.TC_SETUP_FIXTURE).toBe("file-value");
  });
});
