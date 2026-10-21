import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { TENANT_FAN_OUT_ENTRY_POINTS } from "./tenant-fan-out";

vi.mock("server-only", () => ({}));

const packageJsonPath = resolve(import.meta.dirname, "../package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const repoRoot = resolve(import.meta.dirname, "../../..");
const SRC_PATH_REGEX = /^\.\/src(\/.*)?$/;
const LEGACY_CLIENT_IMPORT_REGEX = /from ["'](?:\.\.?\/)+client["']/;
const TS_FILE_REGEX = /\.(ts|tsx)$/;
const TENANT_READS_CALL = /\bwithTenantReads\s*(?:<[^;]*?>\s*)?\(/;
const EXPANSION_BRIDGE_PATTERN =
  /\b(?:db|client|tx)\?\s*:\s*TenantDb\b|\binTenant\b/;
const PER_QUERY_PATTERN =
  /\b(?:tenantDatabase|tenantTransaction|TenantDatabase)\b/;
const PRIVATE_REFERENCE_PATTERN = /\breferenceDatabase\b/;
const TENANT_ROOT_PATTERN = /\bwithTenant(?:Db|Result)\s*(?:<[^;]*?>\s*)?\(/;
const TENANT_ENTRY_POINT_PATTERN =
  /^(?:apps\/[^/]+\/app\/(?:.*\/)?(?:_actions\.ts|actions\.ts|route\.ts|page\.tsx|layout\.tsx|[^/]*-data\.ts|form-data\.ts|dashboard-body\.tsx)|apps\/[^/]+\/app\/actions\/|apps\/[^/]+\/lib\/server\/|apps\/api\/lib\/|packages\/jobs\/src\/handlers\/)/;
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
    expect("tenantDatabase" in rootMod).toBe(false);
    expect("tenantTransaction" in rootMod).toBe(false);
    expect("inTenant" in rootMod).toBe(false);
    expect(rootMod.withTenantDb).toBeTypeOf("function");
    expect(rootMod.withTenantResult).toBeTypeOf("function");

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

const productionSources = (): { path: string; source: string }[] => {
  const files: { path: string; source: string }[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (
        [
          "node_modules",
          ".next",
          ".turbo",
          "generated",
          "dist",
          ".cache",
        ].includes(entry.name)
      ) {
        continue;
      }
      const fullPath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (
        TS_FILE_REGEX.test(entry.name) &&
        !entry.name.includes(".test.")
      ) {
        const path = fullPath.slice(repoRoot.length + 1);
        if (!path.includes("test-fixture")) {
          files.push({ path, source: readFileSync(fullPath, "utf8") });
        }
      }
    }
  };
  visit(resolve(repoRoot, "apps"));
  visit(resolve(repoRoot, "packages"));
  return files;
};

it("tenant services require an explicitly owned client without an expansion bridge", () => {
  const violations = productionSources()
    .filter(({ source }) => EXPANSION_BRIDGE_PATTERN.test(source))
    .map(({ path }) => path);
  expect(violations).toEqual([]);
});

it("the per-query client is private and its former helpers are absent", () => {
  const violations = productionSources()
    .filter(
      ({ path, source }) =>
        PER_QUERY_PATTERN.test(source) ||
        (!path.startsWith("packages/database/src/") &&
          PRIVATE_REFERENCE_PATTERN.test(source))
    )
    .map(({ path }) => path);
  expect(violations).toEqual([]);
});

it("tenant transaction roots stay at entry points and registered phases", async () => {
  const { PHASED_TENANT_EXPORTS } = await import("./tenant-phased-modules");
  const phased = new Set<string>(PHASED_TENANT_EXPORTS.map(({ path }) => path));
  const violations = productionSources()
    .filter(
      ({ path, source }) =>
        TENANT_ROOT_PATTERN.test(source) &&
        path !== "packages/database/src/tenant-db.ts" &&
        !TENANT_ENTRY_POINT_PATTERN.test(path) &&
        !phased.has(path)
    )
    .map(({ path }) => path);
  expect(violations).toEqual([]);
});

const SYSTEM_IMPORT_ALLOWLIST = new Set([
  "packages/database/index.ts",
  "packages/database/src/system-client.ts",
  "packages/database/src/xero-locks.ts",
  "packages/database/src/queries/xero-authorisation.ts",
  "packages/database/src/queries/xero-connections.ts",
  "packages/database/src/queries/xero-ownership.ts",
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

it("registered phased exports resolve to guarded functions without TenantDb parameters", async () => {
  const { PHASED_TENANT_EXPORTS } = await import("./tenant-phased-modules");
  const { phaseExportViolation } = await import("./test-fixtures/phase-source");
  const violations: string[] = [];
  for (const entry of PHASED_TENANT_EXPORTS) {
    const path = resolve(repoRoot, entry.path);
    if (!existsSync(path)) {
      violations.push(`${entry.path}: missing module`);
      continue;
    }
    const source = readFileSync(path, "utf8");
    for (const name of entry.exports) {
      const violation = phaseExportViolation(source, name);
      if (violation) {
        violations.push(`${entry.path}:${name}: ${violation}`);
      }
    }
  }
  expect(violations).toEqual([]);
});

it("tenant read fan-out is restricted to measured entry-point loaders", () => {
  const approved = new Set(TENANT_FAN_OUT_ENTRY_POINTS);
  const violations: string[] = [];
  for (const path of approved) {
    expect(existsSync(resolve(repoRoot, path)), path).toBe(true);
    expect(
      path.startsWith("apps/") ||
        path.startsWith("packages/jobs/src/handlers/"),
      path
    ).toBe(true);
  }
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
      } else if (
        TS_FILE_REGEX.test(entry.name) &&
        !entry.name.includes(".test.")
      ) {
        const path = fullPath.slice(repoRoot.length + 1);
        if (path.includes("test-fixture")) {
          continue;
        }
        if (
          TENANT_READS_CALL.test(readFileSync(fullPath, "utf8")) &&
          !approved.has(path)
        ) {
          violations.push(path);
        }
      }
    }
  };
  visit(resolve(repoRoot, "apps"));
  visit(resolve(repoRoot, "packages"));
  expect(violations).toEqual([]);
});
