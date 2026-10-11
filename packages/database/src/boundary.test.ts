import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const packageJsonPath = resolve(import.meta.dirname, "../package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const repoRoot = resolve(import.meta.dirname, "../../..");
const SRC_PATH_REGEX = /^\.\/src(\/.*)?$/;
const LEGACY_CLIENT_IMPORT_REGEX = /from ["'](?:\.\.?\/)+client["']/;
const TS_FILE_REGEX = /\.(ts|tsx)$/;
const FORBIDDEN_IMPORT_PATTERN = new RegExp(
  ["@repo", "database", "src", ""].join("/")
);

describe("Database package exports boundary", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
  });

  it("defines explicit exports map with no wildcard src exposure", () => {
    expect(packageJson.exports).toBeDefined();
    expect(typeof packageJson.exports).toBe("object");

    const exportKeys = Object.keys(packageJson.exports);

    // Root and keys must be present
    expect(packageJson.exports["."]).toEqual({
      default: "./index.ts",
      types: "./index.ts",
    });
    expect(packageJson.exports["./keys"]).toEqual({
      default: "./keys.ts",
      types: "./keys.ts",
    });

    // Generated subpaths must be present
    expect(packageJson.exports["./generated/client"]).toEqual({
      default: "./generated/client.ts",
      types: "./generated/client.ts",
    });
    expect(packageJson.exports["./generated/enums"]).toEqual({
      default: "./generated/enums.ts",
      types: "./generated/enums.ts",
    });

    // Test fixture subpath must be present
    expect(packageJson.exports["./test-fixtures/slice-14-fixture"]).toEqual({
      default: "./test-fixtures/slice-14-fixture.ts",
      types: "./test-fixtures/slice-14-fixture.ts",
    });

    // Must NOT contain wildcard or bare src paths
    for (const key of exportKeys) {
      expect(key).not.toMatch(SRC_PATH_REGEX);
      expect(key).not.toContain("*");
    }
  });

  it("every declared export targets an existing file", () => {
    const packageDir = resolve(import.meta.dirname, "..");
    for (const [subpath, target] of Object.entries(
      packageJson.exports as Record<string, { default: string; types: string }>
    )) {
      const typesFile = resolve(packageDir, target.types);
      const defaultFile = resolve(packageDir, target.default);

      expect(
        existsSync(typesFile),
        `Types file for export "${subpath}" (${typesFile}) does not exist`
      ).toBe(true);
      expect(
        existsSync(defaultFile),
        `Default file for export "${subpath}" (${defaultFile}) does not exist`
      ).toBe(true);
    }
  });

  it("all declared subpaths resolve valid modules", async () => {
    const rootMod = await import("@repo/database");
    expect(rootMod).toBeDefined();
    expect("database" in rootMod).toBe(false);
    expect(rootMod.tenantDatabase).toBeTypeOf("function");
    expect(rootMod.tenantTransaction).toBeTypeOf("function");

    const keysMod = await import("@repo/database/keys");
    expect(keysMod).toBeDefined();

    const enumsMod = await import("@repo/database/generated/enums");
    expect(enumsMod).toBeDefined();

    const orgQueries = await import("@repo/database/queries/organisations");
    expect(typeof orgQueries.getOrganisationById).toBe("function");
    expect(typeof orgQueries.listOrganisationsByClerkOrg).toBe("function");

    const peopleQueries = await import("@repo/database/queries/people");
    expect(typeof peopleQueries.listPeopleForOrganisation).toBe("function");

    const availQueries = await import(
      "@repo/database/queries/availability-records"
    );
    expect(typeof availQueries.getAvailabilityRecordById).toBe("function");

    const fixture = await import(
      "@repo/database/test-fixtures/slice-14-fixture"
    );
    expect(typeof fixture.createSlice14Fixture).toBe("function");
  });

  it("no TypeScript source file across apps and packages imports private database src paths", () => {
    const violations: string[] = [];

    function scanDir(dir: string) {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (
          entry === "node_modules" ||
          entry === ".next" ||
          entry === ".turbo" ||
          entry === "dist" ||
          entry === ".git" ||
          entry === ".cache"
        ) {
          continue;
        }
        const fullPath = resolve(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else if (
          TS_FILE_REGEX.test(entry) &&
          fullPath !== import.meta.filename
        ) {
          const content = readFileSync(fullPath, "utf-8");
          if (FORBIDDEN_IMPORT_PATTERN.test(content)) {
            violations.push(fullPath.replace(`${repoRoot}/`, ""));
          }
        }
      }
    }

    scanDir(resolve(repoRoot, "apps"));
    scanDir(resolve(repoRoot, "packages"));

    expect(violations).toEqual([]);
  });
});

const SYSTEM_IMPORT_ALLOWLIST = new Set([
  "packages/database/index.ts",
  "packages/database/src/system-client.ts",
  "packages/database/src/xero-locks.ts",
  "packages/database/src/queries/xero-authorisation.ts",
  "packages/database/src/queries/xero-connections.ts",
  "packages/database/src/queries/xero-connection-state.ts",
  "packages/database/src/queries/schedulable-xero-connections.ts",
  "packages/database/src/queries/billing.ts",
  "packages/xero/src/oauth/service.ts",
  "packages/xero/src/oauth/authorisation.ts",
  "packages/xero/src/oauth/reencrypt-tokens.ts",
  "packages/feeds/src/render/render-feed.ts",
  "packages/jobs/src/handlers/schedule-xero-syncs.ts",
  "packages/jobs/src/handlers/recover-xero-import-dispatch.ts",
  "packages/jobs/src/handlers/recount-usage.ts",
  "packages/jobs/src/handlers/send-notification-emails.ts",
  "apps/api/app/ical/[token]/route.ts",
  "apps/api/app/webhooks/clerk/route.ts",
  "apps/api/app/webhooks/stripe/route.ts",
]);

it("only explicitly allowlisted production modules access the owner client", () => {
  const violations: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (
        ["node_modules", ".next", ".turbo", "generated", "dist"].includes(
          entry.name
        )
      ) {
        continue;
      }
      const fullPath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (!TS_FILE_REGEX.test(entry.name) || entry.name.includes(".test.")) {
        continue;
      }
      const path = fullPath.slice(repoRoot.length + 1);
      if (
        path.includes("test-fixture") ||
        path.includes("/seed/") ||
        entry.name === "seed.ts"
      ) {
        continue;
      }
      const source = readFileSync(fullPath, "utf8");
      if (
        source.includes("systemDatabase") &&
        !SYSTEM_IMPORT_ALLOWLIST.has(path)
      ) {
        violations.push(path);
      }
      if (
        LEGACY_CLIENT_IMPORT_REGEX.test(source) &&
        path.startsWith("packages/database/")
      ) {
        violations.push(`${path}: legacy owner import`);
      }
    }
  };
  visit(resolve(repoRoot, "apps"));
  visit(resolve(repoRoot, "packages"));
  expect(violations).toEqual([]);
});
