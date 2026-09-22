import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { config, securityHeaders } from "./index";

const supportedApps = ["app", "api", "web"] as const;

const getHeaderOccurrences = (
  headers: ReadonlyArray<{ key: string; value: string }>,
  key: string
) => headers.filter((header) => header.key === key);

describe("shared security headers", () => {
  it("defines one exact HSTS header without broader domain promises", () => {
    const hstsHeaders = getHeaderOccurrences(
      securityHeaders,
      "Strict-Transport-Security"
    );

    expect(hstsHeaders).toEqual([
      { key: "Strict-Transport-Security", value: "max-age=31536000" },
    ]);
    expect(hstsHeaders[0]?.value).not.toContain("includeSubDomains");
    expect(hstsHeaders[0]?.value).not.toContain("preload");
  });

  it("publishes shared headers and config for every supported app", async () => {
    const sharedHeaders = await config.headers?.();
    const headers = sharedHeaders?.[0]?.headers ?? [];

    expect(config.experimental?.turbopackPluginRuntimeStrategy).toBe(
      "workerThreads"
    );
    expect(getHeaderOccurrences(headers, "Strict-Transport-Security")).toEqual([
      { key: "Strict-Transport-Security", value: "max-age=31536000" },
    ]);

    for (const appName of supportedApps) {
      const appConfigSource = readFileSync(
        path.join(import.meta.dirname, "../../apps", appName, "next.config.ts"),
        "utf8"
      );

      expect(appConfigSource).toContain('from "@repo/next-config"');
      expect(appConfigSource).toContain("withLogging(");
    }
  });
});
