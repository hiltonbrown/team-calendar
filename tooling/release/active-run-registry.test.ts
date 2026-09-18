import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acquireActiveRun,
  assertActiveRunOwner,
  releaseActiveRun,
} from "./active-run-registry.js";
import type { ReleaseManifest } from "./database-guard.js";

const manifest = {
  runId: "00000000-0000-4000-8000-000000000001",
} as ReleaseManifest;
const input = { token: "private-token", url: "https://kv.example.test" };

describe("active run registry", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("acquires the single non-expiring run slot", async () => {
    let requestedUrl = "";
    const fetchMock = vi.fn((request: RequestInfo | URL) => {
      requestedUrl = String(request);
      return Promise.resolve(Response.json({ result: "OK" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(acquireActiveRun(manifest, input)).resolves.toBe("acquired");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(requestedUrl).toContain("/set/");
    expect(requestedUrl).toContain("/nx");
  });

  it("detects an interrupted run with the same durable run ID", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ result: null }))
      .mockResolvedValueOnce(Response.json({ result: manifest.runId }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(acquireActiveRun(manifest, input)).resolves.toBe(
      "interrupted"
    );
  });

  it("refuses a concurrent run and compare-deletes only its own lock", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ result: null }))
      .mockResolvedValueOnce(Response.json({ result: "another-run" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(acquireActiveRun(manifest, input)).rejects.toThrow(
      "Another protected release run"
    );

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(Response.json({ result: 1 }));
    await expect(releaseActiveRun(manifest, input)).resolves.toBeUndefined();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/eval/");
  });

  it("fences cleanup when the manifest does not own the active slot", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ result: "another-run" })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(assertActiveRunOwner(manifest, input)).rejects.toThrow(
      "does not own"
    );
  });
});
