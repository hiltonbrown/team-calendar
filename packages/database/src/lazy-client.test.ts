import { describe, expect, it, vi } from "vitest";
import { createLazyClient } from "./lazy-client";

describe("lazy database client", () => {
  it("constructs one client across repeated production property access", () => {
    const create = vi.fn(() => ({ model: { findMany: vi.fn() } }));
    const client = createLazyClient({ create, guard: vi.fn() });
    expect(client.model).toBe(client.model);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("runs the guard before returning a previously cached client", () => {
    const guard = vi.fn(() => {
      throw new Error("source gate denied");
    });
    const client = createLazyClient({
      create: vi.fn(),
      guard,
      initial: { model: {} },
    });
    expect(() => client.model).toThrow("source gate denied");
    expect(guard).toHaveBeenCalledOnce();
  });
});
